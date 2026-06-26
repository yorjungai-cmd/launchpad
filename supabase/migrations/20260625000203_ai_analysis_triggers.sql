-- ============================================================
-- Migration: 20260625000203_ai_analysis_triggers.sql
-- Description: ai-analysis unit — updated_at triggers for ai_analyses
--              (analysis_jobs has no updated_at column by design)
-- Depends on:
--   20260625000000_init.sql  (set_updated_at function)
--   20260625000201_ai_analyses_table.sql  (ai_analyses table)
-- ============================================================

-- NOTE: The updated_at trigger for ai_analyses is already created in
-- 20260625000201_ai_analyses_table.sql (set_ai_analyses_updated_at).
-- This migration is retained as a named hook for any future trigger additions
-- related to the ai-analysis unit (e.g. completed_at auto-set, cascade logic).

-- ─── Auto-set completed_at when processing_status transitions to 'completed' ─
-- Sets completed_at = now() automatically when a row transitions to 'completed'.
-- This avoids requiring the worker to explicitly pass the timestamp.

CREATE OR REPLACE FUNCTION set_ai_analysis_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only set completed_at when transitioning INTO 'completed' state
  IF NEW.processing_status = 'completed'
     AND (OLD.processing_status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_ai_analyses_completed_at
  BEFORE UPDATE ON ai_analyses
  FOR EACH ROW EXECUTE FUNCTION set_ai_analysis_completed_at();
