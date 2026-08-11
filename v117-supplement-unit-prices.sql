-- v117 — Supplement unit prices (deterministic post-fill source)
-- Adds default_unit_price to supplement_xactimate_codes so quantity/price for
-- field-bound items (SWB, valley) is data-sourced, not Gemini-generated.
-- Rates are FL 2026 estimates, is_verified=false until FL8X price-list export.
-- Idempotent.

ALTER TABLE supplement_xactimate_codes
  ADD COLUMN IF NOT EXISTS default_unit_price   numeric,
  ADD COLUMN IF NOT EXISTS unit_price_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_list_version    text;

-- FL 2026 seed rates (estimated — verify against FL8X export, then flip is_verified).
-- Keyed by code; unit already on row (lf/sf/sq/pct_adder).
UPDATE supplement_xactimate_codes SET
  default_unit_price = v.price,
  unit_price_updated_at = now(),
  price_list_version = 'FL8X-2026-EST'
FROM (VALUES
  ('RFG DRIP',     3.50),   -- $/LF
  ('RFG STRT',     3.00),   -- $/LF
  ('RFG FELT15',   45.00),  -- $/SQ
  ('RFG FELT30',   60.00),  -- $/SQ
  ('RFG SYNTH',    95.00),  -- $/SQ
  ('RFG FELT15DC', 90.00),  -- $/SQ (double coverage)
  ('RFG VALM',     12.00),  -- $/LF
  ('RFG IWS',      1.75),   -- $/SF (24in width valley application)
  ('RFG RFR',      55.00),  -- $/SQ
  ('RFG STEP1',    18.00),  -- $/SQ surcharge
  ('RFG STEP2',    32.00),  -- $/SQ surcharge
  ('RFG STEP3',    48.00),  -- $/SQ surcharge
  ('RFG HIGH',     22.00),  -- $/SQ surcharge
  ('RFG DKBD',     4.25),   -- $/SF
  ('RFG DK7',      95.00),  -- $/SQ (7/16 OSB)
  ('RFG DK5',      110.00)  -- $/SQ (1/2in OSB)
) AS v(code, price)
WHERE supplement_xactimate_codes.code = v.code;

-- Secondary Water Barrier is a distinct FL item priced higher than standard underlayment.
-- It maps to underlayment line_item but uses self-adhered rate. Store as a synthetic
-- code row so post-fill can resolve SWB independently of RFG FELT variants.
INSERT INTO supplement_xactimate_codes
  (line_item_id, code, description, unit, regional_prefixes, is_verified, default_unit_price, unit_price_updated_at, price_list_version, verification_notes)
SELECT
  (SELECT id FROM supplement_line_items WHERE key='underlayment'),
  'RFG SWB', 'Secondary Water Barrier (self-adhered, FBC R905.1.1)', 'sq',
  '[{"region":"All Florida","state":"FL","prefix":"All FL8X"}]'::jsonb,
  false, 120.00, now(), 'FL8X-2026-EST',
  'FL-specific FBC secondary water barrier. Rate estimated — verify against FL8X.'
WHERE NOT EXISTS (
  SELECT 1 FROM supplement_xactimate_codes WHERE code='RFG SWB'
);

-- O&P adders already priced as pct; ensure default_unit_price null (computed at 20% runtime).
UPDATE supplement_xactimate_codes
SET price_list_version = 'FL8X-2026-EST', unit_price_updated_at = now()
WHERE code IN ('OVH','PRF');
