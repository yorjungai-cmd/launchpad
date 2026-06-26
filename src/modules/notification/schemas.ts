/**
 * Zod schemas + TypeScript types for the notification module.
 * Ref: design/data-model.md, design/api-spec.md
 *
 * Task 1.2
 */

import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum NotificationType {
  IDEA_RECEIVED = "idea_received",
  ANALYSIS_COMPLETE = "analysis_complete",
  DOCUMENTS_READY = "documents_ready",
  STAGE_CHANGED = "stage_changed",
  IDEA_APPROVED = "idea_approved",
  IDEA_REJECTED = "idea_rejected",
  BD_NEW_IDEA = "bd_new_idea",
}

export enum NotificationStatus {
  PENDING = "pending",
  SENT = "sent",
  FAILED = "failed",
}

// ─── Notification DTO ─────────────────────────────────────────────────────────

export const NotificationDTOSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(NotificationType),
  recipientEmail: z.string().email(),
  recipientName: z.string().nullable(),
  ideaId: z.string().uuid(),
  ideaTitle: z.string().optional(),
  locale: z.string(),
  subject: z.string(),
  status: z.nativeEnum(NotificationStatus),
  errorMessage: z.string().nullable(),
  sentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type NotificationDTO = z.infer<typeof NotificationDTOSchema>;

// ─── Create input (internal — service creates notification log) ───────────────

export const CreateNotificationSchema = z.object({
  type: z.nativeEnum(NotificationType),
  recipientEmail: z.string().email(),
  recipientName: z.string().nullable().optional(),
  ideaId: z.string().uuid(),
  locale: z.string().default("th"),
  subject: z.string(),
  status: z.nativeEnum(NotificationStatus).default(NotificationStatus.PENDING),
});

export type CreateNotificationInput = z.input<typeof CreateNotificationSchema>;

// ─── tRPC Input schemas ───────────────────────────────────────────────────────

export const NotificationHistoryInputSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).default(20),
  ideaId: z.string().uuid().optional(),
  status: z.nativeEnum(NotificationStatus).optional(),
  type: z.nativeEnum(NotificationType).optional(),
  recipientEmail: z.string().email().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export type NotificationHistoryInput = z.infer<typeof NotificationHistoryInputSchema>;

export const NotificationResendInputSchema = z.object({
  notificationId: z.string().uuid(),
});

export type NotificationResendInput = z.infer<typeof NotificationResendInputSchema>;

// ─── Template render output ───────────────────────────────────────────────────

export interface TemplateRenderResult {
  subject: string;
  html: string;
}

// ─── Notify method input types ────────────────────────────────────────────────

export interface NotifyIdeaReceivedInput {
  id: string;
  title: string;
  referenceNumber: string;
  submitterEmail: string;
  submitterName: string | null;
  submitterUserId: string | null;
}

export interface NotifyAnalysisCompleteInput {
  id: string;
  title: string;
  submitterEmail: string;
  submitterName: string | null;
  submitterUserId: string | null;
  stage: string;
  recommendedAction: string;
}

export interface NotifyDocumentsReadyInput {
  id: string;
  title: string;
  submitterEmail: string;
  submitterName: string | null;
  submitterUserId: string | null;
}

export interface NotifyStageChangedInput {
  id: string;
  title: string;
  submitterEmail: string;
  submitterName: string | null;
  submitterUserId: string | null;
  fromStage: string;
  toStage: string;
}

export interface NotifyIdeaApprovedInput {
  id: string;
  title: string;
  submitterEmail: string;
  submitterName: string | null;
  submitterUserId: string | null;
}

export interface NotifyIdeaRejectedInput {
  id: string;
  title: string;
  submitterEmail: string;
  submitterName: string | null;
  submitterUserId: string | null;
  reason: string;
}

export interface NotifyBDNewIdeaInput {
  id: string;
  title: string;
  referenceNumber: string;
  submitterName: string | null;
  submitterType: string;
}
