-- v112-photo-geostamp.sql
-- Photo Capture v1 — add GPS + capture-time proof metadata to lead_photos.
--
-- All nullable + additive: existing photos and any client that doesn't send
-- these fields are unaffected. Run on STAGING Supabase first, then production.
--
--   lat       — capture latitude  (device GPS at shutter)
--   lng       — capture longitude
--   taken_at  — device timestamp at capture (distinct from created_at = upload time;
--               matters for offline-queued photos uploaded later)

ALTER TABLE lead_photos
  ADD COLUMN IF NOT EXISTS lat       double precision,
  ADD COLUMN IF NOT EXISTS lng       double precision,
  ADD COLUMN IF NOT EXISTS taken_at  timestamptz;

-- Optional: index for any future "photos near here" / map features. Cheap, additive.
-- (Left commented; enable when a geo-query feature actually needs it.)
-- CREATE INDEX IF NOT EXISTS idx_lead_photos_geo ON lead_photos (lat, lng);
