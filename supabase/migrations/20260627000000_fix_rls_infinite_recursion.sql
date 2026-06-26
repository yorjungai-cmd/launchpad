-- =============================================================================
-- Migration: 20260627000000_fix_rls_infinite_recursion.sql
-- Description: Fix infinite recursion in RLS policies
--
-- Root cause:
--   All role-check policies used EXISTS (SELECT 1 FROM profiles WHERE ...).
--   When any table's policy queries profiles, it triggers profiles' own RLS
--   policies which also query profiles → infinite recursion.
--
-- Fix:
--   Replace all "SELECT FROM profiles" role checks with JWT claim lookup:
--     (auth.jwt() -> 'user_metadata' ->> 'role')
--   This reads the role directly from the session JWT (set in user_metadata
--   when the user was created / role was updated) — zero DB round-trip,
--   zero recursion risk.
--
-- Helper function:
--   auth_user_role() — returns the role from JWT user_metadata
--   auth_user_has_role(role) — returns true if JWT role matches
-- =============================================================================

-- ─── Helper functions ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() -> 'raw_user_meta_data' ->> 'role',
    'internal_submitter'
  )
$$;

CREATE OR REPLACE FUNCTION auth_user_has_role(required_role text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT auth_user_role() = required_role
$$;

CREATE OR REPLACE FUNCTION auth_user_has_any_role(required_roles text[])
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT auth_user_role() = ANY(required_roles)
$$;

-- ─── profiles policies ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles: admin can read all profiles" ON profiles;
DROP POLICY IF EXISTS "profiles: admin can update all profiles" ON profiles;

CREATE POLICY "profiles: admin can read all profiles"
  ON profiles FOR SELECT
  USING (auth_user_has_role('admin'));

CREATE POLICY "profiles: admin can update all profiles"
  ON profiles FOR UPDATE
  USING (auth_user_has_role('admin'))
  WITH CHECK (auth_user_has_role('admin'));

-- ─── ideas policies ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ideas: bd_reviewer and admin can read all" ON ideas;

CREATE POLICY "ideas: bd_reviewer and admin can read all"
  ON ideas FOR SELECT
  USING (auth_user_has_any_role(ARRAY['bd_reviewer', 'admin']));

-- ─── ai_analyses policies ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ai_analyses: bd_reviewer can select all" ON ai_analyses;
DROP POLICY IF EXISTS "ai_analyses: bd_reviewer and admin can update" ON ai_analyses;

CREATE POLICY "ai_analyses: bd_reviewer can select all"
  ON ai_analyses FOR SELECT
  USING (auth_user_has_any_role(ARRAY['bd_reviewer', 'admin']));

CREATE POLICY "ai_analyses: bd_reviewer and admin can update"
  ON ai_analyses FOR UPDATE
  USING (auth_user_has_any_role(ARRAY['bd_reviewer', 'admin']));

-- ─── output_documents policies ───────────────────────────────────────────────

DROP POLICY IF EXISTS "output_documents: bd_reviewer and admin can select all" ON output_documents;
DROP POLICY IF EXISTS "output_documents: bd_reviewer and admin can update" ON output_documents;

CREATE POLICY "output_documents: bd_reviewer and admin can select all"
  ON output_documents FOR SELECT
  USING (auth_user_has_any_role(ARRAY['bd_reviewer', 'admin']));

CREATE POLICY "output_documents: bd_reviewer and admin can update"
  ON output_documents FOR UPDATE
  USING (auth_user_has_any_role(ARRAY['bd_reviewer', 'admin']));

-- ─── review_actions policies ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "review_actions: bd_reviewer and admin can select" ON review_actions;

CREATE POLICY "review_actions: bd_reviewer and admin can select"
  ON review_actions FOR SELECT
  USING (auth_user_has_any_role(ARRAY['bd_reviewer', 'admin']));

-- ─── stage_transitions policies ──────────────────────────────────────────────

DROP POLICY IF EXISTS "stage_transitions: bd_reviewer and admin can select all" ON stage_transitions;

CREATE POLICY "stage_transitions: bd_reviewer and admin can select all"
  ON stage_transitions FOR SELECT
  USING (auth_user_has_any_role(ARRAY['bd_reviewer', 'admin']));

-- ─── notifications policies ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_full_access" ON notifications;
DROP POLICY IF EXISTS "bd_own_notifications" ON notifications;

CREATE POLICY "admin_full_access"
  ON notifications FOR ALL
  USING (auth_user_has_role('admin'));

CREATE POLICY "bd_own_notifications"
  ON notifications FOR SELECT
  USING (
    recipient_email = (SELECT email FROM profiles WHERE id = auth.uid())
    AND auth_user_has_any_role(ARRAY['bd_reviewer', 'admin', 'internal_submitter'])
  );

-- ─── admin_audit_log policies ────────────────────────────────────────────────

DROP POLICY IF EXISTS "audit_log: admin can read" ON admin_audit_log;

CREATE POLICY "audit_log: admin can read"
  ON admin_audit_log FOR SELECT
  USING (auth_user_has_role('admin'));

-- ─── storage: idea-files policies ────────────────────────────────────────────

DROP POLICY IF EXISTS "idea-files: bd_reviewer can read all files" ON storage.objects;
DROP POLICY IF EXISTS "idea-files: admin can delete any file" ON storage.objects;

CREATE POLICY "idea-files: bd_reviewer can read all files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'idea-files'
    AND auth_user_has_any_role(ARRAY['bd_reviewer', 'admin'])
  );

CREATE POLICY "idea-files: admin can delete any file"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'idea-files'
    AND auth_user_has_role('admin')
  );
