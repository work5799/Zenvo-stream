/**
 * IPTV Streaming Server - Supabase Edition
 * Node.js + Express backend with Supabase (PostgreSQL + Storage)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const https = require('https');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const { runMigration } = require('./migrate');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'iptv-2026-super-secret-change-in-production';

// ----------------------------- Supabase ----------------------------- //
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  // Don't exit — let the request handler return a proper error instead
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Auto-run migration on startup (creates tables + seeds defaults if missing)
runMigration(supabase).catch(err => console.error('Migration failed:', err.message));

// Middleware to catch missing Supabase config early
app.use((req, res, next) => {
  if (!supabase && req.path.startsWith('/api/')) {
    return res.status(500).json({
      error: 'Server misconfigured: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are not set in Vercel.'
    });
  }
  next();
});

// ----------------------------- Middleware ----------------------------- //
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ----------------------------- File Uploads (multer memory storage for Vercel) ----------------------------- //
const ALLOWED_IMG = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMG.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const uploadM3U = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.m3u', '.m3u8', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.includes('mpegurl') || file.mimetype === 'text/plain' || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Only M3U / M3U8 / text files are allowed'));
    }
  },
});

// ----------------------------- Data Layer (Supabase) ----------------------------- //
async function readChannels() {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .order('added_at', { ascending: true });
  if (error) throw error;
  // Map DB columns to camelCase for frontend compatibility
  return (data || []).map(c => ({
    id: c.id,
    name: c.name,
    url: c.url || '',
    category: c.category || 'Other',
    country: c.country || '🌐',
    logo: c.logo || '',
    active: c.active,
    status: c.status || 'unknown',
    lastChecked: c.last_checked,
    addedAt: c.added_at,
  }));
}

async function readSettings() {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return {
    siteName: data.site_name,
    siteLogo: data.site_logo || '',
    heroTitle: data.hero_title,
    heroSubtitle: data.hero_subtitle,
    maintenanceMode: data.maintenance_mode,
    featuredId: data.featured_id || '',
    adminUsername: data.admin_username,
    adminPasswordHash: data.admin_password_hash,
    categories: data.categories || [],
    countries: data.countries || [],
  };
}

async function writeSettings(settings) {
  const { error } = await supabase
    .from('settings')
    .update({
      site_name: settings.siteName,
      site_logo: settings.siteLogo || '',
      hero_title: settings.heroTitle,
      hero_subtitle: settings.heroSubtitle,
      maintenance_mode: settings.maintenanceMode,
      featured_id: settings.featuredId || '',
      admin_username: settings.adminUsername,
      admin_password_hash: settings.adminPasswordHash,
      categories: settings.categories,
      countries: settings.countries,
    })
    .eq('id', 1);
  if (error) throw error;
}

// ----------------------------- Auth ----------------------------- //
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ----------------------------- Validation ----------------------------- //
function validateChannelInput(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push('name is required');
  }
  if (body.url && typeof body.url !== 'string') errors.push('url must be a string');
  if (body.category && typeof body.category !== 'string') errors.push('category must be a string');
  return errors;
}

// ----------------------------- Public Routes ----------------------------- //
app.get('/api/channels', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('active', true)
      .order('added_at', { ascending: true });
    if (error) throw error;
    const channels = (data || []).map(c => ({
      id: c.id, name: c.name, url: c.url || '', category: c.category || 'Other',
      country: c.country || '🌐', logo: c.logo || '', active: c.active,
      status: c.status || 'unknown', lastChecked: c.last_checked, addedAt: c.added_at,
    }));
    res.json(channels);
  } catch (err) {
    console.error('GET /api/channels error:', err.message);
    res.status(500).json({ error: 'Failed to fetch channels: ' + err.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const s = await readSettings();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    let isAdmin = false;
    if (token) {
      try { jwt.verify(token, JWT_SECRET); isAdmin = true; } catch {}
    }

    const base = {
      siteName: s.siteName,
      siteLogo: s.siteLogo || '',
      heroTitle: s.heroTitle,
      heroSubtitle: s.heroSubtitle,
      maintenanceMode: s.maintenanceMode === true ? true : false,
      featuredId: s.featuredId || '',
    };

    if (isAdmin) {
      base.categories = s.categories || [];
      base.countries = s.countries || [];
    }
    res.json(base);
  } catch (err) {
    // Return safe defaults so the frontend doesn't break
    res.json({
      siteName: 'Zenvo Stream',
      siteLogo: '',
      heroTitle: 'Live TV. Reimagined.',
      heroSubtitle: 'Stream 1000+ premium channels worldwide in stunning quality.',
      maintenanceMode: false,
      featuredId: '',
    });
  }
});

// ----------------------------- Auth Route ----------------------------- //
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const settings = await readSettings();
    if (username !== settings.adminUsername) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, settings.adminPasswordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ----------------------------- Admin Channel Routes ----------------------------- //
app.get('/api/channels/all', authMiddleware, async (req, res) => {
  try {
    const channels = await readChannels();
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

app.post('/api/channels', authMiddleware, async (req, res) => {
  try {
    const errors = validateChannelInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const { data, error } = await supabase
      .from('channels')
      .insert({
        name: req.body.name.trim(),
        url: (req.body.url || '').trim(),
        category: req.body.category || 'Other',
        country: req.body.country || '🌐',
        logo: req.body.logo || '',
        active: req.body.active !== false,
        status: 'unknown',
        last_checked: null,
      })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({
      id: data.id, name: data.name, url: data.url, category: data.category,
      country: data.country, logo: data.logo, active: data.active,
      status: data.status, lastChecked: data.last_checked, addedAt: data.added_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add channel: ' + err.message });
  }
});

app.put('/api/channels/:id', authMiddleware, async (req, res) => {
  try {
    // Fetch current channel to check URL change
    const { data: existing, error: fetchErr } = await supabase
      .from('channels')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Channel not found' });

    const urlChanged = req.body.url !== undefined && req.body.url !== existing.url;
    const updateData = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.url !== undefined) updateData.url = req.body.url;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.country !== undefined) updateData.country = req.body.country;
    if (req.body.logo !== undefined) updateData.logo = req.body.logo;
    if (req.body.active !== undefined) updateData.active = req.body.active;
    if (urlChanged) {
      updateData.status = 'unknown';
      updateData.last_checked = null;
    }

    const { data, error } = await supabase
      .from('channels')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;

    res.json({
      id: data.id, name: data.name, url: data.url, category: data.category,
      country: data.country, logo: data.logo, active: data.active,
      status: data.status, lastChecked: data.last_checked, addedAt: data.added_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

app.delete('/api/channels/:id', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('channels').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

app.patch('/api/channels/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from('channels').select('active').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ error: 'Channel not found' });

    const { data, error } = await supabase
      .from('channels')
      .update({ active: !existing.active })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;

    res.json({
      id: data.id, name: data.name, url: data.url, category: data.category,
      country: data.country, logo: data.logo, active: data.active,
      status: data.status, lastChecked: data.last_checked, addedAt: data.added_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle channel' });
  }
});

app.delete('/api/channels/inactive/all', authMiddleware, async (req, res) => {
  try {
    const { data: inactive } = await supabase
      .from('channels').select('id').eq('active', false);
    const removed = (inactive || []).length;
    if (removed > 0) {
      await supabase.from('channels').delete().eq('active', false);
    }
    res.json({ removed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete inactive channels' });
  }
});

app.delete('/api/channels/offline/all', authMiddleware, async (req, res) => {
  try {
    const { data: offline } = await supabase
      .from('channels').select('id').eq('status', 'offline');
    const removed = (offline || []).length;
    if (removed > 0) {
      await supabase.from('channels').delete().eq('status', 'offline');
    }
    // Clear featured if it was removed
    const settings = await readSettings();
    if (settings.featuredId) {
      const { data: exists } = await supabase
        .from('channels').select('id').eq('id', settings.featuredId).single();
      if (!exists) {
        settings.featuredId = '';
        await writeSettings(settings);
      }
    }
    res.json({ removed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete offline channels' });
  }
});

// ----------------------------- Admin Settings ----------------------------- //
app.put('/api/settings', authMiddleware, async (req, res) => {
  try {
    const current = await readSettings();
    const updated = { ...current };

    if (typeof req.body.siteName === 'string') updated.siteName = req.body.siteName;
    if (typeof req.body.siteLogo === 'string') updated.siteLogo = req.body.siteLogo;
    if (typeof req.body.heroTitle === 'string') updated.heroTitle = req.body.heroTitle;
    if (typeof req.body.heroSubtitle === 'string') updated.heroSubtitle = req.body.heroSubtitle;
    if (typeof req.body.maintenanceMode === 'boolean') updated.maintenanceMode = req.body.maintenanceMode;
    if (typeof req.body.featuredId === 'string') updated.featuredId = req.body.featuredId;
    if (Array.isArray(req.body.categories)) updated.categories = req.body.categories;
    if (Array.isArray(req.body.countries)) updated.countries = req.body.countries;

    if (req.body.newPassword) {
      if (typeof req.body.newPassword !== 'string' || req.body.newPassword.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
      }
      updated.adminPasswordHash = await bcrypt.hash(req.body.newPassword, 10);
    }

    await writeSettings(updated);
    res.json({
      siteName: updated.siteName, siteLogo: updated.siteLogo || '',
      heroTitle: updated.heroTitle, heroSubtitle: updated.heroSubtitle,
      maintenanceMode: updated.maintenanceMode, featuredId: updated.featuredId || '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ----------------------------- File Upload (logos → Supabase Storage) ----------------------------- //
app.post('/api/upload', authMiddleware, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
      const filename = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from('uploads')
        .getPublicUrl(filename);

      res.json({ url: publicUrl.publicUrl });
    } catch (uploadErr) {
      res.status(500).json({ error: 'Upload failed: ' + uploadErr.message });
    }
  });
});

// ----------------------------- M3U Import / Export ----------------------------- //
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return fetchUrl(response.headers.location).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Request failed with status ${response.statusCode}`));
        }
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function parseM3U(content) {
  const lines = content.split(/\r?\n/);
  const channels = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF')) {
      const nameMatch = trimmed.match(/,(.+)$/);
      const logoMatch = trimmed.match(/tvg-logo="([^"]+)"/i);
      const groupMatch = trimmed.match(/group-title="([^"]+)"/i);
      current = {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown',
        logo: logoMatch ? logoMatch[1] : '',
        category: groupMatch ? groupMatch[1] : 'Imported',
      };
    } else if (trimmed && !trimmed.startsWith('#') && current) {
      current.url = trimmed;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

app.post('/api/import-m3u', authMiddleware, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'M3U URL is required' });

  try {
    const content = await fetchUrl(url);
    const parsed = parseM3U(content);

    const newChannels = parsed.map((p) => ({
      name: p.name,
      url: p.url || '',
      category: p.category || 'Imported',
      country: '🌐',
      logo: p.logo || '',
      active: true,
      status: 'unknown',
      last_checked: null,
    }));

    if (newChannels.length > 0) {
      const { error } = await supabase.from('channels').insert(newChannels);
      if (error) throw error;
    }
    res.json({ imported: newChannels.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch or parse M3U: ' + err.message });
  }
});

app.post('/api/import-m3u-file', authMiddleware, (req, res) => {
  uploadM3U.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const content = req.file.buffer.toString('utf-8');
      const parsed = parseM3U(content);

      const newChannels = parsed.map((p) => ({
        name: p.name,
        url: p.url || '',
        category: p.category || 'Imported',
        country: '🌐',
        logo: p.logo || '',
        active: true,
        status: 'unknown',
        last_checked: null,
      }));

      if (newChannels.length > 0) {
        const { error } = await supabase.from('channels').insert(newChannels);
        if (error) throw error;
      }
      res.json({ imported: newChannels.length });
    } catch (parseErr) {
      res.status(500).json({ error: 'Failed to parse M3U file: ' + parseErr.message });
    }
  });
});

app.get('/api/export-m3u', authMiddleware, async (req, res) => {
  try {
    const channels = await readChannels();
    let m3u = '#EXTM3U\n';
    for (const c of channels) {
      m3u += `#EXTINF:-1 tvg-logo="${c.logo || ''}" group-title="${c.category || ''}",${c.name}\n`;
      m3u += `${c.url || ''}\n`;
    }
    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.setHeader('Content-Disposition', 'attachment; filename="channels.m3u"');
    res.send(m3u);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export' });
  }
});

// ----------------------------- Stream Health Check ----------------------------- //
function checkStream(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return resolve(false);
    }
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      res.destroy();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function checkStreamPerformance(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return resolve({ online: false, latency: 99999 });
    }
    const start = Date.now();
    let settled = false;
    const done = (online) => {
      if (settled) return;
      settled = true;
      resolve({ online, latency: online ? Date.now() - start : 99999 });
    };
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        res.destroy(); done(true);
      } else { res.destroy(); done(false); }
    });
    req.on('timeout', () => { req.destroy(); done(false); });
    req.on('error', () => done(false));
  });
}

// Check a single channel
app.post('/api/channels/:id/check', authMiddleware, async (req, res) => {
  try {
    const { data: ch } = await supabase
      .from('channels').select('*').eq('id', req.params.id).single();
    if (!ch) return res.status(404).json({ error: 'Channel not found' });

    const online = await checkStream(ch.url);
    const now = new Date().toISOString();
    await supabase.from('channels')
      .update({ status: online ? 'online' : 'offline', last_checked: now })
      .eq('id', req.params.id);

    res.json({ id: ch.id, status: online ? 'online' : 'offline', lastChecked: now });
  } catch (err) {
    res.status(500).json({ error: 'Check failed' });
  }
});

// Check ALL channels
app.post('/api/channels/check-all', authMiddleware, async (req, res) => {
  try {
    const channels = await readChannels();
    const now = new Date().toISOString();
    const CONCURRENCY = 8;

    let cursor = 0;
    const results = [...channels];
    async function worker() {
      while (cursor < results.length) {
        const i = cursor++;
        const online = await checkStream(results[i].url);
        results[i].status = online ? 'online' : 'offline';
        results[i].lastChecked = now;
        // Update in DB
        await supabase.from('channels')
          .update({ status: results[i].status, last_checked: now })
          .eq('id', results[i].id);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, results.length) }, worker));

    const online = results.filter(c => c.status === 'online').length;
    const offline = results.filter(c => c.status === 'offline').length;
    res.json({ checked: results.length, online, offline, channels: results });
  } catch (err) {
    res.status(500).json({ error: 'Check-all failed' });
  }
});

// Duplicate analysis
app.get('/api/channels/duplicates/analyze', authMiddleware, async (req, res) => {
  try {
    const channels = await readChannels();
    const nameMap = {};
    const urlMap = {};

    channels.forEach(ch => {
      const nameKey = ch.name.toLowerCase().trim();
      const urlKey = ch.url.toLowerCase().trim();
      if (!nameMap[nameKey]) nameMap[nameKey] = [];
      nameMap[nameKey].push(ch);
      if (urlKey && !urlMap[urlKey]) urlMap[urlKey] = [];
      if (urlKey) urlMap[urlKey].push(ch);
    });

    const processedIds = new Set();
    const groups = [];
    [nameMap, urlMap].forEach(map => {
      for (const key in map) {
        if (map[key].length > 1) {
          const group = map[key].filter(ch => !processedIds.has(ch.id));
          if (group.length > 1) {
            group.forEach(ch => processedIds.add(ch.id));
            groups.push({ key, channels: group });
          }
        }
      }
    });

    const analyzedGroups = await Promise.all(groups.map(async group => {
      const results = await Promise.all(group.channels.map(async ch => {
        const perf = await checkStreamPerformance(ch.url, 12000);
        return { ...ch, ...perf };
      }));
      results.sort((a, b) => a.latency - b.latency);
      return { key: group.key, bestId: results[0].id, items: results };
    }));

    res.json(analyzedGroups);
  } catch (err) {
    res.status(500).json({ error: 'Duplicate analysis failed' });
  }
});

// ----------------------------- Routes for HTML ----------------------------- //
app.get('/', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

app.get('/admin', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'admin', 'index.html'), 'utf-8');
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Serve static assets via Express (fallback for Vercel)
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ----------------------------- Error handler ----------------------------- //
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Vercel serverless: export app instead of calling listen
// For local dev, start the server normally
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  🎯 IPTV Server running (Supabase)`);
    console.log(`  → Website: http://localhost:${PORT}`);
    console.log(`  → Admin:   http://localhost:${PORT}/admin\n`);
  });
}

module.exports = app;
