-- ============================================================
-- Migration: 20260625000303_document_generation_triggers.sql
-- Description: document-generation unit — additional triggers
-- Note: output_documents updated_at trigger is in 20260625000301
-- This file reserves space for future document-generation triggers
-- (e.g. notify_documents_generated RPC, pgmq queue creation)
-- ============================================================

-- Create document_generation_jobs pgmq queue (if pgmq extension is available)
-- This mirrors the pattern from 20260625000204_pgmq_setup.sql
SELECT pgmq.create('document_generation_jobs');
SELECT pgmq.create('document_generation_jobs_dlq');
