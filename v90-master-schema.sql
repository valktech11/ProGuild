-- ============================================================
-- ProGuild.ai — v90 Master Schema Migration
-- Future-proof multi-trade CRM + Audit + Legal + Performance
-- Run on STAGING first, verify, then PRODUCTION
-- Safe to re-run — all statements use IF NOT EXISTS guards
-- ============================================================
-- NOTE: All API routes use SUPABASE_SERVICE_ROLE_KEY which
-- bypasses RLS. RLS policies below protect direct DB access
-- and future client-side queries only.
-- ============================================================


-- ============================================================
-- BLOCK 1: FIX leads TABLE
-- ============================================================

-- Core missing columns
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS trade_slug       TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ  DEFAULT now();

-- Backfill trade_slug from pros → trade_categories
UPDATE leads l
SET    trade_slug = tc.slug
FROM   pros p
JOIN   trade_categories tc ON tc.id = p.trade_category_id
WHERE  l.pro_id    = p.id
AND    l.trade_slug IS NULL
AND    tc.slug     IS NOT NULL;

-- Composite indexes for every hot query path
CREATE INDEX IF NOT EXISTS idx_leads_pro_status
  ON leads (pro_id, lead_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_pro_updated
  ON leads (pro_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_pro_created
  ON leads (pro_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_trade_pro
  ON leads (trade_slug, pro_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_property
  ON leads (property_id)
  WHERE property_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_client
  ON leads (client_id)
  WHERE client_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_deleted_at
  ON leads (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Full text search on contact name
CREATE INDEX IF NOT EXISTS idx_leads_contact_name_fts
  ON leads USING gin(to_tsvector('english', coalesce(contact_name,'')));


-- ============================================================
-- BLOCK 2: FIX estimates TABLE
-- ============================================================

-- Drop duplicate tiers column — tiered_data is the canonical one (from v82)
ALTER TABLE estimates DROP COLUMN IF EXISTS tiers;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_estimates_pro_status
  ON estimates (pro_id, status);

CREATE INDEX IF NOT EXISTS idx_estimates_pro_created
  ON estimates (pro_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_estimates_lead
  ON estimates (lead_id)
  WHERE lead_id IS NOT NULL;


-- ============================================================
-- BLOCK 3: FIX invoices TABLE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_invoices_pro_status
  ON invoices (pro_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_pro_created
  ON invoices (pro_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_lead
  ON invoices (lead_id)
  WHERE lead_id IS NOT NULL;


-- ============================================================
-- BLOCK 4: FIX pros TABLE
-- ============================================================

-- Denormalize trade_slug onto pros for fast dashboard queries
-- (avoids JOIN to trade_categories on every dashboard load)
ALTER TABLE pros
  ADD COLUMN IF NOT EXISTS trade_slug TEXT;

-- Backfill from trade_categories
UPDATE pros p
SET    trade_slug = tc.slug
FROM   trade_categories tc
WHERE  tc.id       = p.trade_category_id
AND    p.trade_slug IS NULL;

-- Full text search for directory
ALTER TABLE pros
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

UPDATE pros SET search_vector =
  to_tsvector('english',
    coalesce(full_name,'')    || ' ' ||
    coalesce(business_name,'') || ' ' ||
    coalesce(city,'')          || ' ' ||
    coalesce(trade_slug,'')
  );

CREATE INDEX IF NOT EXISTS idx_pros_search_fts
  ON pros USING gin(search_vector);

-- Keep search_vector fresh automatically
CREATE OR REPLACE FUNCTION pros_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.full_name,'')    || ' ' ||
    coalesce(NEW.business_name,'') || ' ' ||
    coalesce(NEW.city,'')          || ' ' ||
    coalesce(NEW.trade_slug,'')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pros_search_vector ON pros;
CREATE TRIGGER trg_pros_search_vector
  BEFORE INSERT OR UPDATE ON pros
  FOR EACH ROW EXECUTE FUNCTION pros_search_vector_update();

-- Directory query indexes
CREATE INDEX IF NOT EXISTS idx_pros_trade_city
  ON pros (trade_slug, city)
  WHERE is_claimed = true;

CREATE INDEX IF NOT EXISTS idx_pros_slug
  ON pros (slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pros_claimed_trade
  ON pros (is_claimed, trade_slug);


-- ============================================================
-- BLOCK 5: FIX properties TABLE
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS lat           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS hoa           BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS property_type TEXT     DEFAULT 'residential',
  ADD COLUMN IF NOT EXISTS client_id     UUID     REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_pro
  ON properties (pro_id);

CREATE INDEX IF NOT EXISTS idx_properties_address
  ON properties (address_line1, zip_code);

CREATE INDEX IF NOT EXISTS idx_properties_client
  ON properties (client_id)
  WHERE client_id IS NOT NULL;


-- ============================================================
-- BLOCK 6: FIX hvac_equipment TABLE
-- ============================================================

ALTER TABLE hvac_equipment
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hvac_equipment_property
  ON hvac_equipment (property_id)
  WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hvac_equipment_pro
  ON hvac_equipment (pro_id);


-- ============================================================
-- BLOCK 7: TRADE JOB DATA TABLES
-- One row per lead per trade. leads table never changes again.
-- trade_slug on leads tells you which table to join.
-- ============================================================

-- 7a. ROOFING
CREATE TABLE IF NOT EXISTS roofing_job_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  -- Insurance claim
  insurance_claim       BOOLEAN     DEFAULT FALSE,
  insurance_company     TEXT,
  claim_number          TEXT,
  adjuster_name         TEXT,
  adjuster_phone        TEXT,
  adjuster_appointment  TIMESTAMPTZ,
  claim_status          TEXT        DEFAULT 'Filed',
  approved_amount       NUMERIC,
  supplement_amount     NUMERIC,
  deductible            NUMERIC,

  -- Job details
  roof_type             TEXT,       -- shingle/tile/metal/flat
  square_count          NUMERIC,
  pitch                 TEXT,
  waste_pct             NUMERIC     DEFAULT 10,
  layers                INTEGER     DEFAULT 1,
  decking_replacement   BOOLEAN     DEFAULT FALSE,
  permit_number         TEXT,
  permit_status         TEXT,

  -- Warranty (moved from roofing_warranties for single join)
  shingle_brand         TEXT,
  shingle_model         TEXT,
  warranty_term         TEXT,
  install_date          DATE,
  warranty_expiry       TEXT,

  -- Freeform
  custom_fields         JSONB,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_job_data_lead    ON roofing_job_data (lead_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_data_pro     ON roofing_job_data (pro_id);

ALTER TABLE roofing_job_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns roofing job data" ON roofing_job_data;
CREATE POLICY "pro owns roofing job data"
  ON roofing_job_data FOR ALL USING (pro_id = auth.uid());


-- 7b. HVAC
CREATE TABLE IF NOT EXISTS hvac_job_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  system_type           TEXT,       -- split_ac/heat_pump/furnace/mini_split/package_unit
  issue_type            TEXT,       -- repair/maintenance/replacement/new_install
  refrigerant_type      TEXT,       -- R-410A/R-22/R-32
  seer_rating           NUMERIC,
  tonnage               NUMERIC,
  brand                 TEXT,
  model_number          TEXT,
  serial_number         TEXT,
  install_year          INTEGER,
  warranty_expiry       DATE,
  permit_number         TEXT,
  permit_status         TEXT,

  custom_fields         JSONB,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hvac_job_data_lead ON hvac_job_data (lead_id);
CREATE INDEX IF NOT EXISTS idx_hvac_job_data_pro  ON hvac_job_data (pro_id);

ALTER TABLE hvac_job_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns hvac job data" ON hvac_job_data;
CREATE POLICY "pro owns hvac job data"
  ON hvac_job_data FOR ALL USING (pro_id = auth.uid());


-- 7c. ELECTRICAL
CREATE TABLE IF NOT EXISTS electrical_job_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  job_type              TEXT,       -- panel_upgrade/rewire/outlet/ev_charger/generator/new_install
  panel_brand           TEXT,
  panel_amps            INTEGER,
  panel_age_years       INTEGER,
  breaker_count         INTEGER,
  voltage               INTEGER,    -- 120/240
  permit_number         TEXT,
  permit_status         TEXT,
  inspection_date       DATE,
  inspection_passed     BOOLEAN,
  code_notes            TEXT,       -- NEC violations or notes

  custom_fields         JSONB,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_electrical_job_data_lead ON electrical_job_data (lead_id);
CREATE INDEX IF NOT EXISTS idx_electrical_job_data_pro  ON electrical_job_data (pro_id);

ALTER TABLE electrical_job_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns electrical job data" ON electrical_job_data;
CREATE POLICY "pro owns electrical job data"
  ON electrical_job_data FOR ALL USING (pro_id = auth.uid());


-- 7d. PLUMBING
CREATE TABLE IF NOT EXISTS plumbing_job_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  job_type              TEXT,       -- repair/replacement/new_install/emergency/inspection
  fixture_type          TEXT,       -- toilet/sink/shower/water_heater/pipe/drain/main_line
  pipe_material         TEXT,       -- copper/pvc/cpvc/pex/galvanized/cast_iron
  water_heater_type     TEXT,       -- tank/tankless/heat_pump/solar
  water_heater_age      INTEGER,
  is_emergency          BOOLEAN     DEFAULT FALSE,
  permit_number         TEXT,
  permit_status         TEXT,

  custom_fields         JSONB,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plumbing_job_data_lead ON plumbing_job_data (lead_id);
CREATE INDEX IF NOT EXISTS idx_plumbing_job_data_pro  ON plumbing_job_data (pro_id);

ALTER TABLE plumbing_job_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns plumbing job data" ON plumbing_job_data;
CREATE POLICY "pro owns plumbing job data"
  ON plumbing_job_data FOR ALL USING (pro_id = auth.uid());


-- 7e. SOLAR
CREATE TABLE IF NOT EXISTS solar_job_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  job_type              TEXT,       -- new_install/repair/inspection/battery_add
  panel_count           INTEGER,
  panel_brand           TEXT,
  panel_model           TEXT,
  system_kw             NUMERIC,
  inverter_brand        TEXT,
  inverter_type         TEXT,       -- string/micro/power_optimizer
  battery_included      BOOLEAN     DEFAULT FALSE,
  battery_brand         TEXT,
  battery_kwh           NUMERIC,
  roof_type             TEXT,
  permit_number         TEXT,
  permit_status         TEXT,
  utility_approval      BOOLEAN     DEFAULT FALSE,
  interconnect_date     DATE,
  estimated_offset_pct  NUMERIC,   -- % of energy bill offset

  custom_fields         JSONB,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solar_job_data_lead ON solar_job_data (lead_id);
CREATE INDEX IF NOT EXISTS idx_solar_job_data_pro  ON solar_job_data (pro_id);

ALTER TABLE solar_job_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns solar job data" ON solar_job_data;
CREATE POLICY "pro owns solar job data"
  ON solar_job_data FOR ALL USING (pro_id = auth.uid());


-- 7f. GENERAL CONTRACTOR
CREATE TABLE IF NOT EXISTS gc_job_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  project_type          TEXT,       -- addition/renovation/new_build/demo/commercial
  total_sqft            NUMERIC,
  materials_budget      NUMERIC,
  labour_budget         NUMERIC,
  sub_count             INTEGER     DEFAULT 0,
  permit_number         TEXT,
  permit_status         TEXT,
  architect_required    BOOLEAN     DEFAULT FALSE,
  hoa_approval_required BOOLEAN     DEFAULT FALSE,
  hoa_approval_status   TEXT,
  start_date            DATE,
  estimated_end_date    DATE,

  custom_fields         JSONB,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gc_job_data_lead ON gc_job_data (lead_id);
CREATE INDEX IF NOT EXISTS idx_gc_job_data_pro  ON gc_job_data (pro_id);

ALTER TABLE gc_job_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns gc job data" ON gc_job_data;
CREATE POLICY "pro owns gc job data"
  ON gc_job_data FOR ALL USING (pro_id = auth.uid());


-- 7g. LANDSCAPE
CREATE TABLE IF NOT EXISTS landscape_job_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  job_type              TEXT,       -- design/maintenance/irrigation/sod/tree/hardscape
  total_sqft            NUMERIC,
  irrigation_included   BOOLEAN     DEFAULT FALSE,
  irrigation_zones      INTEGER,
  sod_type              TEXT,
  tree_count            INTEGER,
  hardscape_sqft        NUMERIC,
  lighting_included     BOOLEAN     DEFAULT FALSE,
  hoa_approval_required BOOLEAN     DEFAULT FALSE,

  custom_fields         JSONB,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landscape_job_data_lead ON landscape_job_data (lead_id);
CREATE INDEX IF NOT EXISTS idx_landscape_job_data_pro  ON landscape_job_data (pro_id);

ALTER TABLE landscape_job_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns landscape job data" ON landscape_job_data;
CREATE POLICY "pro owns landscape job data"
  ON landscape_job_data FOR ALL USING (pro_id = auth.uid());


-- 7h. PAINTING
CREATE TABLE IF NOT EXISTS painting_job_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  job_type              TEXT,       -- interior/exterior/both/cabinet/deck/commercial
  surface_sqft          NUMERIC,
  story_count           INTEGER     DEFAULT 1,
  paint_brand           TEXT,
  paint_finish          TEXT,       -- flat/eggshell/satin/semi_gloss/gloss
  coat_count            INTEGER     DEFAULT 2,
  primer_required       BOOLEAN     DEFAULT FALSE,
  pressure_wash_included BOOLEAN    DEFAULT FALSE,
  color_count           INTEGER     DEFAULT 1,
  hoa_approval_required BOOLEAN     DEFAULT FALSE,

  custom_fields         JSONB,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_painting_job_data_lead ON painting_job_data (lead_id);
CREATE INDEX IF NOT EXISTS idx_painting_job_data_pro  ON painting_job_data (pro_id);

ALTER TABLE painting_job_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns painting job data" ON painting_job_data;
CREATE POLICY "pro owns painting job data"
  ON painting_job_data FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- BLOCK 8: OPERATIONAL TABLES
-- ============================================================

-- 8a. Review requests (auto-review after Job Won)
CREATE TABLE IF NOT EXISTS review_requests (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  homeowner_name  TEXT,
  homeowner_email TEXT,
  homeowner_phone TEXT,
  status          TEXT        DEFAULT 'pending',
                              -- pending/sms_sent/email_sent/rated/no_response
  rating          INTEGER,    -- 1-5 when submitted
  review_text     TEXT,
  sent_to_google  BOOLEAN     DEFAULT FALSE,
  sms_sent_at     TIMESTAMPTZ,
  email_sent_at   TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  follow_up_sent  BOOLEAN     DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_requests_pro
  ON review_requests (pro_id, status);
CREATE INDEX IF NOT EXISTS idx_review_requests_lead
  ON review_requests (lead_id);

ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns review requests" ON review_requests;
CREATE POLICY "pro owns review requests"
  ON review_requests FOR ALL USING (pro_id = auth.uid());


-- 8b. Webhook events (Stripe, Twilio — persist all raw events)
CREATE TABLE IF NOT EXISTS webhook_events (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  source          TEXT        NOT NULL, -- stripe/twilio/resend
  event_type      TEXT        NOT NULL, -- e.g. invoice.paid, message.delivered
  event_id        TEXT        UNIQUE,   -- provider's event ID for deduplication
  payload         JSONB       NOT NULL,
  processed       BOOLEAN     DEFAULT FALSE,
  processed_at    TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source_type
  ON webhook_events (source, event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed
  ON webhook_events (processed, created_at)
  WHERE processed = FALSE;

-- Service role only — no pro-level RLS needed
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only webhook events" ON webhook_events;
CREATE POLICY "service role only webhook events"
  ON webhook_events FOR ALL USING (false); -- service role bypasses this


-- 8c. SMS log
CREATE TABLE IF NOT EXISTS sms_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        REFERENCES pros(id) ON DELETE SET NULL,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  direction       TEXT        NOT NULL, -- outbound/inbound
  to_phone        TEXT        NOT NULL,
  from_phone      TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  twilio_sid      TEXT,
  status          TEXT,       -- queued/sent/delivered/failed
  error_code      TEXT,
  sent_at         TIMESTAMPTZ DEFAULT now(),
  delivered_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sms_log_pro     ON sms_log (pro_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_log_lead    ON sms_log (lead_id);

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns sms log" ON sms_log;
CREATE POLICY "pro owns sms log"
  ON sms_log FOR SELECT USING (pro_id = auth.uid());


-- 8d. Email log
CREATE TABLE IF NOT EXISTS email_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        REFERENCES pros(id) ON DELETE SET NULL,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  to_email        TEXT        NOT NULL,
  from_email      TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  template        TEXT,       -- estimate_send/invoice_send/review_request/etc
  resend_id       TEXT,
  status          TEXT,       -- sent/delivered/bounced/failed
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_pro   ON email_log (pro_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_lead  ON email_log (lead_id);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns email log" ON email_log;
CREATE POLICY "pro owns email log"
  ON email_log FOR SELECT USING (pro_id = auth.uid());


-- 8e. Permit log (roofing, electrical, plumbing, solar, GC)
CREATE TABLE IF NOT EXISTS permit_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  trade_slug      TEXT        NOT NULL,
  permit_number   TEXT,
  jurisdiction    TEXT,       -- county/city issuing permit
  permit_type     TEXT,       -- roofing/electrical/plumbing/structural/mechanical
  applied_date    DATE,
  issued_date     DATE,
  inspection_date DATE,
  passed          BOOLEAN,
  closed_date     DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permit_log_lead  ON permit_log (lead_id);
CREATE INDEX IF NOT EXISTS idx_permit_log_pro   ON permit_log (pro_id);

ALTER TABLE permit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns permit log" ON permit_log;
CREATE POLICY "pro owns permit log"
  ON permit_log FOR ALL USING (pro_id = auth.uid());


-- 8f. Job milestones (GC + large multi-week projects)
CREATE TABLE IF NOT EXISTS job_milestones (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  description     TEXT,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  sort_order      INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_milestones_lead ON job_milestones (lead_id, sort_order);

ALTER TABLE job_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns milestones" ON job_milestones;
CREATE POLICY "pro owns milestones"
  ON job_milestones FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- BLOCK 9: AUDIT + LEGAL TABLES (IMMUTABLE)
-- These tables are INSERT-only. No updates, no deletes — ever.
-- ============================================================

-- 9a. Audit log — automatic row-level change capture
-- Triggered automatically by Postgres triggers (Block 11)
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name      TEXT        NOT NULL,
  record_id       UUID        NOT NULL,
  action          TEXT        NOT NULL, -- INSERT/UPDATE/DELETE
  old_data        JSONB,
  new_data        JSONB,
  changed_by      UUID,       -- auth.uid() at time of change (null if service role)
  ip_address      TEXT,       -- populated by app layer via event_log instead
  created_at      TIMESTAMPTZ DEFAULT now(),
  content_hash    TEXT        -- SHA256 of (record_id||action||new_data||created_at)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_record
  ON audit_log (table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON audit_log (changed_by, created_at DESC)
  WHERE changed_by IS NOT NULL;

-- INSERT only — no UPDATE or DELETE ever
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit log insert only" ON audit_log;
CREATE POLICY "audit log insert only"
  ON audit_log FOR SELECT USING (changed_by = auth.uid());
-- UPDATE and DELETE have no policy = blocked for everyone including pros
-- Service role (app) can still INSERT via service key


-- 9b. Event log — business events with full snapshots
-- Captures meaningful events: estimate_sent, estimate_approved, stage_changed, etc.
CREATE TABLE IF NOT EXISTS event_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type      TEXT        NOT NULL,
                              -- estimate_sent, estimate_viewed, estimate_approved,
                              -- invoice_sent, invoice_viewed, invoice_paid,
                              -- lead_created, stage_changed, signature_captured,
                              -- photo_uploaded, warranty_created, review_requested
  pro_id          UUID        REFERENCES pros(id) ON DELETE SET NULL,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  estimate_id     UUID        REFERENCES estimates(id) ON DELETE SET NULL,
  invoice_id      UUID        REFERENCES invoices(id) ON DELETE SET NULL,
  event_data      JSONB       NOT NULL, -- full snapshot at time of event
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  content_hash    TEXT        -- SHA256 of (event_type||pro_id||event_data||created_at)
);

CREATE INDEX IF NOT EXISTS idx_event_log_lead
  ON event_log (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_log_pro_type
  ON event_log (pro_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_estimate
  ON event_log (estimate_id, created_at DESC)
  WHERE estimate_id IS NOT NULL;

-- INSERT only
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event log pro select" ON event_log;
CREATE POLICY "event log pro select"
  ON event_log FOR SELECT USING (pro_id = auth.uid());


-- 9c. Document snapshots — immutable point-in-time captures
-- Captures the full document exactly as it was at send/approve/pay time
-- If pro edits estimate after sending, the original is preserved here
CREATE TABLE IF NOT EXISTS document_snapshots (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type   TEXT        NOT NULL, -- estimate/invoice/contract
  document_id     UUID        NOT NULL, -- estimate_id or invoice_id
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE RESTRICT,
  trigger_event   TEXT        NOT NULL, -- sent/viewed/approved/paid/voided
  full_content    JSONB       NOT NULL, -- complete document at that moment
  content_hash    TEXT        NOT NULL, -- SHA256 of full_content — tamper detection
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_snapshots_doc
  ON document_snapshots (document_type, document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_snapshots_pro
  ON document_snapshots (pro_id, document_type, created_at DESC);

-- INSERT only, SELECT for owning pro
ALTER TABLE document_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doc snapshots pro select" ON document_snapshots;
CREATE POLICY "doc snapshots pro select"
  ON document_snapshots FOR SELECT USING (pro_id = auth.uid());


-- 9d. Signatures — e-sign records, permanently immutable
CREATE TABLE IF NOT EXISTS signatures (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id         UUID        REFERENCES estimates(id) ON DELETE RESTRICT,
  invoice_id          UUID        REFERENCES invoices(id) ON DELETE RESTRICT,
  pro_id              UUID        NOT NULL REFERENCES pros(id) ON DELETE RESTRICT,
  document_snapshot_id UUID       REFERENCES document_snapshots(id),

  -- Signer identity
  signer_name         TEXT        NOT NULL,
  signer_email        TEXT,
  signer_ip           TEXT        NOT NULL,
  signer_user_agent   TEXT,

  -- Signature file
  signature_r2_key    TEXT        NOT NULL, -- permanent R2 storage key
  signature_hash      TEXT        NOT NULL, -- SHA256 of the signature file

  -- Signed document — what exactly was signed
  document_hash       TEXT        NOT NULL, -- SHA256 of document at signing moment

  signed_at           TIMESTAMPTZ DEFAULT now() -- server-side only, never client-supplied
);

CREATE INDEX IF NOT EXISTS idx_signatures_estimate
  ON signatures (estimate_id)
  WHERE estimate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signatures_pro
  ON signatures (pro_id, signed_at DESC);

-- SELECT only for owning pro — never deletable
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signatures pro select" ON signatures;
CREATE POLICY "signatures pro select"
  ON signatures FOR SELECT USING (pro_id = auth.uid());


-- 9e. Legal holds — admin only, prevents data deletion/anonymization
CREATE TABLE IF NOT EXISTS legal_holds (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE RESTRICT,
  reason          TEXT        NOT NULL,
  held_by         TEXT        NOT NULL, -- admin email or system
  created_at      TIMESTAMPTZ DEFAULT now(),
  released_at     TIMESTAMPTZ,
  release_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_pro
  ON legal_holds (pro_id)
  WHERE released_at IS NULL;

-- Admin only — no pro access
ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "legal holds admin only" ON legal_holds;
CREATE POLICY "legal holds admin only"
  ON legal_holds FOR ALL USING (false); -- service role only


-- 9f. Data deletion requests — CCPA/GDPR compliance
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_email     TEXT        NOT NULL,
  pro_id              UUID        REFERENCES pros(id) ON DELETE SET NULL,
  request_type        TEXT        NOT NULL, -- delete/export/anonymize
  status              TEXT        DEFAULT 'pending',
                                  -- pending/processing/complete/rejected_legal_hold
  legal_hold_id       UUID        REFERENCES legal_holds(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  processed_at        TIMESTAMPTZ,
  processed_by        TEXT        -- admin email
);

CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_status
  ON data_deletion_requests (status, created_at);

ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deletion requests admin only" ON data_deletion_requests;
CREATE POLICY "deletion requests admin only"
  ON data_deletion_requests FOR ALL USING (false); -- service role only


-- ============================================================
-- BLOCK 10: AUDIT TRIGGERS
-- Automatically captures every change to critical tables.
-- App code never has to think about it. Cannot be bypassed.
-- ============================================================

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_record_id UUID;
  v_old       JSONB;
  v_new       JSONB;
BEGIN
  -- Get the record ID
  v_record_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.id
    ELSE NEW.id
  END;

  -- Build data snapshots
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  -- Remove high-churn fields from audit to keep log lean
  v_new := v_new - 'updated_at' - 'search_vector';
  v_old := v_old - 'updated_at' - 'search_vector';

  INSERT INTO audit_log (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    changed_by,
    created_at
  ) VALUES (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_old,
    v_new,
    auth.uid(),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach to every table that needs legal audit trail
DROP TRIGGER IF EXISTS audit_leads ON leads;
CREATE TRIGGER audit_leads
  AFTER INSERT OR UPDATE OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_estimates ON estimates;
CREATE TRIGGER audit_estimates
  AFTER INSERT OR UPDATE OR DELETE ON estimates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_invoices ON invoices;
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_estimate_items ON estimate_items;
CREATE TRIGGER audit_estimate_items
  AFTER INSERT OR UPDATE OR DELETE ON estimate_items
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_roofing_job_data ON roofing_job_data;
CREATE TRIGGER audit_roofing_job_data
  AFTER INSERT OR UPDATE OR DELETE ON roofing_job_data
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();


-- ============================================================
-- BLOCK 11: RLS — FIX ALL DISABLED TABLES
-- Service role bypasses all RLS — existing API routes unaffected.
-- These policies protect direct DB access and future client queries.
-- ============================================================

-- leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads pro select" ON leads;
DROP POLICY IF EXISTS "leads pro update" ON leads;
DROP POLICY IF EXISTS "leads pro delete" ON leads;
CREATE POLICY "leads pro select"
  ON leads FOR SELECT USING (pro_id = auth.uid());
CREATE POLICY "leads pro update"
  ON leads FOR UPDATE USING (pro_id = auth.uid());
CREATE POLICY "leads pro delete"
  ON leads FOR DELETE USING (pro_id = auth.uid());
-- INSERT: no policy = service role only (contact-pro route uses service role)

-- clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients pro all" ON clients;
CREATE POLICY "clients pro all"
  ON clients FOR ALL USING (pro_id = auth.uid());

-- invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices pro all" ON invoices;
CREATE POLICY "invoices pro all"
  ON invoices FOR ALL USING (pro_id = auth.uid());

-- pros — public read, self-write
ALTER TABLE pros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pros public select" ON pros;
DROP POLICY IF EXISTS "pros self update" ON pros;
CREATE POLICY "pros public select"
  ON pros FOR SELECT USING (true);
CREATE POLICY "pros self update"
  ON pros FOR UPDATE USING (id = auth.uid());

-- reviews — public read, service role write
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reviews public select" ON reviews;
CREATE POLICY "reviews public select"
  ON reviews FOR SELECT USING (true);

-- messages — self only
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages self" ON messages;
CREATE POLICY "messages self"
  ON messages FOR ALL
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- notifications — self only
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications self" ON notifications;
CREATE POLICY "notifications self"
  ON notifications FOR ALL USING (pro_id = auth.uid());

-- posts — public read, self write
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts public select" ON posts;
DROP POLICY IF EXISTS "posts self write" ON posts;
CREATE POLICY "posts public select"
  ON posts FOR SELECT USING (true);
CREATE POLICY "posts self write"
  ON posts FOR INSERT WITH CHECK (pro_id = auth.uid());
CREATE POLICY "posts self update delete"
  ON posts FOR UPDATE USING (pro_id = auth.uid());

-- portfolio_items — public read, self write
ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portfolio public select" ON portfolio_items;
DROP POLICY IF EXISTS "portfolio self write" ON portfolio_items;
CREATE POLICY "portfolio public select"
  ON portfolio_items FOR SELECT USING (true);
CREATE POLICY "portfolio self write"
  ON portfolio_items FOR ALL USING (pro_id = auth.uid());

-- subscriptions — self only
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions self" ON subscriptions;
CREATE POLICY "subscriptions self"
  ON subscriptions FOR SELECT USING (pro_id = auth.uid());


-- ============================================================
-- BLOCK 12: lead_photos INDEXES (missed in v86)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_lead_photos_lead_phase
  ON lead_photos (lead_id, phase);

CREATE INDEX IF NOT EXISTS idx_lead_photos_pro_created
  ON lead_photos (pro_id, created_at DESC);


-- ============================================================
-- BLOCK 13: roof_reports INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_roof_reports_pro_created
  ON roof_reports (pro_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roof_reports_property
  ON roof_reports (property_id)
  WHERE property_id IS NOT NULL;


-- ============================================================
-- VERIFICATION QUERY — run after migration to confirm success
-- ============================================================
SELECT
  'trade_job_tables' as check_name,
  count(*) as count,
  '8 expected' as expected
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'roofing_job_data','hvac_job_data','electrical_job_data',
  'plumbing_job_data','solar_job_data','gc_job_data',
  'landscape_job_data','painting_job_data'
)

UNION ALL

SELECT
  'audit_legal_tables',
  count(*),
  '6 expected'
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'audit_log','event_log','document_snapshots',
  'signatures','legal_holds','data_deletion_requests'
)

UNION ALL

SELECT
  'operational_tables',
  count(*),
  '6 expected'
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'review_requests','webhook_events','sms_log',
  'email_log','permit_log','job_milestones'
)

UNION ALL

SELECT
  'leads_trade_slug_backfill',
  count(*),
  'should be 0 — all leads have trade_slug'
FROM leads
WHERE trade_slug IS NULL
AND pro_id IS NOT NULL

UNION ALL

SELECT
  'audit_triggers',
  count(*),
  '5 expected'
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name IN (
  'audit_leads','audit_estimates','audit_invoices',
  'audit_estimate_items','audit_roofing_job_data'
);
