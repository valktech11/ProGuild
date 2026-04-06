-- Run this in Supabase SQL Editor to fix storage permissions
-- Dashboard → SQL Editor → New query → paste → Run

-- Make sure avatars bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read on avatars bucket
CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Allow service role to upload (used by API route)
CREATE POLICY "avatars_service_upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars');

-- Allow service role to update/replace
CREATE POLICY "avatars_service_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars');

-- Allow service role to delete
CREATE POLICY "avatars_service_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars');
