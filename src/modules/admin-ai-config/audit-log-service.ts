/**
 * AdminAuditLogService — append-only audit trail for admin operations.
 *
 * Responsibilities:
 *   - Validate that AuditLogEntry.metadata contains no forbidden field names
 *     (FORBIDDEN_METADATA_FIELDS). Validation throws synchronously — it is
 *     not fire-and-forget; only the DB insert is fire-and-forget.
 *   - INSERT the validated entry into `admin_audit_log` via the service-role
 *     Supabase client (bypasses RLS, which is admin-only read).
 *   - If the DB insert fails, log the error with Pino and swallow it — never
 *     block or throw from the calling operation.
 *
 * Design Decisions:
 *   1. Metadata validation is synchronous and throws a descriptive Error so
 *      callers (ApiKeyService, UserManagementService, etc.) fail loudly during
 *      development if they accidentally pass a forbidden field.
 *   2. DB errors are fire-and-forget: audit failure must not degrade the
 *      primary business operation (e.g., a successful API key save).
 *   3. Uses createAdminSupabaseClient() (service role) because the
 *      `admin_audit_log` table has RLS restricting direct inserts to
 *      service-role-only access.
 *   4. Exported as a singleton `adminAuditLogService` — do not instantiate
 *      directly; import the singleton.
 *
 * Ref:
 *   - design/components.md  — AdminAuditLogService (Component 5)
 *   - design/data-model.md  — admin_audit_log table + Business Rules
 *
 * Task 3.1
 */

import logger from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import {
  FORBIDDEN_METADATA_FIELDS,
  type AuditLogEntry,
  type ForbiddenMetadataField,
} from "./schemas";

// ─── Service ──────────────────────────────────────────────────────────────────

export class AdminAuditLogService {
  /**
   * log() — validate metadata then fire-and-forget INSERT into admin_audit_log.
   *
   * @param entry - The audit log entry to persist.
   *
   * @throws {Error} If `entry.metadata` contains a forbidden field name.
   *   Thrown synchronously before any async work — callers must fix the payload.
   *
   * @returns {Promise<void>} Resolves immediately after dispatching the insert.
   *   DB failures are caught internally and logged via Pino; they do not propagate.
   */
  log(entry: AuditLogEntry): Promise<void> {
    // ── Step 1: Validate metadata synchronously ──────────────────────────────
    // This must throw — not fire-and-forget — so callers notice bad payloads.
    this._validateMetadata(entry.metadata);

    // ── Step 2: Fire-and-forget DB insert ────────────────────────────────────
    // We intentionally do NOT await this or return its promise to the caller.
    // Any DB-level error is caught below, logged, and swallowed.
    this._insertAuditLog(entry).catch((err: unknown) => {
      logger.error(
        {
          err,
          action: entry.action,
          adminId: entry.adminId,
          targetType: entry.targetType,
          targetId: entry.targetId,
        },
        "AdminAuditLogService: failed to insert audit log entry (non-fatal)"
      );
    });

    // Return a resolved promise — callers `await log()` without blocking on DB.
    return Promise.resolve();
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * _validateMetadata — throws if any metadata key is in FORBIDDEN_METADATA_FIELDS.
   *
   * Case-sensitive match (keys like 'apiKey', 'api_key', 'password', etc.).
   * The forbidden set is defined in schemas.ts and shared with consumers.
   *
   * @throws {Error} Descriptive message naming the offending field.
   */
  private _validateMetadata(metadata: Record<string, string | number | boolean>): void {
    const forbiddenSet = new Set<string>(FORBIDDEN_METADATA_FIELDS);

    for (const key of Object.keys(metadata)) {
      if (forbiddenSet.has(key)) {
        throw new Error(
          `AdminAuditLogService: metadata contains forbidden field "${key}". ` +
            `Forbidden fields: ${FORBIDDEN_METADATA_FIELDS.join(", ")}. ` +
            `Remove or rename this field before logging.`
        );
      }
    }
  }

  /**
   * _insertAuditLog — performs the actual Supabase INSERT.
   * Called without await from log() — errors caught by the .catch() handler there.
   */
  private async _insertAuditLog(entry: AuditLogEntry): Promise<void> {
    const db = createAdminSupabaseClient();

    const { error } = await db.from("admin_audit_log").insert({
      action: entry.action,
      admin_id: entry.adminId,
      target_type: entry.targetType,
      target_id: entry.targetId,
      metadata: entry.metadata,
    });

    if (error) {
      // Re-throw so the .catch() in log() can handle it uniformly.
      throw error;
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/** Singleton — import this everywhere; do not instantiate directly. */
export const adminAuditLogService = new AdminAuditLogService();

// Re-export types for convenience so callers only need one import.
export type { AuditLogEntry, ForbiddenMetadataField };
