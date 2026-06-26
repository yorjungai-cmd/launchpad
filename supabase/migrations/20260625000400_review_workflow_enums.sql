-- ============================================================
-- Migration: 20260625000400_review_workflow_enums.sql
-- Description: review-workflow unit — enum types
-- Depends on:
--   20260625000000_init.sql
-- ============================================================

-- ─── review_action_type ──────────────────────────────────────────────────────
-- Classifies the type of review action taken by a BD Reviewer / Admin

CREATE TYPE review_action_type AS ENUM (
  'edit',
  'stage_change',
  'approve',
  'reject'
);
