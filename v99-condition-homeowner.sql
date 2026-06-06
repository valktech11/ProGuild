-- v99 — Roof condition store-and-surface + homeowner public status page
-- Run manually on Supabase staging. Idempotent.

-- 1. Persist what the report already generates (today it only lives in the PDF)
ALTER TABLE roof_reports ADD COLUMN IF NOT EXISTS condition_assessment   text;
ALTER TABLE roof_reports ADD COLUMN IF NOT EXISTS condition_assessed_at  timestamptz;
ALTER TABLE roof_reports ADD COLUMN IF NOT EXISTS nearest_supplier       jsonb;
ALTER TABLE roof_reports ADD COLUMN IF NOT EXISTS storm_event            jsonb;

-- 2. Non-enumerable public token for the homeowner job-status page
ALTER TABLE leads ADD COLUMN IF NOT EXISTS public_token text;
CREATE UNIQUE INDEX IF NOT EXISTS leads_public_token_key ON leads (public_token) WHERE public_token IS NOT NULL;
