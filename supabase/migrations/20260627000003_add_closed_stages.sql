-- =============================================================================
-- Migration: 20260627000003_add_closed_stages.sql
-- Description: Add closed stage values to the stage enum
--
-- The stage enum was defined with only 4 active stages.
-- Application code uses 'closed_go' and 'closed_no_go' for rejected/approved
-- ideas. Add these to the enum so writes and queries work correctly.
-- =============================================================================

ALTER TYPE stage ADD VALUE IF NOT EXISTS 'closed_go';
ALTER TYPE stage ADD VALUE IF NOT EXISTS 'closed_no_go';
