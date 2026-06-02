/**
 * migrate.js — Auto-creates Supabase tables via HTTP API
 */
const bcrypt = require('bcrypt');
const https  = require('https');

const DEFAULT_CATEGORIES = ['Bangla','Sports','News','Movies','Kids','Music','Religious','Documentary','Indian','Live','Other'];
const DEFAULT_COUNTRIES  = [
  {name:'Bangladesh',code:'🇧🇩'},{name:'India',code:'🇮🇳'},{name:'Pakistan',code:'🇵🇰'},
  {name:'USA',code:'🇺🇸'},{name:'UK',code:'🇬🇧'},{name:'UAE',code:'🇦🇪'},{name:'Global',code:'🌐'},
];

// POST to Supabase SQL endpoint
function postSQL(projectRef, serviceKey, sql) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ query: sql });

    // Try the /sql endpoint (newer Supabase projects)
    const options = {
      hostname: `${projectRef}.supabase.co`,
      path: '/rest/v1/sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.write(body);
    req.end();
  });
}

async function runMigration(supabase) {
  if (!supabase) { console.warn('⚠️  Supabase not configured.'); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
  const projectRef   = SUPABASE_URL.replace('https://', '').split('.')[0];

  console.log('🔄 Running migration...');

  // Check if settings table exists
  const { data, error } = await supabase.from('settings').select('id').eq('id',1).maybeSingle();

  const tablesMissing = error && (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    (error.message || '').includes('schema cache') ||
    (error.message || '').includes('does not exist')
  );

  if (tablesMissing) {
    console.log('⚠️  Tables missing. Creating...');

    const createSQL = `
      CREATE TABLE IF NOT EXISTS channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL, url TEXT DEFAULT '', category TEXT DEFAULT 'Other',
        country TEXT DEFAULT '🌐', logo TEXT DEFAULT '', active BOOLEAN DEFAULT true,
        status TEXT DEFAULT 'unknown', last_checked TIMESTAMPTZ, added_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        site_name TEXT DEFAULT 'Zenvo Stream', site_logo TEXT DEFAULT '',
        hero_title TEXT DEFAULT 'Live TV. Reimagined.',
        hero_subtitle TEXT DEFAULT 'Stream 1000+ premium channels worldwide.',
        maintenance_mode BOOLEAN DEFAULT false, featured_id TEXT DEFAULT '',
        admin_username TEXT DEFAULT 'admin', admin_password_hash TEXT NOT NULL DEFAULT '',
        categories JSONB DEFAULT '[]', countries JSONB DEFAULT '[]'
      );
      ALTER TABLE channels DISABLE ROW LEVEL SECURITY;
      ALTER TABLE settings  DISABLE ROW LEVEL SECURITY;
    `;

    const result = await postSQL(projectRef, SERVICE_KEY, createSQL);
    console.log('SQL API:', result.status, result.body.slice(0, 150));

    // Re-verify
    const check = await supabase.from('settings').select('id').eq('id',1).maybeSingle();
    if (check.error) {
      console.error('❌ Auto-create failed. Tables must be created manually.');
      console.error('   Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
      console.error('   Run the SQL from setup.sql in the project root.');
      return;
    }
    console.log('✅ Tables created!');
  }

  // Seed settings if row missing
  const row = await supabase.from('settings').select('id').eq('id',1).maybeSingle();
  if (!row.data) {
    const hash = await bcrypt.hash('iptv2026', 10);
    const { error: ie } = await supabase.from('settings').insert({
      id:1, site_name:'Zenvo Stream', site_logo:'',
      hero_title:'Live TV. Reimagined.',
      hero_subtitle:'Stream 1000+ premium channels worldwide in stunning quality.',
      maintenance_mode:false, featured_id:'', admin_username:'admin',
      admin_password_hash:hash,
      categories:DEFAULT_CATEGORIES, countries:DEFAULT_COUNTRIES,
    });
    if (ie) console.error('❌ Seed error:', ie.message);
    else    console.log('✅ Admin seeded → admin / iptv2026');
  } else {
    // Make sure maintenance is off
    await supabase.from('settings').update({ maintenance_mode: false }).eq('id',1);
    console.log('✅ Settings OK');
  }

  // Check channels
  const { error: ce } = await supabase.from('channels').select('id').limit(1);
  if (ce) console.error('❌ Channels missing:', ce.message);
  else    console.log('✅ Channels OK');

  console.log('✅ Migration complete.');
}

module.exports = { runMigration };
