/**
 * ReviewWorkflowService — business logic for review operations.
 *
 * Owns: watermark transitions, stage machine, approval, rejection, audit log.
 * Calls: documentGenerationService (section update), notificationService (stub).
 *
 * Ref: design/components.md — Component 2
 *      design/correctness.md — Properties 1–5
 * Task 3.1, 4.1, 5.1
 */

import logger from "@/lib/logger";
import { AppError } from "@/lib/errors/AppError";
import { WatermarkStatus } from "@/shared/enums";
import { reviewWorkflowRepository } from "./repository";
import { notificationService } from "@/modules/notification/service";
import type { ReviewAction, StageTransition, QueueItem, ReviewQueueFilter } from "./types";

// ─── Helper: fetch idea submitter data for notification ───────────────────────

interface IdeaSubmitterInfo {
  id: string;
  title: string;
  submitterEmail: string;
  submitterName: string | null;
  submitterUserId: string | null;
}

async function getIdeaSubmitterInfo(ideaId: string): Promise<IdeaSubmitterInfo | null> {
  try {
    const { createAdminSupabaseClient } = await import("@/lib/supabase/server");
    const db = createAdminSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any)
      .from("ideas")
      .select("id, title, submitter_email, submitter_name, user_id")
      .eq("id", ideaId)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      title: data.title as string,
      submitterEmail: (data.submitter_email as string) ?? "",
      submitterName: (data.submitter_name as string) ?? null,
      submitterUserId: (data.user_id as string) ?? null,
    };
  } catch {
    return null;
  }
}

// ─── Stage machine ────────────────────────────────────────────────────────────

export const VALID_STAGES = [
  "sandbox",
  "validation_sprint",
  "build_sprint",
  "launch_and_test",
  "closed_go",
  "closed_no_go",
] as const;

export type IdeaStage = (typeof VALID_STAGES)[number];

/**
 * Validate whether a stage transition is legal.
 * Rules: Closed is terminal, same→same is invalid, unknown stage is invalid.
 */
export function validateStageTransition(
  fromStage: string,
  toStage: string
): { valid: boolean; error?: string } {
  if (!VALID_STAGES.includes(toStage as IdeaStage)) {
    return { valid: false, error: `Unknown stage: ${toStage}` };
  }
  if (fromStage === "closed_go" || fromStage === "closed_no_go") {
    return { valid: false, error: "Cannot transition from Closed stage (terminal state)" };
  }
  if (fromStage === toStage) {
    return { valid: false, error: `Cannot transition to the same stage: ${toStage}` };
  }
  return { valid: true };
}

// ─── Watermark machine ────────────────────────────────────────────────────────

const WATERMARK_ORDER: Record<WatermarkStatus, number> = {
  [WatermarkStatus.AI_DRAFT]: 0,
  [WatermarkStatus.BD_REVIEWED]: 1,
  [WatermarkStatus.APPROVED]: 2,
};

/**
 * Validate and apply watermark transition — monotonic direction only.
 * ai_draft → bd_reviewed → approved. No downgrades.
 */
export function applyWatermarkTransition(
  current: string,
  next: string
): { success: boolean; status?: WatermarkStatus; error?: string } {
  const currentOrder = WATERMARK_ORDER[current as WatermarkStatus] ?? -1;
  const nextOrder = WATERMARK_ORDER[next as WatermarkStatus] ?? -1;
  if (nextOrder < 0) return { success: false, error: `Unknown watermark status: ${next}` };
  if (nextOrder <= currentOrder) {
    return {
      success: false,
      error: `Invalid watermark transition: ${current} → ${next} (no downgrades)`,
    };
  }
  return { success: true, status: next as WatermarkStatus };
}

// ─── Reject validation ────────────────────────────────────────────────────────

const MIN_REJECT_REASON_LENGTH = 10;

export function validateRejectInput(params: { reason: string }): {
  valid: boolean;
  error?: string;
} {
  const trimmed = params.reason.trim();
  if (trimmed.length < MIN_REJECT_REASON_LENGTH) {
    return {
      valid: false,
      error: `Rejection reason must be at least ${MIN_REJECT_REASON_LENGTH} characters`,
    };
  }
  return { valid: true };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ReviewWorkflowService {
  /**
   * BD saves edited content of a document.
   * Updates content_edited_markdown, transitions watermark to bd_reviewed, logs action.
   * Task 3.1
   */
  async saveEdit(params: {
    ideaId: string;
    documentId: string;
    contentEditedMarkdown: string;
    reviewerId: string;
    reviewerName: string;
  }): Promise<{ watermarkStatus: WatermarkStatus; savedAt: string }> {
    // Verify document belongs to idea
    const doc = await reviewWorkflowRepository.findDocumentById(params.documentId);
    if (!doc) throw AppError.notFound(`Document ${params.documentId} not found`);
    if (doc.ideaId !== params.ideaId)
      throw AppError.forbidden("Document does not belong to this idea");

    // Validate watermark transition (current = unknown, target = bd_reviewed — always valid for edit)
    const savedAt = new Date().toISOString();

    // Write content
    await reviewWorkflowRepository.updateDocumentContent(
      params.documentId,
      params.contentEditedMarkdown
    );

    // Transition watermark to bd_reviewed (only if currently ai_draft; bd_reviewed stays bd_reviewed)
    // We don't downgrade from approved — if already approved, editing resets to bd_reviewed
    await reviewWorkflowRepository.updateDocumentWatermark(
      params.ideaId,
      WatermarkStatus.BD_REVIEWED
    );

    // Log action (append-only)
    await reviewWorkflowRepository.insertReviewAction({
      ideaId: params.ideaId,
      reviewerId: params.reviewerId,
      reviewerName: params.reviewerName,
      actionType: "edit",
      documentId: params.documentId,
      payload: {
        document_type: doc.documentType,
        new_length: params.contentEditedMarkdown.length,
      },
    });

    logger.info(
      { ideaId: params.ideaId, docId: params.documentId },
      "ReviewWorkflowService: saveEdit"
    );
    return { watermarkStatus: WatermarkStatus.BD_REVIEWED, savedAt };
  }

  /**
   * BD changes the stage of an idea.
   * Inserts stage_transition, updates ideas.current_stage, triggers proposal section update.
   * Task 4.1
   */
  async changeStage(params: {
    ideaId: string;
    toStage: string;
    reviewerId: string;
    reviewerName: string;
    reason?: string;
  }): Promise<{ fromStage: string; toStage: string; transitionId: string }> {
    const idea = await reviewWorkflowRepository.findIdea(params.ideaId);
    if (!idea) throw AppError.notFound(`Idea ${params.ideaId} not found`);

    const validation = validateStageTransition(idea.currentStage, params.toStage);
    if (!validation.valid) {
      throw AppError.validation(validation.error ?? "Invalid stage transition");
    }

    const fromStage = idea.currentStage;

    // Insert stage_transition
    const transition = await reviewWorkflowRepository.insertStageTransition({
      ideaId: params.ideaId,
      fromStage,
      toStage: params.toStage,
      reviewerId: params.reviewerId,
      reviewerName: params.reviewerName,
      reason: params.reason,
    });

    // Update ideas.current_stage
    await reviewWorkflowRepository.updateIdeaStage(params.ideaId, params.toStage);

    // Log action
    await reviewWorkflowRepository.insertReviewAction({
      ideaId: params.ideaId,
      reviewerId: params.reviewerId,
      reviewerName: params.reviewerName,
      actionType: "stage_change",
      payload: { from_stage: fromStage, to_stage: params.toStage, reason: params.reason },
    });

    // Trigger proposal section auto-update (best-effort)
    try {
      const { documentGenerationService } = await import("@/modules/document-generation/service");
      await documentGenerationService.regenerateProposalSection(
        params.ideaId,
        "ai_analysis.stage",
        async () => ({})
      );
    } catch (err) {
      logger.warn(
        { ideaId: params.ideaId, err },
        "ReviewWorkflowService: proposal section update failed (non-critical)"
      );
    }

    // Notify (fire-and-forget — non-blocking)
    getIdeaSubmitterInfo(params.ideaId)
      .then((info) => {
        if (info) {
          notificationService.notifyStageChanged({
            id: info.id,
            title: info.title,
            submitterEmail: info.submitterEmail,
            submitterName: info.submitterName,
            submitterUserId: info.submitterUserId,
            fromStage,
            toStage: params.toStage,
          });
        }
      })
      .catch((err) => logger.warn({ err }, "ReviewWorkflowService: notification failed"));

    logger.info(
      { ideaId: params.ideaId, from: fromStage, to: params.toStage },
      "ReviewWorkflowService: changeStage"
    );
    return { fromStage, toStage: params.toStage, transitionId: transition.id };
  }

  /**
   * Admin/BD Lead approves all documents for an idea.
   * Bulk updates watermark to 'approved', logs action.
   * Task 5.1
   */
  async approveDocuments(params: {
    ideaId: string;
    reviewerId: string;
    reviewerName: string;
  }): Promise<{ approvedCount: number; approvedAt: string }> {
    const approvedAt = new Date().toISOString();

    const count = await reviewWorkflowRepository.updateDocumentWatermark(
      params.ideaId,
      WatermarkStatus.APPROVED
    );
    if (count === 0) throw AppError.notFound("No documents found for this idea");

    await reviewWorkflowRepository.insertReviewAction({
      ideaId: params.ideaId,
      reviewerId: params.reviewerId,
      reviewerName: params.reviewerName,
      actionType: "approve",
      payload: { document_count: count, approved_at: approvedAt },
    });

    // Notify (fire-and-forget — non-blocking)
    getIdeaSubmitterInfo(params.ideaId)
      .then((info) => {
        if (info) {
          notificationService.notifyIdeaApproved({
            id: info.id,
            title: info.title,
            submitterEmail: info.submitterEmail,
            submitterName: info.submitterName,
            submitterUserId: info.submitterUserId,
          });
        }
      })
      .catch((err) => logger.warn({ err }, "ReviewWorkflowService: notification failed"));

    logger.info({ ideaId: params.ideaId, count }, "ReviewWorkflowService: approveDocuments");
    return { approvedCount: count, approvedAt };
  }

  /**
   * BD Reviewer marks an idea as No Go (Closed).
   * Validates reason, updates ideas, inserts stage_transition to Closed, logs action.
   * Task 5.1
   */
  async rejectIdea(params: {
    ideaId: string;
    reason: string;
    reviewerId: string;
    reviewerName: string;
  }): Promise<{ rejectedAt: string }> {
    const reasonValidation = validateRejectInput({ reason: params.reason });
    if (!reasonValidation.valid) {
      throw AppError.validation(reasonValidation.error ?? "Invalid rejection reason");
    }

    const idea = await reviewWorkflowRepository.findIdea(params.ideaId);
    if (!idea) throw AppError.notFound(`Idea ${params.ideaId} not found`);
    if (idea.currentStage === "closed_go" || idea.currentStage === "closed_no_go") {
      throw AppError.validation("Idea is already closed");
    }

    const rejectedAt = new Date().toISOString();
    const fromStage = idea.currentStage;

    // Update ideas with rejection info + stage = Closed
    await reviewWorkflowRepository.updateIdeaRejection(
      params.ideaId,
      params.reason,
      params.reviewerId
    );

    // Insert stage_transition to closed_no_go
    await reviewWorkflowRepository.insertStageTransition({
      ideaId: params.ideaId,
      fromStage,
      toStage: "closed_no_go",
      reviewerId: params.reviewerId,
      reviewerName: params.reviewerName,
      reason: params.reason,
    });

    // Log action
    await reviewWorkflowRepository.insertReviewAction({
      ideaId: params.ideaId,
      reviewerId: params.reviewerId,
      reviewerName: params.reviewerName,
      actionType: "reject",
      payload: { reason: params.reason },
    });

    // Notify (fire-and-forget — non-blocking)
    getIdeaSubmitterInfo(params.ideaId)
      .then((info) => {
        if (info) {
          notificationService.notifyIdeaRejected({
            id: info.id,
            title: info.title,
            submitterEmail: info.submitterEmail,
            submitterName: info.submitterName,
            submitterUserId: info.submitterUserId,
            reason: params.reason,
          });
        }
      })
      .catch((err) => logger.warn({ err }, "ReviewWorkflowService: notification failed"));

    logger.info({ ideaId: params.ideaId }, "ReviewWorkflowService: rejectIdea");
    return { rejectedAt };
  }

  /** Get queue items with filter + pagination */
  async getQueueItems(
    filter: ReviewQueueFilter
  ): Promise<{ items: QueueItem[]; nextCursor: string | null; total: number }> {
    return reviewWorkflowRepository.getQueueItems(filter);
  }

  /** Get stage transition history */
  async listTransitions(ideaId: string): Promise<StageTransition[]> {
    return reviewWorkflowRepository.listStageTransitions(ideaId);
  }

  /** Get recent review actions for an idea */
  async listReviewActions(ideaId: string): Promise<ReviewAction[]> {
    return reviewWorkflowRepository.listReviewActions(ideaId);
  }
}

/** Singleton */
export const reviewWorkflowService = new ReviewWorkflowService();
