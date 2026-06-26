-- ============================================================
-- Migration: 20260625000002_storage.sql
-- Description: Supabase Storage bucket `idea-files` + access policies
-- Depends on: 20260625000001_profiles.sql (app_role enum, profiles table)
-- ============================================================

-- ─── idea-files bucket ───────────────────────────────────────────────────────
-- Stores uploaded files attached to idea submissions (PDF, PPTX, DOCX).
-- Max file size: 50MB (enforced by storage.buckets.file_size_limit)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'idea-files',
  'idea-files',
  false,    -- private bucket — access via signed URLs or RLS
  52428800, -- 50 MB in bytes
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', -- .pptx
    'application/vnd.ms-powerpoint',   -- .ppt
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   -- .docx
    'application/msword',              -- .doc
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ─── Storage RLS policies ─────────────────────────────────────────────────────
-- Note: storage.objects RLS must be enabled (it is by default in Supabase)

-- Policy: authenticated users can upload files to their own folder
-- Files are stored as: idea-files/{user_id}/{filename}
CREATE POLICY "idea-files: authenticated users can upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'idea-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: file owner can read their own files
CREATE POLICY "idea-files: owner can read own files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'idea-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: BD reviewers can read all idea files
CREATE POLICY "idea-files: bd_reviewer can read all files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'idea-files'
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  );

-- Policy: owner can delete own files
CREATE POLICY "idea-files: owner can delete own files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'idea-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy: admin can delete any file
CREATE POLICY "idea-files: admin can delete any file"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'idea-files'
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
