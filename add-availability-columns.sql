-- Run this in Supabase SQL Editor to add availability columns
-- Dashboard → SQL Editor → New query → paste → Run

ALTER TABLE pros ADD COLUMN IF NOT EXISTS available_for_work BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pros ADD COLUMN IF NOT EXISTS available_note TEXT;

-- Verify the columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'pros'
AND column_name IN ('available_for_work', 'available_note');
