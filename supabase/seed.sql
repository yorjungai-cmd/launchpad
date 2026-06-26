-- ============================================================
-- Seed: seed.sql
-- Description: Test profiles with different roles for local development.
-- NOTE: These are test users only — DO NOT run in production.
-- Uses fixed UUIDs so seed is idempotent (re-runnable).
-- ============================================================

-- ─── Auth users (Supabase auth.users) ────────────────────────────────────────
-- Insert auth users using Supabase's internal format.
-- Passwords are hashed with bcrypt; value below = 'password123'

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  aud,
  role
) VALUES
  -- Admin user
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'admin@applcad.test',
    '$2a$10$PznXR5VSGkOq2f.dGPnnKeVEFRB7cS50DSBJMDSqRe3igBXRx5Jem', -- password123
    now(),
    '{"full_name": "Admin User", "role": "admin", "locale": "th"}',
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  -- BD Reviewer
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'reviewer@applcad.test',
    '$2a$10$PznXR5VSGkOq2f.dGPnnKeVEFRB7cS50DSBJMDSqRe3igBXRx5Jem', -- password123
    now(),
    '{"full_name": "BD Reviewer", "role": "bd_reviewer", "locale": "th"}',
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  -- Internal Submitter
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'employee@applcad.test',
    '$2a$10$PznXR5VSGkOq2f.dGPnnKeVEFRB7cS50DSBJMDSqRe3igBXRx5Jem', -- password123
    now(),
    '{"full_name": "Internal Employee", "role": "internal_submitter", "locale": "th"}',
    now(),
    now(),
    'authenticated',
    'authenticated'
  ),
  -- English locale user
  (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'employee.en@applcad.test',
    '$2a$10$PznXR5VSGkOq2f.dGPnnKeVEFRB7cS50DSBJMDSqRe3igBXRx5Jem', -- password123
    now(),
    '{"full_name": "English User", "role": "internal_submitter", "locale": "en"}',
    now(),
    now(),
    'authenticated',
    'authenticated'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Profiles ─────────────────────────────────────────────────────────────────
-- The on_auth_user_created trigger auto-creates profiles, but we insert
-- directly here for reliability in seed/reset flows.

INSERT INTO profiles (id, email, full_name, role, locale)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@applcad.test',       'Admin User',       'admin',                'th'),
  ('00000000-0000-0000-0000-000000000002', 'reviewer@applcad.test',    'BD Reviewer',      'bd_reviewer',          'th'),
  ('00000000-0000-0000-0000-000000000003', 'employee@applcad.test',    'Internal Employee','internal_submitter',   'th'),
  ('00000000-0000-0000-0000-000000000004', 'employee.en@applcad.test', 'English User',     'internal_submitter',   'en')
ON CONFLICT (id) DO UPDATE SET
  email      = EXCLUDED.email,
  full_name  = EXCLUDED.full_name,
  role       = EXCLUDED.role,
  locale     = EXCLUDED.locale,
  updated_at = now();
