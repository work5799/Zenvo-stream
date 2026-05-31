/**
 * IPTV Streaming Server
 * Node.js + Express backend with JSON file storage
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'iptv-2026-super-secret-change-in-production';

// ----------------------------- Middleware ----------------------------- //
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ----------------------------- Data Layer ----------------------------- //
const DATA_DIR = path.join(__dirname, 'data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ----------------------------- File Uploads (multer) ----------------------------- //
const ALLOWED_IMG = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif'];
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMG.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// Separate multer for M3U file uploads (larger limit, different file types)
const m3uStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.m3u';
    cb(null, `m3u-${Date.now()}${ext}`);
  },
});
const uploadM3U = multer({
  storage: m3uStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB (M3U files can be large)
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

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(CHANNELS_FILE)) {
    const seedChannels = [
      {
        id: uuidv4(),
        name: 'BTV National',
        url: 'https://raw.githubusercontent.com/imShakil/tvlink/refs/heads/main/iptv.m3u8',
        category: 'Bangladesh',
        country: '🇧🇩',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/BTV_logo.svg/200px-BTV_logo.svg.png',
        active: true,
        addedAt: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        name: 'Maasranga TV',
        url: '',
        category: 'Bangladesh',
        country: '🇧🇩',
        logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/49/Maasranga_Television_logo.svg/200px-Maasranga_Television_logo.svg.png',
        active: true,
        addedAt: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        name: 'GTV',
        url: '',
        category: 'Bangladesh',
        country: '🇧🇩',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Gazi_TV_logo.svg/200px-Gazi_TV_logo.svg.png',
        active: true,
        addedAt: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        name: 'T Sports',
        url: '',
        category: 'Sports',
        country: '🇧🇩',
        logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/T_Sports_logo.svg/200px-T_Sports_logo.svg.png',
        active: true,
        addedAt: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        name: 'Star Sports',
        url: '',
        category: 'Sports',
        country: '🇮🇳',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Star_Sports_2017_logo.svg/200px-Star_Sports_2017_logo.svg.png',
        active: true,
        addedAt: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        name: 'Sony LIV',
        url: '',
        category: 'India',
        country: '🇮🇳',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/SonyLIV_logo.svg/200px-SonyLIV_logo.svg.png',
        active: true,
        addedAt: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        name: 'Zee Bangla',
        url: '',
        category: 'India',
        country: '🇮🇳',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Zee_Bangla.png/200px-Zee_Bangla.png',
        active: true,
        addedAt: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        name: 'Star Jalsha',
        url: '',
        category: 'India',
        country: '🇮🇳',
        logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0d/Star_Jalsha_logo.svg/200px-Star_Jalsha_logo.svg.png',
        active: true,
        addedAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(seedChannels, null, 2));
  }

  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultPassword = bcrypt.hashSync('iptv2026', 10);
    const defaultSettings = {
      siteName: 'StreamX IPTV',
      siteLogo: '',
      heroTitle: 'Live TV. Reimagined.',
      heroSubtitle: 'Stream 1000+ premium channels worldwide in stunning quality.',
      maintenanceMode: false,
      featuredId: '',
      adminUsername: 'admin',
      adminPasswordHash: defaultPassword,
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
  }
}

function readChannels() {
  // Re-create seed data if files were removed while running
  if (!fs.existsSync(CHANNELS_FILE) || !fs.existsSync(SETTINGS_FILE)) ensureDataFiles();
  const channels = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));
  // Normalize: ensure every channel has a health status
  // status: 'unknown' | 'online' | 'offline'
  return channels.map((c) => ({
    status: 'unknown',
    lastChecked: null,
    ...c,
  }));
}
function writeChannels(channels) {
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
}
function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) ensureDataFiles();
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
}
function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

ensureDataFiles();

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
app.get('/api/channels', (req, res) => {
  const channels = readChannels().filter((c) => c.active);
  res.json(channels);
});

app.get('/api/settings', (req, res) => {
  const s = readSettings();
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let isAdmin = false;
  if (token) {
    try { jwt.verify(token, JWT_SECRET); isAdmin = true; } catch {}
  }

  // Public-safe subset for non-admin, full data for admin
  const base = {
    siteName: s.siteName,
    siteLogo: s.siteLogo || '',
    heroTitle: s.heroTitle,
    heroSubtitle: s.heroSubtitle,
    maintenanceMode: s.maintenanceMode,
    featuredId: s.featuredId || '',
  };

  if (isAdmin) {
    base.categories = s.categories || [];
    base.countries = s.countries || [];
  }

  res.json(base);
});

// ----------------------------- Auth Route ----------------------------- //
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const settings = readSettings();
  if (username !== settings.adminUsername) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const ok = await bcrypt.compare(password, settings.adminPasswordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username });
});

// ----------------------------- Admin Channel Routes ----------------------------- //
app.get('/api/channels/all', authMiddleware, (req, res) => {
  res.json(readChannels());
});

app.post('/api/channels', authMiddleware, (req, res) => {
  const errors = validateChannelInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const channels = readChannels();
  const channel = {
    id: uuidv4(),
    name: req.body.name.trim(),
    url: (req.body.url || '').trim(),
    category: req.body.category || 'Other',
    country: req.body.country || '🌐',
    logo: req.body.logo || '',
    active: req.body.active !== false,
    status: 'unknown',
    lastChecked: null,
    addedAt: new Date().toISOString(),
  };
  channels.push(channel);
  writeChannels(channels);
  res.status(201).json(channel);
});

app.put('/api/channels/:id', authMiddleware, (req, res) => {
  const channels = readChannels();
  const idx = channels.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Channel not found' });

  const urlChanged = req.body.url !== undefined && req.body.url !== channels[idx].url;
  channels[idx] = {
    ...channels[idx],
    ...req.body,
    id: channels[idx].id,
    addedAt: channels[idx].addedAt,
  };
  // If the stream URL changed, its previous health result no longer applies
  if (urlChanged) {
    channels[idx].status = 'unknown';
    channels[idx].lastChecked = null;
  }
  writeChannels(channels);
  res.json(channels[idx]);
});

app.delete('/api/channels/:id', authMiddleware, (req, res) => {
  const channels = readChannels();
  const filtered = channels.filter((c) => c.id !== req.params.id);
  if (filtered.length === channels.length) return res.status(404).json({ error: 'Channel not found' });
  writeChannels(filtered);
  res.json({ success: true });
});

app.patch('/api/channels/:id/toggle', authMiddleware, (req, res) => {
  const channels = readChannels();
  const idx = channels.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Channel not found' });
  channels[idx].active = !channels[idx].active;
  writeChannels(channels);
  res.json(channels[idx]);
});

app.delete('/api/channels/inactive/all', authMiddleware, (req, res) => {
  const channels = readChannels();
  const remaining = channels.filter((c) => c.active);
  const removed = channels.length - remaining.length;
  writeChannels(remaining);
  res.json({ removed });
});

// Delete every channel whose last health check was 'offline'
app.delete('/api/channels/offline/all', authMiddleware, (req, res) => {
  const channels = readChannels();
  const remaining = channels.filter((c) => c.status !== 'offline');
  const removed = channels.length - remaining.length;
  writeChannels(remaining);

  // If the featured channel was removed, clear it
  const settings = readSettings();
  if (settings.featuredId && !remaining.some((c) => c.id === settings.featuredId)) {
    settings.featuredId = '';
    writeSettings(settings);
  }
  res.json({ removed });
});

// ----------------------------- Admin Settings ----------------------------- //
app.put('/api/settings', authMiddleware, async (req, res) => {
  const current = readSettings();
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

  writeSettings(updated);
  res.json({
    siteName: updated.siteName,
    siteLogo: updated.siteLogo || '',
    heroTitle: updated.heroTitle,
    heroSubtitle: updated.heroSubtitle,
    maintenanceMode: updated.maintenanceMode,
    featuredId: updated.featuredId || '',
  });
});

// ----------------------------- File Upload (logos) ----------------------------- //
app.post('/api/upload', authMiddleware, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/uploads/${req.file.filename}` });
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
    const channels = readChannels();
    const now = new Date().toISOString();

    const newChannels = parsed.map((p) => ({
      id: uuidv4(),
      name: p.name,
      url: p.url || '',
      category: p.category || 'Imported',
      country: '🌐',
      logo: p.logo || '',
      active: true,
      status: 'unknown',
      lastChecked: null,
      addedAt: now,
    }));

    writeChannels([...channels, ...newChannels]);
    res.json({ imported: newChannels.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch or parse M3U: ' + err.message });
  }
});

// Import M3U from uploaded file
app.post('/api/import-m3u-file', authMiddleware, (req, res) => {
  uploadM3U.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const content = fs.readFileSync(req.file.path, 'utf-8');
      const parsed = parseM3U(content);
      const channels = readChannels();
      const now = new Date().toISOString();

      const newChannels = parsed.map((p) => ({
        id: uuidv4(),
        name: p.name,
        url: p.url || '',
        category: p.category || 'Imported',
        country: '🌐',
        logo: p.logo || '',
        active: true,
        status: 'unknown',
        lastChecked: null,
        addedAt: now,
      }));

      writeChannels([...channels, ...newChannels]);

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({ imported: newChannels.length });
    } catch (parseErr) {
      // Clean up on error too
      try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ error: 'Failed to parse M3U file: ' + parseErr.message });
    }
  });
});

app.get('/api/export-m3u', authMiddleware, (req, res) => {
  const channels = readChannels();
  let m3u = '#EXTM3U\n';
  for (const c of channels) {
    m3u += `#EXTINF:-1 tvg-logo="${c.logo || ''}" group-title="${c.category || ''}",${c.name}\n`;
    m3u += `${c.url || ''}\n`;
  }
  res.setHeader('Content-Type', 'audio/x-mpegurl');
  res.setHeader('Content-Disposition', 'attachment; filename="channels.m3u"');
  res.send(m3u);
});

/**
 * Probe a single stream URL and measure performance.
 */
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
        res.destroy();
        done(true);
      } else {
        res.destroy();
        done(false);
      }
    });

    req.on('timeout', () => { req.destroy(); done(false); });
    req.on('error', () => done(false));
  });
}

// Find duplicates and analyze performance
app.get('/api/channels/duplicates/analyze', authMiddleware, async (req, res) => {
  const channels = readChannels();
  const nameMap = {};
  const urlMap = {};
  const duplicates = [];

  // Identify duplicates by name or URL
  channels.forEach(ch => {
    const nameKey = ch.name.toLowerCase().trim();
    const urlKey = ch.url.toLowerCase().trim();

    if (!nameMap[nameKey]) nameMap[nameKey] = [];
    nameMap[nameKey].push(ch);

    if (urlKey && !urlMap[urlKey]) urlMap[urlKey] = [];
    if (urlKey) urlMap[urlKey].push(ch);
  });

  // Collect unique duplicate groups
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

  // Analyze performance for each duplicate in the groups
  const analyzedGroups = await Promise.all(groups.map(async group => {
    const results = await Promise.all(group.channels.map(async ch => {
      const perf = await checkStreamPerformance(ch.url, 12000); // Increased timeout to 12s
      return { ...ch, ...perf };
    }));

    // Sort by latency (fastest first)
    results.sort((a, b) => a.latency - b.latency);
    return {
      key: group.key,
      bestId: results[0].online ? results[0].id : results[0].id, // Pick top result as best
      items: results
    };
  }));

  res.json(analyzedGroups);
});

// Check a single channel
app.post('/api/channels/:id/check', authMiddleware, async (req, res) => {
  const channels = readChannels();
  const idx = channels.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Channel not found' });

  const online = await checkStream(channels[idx].url);
  channels[idx].status = online ? 'online' : 'offline';
  channels[idx].lastChecked = new Date().toISOString();
  writeChannels(channels);
  res.json({ id: channels[idx].id, status: channels[idx].status, lastChecked: channels[idx].lastChecked });
});

// Check ALL channels (concurrency-limited)
app.post('/api/channels/check-all', authMiddleware, async (req, res) => {
  const channels = readChannels();
  const now = new Date().toISOString();
  const CONCURRENCY = 8;

  let cursor = 0;
  async function worker() {
    while (cursor < channels.length) {
      const i = cursor++;
      const online = await checkStream(channels[i].url);
      channels[i].status = online ? 'online' : 'offline';
      channels[i].lastChecked = now;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, channels.length) }, worker));
  writeChannels(channels);

  const online = channels.filter((c) => c.status === 'online').length;
  const offline = channels.filter((c) => c.status === 'offline').length;
  res.json({ checked: channels.length, online, offline, channels });
});

// ----------------------------- Routes for HTML ----------------------------- //
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// ----------------------------- Error handler ----------------------------- //
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n  🎯 IPTV Server running`);
  console.log(`  → Website: http://localhost:${PORT}`);
  console.log(`  → Admin:   http://localhost:${PORT}/admin`);
  console.log(`  → Login:   admin / iptv2026\n`);
});
