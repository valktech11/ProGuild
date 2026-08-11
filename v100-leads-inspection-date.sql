-- v100 — add inspection_date to leads (pipeline inspection milestone + calendar)
-- Run manually on Supabase staging. Idempotent.
-- Required for: the Inspection Scheduled date popup, the Edit-form Inspection Date
-- field, and inspection events on the calendar.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS inspection_date date;
