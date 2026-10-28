-- ProGuild — city_slug backfill + city-sitemap aggregation
-- ===========================================================================
-- WHY: the /fl/{trade}/{city} directory pages matched pros by reconstructing a
-- city name from the URL slug, which only worked for 15 hardcoded cities; every
-- other city rendered empty. This denormalises a stable `city_slug` on pros
-- (mirrors the existing trade_slug), so the page and the sitemap match on it
-- exactly — the same pattern used for trade_slug.
--
-- RUN once in the Supabase SQL editor (prod). Safe/idempotent; re-runnable.
-- The slug formula MUST stay identical to cityToSlug() in
-- config/dbpr-trades.ts (trim -> lower -> drop '.' -> spaces to '-' -> collapse).
-- ===========================================================================

-- 1. Column
alter table pros add column if not exists city_slug text;

-- 2. Backfill — mirrors cityToSlug() exactly
update pros
set city_slug = regexp_replace(
                  regexp_replace(
                    replace(lower(btrim(city)), '.', ''),
                  '\s+', '-', 'g'),
                '-+', '-', 'g')
where city is not null and btrim(city) <> '';

-- 3. Indexes (equality lookups from the page + the sitemap RPC)
create index if not exists idx_pros_city_slug
  on pros (city_slug);
create index if not exists idx_pros_trade_city_active
  on pros (trade_slug, city_slug) where profile_status = 'Active';

-- 4. Sitemap aggregation: (trade, city) combos with >= min_count LISTABLE pros.
--    Mirrors the city page's own listing gate (Active + has category + claimed
--    OR has a license number) so we never emit a page that shows fewer pros
--    than the floor. Output cols are prefixed to avoid name-shadowing.
create or replace function public.city_trade_sitemap(min_count int, trade_slugs text[])
returns table(out_trade text, out_city text, n bigint)
language sql stable as $$
  select p.trade_slug, p.city_slug, count(*)::bigint
  from pros p
  where p.profile_status = 'Active'
    and p.trade_slug = any(trade_slugs)
    and p.city_slug is not null
    and p.trade_category_id is not null
    and (p.is_claimed = true or p.license_number is not null)
  group by p.trade_slug, p.city_slug
  having count(*) >= min_count;
$$;

-- Sanity checks (optional):
--   select count(*) from pros where city_slug is not null;
--   select * from city_trade_sitemap(3, array['roofing','hvac-technician']) order by n desc limit 20;
