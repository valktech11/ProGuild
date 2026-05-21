-- v98-estimates-missing-cols.sql
-- Adds two universal columns that code writes but DB was missing.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS notes          TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS decline_reason TEXT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'estimates'
  AND column_name  IN ('notes', 'decline_reason')
ORDER BY column_name;
