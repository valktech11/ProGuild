-- ============================================================
-- v73 SQL — run in Supabase SQL Editor BEFORE deploying v73
-- ============================================================

-- 1. Add slug column to pros table
ALTER TABLE pros ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Unique index — enforces uniqueness at DB level (faster than app-level checks)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pros_slug ON pros(slug)
  WHERE slug IS NOT NULL;

-- 3. Index for fast slug lookups (resolve /pro/[slug] → pro_id)
CREATE INDEX IF NOT EXISTS idx_pros_slug_lookup ON pros(slug)
  WHERE slug IS NOT NULL;

-- ============================================================
-- NOTE: Slugs are generated lazily on first login via auth/route.ts
-- No need to backfill existing pros — they get slugs on next login.
-- To manually backfill a single pro:
--   UPDATE pros SET slug = 'wasim-akram-painter-jacksonville' WHERE id = '[uuid]';
-- ============================================================
