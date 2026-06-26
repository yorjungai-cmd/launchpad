-- ============================================================
-- Migration: 20260625000300_document_generation_enums.sql
-- Description: document-generation unit — enum types
-- Depends on:
--   20260625000000_init.sql
--   20260625000200_ai_analysis_enums.sql (launch_pad_stage, idea_type, job_status already defined)
-- ============================================================

-- ─── document_type ───────────────────────────────────────────────────────────
CREATE TYPE document_type AS ENUM (
  'feasibility_report',
  'bmc',
  'launch_pad_plan',
  'poc_proposal',
  'stage_gate_guide',
  'project_requirements',
  'action_plan',
  'resource_plan',
  'gtm_summary',
  'executive_presentation',
  'project_proposal'
);

-- ─── watermark_status ────────────────────────────────────────────────────────
-- Maps to src/shared/enums.ts WatermarkStatus
CREATE TYPE watermark_status AS ENUM (
  'ai_draft',
  'bd_reviewed',
  'approved'
);

-- ─── doc_generation_status ───────────────────────────────────────────────────
CREATE TYPE doc_generation_status AS ENUM (
  'pending',
  'generating',
  'completed',
  'failed'
);
