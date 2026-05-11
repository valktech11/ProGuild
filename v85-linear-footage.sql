-- Migration: add linear_footage JSONB column to roof_reports
-- Run on both staging and production Supabase SQL editor
-- Safe to run multiple times (IF NOT EXISTS)

ALTER TABLE roof_reports
ADD COLUMN IF NOT EXISTS linear_footage JSONB DEFAULT NULL;

-- Example stored value:
-- {
--   "ridge_ft": 84,
--   "hip_ft": 120,
--   "valley_ft": 36,
--   "rake_ft": 44,
--   "eave_ft": 210,
--   "total_linear_ft": 494,
--   "accuracy_note": "±6 inches per line segment...",
--   "facet_count": 8
-- }
