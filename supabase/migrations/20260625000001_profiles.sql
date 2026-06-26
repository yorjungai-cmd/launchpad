-- ============================================================
-- Migration: 20260625000001_profiles.sql
-- Description: profiles table + app_role enum + RLS policies
-- Depends on: 20260625000000_init.sql (set_updated_at function)
-- ============================================================

-- ─── app_role enum ───────────────────────────────────────────────────────────
-- Roles in the system:
--   guest             — external submitter (no auth, access via reference number)
--   internal_submitter — authenticated AppliCAD employee
--   bd_reviewer       — BD team member with review/approve rights
--   admin             — full system access (BD Lead / Admin)

CREATE TYPE app_role AS ENUM (
  'guest',
  'internal_submitter',
  'bd_reviewer',
  'admin'
);

-- ─── profiles table ──────────────────────────────────────────────────────────
-- Extends Supabase auth.users with application-level profile data.
-- One row per authenticated user (guest has no profile row).

CREATE TABLE profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL UNIQUE,
  full_name   text,
  role        app_role    NOT NULL DEFAULT 'internal_submitter',
  locale      text        NOT NULL DEFAULT 'th',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX profiles_role_idx ON profiles (role);
-- email has a UNIQUE constraint which implicitly creates an index

-- ─── updated_at trigger ──────────────────────────────────────────────────────
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: users can read their own profile
CREATE POLICY "profiles: users can read own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: users can update their own profile
CREATE POLICY "profiles: users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: admin can read all profiles
-- Uses a sub-select to avoid infinite recursion (don't call profiles table inside policy)
CREATE POLICY "profiles: admin can read all profiles"
  ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles AS p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

-- Policy: admin can update all profiles
CREATE POLICY "profiles: admin can update all profiles"
  ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles AS p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles AS p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

-- Policy: service role can insert profiles (used by auth trigger / seed scripts)
CREATE POLICY "profiles: service role can insert"
  ON profiles
  FOR INSERT
  WITH CHECK (true);

-- ─── Auto-create profile on signup ───────────────────────────────────────────
-- Trigger: when a new user signs up via Supabase Auth, automatically create
-- a corresponding profiles row with default role.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, locale)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::app_role,
      'internal_submitter'::app_role
    ),
    COALESCE(NEW.raw_user_meta_data->>'locale', 'th')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
