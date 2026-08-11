-- backfill-trade-slug-v79.sql
-- Run ONCE in Supabase staging SQL Editor.
--
-- Root cause: complete-profile INSERT never wrote pros.trade_slug, so every
-- account has trade_slug = null. Roofing masked it (default entry stage happened
-- to be compatible); HVAC exposed it (leads landed in 'new' / 'lead_in' which
-- are not HVAC stages, so the board showed 0).

-- ── 1. Backfill pros.trade_slug from trade_categories ────────────────────────
UPDATE pros p
SET    trade_slug = tc.slug
FROM   trade_categories tc
WHERE  p.trade_category_id = tc.id
AND    p.trade_slug IS NULL;

-- ── 2. Fix leads created with the wrong initial stage ────────────────────────
-- Any HVAC pro's leads that landed in 'new' or 'lead_in' (the default/roofing
-- entry stages) should be 'new_call' (the HVAC entry stage), and carry the slug.
UPDATE leads l
SET    lead_status = 'new_call',
       trade_slug  = p.trade_slug
FROM   pros p
WHERE  l.pro_id = p.id
AND    p.trade_slug = 'hvac-technician'
AND    l.lead_status IN ('new', 'lead_in');

-- ── 3. Backfill trade_slug on all other leads from their pro ─────────────────
UPDATE leads l
SET    trade_slug = p.trade_slug
FROM   pros p
WHERE  l.pro_id = p.id
AND    l.trade_slug IS NULL
AND    p.trade_slug IS NOT NULL;

-- ── 4. Verify ────────────────────────────────────────────────────────────────
SELECT p.email, p.trade_slug AS pro_slug,
       l.contact_name, l.lead_status, l.trade_slug AS lead_slug
FROM   leads l
JOIN   pros p ON l.pro_id = p.id
WHERE  p.trade_slug = 'hvac-technician'
ORDER  BY l.created_at DESC
LIMIT  20;
