-- v94-roofing-estimate-data.sql
-- ProGuild.ai — Roofing estimate extension table
--
-- ARCHITECTURE: shared estimates table stays universal.
-- All roofing-specific estimate data lives here.
-- Pattern is identical to roofing_job_data for leads.
--
-- Columns moved OFF estimates:
--   estimate_type     → roofing_estimate_data.estimate_type
--   tiered_data       → roofing_estimate_data.tiered_data
--   scope_of_work     → roofing_estimate_data.scope_of_work
--   payment_milestones→ roofing_estimate_data.payment_milestones
--   property_address  → roofing_estimate_data.property_address
--
-- Safe to run multiple times (all IF NOT EXISTS / ON CONFLICT DO UPDATE).
-- Run on staging first, verify, then production.

-- ── Step 1: Create roofing_estimate_data ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS roofing_estimate_data (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id         UUID        NOT NULL UNIQUE REFERENCES estimates(id) ON DELETE CASCADE,
  pro_id              UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  -- Proposal structure
  estimate_type       TEXT        NOT NULL DEFAULT 'tiered'
                      CHECK (estimate_type IN ('standard','tiered')),
  tiered_data         JSONB,      -- { tiers: Tier[], selected_tier: TierKey }

  -- Content
  scope_of_work       TEXT,
  payment_milestones  JSONB,      -- [{ id, name, pct, amount, due_when }]

  -- Property (copied from lead at estimate creation)
  property_address    TEXT,
  square_count        NUMERIC,    -- from roofing_job_data at estimate creation
  pitch               TEXT,       -- e.g. "6/12"
  waste_pct           NUMERIC     DEFAULT 10,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_estimate_data_estimate
  ON roofing_estimate_data (estimate_id);

CREATE INDEX IF NOT EXISTS idx_roofing_estimate_data_pro
  ON roofing_estimate_data (pro_id);

ALTER TABLE roofing_estimate_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns roofing estimate data" ON roofing_estimate_data;
CREATE POLICY "pro owns roofing estimate data"
  ON roofing_estimate_data FOR ALL USING (pro_id = auth.uid());

-- ── Step 2: Backfill from existing estimates rows ────────────────────────────
-- Move data from the columns we added to estimates into the new table.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO roofing_estimate_data (
  estimate_id,
  pro_id,
  estimate_type,
  tiered_data,
  scope_of_work,
  payment_milestones,
  property_address
)
SELECT
  e.id,
  e.pro_id,
  COALESCE(e.estimate_type, 'tiered'),
  e.tiered_data,
  e.scope_of_work,
  e.payment_milestones,
  e.property_address
FROM estimates e
WHERE
  e.trade_slug LIKE '%roof%'
  AND (
    e.estimate_type   IS NOT NULL OR
    e.tiered_data     IS NOT NULL OR
    e.scope_of_work   IS NOT NULL OR
    e.payment_milestones IS NOT NULL OR
    e.property_address IS NOT NULL
  )
ON CONFLICT (estimate_id) DO UPDATE SET
  estimate_type      = EXCLUDED.estimate_type,
  tiered_data        = EXCLUDED.tiered_data,
  scope_of_work      = EXCLUDED.scope_of_work,
  payment_milestones = EXCLUDED.payment_milestones,
  property_address   = EXCLUDED.property_address,
  updated_at         = now();

-- ── Step 3: Fix roofing_job_data write path ───────────────────────────────────
-- This table was designed but never written to.
-- The insurance and measurement fields from InsuranceClaimFields
-- were being sent to /api/leads but silently dropped.
-- The application code fix (leads PATCH API) handles the actual writes.
-- Nothing to add here — the table schema is already correct.

-- ── Step 4: Verify ───────────────────────────────────────────────────────────

SELECT
  'roofing_estimate_data rows' AS check_name,
  count(*) AS count
FROM roofing_estimate_data
UNION ALL
SELECT
  'estimates with roofing trade_slug',
  count(*)
FROM estimates
WHERE trade_slug LIKE '%roof%';

