/**
 * migrate.js
 * Automatically creates Supabase tables and seeds data on every server start.
 * Uses direct PostgreSQL connection (pg) — works on Vercel.
 */

const bcrypt = require('bcrypt');

const DEFAULT_CATEGORIES = [
  'Bangla','Sports','News','Movies','Kids',
  'Music','Religious','Documentary','Indian','Live','Other',
];
const DEFAULT_COUNTRIES = [
  { name:'Bangladesh', code:'🇧🇩' }, { name:'India',     code:'🇮🇳' },
  { name:'Pakistan',   code:'🇵🇰' }, { name:'USA',       code:'🇺🇸' },
  { name:'UK',         code:'🇬🇧' }, { name:'UAE',       code:'🇦🇪' },
  { name:'Global',     code:'🌐'  },
];

async function runMigration(supabase) {
  if (!supabase) { console.warn('⚠️  Supabase not configured.'); return; }

  // ── Try pg direct connection first (most reliable for DDL) ───────────
  const DATABASE_URL = process.env.DATABASE_URL;
  if (DATABASE_URL) {
    try {
      const { Client } = require('pg');
      const client = new Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      });
      await client.connect();
      console.log('🔄 Connected via pg — running DDL...');

      await client.query(`
        CREATE TABLE IF NOT EXISTS channels (
          id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          name         TEXT        NOT NULL,
          url          TEXT        DEFAULT '',
          category     TEXT        DEFAULT 'Other',
          country      TEXT        DEFAULT '🌐',
          logo         TEXT        DEFAULT '',
          active       BOOLEAN     DEFAULT true,
          status       TEXT        DEFAULT 'unknown',
          last_checked TIMESTAMPTZ,
          added_at     TIMESTAMPTZ DEFAULT now()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          site_name           TEXT    DEFAULT 'Zenvo Stream',
          site_logo           TEXT    DEFAULT '',
          hero_title          TEXT    DEFAULT 'Live TV. Reimagined.',
          hero_subtitle       TEXT    DEFAULT 'Stream 1000+ premium channels worldwide.',
          maintenance_mode    BOOLEAN DEFAULT false,
          featured_id         TEXT    DEFAULT '',
          admin_username      TEXT    DEFAULT 'admin',
          admin_password_hash TEXT    NOT NULL DEFAULT '',
          categories          JSONB   DEFAULT '[]',
          countries           JSONB   DEFAULT '[]'
        );
      `);

      await client.query(`ALTER TABLE channels DISABLE ROW LEVEL SECURITY;`);
      await client.query(`ALTER TABLE settings  DISABLE ROW LEVEL SECURITY;`);

      console.log('✅ Tables ready (via pg)');

      // Seed settings if empty
      const { rows } = await client.query(`SELECT id FROM settings WHERE id = 1`);
      if (rows.length === 0) {
        const hash = await bcrypt.hash('iptv2026', 10);
        await client.query(`
          INSERT INTO settings
            (id, site_name, site_logo, hero_title, hero_subtitle,
             maintenance_mode, featured_id, admin_username, admin_password_hash,
             categories, countries)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)
        `, [
          1,
          'Zenvo Stream', '',
          'Live TV. Reimagined.',
          'Stream 1000+ premium channels worldwide in stunning quality.',
          false, '', 'admin',
          hash,
          JSON.stringify(DEFAULT_CATEGORIES),
          JSON.stringify(DEFAULT_COUNTRIES),
        ]);
        console.log('✅ Admin seeded → admin / iptv2026');
      } else {
        // Make sure maintenance mode is off
        await client.query(`UPDATE settings SET maintenance_mode = false WHERE id = 1`);
        console.log('✅ Settings OK');
      }

      await client.end();
      console.log('✅ Migration complete.');
      return; // Done — no need to fall through

    } catch (pgErr) {
      console.warn('⚠️  pg connection failed:', pgErr.message);
      console.warn('    Falling back to Supabase REST...');
    }
  }

  // ── Fallback: Supabase REST (works for INSERT/UPDATE but not CREATE TABLE) ──
  console.log('🔄 Checking via Supabase REST...');

  const { data, error } = await supabase
    .from('settings').select('id').eq('id', 1).maybeSingle();

  const tablesMissing = error && (
    error.code === 'PGRST205' ||
    (error.message || '').includes('schema cache')
  );

  if (tablesMissing) {
    console.error('');
    console.error('══════════════════════════════════════════════════════');
    console.error('❌  DATABASE TABLES ARE MISSING');
    console.error('    Add DATABASE_URL to Vercel Environment Variables');
    console.error('    Vercel → Project → Settings → Environment Variables');
    console.error('    DATABASE_URL = ' + (process.env.DATABASE_URL || 'NOT SET'));
    console.error('══════════════════════════════════════════════════════');
    console.error('');
    return;
  }

  if (error) { console.error('❌ Settings error:', error.message); return; }

  if (!data) {
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
    await supabase.from('settings').update({ maintenance_mode:false }).eq('id',1);
    console.log('✅ Settings OK');
  }

  console.log('✅ Migration complete.');
}

module.exports = { runMigration };
