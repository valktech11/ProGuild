-- v100: add photo_urls array to posts for multi-photo support
-- photo_url (single) kept for backwards compatibility

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}';

-- Backfill: copy existing photo_url into photo_urls array where set
UPDATE posts
  SET photo_urls = ARRAY[photo_url]
  WHERE photo_url IS NOT NULL AND photo_url != '' AND photo_urls = '{}';
