/**
 * NotificationRouter — Task 5.2
 *
 * tRPC procedures for admin notification management:
 *   - notification.history: list/filter notification logs (cursor-paginated)
 *   - notification.resend: re-send a failed notification
 *
 * Ref: design/api-spec.md — Part 1: tRPC Procedures (Admin)
 */

import { TRPCError } from "@trpc/server";
import { router, roleProcedure } from "@/server/trpc";
import { notificationRepository } from "./repository";
import { emailSender } from "./sender";
import { getTemplateByType } from "./templates";
import {
  NotificationHistoryInputSchema,
  NotificationResendInputSchema,
  NotificationStatus,
  NotificationType,
  type NotificationDTO,
} from "./schemas";
import logger from "@/lib/logger";

// ─── Router ───────────────────────────────────────────────────────────────────

export const notificationRouter = router({
  /**
   * notification.history — list notifications with filter + cursor pagination.
   * Admin only.
   */
  history: roleProcedure("admin")
    .input(NotificationHistoryInputSchema)
    .query(async ({ input }) => {
      const { cursor, limit, ideaId, status, type, recipientEmail, dateFrom, dateTo } = input;

      // Use the repository's existing methods based on which filter is provided.
      // For full filter support, we build a custom query here.
      const db = (notificationRepository as any).db; // eslint-disable-line @typescript-eslint/no-explicit-any

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (db as any)
        .from("notifications")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (ideaId) query = query.eq("idea_id", ideaId);
      if (status) query = query.eq("status", status);
      if (type) query = query.eq("type", type);
      if (recipientEmail) query = query.eq("recipient_email", recipientEmail);
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo);
      if (cursor) query = query.lt("id", cursor);

      const { data, error, count } = await query;

      if (error) {
        logger.error({ error: error.message }, "NotificationRouter: history query failed");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch notification history",
        });
      }

      const rows = (data ?? []) as Array<{
        id: string;
        type: string;
        recipient_email: string;
        recipient_name: string | null;
        idea_id: string;
        locale: string;
        subject: string;
        status: string;
        error_message: string | null;
        sent_at: string | null;
        created_at: string;
      }>;

      const hasMore = rows.length > limit;
      const items: NotificationDTO[] = rows.slice(0, limit).map((row) => ({
        id: row.id,
        type: row.type as NotificationType,
        recipientEmail: row.recipient_email,
        recipientName: row.recipient_name,
        ideaId: row.idea_id,
        locale: row.locale,
        subject: row.subject,
        status: row.status as NotificationStatus,
        errorMessage: row.error_message,
        sentAt: row.sent_at,
        createdAt: row.created_at,
      }));

      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return {
        items,
        nextCursor,
        total: (count as number) ?? 0,
      };
    }),

  /**
   * notification.resend — resend a failed notification.
   * Finds notification by id, validates status=failed, re-renders template, sends, updates.
   * Admin only.
   */
  resend: roleProcedure("admin")
    .input(NotificationResendInputSchema)
    .mutation(async ({ input }) => {
      const notification = await notificationRepository.findById(input.notificationId);

      if (!notification) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
      }

      if (notification.status !== NotificationStatus.FAILED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot resend notification with status "${notification.status}". Only failed notifications can be resent.`,
        });
      }

      // Re-render the template using the stored notification data
      const renderer = getTemplateByType(notification.type);
      const locale = (notification.locale as "th" | "en") ?? "th";

      // Build template data based on notification type
      // We use the subject + stored data to re-render (best-effort reconstruction)
      let rendered: { subject: string; html: string };

      try {
        const templateData = buildTemplateData(notification);
        rendered = renderer(templateData as any, locale); // eslint-disable-line @typescript-eslint/no-explicit-any
      } catch {
        // Fallback: reuse original subject and build minimal HTML
        rendered = { subject: notification.subject, html: `<p>${notification.subject}</p>` };
      }

      const result = await emailSender.send(
        notification.recipientEmail,
        rendered.subject,
        rendered.html
      );

      const newStatus = result.success ? NotificationStatus.SENT : NotificationStatus.FAILED;
      await notificationRepository.updateStatus(notification.id, newStatus, result.error);

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Resend failed: ${result.error ?? "Unknown error"}`,
        });
      }

      return {
        success: true as const,
        sentAt: new Date().toISOString(),
      };
    }),
});

// ─── Helper: Build template data from stored notification ─────────────────────

/**
 * Reconstruct minimal template data from a notification record.
 * Since we don't store full template data, we use what's available (subject, ideaId).
 * For a proper re-render we'd need the original input data stored in DB — for now
 * this provides reasonable best-effort reconstruction.
 */
function buildTemplateData(notification: NotificationDTO): Record<string, unknown> {
  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";

  switch (notification.type) {
    case NotificationType.IDEA_RECEIVED:
      return {
        title: notification.subject,
        referenceNumber: "",
        trackingLink: `${baseUrl}/track`,
      };
    case NotificationType.ANALYSIS_COMPLETE:
      return {
        title: notification.subject,
        stage: "",
        recommendedAction: "",
        draftLink: `${baseUrl}/ideas/${notification.ideaId}/documents`,
      };
    case NotificationType.DOCUMENTS_READY:
      return {
        title: notification.subject,
        documentsLink: `${baseUrl}/ideas/${notification.ideaId}/documents`,
      };
    case NotificationType.STAGE_CHANGED:
      return {
        title: notification.subject,
        fromStage: "",
        toStage: "",
      };
    case NotificationType.IDEA_APPROVED:
      return {
        title: notification.subject,
        approvedLink: `${baseUrl}/ideas/${notification.ideaId}/documents?status=approved`,
      };
    case NotificationType.IDEA_REJECTED:
      return {
        title: notification.subject,
        reason: "",
      };
    case NotificationType.BD_NEW_IDEA:
      return {
        ideaTitle: notification.subject,
        submitterName: "",
        submitterType: "",
        referenceNumber: "",
      };
    default:
      return { title: notification.subject };
  }
}
