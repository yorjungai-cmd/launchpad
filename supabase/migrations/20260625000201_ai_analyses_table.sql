-- ============================================================
-- Migration: 20260625000201_ai_analyses_table.sql
-- Description: ai-analysis unit — ai_analyses table, indexes, RLS
-- Depends on:
--   20260625000000_init.sql  (set_updated_at function)
--   20260625000001_profiles.sql  (app_role enum, profiles table)
--   20260625000100_ideas.sql  (ideas table)
--   20260625000200_ai_analysis_enums.sql  (processing_status, launch_pad_stage, idea_type, recommended_action)
-- ============================================================

-- ─── ai_analyses table ───────────────────────────────────────────────────────
-- Stores the persistent AI analysis result for each idea.
-- One row per idea (enforced by UNIQUE constraint on idea_id).
-- Scores and reasoning are populated once processing_status = 'completed'.

CREATE TABLE ai_analyses (
  -- ── Identity ─────────────────────────────────────────────────────────────
  id                              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Idea reference (1:1) ─────────────────────────────────────────────────
  idea_id                         uuid            NOT NULL UNIQUE
                                                  REFERENCES ideas(id) ON DELETE CASCADE,

  -- ── Pipeline state ───────────────────────────────────────────────────────
  processing_status               processing_status  NOT NULL DEFAULT 'pending',
  attempt_count                   integer            NOT NULL DEFAULT 0,
  last_error                      text,

  -- ── Summary ──────────────────────────────────────────────────────────────
  summary                         text,

  -- ── Stage classification ─────────────────────────────────────────────────
  stage                           launch_pad_stage,
  stage_confidence                numeric(4,3)
                                    CHECK (stage_confidence >= 0 AND stage_confidence <= 1),
  stage_reasoning                 text,

  -- ── Idea type classification ─────────────────────────────────────────────
  idea_type                       idea_type,
  idea_type_confidence            numeric(4,3)
                                    CHECK (idea_type_confidence >= 0 AND idea_type_confidence <= 1),

  -- ── Portfolio matches (JSONB array) ──────────────────────────────────────
  -- Schema: [{ product: 'PTCAD'|'APP.AI'|'COBO'|'CRM', relevance: 'High'|'Medium'|'Low', reasoning: string }]
  portfolio_matches               jsonb,

  -- ── Feasibility scores (1–5) + reasoning ─────────────────────────────────
  strategic_fit_score             smallint
                                    CHECK (strategic_fit_score BETWEEN 1 AND 5),
  strategic_fit_reasoning         text,

  market_potential_score          smallint
                                    CHECK (market_potential_score BETWEEN 1 AND 5),
  market_potential_reasoning      text,

  technical_feasibility_score     smallint
                                    CHECK (technical_feasibility_score BETWEEN 1 AND 5),
  technical_feasibility_reasoning text,

  resource_requirement_score      smallint
                                    CHECK (resource_requirement_score BETWEEN 1 AND 5),
  resource_requirement_reasoning  text,

  business_impact_score           smallint
                                    CHECK (business_impact_score BETWEEN 1 AND 5),
  business_impact_reasoning       text,

  -- ── Recommended action ───────────────────────────────────────────────────
  recommended_action              recommended_action,
  recommended_action_reasoning    text,

  -- ── Score overrides (audit trail, append-only JSONB array) ───────────────
  -- Schema per entry: { field, previous_value, new_value, comment,
  --                     reviewer_id, reviewer_name, overridden_at }
  score_overrides                 jsonb            NOT NULL DEFAULT '[]'::jsonb,

  -- ── Raw AI output (debug) ─────────────────────────────────────────────────
  raw_claude_response             jsonb,

  -- ── Timestamps ───────────────────────────────────────────────────────────
  completed_at                    timestamptz,
  created_at                      timestamptz      NOT NULL DEFAULT now(),
  updated_at                      timestamptz      NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Primary lookup: idea_id → analysis (also enforces 1:1 constraint)
CREATE UNIQUE INDEX idx_ai_analyses_idea_id
  ON ai_analyses (idea_id);

-- BD review queue: filter by processing_status
CREATE INDEX idx_ai_analyses_status
  ON ai_analyses (processing_status);

-- Pipeline / dashboard: filter by stage (partial — only non-null rows)
CREATE INDEX idx_ai_analyses_stage
  ON ai_analyses (stage)
  WHERE stage IS NOT NULL;

-- Sorted listing: newest first
CREATE INDEX idx_ai_analyses_created_at
  ON ai_analyses (created_at DESC);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
CREATE TRIGGER set_ai_analyses_updated_at
  BEFORE UPDATE ON ai_analyses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;

-- Policy 1: Submitter can read analysis of their own idea (via ideas.user_id)
CREATE POLICY "ai_analyses: submitter can read own idea analysis"
  ON ai_analyses
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM ideas
      WHERE ideas.id = ai_analyses.idea_id
        AND ideas.user_id = auth.uid()
    )
  );

-- Policy 2: BD Reviewer can SELECT all analyses
CREATE POLICY "ai_analyses: bd_reviewer can select all"
  ON ai_analyses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  );

-- Policy 3: BD Reviewer / Admin can UPDATE analyses (e.g. score overrides)
CREATE POLICY "ai_analyses: bd_reviewer and admin can update"
  ON ai_analyses
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('bd_reviewer', 'admin')
    )
  );

-- Policy 4: Service role can INSERT and UPDATE (worker persists analysis results)
-- Note: Supabase service_role bypasses RLS entirely; this policy is an
-- explicit belt-and-suspenders grant for service clients using anon key + claims.
CREATE POLICY "ai_analyses: service role full access"
  ON ai_analyses
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
