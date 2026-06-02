/**
 * migrate.js
 * Runs on every server start.
 * - Checks if tables exist
 * - Seeds default settings row if missing
 * Safe to call multiple times (idempotent).
 */

const bcrypt = require('bcrypt');

const DEFAULT_CATEGORIES = [
  'Bangla', 'Sports', 'News', 'Movies', 'Kids',
  'Music', 'Religious', 'Documentary', 'Indian', 'Live', 'Other',
];

const DEFAULT_COUNTRIES = [
  { name: 'Bangladesh', code: '🇧🇩' },
  { name: 'India',      code: '🇮🇳' },
  { name: 'Pakistan',   code: '🇵🇰' },
  { name: 'USA',        code: '🇺🇸' },
  { name: 'UK',         code: '🇬🇧' },
  { name: 'UAE',        code: '🇦🇪' },
  { name: 'Global',     code: '🌐' },
];

async function runMigration(supabase) {
  if (!supabase) {
    console.warn('⚠️  Migration skipped — Supabase not configured.');
    return;
  }

  console.log('🔄 Checking Supabase tables...');

  // ── Check + seed settings ────────────────────────────────────────────
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('id')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        // Table doesn't exist at all
        console.error('');
        console.error('══════════════════════════════════════════════════');
        console.error('❌  Supabase tables are missing!');
        console.error('    Please run setup.sql in Supabase SQL Editor:');
        console.error('    Dashboard → SQL Editor → paste setup.sql → Run');
        console.error('══════════════════════════════════════════════════');
        console.error('');
      } else {
        console.error('❌ Settings check error:', error.message);
      }
      return;
    }

    if (!data) {
      // Table exists but no row — insert defaults
      const hash = await bcrypt.hash('iptv2026', 10);
      const { error: insertErr } = await supabase.from('settings').insert({
        id: 1,
        site_name: 'Zenvo Stream',
        site_logo: '',
        hero_title: 'Live TV. Reimagined.',
        hero_subtitle: 'Stream 1000+ premium channels worldwide in stunning quality.',
        maintenance_mode: false,
        featured_id: '',
        admin_username: 'admin',
        admin_password_hash: hash,
        categories: DEFAULT_CATEGORIES,
        countries: DEFAULT_COUNTRIES,
      });

      if (insertErr) {
        console.error('❌ Failed to seed settings:', insertErr.message);
      } else {
        console.log('✅ Default settings seeded  →  admin / iptv2026');
      }
    } else {
      console.log('✅ Settings OK');
    }
  } catch (err) {
    console.error('❌ Migration (settings):', err.message);
  }

  // ── Check channels table ─────────────────────────────────────────────
  try {
    const { error } = await supabase
      .from('channels')
      .select('id')
      .limit(1);

    if (error && error.code === '42P01') {
      console.error('❌ Table "channels" is missing. Run setup.sql in Supabase.');
    } else if (!error) {
      console.log('✅ Channels OK');
    }
  } catch (err) {
    console.error('❌ Migration (channels):', err.message);
  }

  console.log('✅ Migration complete.');
}

module.exports = { runMigration };
