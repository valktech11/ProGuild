-- v112-photo-geostamp.sql
-- Photo Capture v1 — lead_photos table + GPS/capture-time proof metadata.
--
-- Idempotent and safe for BOTH environments:
--   • STAGING: lead_photos didn't exist — this CREATEs it (matching the columns
--     the photo API reads/writes), including the geo columns.
--   • PRODUCTION: lead_photos already exists with real photo data — the CREATE
--     is skipped (IF NOT EXISTS) and the ALTER adds the 3 new geo columns only.
--
-- Run on STAGING first, then production. Re-runnable.
--
-- Columns map exactly to app/api/leads/[id]/photos/route.ts:
--   id, lead_id, pro_id, r2_key, url, phase, caption, filename, created_at,
--   lat, lng, taken_at

-- 1) Create the table if it doesn't exist (staging path).
CREATE TABLE IF NOT EXISTS lead_photos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id      uuid        NOT NULL,
  r2_key      text        NOT NULL,
  url         text        NOT NULL,
  phase       text        NOT NULL DEFAULT 'Before',
  caption     text,
  filename    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- geo/time proof metadata (insurance-grade, all nullable)
  lat         double precision,
  lng         double precision,
  taken_at    timestamptz
);

-- 2) Add the geo columns if the table already existed without them (prod path).
ALTER TABLE lead_photos
  ADD COLUMN IF NOT EXISTS lat       double precision,
  ADD COLUMN IF NOT EXISTS lng       double precision,
  ADD COLUMN IF NOT EXISTS taken_at  timestamptz;

-- 3) Indexes the app relies on (idempotent).
CREATE INDEX IF NOT EXISTS idx_lead_photos_lead_phase
  ON lead_photos (lead_id, phase);
CREATE INDEX IF NOT EXISTS idx_lead_photos_pro_created
  ON lead_photos (pro_id, created_at DESC);

-- Optional future geo-query index (left disabled until a feature needs it):
-- CREATE INDEX IF NOT EXISTS idx_lead_photos_geo ON lead_photos (lat, lng);
