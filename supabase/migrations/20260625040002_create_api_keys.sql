-- ============================================================
-- Migration: 20260625040002_create_api_keys.sql
-- Description: api_keys table — API key metadata with Vault reference
--              + indexes + RLS (service role only)
-- Depends on: 20260625000000_init.sql (set_updated_at)
--             20260625000001_profiles.sql (auth.users FK)
--             20260625040000_enable_vault_extension.sql (vault.secrets)
-- ============================================================

-- ─── api_keys table ──────────────────────────────────────────────────────────
-- Stores API key metadata only — the plaintext key is NEVER stored here.
-- Plaintext is stored in Supabase Vault (vault.secrets) and referenced by vault_id.
-- masked_key is computed at insert time (e.g. "sk-ant-...abcd") for display.

CREATE TABLE api_keys (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,                         -- user-defined label
  provider    text        NOT NULL DEFAULT 'anthropic',     -- 'anthropic' | 'openai' | etc.
  vault_id    uuid        NOT NULL,                         -- → vault.secrets.id
  masked_key  text        NOT NULL,                         -- "sk-...abcd" for display only
  is_active   boolean     NOT NULL DEFAULT false,           -- only one active per provider
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Composite index: fast lookup of active key for a provider (common query path)
CREATE INDEX api_keys_provider_active ON api_keys (provider, is_active);

-- Index: audit / history by creator
CREATE INDEX api_keys_created_by ON api_keys (created_by);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
CREATE TRIGGER set_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- All writes go through the server-side service role client.
-- Authenticated users (even admins with JWT) cannot access this table directly —
-- the admin UI reads via server-side API routes that use the service role key.

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Block all direct authenticated access (reads/writes via service role server-side only)
CREATE POLICY "api_keys: no direct user access"
  ON api_keys
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
