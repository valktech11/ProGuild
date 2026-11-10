-- ProGuild — claim attribution columns
-- ===========================================================================
-- Capture how each contractor arrived when they claim their profile, so we can
-- tell organic (Google/direct) from email/claim-link conversions. Populated by
-- the claim routes (app/api/claim/*) from the pg_attr first-touch cookie set by
-- components/AttributionCapture. RUN once in the Supabase SQL editor. Idempotent.
-- ===========================================================================

alter table pros add column if not exists claimed_via    text;  -- 'token' | 'by-license'
alter table pros add column if not exists claim_source   text;  -- 'google' | 'search' | <host> | 'direct' | <utm_source>
alter table pros add column if not exists claim_referrer text;  -- raw document.referrer at first touch
alter table pros add column if not exists claim_landing  text;  -- first landing path (+ query)

-- Reporting: channel split of real claims
--   select claimed_via, claim_source, count(*) from pros
--   where is_claimed = true and email not like '%mailinator%' and full_name not ilike '%(TEST)%'
--   group by 1, 2 order by 3 desc;
