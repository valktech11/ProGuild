-- add-services-pricing.sql
-- Adds the two Preferences fields the web /edit-profile UI already renders and
-- sends, but which have no backing column yet:
--   * services      TEXT[]  — free-text service tags shown on the public profile
--   * pricing_note   TEXT    — pricing-signal preset or custom note
--
-- Until this runs, both are silently dropped on save: the web Save sends them
-- but the /api/pros/[id] PATCH whitelist (and the table) never persists them, so
-- they vanish on reload. Mobile intentionally omits both sections for the same
-- reason. After this migration, add 'services' and 'pricing_note' to the PATCH
-- whitelist and the two sections will persist on web + mobile.
--
-- Safe to run on staging (dev DB) immediately; batch into prod at your discretion.

ALTER TABLE pros ADD COLUMN IF NOT EXISTS services     TEXT[];
ALTER TABLE pros ADD COLUMN IF NOT EXISTS pricing_note TEXT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pros' AND column_name IN ('services', 'pricing_note');
