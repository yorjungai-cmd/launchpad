/**
 * Schemas and TypeScript interfaces for the dashboard-analytics module.
 *
 * Ref:
 *   - design/data-model.md  — Derived / Computed Types
 *   - design/api-spec.md    — Input Schemas
 *
 * Task 1.1
 *
 * NOTE: IdeaStage and SubmitterType are defined here because the foundation
 * `src/shared/enums.ts` Stage enum does not yet include the closed_go /
 * closed_no_go states used by dashboard-analytics. These should be promoted
 * to src/shared/ when the shared data-model is updated.
 */

import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * All pipeline stages in the Launch PAD 2.0 process, including terminal states.
 * Extends the foundation Stage enum with closed_go and closed_no_go.
 */
export enum IdeaStage {
  SANDBOX = "sandbox",
  VALIDATION_SPRINT = "validation_sprint",
  BUILD_SPRINT = "build_sprint",
  LAUNCH_TEST = "launch_test",
  CLOSED_GO = "closed_go",
  CLOSED_NO_GO = "closed_no_go",
}

/**
 * Who submitted the idea — determines source analysis breakdown.
 * Mirrors the `submitter_type` DB enum in src/lib/supabase/types.ts.
 */
export enum SubmitterType {
  EMPLOYEE = "employee",
  EXECUTIVE = "executive",
  PARTNER = "partner",
  VENDOR = "vendor",
}

// ─── Zod enum schemas (derived from TS enums above) ──────────────────────────

const IdeaStageSchema = z.nativeEnum(IdeaStage);
const SubmitterTypeSchema = z.nativeEnum(SubmitterType);

// ─── Input Schemas ────────────────────────────────────────────────────────────

/**
 * DateRangeSchema — shared input for all dashboard query procedures.
 *
 * Constraints (from api-spec.md):
 *   - `from` must not be after `to`
 *   - date range must not exceed 365 days
 */
export const DateRangeSchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .refine((d) => new Date(d.from) <= new Date(d.to), {
    message: "from must not be after to",
  })
  .refine(
    (d) => {
      const diffDays = (new Date(d.to).getTime() - new Date(d.from).getTime()) / 86_400_000;
      return diffDays <= 365;
    },
    { message: "date range must not exceed 1 year" }
  );

export type DateRangeInput = z.infer<typeof DateRangeSchema>;

/**
 * ExportReportSchema — input for exportPipelineReport procedure.
 * Extends DateRangeSchema with a `format` field (excel | print).
 */
export const ExportReportSchema = DateRangeSchema.extend({
  format: z.enum(["excel", "print"]),
});

export type ExportReportInput = z.infer<typeof ExportReportSchema>;

// ─── Shared value types ───────────────────────────────────────────────────────

/** Lightweight date-range object echoed back in every response */
export interface DateRange {
  from: string;
  to: string;
}

// ─── Row types ────────────────────────────────────────────────────────────────

/** One row in ideaCountByStage / byStage arrays */
export interface StageCountRow {
  stage: IdeaStage;
  count: number;
}

/** Win / No-Go / in-progress statistics */
export interface WinNoGoStats {
  /** Total ideas in a terminal stage (closed_go + closed_no_go) */
  totalClosed: number;
  /** Ideas in the closed_go stage */
  closedGo: number;
  /** Ideas in the closed_no_go stage */
  closedNoGo: number;
  /** Ideas still in an active (non-closed) stage */
  inProgress: number;
  /**
   * closedGo / totalClosed — range 0–1.
   * Equals 0 when totalClosed is 0 (no division-by-zero).
   */
  winRate: number;
}

/** Average time spent in a single pipeline stage */
export interface StageTimeRow {
  stage: IdeaStage;
  /** Average calendar days in this stage (computed from stage_transitions) */
  avgDays: number;
}

/** Workload summary for a single BD reviewer */
export interface ReviewerWorkloadRow {
  /** UUID matching users.id */
  reviewerId: string;
  /** Resolved display name from users.name */
  reviewerName: string;
  /** Total distinct ideas assigned / reviewed */
  ideaCount: number;
  /** Per-stage breakdown for this reviewer */
  byStage: StageCountRow[];
}

/** Source breakdown for one submitter type */
export interface SourceBreakdownRow {
  submitterType: SubmitterType;
  count: number;
  /** count / totalIdeas * 100 — computed in service layer */
  percentage: number;
}

/** Per-idea row included in the exported pipeline report */
export interface IdeaExportRow {
  referenceNumber: string;
  title: string;
  submitterType: SubmitterType;
  /** ISO 8601 timestamp */
  submittedAt: string;
  currentStage: IdeaStage;
  ideaType: string;
  assignedReviewer: string | null;
  /** ISO 8601 timestamp */
  lastUpdatedAt: string;
}

// ─── Aggregate / View types ───────────────────────────────────────────────────

/**
 * ExecutiveSummaryData — returned by dashboard.getExecutiveSummary.
 * Roles: admin, bd_lead
 */
export interface ExecutiveSummaryData {
  /** Total number of ideas submitted within the date range */
  totalIdeas: number;
  /** Idea count grouped by current pipeline stage */
  ideaCountByStage: StageCountRow[];
  /** Win / No-Go breakdown */
  winNoGoStats: WinNoGoStats;
  /** Average time spent per stage (ideas that have exited the stage) */
  avgTimePerStage: StageTimeRow[];
  /** Echoed-back date range for display */
  dateRange: DateRange;
}

/**
 * BDTeamViewData — returned by dashboard.getBDTeamView.
 * Roles: bd_reviewer, bd_lead
 */
export interface BDTeamViewData {
  /** Ideas in ai_draft watermark status awaiting BD review */
  pendingReviewCount: number;
  /** Per-reviewer workload rows */
  reviewerWorkload: ReviewerWorkloadRow[];
  /** Echoed-back date range for display */
  dateRange: DateRange;
}

/**
 * SourceAnalysisData — returned by dashboard.getSourceAnalysis.
 * Roles: admin
 */
export interface SourceAnalysisData {
  /** Total number of ideas in the date range */
  totalIdeas: number;
  /** Breakdown by submitter type with percentage */
  bySubmitterType: SourceBreakdownRow[];
  /** Echoed-back date range for display */
  dateRange: DateRange;
}

/**
 * PipelineReportData — returned by dashboard.exportPipelineReport.
 * Client-side ExportService consumes this to generate xlsx or print.
 * Roles: admin, bd_lead
 */
export interface PipelineReportData {
  /** ISO 8601 timestamp of when the report was generated */
  generatedAt: string;
  /** Date range used for this report */
  dateRange: DateRange;
  /** Executive summary section */
  summary: ExecutiveSummaryData;
  /** Source / submitter analysis section */
  sourceAnalysis: SourceAnalysisData;
  /** BD team workload section */
  bdWorkload: BDTeamViewData;
  /**
   * Flat list of idea rows for the Excel sheet.
   * Capped at 10,000 rows per request (enforced upstream by tRPC procedure).
   */
  ideas: IdeaExportRow[];
}

// ─── Re-export Zod enum schemas for use in tRPC routers ──────────────────────
export { IdeaStageSchema, SubmitterTypeSchema };
