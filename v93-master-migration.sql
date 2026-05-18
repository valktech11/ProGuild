-- ============================================================
-- ProGuild.ai — MASTER MIGRATION (v91 + v92 + property_address)
-- Single file. Run STAGING first → verify → then PRODUCTION.
-- Safe to re-run — all statements use IF NOT EXISTS guards.
--
-- WHAT IS IN THIS FILE (all ~134 tables/objects):
--   Block 0   Migration tracking table
--   Block 1   leads fixes + property_address (THE KEY FIX — was missing from v91/v92)
--   Block 2-6 estimates, invoices, pros, properties, hvac_equipment fixes
--   Block 7   8 trade job data tables (roofing/hvac/electrical/plumbing/solar/gc/landscape/painting)
--   Block 8   pipeline_events (event sourcing, immutable)
--   Block 9   5 audit/legal tables (audit_log, document_snapshots, signatures, legal_holds, data_deletion)
--   Block 10  10 identity/auth tables (pro_sessions, login_events, account_security, etc.)
--   Block 11  Platform config (feature_flags, usage_metrics, pii_vault, tenant_config)
--   Block 12  API layer (api_keys, api_requests_log, webhooks, webhook_deliveries)
--   Block 13  13 operational tables (job_queue, review_requests, sms_log, email_log, etc.)
--   Block 14  13 community tables (post_reactions, channels, conversations, pro_reputation, etc.)
--   Block 15  Audit triggers (6 tables auto-audited)
--   Block 16  RLS policies on all tables
--   Block 17  Additional indexes
--   Domain 1  Support (5 tables)
--   Domain 2  Communication / automation (6 tables)
--   Domain 3  Scheduling (6 tables)
--   Domain 4  Financial (8 tables + FL tax rates seeded)
--   Domain 5  Field ops (2 tables)
--   Domain 6  Compliance (1 table)
--   Domain 7  Marketplace (5 tables)
--   Domain 8  Analytics (2 tables)
--   Domain 9  Integrations (2 tables)
--   Domain 10 SEO & content (3 tables)
--   Final     lead_status + lead_source constraint fixes
--   Final     Master verification query (run after to confirm all counts)
--
-- RUN ORDER: This file only. Skip original v90/v91/v92 files.
-- ============================================================

-- ============================================================
-- ProGuild.ai — v91 DEFINITIVE MASTER SCHEMA MIGRATION
-- Covers: v90 + Identity + Community Redesign + Event Sourcing
--         + API Layer + Platform Infrastructure
-- Run on STAGING first. Verify. Then PRODUCTION.
-- Safe to re-run — all statements use IF NOT EXISTS guards.
-- Generated: May 2026
-- ============================================================
-- NOTE: All app API routes use SUPABASE_SERVICE_ROLE_KEY which
-- bypasses RLS entirely. RLS policies protect direct DB access
-- and future client-side queries only.
-- ============================================================


-- ============================================================
-- BLOCK 0: SCHEMA MIGRATION TRACKING
-- Every migration ever run is recorded here.
-- Prevents double-runs. Source of truth for what is deployed.
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  version         TEXT        NOT NULL UNIQUE,  -- 'v91'
  description     TEXT        NOT NULL,
  checksum        TEXT,       -- SHA256 of this file for tamper detection
  applied_at      TIMESTAMPTZ DEFAULT now(),
  applied_by      TEXT        DEFAULT 'system'
);

INSERT INTO schema_migrations (version, description)
VALUES 
  ('v91', 'Definitive master schema: identity, community redesign, event sourcing, API layer, platform infrastructure'),
  ('property_address', 'property_address column on leads — was missing from v91/v92')
ON CONFLICT (version) DO NOTHING;


-- ============================================================
-- BLOCK 1: FIX leads TABLE
-- ============================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS property_address TEXT,
  ADD COLUMN IF NOT EXISTS trade_slug       TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ DEFAULT NULL;

-- Ensure updated_at exists
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT now();

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
  ON leads (pro_id, lead_status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_pro_updated
  ON leads (pro_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_pro_created
  ON leads (pro_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_trade_pro
  ON leads (trade_slug, pro_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_property
  ON leads (property_id) WHERE property_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_client
  ON leads (client_id) WHERE client_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_contact_name_fts
  ON leads USING gin(to_tsvector('english', coalesce(contact_name, '')));


-- ============================================================
-- BLOCK 2: FIX estimates TABLE
-- ============================================================

-- Drop duplicate column (tiered_data from v82 is canonical)
ALTER TABLE estimates DROP COLUMN IF EXISTS tiers;

CREATE INDEX IF NOT EXISTS idx_estimates_pro_status
  ON estimates (pro_id, status);

CREATE INDEX IF NOT EXISTS idx_estimates_pro_created
  ON estimates (pro_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_estimates_lead
  ON estimates (lead_id) WHERE lead_id IS NOT NULL;


-- ============================================================
-- BLOCK 3: FIX invoices TABLE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_invoices_pro_status
  ON invoices (pro_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_pro_created
  ON invoices (pro_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_lead
  ON invoices (lead_id) WHERE lead_id IS NOT NULL;


-- ============================================================
-- BLOCK 4: FIX pros TABLE
-- ============================================================

ALTER TABLE pros
  ADD COLUMN IF NOT EXISTS trade_slug      TEXT,
  ADD COLUMN IF NOT EXISTS google_id       TEXT,
  ADD COLUMN IF NOT EXISTS apple_id        TEXT,
  ADD COLUMN IF NOT EXISTS search_vector   TSVECTOR;

-- Backfill trade_slug
UPDATE pros p
SET    trade_slug = tc.slug
FROM   trade_categories tc
WHERE  tc.id       = p.trade_category_id
AND    p.trade_slug IS NULL;

-- Build full-text search vector
UPDATE pros SET search_vector =
  to_tsvector('english',
    coalesce(full_name, '')     || ' ' ||
    coalesce(business_name, '') || ' ' ||
    coalesce(city, '')          || ' ' ||
    coalesce(trade_slug, '')
  )
WHERE search_vector IS NULL;

-- Auto-update search vector on change
CREATE OR REPLACE FUNCTION pros_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.full_name, '')     || ' ' ||
    coalesce(NEW.business_name, '') || ' ' ||
    coalesce(NEW.city, '')          || ' ' ||
    coalesce(NEW.trade_slug, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pros_search_vector ON pros;
CREATE TRIGGER trg_pros_search_vector
  BEFORE INSERT OR UPDATE ON pros
  FOR EACH ROW EXECUTE FUNCTION pros_search_vector_update();

CREATE INDEX IF NOT EXISTS idx_pros_search_fts
  ON pros USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_pros_trade_city
  ON pros (trade_slug, city) WHERE is_claimed = true;

CREATE INDEX IF NOT EXISTS idx_pros_slug
  ON pros (slug) WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pros_claimed_trade
  ON pros (is_claimed, trade_slug);


-- ============================================================
-- BLOCK 5: FIX properties TABLE
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS lat           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS hoa           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS property_type TEXT    DEFAULT 'residential',
  ADD COLUMN IF NOT EXISTS client_id     UUID    REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_pro
  ON properties (pro_id);

CREATE INDEX IF NOT EXISTS idx_properties_address
  ON properties (address_line1, zip_code);

CREATE INDEX IF NOT EXISTS idx_properties_client
  ON properties (client_id) WHERE client_id IS NOT NULL;


-- ============================================================
-- BLOCK 6: FIX hvac_equipment TABLE
-- ============================================================

ALTER TABLE hvac_equipment
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hvac_equipment_property
  ON hvac_equipment (property_id) WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hvac_equipment_pro
  ON hvac_equipment (pro_id);


-- ============================================================
-- BLOCK 7: TRADE JOB DATA TABLES
-- One row per lead per trade. leads table never changes for
-- trade-specific reasons again. trade_slug determines join.
-- ============================================================

-- 7a. ROOFING
CREATE TABLE IF NOT EXISTS roofing_job_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
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
  roof_type             TEXT,
  square_count          NUMERIC,
  pitch                 TEXT,
  waste_pct             NUMERIC     DEFAULT 10,
  layers                INTEGER     DEFAULT 1,
  decking_replacement   BOOLEAN     DEFAULT FALSE,
  permit_number         TEXT,
  permit_status         TEXT,
  shingle_brand         TEXT,
  shingle_model         TEXT,
  warranty_term         TEXT,
  install_date          DATE,
  warranty_expiry       TEXT,
  custom_fields         JSONB,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roofing_job_data_lead ON roofing_job_data (lead_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_data_pro  ON roofing_job_data (pro_id);
ALTER TABLE roofing_job_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns roofing job data" ON roofing_job_data;
CREATE POLICY "pro owns roofing job data"
  ON roofing_job_data FOR ALL USING (pro_id = auth.uid());

-- 7b. HVAC
CREATE TABLE IF NOT EXISTS hvac_job_data (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  system_type           TEXT,
  issue_type            TEXT,
  refrigerant_type      TEXT,
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
  job_type              TEXT,
  panel_brand           TEXT,
  panel_amps            INTEGER,
  panel_age_years       INTEGER,
  breaker_count         INTEGER,
  voltage               INTEGER,
  permit_number         TEXT,
  permit_status         TEXT,
  inspection_date       DATE,
  inspection_passed     BOOLEAN,
  code_notes            TEXT,
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
  job_type              TEXT,
  fixture_type          TEXT,
  pipe_material         TEXT,
  water_heater_type     TEXT,
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
  job_type              TEXT,
  panel_count           INTEGER,
  panel_brand           TEXT,
  panel_model           TEXT,
  system_kw             NUMERIC,
  inverter_brand        TEXT,
  inverter_type         TEXT,
  battery_included      BOOLEAN     DEFAULT FALSE,
  battery_brand         TEXT,
  battery_kwh           NUMERIC,
  roof_type             TEXT,
  permit_number         TEXT,
  permit_status         TEXT,
  utility_approval      BOOLEAN     DEFAULT FALSE,
  interconnect_date     DATE,
  estimated_offset_pct  NUMERIC,
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
  project_type          TEXT,
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
  job_type              TEXT,
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
  id                     UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id                UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                 UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  job_type               TEXT,
  surface_sqft           NUMERIC,
  story_count            INTEGER     DEFAULT 1,
  paint_brand            TEXT,
  paint_finish           TEXT,
  coat_count             INTEGER     DEFAULT 2,
  primer_required        BOOLEAN     DEFAULT FALSE,
  pressure_wash_included BOOLEAN     DEFAULT FALSE,
  color_count            INTEGER     DEFAULT 1,
  hoa_approval_required  BOOLEAN     DEFAULT FALSE,
  custom_fields          JSONB,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_painting_job_data_lead ON painting_job_data (lead_id);
CREATE INDEX IF NOT EXISTS idx_painting_job_data_pro  ON painting_job_data (pro_id);
ALTER TABLE painting_job_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns painting job data" ON painting_job_data;
CREATE POLICY "pro owns painting job data"
  ON painting_job_data FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- BLOCK 8: EVENT SOURCING — pipeline_events
-- The immutable timeline of every business event.
-- leads.lead_status is a cached projection of the latest event.
-- This table IS the audit trail AND the migration path to any DB.
-- Replay these events into MongoDB/CockroachDB/DynamoDB = migration done.
-- ============================================================

CREATE TABLE IF NOT EXISTS pipeline_events (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type      TEXT        NOT NULL,
  -- Core event types:
  -- lead_created, lead_updated, lead_deleted
  -- stage_changed (from, to)
  -- estimate_sent, estimate_viewed, estimate_approved, estimate_declined
  -- invoice_sent, invoice_viewed, invoice_paid
  -- signature_captured
  -- photo_uploaded
  -- warranty_created
  -- review_requested, review_received
  -- note_added
  -- call_logged
  -- sms_sent, sms_received
  -- job_data_updated

  pro_id          UUID        REFERENCES pros(id) ON DELETE SET NULL,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  estimate_id     UUID        REFERENCES estimates(id) ON DELETE SET NULL,
  invoice_id      UUID        REFERENCES invoices(id) ON DELETE SET NULL,
  trade_slug      TEXT,

  -- Full event snapshot — self-contained, queryable, portable
  event_data      JSONB       NOT NULL DEFAULT '{}',
  -- Examples:
  -- stage_changed:  {from: 'lead_in', to: 'proposal_sent', reason: null}
  -- estimate_sent:  {amount: 18500, items: [...], sent_to: 'email'}
  -- signature:      {signer_name, signer_ip, signature_hash, document_hash}

  -- Request context — captures who, where, how
  actor_id        UUID,       -- pro_id who triggered (null if system/homeowner)
  actor_type      TEXT        DEFAULT 'pro', -- pro/system/homeowner/admin
  ip_address      TEXT,
  user_agent      TEXT,

  -- Immutability chain
  created_at      TIMESTAMPTZ DEFAULT now(),
  content_hash    TEXT        -- SHA256(event_type||lead_id||event_data||created_at)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_lead
  ON pipeline_events (lead_id, created_at DESC) WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_events_pro_type
  ON pipeline_events (pro_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_type_created
  ON pipeline_events (event_type, created_at DESC);

-- INSERT only — no UPDATE or DELETE via RLS
ALTER TABLE pipeline_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pipeline events pro select" ON pipeline_events;
CREATE POLICY "pipeline events pro select"
  ON pipeline_events FOR SELECT USING (pro_id = auth.uid());


-- ============================================================
-- BLOCK 9: AUDIT + LEGAL TABLES (IMMUTABLE)
-- ============================================================

-- 9a. Audit log — automatic row-level change capture via triggers
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name      TEXT        NOT NULL,
  record_id       UUID        NOT NULL,
  action          TEXT        NOT NULL, -- INSERT/UPDATE/DELETE
  old_data        JSONB,
  new_data        JSONB,
  changed_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  content_hash    TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_record
  ON audit_log (table_name, record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON audit_log (changed_by, created_at DESC) WHERE changed_by IS NOT NULL;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit log pro select" ON audit_log;
CREATE POLICY "audit log pro select"
  ON audit_log FOR SELECT USING (changed_by = auth.uid());

-- 9b. Document snapshots — immutable point-in-time captures
CREATE TABLE IF NOT EXISTS document_snapshots (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type   TEXT        NOT NULL, -- estimate/invoice/contract
  document_id     UUID        NOT NULL,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE RESTRICT,
  trigger_event   TEXT        NOT NULL, -- sent/viewed/approved/paid/voided
  full_content    JSONB       NOT NULL,
  content_hash    TEXT        NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_snapshots_doc
  ON document_snapshots (document_type, document_id, created_at DESC);

ALTER TABLE document_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doc snapshots pro select" ON document_snapshots;
CREATE POLICY "doc snapshots pro select"
  ON document_snapshots FOR SELECT USING (pro_id = auth.uid());

-- 9c. Signatures — e-sign records, permanently immutable
CREATE TABLE IF NOT EXISTS signatures (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id          UUID        REFERENCES estimates(id) ON DELETE RESTRICT,
  invoice_id           UUID        REFERENCES invoices(id) ON DELETE RESTRICT,
  pro_id               UUID        NOT NULL REFERENCES pros(id) ON DELETE RESTRICT,
  document_snapshot_id UUID        REFERENCES document_snapshots(id),
  signer_name          TEXT        NOT NULL,
  signer_email         TEXT,
  signer_ip            TEXT        NOT NULL,
  signer_user_agent    TEXT,
  signature_r2_key     TEXT        NOT NULL,
  signature_hash       TEXT        NOT NULL,
  document_hash        TEXT        NOT NULL,
  signed_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signatures_estimate
  ON signatures (estimate_id) WHERE estimate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signatures_pro
  ON signatures (pro_id, signed_at DESC);

ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signatures pro select" ON signatures;
CREATE POLICY "signatures pro select"
  ON signatures FOR SELECT USING (pro_id = auth.uid());

-- 9d. Legal holds
CREATE TABLE IF NOT EXISTS legal_holds (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE RESTRICT,
  reason          TEXT        NOT NULL,
  held_by         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  released_at     TIMESTAMPTZ,
  release_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_pro
  ON legal_holds (pro_id) WHERE released_at IS NULL;

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "legal holds admin only" ON legal_holds;
CREATE POLICY "legal holds admin only"
  ON legal_holds FOR ALL USING (false);

-- 9e. Data deletion requests — CCPA/GDPR
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_email TEXT        NOT NULL,
  pro_id          UUID        REFERENCES pros(id) ON DELETE SET NULL,
  request_type    TEXT        NOT NULL, -- delete/export/anonymize
  status          TEXT        DEFAULT 'pending',
  legal_hold_id   UUID        REFERENCES legal_holds(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  processed_by    TEXT
);

ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deletion requests admin only" ON data_deletion_requests;
CREATE POLICY "deletion requests admin only"
  ON data_deletion_requests FOR ALL USING (false);


-- ============================================================
-- BLOCK 10: IDENTITY & AUTHENTICATION TABLES
-- ============================================================

-- 10a. Active sessions — device tracking
CREATE TABLE IF NOT EXISTS pro_sessions (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id              UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  supabase_session_id TEXT,
  device_type         TEXT,       -- desktop/mobile/tablet
  device_name         TEXT,       -- "iPhone 15 Pro"
  browser             TEXT,
  os                  TEXT,
  ip_address          TEXT,
  city                TEXT,
  country             TEXT,
  is_mobile_app       BOOLEAN     DEFAULT FALSE,
  is_trusted          BOOLEAN     DEFAULT FALSE,
  last_active_at      TIMESTAMPTZ DEFAULT now(),
  created_at          TIMESTAMPTZ DEFAULT now(),
  revoked_at          TIMESTAMPTZ,
  revoke_reason       TEXT
);

CREATE INDEX IF NOT EXISTS idx_pro_sessions_pro_active
  ON pro_sessions (pro_id, last_active_at DESC) WHERE revoked_at IS NULL;

ALTER TABLE pro_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro owns sessions" ON pro_sessions;
CREATE POLICY "pro owns sessions"
  ON pro_sessions FOR ALL USING (pro_id = auth.uid());

-- 10b. Login events — IMMUTABLE audit of every auth event
CREATE TABLE IF NOT EXISTS login_events (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id              UUID        REFERENCES pros(id) ON DELETE SET NULL,
  email               TEXT,
  event_type          TEXT        NOT NULL,
  -- login_success/login_failed/logout/password_reset_requested/
  -- password_reset_complete/mfa_success/mfa_failed/session_revoked/
  -- magic_link_sent/magic_link_used/oauth_login/account_locked/
  -- account_unlocked/suspicious_login_flagged
  auth_method         TEXT,       -- password/magic_link/google/apple/sms_otp/totp/biometric
  ip_address          TEXT        NOT NULL,
  user_agent          TEXT,
  device_fingerprint  TEXT,
  city                TEXT,
  country             TEXT,
  session_id          UUID        REFERENCES pro_sessions(id),
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  content_hash        TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_events_pro
  ON login_events (pro_id, created_at DESC) WHERE pro_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_login_events_ip
  ON login_events (ip_address, created_at DESC);

ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "login events pro select" ON login_events;
CREATE POLICY "login events pro select"
  ON login_events FOR SELECT USING (pro_id = auth.uid());

-- 10c. Account security — lockout, MFA config
CREATE TABLE IF NOT EXISTS account_security (
  id                        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id                    UUID        UNIQUE NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  password_changed_at       TIMESTAMPTZ,
  password_hash_history     JSONB       DEFAULT '[]',
  failed_login_count        INTEGER     DEFAULT 0,
  locked_until              TIMESTAMPTZ,
  locked_reason             TEXT,
  last_failed_at            TIMESTAMPTZ,
  mfa_enabled               BOOLEAN     DEFAULT FALSE,
  mfa_method                TEXT,
  totp_secret_encrypted     TEXT,
  backup_codes_hash         JSONB,
  mfa_enabled_at            TIMESTAMPTZ,
  suspicious_flag           BOOLEAN     DEFAULT FALSE,
  suspicious_flagged_at     TIMESTAMPTZ,
  suspicious_reason         TEXT,
  last_login_at             TIMESTAMPTZ,
  last_login_ip             TEXT,
  last_login_device         TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE account_security ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account security self" ON account_security;
CREATE POLICY "account security self"
  ON account_security FOR ALL USING (pro_id = auth.uid());

-- 10d. Trusted devices — skip MFA for 30 days
CREATE TABLE IF NOT EXISTS trusted_devices (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id              UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  device_fingerprint  TEXT        NOT NULL,
  device_name         TEXT,
  trusted_at          TIMESTAMPTZ DEFAULT now(),
  expires_at          TIMESTAMPTZ,
  last_used_at        TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_pro
  ON trusted_devices (pro_id, device_fingerprint) WHERE revoked_at IS NULL;

ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trusted devices self" ON trusted_devices;
CREATE POLICY "trusted devices self"
  ON trusted_devices FOR ALL USING (pro_id = auth.uid());

-- 10e. Password reset tokens — hashed, single-use, 1-hour expiry
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  token_hash      TEXT        NOT NULL, -- SHA-256 of raw token, never store raw
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  ip_requested    TEXT,
  ip_used         TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
  ON password_reset_tokens (token_hash) WHERE used_at IS NULL;

-- 10f. Legal acceptances — IMMUTABLE T&C tracking
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id            UUID        REFERENCES pros(id) ON DELETE SET NULL,
  homeowner_email   TEXT,
  document_type     TEXT        NOT NULL,
  -- terms_of_service/privacy_policy/data_processing_agreement/
  -- electronic_signature_consent/sms_marketing_consent/
  -- contractor_service_agreement
  document_version  TEXT        NOT NULL,
  document_hash     TEXT        NOT NULL,
  accepted_at       TIMESTAMPTZ DEFAULT now(),
  ip_address        TEXT        NOT NULL,
  user_agent        TEXT,
  acceptance_method TEXT,       -- checkbox/click/signature
  forced_re_accept  BOOLEAN     DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_pro
  ON legal_acceptances (pro_id, document_type, accepted_at DESC) WHERE pro_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_homeowner
  ON legal_acceptances (homeowner_email, document_type) WHERE homeowner_email IS NOT NULL;

ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "legal acceptances pro select" ON legal_acceptances;
CREATE POLICY "legal acceptances pro select"
  ON legal_acceptances FOR SELECT USING (pro_id = auth.uid());

-- 10g. Legal documents — version registry
CREATE TABLE IF NOT EXISTS legal_documents (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type       TEXT        NOT NULL,
  version             TEXT        NOT NULL,
  content_hash        TEXT        NOT NULL,
  effective_date      DATE        NOT NULL,
  requires_re_accept  BOOLEAN     DEFAULT FALSE,
  r2_key              TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (document_type, version)
);

-- 10h. Admin roles — RBAC replacing is_admin boolean
CREATE TABLE IF NOT EXISTS admin_roles (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        UNIQUE NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL, -- super_admin/admin/support/analyst/readonly
  permissions     JSONB       DEFAULT '{}',
  granted_by      UUID        REFERENCES pros(id),
  granted_at      TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  revoke_reason   TEXT,
  notes           TEXT
);

ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin roles admin only" ON admin_roles;
CREATE POLICY "admin roles admin only"
  ON admin_roles FOR ALL USING (false);

-- 10i. Admin actions — IMMUTABLE audit of every admin action
CREATE TABLE IF NOT EXISTS admin_actions (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id          UUID        NOT NULL,
  action_type       TEXT        NOT NULL,
  target_pro_id     UUID,
  target_table      TEXT,
  target_record_id  UUID,
  details           JSONB,
  ip_address        TEXT        NOT NULL,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  content_hash      TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin
  ON admin_actions (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_target
  ON admin_actions (target_pro_id, created_at DESC) WHERE target_pro_id IS NOT NULL;

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin actions admin only" ON admin_actions;
CREATE POLICY "admin actions admin only"
  ON admin_actions FOR ALL USING (false);


-- ============================================================
-- BLOCK 11: PLATFORM CONFIGURATION TABLES
-- ============================================================

-- 11a. Per-pro settings — replaces scattered columns on pros
CREATE TABLE IF NOT EXISTS tenant_config (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        UNIQUE NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  features        JSONB       DEFAULT '{}',
  crm_prefs       JSONB       DEFAULT '{}',
  notifications   JSONB       DEFAULT '{}',
  integrations    JSONB       DEFAULT '{}',
  branding        JSONB       DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant config self" ON tenant_config;
CREATE POLICY "tenant config self"
  ON tenant_config FOR ALL USING (pro_id = auth.uid());

-- 11b. Feature flags — gradual rollout control
CREATE TABLE IF NOT EXISTS feature_flags (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  flag_key          TEXT        UNIQUE NOT NULL,
  description       TEXT,
  enabled_globally  BOOLEAN     DEFAULT FALSE,
  enabled_for_plans TEXT[]      DEFAULT '{}',
  rollout_pct       INTEGER     DEFAULT 0,
  override_pro_ids  UUID[]      DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags (flag_key);

-- 11c. Usage metrics — daily aggregates per pro
CREATE TABLE IF NOT EXISTS usage_metrics (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id            UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  date              DATE        NOT NULL,
  leads_created     INTEGER     DEFAULT 0,
  estimates_sent    INTEGER     DEFAULT 0,
  invoices_sent     INTEGER     DEFAULT 0,
  satellite_reports INTEGER     DEFAULT 0,
  ai_calls          INTEGER     DEFAULT 0,
  photos_uploaded   INTEGER     DEFAULT 0,
  sms_sent          INTEGER     DEFAULT 0,
  emails_sent       INTEGER     DEFAULT 0,
  api_requests      INTEGER     DEFAULT 0,
  r2_bytes_stored   BIGINT      DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pro_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_pro_date
  ON usage_metrics (pro_id, date DESC);

ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usage metrics self" ON usage_metrics;
CREATE POLICY "usage metrics self"
  ON usage_metrics FOR SELECT USING (pro_id = auth.uid());

-- 11d. PII vault — tokenized PII for CCPA compliance
-- All other tables store the token, not the raw PII
-- Deletion = delete vault row. Financial records stay intact.
CREATE TABLE IF NOT EXISTS pii_vault (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  token           TEXT        UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  name_encrypted  TEXT,       -- AES-256 encrypted
  email_encrypted TEXT,
  phone_encrypted TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ -- soft delete for CCPA
);

CREATE INDEX IF NOT EXISTS idx_pii_vault_token ON pii_vault (token);

-- Service role only — no pro-level access
ALTER TABLE pii_vault ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pii vault admin only" ON pii_vault;
CREATE POLICY "pii vault admin only"
  ON pii_vault FOR ALL USING (false);


-- ============================================================
-- BLOCK 12: API LAYER TABLES
-- For the open CRM API — pros and third-party integrations
-- ============================================================

-- 12a. API keys — pgk_live_xxx format
CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  key_prefix      TEXT        NOT NULL,  -- first 8 chars of key for display
  key_hash        TEXT        NOT NULL UNIQUE, -- SHA-256 of full key
  scopes          TEXT[]      DEFAULT '{}',
  -- leads:read, leads:write, estimates:read, invoices:read, webhooks
  environment     TEXT        DEFAULT 'live', -- live/test
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_pro
  ON api_keys (pro_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
  ON api_keys (key_hash) WHERE revoked_at IS NULL;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api keys self" ON api_keys;
CREATE POLICY "api keys self"
  ON api_keys FOR ALL USING (pro_id = auth.uid());

-- 12b. API requests log — rate limiting + billing
CREATE TABLE IF NOT EXISTS api_requests_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id      UUID        NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  endpoint        TEXT        NOT NULL,
  method          TEXT        NOT NULL,
  status_code     INTEGER,
  duration_ms     INTEGER,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_requests_key_created
  ON api_requests_log (api_key_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_requests_pro_created
  ON api_requests_log (pro_id, created_at DESC);

-- 12c. Webhooks — pro-registered endpoints
CREATE TABLE IF NOT EXISTS webhooks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  url             TEXT        NOT NULL,
  events          TEXT[]      NOT NULL DEFAULT '{}',
  -- lead.created, estimate.approved, invoice.paid, stage.changed, review.received
  secret_hash     TEXT        NOT NULL, -- HMAC secret for signature verification
  is_active       BOOLEAN     DEFAULT TRUE,
  failure_count   INTEGER     DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_pro
  ON webhooks (pro_id) WHERE is_active = TRUE;

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhooks self" ON webhooks;
CREATE POLICY "webhooks self"
  ON webhooks FOR ALL USING (pro_id = auth.uid());

-- 12d. Webhook deliveries — delivery log with retry
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id      UUID        NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  status_code     INTEGER,
  response_body   TEXT,
  attempts        INTEGER     DEFAULT 0,
  next_retry_at   TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
  ON webhook_deliveries (webhook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries (next_retry_at) WHERE delivered_at IS NULL;


-- ============================================================
-- BLOCK 13: OPERATIONAL TABLES
-- ============================================================

-- 13a. Job queue — replaces narrow lead_trigger_log
CREATE TABLE IF NOT EXISTS job_queue (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type        TEXT        NOT NULL,
  -- email_send, sms_send, webhook_deliver, review_request,
  -- usage_aggregate, backup_run, report_generate
  payload         JSONB       NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'pending',
  priority        INTEGER     DEFAULT 5, -- 1=highest, 10=lowest
  attempts        INTEGER     DEFAULT 0,
  max_attempts    INTEGER     DEFAULT 3,
  next_retry_at   TIMESTAMPTZ DEFAULT now(),
  error           TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_pending
  ON job_queue (priority, next_retry_at)
  WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_job_queue_type
  ON job_queue (job_type, status);

-- 13b. Review requests
CREATE TABLE IF NOT EXISTS review_requests (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  homeowner_name  TEXT,
  homeowner_email TEXT,
  homeowner_phone TEXT,
  status          TEXT        DEFAULT 'pending',
  rating          INTEGER,
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

ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "review requests self" ON review_requests;
CREATE POLICY "review requests self"
  ON review_requests FOR ALL USING (pro_id = auth.uid());

-- 13c. Webhook events — raw inbound (Stripe, Twilio)
CREATE TABLE IF NOT EXISTS webhook_events (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  source          TEXT        NOT NULL,
  event_type      TEXT        NOT NULL,
  event_id        TEXT        UNIQUE,
  payload         JSONB       NOT NULL,
  processed       BOOLEAN     DEFAULT FALSE,
  processed_at    TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_pending
  ON webhook_events (source, event_type, created_at)
  WHERE processed = FALSE;

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhook events admin only" ON webhook_events;
CREATE POLICY "webhook events admin only"
  ON webhook_events FOR ALL USING (false);

-- 13d. SMS log
CREATE TABLE IF NOT EXISTS sms_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        REFERENCES pros(id) ON DELETE SET NULL,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  direction       TEXT        NOT NULL,
  to_phone        TEXT        NOT NULL,
  from_phone      TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  twilio_sid      TEXT,
  status          TEXT,
  error_code      TEXT,
  sent_at         TIMESTAMPTZ DEFAULT now(),
  delivered_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sms_log_pro   ON sms_log (pro_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_log_lead  ON sms_log (lead_id);

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms log self" ON sms_log;
CREATE POLICY "sms log self"
  ON sms_log FOR SELECT USING (pro_id = auth.uid());

-- 13e. Email log
CREATE TABLE IF NOT EXISTS email_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        REFERENCES pros(id) ON DELETE SET NULL,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  to_email        TEXT        NOT NULL,
  from_email      TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  template        TEXT,
  resend_id       TEXT,
  status          TEXT,
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_pro  ON email_log (pro_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_lead ON email_log (lead_id);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email log self" ON email_log;
CREATE POLICY "email log self"
  ON email_log FOR SELECT USING (pro_id = auth.uid());

-- 13f. Permit log
CREATE TABLE IF NOT EXISTS permit_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  trade_slug      TEXT        NOT NULL,
  permit_number   TEXT,
  jurisdiction    TEXT,
  permit_type     TEXT,
  applied_date    DATE,
  issued_date     DATE,
  inspection_date DATE,
  passed          BOOLEAN,
  closed_date     DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permit_log_lead ON permit_log (lead_id);
CREATE INDEX IF NOT EXISTS idx_permit_log_pro  ON permit_log (pro_id);

ALTER TABLE permit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "permit log self" ON permit_log;
CREATE POLICY "permit log self"
  ON permit_log FOR ALL USING (pro_id = auth.uid());

-- 13g. Lien waivers — FL specific (statute 713.20)
CREATE TABLE IF NOT EXISTS lien_waivers (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  waiver_type     TEXT        NOT NULL,
  -- conditional_partial/conditional_final/unconditional_partial/unconditional_final
  status          TEXT        DEFAULT 'draft', -- draft/sent/signed/recorded
  amount          NUMERIC,
  through_date    DATE,
  signed_at       TIMESTAMPTZ,
  r2_key          TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lien_waivers_lead ON lien_waivers (lead_id);
CREATE INDEX IF NOT EXISTS idx_lien_waivers_pro  ON lien_waivers (pro_id, status);

ALTER TABLE lien_waivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lien waivers self" ON lien_waivers;
CREATE POLICY "lien waivers self"
  ON lien_waivers FOR ALL USING (pro_id = auth.uid());

-- 13h. Abuse reports — rate limiting + threat detection
CREATE TABLE IF NOT EXISTS abuse_reports (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address      TEXT        NOT NULL,
  endpoint        TEXT        NOT NULL,
  request_count   INTEGER     DEFAULT 1,
  window_start    TIMESTAMPTZ DEFAULT now(),
  blocked_until   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abuse_reports_ip
  ON abuse_reports (ip_address, window_start DESC);

-- 13i. Homeowner portals — job status URL
CREATE TABLE IF NOT EXISTS homeowner_portals (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  token           TEXT        NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  last_viewed_at  TIMESTAMPTZ,
  view_count      INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_portals_token
  ON homeowner_portals (token);

-- 13j. Job milestones
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

CREATE INDEX IF NOT EXISTS idx_job_milestones_lead
  ON job_milestones (lead_id, sort_order);

ALTER TABLE job_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "milestones self" ON job_milestones;
CREATE POLICY "milestones self"
  ON job_milestones FOR ALL USING (pro_id = auth.uid());

-- 13k. Daily logs / site journal
CREATE TABLE IF NOT EXISTS daily_logs (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  log_date        DATE        NOT NULL,
  weather         TEXT,
  crew_present    TEXT[],
  work_completed  TEXT,
  materials_used  TEXT,
  issues          TEXT,
  gps_lat         DOUBLE PRECISION,
  gps_lng         DOUBLE PRECISION,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_logs_lead ON daily_logs (lead_id, log_date DESC);

ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily logs self" ON daily_logs;
CREATE POLICY "daily logs self"
  ON daily_logs FOR ALL USING (pro_id = auth.uid());

-- 13l. Site visits — GPS check-in/out
CREATE TABLE IF NOT EXISTS site_visits (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at  TIMESTAMPTZ,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  accuracy_meters NUMERIC,
  duration_mins   INTEGER     GENERATED ALWAYS AS (
    CASE WHEN checked_out_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (checked_out_at - checked_in_at)) / 60
    ELSE NULL END
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_site_visits_lead ON site_visits (lead_id, checked_in_at DESC);

ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site visits self" ON site_visits;
CREATE POLICY "site visits self"
  ON site_visits FOR ALL USING (pro_id = auth.uid());

-- 13m. Pro stats daily — pre-aggregated, never compute live
CREATE TABLE IF NOT EXISTS pro_stats_daily (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  date                  DATE        NOT NULL,
  leads_created         INTEGER     DEFAULT 0,
  leads_won             INTEGER     DEFAULT 0,
  estimates_sent        INTEGER     DEFAULT 0,
  estimates_approved    INTEGER     DEFAULT 0,
  revenue_invoiced      NUMERIC     DEFAULT 0,
  revenue_collected     NUMERIC     DEFAULT 0,
  avg_job_value         NUMERIC,
  conversion_rate       NUMERIC,    -- leads_won / leads_created
  avg_days_to_close     NUMERIC,
  UNIQUE (pro_id, date)
);

CREATE INDEX IF NOT EXISTS idx_pro_stats_daily_pro
  ON pro_stats_daily (pro_id, date DESC);

ALTER TABLE pro_stats_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro stats self" ON pro_stats_daily;
CREATE POLICY "pro stats self"
  ON pro_stats_daily FOR SELECT USING (pro_id = auth.uid());


-- ============================================================
-- BLOCK 14: COMMUNITY REDESIGN
-- Full LinkedIn-for-trades community schema
-- ============================================================

-- 14a. Extend posts table (backward compatible)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS anon_token        TEXT,
  ADD COLUMN IF NOT EXISTS trade_slugs       TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location_city     TEXT,
  ADD COLUMN IF NOT EXISTS location_county   TEXT,
  ADD COLUMN IF NOT EXISTS location_state    TEXT    DEFAULT 'FL',
  ADD COLUMN IF NOT EXISTS hashtags          TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS photos            JSONB,
  ADD COLUMN IF NOT EXISTS is_question       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS best_answer_id    UUID,
  ADD COLUMN IF NOT EXISTS is_solved         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS solved_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS poll_options      JSONB,
  ADD COLUMN IF NOT EXISTS poll_closes_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS poll_is_anonymous BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hire_date         DATE,
  ADD COLUMN IF NOT EXISTS hire_duration     TEXT,
  ADD COLUMN IF NOT EXISTS hire_rate         NUMERIC,
  ADD COLUMN IF NOT EXISTS hire_rate_unit    TEXT,
  ADD COLUMN IF NOT EXISTS hire_filled       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hire_filled_by    UUID    REFERENCES pros(id),
  ADD COLUMN IF NOT EXISTS save_count        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_flagged        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flag_count        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_hidden         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_reason     TEXT,
  ADD COLUMN IF NOT EXISTS hidden_by         UUID,
  ADD COLUMN IF NOT EXISTS visibility        TEXT    DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS is_pinned         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_sponsored      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ;

-- Posts indexes
CREATE INDEX IF NOT EXISTS idx_posts_pro_created
  ON posts (pro_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts_type_created
  ON posts (post_type, created_at DESC) WHERE deleted_at IS NULL AND is_hidden = FALSE;

CREATE INDEX IF NOT EXISTS idx_posts_trade_slugs
  ON posts USING gin(trade_slugs);

CREATE INDEX IF NOT EXISTS idx_posts_hashtags
  ON posts USING gin(hashtags);

CREATE INDEX IF NOT EXISTS idx_posts_location_type
  ON posts (location_city, post_type, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts_sub_hire
  ON posts (hire_date, hire_filled) WHERE post_type = 'sub_hire';

-- 14b. Extend post_comments (add threading + best_answer)
ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS parent_id      UUID    REFERENCES post_comments(id),
  ADD COLUMN IF NOT EXISTS is_best_answer BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS like_count     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_hidden      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS edited_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_post_comments_post
  ON post_comments (post_id, created_at) WHERE is_hidden = FALSE;

CREATE INDEX IF NOT EXISTS idx_post_comments_parent
  ON post_comments (parent_id) WHERE parent_id IS NOT NULL;

-- 14c. post_reactions — replaces post_likes
CREATE TABLE IF NOT EXISTS post_reactions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  pro_id      UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  reaction    TEXT        NOT NULL DEFAULT 'like',
  -- like/fire/helpful/impressive/congrats
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (post_id, pro_id)
);

CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions (post_id);

ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post reactions self" ON post_reactions;
CREATE POLICY "post reactions self"
  ON post_reactions FOR ALL USING (pro_id = auth.uid());

-- 14d. Comment likes
CREATE TABLE IF NOT EXISTS comment_likes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id  UUID        NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  pro_id      UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (comment_id, pro_id)
);

-- 14e. Post saves / bookmarks
CREATE TABLE IF NOT EXISTS post_saves (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  pro_id      UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (post_id, pro_id)
);

CREATE INDEX IF NOT EXISTS idx_post_saves_pro ON post_saves (pro_id, created_at DESC);

-- 14f. Post flags — moderation
CREATE TABLE IF NOT EXISTS post_flags (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID        REFERENCES posts(id) ON DELETE CASCADE,
  comment_id  UUID        REFERENCES post_comments(id) ON DELETE CASCADE,
  reported_by UUID        NOT NULL REFERENCES pros(id),
  reason      TEXT        NOT NULL,
  -- spam/fake/inappropriate/wrong_trade/defamation/scam
  notes       TEXT,
  status      TEXT        DEFAULT 'pending',
  reviewed_by UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_flags_status
  ON post_flags (status, created_at) WHERE status = 'pending';

-- 14g. Poll votes
CREATE TABLE IF NOT EXISTS poll_votes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  pro_id      UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  option_id   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (post_id, pro_id)
);

-- 14h. Community channels — trade/topic groups
CREATE TABLE IF NOT EXISTS community_channels (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug          TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  description   TEXT,
  trade_slug    TEXT,
  location_city TEXT,
  member_count  INTEGER     DEFAULT 0,
  post_count    INTEGER     DEFAULT 0,
  is_official   BOOLEAN     DEFAULT FALSE,
  icon_emoji    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Seed initial channels
INSERT INTO community_channels (slug, name, description, trade_slug, is_official, icon_emoji) VALUES
  ('all-trades',     'General Discussion',      'All verified FL pros',                    NULL,         TRUE, '💬'),
  ('roofing-fl',     'Florida Roofing',          'Roofing contractors across FL',           'roofing',    TRUE, '🏠'),
  ('hvac-fl',        'Florida HVAC',             'HVAC techs across FL',                    'hvac',       TRUE, '❄️'),
  ('electrical-fl',  'Florida Electrical',       'Electricians across FL',                  'electrical', TRUE, '⚡'),
  ('plumbing-fl',    'Florida Plumbing',         'Plumbers across FL',                      'plumbing',   TRUE, '🔧'),
  ('gc-fl',          'General Contractors FL',   'GCs and builders across FL',              'gc',         TRUE, '🏗️'),
  ('sub-hire',       'Sub-Hire Board',           'Find or post crew needs',                 NULL,         TRUE, '👷'),
  ('pricing-bench',  'Pricing Benchmarks',       'Anonymous market pricing data',           NULL,         TRUE, '📊'),
  ('supplier-deals', 'Supplier Deals',           'Material deals and price alerts',         NULL,         TRUE, '🛒'),
  ('code-updates',   'FL Code Updates',          'Florida building code changes',           NULL,         TRUE, '📋'),
  ('business-talk',  'Business Talk',            'Running a contracting business',          NULL,         TRUE, '💼'),
  ('wins',           'Celebrate Wins',           'Milestones and achievements',             NULL,         TRUE, '🏆')
ON CONFLICT (slug) DO NOTHING;

-- 14i. Channel memberships
CREATE TABLE IF NOT EXISTS channel_memberships (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id  UUID        NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  pro_id      UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  role        TEXT        DEFAULT 'member',
  joined_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (channel_id, pro_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_memberships_pro
  ON channel_memberships (pro_id);

-- 14j. Conversations — replaces basic messages table
CREATE TABLE IF NOT EXISTS conversations (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  type              TEXT        DEFAULT 'direct', -- direct/group
  title             TEXT,
  created_by        UUID        NOT NULL REFERENCES pros(id),
  last_message_at   TIMESTAMPTZ DEFAULT now(),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_members (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id   UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  pro_id            UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  role              TEXT        DEFAULT 'member',
  joined_at         TIMESTAMPTZ DEFAULT now(),
  last_read_at      TIMESTAMPTZ,
  is_muted          BOOLEAN     DEFAULT FALSE,
  UNIQUE (conversation_id, pro_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_pro
  ON conversation_members (pro_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id   UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         UUID        NOT NULL REFERENCES pros(id),
  content           TEXT,
  attachments       JSONB,
  is_deleted        BOOLEAN     DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  edited_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv
  ON conversation_messages (conversation_id, created_at DESC)
  WHERE is_deleted = FALSE;

-- 14k. Pro reputation — ProGuild Score + badges + streaks
CREATE TABLE IF NOT EXISTS pro_reputation (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id                  UUID        UNIQUE NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  score                   INTEGER     DEFAULT 0,
  score_breakdown         JSONB       DEFAULT '{}',
  badges                  TEXT[]      DEFAULT '{}',
  post_streak_days        INTEGER     DEFAULT 0,
  longest_streak          INTEGER     DEFAULT 0,
  last_post_date          DATE,
  posts_count             INTEGER     DEFAULT 0,
  answers_given           INTEGER     DEFAULT 0,
  best_answers            INTEGER     DEFAULT 0,
  helpful_votes_received  INTEGER     DEFAULT 0,
  trade_rank              INTEGER,
  city_rank               INTEGER,
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_reputation_score
  ON pro_reputation (score DESC);

ALTER TABLE pro_reputation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro reputation public select" ON pro_reputation;
CREATE POLICY "pro reputation public select"
  ON pro_reputation FOR SELECT USING (true);

-- 14l. Pricing benchmarks — anonymous market data
CREATE TABLE IF NOT EXISTS pricing_benchmarks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  -- pro_id stored internally, NEVER exposed in any query response
  trade_slug      TEXT        NOT NULL,
  job_type        TEXT,
  price_per_unit  NUMERIC     NOT NULL,
  unit            TEXT        NOT NULL, -- per_sq/per_ft/per_job/per_hr
  city            TEXT,
  county          TEXT,
  submitted_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_benchmarks_trade_city
  ON pricing_benchmarks (trade_slug, city, submitted_at DESC);

-- Minimum 5 submissions before aggregate shows (enforced in query layer)
-- Aggregate query used by API:
-- SELECT trade_slug, job_type, city,
--   percentile_cont(0.25) WITHIN GROUP (ORDER BY price_per_unit) as p25,
--   percentile_cont(0.50) WITHIN GROUP (ORDER BY price_per_unit) as median,
--   percentile_cont(0.75) WITHIN GROUP (ORDER BY price_per_unit) as p75,
--   count(*) as sample_size
-- FROM pricing_benchmarks
-- WHERE submitted_at > now() - interval '90 days'
-- GROUP BY trade_slug, job_type, city
-- HAVING count(*) >= 5;

-- 14m. Pro warnings — private bad client/contractor alerts
CREATE TABLE IF NOT EXISTS pro_warnings (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id     UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  -- reporter_id NEVER exposed in any query response
  warning_type    TEXT        NOT NULL, -- bad_client/bad_contractor/scam
  subject_name    TEXT,
  subject_address TEXT,
  subject_phone   TEXT,
  description     TEXT        NOT NULL,
  verified_count  INTEGER     DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT now()
  -- visibility: pros_only, never public, never indexed by search engines
);

CREATE INDEX IF NOT EXISTS idx_pro_warnings_type
  ON pro_warnings (warning_type, created_at DESC);

-- Only verified pros can see — RLS enforces this
ALTER TABLE pro_warnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro warnings verified only" ON pro_warnings;
CREATE POLICY "pro warnings verified only"
  ON pro_warnings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pros
      WHERE pros.id = auth.uid()
      AND pros.is_claimed = true
    )
  );


-- ============================================================
-- BLOCK 15: AUDIT TRIGGERS
-- Automatic, permanent, cannot be bypassed by app code.
-- ============================================================

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_record_id UUID;
  v_old       JSONB;
  v_new       JSONB;
BEGIN
  v_record_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  -- Strip high-churn / non-material fields to keep log lean
  v_new := v_new - 'updated_at' - 'search_vector' - 'like_count' - 'comment_count' - 'view_count';
  v_old := v_old - 'updated_at' - 'search_vector' - 'like_count' - 'comment_count' - 'view_count';

  INSERT INTO audit_log (
    table_name, record_id, action, old_data, new_data, changed_by, created_at
  ) VALUES (
    TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new, auth.uid(), now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach to every table requiring legal audit trail
DROP TRIGGER IF EXISTS audit_leads         ON leads;
DROP TRIGGER IF EXISTS audit_estimates     ON estimates;
DROP TRIGGER IF EXISTS audit_invoices      ON invoices;
DROP TRIGGER IF EXISTS audit_estimate_items ON estimate_items;
DROP TRIGGER IF EXISTS audit_roofing_jobs  ON roofing_job_data;
DROP TRIGGER IF EXISTS audit_signatures    ON signatures;

CREATE TRIGGER audit_leads
  AFTER INSERT OR UPDATE OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_estimates
  AFTER INSERT OR UPDATE OR DELETE ON estimates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_estimate_items
  AFTER INSERT OR UPDATE OR DELETE ON estimate_items
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_roofing_jobs
  AFTER INSERT OR UPDATE OR DELETE ON roofing_job_data
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_signatures
  AFTER INSERT OR UPDATE OR DELETE ON signatures
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();


-- ============================================================
-- BLOCK 16: RLS — FIX ALL DISABLED TABLES
-- ============================================================

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads pro select" ON leads;
DROP POLICY IF EXISTS "leads pro update" ON leads;
DROP POLICY IF EXISTS "leads pro delete" ON leads;
CREATE POLICY "leads pro select" ON leads FOR SELECT USING (pro_id = auth.uid());
CREATE POLICY "leads pro update" ON leads FOR UPDATE USING (pro_id = auth.uid());
CREATE POLICY "leads pro delete" ON leads FOR DELETE USING (pro_id = auth.uid());

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients pro all" ON clients;
CREATE POLICY "clients pro all" ON clients FOR ALL USING (pro_id = auth.uid());

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices pro all" ON invoices;
CREATE POLICY "invoices pro all" ON invoices FOR ALL USING (pro_id = auth.uid());

ALTER TABLE pros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pros public select" ON pros;
DROP POLICY IF EXISTS "pros self update"   ON pros;
CREATE POLICY "pros public select" ON pros FOR SELECT USING (true);
CREATE POLICY "pros self update"   ON pros FOR UPDATE USING (id = auth.uid());

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reviews public select" ON reviews;
CREATE POLICY "reviews public select" ON reviews FOR SELECT USING (true);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages self" ON messages;
CREATE POLICY "messages self" ON messages FOR ALL
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications self" ON notifications;
CREATE POLICY "notifications self" ON notifications FOR ALL USING (pro_id = auth.uid());

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts public select"       ON posts;
DROP POLICY IF EXISTS "posts self insert"         ON posts;
DROP POLICY IF EXISTS "posts self update delete"  ON posts;
CREATE POLICY "posts public select"
  ON posts FOR SELECT USING (visibility = 'public' OR pro_id = auth.uid());
CREATE POLICY "posts self insert"
  ON posts FOR INSERT WITH CHECK (pro_id = auth.uid());
CREATE POLICY "posts self update delete"
  ON posts FOR UPDATE USING (pro_id = auth.uid());

ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portfolio public select" ON portfolio_items;
DROP POLICY IF EXISTS "portfolio self write"    ON portfolio_items;
CREATE POLICY "portfolio public select" ON portfolio_items FOR SELECT USING (true);
CREATE POLICY "portfolio self write"    ON portfolio_items FOR ALL USING (pro_id = auth.uid());

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions self" ON subscriptions;
CREATE POLICY "subscriptions self" ON subscriptions FOR SELECT USING (pro_id = auth.uid());

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post comments public" ON post_comments;
DROP POLICY IF EXISTS "post comments self write" ON post_comments;
CREATE POLICY "post comments public"     ON post_comments FOR SELECT USING (NOT is_hidden);
CREATE POLICY "post comments self write" ON post_comments FOR ALL USING (pro_id = auth.uid());

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follows self" ON follows;
CREATE POLICY "follows self" ON follows FOR ALL
  USING (follower_id = auth.uid() OR following_id = auth.uid());


-- ============================================================
-- BLOCK 17: ADDITIONAL INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_lead_photos_lead_phase
  ON lead_photos (lead_id, phase);

CREATE INDEX IF NOT EXISTS idx_lead_photos_pro_created
  ON lead_photos (pro_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roof_reports_pro_created
  ON roof_reports (pro_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roof_reports_property
  ON roof_reports (property_id) WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_warranties_lead
  ON roofing_warranties (lead_id);

CREATE INDEX IF NOT EXISTS idx_roofing_warranties_pro
  ON roofing_warranties (pro_id);

CREATE INDEX IF NOT EXISTS idx_hvac_maintenance_reminders_pro_status
  ON hvac_maintenance_reminders (pro_id, status);

CREATE INDEX IF NOT EXISTS idx_estimates_template_pro
  ON estimate_templates (pro_id);


-- ============================================================
-- VERIFICATION — run after migration to confirm success
-- ============================================================

SELECT
  'schema_migrations'     AS check_name, count(*) AS count, '1+ expected'  AS expected
  FROM schema_migrations
UNION ALL SELECT
  'trade_job_tables',     count(*), '8 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('roofing_job_data','hvac_job_data','electrical_job_data',
    'plumbing_job_data','solar_job_data','gc_job_data','landscape_job_data','painting_job_data')
UNION ALL SELECT
  'identity_tables',      count(*), '10 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('pro_sessions','login_events','account_security','trusted_devices',
    'password_reset_tokens','legal_acceptances','legal_documents',
    'admin_roles','admin_actions','tenant_config')
UNION ALL SELECT
  'audit_legal_tables',   count(*), '5 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('audit_log','document_snapshots','signatures',
    'legal_holds','data_deletion_requests')
UNION ALL SELECT
  'community_tables',     count(*), '13 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('post_reactions','comment_likes','post_saves','post_flags',
    'poll_votes','community_channels','channel_memberships','conversations',
    'conversation_members','conversation_messages','pro_reputation',
    'pricing_benchmarks','pro_warnings')
UNION ALL SELECT
  'platform_tables',      count(*), '6 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('feature_flags','usage_metrics','pii_vault',
    'api_keys','webhooks','webhook_deliveries')
UNION ALL SELECT
  'operational_tables',   count(*), '13 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('job_queue','review_requests','webhook_events','sms_log',
    'email_log','permit_log','lien_waivers','abuse_reports','homeowner_portals',
    'job_milestones','daily_logs','site_visits','pro_stats_daily')
UNION ALL SELECT
  'event_sourcing',       count(*), '1 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name = 'pipeline_events'
UNION ALL SELECT
  'audit_triggers',       count(*), '6 expected'
  FROM information_schema.triggers WHERE trigger_schema = 'public'
  AND trigger_name IN ('audit_leads','audit_estimates','audit_invoices',
    'audit_estimate_items','audit_roofing_jobs','audit_signatures')
UNION ALL SELECT
  'community_channels_seeded', count(*), '12 expected'
  FROM community_channels
UNION ALL SELECT
  'leads_no_orphan_trade_slug', count(*), '0 expected'
  FROM leads WHERE trade_slug IS NULL AND pro_id IS NOT NULL
UNION ALL SELECT
  'api_requests_log',     count(*), '1 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name = 'api_requests_log';


-- ============================================================
-- ProGuild.ai — v92 DOMAIN TABLES
-- All domain-specific tables missing from v91.
-- Run AFTER v91. Safe to re-run.
-- Generated: May 2026
-- ============================================================

INSERT INTO schema_migrations (version, description)
VALUES ('v92', 'Domain tables: support, communication, scheduling, financial, field, compliance, marketplace, analytics, integrations, SEO')
ON CONFLICT (version) DO NOTHING;


-- ============================================================
-- DOMAIN 1: SUPPORT & DOCUMENTATION
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        REFERENCES pros(id) ON DELETE SET NULL,
  subject         TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  status          TEXT        DEFAULT 'open',     -- open/pending/resolved/closed
  priority        TEXT        DEFAULT 'normal',   -- low/normal/high/urgent
  category        TEXT,                           -- billing/bug/feature/account/other
  assigned_to     TEXT,                           -- admin email
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_pro
  ON support_tickets (pro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets (status, priority, created_at);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support tickets self" ON support_tickets;
CREATE POLICY "support tickets self"
  ON support_tickets FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id       UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type     TEXT        NOT NULL, -- pro/admin
  sender_id       TEXT,                -- pro_id or admin email
  body            TEXT        NOT NULL,
  attachments     JSONB       DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
  ON support_ticket_messages (ticket_id, created_at);

-- -----

CREATE TABLE IF NOT EXISTS nps_responses (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  score           INTEGER     NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment         TEXT,
  survey_version  TEXT        DEFAULT 'v1',
  plan_tier       TEXT,       -- capture plan at time of response
  trade_slug      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_responses_pro
  ON nps_responses (pro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nps_responses_score
  ON nps_responses (score, created_at DESC);

ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nps responses self" ON nps_responses;
CREATE POLICY "nps responses self"
  ON nps_responses FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS changelog_entries (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  version         TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  body            TEXT        NOT NULL,          -- markdown
  tags            TEXT[]      DEFAULT '{}',      -- ['new','improved','fixed','trade:roofing']
  release_date    DATE        NOT NULL,
  is_published    BOOLEAN     DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelog_entries_published
  ON changelog_entries (release_date DESC) WHERE is_published = TRUE;

-- -----

CREATE TABLE IF NOT EXISTS onboarding_progress (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  step            TEXT        NOT NULL,
  -- claim_profile/set_trade/add_first_lead/send_first_estimate/
  -- connect_payment/add_profile_photo/invite_review/complete
  completed_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pro_id, step)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_pro
  ON onboarding_progress (pro_id);

ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "onboarding self" ON onboarding_progress;
CREATE POLICY "onboarding self"
  ON onboarding_progress FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- DOMAIN 2: COMMUNICATION — AUTOMATION & CALL TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_sequences (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT        NOT NULL,          -- "Estimate Follow-up", "Review Request"
  description     TEXT,
  trade_slug      TEXT,                          -- null = all trades
  trigger_event   TEXT        NOT NULL,
  -- estimate_sent/job_won/invoice_overdue/lead_created/stage_changed/no_estimate_5days
  trigger_config  JSONB       DEFAULT '{}',      -- {delay_days: 5, stage: 'proposal_sent'}
  is_active       BOOLEAN     DEFAULT TRUE,
  is_system       BOOLEAN     DEFAULT FALSE,     -- TRUE = built-in ProGuild sequence
  pro_id          UUID        REFERENCES pros(id) ON DELETE CASCADE, -- null if system
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_sequences_trigger
  ON automation_sequences (trigger_event) WHERE is_active = TRUE;

ALTER TABLE automation_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "automation sequences self" ON automation_sequences;
CREATE POLICY "automation sequences self"
  ON automation_sequences FOR ALL
  USING (pro_id = auth.uid() OR is_system = TRUE);

-- -----

CREATE TABLE IF NOT EXISTS automation_steps (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id     UUID        NOT NULL REFERENCES automation_sequences(id) ON DELETE CASCADE,
  step_number     INTEGER     NOT NULL,
  delay_days      INTEGER     DEFAULT 0,
  channel         TEXT        NOT NULL,          -- sms/email/push
  template_key    TEXT        NOT NULL,          -- maps to email/SMS template
  template_vars   JSONB       DEFAULT '{}',
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_steps_sequence
  ON automation_steps (sequence_id, step_number);

-- -----

CREATE TABLE IF NOT EXISTS automation_enrollments (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id     UUID        NOT NULL REFERENCES automation_sequences(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  lead_id         UUID        REFERENCES leads(id) ON DELETE CASCADE,
  current_step    INTEGER     DEFAULT 0,
  status          TEXT        DEFAULT 'active',  -- active/paused/completed/cancelled
  enrolled_at     TIMESTAMPTZ DEFAULT now(),
  next_step_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_automation_enrollments_next
  ON automation_enrollments (next_step_at, status)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_automation_enrollments_lead
  ON automation_enrollments (lead_id);

-- -----

CREATE TABLE IF NOT EXISTS call_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        REFERENCES pros(id) ON DELETE SET NULL,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  direction       TEXT        NOT NULL,          -- inbound/outbound
  from_number     TEXT        NOT NULL,
  to_number       TEXT        NOT NULL,
  duration_sec    INTEGER     DEFAULT 0,
  outcome         TEXT,                          -- answered/voicemail/no_answer/busy
  recorded_url    TEXT,                          -- Twilio recording URL
  twilio_call_sid TEXT,
  cost_usd        NUMERIC,
  called_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_log_pro   ON call_log (pro_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_log_lead  ON call_log (lead_id);

ALTER TABLE call_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "call log self" ON call_log;
CREATE POLICY "call log self"
  ON call_log FOR SELECT USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  channel         TEXT        NOT NULL,          -- sms/email
  segment         JSONB       DEFAULT '{}',
  -- {trade_slug: 'roofing', city: 'Tampa', tags: ['repeat_client']}
  subject         TEXT,                          -- email only
  body            TEXT        NOT NULL,
  status          TEXT        DEFAULT 'draft',   -- draft/scheduled/sending/sent/cancelled
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  recipient_count INTEGER     DEFAULT 0,
  delivered_count INTEGER     DEFAULT 0,
  failed_count    INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_pro
  ON broadcast_campaigns (pro_id, created_at DESC);

ALTER TABLE broadcast_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "broadcast campaigns self" ON broadcast_campaigns;
CREATE POLICY "broadcast campaigns self"
  ON broadcast_campaigns FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id     UUID        NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  client_id       UUID        REFERENCES clients(id) ON DELETE SET NULL,
  email           TEXT,
  phone           TEXT,
  status          TEXT        DEFAULT 'pending', -- pending/sent/delivered/failed/bounced/unsubscribed
  delivered_at    TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_campaign
  ON broadcast_recipients (campaign_id, status);


-- ============================================================
-- DOMAIN 3: SCHEDULING & DISPATCH
-- ============================================================

CREATE TABLE IF NOT EXISTS crew_members (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  full_name       TEXT        NOT NULL,
  role            TEXT,                          -- foreman/laborer/helper/tech
  phone           TEXT,
  email           TEXT,
  trade_slug      TEXT,
  license_number  TEXT,
  is_active       BOOLEAN     DEFAULT TRUE,
  -- If crew member has a ProGuild account, link it
  proguild_pro_id UUID        REFERENCES pros(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_members_pro
  ON crew_members (pro_id) WHERE is_active = TRUE;

ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crew members self" ON crew_members;
CREATE POLICY "crew members self"
  ON crew_members FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS job_assignments (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  crew_member_id  UUID        NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ DEFAULT now(),
  start_date      DATE,
  end_date        DATE,
  role_on_job     TEXT,                          -- lead/helper/inspector
  notes           TEXT,
  UNIQUE (lead_id, crew_member_id)
);

CREATE INDEX IF NOT EXISTS idx_job_assignments_lead   ON job_assignments (lead_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_crew   ON job_assignments (crew_member_id);

ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job assignments self" ON job_assignments;
CREATE POLICY "job assignments self"
  ON job_assignments FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS pro_availability (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  day_of_week     INTEGER     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 6=Sat
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,
  slot_duration_mins INTEGER  DEFAULT 60,
  is_active       BOOLEAN     DEFAULT TRUE,
  UNIQUE (pro_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_pro_availability_pro
  ON pro_availability (pro_id) WHERE is_active = TRUE;

ALTER TABLE pro_availability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro availability self" ON pro_availability;
CREATE POLICY "pro availability self"
  ON pro_availability FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS availability_slots (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  slot_date       DATE        NOT NULL,
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,
  is_booked       BOOLEAN     DEFAULT FALSE,
  is_blocked      BOOLEAN     DEFAULT FALSE,     -- manually blocked by pro
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_availability_slots_pro_date
  ON availability_slots (pro_id, slot_date)
  WHERE is_booked = FALSE AND is_blocked = FALSE;

ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "availability slots self" ON availability_slots;
CREATE POLICY "availability slots self"
  ON availability_slots FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS appointment_bookings (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id         UUID        NOT NULL REFERENCES availability_slots(id) ON DELETE RESTRICT,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  homeowner_name  TEXT        NOT NULL,
  homeowner_email TEXT,
  homeowner_phone TEXT,
  job_description TEXT,
  status          TEXT        DEFAULT 'confirmed', -- confirmed/cancelled/no_show/completed
  confirmed_at    TIMESTAMPTZ DEFAULT now(),
  reminder_sent   BOOLEAN     DEFAULT FALSE,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_bookings_pro
  ON appointment_bookings (pro_id, confirmed_at DESC);

ALTER TABLE appointment_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appointment bookings self" ON appointment_bookings;
CREATE POLICY "appointment bookings self"
  ON appointment_bookings FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS dispatch_events (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  crew_member_id  UUID        REFERENCES crew_members(id) ON DELETE SET NULL,
  event_type      TEXT        NOT NULL,          -- dispatched/en_route/arrived/departed/completed
  gps_lat         DOUBLE PRECISION,
  gps_lng         DOUBLE PRECISION,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_events_lead
  ON dispatch_events (lead_id, created_at DESC);

ALTER TABLE dispatch_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispatch events self" ON dispatch_events;
CREATE POLICY "dispatch events self"
  ON dispatch_events FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- DOMAIN 4: FINANCIAL — JOB COSTING, EXPENSES, PAYMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS job_costs (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  cost_type       TEXT        NOT NULL,          -- material/labour/sub/equipment/permit/other
  description     TEXT,
  amount          NUMERIC     NOT NULL,
  quantity        NUMERIC     DEFAULT 1,
  unit            TEXT,                          -- sqft/hrs/each
  vendor          TEXT,
  receipt_r2_key  TEXT,
  incurred_date   DATE        DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_costs_lead ON job_costs (lead_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_pro  ON job_costs (pro_id, incurred_date DESC);

ALTER TABLE job_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job costs self" ON job_costs;
CREATE POLICY "job costs self"
  ON job_costs FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS expenses (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  category        TEXT        NOT NULL,          -- materials/labour/fuel/equipment/permits/office/insurance/other
  description     TEXT        NOT NULL,
  amount          NUMERIC     NOT NULL,
  receipt_r2_key  TEXT,                          -- photo of receipt
  is_billable     BOOLEAN     DEFAULT FALSE,     -- can be billed to client
  is_reimbursable BOOLEAN     DEFAULT FALSE,     -- crew expense to reimburse
  expense_date    DATE        DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_pro_date
  ON expenses (pro_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_lead
  ON expenses (lead_id) WHERE lead_id IS NOT NULL;

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expenses self" ON expenses;
CREATE POLICY "expenses self"
  ON expenses FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id              UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  invoice_id          UUID        REFERENCES invoices(id) ON DELETE SET NULL,
  lead_id             UUID        REFERENCES leads(id) ON DELETE SET NULL,
  stripe_charge_id    TEXT        UNIQUE,
  stripe_payment_intent_id TEXT,
  amount              NUMERIC     NOT NULL,
  currency            TEXT        DEFAULT 'usd',
  method              TEXT,                      -- card/ach/cash/check/other
  status              TEXT        NOT NULL,      -- pending/succeeded/failed/refunded/disputed
  fee_amount          NUMERIC,                   -- Stripe fee
  net_amount          NUMERIC,                   -- amount - fee
  description         TEXT,
  refunded_at         TIMESTAMPTZ,
  refund_reason       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_pro
  ON payment_transactions (pro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice
  ON payment_transactions (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe
  ON payment_transactions (stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment transactions self" ON payment_transactions;
CREATE POLICY "payment transactions self"
  ON payment_transactions FOR SELECT USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS payment_links (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id                  UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  invoice_id              UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stripe_payment_link_id  TEXT,
  url                     TEXT,
  amount                  NUMERIC     NOT NULL,
  description             TEXT,
  is_active               BOOLEAN     DEFAULT TRUE,
  expires_at              TIMESTAMPTZ,
  paid_at                 TIMESTAMPTZ,
  transaction_id          UUID        REFERENCES payment_transactions(id),
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_invoice
  ON payment_links (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_pro
  ON payment_links (pro_id, created_at DESC);

ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment links self" ON payment_links;
CREATE POLICY "payment links self"
  ON payment_links FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS payment_schedules (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id      UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  milestone_name  TEXT        NOT NULL,          -- "Deposit", "At Decking", "On Completion"
  percentage      NUMERIC,
  amount          NUMERIC     NOT NULL,
  due_at          TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  payment_link_id UUID        REFERENCES payment_links(id),
  sort_order      INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_invoice
  ON payment_schedules (invoice_id, sort_order);

ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment schedules self" ON payment_schedules;
CREATE POLICY "payment schedules self"
  ON payment_schedules FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS tax_rates (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  state           TEXT        NOT NULL DEFAULT 'FL',
  county          TEXT,                          -- null = state-wide
  rate            NUMERIC     NOT NULL,          -- percentage e.g. 7.0
  applies_to      TEXT        DEFAULT 'all',     -- all/materials/labour
  description     TEXT,
  effective_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  expires_date    DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (state, county, applies_to, effective_date)
);

-- Seed Florida tax rates
INSERT INTO tax_rates (state, county, rate, applies_to, description) VALUES
  ('FL', NULL,           6.0,  'materials', 'FL state base sales tax — materials only. Roofing LABOUR is exempt in FL.'),
  ('FL', 'Hillsborough', 1.5,  'materials', 'Hillsborough County surtax (total 7.5%)'),
  ('FL', 'Miami-Dade',   1.0,  'materials', 'Miami-Dade County surtax (total 7.0%)'),
  ('FL', 'Broward',      1.0,  'materials', 'Broward County surtax (total 7.0%)'),
  ('FL', 'Palm Beach',   1.0,  'materials', 'Palm Beach County surtax (total 7.0%)'),
  ('FL', 'Orange',       0.5,  'materials', 'Orange County surtax (total 6.5%)'),
  ('FL', 'Pinellas',     1.0,  'materials', 'Pinellas County surtax (total 7.0%)'),
  ('FL', 'Duval',        0.5,  'materials', 'Duval County surtax (total 6.5%)'),
  ('FL', 'Pasco',        1.0,  'materials', 'Pasco County surtax (total 7.0%)'),
  ('FL', 'Sarasota',     1.0,  'materials', 'Sarasota County surtax (total 7.0%)')
ON CONFLICT (state, county, applies_to, effective_date) DO NOTHING;

-- -----

CREATE TABLE IF NOT EXISTS suppliers (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,          -- "ABC Supply", "Beacon Roofing"
  trade_slug      TEXT,
  contact_name    TEXT,
  contact_phone   TEXT,
  contact_email   TEXT,
  account_number  TEXT,
  address         TEXT,
  notes           TEXT,
  is_preferred    BOOLEAN     DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_pro
  ON suppliers (pro_id, is_preferred DESC);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers self" ON suppliers;
CREATE POLICY "suppliers self"
  ON suppliers FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  supplier_id     UUID        REFERENCES suppliers(id) ON DELETE SET NULL,
  po_number       TEXT,
  items           JSONB       NOT NULL DEFAULT '[]',
  -- [{description, qty, unit, unit_price, total}]
  subtotal        NUMERIC     DEFAULT 0,
  tax_amount      NUMERIC     DEFAULT 0,
  total           NUMERIC     DEFAULT 0,
  status          TEXT        DEFAULT 'draft',   -- draft/sent/confirmed/delivered/cancelled
  ordered_at      TIMESTAMPTZ,
  expected_at     DATE,
  delivered_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_pro
  ON purchase_orders (pro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_lead
  ON purchase_orders (lead_id) WHERE lead_id IS NOT NULL;

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase orders self" ON purchase_orders;
CREATE POLICY "purchase orders self"
  ON purchase_orders FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- DOMAIN 5: FIELD OPERATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS punch_list_items (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id                 UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id                  UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  description             TEXT        NOT NULL,
  photo_url               TEXT,
  photo_r2_key            TEXT,
  priority                TEXT        DEFAULT 'normal',
  completed_at            TIMESTAMPTZ,
  completed_by            UUID        REFERENCES pros(id),
  verified_by_homeowner   BOOLEAN     DEFAULT FALSE,
  homeowner_verified_at   TIMESTAMPTZ,
  sort_order              INTEGER     DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punch_list_items_lead
  ON punch_list_items (lead_id, sort_order);

ALTER TABLE punch_list_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "punch list self" ON punch_list_items;
CREATE POLICY "punch list self"
  ON punch_list_items FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS safety_incidents (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id             UUID        REFERENCES leads(id) ON DELETE SET NULL,
  pro_id              UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  incident_type       TEXT        NOT NULL,      -- injury/near_miss/property_damage/equipment/other
  severity            TEXT        DEFAULT 'low', -- low/medium/high/critical
  description         TEXT        NOT NULL,
  injured_person      TEXT,
  injury_description  TEXT,
  treatment           TEXT,                      -- first_aid/er_visit/hospitalization/none
  witnesses           TEXT[],
  reported_to_osha    BOOLEAN     DEFAULT FALSE,
  osha_case_number    TEXT,
  photo_urls          TEXT[],
  incident_at         TIMESTAMPTZ DEFAULT now(),
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_pro
  ON safety_incidents (pro_id, incident_at DESC);

ALTER TABLE safety_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "safety incidents self" ON safety_incidents;
CREATE POLICY "safety incidents self"
  ON safety_incidents FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- DOMAIN 6: COMPLIANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS subcontractor_compliance (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  gc_pro_id               UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  sub_pro_id              UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  -- or sub without ProGuild account:
  sub_name                TEXT,
  sub_license_number      TEXT,
  sub_insurance_carrier   TEXT,
  license_verified_at     TIMESTAMPTZ,
  license_expires_at      DATE,
  insurance_verified_at   TIMESTAMPTZ,
  insurance_expires_at    DATE,
  coi_r2_key              TEXT,                  -- Certificate of Insurance file
  is_approved             BOOLEAN     DEFAULT FALSE,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE (gc_pro_id, sub_pro_id)
);

CREATE INDEX IF NOT EXISTS idx_subcontractor_compliance_gc
  ON subcontractor_compliance (gc_pro_id);

ALTER TABLE subcontractor_compliance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subcontractor compliance self" ON subcontractor_compliance;
CREATE POLICY "subcontractor compliance self"
  ON subcontractor_compliance FOR ALL USING (gc_pro_id = auth.uid());


-- ============================================================
-- DOMAIN 7: MARKETPLACE
-- ============================================================

CREATE TABLE IF NOT EXISTS quote_requests (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  homeowner_email TEXT        NOT NULL,
  homeowner_name  TEXT,
  homeowner_phone TEXT,
  trade_slug      TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  zip_code        TEXT,
  city            TEXT,
  county          TEXT,
  budget_range    TEXT,                          -- under_5k/5k-15k/15k-30k/30k_plus
  urgency         TEXT        DEFAULT 'flexible', -- asap/this_week/this_month/flexible
  status          TEXT        DEFAULT 'open',    -- open/matched/closed/expired
  matched_pro_count INTEGER   DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_trade_zip
  ON quote_requests (trade_slug, zip_code, status)
  WHERE status = 'open';

-- -----

CREATE TABLE IF NOT EXISTS quote_submissions (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_request_id  UUID        NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  pro_id            UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  amount            NUMERIC,
  message           TEXT        NOT NULL,
  timeline          TEXT,                        -- "2-3 days", "Next week"
  status            TEXT        DEFAULT 'submitted', -- submitted/viewed/accepted/declined
  viewed_at         TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (quote_request_id, pro_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_submissions_request
  ON quote_submissions (quote_request_id);
CREATE INDEX IF NOT EXISTS idx_quote_submissions_pro
  ON quote_submissions (pro_id, submitted_at DESC);

-- -----

CREATE TABLE IF NOT EXISTS supplier_partnerships (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_name   TEXT        NOT NULL UNIQUE,
  display_name    TEXT        NOT NULL,
  logo_url        TEXT,
  api_endpoint    TEXT,
  api_key_encrypted TEXT,
  commission_pct  NUMERIC     DEFAULT 0,
  trade_slugs     TEXT[]      DEFAULT '{}',      -- which trades this supplier serves
  is_active       BOOLEAN     DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- -----

CREATE TABLE IF NOT EXISTS material_orders (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id                UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  lead_id               UUID        REFERENCES leads(id) ON DELETE SET NULL,
  supplier_partnership_id UUID      REFERENCES supplier_partnerships(id),
  local_supplier_id     UUID        REFERENCES suppliers(id),
  items                 JSONB       NOT NULL DEFAULT '[]',
  subtotal              NUMERIC     DEFAULT 0,
  tax_amount            NUMERIC     DEFAULT 0,
  total                 NUMERIC     DEFAULT 0,
  external_order_ref    TEXT,                    -- supplier's order number
  status                TEXT        DEFAULT 'pending', -- pending/confirmed/shipped/delivered/cancelled
  ordered_at            TIMESTAMPTZ,
  expected_at           DATE,
  delivered_at          TIMESTAMPTZ,
  commission_earned     NUMERIC     DEFAULT 0,   -- ProGuild commission on order
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_orders_pro
  ON material_orders (pro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_orders_lead
  ON material_orders (lead_id) WHERE lead_id IS NOT NULL;

ALTER TABLE material_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material orders self" ON material_orders;
CREATE POLICY "material orders self"
  ON material_orders FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS financing_applications (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id           UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id            UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  estimate_id       UUID        REFERENCES estimates(id) ON DELETE SET NULL,
  provider          TEXT        NOT NULL,         -- wisetack/greensky/mosaic/synchrony
  amount_requested  NUMERIC     NOT NULL,
  amount_approved   NUMERIC,
  apr               NUMERIC,
  term_months       INTEGER,
  status            TEXT        DEFAULT 'pending',
  -- pending/approved/declined/accepted/funded/expired
  application_ref   TEXT,
  applied_at        TIMESTAMPTZ DEFAULT now(),
  decision_at       TIMESTAMPTZ,
  funded_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financing_applications_lead
  ON financing_applications (lead_id);
CREATE INDEX IF NOT EXISTS idx_financing_applications_pro
  ON financing_applications (pro_id, created_at DESC);

ALTER TABLE financing_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financing applications self" ON financing_applications;
CREATE POLICY "financing applications self"
  ON financing_applications FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- DOMAIN 8: ANALYTICS
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_stats_daily (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  date                  DATE        NOT NULL UNIQUE,
  -- User metrics
  total_pros            INTEGER     DEFAULT 0,
  new_pros              INTEGER     DEFAULT 0,
  active_pros           INTEGER     DEFAULT 0,   -- logged in this day
  mau                   INTEGER     DEFAULT 0,   -- unique logins last 30 days
  claimed_pros          INTEGER     DEFAULT 0,
  -- Revenue metrics
  mrr                   NUMERIC     DEFAULT 0,
  new_mrr               NUMERIC     DEFAULT 0,
  churned_mrr           NUMERIC     DEFAULT 0,
  -- Feature usage
  leads_created         INTEGER     DEFAULT 0,
  estimates_sent        INTEGER     DEFAULT 0,
  invoices_paid         INTEGER     DEFAULT 0,
  satellite_reports     INTEGER     DEFAULT 0,
  -- Community
  posts_created         INTEGER     DEFAULT 0,
  community_mau         INTEGER     DEFAULT 0,
  -- Infrastructure costs
  r2_storage_gb         NUMERIC     DEFAULT 0,
  api_calls_gemini      INTEGER     DEFAULT 0,
  sms_sent              INTEGER     DEFAULT 0,
  -- Feature adoption (%)
  feature_adoption      JSONB       DEFAULT '{}',
  -- {satellite_report: 12.5, good_better_best: 3.2, api_access: 0.8}
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_stats_daily_date
  ON platform_stats_daily (date DESC);

-- -----

CREATE TABLE IF NOT EXISTS saved_reports (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id          UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  query_config    JSONB       NOT NULL DEFAULT '{}',
  -- {metric: 'revenue', group_by: 'lead_source', period: 'last_90_days',
  --  filters: {trade_slug: 'roofing'}, chart_type: 'bar'}
  last_run_at     TIMESTAMPTZ,
  last_result     JSONB,                         -- cached last result
  is_pinned       BOOLEAN     DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_pro
  ON saved_reports (pro_id, is_pinned DESC, created_at DESC);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saved reports self" ON saved_reports;
CREATE POLICY "saved reports self"
  ON saved_reports FOR ALL USING (pro_id = auth.uid());


-- ============================================================
-- DOMAIN 9: INTEGRATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS integration_connections (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id                  UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  provider                TEXT        NOT NULL,
  -- quickbooks/xero/google_calendar/google_contacts/
  -- companycam/zapier/slack/stripe
  display_name            TEXT,                  -- "QuickBooks Online - Marcus Roofing"
  access_token_encrypted  TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at        TIMESTAMPTZ,
  external_id             TEXT,                  -- provider's account/company ID
  external_name           TEXT,                  -- provider's account name
  scopes                  TEXT[]      DEFAULT '{}',
  status                  TEXT        DEFAULT 'active',  -- active/expired/revoked/error
  last_sync_at            TIMESTAMPTZ,
  last_error              TEXT,
  settings                JSONB       DEFAULT '{}',
  connected_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pro_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_pro
  ON integration_connections (pro_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_provider
  ON integration_connections (provider, status);

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "integration connections self" ON integration_connections;
CREATE POLICY "integration connections self"
  ON integration_connections FOR ALL USING (pro_id = auth.uid());

-- -----

CREATE TABLE IF NOT EXISTS integration_sync_log (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id     UUID        NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  pro_id            UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  direction         TEXT        NOT NULL,         -- inbound/outbound
  entity_type       TEXT        NOT NULL,         -- estimate/invoice/client/lead
  internal_id       UUID,
  external_id       TEXT,
  status            TEXT        NOT NULL,         -- success/failed/skipped
  records_synced    INTEGER     DEFAULT 0,
  error             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_log_connection
  ON integration_sync_log (connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_sync_log_failed
  ON integration_sync_log (connection_id, status)
  WHERE status = 'failed';


-- ============================================================
-- DOMAIN 10: SEO & CONTENT
-- ============================================================

CREATE TABLE IF NOT EXISTS search_history (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  query           TEXT        NOT NULL,
  trade_slug      TEXT,
  city            TEXT,
  zip_code        TEXT,
  result_count    INTEGER     DEFAULT 0,
  clicked_pro_id  UUID        REFERENCES pros(id) ON DELETE SET NULL,
  homeowner_ip    TEXT,
  session_id      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_history_trade_city
  ON search_history (trade_slug, city, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_query
  ON search_history USING gin(to_tsvector('english', query));

-- -----

CREATE TABLE IF NOT EXISTS blog_posts (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug            TEXT        UNIQUE NOT NULL,
  title           TEXT        NOT NULL,
  meta_title      TEXT,
  meta_description TEXT,
  body            TEXT        NOT NULL,           -- markdown
  trade_slug      TEXT,
  city            TEXT,
  county          TEXT,
  tags            TEXT[]      DEFAULT '{}',
  author          TEXT        DEFAULT 'ProGuild Editorial',
  hero_image_url  TEXT,
  is_published    BOOLEAN     DEFAULT FALSE,
  published_at    TIMESTAMPTZ,
  view_count      INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published
  ON blog_posts (published_at DESC) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_blog_posts_trade_city
  ON blog_posts (trade_slug, city) WHERE is_published = TRUE;

-- -----

CREATE TABLE IF NOT EXISTS landing_pages (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug              TEXT        UNIQUE NOT NULL, -- 'fl/roofing/tampa'
  trade_slug        TEXT        NOT NULL,
  city              TEXT        NOT NULL,
  county            TEXT,
  state             TEXT        DEFAULT 'FL',
  h1                TEXT        NOT NULL,
  meta_title        TEXT,
  meta_description  TEXT,
  intro_copy        TEXT,
  pro_count         INTEGER     DEFAULT 0,       -- updated nightly
  avg_rating        NUMERIC,                     -- updated nightly
  review_count      INTEGER     DEFAULT 0,
  is_published      BOOLEAN     DEFAULT FALSE,
  last_generated_at TIMESTAMPTZ,
  view_count        INTEGER     DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_trade_city
  ON landing_pages (trade_slug, city) WHERE is_published = TRUE;

CREATE INDEX IF NOT EXISTS idx_landing_pages_published
  ON landing_pages (is_published, view_count DESC);


-- ============================================================
-- VERIFY ALL DOMAIN TABLES CREATED
-- ============================================================

SELECT
  'domain_1_support'        AS domain, count(*) AS count, '5 expected' AS expected
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('support_tickets','support_ticket_messages','nps_responses','changelog_entries','onboarding_progress')
UNION ALL SELECT
  'domain_2_communication',  count(*), '6 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('automation_sequences','automation_steps','automation_enrollments','call_log','broadcast_campaigns','broadcast_recipients')
UNION ALL SELECT
  'domain_3_scheduling',     count(*), '6 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('crew_members','job_assignments','pro_availability','availability_slots','appointment_bookings','dispatch_events')
UNION ALL SELECT
  'domain_4_financial',      count(*), '8 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('job_costs','expenses','payment_transactions','payment_links','payment_schedules','tax_rates','suppliers','purchase_orders')
UNION ALL SELECT
  'domain_5_field',          count(*), '2 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('punch_list_items','safety_incidents')
UNION ALL SELECT
  'domain_6_compliance',     count(*), '1 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name = 'subcontractor_compliance'
UNION ALL SELECT
  'domain_7_marketplace',    count(*), '5 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('quote_requests','quote_submissions','supplier_partnerships','material_orders','financing_applications')
UNION ALL SELECT
  'domain_8_analytics',      count(*), '2 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('platform_stats_daily','saved_reports')
UNION ALL SELECT
  'domain_9_integrations',   count(*), '2 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('integration_connections','integration_sync_log')
UNION ALL SELECT
  'domain_10_seo_content',   count(*), '3 expected'
  FROM information_schema.tables WHERE table_schema = 'public'
  AND table_name IN ('search_history','blog_posts','landing_pages')
UNION ALL SELECT
  'fl_tax_rates_seeded',     count(*), '10 expected'
  FROM tax_rates WHERE state = 'FL';


-- ============================================================
-- FINAL: leads TABLE CONSTRAINT FIXES
-- Adds all roofing + HVAC stages + new sources
-- ============================================================

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_lead_status_check
  CHECK (lead_status IN (
    'New','Contacted','Quoted','Scheduled','Completed','Paid',
    'lead_in','inspection_scheduled','proposal_sent','proposal_signed',
    'insurance_approved','scheduled','in_progress','job_won','lost','unqualified',
    'new_call','diagnosed','quoted','parts_ordered','job_complete'
  ));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_lead_source_check
  CHECK (lead_source IN (
    'Profile_Page','Job_Post','Search_Result','Direct','Registry_Card',
    'Phone_Call','Facebook','Instagram','Referral','Website',
    'Yard_Sign','Walk_In','Other','Insurance','Canvassing','Manual'
  ));

