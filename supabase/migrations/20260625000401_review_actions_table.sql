-- ============================================================
-- Migration: 20260625000401_review_actions_table.sql
-- Description: review-workflow unit — review_actions append-only audit log
-- Depends on:
--   20260625000000_init.sql (gen_random_uuid)
--   20260625000001_profiles.sql (profiles)
--   20260625000100_ideas.sql (ideas)
--   20260625000301_output_documents_table.sql (output_documents)
--   20260625000400_review_workflow_enums.sql (review_action_type)
-- ============================================================

-- ─── review_actions ──────────────────────────────────────────────────────────
-- Append-only audit log for every BD/Admin action on ideas.
-- NEVER update or delete rows in this table.

CREATE TABLE review_actions (
  id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id         uuid                NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  reviewer_id     uuid                NOT NULL REFERENCES profiles(id),
  reviewer_name   text                NOT NULL,
  action_type     review_action_type  NOT NULL,
  -- Nullable: only set for action_type = 'edit'
  document_id     uuid                REFERENCES output_documents(id) ON DELETE SET NULL,
  -- Structured metadata per action type (see design/data-model.md for schema)
  payload         jsonb               NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz         NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_review_actions_idea_id
  ON review_actions (idea_id);

CREATE INDEX idx_review_actions_reviewer
  ON review_actions (reviewer_id);

CREATE INDEX idx_review_actions_created
  ON review_actions (created_at DESC);

CREATE INDEX idx_review_actions_type
  ON review_actions (action_type);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE review_actions ENABLE ROW LEVEL SECURITY;

-- BD Reviewer can INSERT their own actions
CREATE POLICY "review_actions: bd_reviewer can insert"
  ON review_actions
  FOR INSERT
  WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  );

-- BD Reviewer / Admin can SELECT all review actions
CREATE POLICY "review_actions: bd_reviewer and admin can select"
  ON review_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  );

-- Service role full access (server-side service)
CREATE POLICY "review_actions: service role full access"
  ON review_actions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
