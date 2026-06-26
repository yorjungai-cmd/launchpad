-- ============================================================
-- Migration: 20260625000402_stage_transitions_table.sql
-- Description: review-workflow unit — stage_transitions history table
-- Depends on:
--   20260625000000_init.sql
--   20260625000001_profiles.sql (profiles)
--   20260625000100_ideas.sql (ideas)
-- ============================================================

-- ─── stage_transitions ───────────────────────────────────────────────────────
-- Append-only history of every stage transition for an idea.
-- from_stage is NULL for the initial 'Sandbox' entry.
-- to_stage uses text (not enum) to support 'Closed' in addition to launch_pad_stage values.

CREATE TABLE stage_transitions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id         uuid        NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  from_stage      text,                       -- NULL = initial submission
  to_stage        text        NOT NULL,        -- launch_pad_stage values + 'Closed'
  reviewer_id     uuid        REFERENCES profiles(id),
  reviewer_name   text,                       -- snapshot
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_stage_transitions_idea_id
  ON stage_transitions (idea_id);

CREATE INDEX idx_stage_transitions_created
  ON stage_transitions (created_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY;

-- Submitter / Internal user: read their own idea's transitions
CREATE POLICY "stage_transitions: submitter can read own"
  ON stage_transitions
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM ideas
      WHERE ideas.id = stage_transitions.idea_id
        AND ideas.user_id = auth.uid()
    )
  );

-- BD Reviewer / Admin: read all
CREATE POLICY "stage_transitions: bd_reviewer and admin can select all"
  ON stage_transitions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  );

-- Service role full access
CREATE POLICY "stage_transitions: service role full access"
  ON stage_transitions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
