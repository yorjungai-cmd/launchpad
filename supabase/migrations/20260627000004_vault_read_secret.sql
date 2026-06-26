-- =============================================================================
-- Migration: 20260627000004_vault_read_secret.sql
-- Description: Public RPC to read a decrypted vault secret by id
--
-- Problem:
--   The inline AI worker needs the plaintext API key to call the provider.
--   Supabase PostgREST only exposes the `public` schema, so the JS client
--   cannot query vault.decrypted_secrets directly.
--
-- Solution:
--   SECURITY DEFINER function in public schema that returns the decrypted
--   secret for a given vault id. Only callable by service role (the inline
--   worker uses createAdminSupabaseClient with the service-role key).
--
-- Security: NOT granted to anon/authenticated — service role only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.vault_read_secret(secret_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  plaintext text;
BEGIN
  SELECT decrypted_secret INTO plaintext
  FROM vault.decrypted_secrets
  WHERE id = secret_id;
  RETURN plaintext;
END;
$$;

-- Do NOT grant to anon/authenticated. Service role bypasses RLS and can
-- execute SECURITY DEFINER functions, which is what the inline worker uses.
REVOKE ALL ON FUNCTION public.vault_read_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_read_secret(uuid) FROM anon, authenticated;
