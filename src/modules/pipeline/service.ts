/**
 * PipelineService — Task 3.1
 *
 * Business logic layer for the pipeline-tracking module.
 * Sits between PipelineRouter (tRPC) and PipelineRepository (Supabase).
 *
 * Responsibilities:
 * - Apply role-based data masking (guest sees limited fields via GuestTrackingDTO)
 * - Ensure stageTimeline is sorted ascending (safety net over repository ordering)
 * - Delegate data access to pipelineRepository
 *
 * Pure functions (sortTimelineAscending, toGuestTrackingDTO) are exported
 * separately for unit tests and property-based tests (fast-check).
 */

import { pipelineRepository } from "./repository";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import type {
  GetKanbanInput,
  KanbanColumnDTO,
  GetStatusCardInput,
  StatusCardDTO,
  TrackByReferenceInput,
  GuestTrackingDTO,
  PipelineIdeaDTO,
  StageTimelineEntryDTO,
} from "./schemas";

// ─── Pure Functions (exported for unit tests + PBT) ───────────────────────────

/**
 * Sorts a stage timeline array ascending by `transitionedAt`.
 * Does NOT mutate the input — returns a new sorted array.
 *
 * Handles:
 * - Empty array → returns []
 * - Single entry → returns copy with that entry
 * - Duplicate timestamps → stable relative order preserved (Array.sort is stable in V8/Node ≥ 11)
 */
export function sortTimelineAscending(timeline: StageTimelineEntryDTO[]): StageTimelineEntryDTO[] {
  return [...timeline].sort(
    (a, b) => new Date(a.transitionedAt).getTime() - new Date(b.transitionedAt).getTime()
  );
}

/**
 * Transforms a full PipelineIdeaDTO into a GuestTrackingDTO by masking
 * sensitive / internal fields.
 *
 * Fields OMITTED (privacy / role-based masking):
 *   - submitterType       (internal classification)
 *   - assignedReviewer    (internal reviewer PII)
 *   - watermarkStatus     (internal document lifecycle state)
 *   - id                  (internal DB UUID — not exposed to guest)
 *
 * Fields INCLUDED:
 *   - referenceNumber, title, currentStage, submittedAt, updatedAt, stageTimeline
 *
 * The timeline is sorted ascending inside this function so the output is
 * always correctly ordered regardless of how the caller obtained the raw data.
 */
export function toGuestTrackingDTO(
  idea: PipelineIdeaDTO,
  timeline: StageTimelineEntryDTO[],
  aiResult: GuestTrackingDTO["aiResult"] = null
): GuestTrackingDTO {
  return {
    referenceNumber: idea.referenceNumber,
    title: idea.title,
    currentStage: idea.currentStage,
    submittedAt: idea.submittedAt,
    updatedAt: idea.updatedAt,
    stageTimeline: sortTimelineAscending(timeline),
    aiResult,
  };
}

// ─── PipelineService ──────────────────────────────────────────────────────────

export class PipelineService {
  /**
   * Returns Kanban board data grouped by pipeline stage.
   *
   * Delegates filtering, pagination, and DB access to the repository.
   * Each column includes cursor + hasMore for independent "load more" per column.
   */
  async getKanbanData(input: GetKanbanInput): Promise<{ columns: KanbanColumnDTO[] }> {
    const columns = await pipelineRepository.findKanbanIdeas(
      input.filters,
      input.cursors,
      input.limit
    );

    return { columns };
  }

  /**
   * Returns a full status card for a single idea (authenticated internal users).
   *
   * Includes complete stageTimeline — sorted ascending as a safety net even
   * though the repository already orders by created_at ASC.
   */
  async getStatusCard(input: GetStatusCardInput): Promise<{ statusCard: StatusCardDTO }> {
    const raw = await pipelineRepository.findIdeaById(input.ideaId);

    const statusCard: StatusCardDTO = {
      ...raw,
      stageTimeline: sortTimelineAscending(raw.stageTimeline),
    };

    return { statusCard };
  }

  /**
   * Returns guest-safe tracking data for a public reference number lookup.
   *
   * Sensitive fields (submitterType, assignedReviewer, watermarkStatus) are
   * stripped via toGuestTrackingDTO — masking occurs at the service layer so
   * the repository can return a wider shape without leaking to the guest API.
   *
   * stageTimeline is sorted ascending as a safety net.
   */
  async trackByReference(input: TrackByReferenceInput): Promise<{ tracking: GuestTrackingDTO }> {
    const raw = await pipelineRepository.findIdeaByReferenceNumber(input.referenceNumber);

    // Fetch high-level AI result via admin client (guest has no session → bypass RLS).
    // We look up the idea id by reference number, then read its ai_analyses summary.
    let aiResult: GuestTrackingDTO["aiResult"] = null;
    try {
      const db = createAdminSupabaseClient();
      const { data: ideaRow } = await db
        .from("ideas")
        .select("id")
        .eq("reference_number", input.referenceNumber)
        .single();

      if (ideaRow?.id) {
        // ai_analyses is not in the generated types — use an untyped client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: analysis } = await (db as any)
          .from("ai_analyses")
          .select("summary, recommended_action, stage, idea_type, processing_status")
          .eq("idea_id", ideaRow.id)
          .maybeSingle();

        if (analysis && analysis.processing_status === "completed") {
          aiResult = {
            summary: analysis.summary ?? null,
            recommendedAction: analysis.recommended_action ?? null,
            stage: analysis.stage ?? null,
            ideaType: analysis.idea_type ?? null,
          };
        }
      }
    } catch {
      // Non-fatal — tracking still works without AI result
      aiResult = null;
    }

    const tracking = toGuestTrackingDTO(
      {
        referenceNumber: raw.referenceNumber,
        title: raw.title,
        currentStage: raw.currentStage,
        submittedAt: raw.submittedAt,
        updatedAt: raw.updatedAt,
        id: "",
        submitterType: "employee" as PipelineIdeaDTO["submitterType"],
        assignedReviewer: null,
        watermarkStatus: "ai_draft" as PipelineIdeaDTO["watermarkStatus"],
      },
      raw.stageTimeline,
      aiResult
    );

    return { tracking };
  }
}

export const pipelineService = new PipelineService();
