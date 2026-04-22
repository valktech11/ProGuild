-- ── v55 schema additions ──────────────────────────────────────────────────────
-- Before/After slider support on community feed posts

ALTER TABLE posts ADD COLUMN IF NOT EXISTS before_photo_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_before_after  BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_posts_before_after ON posts(is_before_after) WHERE is_before_after = true;

SELECT 'v55 schema ready' as status;
