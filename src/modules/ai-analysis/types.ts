/**
 * TypeScript types for the ai-analysis module.
 *
 * Types are either:
 *   - Inferred from Zod schemas (ClaudeAnalysisOutput, ScoreOverrideEntry, OverrideScoreField)
 *   - Manually defined to match DB columns in camelCase (AIAnalysis, AnalysisJob)
 *   - Manually defined for service layer params (OverrideScoreParams)
 *
 * Ref: design/data-model.md — entity field definitions
 *      schemas.ts — source Zod schemas
 *
 * Task 1.4
 */

import type { z } from "zod";
import type {
  ClaudeAnalysisOutputSchema,
  ScoreOverrideEntrySchema,
  OverrideScoreFieldSchema,
} from "./schemas";

// ─── Enum-equivalent types ────────────────────────────────────────────────────

/** Lifecycle state of an AI analysis run (maps to processing_status DB enum) */
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

/** Lifecycle state of a background analysis job (maps to job_status DB enum) */
export type JobStatus = "queued" | "processing" | "done" | "dead";

// ─── Types inferred from Zod schemas ─────────────────────────────────────────

/** Structured output from Claude AI analysis — validated against ClaudeAnalysisOutputSchema */
export type ClaudeAnalysisOutput = z.infer<typeof ClaudeAnalysisOutputSchema>;

/** Single score override audit entry — validated against ScoreOverrideEntrySchema */
export type ScoreOverrideEntry = z.infer<typeof ScoreOverrideEntrySchema>;

/** Union of the five score field names eligible for BD override */
export type OverrideScoreField = z.infer<typeof OverrideScoreFieldSchema>;

// ─── AIAnalysis interface ─────────────────────────────────────────────────────
// Mirrors the ai_analyses DB table in camelCase.
// Nullable fields reflect columns that are only populated after processing_status = 'completed'.

export interface AIAnalysis {
  id: string;
  ideaId: string;

  // Pipeline state
  processingStatus: ProcessingStatus;
  attemptCount: number;
  lastError: string | null;

  // Summary
  summary: string | null;

  // Stage classification
  stage: "Sandbox" | "Validation Sprint" | "Build Sprint" | "Launch & Test" | null;
  stageConfidence: number | null; // 0.000 – 1.000
  stageReasoning: string | null;

  // Idea type classification
  ideaType: "SaaS" | "SI" | "Hardware" | "Platform" | "Internal Tool" | "Partnership" | null;
  ideaTypeConfidence: number | null; // 0.000 – 1.000

  // Portfolio matches (JSONB array)
  portfolioMatches: Array<{
    product: "PTCAD" | "APP.AI" | "COBO" | "CRM";
    relevance: "High" | "Medium" | "Low";
    reasoning: string;
  }> | null;

  // Feasibility scores (1–5) + reasoning
  strategicFitScore: number | null;
  strategicFitReasoning: string | null;

  marketPotentialScore: number | null;
  marketPotentialReasoning: string | null;

  technicalFeasibilityScore: number | null;
  technicalFeasibilityReasoning: string | null;

  resourceRequirementScore: number | null;
  resourceRequirementReasoning: string | null;

  businessImpactScore: number | null;
  businessImpactReasoning: string | null;

  // Recommended action
  recommendedAction: "Go" | "Conditional Go" | "No Go" | null;
  recommendedActionReasoning: string | null;

  // Score override audit trail (JSONB append-only array)
  scoreOverrides: ScoreOverrideEntry[];

  // Raw Claude response (for debugging)
  rawClaudeResponse: Record<string, unknown> | null;

  // Timestamps
  completedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ─── AnalysisJob interface ────────────────────────────────────────────────────
// Mirrors the analysis_jobs DB table in camelCase.
// Used internally by the service/worker layer — not exposed to clients.

export interface AnalysisJob {
  id: string;
  ideaId: string;
  queueMessageId: number | null; // bigint from pgmq
  status: JobStatus;
  enqueuedAt: string; // ISO 8601
  startedAt: string | null; // ISO 8601
  finishedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
}

// ─── OverrideScoreParams interface ───────────────────────────────────────────
// Input parameters for the analysis.overrideScore service method.
// Matches the tRPC input schema (api-spec.md — analysis.overrideScore).

export interface OverrideScoreParams {
  ideaId: string;
  field: OverrideScoreField;
  newValue: number; // 1–5
  comment: string;
  reviewerId: string; // uuid
  reviewerName: string;
}
