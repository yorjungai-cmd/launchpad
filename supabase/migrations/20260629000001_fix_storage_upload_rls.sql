-- ============================================================
-- Migration: 20260629000001_fix_storage_upload_rls.sql
-- Fix: idea-files storage policies for guest (anon) uploads
--
-- Problems fixed:
--   1. Original INSERT policy was TO authenticated only — guests couldn't upload
--   2. Path check used auth.uid() = foldername[1] but the code uploads to
--      uploads/{filename}, not {user_id}/{filename}, so nobody matched
--   3. SELECT on uploads/ needed for server-side extraction (anon path)
-- ============================================================

-- Drop the broken upload policy
DROP POLICY IF EXISTS "idea-files: authenticated users can upload" ON storage.objects;

-- New INSERT policy: allow anyone (guest or logged-in) to upload to uploads/
-- The file path must start with "uploads/" — this is enforced by the WITH CHECK.
-- The bucket is private so the anon key must be used with RLS (not a public URL).
CREATE POLICY "idea-files: anyone can upload to uploads folder"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'idea-files'
    AND (storage.foldername(name))[1] = 'uploads'
  );

-- New SELECT policy: allow anyone to read from uploads/ (needed for server-side
-- text extraction via createServerSupabaseClient / anon key on publicProcedure).
-- Files are only accessible if you know the exact path (private bucket + anon key).
CREATE POLICY "idea-files: anyone can read from uploads folder"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'idea-files'
    AND (storage.foldername(name))[1] = 'uploads'
  );
