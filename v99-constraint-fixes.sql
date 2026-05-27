-- ============================================================
-- v99 — Constraint fixes + pipeline_events schema alignment
-- Run on: staging + production
-- Date: May 2026
-- ============================================================

-- ── 1. leads_lead_status_check — add all trade stage keys ──────────────────
-- Adds: assessed, site_visit, permit_submitted, permit_approved (electrician)
--       bidding, contract_signed, milestone_1, milestone_2, closeout (GC)
--       new (default trade)
-- These were added in the May 26 session but never put in a migration file.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_lead_status_check
  CHECK (lead_status IN (
    -- Legacy generic stages (backward compat)
    'New', 'Contacted', 'Quoted', 'Scheduled', 'Completed', 'Paid',
    'Lost', 'Archived', 'Queued_Manual', 'Converted',
    -- Shared cross-trade
    'lead_in', 'in_progress', 'job_won', 'lost', 'unqualified',
    'scheduled', 'quoted',
    -- Default trade
    'new',
    -- Roofing
    'inspection_scheduled', 'proposal_sent', 'proposal_signed',
    'insurance_approved',
    -- HVAC
    'new_call', 'diagnosed', 'parts_ordered', 'job_complete',
    -- Plumbing
    'assessed',
    -- Electrician
    'site_visit', 'permit_submitted', 'permit_approved',
    -- General Contractor
    'bidding', 'contract_signed', 'milestone_1', 'milestone_2', 'closeout'
  ));

-- ── 2. leads_lead_source_check — no change needed, already correct ──────────
-- Valid values confirmed: Profile_Page, Job_Post, Search_Result, Direct,
-- Registry_Card, Phone_Call, Facebook, Instagram, Referral, Website,
-- Yard_Sign, Walk_In, Other, Insurance, Canvassing, Manual
-- App code was using 'Manual_Entry' (wrong) — fixed in application code (ae6df2f).
-- No DB change needed here.

-- ── 3. pipeline_events — add from_stage/to_stage columns ────────────────────
-- The stage/route.ts and leads/route.ts were inserting from_stage/to_stage
-- as top-level columns which don't exist in the schema.
-- Fixed in application code to use event_data JSONB instead.
-- However, add columns for any direct SQL queries / future analytics:
ALTER TABLE pipeline_events
  ADD COLUMN IF NOT EXISTS from_stage TEXT,
  ADD COLUMN IF NOT EXISTS to_stage   TEXT;

-- ── 4. Backfill from_stage/to_stage from event_data for existing rows ────────
UPDATE pipeline_events
SET
  from_stage = event_data->>'from',
  to_stage   = event_data->>'to'
WHERE
  event_type = 'stage_changed'
  AND event_data IS NOT NULL
  AND from_stage IS NULL;

-- ── 5. Verify ─────────────────────────────────────────────────────────────────
-- Run after migration:
-- SELECT lead_status, count(*) FROM leads GROUP BY 1 ORDER BY 2 DESC;
-- SELECT constraint_name FROM information_schema.table_constraints
--   WHERE table_name = 'leads' AND constraint_type = 'CHECK';
