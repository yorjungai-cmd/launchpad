/**
 * Zod schemas + TypeScript DTOs for the pipeline-tracking module.
 * Ref: design/api-spec.md, design/data-model.md
 *
 * Tasks 1.2
 *
 * Notes on enum usage:
 * - Stage and WatermarkStatus are imported from src/shared/enums.ts
 * - SubmitterType is defined inline here because it is not yet in shared/enums.ts
 *   (it is defined as a DB-level `submitter_type` enum in the ideas migration).
 *   TODO: add SubmitterType to src/shared/enums.ts and update this import.
 *
 * Notes on stage_transitions column mapping:
 * - DB table uses: from_stage (text), to_stage (text), created_at (not transitioned_at),
 *   reviewer_id, reviewer_name, reason (not note, not transitioned_by).
 * - The DTO layer uses camelCase names aligned with the design/data-model.md spec.
 * - The repository layer is responsible for mapping DB rows → DTOs.
 */

import { z } from "zod";
import { Stage, WatermarkStatus } from "@/shared/enums";

// ─── SubmitterType ─────────────────────────────────────────────────────────────
// Mirrors the `submitter_type` DB enum (ideas migration).
// TODO: promote to src/shared/enums.ts once agreed across units.
export enum SubmitterType {
  EMPLOYEE = "employee",
  EXECUTIVE = "executive",
  PARTNER = "partner",
  VENDOR = "vendor",
}

// ─── StageTimelineEntryDTO ────────────────────────────────────────────────────

export const StageTimelineEntryDTOSchema = z.object({
  /** Stage before transition — null for the initial submission entry */
  fromStage: z.nativeEnum(Stage).nullable(),
  /** Stage after transition */
  toStage: z.string(), // text in DB (supports non-enum values like 'Closed')
  /** ISO 8601 datetime — maps from stage_transitions.created_at */
  transitionedAt: z.string().datetime(),
  /** Optional reason/note — maps from stage_transitions.reason */
  note: z.string().nullable(),
});

export type StageTimelineEntryDTO = z.infer<typeof StageTimelineEntryDTOSchema>;

// ─── PipelineIdeaDTO ──────────────────────────────────────────────────────────

export const PipelineIdeaDTOSchema = z.object({
  id: z.string().uuid(),
  referenceNumber: z.string(),
  title: z.string(),
  /** Maps from ideas.current_stage */
  currentStage: z.nativeEnum(Stage),
  /** Maps from ideas.submitter_type */
  submitterType: z.nativeEnum(SubmitterType),
  /** Joined from profiles — null if no reviewer assigned */
  assignedReviewer: z
    .object({
      id: z.string().uuid(),
      fullName: z.string(),
    })
    .nullable(),
  /** ISO 8601 — maps from ideas.created_at */
  submittedAt: z.string().datetime(),
  /** ISO 8601 — maps from ideas.updated_at */
  updatedAt: z.string().datetime(),
  watermarkStatus: z.nativeEnum(WatermarkStatus),
});

export type PipelineIdeaDTO = z.infer<typeof PipelineIdeaDTOSchema>;

// ─── StatusCardDTO ────────────────────────────────────────────────────────────

export const StatusCardDTOSchema = PipelineIdeaDTOSchema.extend({
  stageTimeline: z.array(StageTimelineEntryDTOSchema),
});

export type StatusCardDTO = z.infer<typeof StatusCardDTOSchema>;

// ─── GuestTrackingDTO ─────────────────────────────────────────────────────────
// Intentionally omits: assignedReviewer, submitterType, watermarkStatus
// — masked at application layer (PipelineService) for privacy.

export const GuestTrackingDTOSchema = z.object({
  referenceNumber: z.string(),
  title: z.string(),
  currentStage: z.nativeEnum(Stage),
  /** ISO 8601 — maps from ideas.created_at */
  submittedAt: z.string().datetime(),
  /** ISO 8601 — maps from ideas.updated_at */
  updatedAt: z.string().datetime(),
  stageTimeline: z.array(StageTimelineEntryDTOSchema),
});

export type GuestTrackingDTO = z.infer<typeof GuestTrackingDTOSchema>;

// ─── KanbanColumnDTO ──────────────────────────────────────────────────────────

export const KanbanColumnDTOSchema = z.object({
  /** The pipeline stage this column represents */
  stage: z.nativeEnum(Stage),
  ideas: z.array(PipelineIdeaDTOSchema),
  /** Cursor value for "load more" — null when no more pages */
  cursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export type KanbanColumnDTO = z.infer<typeof KanbanColumnDTOSchema>;

// ─── Input schemas for tRPC procedures ───────────────────────────────────────

export const GetKanbanInputSchema = z.object({
  filters: z
    .object({
      /** Filter to a specific stage (shows all stages if omitted) */
      stage: z.nativeEnum(Stage).optional(),
      submitterType: z.nativeEnum(SubmitterType).optional(),
      /** ISO 8601 date string — inclusive lower bound on created_at */
      fromDate: z.string().datetime().optional(),
      /** ISO 8601 date string — inclusive upper bound on created_at */
      toDate: z.string().datetime().optional(),
    })
    .default({}),
  /**
   * Per-column cursors for independent pagination.
   * Key = Stage enum value, value = opaque cursor string.
   */
  cursors: z.record(z.string(), z.string().optional()).optional(),
  /** Number of ideas to return per column (1–50) */
  limit: z.number().min(1).max(50).default(20),
});

export type GetKanbanInput = z.infer<typeof GetKanbanInputSchema>;

export const GetStatusCardInputSchema = z.object({
  ideaId: z.string().uuid(),
});

export type GetStatusCardInput = z.infer<typeof GetStatusCardInputSchema>;

export const TrackByReferenceInputSchema = z.object({
  referenceNumber: z.string().min(1).max(50),
});

export type TrackByReferenceInput = z.infer<typeof TrackByReferenceInputSchema>;
