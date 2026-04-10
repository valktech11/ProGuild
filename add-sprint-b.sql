-- ============================================================
-- Sprint B Schema Additions
-- Run in Supabase SQL Editor before deploying v23
-- ============================================================

-- 1. License expiry date on pros
ALTER TABLE pros ADD COLUMN IF NOT EXISTS license_expiry_date DATE;
ALTER TABLE pros ADD COLUMN IF NOT EXISTS license_status TEXT DEFAULT 'unknown'
  CHECK (license_status IN ('active','expiring_soon','expired','unknown'));

-- 2. Equipment proficiency tags
CREATE TABLE IF NOT EXISTS pro_equipment (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id     UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  certified  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pro_id, name)
);
ALTER TABLE pro_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment_read"   ON pro_equipment FOR SELECT USING (true);
CREATE POLICY "equipment_insert" ON pro_equipment FOR INSERT WITH CHECK (true);
CREATE POLICY "equipment_delete" ON pro_equipment FOR DELETE USING (true);

-- 3. Apprenticeship hours log
CREATE TABLE IF NOT EXISTS apprenticeship_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id      UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  hours       NUMERIC(5,1) NOT NULL CHECK (hours > 0 AND hours <= 24),
  description TEXT,
  supervisor  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pros ADD COLUMN IF NOT EXISTS apprenticeship_target_hours INTEGER DEFAULT 8000;

ALTER TABLE apprenticeship_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apprenticeship_read"   ON apprenticeship_log FOR SELECT USING (true);
CREATE POLICY "apprenticeship_insert" ON apprenticeship_log FOR INSERT WITH CHECK (true);
CREATE POLICY "apprenticeship_delete" ON apprenticeship_log FOR DELETE USING (true);

-- 4. OSHA card self-reporting
ALTER TABLE pros ADD COLUMN IF NOT EXISTS osha_card_type   TEXT CHECK (osha_card_type IN ('OSHA-10','OSHA-30','OSHA-500','OSHA-510'));
ALTER TABLE pros ADD COLUMN IF NOT EXISTS osha_card_number TEXT;
ALTER TABLE pros ADD COLUMN IF NOT EXISTS osha_card_expiry DATE;

-- 5. User preferred language
ALTER TABLE pros ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en' CHECK (preferred_language IN ('en','es'));

-- Add email_sent column if missing
ALTER TABLE pros ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pros ADD COLUMN IF NOT EXISTS is_claimed  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE pros ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ;

-- Verify
SELECT 'Sprint B schema ready' as status;
