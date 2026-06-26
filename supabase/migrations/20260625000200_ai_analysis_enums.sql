-- ============================================================
-- Migration: 20260625000200_ai_analysis_enums.sql
-- Description: ai-analysis unit — enum types for analysis pipeline
-- Depends on:
--   20260625000000_init.sql  (foundation)
--   20260625000100_ideas.sql (analysis_status already defined there)
-- ============================================================

-- NOTE: analysis_status enum ('pending','processing','completed','failed')
-- is already defined in 20260625000100_ideas.sql.
-- The ideas migration defined 'analysis_complete' but the ai-analysis unit
-- requires 'completed' — create a separate dedicated enum for ai_analyses.

-- ─── launch_pad_stage ────────────────────────────────────────────────────────
-- The four stages of the Launch PAD 2.0 framework

CREATE TYPE launch_pad_stage AS ENUM (
  'Sandbox',
  'Validation Sprint',
  'Build Sprint',
  'Launch & Test'
);

-- ─── idea_type ───────────────────────────────────────────────────────────────
-- Classifies the nature / commercialization model of the idea

CREATE TYPE idea_type AS ENUM (
  'SaaS',
  'SI',
  'Hardware',
  'Platform',
  'Internal Tool',
  'Partnership'
);

-- ─── recommended_action ──────────────────────────────────────────────────────
-- AI-recommended decision for the BD team

CREATE TYPE recommended_action AS ENUM (
  'Go',
  'Conditional Go',
  'No Go'
);

-- ─── processing_status (ai-analysis specific) ────────────────────────────────
-- Tracks the lifecycle of an AI analysis run.
-- Kept separate from ideas.analysis_status to decouple the two pipelines.

CREATE TYPE processing_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- ─── job_status ──────────────────────────────────────────────────────────────
-- Lifecycle states for background analysis jobs in the pgmq queue

CREATE TYPE job_status AS ENUM (
  'queued',
  'processing',
  'done',
  'dead'
);
