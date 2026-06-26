-- ============================================================
-- Migration: 20260625030000_pipeline_tracking_indexes.sql
-- Description: pipeline-tracking unit — indexes for Kanban queries,
--              stage timeline, guest tracking, and RLS policy
-- Depends on:
--   20260625000100_ideas.sql  (ideas table)
--   20260625000402_stage_transitions_table.sql  (stage_transitions table)
-- ============================================================

-- ─── Kanban query optimization ───────────────────────────────────────────────

-- Filter by stage + sort by updated_at (primary Kanban access pattern)
CREATE INDEX IF NOT EXISTS idx_ideas_stage_updated
  ON ideas(current_stage, updated_at DESC);

-- Filter by submitter type (Kanban filter panel)
CREATE INDEX IF NOT EXISTS idx_ideas_submitter_type
  ON ideas(submitter_type);

-- ─── Stage timeline lookup ───────────────────────────────────────────────────
-- NOTE: idx_stage_transitions_idea_id already exists (created in migration
-- 20260625000402_stage_transitions_table.sql). The IF NOT EXISTS guard below
-- is a safety net in case of out-of-order migration application.
-- The existing index on (idea_id) covers the timeline query adequately.
-- We add a composite index for sorted timeline fetches per idea.
CREATE INDEX IF NOT EXISTS idx_stage_transitions_idea_created
  ON stage_transitions(idea_id, created_at ASC);

-- ─── RLS: Allow public read for guest tracking ───────────────────────────────
-- Field masking is handled at application layer (PipelineService).
-- The existing guest policy on ideas requires reference_number + email match
-- (Policy: "ideas: guest can read via reference_number and email").
-- This additional open-read policy supports the trackByReference tRPC
-- procedure which runs under the service role and projects only safe fields.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ideas'
      AND policyname = 'ideas_public_tracking_read'
  ) THEN
    EXECUTE '
      CREATE POLICY ideas_public_tracking_read ON ideas
        FOR SELECT
        USING (true)
    ';
  END IF;
END $$;
