-- Ensure post_likes table exists with unique constraint
create table if not exists post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  pro_id uuid not null references pros(id) on delete cascade,
  created_at timestamptz default now(),
  unique(post_id, pro_id)
);

-- RPC to safely increment like_count
create or replace function increment_like_count(post_id_param uuid)
returns void language sql as $$
  update posts set like_count = coalesce(like_count, 0) + 1 where id = post_id_param;
$$;

-- RPC to safely decrement like_count (floor at 0)
create or replace function decrement_like_count(post_id_param uuid)
returns void language sql as $$
  update posts set like_count = greatest(coalesce(like_count, 0) - 1, 0) where id = post_id_param;
$$;
