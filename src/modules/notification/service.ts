/**
 * NotificationService — Task 5.1
 *
 * Full implementation replacing the stub interface.
 * 7 public methods (fire-and-forget — try/catch internal, never throws to caller).
 *
 * Ref: design/api-spec.md — Part 2: Internal Service Interface
 *      design/components.md — Component 1: NotificationService
 */

import logger from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { notificationRepository } from "./repository";
import { emailSender } from "./sender";
import {
  NotificationType,
  NotificationStatus,
  type NotifyIdeaReceivedInput,
  type NotifyAnalysisCompleteInput,
  type NotifyDocumentsReadyInput,
  type NotifyStageChangedInput,
  type NotifyIdeaApprovedInput,
  type NotifyIdeaRejectedInput,
  type NotifyBDNewIdeaInput,
} from "./schemas";
import {
  renderIdeaReceived,
  renderAnalysisComplete,
  renderDocumentsReady,
  renderStageChanged,
  renderIdeaApproved,
  renderIdeaRejected,
  renderBDNewIdea,
} from "./templates";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAppUrl(): string {
  return process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class NotificationService {
  /**
   * Resolve locale from user profile. Falls back to 'th' for guests or on error.
   */
  private async resolveLocale(userId: string | null): Promise<"th" | "en"> {
    if (!userId) return "th";
    try {
      const db = createAdminSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (db as any)
        .from("profiles")
        .select("locale")
        .eq("id", userId)
        .maybeSingle();
      return (data?.locale as "th" | "en") ?? "th";
    } catch {
      return "th";
    }
  }

  /**
   * Get all BD reviewers (email, full_name, locale).
   */
  private async getBDReviewers(): Promise<
    Array<{ email: string; fullName: string; locale: "th" | "en" }>
  > {
    try {
      const db = createAdminSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (db as any)
        .from("profiles")
        .select("email, full_name, locale")
        .eq("role", "bd_reviewer");

      if (error || !data) return [];

      return (data as Array<{ email: string; full_name: string; locale: string }>).map((r) => ({
        email: r.email,
        fullName: r.full_name ?? "",
        locale: (r.locale as "th" | "en") ?? "th",
      }));
    } catch {
      return [];
    }
  }

  // ─── Public methods ───────────────────────────────────────────────────────

  /**
   * US-29 AC1 — Notify submitter that idea has been received.
   */
  async notifyIdeaReceived(input: NotifyIdeaReceivedInput): Promise<void> {
    try {
      const locale = await this.resolveLocale(input.submitterUserId);
      const trackingLink = `${getAppUrl()}/track/${input.referenceNumber}`;

      const rendered = renderIdeaReceived(
        { title: input.title, referenceNumber: input.referenceNumber, trackingLink },
        locale
      );

      const notifId = await notificationRepository.create({
        type: NotificationType.IDEA_RECEIVED,
        recipientEmail: input.submitterEmail,
        recipientName: input.submitterName,
        ideaId: input.id,
        locale,
        subject: rendered.subject,
      });

      const result = await emailSender.send(input.submitterEmail, rendered.subject, rendered.html);
      await notificationRepository.updateStatus(
        notifId,
        result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        result.error
      );
    } catch (error) {
      logger.error({ err: error, ideaId: input.id, type: "idea_received" }, "Notification failed");
    }
  }

  /**
   * US-29 AC2 — Notify submitter that AI analysis is complete.
   */
  async notifyAnalysisComplete(input: NotifyAnalysisCompleteInput): Promise<void> {
    try {
      const locale = await this.resolveLocale(input.submitterUserId);
      const draftLink = `${getAppUrl()}/ideas/${input.id}/documents`;

      const rendered = renderAnalysisComplete(
        {
          title: input.title,
          stage: input.stage,
          recommendedAction: input.recommendedAction,
          draftLink,
        },
        locale
      );

      const notifId = await notificationRepository.create({
        type: NotificationType.ANALYSIS_COMPLETE,
        recipientEmail: input.submitterEmail,
        recipientName: input.submitterName,
        ideaId: input.id,
        locale,
        subject: rendered.subject,
      });

      const result = await emailSender.send(input.submitterEmail, rendered.subject, rendered.html);
      await notificationRepository.updateStatus(
        notifId,
        result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        result.error
      );
    } catch (error) {
      logger.error(
        { err: error, ideaId: input.id, type: "analysis_complete" },
        "Notification failed"
      );
    }
  }

  /**
   * US-29 AC2 supplement — Notify submitter that documents are ready.
   */
  async notifyDocumentsReady(input: NotifyDocumentsReadyInput): Promise<void> {
    try {
      const locale = await this.resolveLocale(input.submitterUserId);
      const documentsLink = `${getAppUrl()}/ideas/${input.id}/documents`;

      const rendered = renderDocumentsReady({ title: input.title, documentsLink }, locale);

      const notifId = await notificationRepository.create({
        type: NotificationType.DOCUMENTS_READY,
        recipientEmail: input.submitterEmail,
        recipientName: input.submitterName,
        ideaId: input.id,
        locale,
        subject: rendered.subject,
      });

      const result = await emailSender.send(input.submitterEmail, rendered.subject, rendered.html);
      await notificationRepository.updateStatus(
        notifId,
        result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        result.error
      );
    } catch (error) {
      logger.error(
        { err: error, ideaId: input.id, type: "documents_ready" },
        "Notification failed"
      );
    }
  }

  /**
   * US-29 AC4 — Notify submitter of stage change.
   */
  async notifyStageChanged(input: NotifyStageChangedInput): Promise<void> {
    try {
      const locale = await this.resolveLocale(input.submitterUserId);

      const rendered = renderStageChanged(
        { title: input.title, fromStage: input.fromStage, toStage: input.toStage },
        locale
      );

      const notifId = await notificationRepository.create({
        type: NotificationType.STAGE_CHANGED,
        recipientEmail: input.submitterEmail,
        recipientName: input.submitterName,
        ideaId: input.id,
        locale,
        subject: rendered.subject,
      });

      const result = await emailSender.send(input.submitterEmail, rendered.subject, rendered.html);
      await notificationRepository.updateStatus(
        notifId,
        result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        result.error
      );
    } catch (error) {
      logger.error({ err: error, ideaId: input.id, type: "stage_changed" }, "Notification failed");
    }
  }

  /**
   * US-29 AC3 — Notify submitter that idea is approved.
   */
  async notifyIdeaApproved(input: NotifyIdeaApprovedInput): Promise<void> {
    try {
      const locale = await this.resolveLocale(input.submitterUserId);
      const approvedLink = `${getAppUrl()}/ideas/${input.id}/documents?status=approved`;

      const rendered = renderIdeaApproved({ title: input.title, approvedLink }, locale);

      const notifId = await notificationRepository.create({
        type: NotificationType.IDEA_APPROVED,
        recipientEmail: input.submitterEmail,
        recipientName: input.submitterName,
        ideaId: input.id,
        locale,
        subject: rendered.subject,
      });

      const result = await emailSender.send(input.submitterEmail, rendered.subject, rendered.html);
      await notificationRepository.updateStatus(
        notifId,
        result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        result.error
      );
    } catch (error) {
      logger.error({ err: error, ideaId: input.id, type: "idea_approved" }, "Notification failed");
    }
  }

  /**
   * US-29 AC4 — Notify submitter that idea is rejected.
   */
  async notifyIdeaRejected(input: NotifyIdeaRejectedInput): Promise<void> {
    try {
      const locale = await this.resolveLocale(input.submitterUserId);

      const rendered = renderIdeaRejected({ title: input.title, reason: input.reason }, locale);

      const notifId = await notificationRepository.create({
        type: NotificationType.IDEA_REJECTED,
        recipientEmail: input.submitterEmail,
        recipientName: input.submitterName,
        ideaId: input.id,
        locale,
        subject: rendered.subject,
      });

      const result = await emailSender.send(input.submitterEmail, rendered.subject, rendered.html);
      await notificationRepository.updateStatus(
        notifId,
        result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        result.error
      );
    } catch (error) {
      logger.error({ err: error, ideaId: input.id, type: "idea_rejected" }, "Notification failed");
    }
  }

  /**
   * US-30 — Notify all BD Reviewers about a new idea.
   */
  async notifyBDNewIdea(input: NotifyBDNewIdeaInput): Promise<void> {
    try {
      const reviewers = await this.getBDReviewers();

      if (reviewers.length === 0) {
        logger.warn({ ideaId: input.id }, "No BD reviewers found — skipping notifyBDNewIdea");
        return;
      }

      for (const reviewer of reviewers) {
        try {
          const rendered = renderBDNewIdea(
            {
              ideaTitle: input.title,
              submitterName: input.submitterName ?? "",
              submitterType: input.submitterType,
              referenceNumber: input.referenceNumber,
            },
            reviewer.locale
          );

          const notifId = await notificationRepository.create({
            type: NotificationType.BD_NEW_IDEA,
            recipientEmail: reviewer.email,
            recipientName: reviewer.fullName,
            ideaId: input.id,
            locale: reviewer.locale,
            subject: rendered.subject,
          });

          const result = await emailSender.send(reviewer.email, rendered.subject, rendered.html);
          await notificationRepository.updateStatus(
            notifId,
            result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
            result.error
          );
        } catch (innerErr) {
          logger.error(
            { err: innerErr, ideaId: input.id, reviewer: reviewer.email, type: "bd_new_idea" },
            "Notification to BD reviewer failed"
          );
        }
      }
    } catch (error) {
      logger.error({ err: error, ideaId: input.id, type: "bd_new_idea" }, "Notification failed");
    }
  }
}

/** Singleton */
export const notificationService = new NotificationService();
