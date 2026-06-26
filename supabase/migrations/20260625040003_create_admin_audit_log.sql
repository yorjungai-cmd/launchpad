-- ============================================================
-- Migration: 20260625040003_create_admin_audit_log.sql
-- Description: admin_audit_log — append-only audit trail for
--              admin operations. No UPDATE or DELETE allowed.
-- Depends on: 20260625000000_init.sql
--             20260625000001_profiles.sql (auth.users FK)
-- ============================================================

-- ─── admin_audit_log table ───────────────────────────────────────────────────
-- Immutable audit trail for admin operations (especially API key management).
-- Rows may only be INSERTed — UPDATE and DELETE are permanently blocked at
-- the database level via a trigger (belt-and-suspenders beyond RLS).
--
-- action enum values:
--   api_key_created | api_key_updated | api_key_deleted | api_key_set_active
--   user_created    | user_role_changed | user_deleted
--   ai_config_updated

CREATE TABLE admin_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text        NOT NULL,   -- see action enum values above
  admin_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type text        NOT NULL,   -- 'api_key' | 'user' | 'ai_config'
  target_id   text        NOT NULL,   -- UUID or identifier of the affected record
  metadata    jsonb       NOT NULL DEFAULT '{}',  -- context data (NO key/secret/token values)
  created_at  timestamptz NOT NULL DEFAULT now()
  -- ⚠️  NO updated_at column — rows are immutable
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Admin activity timeline (primary access pattern)
CREATE INDEX admin_audit_log_admin_id ON admin_audit_log (admin_id, created_at DESC);

-- Find all log entries for a specific record
CREATE INDEX admin_audit_log_target ON admin_audit_log (target_type, target_id);

-- Recent activity feed (global)
CREATE INDEX admin_audit_log_created_at ON admin_audit_log (created_at DESC);

-- ─── Append-only enforcement ─────────────────────────────────────────────────
-- Block UPDATE and DELETE at the database trigger level.
-- This enforces immutability regardless of RLS policies or role.

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'admin_audit_log is append-only: % operations are not permitted',
    TG_OP;
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin users (JWT with admin role) can read audit logs via direct query
-- Inserts go through service role (server-side); UPDATE/DELETE blocked by trigger
CREATE POLICY "audit_log: admin can read"
  ON admin_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles AS p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

-- Explicitly deny UPDATE for authenticated users (redundant with trigger — defense in depth)
CREATE POLICY "audit_log: no updates"
  ON admin_audit_log
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Explicitly deny DELETE for authenticated users (redundant with trigger — defense in depth)
CREATE POLICY "audit_log: no deletes"
  ON admin_audit_log
  FOR DELETE
  TO authenticated
  USING (false);

-- Deny direct INSERT from authenticated users (service role inserts server-side)
CREATE POLICY "audit_log: no direct user insert"
  ON admin_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
