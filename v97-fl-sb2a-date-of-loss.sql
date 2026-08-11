-- FL SB 2-A tracker — anchor field. Idempotent. Staging first.
-- date_of_loss is a claim field; all claim fields live in roofing_job_data
-- (the leads table never holds insurance fields). date_of_loss = statutory clock
-- start (§627.70132). Weather events: hurricane landfall / NOAA-verified date,
-- NOT the date damage was discovered.

-- 1) Add the column on the correct table.
ALTER TABLE roofing_job_data ADD COLUMN IF NOT EXISTS date_of_loss date;
COMMENT ON COLUMN roofing_job_data.date_of_loss IS
  'FL SB 2-A clock start (§627.70132). Weather: landfall/NOAA date, not discovery date.';

-- 2) Partial index for future "deadlines approaching across all claims" queries.
--    Mirrors the earlier draft's index, on the correct table.
CREATE INDEX IF NOT EXISTS idx_roofing_job_data_date_of_loss
  ON roofing_job_data (date_of_loss)
  WHERE date_of_loss IS NOT NULL;

-- 3) Undo the earlier draft that targeted leads: drop its index, then the column.
--    (Dropping the column alone also drops a single-column index on it; explicit
--     here for clarity and so re-running is fully idempotent.)
DROP INDEX IF EXISTS idx_leads_date_of_loss;
ALTER TABLE leads DROP COLUMN IF EXISTS date_of_loss;
