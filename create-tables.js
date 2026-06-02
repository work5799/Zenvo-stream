require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcrypt');

// Try multiple connection strings
const connections = [
  // Session mode (port 5432)
  `postgresql://postgres.ztgqoqwihznpzvdtkqac:BC%23Sa%23Q2WG%2Beq%25T@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  // Transaction mode (port 6543)
  `postgresql://postgres.ztgqoqwihznpzvdtkqac:BC%23Sa%23Q2WG%2Beq%25T@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  // Direct (port 5432)
  `postgresql://postgres:BC%23Sa%23Q2WG%2Beq%25T@db.ztgqoqwihznpzvdtkqac.supabase.co:5432/postgres`,
];

async function tryConnect(connStr) {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    return client;
  } catch (e) {
    console.log('  ✗ Failed:', e.message.split('\n')[0]);
    return null;
  }
}

async function main() {
  console.log('\n🔄 Trying to connect to Supabase...\n');

  let client = null;
  for (const conn of connections) {
    console.log('→ Trying:', conn.split('@')[1]);
    client = await tryConnect(conn);
    if (client) { console.log('✅ Connected!\n'); break; }
  }

  if (!client) {
    console.log('\n❌ All connections failed.');
    console.log('\n📋 MANUAL OPTION — Run this in Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/ztgqoqwihznpzvdtkqac/sql/new\n');
    printSQL();
    return;
  }

  try {
    await client.query(`
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
    `);
    console.log('✅ Tables created!');

    const { rows } = await client.query('SELECT id FROM settings WHERE id = 1');
    if (rows.length === 0) {
      const hash = await bcrypt.hash('iptv2026', 10);
      await client.query(`
        INSERT INTO settings (id,site_name,hero_title,hero_subtitle,maintenance_mode,featured_id,admin_username,admin_password_hash,categories,countries)
        VALUES (1,'Zenvo Stream','Live TV. Reimagined.','Stream 1000+ premium channels worldwide.',false,'','admin',$1,$2::jsonb,$3::jsonb)
      `, [
        hash,
        JSON.stringify(['Bangla','Sports','News','Movies','Kids','Music','Religious','Documentary','Indian','Live','Other']),
        JSON.stringify([{name:'Bangladesh',code:'🇧🇩'},{name:'India',code:'🇮🇳'},{name:'Pakistan',code:'🇵🇰'},{name:'USA',code:'🇺🇸'},{name:'UK',code:'🇬🇧'},{name:'UAE',code:'🇦🇪'},{name:'Global',code:'🌐'}]),
      ]);
      console.log('✅ Admin seeded → admin / iptv2026');
    } else {
      console.log('✅ Settings already exists');
    }

    console.log('\n🎉 Done! Login: admin / iptv2026\n');
    await client.end();
  } catch (err) {
    console.error('❌ Query failed:', err.message);
    await client.end();
    console.log('\n📋 Try manual SQL instead:');
    printSQL();
  }
}

function printSQL() {
  console.log(`
-- PASTE THIS IN SUPABASE SQL EDITOR --
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
DELETE FROM settings WHERE id = 1;
INSERT INTO settings (id,site_name,hero_title,hero_subtitle,maintenance_mode,featured_id,admin_username,admin_password_hash,categories,countries)
VALUES (1,'Zenvo Stream','Live TV. Reimagined.','Stream 1000+ premium channels worldwide.',false,'','admin',
'$2b$10$9G8GTvQaTvSR1KTHWhuGZuIGuv54aQBClyZnvT7XNxdKH8iJFaq/y',
'["Bangla","Sports","News","Movies","Kids","Music","Religious","Documentary","Indian","Live","Other"]',
'[{"name":"Bangladesh","code":"🇧🇩"},{"name":"India","code":"🇮🇳"},{"name":"Pakistan","code":"🇵🇰"},{"name":"USA","code":"🇺🇸"},{"name":"UK","code":"🇬🇧"},{"name":"UAE","code":"🇦🇪"},{"name":"Global","code":"🌐"}]');
SELECT id, admin_username, maintenance_mode FROM settings;
-- END --
`);
}

main();
