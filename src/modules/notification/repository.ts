/**
 * NotificationRepository — Task 2.1
 *
 * Data access layer for the `notifications` table.
 * Uses Supabase JS client (admin) to INSERT/UPDATE notification logs.
 * Server-side only — bypasses RLS via service_role key.
 *
 * Column mapping (DB snake_case → DTO camelCase):
 *   recipient_email  → recipientEmail
 *   recipient_name   → recipientName
 *   idea_id          → ideaId
 *   idea_title       → ideaTitle (joined from ideas.title)
 *   error_message    → errorMessage
 *   sent_at          → sentAt
 *   created_at       → createdAt
 */

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { NotificationStatus, type CreateNotificationInput, type NotificationDTO } from "./schemas";

// ─── Local DB row shape ───────────────────────────────────────────────────────

interface NotificationRow {
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapRowToDTO(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    type: row.type as NotificationDTO["type"],
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    ideaId: row.idea_id,
    locale: row.locale,
    subject: row.subject,
    status: row.status as NotificationDTO["status"],
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

// ─── NotificationRepository ───────────────────────────────────────────────────

export class NotificationRepository {
  private get db() {
    return createAdminSupabaseClient();
  }

  /**
   * INSERT a new notification log entry.
   * Returns the generated UUID.
   */
  async create(input: CreateNotificationInput): Promise<string> {
    const db = this.db;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from("notifications")
      .insert({
        type: input.type,
        recipient_email: input.recipientEmail,
        recipient_name: input.recipientName ?? null,
        idea_id: input.ideaId,
        locale: input.locale ?? "th",
        subject: input.subject,
        status: input.status ?? NotificationStatus.PENDING,
      })
      .select("id")
      .single();

    if (error) {
      throw AppError.internal("Failed to create notification log", {
        ideaId: input.ideaId,
        type: input.type,
        supabaseError: error.message,
      });
    }

    return data.id as string;
  }

  /**
   * UPDATE notification status.
   * If status is 'sent', also sets sent_at to now().
   */
  async updateStatus(id: string, status: NotificationStatus, errorMessage?: string): Promise<void> {
    const db = this.db;

    const updatePayload: Record<string, unknown> = {
      status,
      error_message: errorMessage ?? null,
    };

    if (status === NotificationStatus.SENT) {
      updatePayload["sent_at"] = new Date().toISOString();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from("notifications").update(updatePayload).eq("id", id);

    if (error) {
      throw AppError.internal("Failed to update notification status", {
        notificationId: id,
        status,
        supabaseError: error.message,
      });
    }
  }

  /**
   * SELECT notifications by idea_id with cursor-based pagination.
   * Ordered by created_at DESC.
   */
  async findByIdeaId(
    ideaId: string,
    cursor?: string,
    limit: number = 20
  ): Promise<{ items: NotificationDTO[]; nextCursor: string | null }> {
    const db = this.db;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (db as any)
      .from("notifications")
      .select("*")
      .eq("idea_id", ideaId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;

    if (error) {
      throw AppError.internal("Failed to fetch notifications by idea_id", {
        ideaId,
        supabaseError: error.message,
      });
    }

    const rows = (data as NotificationRow[]) ?? [];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapRowToDTO);
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.createdAt : null;

    return { items, nextCursor };
  }

  /**
   * SELECT a single notification by id.
   * Returns null if not found.
   */
  async findById(id: string): Promise<NotificationDTO | null> {
    const db = this.db;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from("notifications")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw AppError.internal("Failed to fetch notification by id", {
        notificationId: id,
        supabaseError: error.message,
      });
    }

    if (!data) return null;

    return mapRowToDTO(data as NotificationRow);
  }

  /**
   * SELECT failed notifications with cursor-based pagination.
   * Used by admin for resend functionality.
   * Ordered by created_at DESC.
   */
  async findFailed(
    cursor?: string,
    limit: number = 20
  ): Promise<{ items: NotificationDTO[]; nextCursor: string | null }> {
    const db = this.db;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (db as any)
      .from("notifications")
      .select("*")
      .eq("status", NotificationStatus.FAILED)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;

    if (error) {
      throw AppError.internal("Failed to fetch failed notifications", {
        supabaseError: error.message,
      });
    }

    const rows = (data as NotificationRow[]) ?? [];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapRowToDTO);
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.createdAt : null;

    return { items, nextCursor };
  }
}

export const notificationRepository = new NotificationRepository();
