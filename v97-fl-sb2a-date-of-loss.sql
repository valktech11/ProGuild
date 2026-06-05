-- SB 2-A tracker — anchor field. Idempotent. Staging first.
-- date_of_loss is the statutory clock start (§627.70132). For weather events this is
-- the hurricane landfall / NOAA-verified date, NOT the date damage was discovered.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS date_of_loss date;
COMMENT ON COLUMN leads.date_of_loss IS
  'FL SB 2-A clock start (§627.70132). Weather: landfall/NOAA date, not discovery date.';
-- Optional: index if you query by deadline windows later.
CREATE INDEX IF NOT EXISTS idx_leads_date_of_loss ON leads (date_of_loss)
  WHERE date_of_loss IS NOT NULL;
