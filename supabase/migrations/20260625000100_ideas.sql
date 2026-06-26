-- ============================================================
-- Migration: 20260625000100_ideas.sql
-- Description: idea-submission unit — enums, ideas table, indexes, RLS
-- Depends on:
--   20260625000000_init.sql  (set_updated_at function)
--   20260625000001_profiles.sql  (app_role enum, profiles table)
-- ============================================================

-- ─── Task 1.1: Enums ─────────────────────────────────────────────────────────

-- Who is submitting an idea
CREATE TYPE submitter_type AS ENUM (
  'employee',
  'executive',
  'partner',
  'vendor'
);

-- How the idea content was provided
CREATE TYPE input_type AS ENUM (
  'text',
  'file',
  'url'
);

-- AI analysis pipeline state
CREATE TYPE analysis_status AS ENUM (
  'pending',
  'processing',
  'analysis_complete',
  'failed'
);

-- NOTE: `stage` enum was already defined in foundation — NOT redefined here.
-- Reuse: sandbox | validation_sprint | build_sprint | launch_and_test

-- ─── Task 1.2: ideas table ────────────────────────────────────────────────────

CREATE TABLE ideas (
  -- Identity
  id                  uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number    text            NOT NULL UNIQUE,  -- format LP-[A-Z0-9]{8}

  -- Submitter info
  title               text            NOT NULL CHECK (char_length(title) <= 500),
  submitter_name      text            NOT NULL CHECK (char_length(submitter_name) <= 255),
  submitter_email     text            NOT NULL,
  submitter_type      submitter_type  NOT NULL,

  -- Auth link (null for guest)
  user_id             uuid            REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Content
  input_type          input_type      NOT NULL,
  raw_content         text,            -- for input_type = 'text'
  file_url            text,            -- Supabase Storage path, for input_type = 'file'
  file_original_name  text,            -- original filename
  source_url          text,            -- for input_type = 'url'
  extracted_text      text,            -- extracted text from file/url (or copy of raw_content)

  -- Pipeline state
  current_stage       stage           NOT NULL DEFAULT 'sandbox',
  analysis_status     analysis_status NOT NULL DEFAULT 'pending',

  -- Timestamps
  created_at          timestamptz     NOT NULL DEFAULT now(),
  updated_at          timestamptz     NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- reference_number: UNIQUE constraint already creates an implicit index

-- Used by listIdeasByUser (authenticated submitter)
CREATE INDEX ideas_user_id_idx
  ON ideas (user_id);

-- Used by AI retry queue
CREATE INDEX ideas_analysis_status_idx
  ON ideas (analysis_status);

-- Used by guest tracking (reference_number + email lookup)
CREATE INDEX ideas_submitter_email_reference_number_idx
  ON ideas (submitter_email, reference_number);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
CREATE TRIGGER set_ideas_updated_at
  BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Task 1.3: RLS policies ───────────────────────────────────────────────────
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

-- Policy 1: Owner can read their own ideas (authenticated)
CREATE POLICY "ideas: owner can read own"
  ON ideas
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- Policy 2: Owner can update their own ideas (authenticated)
CREATE POLICY "ideas: owner can update own"
  ON ideas
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- Policy 3: BD Reviewer / Admin can read all ideas
CREATE POLICY "ideas: bd_reviewer and admin can read all"
  ON ideas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  );

-- Policy 4: Service role can insert (server-side tRPC procedures only)
-- auth.role() = 'service_role' bypasses RLS entirely in Supabase, so this
-- policy is a belt-and-suspenders explicit grant for explicit service clients.
CREATE POLICY "ideas: service role can insert"
  ON ideas
  FOR INSERT
  WITH CHECK (true);

-- Policy 5: Guest read via reference_number + submitter_email match (no auth)
-- Caller must set session variables before querying:
--   SELECT set_config('app.reference_number', $1, true);
--   SELECT set_config('app.submitter_email',  $2, true);
-- Returns empty if variables are not set or do not match.
CREATE POLICY "ideas: guest can read via reference_number and email"
  ON ideas
  FOR SELECT
  USING (
    auth.uid() IS NULL
    AND reference_number = current_setting('app.reference_number', true)
    AND submitter_email  = current_setting('app.submitter_email',  true)
    AND current_setting('app.reference_number', true) <> ''
    AND current_setting('app.submitter_email',  true) <> ''
  );
