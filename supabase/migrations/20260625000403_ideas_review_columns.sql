-- ============================================================
-- Migration: 20260625000403_ideas_review_columns.sql
-- Description: review-workflow unit — add stage/rejection columns to ideas
-- Depends on:
--   20260625000100_ideas.sql (ideas)
--   20260625000001_profiles.sql (profiles)
--   20260625000402_stage_transitions_table.sql
-- ============================================================

-- ─── Add review-workflow columns to ideas ────────────────────────────────────

ALTER TABLE ideas
  ADD COLUMN IF NOT EXISTS current_stage     text         DEFAULT 'Sandbox',
  ADD COLUMN IF NOT EXISTS rejection_reason  text,
  ADD COLUMN IF NOT EXISTS rejected_at       timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by       uuid         REFERENCES profiles(id);

-- ─── Index for queue queries ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ideas_current_stage
  ON ideas (current_stage);

-- ─── Backfill: insert initial stage_transition for existing ideas ─────────────
-- Sets every existing idea as starting from 'Sandbox' with no reviewer (system-initiated)
INSERT INTO stage_transitions (idea_id, from_stage, to_stage, reviewer_id, reviewer_name, reason, created_at)
SELECT
  id,
  NULL,          -- no previous stage
  'Sandbox',
  NULL,          -- system-initiated
  'System',
  'Initial stage on portal launch',
  created_at     -- use idea creation time as transition time
FROM ideas
WHERE id NOT IN (
  SELECT DISTINCT idea_id FROM stage_transitions
)
ON CONFLICT DO NOTHING;
