-- ============================================================
-- Migration: 20260625040001_create_system_settings.sql
-- Description: system_settings table — single-row AI config store
--              + default row INSERT + RLS (service role only)
-- Depends on: 20260625000000_init.sql (set_updated_at)
--             20260625040000_enable_vault_extension.sql
-- ============================================================

-- ─── system_settings table ───────────────────────────────────────────────────
-- Single-row configuration table for system-wide AI model settings.
-- Enforced as singleton via a partial unique index on (true).

CREATE TABLE system_settings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_config   jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Singleton constraint — only one row allowed
CREATE UNIQUE INDEX system_settings_singleton ON system_settings ((true));

-- ─── updated_at trigger ──────────────────────────────────────────────────────
CREATE TRIGGER set_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Default row ─────────────────────────────────────────────────────────────
-- Insert the initial AI config with sensible defaults.
-- The WHERE NOT EXISTS guard ensures this is idempotent (safe to re-run).
INSERT INTO system_settings (ai_config)
SELECT '{
  "analysisModel":            "claude-sonnet-4-5",
  "documentGenerationModel":  "claude-opus-4-5",
  "defaultModel":             "claude-sonnet-4-5",
  "fallbackModel":            "claude-haiku-4-5",
  "supportedModels":          ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM system_settings);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Admin reads/writes via server-side client with service role key.
-- No authenticated user (JWT) should ever access this table directly.

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS entirely in Supabase by default.
-- The explicit policies below document intent and block all other roles.

-- Deny all access to authenticated users (admin reads via service role server-side)
CREATE POLICY "system_settings: no direct user access"
  ON system_settings
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
