-- v111-lost-reason.sql
-- Adds lost_reason to leads table.
-- Run on staging first, then production.
-- Safe to re-run (IF NOT EXISTS pattern).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lost_reason TEXT DEFAULT NULL;

-- Optional: add a check constraint to keep values clean
-- (uncomment if you want DB-level enforcement)
-- ALTER TABLE leads
--   ADD CONSTRAINT leads_lost_reason_check
--   CHECK (lost_reason IS NULL OR lost_reason IN (
--     'price_too_high', 'hired_competitor', 'no_response',
--     'job_cancelled', 'not_ready', 'other'
--   ));

COMMENT ON COLUMN leads.lost_reason IS
  'Reason captured when lead is moved to lost stage. Values: price_too_high | hired_competitor | no_response | job_cancelled | not_ready | other';
