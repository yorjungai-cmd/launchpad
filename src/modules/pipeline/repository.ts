/**
 * PipelineRepository — Task 2.1
 *
 * Data access layer for the pipeline-tracking module.
 * Reads from `ideas` + `stage_transitions` + `profiles` tables via Supabase JS client.
 *
 * Column mapping (DB → DTO):
 *   ideas.created_at          → submittedAt
 *   ideas.updated_at          → updatedAt
 *   ideas.current_stage       → currentStage
 *   ideas.submitter_type      → submitterType
 *   stage_transitions.created_at  → transitionedAt  (note: spec column, maps from created_at)
 *   stage_transitions.reason      → note
 *   stage_transitions.from_stage  → fromStage
 *   stage_transitions.to_stage    → toStage
 *
 * Notes on DB schema vs design spec:
 * - `ideas` table (as per types.ts placeholder) does not yet include
 *   `assigned_reviewer_id` or `watermark_status`; those columns are referenced
 *   from the design spec and will be present once the idea-submission migration runs.
 *   This repository selects them and handles null gracefully.
 * - `stage_transitions` table is not yet in types.ts; we use `any` cast on the
 *   raw query result and type it via the local interface below.
 * - Stage enum from shared/enums.ts has 4 values (sandbox → launch_and_test).
 *   The design spec also mentions closed_go / closed_no_go which live only in the
 *   DB enum. We use `z.nativeEnum(Stage)` from schemas and fall back gracefully.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { Stage } from "@/shared/enums";
import type {
  GetKanbanInput,
  KanbanColumnDTO,
  PipelineIdeaDTO,
  StatusCardDTO,
  GuestTrackingDTO,
  StageTimelineEntryDTO,
} from "./schemas";
import type { SubmitterType } from "./schemas";

// ─── Local DB row shapes (stage_transitions not yet in generated types) ───────

interface StageTransitionRow {
  id: string;
  idea_id: string;
  from_stage: string | null;
  to_stage: string;
  transitioned_by: string | null;
  /** DB column name is `created_at` — maps to `transitionedAt` in DTO */
  created_at: string;
  /** DB column name is `reason` — maps to `note` in DTO */
  reason: string | null;
}

interface IdeaWithReviewer {
  id: string;
  reference_number: string;
  title: string;
  current_stage: string;
  submitter_type: string;
  assigned_reviewer_id: string | null;
  created_at: string;
  updated_at: string;
  watermark_status: string | null;
  /** Joined from profiles via assigned_reviewer_id */
  reviewer_full_name: string | null;
}

// All pipeline stages in display order
const ALL_STAGES: Stage[] = [
  Stage.SANDBOX,
  Stage.VALIDATION_SPRINT,
  Stage.BUILD_SPRINT,
  Stage.LAUNCH_AND_TEST,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapTransitionToDTO(row: StageTransitionRow): StageTimelineEntryDTO {
  return {
    fromStage: isValidStage(row.from_stage) ? (row.from_stage as Stage) : null,
    toStage: row.to_stage,
    transitionedAt: row.created_at,
    note: row.reason ?? null,
  };
}

function isValidStage(value: string | null): value is Stage {
  if (!value) return false;
  return Object.values(Stage).includes(value as Stage);
}

function mapIdeaToDTO(row: IdeaWithReviewer): PipelineIdeaDTO {
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    title: row.title,
    currentStage: row.current_stage as Stage,
    submitterType: row.submitter_type as SubmitterType,
    assignedReviewer:
      row.assigned_reviewer_id && row.reviewer_full_name
        ? { id: row.assigned_reviewer_id, fullName: row.reviewer_full_name }
        : null,
    submittedAt: row.created_at,
    updatedAt: row.updated_at,
    // watermark_status may not yet exist on the ideas table in the placeholder schema
    watermarkStatus: (row.watermark_status as PipelineIdeaDTO["watermarkStatus"]) ?? "ai_draft",
  };
}

// ─── PipelineRepository ───────────────────────────────────────────────────────

export class PipelineRepository {
  private get db() {
    return createServerSupabaseClient();
  }

  // ── findKanbanIdeas ──────────────────────────────────────────────────────

  /**
   * Fetches ideas grouped by stage for the Kanban board.
   *
   * - If filters.stage is set, only that stage is returned.
   * - Otherwise all stages in ALL_STAGES are fetched (in parallel).
   * - Cursor-based pagination per stage: cursor = updated_at ISO string.
   *   When a cursor is present, the query adds `updated_at < cursor` so the
   *   client can "load more" independently per column.
   * - Fetches limit+1 rows to determine hasMore without a COUNT query.
   */
  async findKanbanIdeas(
    filters: GetKanbanInput["filters"],
    cursors: GetKanbanInput["cursors"],
    limit: number
  ): Promise<KanbanColumnDTO[]> {
    const stagesToFetch = filters?.stage ? [filters.stage] : ALL_STAGES;

    const columns = await Promise.all(
      stagesToFetch.map((stage) => this.fetchColumnData(stage, filters, cursors?.[stage], limit))
    );

    return columns;
  }

  private async fetchColumnData(
    stage: Stage,
    filters: GetKanbanInput["filters"],
    cursor: string | undefined,
    limit: number
  ): Promise<KanbanColumnDTO> {
    const db = this.db;

    // Build the base query with LEFT JOIN to profiles for reviewer name.
    // Supabase JS does not have a typed LEFT JOIN API, so we use the
    // PostgREST embedded resource syntax via .select().
    // assigned_reviewer_id and watermark_status may not exist in the
    // placeholder types — use `any` to avoid compile errors until the
    // real schema is generated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (db as any)
      .from("ideas")
      .select(
        `
        id,
        reference_number,
        title,
        current_stage,
        submitter_type,
        assigned_reviewer_id,
        created_at,
        updated_at,
        watermark_status,
        profiles!ideas_assigned_reviewer_id_fkey (
          id,
          full_name
        )
      `
      )
      .eq("current_stage", stage)
      .order("updated_at", { ascending: false })
      .limit(limit + 1); // fetch one extra to determine hasMore

    // Optional filters
    if (filters?.submitterType) {
      query = query.eq("submitter_type", filters.submitterType);
    }
    if (filters?.fromDate) {
      query = query.gte("created_at", filters.fromDate);
    }
    if (filters?.toDate) {
      query = query.lte("created_at", filters.toDate);
    }

    // Cursor: show only rows updated before the cursor value
    if (cursor) {
      query = query.lt("updated_at", cursor);
    }

    const { data, error } = await query;

    if (error) {
      throw AppError.internal(`Failed to fetch kanban column for stage: ${stage}`, {
        stage,
        supabaseError: error.message,
      });
    }

    // Map raw rows — the joined profile comes back as a nested object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: IdeaWithReviewer[] = ((data as any[]) ?? []).map((row: any) => ({
      id: row.id,
      reference_number: row.reference_number,
      title: row.title,
      current_stage: row.current_stage,
      submitter_type: row.submitter_type,
      assigned_reviewer_id: row.assigned_reviewer_id ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      watermark_status: row.watermark_status ?? null,
      reviewer_full_name: row.profiles?.full_name ?? null,
    }));

    const hasMore = rows.length > limit;
    const ideas = rows.slice(0, limit).map(mapIdeaToDTO);

    // Cursor for next page = updated_at of last returned idea
    const nextCursor =
      hasMore && ideas.length > 0 ? (ideas[ideas.length - 1]?.updatedAt ?? null) : null;

    return {
      stage,
      ideas,
      cursor: nextCursor,
      hasMore,
    };
  }

  // ── findIdeaById ─────────────────────────────────────────────────────────

  /**
   * Fetches a single idea with its full stage timeline.
   * Throws AppError.notFound() if no idea with the given id exists.
   */
  async findIdeaById(ideaId: string): Promise<StatusCardDTO> {
    const db = this.db;

    // Fetch idea with reviewer profile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ideaData, error: ideaError } = await (db as any)
      .from("ideas")
      .select(
        `
        id,
        reference_number,
        title,
        current_stage,
        submitter_type,
        assigned_reviewer_id,
        created_at,
        updated_at,
        watermark_status,
        profiles!ideas_assigned_reviewer_id_fkey (
          id,
          full_name
        )
      `
      )
      .eq("id", ideaId)
      .maybeSingle();

    if (ideaError) {
      throw AppError.internal(`Failed to fetch idea by id: ${ideaId}`, {
        ideaId,
        supabaseError: ideaError.message,
      });
    }

    if (!ideaData) {
      throw AppError.notFound(`Idea not found: ${ideaId}`, { ideaId });
    }

    // Fetch stage transitions for the timeline
    const transitions = await this.fetchStageTransitions(ideaId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = ideaData as any;
    const ideaRow: IdeaWithReviewer = {
      id: row.id,
      reference_number: row.reference_number,
      title: row.title,
      current_stage: row.current_stage,
      submitter_type: row.submitter_type,
      assigned_reviewer_id: row.assigned_reviewer_id ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      watermark_status: row.watermark_status ?? null,
      reviewer_full_name: row.profiles?.full_name ?? null,
    };

    return {
      ...mapIdeaToDTO(ideaRow),
      stageTimeline: transitions,
    };
  }

  // ── findIdeaByReferenceNumber ─────────────────────────────────────────────

  /**
   * Fetches a single idea by reference number for guest tracking.
   * Returns a GuestTrackingDTO — omits assignedReviewer, submitterType,
   * and watermarkStatus (masked at application layer).
   * Throws AppError.notFound() if no idea with that reference number exists.
   */
  async findIdeaByReferenceNumber(referenceNumber: string): Promise<GuestTrackingDTO> {
    const db = this.db;

    // For guest tracking we only need safe, non-PII fields from ideas.
    // We do NOT join profiles here — reviewer info is masked for guests.
    const { data: ideaData, error: ideaError } = await db
      .from("ideas")
      .select(
        `
        id,
        reference_number,
        title,
        current_stage,
        created_at,
        updated_at
      `
      )
      .eq("reference_number", referenceNumber)
      .maybeSingle();

    if (ideaError) {
      throw AppError.internal(`Failed to fetch idea by reference number: ${referenceNumber}`, {
        referenceNumber,
        supabaseError: ideaError.message,
      });
    }

    if (!ideaData) {
      throw AppError.notFound(`Idea not found for reference number: ${referenceNumber}`, {
        referenceNumber,
      });
    }

    // Fetch stage transitions for the timeline
    const transitions = await this.fetchStageTransitions(ideaData.id);

    return {
      ideaId: ideaData.id,
      referenceNumber: ideaData.reference_number,
      title: ideaData.title,
      currentStage: ideaData.current_stage as Stage,
      submittedAt: ideaData.created_at,
      updatedAt: ideaData.updated_at,
      stageTimeline: transitions,
      aiResult: null,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Fetches all stage transitions for a given idea, ordered by created_at ASC.
   * `stage_transitions` is not in the placeholder types.ts — uses `any` cast.
   */
  private async fetchStageTransitions(ideaId: string): Promise<StageTimelineEntryDTO[]> {
    const db = this.db;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from("stage_transitions")
      .select(
        `
        id,
        idea_id,
        from_stage,
        to_stage,
        transitioned_by,
        created_at,
        reason
      `
      )
      .eq("idea_id", ideaId)
      .order("created_at", { ascending: true });

    if (error) {
      throw AppError.internal(`Failed to fetch stage transitions for idea: ${ideaId}`, {
        ideaId,
        supabaseError: error.message,
      });
    }

    return ((data as StageTransitionRow[]) ?? []).map(mapTransitionToDTO);
  }
}

export const pipelineRepository = new PipelineRepository();
