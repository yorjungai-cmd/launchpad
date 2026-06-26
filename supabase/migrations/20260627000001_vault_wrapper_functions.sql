-- =============================================================================
-- Migration: 20260627000001_vault_wrapper_functions.sql
-- Description: Create public wrapper functions for Supabase Vault operations
--
-- Problem:
--   api-key-service.ts calls db.rpc("vault_create_secret", { secret, name })
--   but the actual vault functions are:
--     vault.create_secret(new_secret, new_name, ...)  -- different schema + param names
--     vault.update_secret(secret_id, new_secret, ...) -- different param names
--     vault.delete_secret does not exist in vault schema at all
--
-- Solution:
--   Create public schema wrappers that match the exact RPC signatures
--   the application code expects. These are SECURITY DEFINER so they can
--   access vault schema without exposing it to the anon role directly.
-- =============================================================================

-- ─── vault_create_secret ─────────────────────────────────────────────────────
-- Called by: api-key-service.ts saveApiKey()
-- Input:  secret text, name text
-- Output: uuid (the vault secret id)

CREATE OR REPLACE FUNCTION public.vault_create_secret(secret text, name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  new_id uuid;
BEGIN
  -- Pass empty string for description (NOT NULL constraint in vault.secrets)
  SELECT vault.create_secret(secret, name, '', NULL) INTO new_id;
  RETURN new_id;
END;
$$;

-- ─── vault_update_secret ─────────────────────────────────────────────────────
-- Called by: api-key-service.ts updateApiKey()
-- Input:  id uuid, secret text
-- Output: void

CREATE OR REPLACE FUNCTION public.vault_update_secret(id uuid, secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  PERFORM vault.update_secret(id, secret, NULL, NULL, NULL);
END;
$$;

-- ─── vault_delete_secret ─────────────────────────────────────────────────────
-- Called by: api-key-service.ts deleteApiKey()
-- vault schema has no delete function — we delete directly from vault.secrets
-- Input:  id uuid
-- Output: void

CREATE OR REPLACE FUNCTION public.vault_delete_secret(id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE vault.secrets.id = vault_delete_secret.id;
END;
$$;

-- ─── Grant execute to authenticated role ─────────────────────────────────────
-- Only authenticated users (admins) can call these via tRPC roleProcedure('admin')
-- The service role key bypasses this, but we grant to authenticated for completeness.

GRANT EXECUTE ON FUNCTION public.vault_create_secret(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_update_secret(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_delete_secret(uuid) TO authenticated;
