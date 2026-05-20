-- v95-clean-estimates-table.sql
-- ProGuild.ai — Remove roofing-specific columns from estimates table
--
-- CONTEXT:
--   5 columns were added to `estimates` that belong in `roofing_estimate_data`:
--   estimate_type, tiered_data, scope_of_work, payment_milestones, property_address
--
--   roofing_estimate_data already exists (v94) with all 5 columns.
--   This migration:
--     1. Backfills roofing_estimate_data from any estimates rows that have data
--     2. Drops the 5 columns from estimates
--
-- RESULT: estimates is a universal table forever.
-- Trade-specific data lives only in extension tables.
--
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO UPDATE).
-- Run on staging, verify 0 data loss, then production.

-- ── Step 1: Backfill roofing_estimate_data from estimates ─────────────────────
-- For all 9 estimates rows — copy whatever data exists across.
-- ON CONFLICT: update so re-runs are safe and always get latest data.

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
  e.estimate_type   IS NOT NULL
  OR e.tiered_data        IS NOT NULL
  OR e.scope_of_work      IS NOT NULL
  OR e.payment_milestones IS NOT NULL
  OR e.property_address   IS NOT NULL
ON CONFLICT (estimate_id) DO UPDATE SET
  estimate_type      = EXCLUDED.estimate_type,
  tiered_data        = EXCLUDED.tiered_data,
  scope_of_work      = EXCLUDED.scope_of_work,
  payment_milestones = EXCLUDED.payment_milestones,
  property_address   = EXCLUDED.property_address,
  updated_at         = now();

-- ── Step 2: Verify backfill before dropping ───────────────────────────────────
-- Run this SELECT manually to confirm data moved correctly before proceeding:
--
-- SELECT
--   e.id,
--   e.estimate_number,
--   e.estimate_type        AS est_type_on_estimates,
--   r.estimate_type        AS est_type_on_extension,
--   e.tiered_data IS NOT NULL   AS had_tiers_estimates,
--   r.tiered_data IS NOT NULL   AS has_tiers_extension
-- FROM estimates e
-- LEFT JOIN roofing_estimate_data r ON r.estimate_id = e.id
-- ORDER BY e.created_at;

-- ── Step 3: Drop roofing-specific columns from estimates ──────────────────────
ALTER TABLE estimates DROP COLUMN IF EXISTS estimate_type;
ALTER TABLE estimates DROP COLUMN IF EXISTS tiered_data;
ALTER TABLE estimates DROP COLUMN IF EXISTS scope_of_work;
ALTER TABLE estimates DROP COLUMN IF EXISTS payment_milestones;
ALTER TABLE estimates DROP COLUMN IF EXISTS property_address;

-- ── Step 4: Verify final state ────────────────────────────────────────────────
SELECT
  'estimates rows'               AS check_name, count(*) AS count FROM estimates
UNION ALL SELECT
  'roofing_estimate_data rows',  count(*) FROM roofing_estimate_data
UNION ALL SELECT
  'estimates with tiered data',  count(*) FROM roofing_estimate_data WHERE tiered_data IS NOT NULL
UNION ALL SELECT
  'roofing_job_data rows',       count(*) FROM roofing_job_data;

-- Expected after clean run:
--   estimates rows:              9
--   roofing_estimate_data rows:  9 (or however many had roofing data)
--   estimates with tiered data:  varies
--   roofing_job_data rows:       0 (empty — write path now wired in app code)
