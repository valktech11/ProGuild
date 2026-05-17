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
