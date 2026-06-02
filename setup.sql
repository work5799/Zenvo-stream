-- ============================================================
-- Zenvo Stream — Supabase Setup SQL
-- Paste this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- 1. Drop old tables (clean start)
DROP TABLE IF EXISTS channels CASCADE;
DROP TABLE IF EXISTS settings  CASCADE;

-- 2. Channels table
CREATE TABLE channels (
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

-- 3. Settings table (always one row: id = 1)
CREATE TABLE settings (
  id                  INTEGER  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_name           TEXT     DEFAULT 'Zenvo Stream',
  site_logo           TEXT     DEFAULT '',
  hero_title          TEXT     DEFAULT 'Live TV. Reimagined.',
  hero_subtitle       TEXT     DEFAULT 'Stream 1000+ premium channels worldwide in stunning quality.',
  maintenance_mode    BOOLEAN  DEFAULT false,
  featured_id         TEXT     DEFAULT '',
  admin_username      TEXT     DEFAULT 'admin',
  admin_password_hash TEXT     NOT NULL,
  categories          JSONB    DEFAULT '[]',
  countries           JSONB    DEFAULT '[]'
);

-- 4. Disable Row Level Security
ALTER TABLE channels DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings  DISABLE ROW LEVEL SECURITY;

-- 5. Seed admin credentials  (password: iptv2026)
INSERT INTO settings (
  id, site_name, site_logo, hero_title, hero_subtitle,
  maintenance_mode, featured_id, admin_username, admin_password_hash,
  categories, countries
) VALUES (
  1,
  'Zenvo Stream',
  '',
  'Live TV. Reimagined.',
  'Stream 1000+ premium channels worldwide in stunning quality.',
  false,
  '',
  'admin',
  '$2b$10$9G8GTvQaTvSR1KTHWhuGZuIGuv54aQBClyZnvT7XNxdKH8iJFaq/y',
  '["Bangla","Sports","News","Movies","Kids","Music","Religious","Documentary","Indian","Live","Other"]',
  '[{"name":"Bangladesh","code":"🇧🇩"},{"name":"India","code":"🇮🇳"},{"name":"Pakistan","code":"🇵🇰"},{"name":"USA","code":"🇺🇸"},{"name":"UK","code":"🇬🇧"},{"name":"UAE","code":"🇦🇪"},{"name":"Global","code":"🌐"}]'
);

-- 6. Storage bucket for logo uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Verify — should show 1 row
SELECT id, admin_username, maintenance_mode, site_name FROM settings;
