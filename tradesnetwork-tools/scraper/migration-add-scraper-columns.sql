-- Add scraper columns to pros table
-- Run this in Supabase SQL editor before running the scraper

ALTER TABLE pros
  ADD COLUMN IF NOT EXISTS website_url    TEXT,
  ADD COLUMN IF NOT EXISTS scraped_email  TEXT,
  ADD COLUMN IF NOT EXISTS scrape_status  TEXT
    CHECK (scrape_status IN ('found', 'no_email', 'no_website')),
  ADD COLUMN IF NOT EXISTS scrape_date    TIMESTAMPTZ;

-- Index for querying unscraped pros efficiently
CREATE INDEX IF NOT EXISTS idx_pros_scrape_status
  ON pros (scrape_status, is_claimed, profile_status);

-- View to check scraper progress
CREATE OR REPLACE VIEW scraper_progress AS
SELECT
  tc.category_name                                    AS trade,
  COUNT(*)                                            AS total,
  COUNT(*) FILTER (WHERE p.scrape_status = 'found')  AS emails_found,
  COUNT(*) FILTER (WHERE p.scrape_status = 'no_email') AS site_no_email,
  COUNT(*) FILTER (WHERE p.scrape_status = 'no_website') AS no_website,
  COUNT(*) FILTER (WHERE p.scrape_status IS NULL)    AS not_yet_scraped,
  ROUND(
    COUNT(*) FILTER (WHERE p.scrape_status = 'found')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE p.scrape_status IS NOT NULL), 0) * 100, 1
  )                                                   AS email_hit_rate_pct
FROM pros p
JOIN trade_categories tc ON tc.id = p.trade_category_id
WHERE p.is_claimed = false
  AND p.profile_status = 'Active'
GROUP BY tc.category_name
ORDER BY total DESC;
