-- v76: Add discount_type to estimates table
-- Run on staging first, then production

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT '$'
  CHECK (discount_type IN ('$', '%'));

-- Backfill: existing rows with discount > 0 were all flat $ amounts
-- (% type was never persisted, so all existing discounts are $ type)
-- The DEFAULT '$' handles this automatically for existing rows.
