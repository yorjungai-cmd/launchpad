-- ============================================================
-- Migration: 20260625000000_init.sql
-- Description: Foundation — sets up shared database infrastructure:
--   - updated_at auto-update trigger function
--   - Extensions required by the app
-- ============================================================

-- Enable UUID generation (built-in in PG 14+, but ensure extension exists)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── updated_at trigger function ─────────────────────────────────────────────
-- Automatically updates the `updated_at` column to now() on every UPDATE.
-- Apply to any table with an `updated_at` column via:
--   CREATE TRIGGER set_updated_at
--     BEFORE UPDATE ON {table_name}
--     FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
