-- ============================================================
-- v71 SQL — run in Supabase SQL Editor BEFORE deploying v71
-- ============================================================

-- 1. Review flags table
CREATE TABLE IF NOT EXISTS review_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   UUID REFERENCES reviews(id) ON DELETE CASCADE,
  pro_id      UUID REFERENCES pros(id) ON DELETE CASCADE,
  reason      TEXT CHECK (reason IN ('Inappropriate','Fake','Wrong pro')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(review_id, pro_id)
);
CREATE INDEX IF NOT EXISTS idx_review_flags_review ON review_flags(review_id);

-- 2. RLS on review_flags
ALTER TABLE review_flags ENABLE ROW LEVEL SECURITY;

-- Drop first in case re-running
DROP POLICY IF EXISTS "pros insert own flags" ON review_flags;
DROP POLICY IF EXISTS "pros read own flags" ON review_flags;

CREATE POLICY "pros insert own flags" ON review_flags
  FOR INSERT WITH CHECK (pro_id = auth.uid());

CREATE POLICY "pros read own flags" ON review_flags
  FOR SELECT USING (pro_id = auth.uid());

-- Done. Deploy v71 after running this.
