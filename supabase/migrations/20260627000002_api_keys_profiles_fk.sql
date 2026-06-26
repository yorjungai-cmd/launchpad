-- =============================================================================
-- Migration: 20260627000002_api_keys_profiles_fk.sql
-- Description: Add FK from api_keys.created_by → profiles.id so PostgREST
--              can resolve the join used in ApiKeyService.listApiKeys()
--
-- Root cause:
--   api_keys.created_by references auth.users(id) but the application code
--   queries: .select("..., profiles ( full_name )") which requires a FK
--   from api_keys → profiles for PostgREST to resolve the join.
--
-- Fix:
--   1. Drop the existing auth.users FK constraint
--   2. Add FK → profiles.id (profiles.id itself FKs to auth.users.id)
--   3. Make vault secret names unique per-save using timestamp suffix
--      (vault.secrets has a unique index on name — duplicate on retry fails)
-- =============================================================================

-- ─── 1. Replace FK: auth.users → profiles ────────────────────────────────────

ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_created_by_fkey;

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES profiles(id)
  ON DELETE SET NULL;
