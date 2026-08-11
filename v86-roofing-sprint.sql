-- v86-roofing-sprint.sql
-- Run on STAGING first, verify, then PRODUCTION.
-- Safe to re-run (IF NOT EXISTS / DO NOTHING guards throughout).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Insurance claim fields on leads table
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS insurance_claim        BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS insurance_company      TEXT,
  ADD COLUMN IF NOT EXISTS claim_number           TEXT,
  ADD COLUMN IF NOT EXISTS adjuster_name          TEXT,
  ADD COLUMN IF NOT EXISTS adjuster_phone         TEXT,
  ADD COLUMN IF NOT EXISTS adjuster_appointment   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_status           TEXT         DEFAULT 'Filed',
  ADD COLUMN IF NOT EXISTS approved_amount        NUMERIC,
  ADD COLUMN IF NOT EXISTS supplement_amount      NUMERIC,
  ADD COLUMN IF NOT EXISTS deductible             NUMERIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. lead_trigger_log — async auto-trigger queue
--    Proposal Signed → fire_deposit_stripe, send_proposal_signed_email
--    Job Won        → create_warranty_record, queue_review_request
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_trigger_log (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID         NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id        UUID         NOT NULL,
  trigger_name  TEXT         NOT NULL,
  stage         TEXT         NOT NULL,
  trade_slug    TEXT         NOT NULL DEFAULT '',
  status        TEXT         NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
  error         TEXT,
  created_at    TIMESTAMPTZ  DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS lead_trigger_log_status_idx ON lead_trigger_log(status, created_at);
CREATE INDEX IF NOT EXISTS lead_trigger_log_lead_idx   ON lead_trigger_log(lead_id);

-- RLS
ALTER TABLE lead_trigger_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "pro owns triggers"
  ON lead_trigger_log
  FOR ALL
  USING (pro_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Remap existing roofing lead_status values to new 10-stage keys
--    Only runs for leads belonging to Roofing Contractor pros.
--    Does NOT touch HVAC, plumbing, or other trade leads.
-- ─────────────────────────────────────────────────────────────────────────────

-- Map old generic stages → new roofing stage keys
UPDATE leads l
SET    lead_status = CASE l.lead_status
         WHEN 'New'       THEN 'lead_in'
         WHEN 'Contacted' THEN 'inspection_scheduled'
         WHEN 'Quoted'    THEN 'proposal_sent'
         WHEN 'Scheduled' THEN 'scheduled'
         WHEN 'Completed' THEN 'in_progress'
         WHEN 'Paid'      THEN 'job_won'
         WHEN 'Lost'      THEN 'lost'
         WHEN 'Archived'  THEN 'lost'
         ELSE l.lead_status   -- already migrated or unknown, leave as-is
       END
FROM   pros p
WHERE  l.pro_id = p.id
  AND  p.trade  ILIKE '%roofing%'
  AND  l.lead_status IN ('New','Contacted','Quoted','Scheduled','Completed','Paid','Lost','Archived');

-- Verify migration (run in SQL editor to check):
-- SELECT lead_status, count(*) FROM leads l
-- JOIN pros p ON l.pro_id = p.id
-- WHERE p.trade ILIKE '%roofing%'
-- GROUP BY lead_status ORDER BY count DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Add updated_at column to leads if missing (needed by stage route)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Add trade_slug to leads — used by stage route to load correct state machine
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS trade_slug TEXT;

-- Backfill from pros table
UPDATE leads l
SET    trade_slug = p.trade_slug
FROM   pros p
WHERE  l.pro_id = p.id
  AND  l.trade_slug IS NULL;
