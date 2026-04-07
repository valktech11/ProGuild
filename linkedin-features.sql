-- ============================================================
-- LinkedIn-style community upgrades + unclaimed profiles
-- Run in Supabase SQL Editor
-- ============================================================

-- ── UNCLAIMED PROFILE COLUMNS ───────────────────────────────
ALTER TABLE pros ADD COLUMN IF NOT EXISTS is_claimed   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE pros ADD COLUMN IF NOT EXISTS email_sent   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pros ADD COLUMN IF NOT EXISTS claimed_at   TIMESTAMPTZ;

-- Mark existing real signups as claimed
UPDATE pros SET is_claimed = true WHERE email NOT LIKE '%placeholder.tradesnetwork%';

-- ── AVAILABLE FOR WORK TOGGLE ────────────────────────────────
ALTER TABLE pros ADD COLUMN IF NOT EXISTS available_for_work BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pros ADD COLUMN IF NOT EXISTS available_note TEXT;

-- ── PROFILE COMPLETENESS ─────────────────────────────────────
-- Computed view for profile score (0-100)
CREATE OR REPLACE VIEW pro_completeness AS
SELECT
  id,
  full_name,
  (
    CASE WHEN full_name IS NOT NULL AND full_name != '' THEN 10 ELSE 0 END +
    CASE WHEN profile_photo_url IS NOT NULL THEN 20 ELSE 0 END +
    CASE WHEN bio IS NOT NULL AND LENGTH(bio) > 50 THEN 20 ELSE 0 END +
    CASE WHEN phone IS NOT NULL THEN 10 ELSE 0 END +
    CASE WHEN city IS NOT NULL THEN 10 ELSE 0 END +
    CASE WHEN years_experience IS NOT NULL THEN 10 ELSE 0 END +
    CASE WHEN license_number IS NOT NULL THEN 15 ELSE 0 END +
    CASE WHEN is_verified THEN 5 ELSE 0 END
  ) AS completeness_score,
  CASE WHEN profile_photo_url IS NULL THEN 'Add a profile photo (+20 pts)' 
       WHEN bio IS NULL OR LENGTH(bio) < 50 THEN 'Write a bio (+20 pts)'
       WHEN phone IS NULL THEN 'Add your phone number (+10 pts)'
       WHEN years_experience IS NULL THEN 'Add years of experience (+10 pts)'
       WHEN license_number IS NULL THEN 'Add your license number (+15 pts)'
       ELSE 'Profile complete!'
  END AS next_step
FROM pros;

-- ── SKILLS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pro_skills (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id     UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pro_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_skills_pro ON pro_skills(pro_id);

-- ── ENDORSEMENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_endorsements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id   UUID NOT NULL REFERENCES pro_skills(id) ON DELETE CASCADE,
  endorsed_by UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (skill_id, endorsed_by)
);

CREATE INDEX IF NOT EXISTS idx_endorsements_skill ON skill_endorsements(skill_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_endorser ON skill_endorsements(endorsed_by);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id     UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN (
    'new_lead','new_follower','post_liked','post_commented',
    'skill_endorsed','new_review','profile_viewed','trade_score_up'
  )),
  message    TEXT NOT NULL,
  link       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  actor_id   UUID REFERENCES pros(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifs_pro    ON notifications(pro_id);
CREATE INDEX IF NOT EXISTS idx_notifs_unread ON notifications(pro_id, is_read) WHERE is_read = false;

-- ── DIRECT MESSAGES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id   UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_id <> receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_convo    ON messages(sender_id, receiver_id);

-- ── WORK MILESTONES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id     UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN (
    'certification','business_anniversary','new_service_area',
    'hired_apprentice','completed_training','award'
  )),
  title      TEXT NOT NULL,
  description TEXT,
  date        DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_pro ON milestones(pro_id);

-- ── TRADE SCORE VIEW ─────────────────────────────────────────
-- Composite credibility score out of 100
CREATE OR REPLACE VIEW trade_score AS
SELECT
  p.id,
  p.full_name,
  LEAST(100, (
    -- License verified (25 pts)
    CASE WHEN p.is_verified THEN 25 ELSE 0 END +
    -- Profile photo (10 pts)
    CASE WHEN p.profile_photo_url IS NOT NULL THEN 10 ELSE 0 END +
    -- Bio written (10 pts)
    CASE WHEN p.bio IS NOT NULL AND LENGTH(p.bio) > 50 THEN 10 ELSE 0 END +
    -- Years experience (up to 15 pts)
    LEAST(15, COALESCE(p.years_experience, 0)) +
    -- Reviews (up to 20 pts, 2 pts each, max 10 reviews)
    LEAST(20, COALESCE(p.review_count, 0) * 2) +
    -- Avg rating bonus (up to 10 pts)
    CASE WHEN COALESCE(p.avg_rating, 0) >= 4.5 THEN 10
         WHEN COALESCE(p.avg_rating, 0) >= 4.0 THEN 7
         WHEN COALESCE(p.avg_rating, 0) >= 3.5 THEN 4
         ELSE 0 END +
    -- Followers (up to 5 pts)
    LEAST(5, (SELECT COUNT(*) FROM follows f WHERE f.following_id = p.id)) +
    -- Skills added (up to 5 pts)
    LEAST(5, (SELECT COUNT(*) FROM pro_skills s WHERE s.pro_id = p.id))
  )) AS trade_score
FROM pros p
WHERE p.profile_status = 'Active';

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE pro_skills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skills_public_read"       ON pro_skills        FOR SELECT USING (true);
CREATE POLICY "endorsements_public_read" ON skill_endorsements FOR SELECT USING (true);
CREATE POLICY "milestones_public_read"   ON milestones        FOR SELECT USING (true);
CREATE POLICY "notifications_read"       ON notifications     FOR SELECT USING (true);
CREATE POLICY "messages_read"            ON messages          FOR SELECT USING (true);

-- ── NOTIFY ON NEW FOLLOWER ───────────────────────────────────
CREATE OR REPLACE FUNCTION notify_new_follower()
RETURNS TRIGGER AS $$
DECLARE
  follower_name TEXT;
BEGIN
  SELECT full_name INTO follower_name FROM pros WHERE id = NEW.follower_id;
  INSERT INTO notifications (pro_id, type, message, link, actor_id)
  VALUES (
    NEW.following_id,
    'new_follower',
    follower_name || ' started following you',
    '/community/profile/' || NEW.follower_id,
    NEW.follower_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_new_follower
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION notify_new_follower();

-- ── NOTIFY ON POST LIKE ──────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_post_liked()
RETURNS TRIGGER AS $$
DECLARE
  liker_name TEXT;
  post_owner UUID;
BEGIN
  SELECT full_name INTO liker_name FROM pros WHERE id = NEW.pro_id;
  SELECT pro_id INTO post_owner FROM posts WHERE id = NEW.post_id;
  IF post_owner != NEW.pro_id THEN
    INSERT INTO notifications (pro_id, type, message, link, actor_id)
    VALUES (
      post_owner,
      'post_liked',
      liker_name || ' liked your post',
      '/community',
      NEW.pro_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_post_liked
  AFTER INSERT ON post_likes
  FOR EACH ROW EXECUTE FUNCTION notify_post_liked();

-- ── NOTIFY ON SKILL ENDORSED ─────────────────────────────────
CREATE OR REPLACE FUNCTION notify_skill_endorsed()
RETURNS TRIGGER AS $$
DECLARE
  endorser_name TEXT;
  skill_name    TEXT;
  skill_owner   UUID;
BEGIN
  SELECT full_name INTO endorser_name FROM pros WHERE id = NEW.endorsed_by;
  SELECT ps.skill_name, ps.pro_id INTO skill_name, skill_owner
  FROM pro_skills ps WHERE id = NEW.skill_id;
  IF skill_owner != NEW.endorsed_by THEN
    INSERT INTO notifications (pro_id, type, message, link, actor_id)
    VALUES (
      skill_owner,
      'skill_endorsed',
      endorser_name || ' endorsed your skill in ' || skill_name,
      '/community/profile/' || skill_owner,
      NEW.endorsed_by
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_skill_endorsed
  AFTER INSERT ON skill_endorsements
  FOR EACH ROW EXECUTE FUNCTION notify_skill_endorsed();

-- ════════════════════════════════════════════════════════════
-- DONE — new tables: pro_skills, skill_endorsements,
-- notifications, messages, milestones
-- New views: trade_score, pro_completeness
-- New columns: is_claimed, email_sent, claimed_at,
--              available_for_work, available_note
-- ════════════════════════════════════════════════════════════
