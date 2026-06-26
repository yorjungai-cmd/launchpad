/**
 * ReviewWorkflowRouter — tRPC procedures for BD review operations.
 *
 * Procedures: listQueue, getDetail, saveEdit, changeStage,
 *             approveDocuments, rejectIdea, listTransitions
 *
 * Ref: design/api-spec.md
 * Task 3.2, 4.2, 5.2
 */

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, roleProcedure } from "@/server/trpc";
import { reviewWorkflowService } from "./service";
import { reviewWorkflowRepository } from "./repository";
import {
  ReviewQueueFilterSchema,
  SaveEditInputSchema,
  ChangeStageInputSchema,
  ApproveDocumentsInputSchema,
  RejectIdeaInputSchema,
  IdeaIdInputSchema,
} from "./schemas";

// ─── Helper: get reviewer info from context ───────────────────────────────────
function getReviewerInfo(ctx: {
  user: { id: string; user_metadata?: Record<string, unknown> } | null;
}) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  const name =
    (ctx.user.user_metadata?.["full_name"] as string | undefined) ??
    (ctx.user.user_metadata?.["name"] as string | undefined) ??
    "BD Reviewer";
  return { reviewerId: ctx.user.id, reviewerName: name };
}

export const reviewRouter = router({
  /**
   * BD review queue — filterable, cursor-paginated list of ideas awaiting review.
   */
  listQueue: roleProcedure("bd_reviewer")
    .input(ReviewQueueFilterSchema)
    .query(async ({ input }) => {
      return reviewWorkflowService.getQueueItems(input);
    }),

  /**
   * Full detail for review page — idea + analysis + documents + history.
   */
  getDetail: roleProcedure("bd_reviewer")
    .input(IdeaIdInputSchema)
    .query(async ({ input, ctx }) => {
      const db = ctx.db as any;

      // Load idea
      const { data: idea, error: ideaErr } = await db
        .from("ideas")
        .select(
          "id, title, current_stage, submitter_name, created_at, rejection_reason, rejected_at"
        )
        .eq("id", input.ideaId)
        .single();
      if (ideaErr || !idea) throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });

      // Load analysis
      const { data: analysis } = await db
        .from("ai_analyses")
        .select(
          "stage, idea_type, recommended_action, strategic_fit_score, market_potential_score, technical_feasibility_score, resource_requirement_score, business_impact_score, score_overrides"
        )
        .eq("idea_id", input.ideaId)
        .single();

      // Load documents
      const { data: documents } = await db
        .from("output_documents")
        .select(
          "id, document_type, title, watermark_status, content_edited_markdown, generation_status"
        )
        .eq("idea_id", input.ideaId)
        .order("document_type");

      // Load stage history + recent actions
      const [stageHistory, recentActions] = await Promise.all([
        reviewWorkflowRepository.listStageTransitions(input.ideaId),
        reviewWorkflowRepository.listReviewActions(input.ideaId),
      ]);

      return {
        idea: {
          id: (idea as any).id,
          title: (idea as any).title,
          currentStage: (idea as any).current_stage ?? "Sandbox",
          submitterName: (idea as any).submitter_name ?? "",
          submittedAt: (idea as any).created_at,
          rejectionReason: (idea as any).rejection_reason ?? undefined,
        },
        analysis: analysis
          ? {
              stage: (analysis as any).stage,
              ideaType: (analysis as any).idea_type,
              recommendedAction: (analysis as any).recommended_action,
              feasibility: {
                strategicFit: (analysis as any).strategic_fit_score,
                marketPotential: (analysis as any).market_potential_score,
                technicalFeasibility: (analysis as any).technical_feasibility_score,
                resourceRequirement: (analysis as any).resource_requirement_score,
                businessImpact: (analysis as any).business_impact_score,
              },
              scoreOverrides: (analysis as any).score_overrides ?? [],
            }
          : null,
        documents: ((documents ?? []) as any[]).map((d: any) => ({
          id: d.id,
          documentType: d.document_type,
          title: d.title,
          watermarkStatus: d.watermark_status,
          hasEdits: d.content_edited_markdown !== null,
        })),
        stageHistory: stageHistory.map((t) => ({
          fromStage: t.fromStage,
          toStage: t.toStage,
          reviewerName: t.reviewerName,
          reason: t.reason,
          createdAt: t.createdAt,
        })),
        recentActions: recentActions.slice(0, 10).map((a) => ({
          actionType: a.actionType,
          reviewerName: a.reviewerName,
          createdAt: a.createdAt,
          payload: a.payload,
        })),
      };
    }),

  /**
   * BD saves edited document content → watermark transitions to bd_reviewed.
   */
  saveEdit: roleProcedure("bd_reviewer")
    .input(SaveEditInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { reviewerId, reviewerName } = getReviewerInfo(ctx);
      return reviewWorkflowService.saveEdit({
        ideaId: input.ideaId,
        documentId: input.documentId,
        contentEditedMarkdown: input.contentEditedMarkdown,
        reviewerId,
        reviewerName,
      });
    }),

  /**
   * BD changes idea stage → inserts stage_transition, updates ideas.current_stage.
   */
  changeStage: roleProcedure("bd_reviewer")
    .input(ChangeStageInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { reviewerId, reviewerName } = getReviewerInfo(ctx);
      return reviewWorkflowService.changeStage({
        ideaId: input.ideaId,
        toStage: input.toStage,
        reviewerId,
        reviewerName,
        reason: input.reason,
      });
    }),

  /**
   * Admin/BD Lead approves all documents (watermark → approved).
   */
  approveDocuments: roleProcedure("admin")
    .input(ApproveDocumentsInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { reviewerId, reviewerName } = getReviewerInfo(ctx);
      return reviewWorkflowService.approveDocuments({
        ideaId: input.ideaId,
        reviewerId,
        reviewerName,
      });
    }),

  /**
   * BD Reviewer marks idea as No Go (Closed) with required reason.
   */
  rejectIdea: roleProcedure("bd_reviewer")
    .input(RejectIdeaInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { reviewerId, reviewerName } = getReviewerInfo(ctx);
      return reviewWorkflowService.rejectIdea({
        ideaId: input.ideaId,
        reason: input.reason,
        reviewerId,
        reviewerName,
      });
    }),

  /**
   * Stage transition history for an idea (BD/Admin/owner).
   */
  listTransitions: protectedProcedure.input(IdeaIdInputSchema).query(async ({ input }) => {
    const transitions = await reviewWorkflowService.listTransitions(input.ideaId);
    return { transitions };
  }),
});
