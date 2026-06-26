-- ============================================================
-- Migration: 20260625040004_admin_rls_policies.sql
-- Description: Consolidated RLS policy review for all
--              admin-ai-config tables. Documents the complete
--              access matrix and adds any cross-table policies.
-- Depends on: 20260625040001_create_system_settings.sql
--             20260625040002_create_api_keys.sql
--             20260625040003_create_admin_audit_log.sql
-- ============================================================

-- ─── Access Matrix ───────────────────────────────────────────────────────────
--
--  Table               │ anon │ authenticated (JWT) │ service_role
--  ────────────────────┼──────┼─────────────────────┼─────────────
--  system_settings     │  ✗   │ ✗ (blocked by RLS)  │ ✓ full access
--  api_keys            │  ✗   │ ✗ (blocked by RLS)  │ ✓ full access
--  admin_audit_log     │  ✗   │ SELECT (admin only) │ ✓ INSERT only
--                      │      │ No INSERT/UPDATE/DEL │
--
-- Rationale:
--   - system_settings and api_keys are exclusively accessed server-side
--     using the SUPABASE_SERVICE_ROLE_KEY in Next.js API routes / tRPC handlers.
--   - admin_audit_log allows admin-role users to query logs directly
--     (e.g. for the audit log UI panel), but all writes go server-side.
--   - UPDATE and DELETE on admin_audit_log are additionally blocked by
--     database triggers (prevent_audit_log_mutation) for defense-in-depth.

-- ─── anon role — deny all ─────────────────────────────────────────────────────
-- By default Supabase denies anon access when RLS is enabled and no policy
-- grants access. The policies below are explicit for documentation clarity.

-- system_settings: deny anon
CREATE POLICY "system_settings: no anon access"
  ON system_settings
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- api_keys: deny anon
CREATE POLICY "api_keys: no anon access"
  ON api_keys
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- admin_audit_log: deny anon
CREATE POLICY "audit_log: no anon access"
  ON admin_audit_log
  FOR ALL
  TO anon
  USING (false);

-- ─── system_settings: service role helper function ────────────────────────────
-- Convenience function: get the singleton AI config row.
-- Executed with SECURITY DEFINER so it runs as the function owner (postgres),
-- bypassing RLS. Called from tRPC/Edge functions where service role client
-- cannot be used (e.g., Edge Function context).

CREATE OR REPLACE FUNCTION get_system_ai_config()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT ai_config
  FROM system_settings
  LIMIT 1;
$$;

-- Revoke public execute; only service role / postgres should call this
REVOKE EXECUTE ON FUNCTION get_system_ai_config() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_system_ai_config() TO service_role;

-- ─── api_keys: active key lookup helper ──────────────────────────────────────
-- Returns the vault_id for the currently active key of a given provider.
-- Used by AI services to retrieve the key for a provider without scanning
-- the full api_keys table from an authenticated context.

CREATE OR REPLACE FUNCTION get_active_vault_id(p_provider text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT vault_id
  FROM api_keys
  WHERE provider  = p_provider
    AND is_active = true
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION get_active_vault_id(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_active_vault_id(text) TO service_role;
