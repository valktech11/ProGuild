-- v82-roofing-property.sql
-- Roofing Phase 2: property profiles + roofing material prices on pros
-- Run on staging first, then production. All statements are idempotent.

-- ── GBB (Good/Better/Best) estimate support ──────────────────────────────────
-- estimate_type: 'standard' (default) | 'tiered'
-- tiered_data: JSONB with the three tier definitions
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS estimate_type TEXT DEFAULT 'standard';
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS tiered_data JSONB;

-- ── Properties table ──────────────────────────────────────────────────────────
-- Address-centric record. All roofing (and HVAC) jobs link to a property.
CREATE TABLE IF NOT EXISTS properties (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id         UUID REFERENCES pros(id) ON DELETE CASCADE NOT NULL,
  -- Address
  address_line1  TEXT NOT NULL,
  address_line2  TEXT,
  city           TEXT,
  state          CHAR(2),
  zip_code       VARCHAR(10),
  -- Roof metadata (roofing trade)
  roof_type      TEXT,          -- Shingle, Metal, Tile, Flat/TPO, Modified Bitumen, Other
  roof_age_years INTEGER,
  roof_material  TEXT,          -- 3-Tab, Architectural, Designer, Metal Standing Seam, etc.
  sq_footage     DECIMAL(10,2),
  stories        INTEGER DEFAULT 1,
  -- Insurance
  insurance_carrier TEXT,
  insurance_policy_number TEXT,
  -- Notes
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_pro_id ON properties(pro_id);
CREATE INDEX IF NOT EXISTS idx_properties_zip    ON properties(zip_code);

-- Link leads to properties (optional — a lead may not have a property yet)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_property_id ON leads(property_id);

-- ── Roofing material prices (saved per-pro in settings) ───────────────────────
-- Stored as JSONB on the pros table. Schema:
-- { shingle_cost: number, underlayment_cost: number, ridge_cap_cost: number,
--   starter_strip_cost: number, nail_cost: number }
ALTER TABLE pros ADD COLUMN IF NOT EXISTS roofing_material_prices JSONB;

-- Good/Better/Best estimate templates (saved per-pro)
-- Array of { name, tiers: [{label, shingle_brand, warranty_term, price_per_sq}] }
ALTER TABLE pros ADD COLUMN IF NOT EXISTS gbb_templates JSONB;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'properties' AND policyname = 'pro owns properties'
  ) THEN
    CREATE POLICY "pro owns properties" ON properties
      FOR ALL USING (pro_id = auth.uid());
  END IF;
END$$;
