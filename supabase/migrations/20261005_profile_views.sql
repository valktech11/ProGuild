-- Profile views tracking
-- Records each visit to /pro/[slug] by logged-in pros or anonymous guests.
-- Deduplication is handled application-side (cookie session token, 24h window).

create table if not exists profile_views (
  id              uuid primary key default gen_random_uuid(),
  pro_id          uuid not null references pros(id) on delete cascade,
  viewer_id       uuid references pros(id) on delete set null,  -- null = anonymous
  viewer_type     text not null check (viewer_type in ('pro', 'anonymous')),
  session_token   text,           -- hashed cookie token for anon dedup (24h TTL)
  created_at      timestamptz not null default now()
);

-- Lookup: views per pro (most common query)
create index if not exists profile_views_pro_id_created_at
  on profile_views (pro_id, created_at desc);

-- Lookup: has this viewer already viewed this pro in last 24h?
create index if not exists profile_views_dedup
  on profile_views (pro_id, viewer_id, created_at desc)
  where viewer_id is not null;

-- Lookup: anon dedup by session token
create index if not exists profile_views_anon_dedup
  on profile_views (pro_id, session_token, created_at desc)
  where session_token is not null;

-- RLS: pros can read their own view counts; insert is server-only (admin key)
alter table profile_views enable row level security;

create policy "pros_read_own_views" on profile_views
  for select using (auth.uid() = pro_id);

-- No insert policy — inserts go through admin key in the API route only
