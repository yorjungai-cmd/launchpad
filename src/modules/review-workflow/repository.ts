/**
 * ReviewWorkflowRepository — data access for review_actions, stage_transitions,
 * and cross-unit writes to output_documents and ideas.
 *
 * Ref: design/components.md — Component 3
 *      design/data-model.md
 * Task 2.1
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WatermarkStatus } from "@/shared/enums";
import type {
  ReviewAction,
  StageTransition,
  QueueItem,
  ReviewQueueFilter,
  ReviewActionType,
} from "./types";

// ─── DB Row types ─────────────────────────────────────────────────────────────

interface ReviewActionRow {
  id: string;
  idea_id: string;
  reviewer_id: string;
  reviewer_name: string;
  action_type: ReviewActionType;
  document_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface StageTransitionRow {
  id: string;
  idea_id: string;
  from_stage: string | null;
  to_stage: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  reason: string | null;
  created_at: string;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapRowToReviewAction(row: ReviewActionRow): ReviewAction {
  return {
    id: row.id,
    ideaId: row.idea_id,
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name,
    actionType: row.action_type,
    documentId: row.document_id,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

function mapRowToStageTransition(row: StageTransitionRow): StageTransition {
  return {
    id: row.id,
    ideaId: row.idea_id,
    fromStage: row.from_stage,
    toStage: row.to_stage,
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ReviewWorkflowRepository {
  private getClient(): any {
    return createServerSupabaseClient();
  }

  // ── review_actions (append-only) ─────────────────────────────────────────

  /**
   * INSERT a new review_action. NEVER update or delete rows.
   */
  async insertReviewAction(params: {
    ideaId: string;
    reviewerId: string;
    reviewerName: string;
    actionType: ReviewActionType;
    documentId?: string;
    payload: Record<string, unknown>;
  }): Promise<ReviewAction> {
    const db = this.getClient();
    const { data, error } = await db
      .from("review_actions")
      .insert({
        idea_id: params.ideaId,
        reviewer_id: params.reviewerId,
        reviewer_name: params.reviewerName,
        action_type: params.actionType,
        document_id: params.documentId ?? null,
        payload: params.payload,
      })
      .select()
      .single();
    if (error || !data)
      throw new Error(
        `ReviewWorkflowRepository.insertReviewAction: ${error?.message ?? "no row returned"}`
      );
    return mapRowToReviewAction(data as unknown as ReviewActionRow);
  }

  /** List all review actions for an idea, newest first */
  async listReviewActions(ideaId: string): Promise<ReviewAction[]> {
    const db = this.getClient();
    const { data, error } = await db
      .from("review_actions")
      .select("*")
      .eq("idea_id", ideaId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`ReviewWorkflowRepository.listReviewActions: ${error.message}`);
    return (data ?? []).map((r: unknown) => mapRowToReviewAction(r as ReviewActionRow));
  }

  // ── stage_transitions (append-only) ──────────────────────────────────────

  async insertStageTransition(params: {
    ideaId: string;
    fromStage: string | null;
    toStage: string;
    reviewerId: string | null;
    reviewerName: string | null;
    reason?: string;
  }): Promise<StageTransition> {
    const db = this.getClient();
    const { data, error } = await db
      .from("stage_transitions")
      .insert({
        idea_id: params.ideaId,
        from_stage: params.fromStage,
        to_stage: params.toStage,
        reviewer_id: params.reviewerId,
        reviewer_name: params.reviewerName,
        reason: params.reason ?? null,
      })
      .select()
      .single();
    if (error || !data)
      throw new Error(
        `ReviewWorkflowRepository.insertStageTransition: ${error?.message ?? "no row returned"}`
      );
    return mapRowToStageTransition(data as unknown as StageTransitionRow);
  }

  async listStageTransitions(ideaId: string): Promise<StageTransition[]> {
    const db = this.getClient();
    const { data, error } = await db
      .from("stage_transitions")
      .select("*")
      .eq("idea_id", ideaId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`ReviewWorkflowRepository.listStageTransitions: ${error.message}`);
    return (data ?? []).map((r: unknown) => mapRowToStageTransition(r as StageTransitionRow));
  }

  // ── Cross-unit writes: ideas ──────────────────────────────────────────────

  async updateIdeaStage(ideaId: string, stage: string): Promise<void> {
    const db = this.getClient();
    const { error } = await db.from("ideas").update({ current_stage: stage }).eq("id", ideaId);
    if (error) throw new Error(`ReviewWorkflowRepository.updateIdeaStage: ${error.message}`);
  }

  async updateIdeaRejection(ideaId: string, reason: string, reviewerId: string): Promise<void> {
    const db = this.getClient();
    const { error } = await db
      .from("ideas")
      .update({
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
        rejected_by: reviewerId,
        current_stage: "Closed",
      })
      .eq("id", ideaId);
    if (error) throw new Error(`ReviewWorkflowRepository.updateIdeaRejection: ${error.message}`);
  }

  // ── Cross-unit writes: output_documents ──────────────────────────────────

  /** Bulk update watermark_status for all documents of an idea */
  async updateDocumentWatermark(ideaId: string, status: WatermarkStatus): Promise<number> {
    const db = this.getClient();
    const { data, error } = await db
      .from("output_documents")
      .update({ watermark_status: status })
      .eq("idea_id", ideaId)
      .select("id");
    if (error)
      throw new Error(`ReviewWorkflowRepository.updateDocumentWatermark: ${error.message}`);
    return (data ?? []).length;
  }

  /** Update BD-edited content for a single document */
  async updateDocumentContent(docId: string, content: string): Promise<void> {
    const db = this.getClient();
    const { error } = await db
      .from("output_documents")
      .update({ content_edited_markdown: content })
      .eq("id", docId);
    if (error) throw new Error(`ReviewWorkflowRepository.updateDocumentContent: ${error.message}`);
  }

  /** Get document by ID (to verify it belongs to the correct idea) */
  async findDocumentById(docId: string): Promise<{ ideaId: string; documentType: string } | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from("output_documents")
      .select("idea_id, document_type")
      .eq("id", docId)
      .single();
    if (error) return null;
    const row = data as { idea_id: string; document_type: string } | null;
    return row ? { ideaId: row.idea_id, documentType: row.document_type } : null;
  }

  // ── Review queue ─────────────────────────────────────────────────────────

  async getQueueItems(
    filter: ReviewQueueFilter
  ): Promise<{ items: QueueItem[]; nextCursor: string | null; total: number }> {
    const db = this.getClient();
    const limit = Math.min(filter.limit ?? 20, 50);

    // Build base query: all ideas not closed (with optional left-join to ai_analyses)
    // Use left join (no !inner) so ideas without ai_analyses also appear in the queue
    let query = db
      .from("ideas")
      .select(
        `
        id, title, current_stage, submitter_name, submitter_type, created_at, updated_at,
        ai_analyses(processing_status, recommended_action)
      `
      )
      .neq("current_stage", "Closed")
      .neq("current_stage", "closed_go")
      .neq("current_stage", "closed_no_go");

    // Apply filters
    if (filter.stage) query = query.eq("current_stage", filter.stage);
    if (filter.submitterType) query = query.eq("submitter_type", filter.submitterType);
    if (filter.dateFrom) query = query.gte("created_at", filter.dateFrom);
    if (filter.dateTo) query = query.lte("created_at", filter.dateTo);
    if (filter.cursor) query = query.lt("id", filter.cursor);

    query = query.order("created_at", { ascending: false }).limit(limit + 1);

    const { data, error } = await query;
    if (error) throw new Error(`ReviewWorkflowRepository.getQueueItems: ${error.message}`);

    const rows = (data ?? []) as any[];
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => {
      // ai_analyses may be array (left join) or null
      const analysis = Array.isArray(row.ai_analyses) ? row.ai_analyses[0] : row.ai_analyses;
      return {
        ideaId: row.id as string,
        title: (row.title ?? "") as string,
        currentStage: (row.current_stage ?? "sandbox") as string,
        submitterName: (row.submitter_name ?? "") as string,
        submitterType: (row.submitter_type ?? "") as string,
        submittedAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        watermarkStatus: "ai_draft" as string,
        recommendedAction: analysis?.recommended_action ?? null,
        lastActionAt: null,
        lastActionType: null,
      };
    });

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.ideaId ?? null) : null,
      total: items.length,
    };
  }

  /** Get idea with current stage (for validation) */
  async findIdea(
    ideaId: string
  ): Promise<{ currentStage: string; rejectionReason: string | null } | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from("ideas")
      .select("current_stage, rejection_reason")
      .eq("id", ideaId)
      .single();
    if (error) return null;
    const row = data as { current_stage: string; rejection_reason: string | null } | null;
    return row ? { currentStage: row.current_stage, rejectionReason: row.rejection_reason } : null;
  }
}

/** Singleton */
export const reviewWorkflowRepository = new ReviewWorkflowRepository();
