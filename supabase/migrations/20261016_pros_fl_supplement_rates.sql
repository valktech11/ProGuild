-- Add fl_supplement_rates JSONB column to pros table.
-- Stores contractor-customized FL unit rates for the Supplement Assistant.
-- Null = use FL_UNIT_RATES defaults from lib/fl/supplement.ts.
-- Shape: { valley_lining?: number, starter_strip?: number, sa_underlayment?: number,
--          drip_edge?: number, hip_ridge_cap?: number, permit?: number,
--          overhead?: number, profit?: number }

alter table pros
  add column if not exists fl_supplement_rates jsonb;

comment on column pros.fl_supplement_rates is
  'Pro-customized FL supplement unit rates ($/LF, $/SQ, $/EA, %). Null = use system defaults.';
