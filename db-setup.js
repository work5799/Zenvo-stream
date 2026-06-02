/**
 * db-setup.js — Run once to create Supabase tables
 * Usage: node db-setup.js
 */
require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const DB_URL = process.env.DATABASE_URL ||
  `postgresql://postgres.ztgqoqwihznpzvdtkqac:${encodeURIComponent(process.env.DB_PASSWORD || '')}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;

async function main() {
  console.log('🔄 Connecting to Supabase PostgreSQL...');

  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('✅ Connected!');

  // Create tables
  await client.query(`
    CREATE TABLE IF NOT EXISTS channels (
      id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      name         TEXT         NOT NULL,
      url          TEXT         DEFAULT '',
      category     TEXT         DEFAULT 'Other',
      country      TEXT         DEFAULT '🌐',
      logo         TEXT         DEFAULT '',
      active       BOOLEAN      DEFAULT true,
      status       TEXT         DEFAULT 'unknown',
      last_checked TIMESTAMPTZ,
      added_at     TIMESTAMPTZ  DEFAULT now()
    );
  `);
  console.log('✅ channels table ready');

  await client.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id                  INTEGER  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      site_name           TEXT     DEFAULT 'Zenvo Stream',
      site_logo           TEXT     DEFAULT '',
      hero_title          TEXT     DEFAULT 'Live TV. Reimagined.',
      hero_subtitle       TEXT     DEFAULT 'Stream 1000+ premium channels worldwide.',
      maintenance_mode    BOOLEAN  DEFAULT false,
      featured_id         TEXT     DEFAULT '',
      admin_username      TEXT     DEFAULT 'admin',
      admin_password_hash TEXT     NOT NULL DEFAULT '',
      categories          JSONB    DEFAULT '[]',
      countries           JSONB    DEFAULT '[]'
    );
  `);
  console.log('✅ settings table ready');

  // Disable RLS
  await client.query(`ALTER TABLE channels DISABLE ROW LEVEL SECURITY;`);
  await client.query(`ALTER TABLE settings  DISABLE ROW LEVEL SECURITY;`);
  console.log('✅ RLS disabled');

  // Seed settings if empty
  const { rows } = await client.query(`SELECT id FROM settings WHERE id = 1;`);
  if (rows.length === 0) {
    const hash = await bcrypt.hash('iptv2026', 10);
    await client.query(`
      INSERT INTO settings (
        id, site_name, site_logo, hero_title, hero_subtitle,
        maintenance_mode, featured_id, admin_username, admin_password_hash,
        categories, countries
      ) VALUES (
        1, 'Zenvo Stream', '', 'Live TV. Reimagined.',
        'Stream 1000+ premium channels worldwide in stunning quality.',
        false, '', 'admin', $1,
        $2::jsonb, $3::jsonb
      );
    `, [
      hash,
      JSON.stringify(['Bangla','Sports','News','Movies','Kids','Music','Religious','Documentary','Indian','Live','Other']),
      JSON.stringify([
        {name:'Bangladesh',code:'🇧🇩'},{name:'India',code:'🇮🇳'},
        {name:'Pakistan',code:'🇵🇰'},{name:'USA',code:'🇺🇸'},
        {name:'UK',code:'🇬🇧'},{name:'UAE',code:'🇦🇪'},{name:'Global',code:'🌐'}
      ]),
    ]);
    console.log('✅ Default settings seeded  →  admin / iptv2026');
  } else {
    console.log('✅ Settings already exist');
  }

  await client.end();
  console.log('\n🎉 Database setup complete! You can now login: admin / iptv2026\n');
}

main().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
