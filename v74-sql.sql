-- ============================================================
-- v74 SQL — run in Supabase SQL Editor BEFORE deploying v74
-- ============================================================

-- 1. Clients table
CREATE TABLE IF NOT EXISTS clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id            UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  phone             TEXT,
  email             TEXT,
  address_line1     TEXT,
  city              TEXT,
  state             TEXT,
  zip               TEXT,
  preferred_contact TEXT DEFAULT 'call' CHECK (preferred_contact IN ('call','text','email')),
  notes             TEXT,
  tags              TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_pro ON clients(pro_id);

-- RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pros manage own clients" ON clients;
CREATE POLICY "pros manage own clients" ON clients
  USING (pro_id = auth.uid())
  WITH CHECK (pro_id = auth.uid());

-- 2. Link leads to clients
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client_id);

-- 3. Extend lead_source to support manual/external sources
-- (The CHECK constraint on lead_source may need updating — check first)
-- If there's a constraint, drop and recreate:
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_lead_source_check
  CHECK (lead_status IS NOT NULL);

-- ============================================================
-- Done. Deploy v74 after running this.
-- ============================================================
