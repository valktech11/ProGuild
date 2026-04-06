-- ============================================================
-- TradesNetwork — Supabase PostgreSQL Schema
-- Run this entire file in the Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TRADE CATEGORIES ────────────────────────────────────────
CREATE TABLE trade_categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_name TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROS ────────────────────────────────────────────────────
CREATE TABLE pros (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name          TEXT NOT NULL,
  email              TEXT NOT NULL UNIQUE,
  phone              TEXT,
  city               TEXT,
  state              TEXT,
  zip_code           TEXT,
  bio                TEXT,
  years_experience   INTEGER,
  profile_photo_url  TEXT,
  license_number     TEXT,
  is_verified        BOOLEAN NOT NULL DEFAULT false,
  plan_tier          TEXT NOT NULL DEFAULT 'Free'
                     CHECK (plan_tier IN (
                       'Free','Pro','Elite',
                       'Pro_Founding','Elite_Founding',
                       'Pro_Annual','Elite_Annual',
                       'Pro_Founding_Annual','Elite_Founding_Annual'
                     )),
  stripe_customer_id TEXT,
  profile_status     TEXT NOT NULL DEFAULT 'Active'
                     CHECK (profile_status IN ('Active','Suspended','Pending_Review')),
  trade_category_id  UUID REFERENCES trade_categories(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── JOBS ────────────────────────────────────────────────────
CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  homeowner_name    TEXT NOT NULL,
  homeowner_email   TEXT NOT NULL,
  homeowner_phone   TEXT,
  trade_category_id UUID REFERENCES trade_categories(id) ON DELETE SET NULL,
  city              TEXT,
  state             TEXT,
  zip_code          TEXT,
  description       TEXT NOT NULL,
  budget_range      TEXT CHECK (budget_range IN (
                      'Under $500','$500–$2K','$2K–$10K','$10K+','Negotiable'
                    )),
  job_status        TEXT NOT NULL DEFAULT 'Open'
                    CHECK (job_status IN ('Open','In_Progress','Filled','Expired','Cancelled')),
  is_boosted        BOOLEAN NOT NULL DEFAULT false,
  expires_at        DATE,
  posted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── APPLICATIONS ────────────────────────────────────────────
CREATE TABLE applications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id     UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  cover_note TEXT,
  status     TEXT NOT NULL DEFAULT 'Submitted'
             CHECK (status IN ('Submitted','Viewed','Shortlisted','Rejected','Hired')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pro_id, job_id)
);

-- ── LEADS ───────────────────────────────────────────────────
CREATE TABLE leads (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id         UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  job_id         UUID REFERENCES jobs(id) ON DELETE SET NULL,
  contact_name   TEXT NOT NULL,
  contact_email  TEXT NOT NULL,
  contact_phone  TEXT,
  message        TEXT NOT NULL,
  lead_status    TEXT NOT NULL DEFAULT 'New'
                 CHECK (lead_status IN ('New','Contacted','Converted','Archived')),
  lead_source    TEXT NOT NULL DEFAULT 'Profile_Page'
                 CHECK (lead_source IN ('Profile_Page','Job_Post','Search_Result','Direct')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── REVIEWS ─────────────────────────────────────────────────
CREATE TABLE reviews (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id         UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  job_id         UUID REFERENCES jobs(id) ON DELETE SET NULL,
  reviewer_name  TEXT NOT NULL,
  reviewer_email TEXT NOT NULL,
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  is_approved    BOOLEAN NOT NULL DEFAULT false,
  reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SUBSCRIPTIONS ───────────────────────────────────────────
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id          UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  stripe_sub_id   TEXT,
  plan_name       TEXT NOT NULL,
  sub_status      TEXT NOT NULL DEFAULT 'Active'
                  CHECK (sub_status IN ('Active','Cancelled','Past_Due','Trialing')),
  start_date      DATE,
  renewal_date    DATE,
  amount_usd      NUMERIC(10,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROS WITH STATS VIEW ────────────────────────────────────
-- Created AFTER reviews and leads tables exist
CREATE VIEW pros_with_stats AS
SELECT
  p.*,
  COALESCE(ROUND(AVG(r.rating)::NUMERIC, 1), 0) AS avg_rating,
  COUNT(DISTINCT r.id) FILTER (WHERE r.is_approved) AS review_count,
  COUNT(DISTINCT l.id) AS lead_count
FROM pros p
LEFT JOIN reviews r ON r.pro_id = p.id
LEFT JOIN leads   l ON l.pro_id = p.id
GROUP BY p.id;

-- ── INDEXES ─────────────────────────────────────────────────
CREATE INDEX idx_pros_email           ON pros(email);
CREATE INDEX idx_pros_status          ON pros(profile_status);
CREATE INDEX idx_pros_trade           ON pros(trade_category_id);
CREATE INDEX idx_pros_plan            ON pros(plan_tier);
CREATE INDEX idx_jobs_status          ON jobs(job_status);
CREATE INDEX idx_jobs_trade           ON jobs(trade_category_id);
CREATE INDEX idx_leads_pro            ON leads(pro_id);
CREATE INDEX idx_reviews_pro          ON reviews(pro_id);
CREATE INDEX idx_reviews_approved     ON reviews(is_approved);
CREATE INDEX idx_applications_pro     ON applications(pro_id);
CREATE INDEX idx_applications_job     ON applications(job_id);

-- ── UPDATED_AT TRIGGER ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pros_updated_at
  BEFORE UPDATE ON pros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ROW LEVEL SECURITY ──────────────────────────────────────
-- Enable RLS on all tables
ALTER TABLE trade_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pros             ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions    ENABLE ROW LEVEL SECURITY;

-- Public read policies (trade_categories, pros, jobs, reviews)
CREATE POLICY "trade_categories_public_read" ON trade_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "pros_public_read" ON pros
  FOR SELECT USING (profile_status = 'Active');

CREATE POLICY "jobs_public_read" ON jobs
  FOR SELECT USING (job_status = 'Open');

CREATE POLICY "reviews_public_read" ON reviews
  FOR SELECT USING (is_approved = true);

-- Service role can do everything (used by API routes)
-- Service role bypasses RLS by default — no policy needed

-- ── SEED TRADE CATEGORIES ───────────────────────────────────
INSERT INTO trade_categories (category_name, slug) VALUES
  ('Electrician',        'electrician'),
  ('Plumber',            'plumber'),
  ('HVAC Technician',    'hvac-technician'),
  ('Carpenter',          'carpenter'),
  ('Roofer',             'roofer'),
  ('Painter',            'painter'),
  ('Landscaper',         'landscaper'),
  ('General Contractor', 'general-contractor'),
  ('Mason',              'mason'),
  ('Welder',             'welder'),
  ('Tile Setter',        'tile-setter'),
  ('Flooring',           'flooring'),
  ('Pest Control',       'pest-control'),
  ('Solar Installer',    'solar-installer'),
  ('Handyman',           'handyman');

-- ── DONE ────────────────────────────────────────────────────
-- Schema is ready. All 15 trade categories seeded.
-- Next: Set NEXT_PUBLIC_SUPABASE_URL and keys in .env.local
