-- ============================================================
-- Migration: 20260625040000_enable_vault_extension.sql
-- Description: Enable Supabase Vault extension for encrypted
--              API key storage (admin-ai-config unit)
-- Depends on: 20260625000000_init.sql
-- ============================================================

-- Supabase Vault provides encrypted secret storage backed by pgsodium.
-- vault.secrets table stores encrypted text; accessed via vault_create_secret,
-- vault_update_secret, vault_delete_secret RPC functions.
--
-- ⚠️  On Supabase-hosted projects the extension is pre-enabled.
--     On local dev (supabase start) it requires pgsodium which is bundled.
--     If this fails locally, ensure supabase CLI ≥ 1.150 and Docker image is up-to-date.

CREATE EXTENSION IF NOT EXISTS supabase_vault;
