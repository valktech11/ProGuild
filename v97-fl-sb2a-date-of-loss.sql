-- FL SB 2-A tracker — anchor field. Idempotent. Staging first.
-- CORRECTED: date_of_loss is a claim field; all claim fields live in roofing_job_data
-- (the leads table never holds insurance fields). Earlier draft targeted leads — fixed here.
-- date_of_loss = statutory clock start (§627.70132). For weather events this is the
-- hurricane landfall / NOAA-verified date, NOT the date damage was discovered.

ALTER TABLE roofing_job_data ADD COLUMN IF NOT EXISTS date_of_loss date;
COMMENT ON COLUMN roofing_job_data.date_of_loss IS
  'FL SB 2-A clock start (§627.70132). Weather: landfall/NOAA date, not discovery date.';

-- Remove the column if a prior draft of this migration added it to the wrong table.
ALTER TABLE leads DROP COLUMN IF EXISTS date_of_loss;
