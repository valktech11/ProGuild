-- ============================================================
-- B2B Hiring Board Schema
-- Run in Supabase SQL Editor before deploying v22
-- ============================================================

-- Company accounts
CREATE TABLE IF NOT EXISTS companies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT,
  website         TEXT,
  city            TEXT,
  state           TEXT,
  company_type    TEXT CHECK (company_type IN ('General Contractor','Property Manager','HOA','Commercial Builder','Other')),
  description     TEXT,
  logo_url        TEXT,
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  plan_tier       TEXT NOT NULL DEFAULT 'Starter' CHECK (plan_tier IN ('Starter','Growth','Enterprise')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- B2B job postings
CREATE TABLE IF NOT EXISTS b2b_jobs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  trade_category_id   UUID REFERENCES trade_categories(id),
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  city                TEXT,
  state               TEXT,
  job_type            TEXT NOT NULL DEFAULT 'Full-time' CHECK (job_type IN ('Full-time','Part-time','Contract','Temporary','Apprentice')),
  duration            TEXT,
  pay_range_min       INTEGER,
  pay_range_max       INTEGER,
  pay_type            TEXT DEFAULT 'hourly' CHECK (pay_type IN ('hourly','daily','weekly','monthly','project')),
  requirements        TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  applications_count  INTEGER NOT NULL DEFAULT 0,
  posted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ
);

-- Pro applications
CREATE TABLE IF NOT EXISTS b2b_applications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id      UUID NOT NULL REFERENCES b2b_jobs(id) ON DELETE CASCADE,
  pro_id      UUID NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  message     TEXT,
  status      TEXT NOT NULL DEFAULT 'Applied' CHECK (status IN ('Applied','Viewed','Shortlisted','Rejected','Hired')),
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, pro_id)
);

-- RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_read"      ON companies        FOR SELECT USING (true);
CREATE POLICY "b2b_jobs_read"       ON b2b_jobs         FOR SELECT USING (is_active = true);
CREATE POLICY "b2b_apps_read"       ON b2b_applications FOR SELECT USING (true);

-- Update b2b_jobs applications_count when application inserted
CREATE OR REPLACE FUNCTION increment_b2b_applications()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE b2b_jobs SET applications_count = applications_count + 1 WHERE id = NEW.job_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER b2b_application_count
  AFTER INSERT ON b2b_applications
  FOR EACH ROW EXECUTE FUNCTION increment_b2b_applications();

SELECT 'B2B schema created' as status;
