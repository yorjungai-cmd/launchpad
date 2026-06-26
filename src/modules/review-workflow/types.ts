/**
 * Domain types for review-workflow module.
 * Ref: design/data-model.md
 * Task 2.1
 */

export type ReviewActionType = "edit" | "stage_change" | "approve" | "reject";

export interface ReviewAction {
  id: string;
  ideaId: string;
  reviewerId: string;
  reviewerName: string;
  actionType: ReviewActionType;
  documentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface StageTransition {
  id: string;
  ideaId: string;
  fromStage: string | null;
  toStage: string;
  reviewerId: string | null;
  reviewerName: string | null;
  reason: string | null;
  createdAt: string;
}

export interface QueueItem {
  ideaId: string;
  title: string;
  currentStage: string;
  submitterName: string;
  submitterType: string;
  submittedAt: string;
  updatedAt: string;
  watermarkStatus: string;
  recommendedAction: string | null;
  lastActionAt: string | null;
  lastActionType: string | null;
}

export interface ReviewQueueFilter {
  cursor?: string;
  limit?: number;
  stage?: string;
  watermarkStatus?: string;
  submitterType?: string;
  dateFrom?: string;
  dateTo?: string;
}
