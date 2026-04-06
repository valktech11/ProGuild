-- ============================================================
-- TradeCommunity — Additional Tables
-- Run in Supabase SQL Editor AFTER the main schema
-- Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- ── PORTFOLIO ITEMS ─────────────────────────────────────────
CREATE TABLE portfolio_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id      UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  photo_url   TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  trade       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portfolio_pro ON portfolio_items(pro_id);

-- ── POSTS ───────────────────────────────────────────────────
CREATE TABLE posts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id     UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  photo_url  TEXT,
  post_type  TEXT NOT NULL DEFAULT 'update'
             CHECK (post_type IN ('update','work','tip','milestone')),
  like_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_pro      ON posts(pro_id);
CREATE INDEX idx_posts_created  ON posts(created_at DESC);

-- ── POST LIKES ──────────────────────────────────────────────
CREATE TABLE post_likes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  pro_id     UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, pro_id)
);

CREATE INDEX idx_likes_post ON post_likes(post_id);

-- ── POST COMMENTS ───────────────────────────────────────────
CREATE TABLE post_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  pro_id     UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_post ON post_comments(post_id);

-- ── FOLLOWS ─────────────────────────────────────────────────
CREATE TABLE follows (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id  UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX idx_follows_follower  ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- ── LIKE/COMMENT COUNT TRIGGERS ─────────────────────────────
CREATE OR REPLACE FUNCTION update_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER post_like_count
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION update_like_count();

CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER post_comment_count
  AFTER INSERT OR DELETE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_count();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows         ENABLE ROW LEVEL SECURITY;

-- Public read on portfolio, posts, comments
CREATE POLICY "portfolio_public_read" ON portfolio_items FOR SELECT USING (true);
CREATE POLICY "posts_public_read"     ON posts           FOR SELECT USING (true);
CREATE POLICY "comments_public_read"  ON post_comments   FOR SELECT USING (true);
CREATE POLICY "follows_public_read"   ON follows         FOR SELECT USING (true);
CREATE POLICY "likes_public_read"     ON post_likes      FOR SELECT USING (true);

-- ── STORAGE BUCKET FOR PORTFOLIO ────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio', 'portfolio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "portfolio_public_read_storage"
ON storage.objects FOR SELECT USING (bucket_id = 'portfolio');

CREATE POLICY "portfolio_service_upload"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'portfolio');

CREATE POLICY "portfolio_service_update"
ON storage.objects FOR UPDATE USING (bucket_id = 'portfolio');

CREATE POLICY "portfolio_service_delete"
ON storage.objects FOR DELETE USING (bucket_id = 'portfolio');

-- ── DONE ────────────────────────────────────────────────────
-- 5 new tables: portfolio_items, posts, post_likes, post_comments, follows
-- Portfolio storage bucket created and policies set
