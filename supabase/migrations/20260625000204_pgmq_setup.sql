-- ============================================================
-- Migration: 20260625000204_pgmq_setup.sql
-- Description: ai-analysis unit — enable pgmq extension and create
--              the ai_analysis_jobs message queue
-- Depends on:
--   20260625000202_analysis_jobs_table.sql  (analysis_jobs table)
-- ============================================================

-- ─── pgmq extension ──────────────────────────────────────────────────────────
-- pgmq provides a Postgres-native message queue backed by regular tables.
-- Requires Supabase Pro plan or self-hosted Postgres with the extension installed.
-- Fallback: if pgmq is unavailable, replace with a DB-polling queue table (see README).

CREATE EXTENSION IF NOT EXISTS pgmq;

-- ─── Create the ai analysis jobs queue ───────────────────────────────────────
-- Queue name: 'ai_analysis_jobs'
-- Workers (Supabase Edge Functions) dequeue messages from this queue and
-- execute Claude AI analysis for the corresponding idea_id payload.

SELECT pgmq.create('ai_analysis_jobs');
