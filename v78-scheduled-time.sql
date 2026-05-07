-- v78: Add scheduled_time column to leads table
-- Safe to run on staging and production — uses IF NOT EXISTS, no data loss
-- Format: 'HH:MM' 24-hour text (e.g. '09:00', '14:30')

ALTER TABLE leads ADD COLUMN IF NOT EXISTS scheduled_time text;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'scheduled_time';
