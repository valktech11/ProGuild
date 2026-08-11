-- Fix notifications table to add actor_id if missing,
-- or drop the broken trigger on post_likes if notifications isn't set up yet.

-- Option A: add missing actor_id column to notifications (if table exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'notifications') then
    if not exists (select 1 from information_schema.columns where table_name = 'notifications' and column_name = 'actor_id') then
      alter table notifications add column actor_id uuid references pros(id) on delete cascade;
    end if;
  end if;
end $$;

-- Drop the broken trigger on post_likes so likes don't fail
drop trigger if exists on_post_liked on post_likes;
drop trigger if exists notify_on_like on post_likes;
drop trigger if exists post_likes_notification on post_likes;
