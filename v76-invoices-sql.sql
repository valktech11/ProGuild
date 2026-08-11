-- ── v76 Invoice Migration ─────────────────────────────────────────────────
-- Run on staging first, then production after QA

-- 1. Add invoiced_at + invoice_id to estimates
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS invoiced_at  timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_id   uuid;

-- 2. Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id           uuid NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  lead_id          uuid REFERENCES leads(id) ON DELETE SET NULL,
  estimate_id      uuid REFERENCES estimates(id) ON DELETE SET NULL,

  invoice_number   text NOT NULL,
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','sent','viewed','partial_payment','paid','void')),

  -- Contact — copied at creation time (not live ref)
  contact_name     text,
  contact_email    text,
  contact_phone    text,

  -- Line items as JSONB (locked after creation)
  items            jsonb NOT NULL DEFAULT '[]',

  -- Financials
  subtotal         numeric(10,2) NOT NULL DEFAULT 0,
  discount         numeric(10,2) NOT NULL DEFAULT 0,
  discount_type    text NOT NULL DEFAULT '$' CHECK (discount_type IN ('$','%')),
  tax_rate         numeric(5,2)  NOT NULL DEFAULT 0,
  tax_amount       numeric(10,2) NOT NULL DEFAULT 0,
  total            numeric(10,2) NOT NULL DEFAULT 0,
  deposit_paid     numeric(10,2) NOT NULL DEFAULT 0,
  balance_due      numeric(10,2) NOT NULL DEFAULT 0,
  amount_paid      numeric(10,2) NOT NULL DEFAULT 0,

  -- Payment terms
  payment_terms    text NOT NULL DEFAULT 'due_on_receipt'
                   CHECK (payment_terms IN ('due_on_receipt','net_7','net_14','net_30')),
  issue_date       timestamptz NOT NULL DEFAULT now(),
  due_date         timestamptz,

  -- Tracking
  sent_at          timestamptz,
  viewed_at        timestamptz,
  viewed_count     int NOT NULL DEFAULT 0,
  paid_at          timestamptz,

  -- Content
  notes            text,
  terms            text DEFAULT 'Payment is due upon job completion.',
  lead_name        text,
  trade            text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS invoices_pro_id_idx    ON invoices(pro_id);
CREATE INDEX IF NOT EXISTS invoices_lead_id_idx   ON invoices(lead_id);
CREATE INDEX IF NOT EXISTS invoices_estimate_id_idx ON invoices(estimate_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx    ON invoices(status);

-- 4. updated_at trigger (reuse same pattern as estimates)
CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_invoices_updated_at();
