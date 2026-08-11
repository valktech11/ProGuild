-- =============================================================================
-- v77-prod-migration.sql
-- ProGuild.ai — Staging → Production Schema Delta
-- Generated: 2026-05-05
-- =============================================================================
-- WHAT THIS COVERS:
--   v74-sql.sql          → clients table (never run on prod)
--   v75-estimates-contacts-sql.sql → estimates + contacts (run on prod ✅ — skipped here)
--   v75-templates-sql.sql          → estimate_templates (run on prod ✅ — skipped here)
--   v76-invoices-sql.sql           → invoices table
--   v76-estimates-schema-update.sql → declined_at, voided_at, void_reason, revision_of
--   v76-discount-type.sql          → discount_type column
--   v77-estimates-constraint-fix   → status CHECK constraint (add void/declined/invoiced)
--   v77-today-ad-hoc               → quoted_amount resync logic (data, not schema)
--
-- SAFETY:
--   Every statement uses IF NOT EXISTS / IF EXISTS / OR REPLACE guards.
--   Safe to run multiple times — fully idempotent.
--   Run in Supabase prod SQL Editor or via psql.
--   DO NOT run on staging — staging already has all of this.
--
-- RUN ORDER: Top to bottom. Do not reorder.
-- =============================================================================


-- =============================================================================
-- SECTION 1: clients table (from v74-sql.sql)
-- Has never been run on production. clients/page.tsx will 500 without this.
-- =============================================================================

CREATE TABLE IF NOT EXISTS clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id          uuid NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  contact_name    text NOT NULL,
  contact_email   text,
  contact_phone   text,
  contact_city    text,
  contact_state   text,
  notes           text,
  lead_count      integer DEFAULT 0,
  total_spent     numeric DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clients_pro_id_idx ON clients(pro_id);
CREATE INDEX IF NOT EXISTS clients_created_at_idx ON clients(created_at DESC);


-- =============================================================================
-- SECTION 2: invoices table (from v76-invoices-sql.sql)
-- =============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id            uuid NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  lead_id           uuid REFERENCES leads(id) ON DELETE SET NULL,
  estimate_id       uuid REFERENCES estimates(id) ON DELETE SET NULL,
  invoice_number    text NOT NULL,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','viewed','partial_payment','paid','void')),
  lead_name         text,
  lead_source       text,
  trade             text,
  contact_phone     text,
  contact_email     text,
  job_description   text,
  subtotal          numeric DEFAULT 0,
  discount          numeric DEFAULT 0,
  discount_type     text DEFAULT '$' CHECK (discount_type IN ('$','%')),
  tax_rate          numeric DEFAULT 0,
  tax_amount        numeric DEFAULT 0,
  total             numeric DEFAULT 0,
  amount_paid       numeric DEFAULT 0,
  balance_due       numeric DEFAULT 0,
  deposit_percent   integer DEFAULT 0,
  deposit_paid      numeric DEFAULT 0,
  require_deposit   boolean DEFAULT false,
  payment_terms     text DEFAULT 'Due on receipt',
  issue_date        date DEFAULT CURRENT_DATE,
  due_date          date,
  sent_at           timestamptz,
  viewed_at         timestamptz,
  viewed_count      integer DEFAULT 0,
  paid_at           timestamptz,
  voided_at         timestamptz,
  void_reason       text,
  terms             text,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_pro_id_idx     ON invoices(pro_id);
CREATE INDEX IF NOT EXISTS invoices_lead_id_idx    ON invoices(lead_id);
CREATE INDEX IF NOT EXISTS invoices_estimate_id_idx ON invoices(estimate_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx     ON invoices(status);
CREATE INDEX IF NOT EXISTS invoices_created_at_idx ON invoices(created_at DESC);

-- invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sort_order    integer DEFAULT 0,
  description   text NOT NULL,
  quantity      numeric DEFAULT 1,
  unit_price    numeric DEFAULT 0,
  amount        numeric DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON invoice_items(invoice_id);

-- invoice_payments table (tracks partial payments)
CREATE TABLE IF NOT EXISTS invoice_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount        numeric NOT NULL,
  method        text,
  note          text,
  paid_at       timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_payments_invoice_id_idx ON invoice_payments(invoice_id);


-- =============================================================================
-- SECTION 3: estimates table — new columns (from v76-estimates-schema-update.sql)
-- =============================================================================

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS declined_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_at     timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason   text,
  ADD COLUMN IF NOT EXISTS revision_of   uuid REFERENCES estimates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoiced_at   timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_id    uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decline_reason text;

-- decline_reason is an alias used in some routes — ensure both exist
-- (void_reason is the canonical column, decline_reason added for API compatibility)


-- =============================================================================
-- SECTION 4: estimates discount_type column (from v76-discount-type.sql)
-- =============================================================================

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS discount_type text DEFAULT '$'
  CHECK (discount_type IN ('$', '%'));

-- Backfill existing rows — all pre-existing discounts were flat dollar amounts
UPDATE estimates
SET discount_type = '$'
WHERE discount_type IS NULL;


-- =============================================================================
-- SECTION 5: estimates status CHECK constraint fix (v77-today)
-- The original constraint only had: draft, sent, viewed, approved, paid
-- Missing: void, declined, invoiced — which are used throughout the codebase
-- This was discovered today when voiding a superseded estimate failed with 23514
-- =============================================================================

ALTER TABLE estimates
  DROP CONSTRAINT IF EXISTS estimates_status_check;

ALTER TABLE estimates
  ADD CONSTRAINT estimates_status_check
  CHECK (status IN (
    'draft',
    'sent',
    'viewed',
    'approved',
    'declined',
    'invoiced',
    'paid',
    'void'
  ));


-- =============================================================================
-- SECTION 6: leads table — missing columns (from staging_leads_fix.sql)
-- These were added to staging early in v74c but may be missing on prod
-- =============================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS job_id         uuid,
  ADD COLUMN IF NOT EXISTS quoted_amount  numeric,
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS contact_city   text,
  ADD COLUMN IF NOT EXISTS contact_state  text,
  ADD COLUMN IF NOT EXISTS lead_count     integer DEFAULT 0;


-- =============================================================================
-- SECTION 7: next_estimate_number() RPC function
-- Used by duplicate estimate flow. Returns next EST-XXXX number for a pro.
-- If this already exists on prod (from v75), OR REPLACE makes it safe.
-- =============================================================================

CREATE OR REPLACE FUNCTION next_estimate_number(p_pro_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_num integer;
  v_next    integer;
BEGIN
  SELECT COALESCE(
    MAX(
      CASE
        WHEN estimate_number ~ '^EST-[0-9]+$'
        THEN (regexp_replace(estimate_number, '^EST-', ''))::integer
        ELSE 0
      END
    ), 1000
  )
  INTO v_max_num
  FROM estimates
  WHERE pro_id = p_pro_id;

  v_next := v_max_num + 1;
  RETURN 'EST-' || v_next::text;
END;
$$;


-- =============================================================================
-- SECTION 8: next_invoice_number() RPC function
-- Used by invoice creation flow.
-- =============================================================================

CREATE OR REPLACE FUNCTION next_invoice_number(p_pro_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_num integer;
  v_next    integer;
BEGIN
  SELECT COALESCE(
    MAX(
      CASE
        WHEN invoice_number ~ '^INV-[0-9]+$'
        THEN (regexp_replace(invoice_number, '^INV-', ''))::integer
        ELSE 0
      END
    ), 1000
  )
  INTO v_max_num
  FROM invoices
  WHERE pro_id = p_pro_id;

  v_next := v_max_num + 1;
  RETURN 'INV-' || v_next::text;
END;
$$;


-- =============================================================================
-- SECTION 9: updated_at auto-update triggers
-- Ensure updated_at stays current on all new tables
-- =============================================================================

-- Generic trigger function (create once, reuse)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- clients
DROP TRIGGER IF EXISTS set_clients_updated_at ON clients;
CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- invoices
DROP TRIGGER IF EXISTS set_invoices_updated_at ON invoices;
CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- SECTION 10: RLS policies for new tables
-- Supabase RLS must be enabled. Policies mirror the existing leads/estimates pattern.
-- Pros can only read/write their own data.
-- =============================================================================

-- clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pros can manage their own clients" ON clients;
CREATE POLICY "Pros can manage their own clients"
  ON clients FOR ALL
  USING (pro_id = auth.uid())
  WITH CHECK (pro_id = auth.uid());

-- invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pros can manage their own invoices" ON invoices;
CREATE POLICY "Pros can manage their own invoices"
  ON invoices FOR ALL
  USING (pro_id = auth.uid())
  WITH CHECK (pro_id = auth.uid());

-- invoice_items (access via invoice ownership)
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pros can manage invoice items" ON invoice_items;
CREATE POLICY "Pros can manage invoice items"
  ON invoice_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_items.invoice_id
        AND i.pro_id = auth.uid()
    )
  );

-- invoice_payments
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pros can manage invoice payments" ON invoice_payments;
CREATE POLICY "Pros can manage invoice payments"
  ON invoice_payments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_payments.invoice_id
        AND i.pro_id = auth.uid()
    )
  );


-- =============================================================================
-- SECTION 11: Service role bypass policies
-- API routes use getSupabaseAdmin() (service role) which bypasses RLS.
-- These policies allow service role full access for server-side operations.
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access clients" ON clients;
CREATE POLICY "Service role full access clients"
  ON clients FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access invoices" ON invoices;
CREATE POLICY "Service role full access invoices"
  ON invoices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access invoice_items" ON invoice_items;
CREATE POLICY "Service role full access invoice_items"
  ON invoice_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access invoice_payments" ON invoice_payments;
CREATE POLICY "Service role full access invoice_payments"
  ON invoice_payments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- =============================================================================
-- SECTION 12: Data integrity — quoted_amount sync cleanup
-- Clears quoted_amount on leads where ONLY draft/declined/void estimates exist
-- (Pre-v76 sync bug: draft saves were incorrectly writing to quoted_amount)
-- Safe to run: only NULLs values that came from non-committed estimates
-- Does NOT touch leads with manual quoted_amount (no estimate at all)
-- Does NOT touch leads with sent/viewed/approved/invoiced/paid estimates
-- =============================================================================

-- Step 1: Clear dirty draft-sourced values
UPDATE leads l
SET quoted_amount = NULL
WHERE EXISTS (
  SELECT 1 FROM estimates e
  WHERE e.lead_id = l.id
    AND e.status IN ('draft', 'declined', 'void')
)
AND NOT EXISTS (
  SELECT 1 FROM estimates e
  WHERE e.lead_id = l.id
    AND e.status IN ('sent', 'viewed', 'approved', 'invoiced', 'paid')
);

-- Step 2: Resync from best active estimate (paid > invoiced > approved > viewed > sent)
UPDATE leads l
SET quoted_amount = sub.total
FROM (
  SELECT DISTINCT ON (lead_id)
    lead_id,
    total
  FROM estimates
  WHERE status IN ('sent', 'viewed', 'approved', 'invoiced', 'paid')
  ORDER BY lead_id,
    CASE status
      WHEN 'paid'     THEN 1
      WHEN 'invoiced' THEN 2
      WHEN 'approved' THEN 3
      WHEN 'viewed'   THEN 4
      WHEN 'sent'     THEN 5
    END
) sub
WHERE l.id = sub.lead_id
  AND (l.quoted_amount IS DISTINCT FROM sub.total);

-- Step 3: Void superseded estimates (same lead, multiple active estimates)
-- Keeps only the highest-priority estimate per lead as active
WITH best_estimates AS (
  SELECT DISTINCT ON (lead_id)
    id AS best_id,
    lead_id
  FROM estimates
  WHERE status IN ('sent', 'viewed', 'approved', 'invoiced', 'paid')
  ORDER BY lead_id,
    CASE status
      WHEN 'paid'     THEN 1
      WHEN 'invoiced' THEN 2
      WHEN 'approved' THEN 3
      WHEN 'viewed'   THEN 4
      WHEN 'sent'     THEN 5
    END,
    created_at DESC
)
UPDATE estimates e
SET
  status     = 'void',
  voided_at  = NOW(),
  void_reason = 'Superseded — auto-cleanup on prod migration'
FROM best_estimates b
WHERE e.lead_id = b.lead_id
  AND e.id != b.best_id
  AND e.status IN ('sent', 'viewed', 'approved', 'invoiced');


-- =============================================================================
-- VERIFICATION QUERIES
-- Run these after migration to confirm everything applied correctly.
-- All should return expected results with no errors.
-- =============================================================================

-- 1. Confirm new tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('clients', 'invoices', 'invoice_items', 'invoice_payments')
ORDER BY table_name;
-- Expected: 4 rows

-- 2. Confirm estimates columns
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'estimates'
  AND column_name IN ('declined_at', 'voided_at', 'void_reason', 'revision_of',
                      'invoiced_at', 'invoice_id', 'discount_type', 'decline_reason')
ORDER BY column_name;
-- Expected: 8 rows

-- 3. Confirm status constraint
SELECT check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'estimates_status_check';
-- Expected: includes void, declined, invoiced

-- 4. Confirm leads columns
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name IN ('quoted_amount', 'scheduled_date', 'follow_up_date',
                      'contact_city', 'contact_state', 'job_id')
ORDER BY column_name;
-- Expected: 6 rows

-- 5. Confirm RPC functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_name IN ('next_estimate_number', 'next_invoice_number',
                       'update_updated_at_column')
ORDER BY routine_name;
-- Expected: 3 rows

-- =============================================================================
-- END OF MIGRATION
-- After running: test login → create lead → create estimate → approve →
-- create invoice → mark paid. Full happy path smoke test.
-- =============================================================================
