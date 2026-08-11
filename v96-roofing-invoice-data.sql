-- v96-roofing-invoice-data.sql
-- ProGuild.ai — Roofing invoice extension table
--
-- ARCHITECTURE: invoices table stays universal forever.
-- All roofing-specific invoice data lives here.
-- Pattern identical to roofing_estimate_data and roofing_job_data.
--
-- Wave 1 fields: lien_waiver_signed, permit_number, permit_status,
--   supplement_submitted, supplement_amount, final_payment_note
-- These are roofing/insurance job specific — null for all other trades.
--
-- Future fields added here, never on invoices.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS roofing_invoice_data (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id              UUID        NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
  pro_id                  UUID        NOT NULL REFERENCES pros(id) ON DELETE CASCADE,

  -- Insurance claim reconciliation
  insurance_company       TEXT,
  claim_number            TEXT,
  approved_amount         NUMERIC,
  deductible              NUMERIC,
  supplement_amount       NUMERIC,
  supplement_submitted    BOOLEAN     DEFAULT FALSE,
  supplement_approved     BOOLEAN     DEFAULT FALSE,

  -- Permit
  permit_number           TEXT,
  permit_status           TEXT,        -- 'pending' | 'approved' | 'closed'

  -- Completion docs
  lien_waiver_signed      BOOLEAN     DEFAULT FALSE,
  lien_waiver_r2_key      TEXT,        -- R2 path to signed lien waiver PDF
  certificate_of_completion BOOLEAN   DEFAULT FALSE,

  -- Notes specific to this invoice (not the estimate)
  final_payment_note      TEXT,

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_invoice_data_invoice
  ON roofing_invoice_data (invoice_id);

CREATE INDEX IF NOT EXISTS idx_roofing_invoice_data_pro
  ON roofing_invoice_data (pro_id);

ALTER TABLE roofing_invoice_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro owns roofing invoice data" ON roofing_invoice_data;
CREATE POLICY "pro owns roofing invoice data"
  ON roofing_invoice_data FOR ALL USING (pro_id = auth.uid());

-- Verify
SELECT 'roofing_invoice_data created' AS status,
       count(*) AS row_count
FROM roofing_invoice_data;
