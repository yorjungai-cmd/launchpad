-- ============================================================
-- Migration: 20260625000302_document_jobs_table.sql
-- Description: document-generation unit — document_jobs table, indexes, RLS
-- Depends on:
--   20260625000100_ideas.sql (ideas)
--   20260625000201_ai_analyses_table.sql (ai_analyses)
--   20260625000200_ai_analysis_enums.sql (job_status enum — reused)
-- ============================================================

CREATE TABLE document_jobs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id           uuid        NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  analysis_id       uuid        NOT NULL REFERENCES ai_analyses(id) ON DELETE CASCADE,
  queue_message_id  bigint,
  status            job_status  NOT NULL DEFAULT 'queued',
  attempt_count     integer     NOT NULL DEFAULT 0,
  last_error        text,
  enqueued_at       timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_jobs_idea_id
  ON document_jobs (idea_id);

CREATE INDEX idx_document_jobs_status
  ON document_jobs (status)
  WHERE status IN ('queued', 'processing');

-- RLS — service_role only (worker + server)
ALTER TABLE document_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_jobs: service role full access"
  ON document_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
