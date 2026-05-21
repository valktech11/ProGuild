-- v97-hvac-extension-tables.sql
-- ProGuild.ai — HVAC estimate + invoice extension tables
--
-- ARCHITECTURE: Same pattern as roofing extension tables.
--   leads          → hvac_job_data         (already exists in v93)
--   estimates      → hvac_estimate_data    (NEW — this file)
--   invoices       → hvac_invoice_data     (NEW — this file)
--
-- EXISTING HVAC TABLES (already in DB from prior migrations):
--   hvac_job_data              — lead-level: system type, refrigerant, equipment details
--   hvac_equipment             — property-level equipment registry
--   hvac_refrigerant_log       — per-invoice refrigerant tracking (EPA compliance)
--   hvac_maintenance_reminders — scheduled service reminders per equipment
--
-- Safe to run multiple times (IF NOT EXISTS).
-- Run on STAGING first → verify → PRODUCTION.
-- ============================================================


-- ============================================================
-- TABLE 1: hvac_estimate_data
-- Per-estimate HVAC-specific fields.
-- estimates table stays universal — nothing HVAC-specific there.
-- ============================================================

CREATE TABLE IF NOT EXISTS hvac_estimate_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id           UUID        NOT NULL UNIQUE REFERENCES estimates(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  -- Job type
  job_type              TEXT,
  -- 'replacement' | 'repair' | 'new_install' | 'maintenance' | 'inspection'

  -- Equipment being replaced or serviced
  system_type           TEXT,
  -- 'central_ac' | 'furnace' | 'heat_pump' | 'mini_split' | 'air_handler' | 'boiler' | 'package_unit'
  existing_brand        TEXT,
  existing_model        TEXT,
  existing_tonnage      NUMERIC,
  existing_seer         NUMERIC,
  existing_install_year INTEGER,
  existing_refrigerant  TEXT,        -- 'R-22' | 'R-410A' | 'R-32' | 'R-454B'

  -- Proposed replacement
  proposed_brand        TEXT,
  proposed_model        TEXT,
  proposed_tonnage      NUMERIC,
  proposed_seer         NUMERIC,     -- Efficiency rating
  proposed_hspf         NUMERIC,     -- Heating Seasonal Performance Factor
  proposed_refrigerant  TEXT,
  proposed_warranty_yrs INTEGER,

  -- Scope
  scope_of_work         TEXT,        -- Human-readable scope description
  includes_labor        BOOLEAN      DEFAULT TRUE,
  includes_permit       BOOLEAN      DEFAULT FALSE,
  includes_disposal     BOOLEAN      DEFAULT TRUE,
  includes_thermostat   BOOLEAN      DEFAULT FALSE,
  duct_work_included    BOOLEAN      DEFAULT FALSE,
  duct_work_notes       TEXT,

  -- Payment milestones (JSONB — same structure as roofing_estimate_data)
  payment_milestones    JSONB,
  -- [{ id, name, pct, amount, due_when }]

  -- Financing
  financing_available   BOOLEAN      DEFAULT FALSE,
  financing_monthly     NUMERIC,     -- "from $X/mo" shown on proposal

  created_at            TIMESTAMPTZ  DEFAULT now(),
  updated_at            TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hvac_estimate_data_estimate
  ON hvac_estimate_data (estimate_id);

CREATE INDEX IF NOT EXISTS idx_hvac_estimate_data_pro
  ON hvac_estimate_data (pro_id);

ALTER TABLE hvac_estimate_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns hvac estimate data" ON hvac_estimate_data;
CREATE POLICY "pro owns hvac estimate data"
  ON hvac_estimate_data FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- TABLE 2: hvac_invoice_data
-- Per-invoice HVAC-specific fields.
-- invoices table stays universal — nothing HVAC-specific there.
-- ============================================================

CREATE TABLE IF NOT EXISTS hvac_invoice_data (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id              UUID        NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
  pro_id                  UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  -- Equipment installed (copied from hvac_estimate_data at invoice creation)
  system_type             TEXT,
  brand_installed         TEXT,
  model_installed         TEXT,
  serial_number           TEXT,
  tonnage_installed       NUMERIC,
  seer_installed          NUMERIC,
  refrigerant_type        TEXT,
  warranty_years          INTEGER,
  warranty_expiry_date    DATE,

  -- Refrigerant (EPA Section 608 compliance)
  refrigerant_added_lbs   NUMERIC,
  refrigerant_recovered_lbs NUMERIC,
  technician_cert_number  TEXT,       -- EPA 608 cert number

  -- Permit
  permit_number           TEXT,
  permit_status           TEXT,       -- 'pending' | 'approved' | 'closed'
  permit_inspection_date  DATE,

  -- Completion
  install_date            DATE,
  startup_completed       BOOLEAN     DEFAULT FALSE,
  thermostat_programmed   BOOLEAN     DEFAULT FALSE,
  homeowner_walkthrough   BOOLEAN     DEFAULT FALSE,
  lien_waiver_signed      BOOLEAN     DEFAULT FALSE,
  lien_waiver_r2_key      TEXT,

  -- Next service reminder
  next_service_due        DATE,       -- Auto-generates hvac_maintenance_reminder row

  final_notes             TEXT,

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hvac_invoice_data_invoice
  ON hvac_invoice_data (invoice_id);

CREATE INDEX IF NOT EXISTS idx_hvac_invoice_data_pro
  ON hvac_invoice_data (pro_id);

ALTER TABLE hvac_invoice_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns hvac invoice data" ON hvac_invoice_data;
CREATE POLICY "pro owns hvac invoice data"
  ON hvac_invoice_data FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- VERIFY
-- ============================================================
SELECT
  'hvac_estimate_data' AS table_name, count(*) AS rows FROM hvac_estimate_data
UNION ALL SELECT
  'hvac_invoice_data',  count(*) FROM hvac_invoice_data
UNION ALL SELECT
  'hvac_job_data',      count(*) FROM hvac_job_data
UNION ALL SELECT
  'hvac_equipment',     count(*) FROM hvac_equipment;

-- Expected: all 0 rows — tables exist, populated on first use.
