-- ============================================================
-- Migration: 20260625000202_analysis_jobs_table.sql
-- Description: ai-analysis unit — analysis_jobs table, indexes, RLS
-- Depends on:
--   20260625000000_init.sql  (set_updated_at function)
--   20260625000100_ideas.sql  (ideas table)
--   20260625000200_ai_analysis_enums.sql  (job_status enum)
-- ============================================================

-- ─── analysis_jobs table ─────────────────────────────────────────────────────
-- Tracks the state of background AI analysis jobs in the pgmq queue.
-- Used for deduplication (guard against duplicate enqueues) and monitoring.
-- NOT visible to client-side consumers — service_role only.

CREATE TABLE analysis_jobs (
  -- ── Identity ─────────────────────────────────────────────────────────────
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Idea reference ───────────────────────────────────────────────────────
  idea_id           uuid        NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,

  -- ── Queue reference ──────────────────────────────────────────────────────
  -- pgmq message ID — populated after the message is enqueued
  queue_message_id  bigint,

  -- ── Job lifecycle state ──────────────────────────────────────────────────
  status            job_status  NOT NULL DEFAULT 'queued',

  -- ── Timestamps ───────────────────────────────────────────────────────────
  enqueued_at       timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Lookup jobs by idea (deduplication guard query)
CREATE INDEX idx_analysis_jobs_idea_id
  ON analysis_jobs (idea_id);

-- Active job filter: guard against duplicate enqueue of queued/processing jobs
-- Partial index — only includes rows that need to be checked for conflicts
CREATE INDEX idx_analysis_jobs_status
  ON analysis_jobs (status)
  WHERE status IN ('queued', 'processing');

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- analysis_jobs is an internal infrastructure table — accessible by service_role only.
-- Client applications should never query this table directly.

ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;

-- No client-facing policies — service_role bypasses RLS automatically.
-- Deny all access for authenticated and anonymous users.
CREATE POLICY "analysis_jobs: deny all non-service access"
  ON analysis_jobs
  FOR ALL
  USING (false)
  WITH CHECK (false);
