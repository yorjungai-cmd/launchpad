/**
 * Zod schemas for review-workflow tRPC procedures.
 * Ref: design/api-spec.md
 * Task 3.2
 */
import { z } from "zod";

export const ReviewQueueFilterSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).default(20),
  stage: z.string().optional(),
  watermarkStatus: z.string().optional(),
  submitterType: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const SaveEditInputSchema = z.object({
  ideaId: z.string().uuid(),
  documentId: z.string().uuid(),
  contentEditedMarkdown: z.string().min(1),
});

export const ChangeStageInputSchema = z.object({
  ideaId: z.string().uuid(),
  toStage: z.string().min(1),
  reason: z.string().optional(),
});

export const ApproveDocumentsInputSchema = z.object({
  ideaId: z.string().uuid(),
});

export const RejectIdeaInputSchema = z.object({
  ideaId: z.string().uuid(),
  reason: z.string().min(10, "Rejection reason must be at least 10 characters"),
});

export const IdeaIdInputSchema = z.object({
  ideaId: z.string().uuid(),
});
