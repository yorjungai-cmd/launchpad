/**
 * PromptConfigService — อ่าน/เขียน Prompt configuration ใน system_settings.prompt_config JSONB
 *
 * Responsibilities:
 *   - getPromptConfig()                      — SELECT prompt_config JSONB จาก system_settings
 *                                              ถ้าไม่มี row หรือ config ว่าง → upsert defaults แล้ว return
 *   - updateSystemPrompt(prompt, adminId)    — merge systemPrompt field, audit log
 *   - updateDocumentTypeSections(…)         — merge sections for one doc type, audit log
 *   - resetDocumentType(docType, adminId)   — restore defaults for one doc type, audit log
 *
 * Design decisions:
 *   1. `system_settings` เป็น single-row table — ใช้ SELECT LIMIT 1 ทุกครั้ง
 *   2. Default config มาจาก DEFAULT_PROMPT_CONFIG (prompt-config-defaults.ts)
 *   3. Supabase error → AppError.internal() + Pino logger
 *   4. Audit log via adminAuditLogService (fire-and-forget inside the service)
 *      - update operations → action: 'prompt_config_updated'
 *      - reset operations  → action: 'prompt_config_reset'  (only, NOT double-logged)
 *   5. ใช้ createAdminSupabaseClient() (service role) — bypass RLS
 *
 * Ref:
 *   - Task 3 brief (task-3-brief.md)
 *   - Parallel pattern: ai-config-service.ts
 *
 * Task 6 (prompt config)
 */

import { AppError } from "@/lib/errors/AppError";
import logger from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { adminAuditLogService } from "./audit-log-service";
import { DEFAULT_PROMPT_CONFIG } from "@/lib/document-generation/prompt-config-defaults";
import type { PromptConfigData } from "./schemas";

// ─── DB row shape ─────────────────────────────────────────────────────────────

interface SystemSettingsRow {
  id: string;
  prompt_config: PromptConfigData | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PromptConfigService {
  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * getPromptConfig — อ่าน prompt config จาก system_settings row เดียว
   *
   * ถ้าไม่มี row หรือ prompt_config ว่าง → upsert DEFAULT_PROMPT_CONFIG แล้ว return
   *
   * @throws {AppError} AppError.internal() ถ้า Supabase SELECT error
   */
  async getPromptConfig(): Promise<PromptConfigData> {
    const db = createAdminSupabaseClient();

    const { data, error } = await db
      .from("system_settings")
      .select("id, prompt_config")
      .limit(1)
      .maybeSingle<SystemSettingsRow>();

    if (error) {
      logger.error({ err: error }, "PromptConfigService.getPromptConfig: DB SELECT error");
      throw AppError.internal("Failed to read prompt configuration");
    }

    // Row exists with a valid prompt config — return it directly
    if (data?.prompt_config?.systemPrompt) {
      return data.prompt_config;
    }

    // No row or empty config — upsert defaults and return them
    return this._upsertDefaults(db, data?.id);
  }

  /**
   * updateSystemPrompt — replace systemPrompt, preserve sections
   *
   * @param systemPrompt - New system prompt string (validated by caller)
   * @param adminId      - UUID of the admin performing the update (for audit log)
   * @returns Updated PromptConfigData
   *
   * @throws {AppError} AppError.internal() ถ้า Supabase error
   */
  async updateSystemPrompt(systemPrompt: string, adminId: string): Promise<PromptConfigData> {
    const current = await this.getPromptConfig();
    const updated: PromptConfigData = { ...current, systemPrompt };
    return this._saveConfig(updated, adminId, "system_prompt", "prompt_config_updated");
  }

  /**
   * updateDocumentTypeSections — replace all sections for one document type
   *
   * Other document types' sections are preserved (shallow merge at the doc-type level).
   *
   * @param documentType - The doc type key (e.g. "feasibility_report")
   * @param sections     - New sections map for this doc type
   * @param adminId      - UUID of the admin (for audit log)
   * @returns Updated PromptConfigData
   *
   * @throws {AppError} AppError.internal() ถ้า Supabase error
   */
  async updateDocumentTypeSections(
    documentType: string,
    sections: Record<string, string>,
    adminId: string
  ): Promise<PromptConfigData> {
    const current = await this.getPromptConfig();
    const updated: PromptConfigData = {
      ...current,
      sections: { ...current.sections, [documentType]: sections },
    };
    return this._saveConfig(updated, adminId, documentType, "prompt_config_updated");
  }

  /**
   * resetDocumentType — restore a single doc type's sections to the compiled defaults
   *
   * Emits a 'prompt_config_reset' audit entry (only — no double-logging of 'updated').
   *
   * @param documentType - The doc type key to reset
   * @param adminId      - UUID of the admin (for audit log)
   * @returns Updated PromptConfigData with defaults for the target doc type
   *
   * @throws {AppError} AppError.internal() ถ้า Supabase error
   */
  async resetDocumentType(documentType: string, adminId: string): Promise<PromptConfigData> {
    const current = await this.getPromptConfig();
    const defaultSections = DEFAULT_PROMPT_CONFIG.sections[documentType] ?? {};
    const updated: PromptConfigData = {
      ...current,
      sections: { ...current.sections, [documentType]: { ...defaultSections } },
    };
    return this._saveConfig(updated, adminId, documentType, "prompt_config_reset");
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * _saveConfig — persist `config` to system_settings (insert if no row, update otherwise)
   *              then emit one audit log entry with the given action.
   *
   * @param config       - Full PromptConfigData to persist
   * @param adminId      - UUID of the admin (for audit log)
   * @param changedField - Identifies what changed (goes in metadata)
   * @param auditAction  - 'prompt_config_updated' | 'prompt_config_reset'
   * @returns The saved config (same object as input — no DB round-trip needed)
   *
   * @throws {AppError} AppError.internal() ถ้า Supabase error
   */
  private async _saveConfig(
    config: PromptConfigData,
    adminId: string,
    changedField: string,
    auditAction: "prompt_config_updated" | "prompt_config_reset"
  ): Promise<PromptConfigData> {
    const db = createAdminSupabaseClient();

    // Fetch existing row to get its id (or discover there is none)
    const { data: existing, error: fetchErr } = await db
      .from("system_settings")
      .select("id")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (fetchErr) {
      logger.error({ err: fetchErr }, "PromptConfigService._saveConfig: DB SELECT error");
      throw AppError.internal("Failed to read prompt configuration for update");
    }

    let rowId: string;

    if (!existing?.id) {
      // No row yet — INSERT
      const { data: inserted, error: insertErr } = await db
        .from("system_settings")
        .insert({ prompt_config: config })
        .select("id")
        .single<{ id: string }>();

      if (insertErr || !inserted) {
        logger.error({ err: insertErr }, "PromptConfigService._saveConfig: DB INSERT error");
        throw AppError.internal("Failed to create prompt configuration record");
      }

      rowId = inserted.id;
    } else {
      // Row exists — UPDATE
      rowId = existing.id;

      const { error: updateErr } = await db
        .from("system_settings")
        .update({ prompt_config: config, updated_at: new Date().toISOString() })
        .eq("id", rowId);

      if (updateErr) {
        logger.error({ err: updateErr, rowId }, "PromptConfigService._saveConfig: DB UPDATE error");
        throw AppError.internal("Failed to update prompt configuration");
      }
    }

    // Single audit log entry for this operation (no double-logging)
    const metadataKey = auditAction === "prompt_config_reset" ? "document_type" : "changed_field";

    await adminAuditLogService.log({
      action: auditAction,
      adminId,
      targetType: "prompt_config",
      targetId: rowId,
      metadata: { [metadataKey]: changedField },
    });

    return config;
  }

  /**
   * _upsertDefaults — write DEFAULT_PROMPT_CONFIG to system_settings.
   *
   * Called by getPromptConfig when the row is absent or has no systemPrompt.
   * Does NOT emit an audit log entry (it's a background initialisation, not an admin action).
   *
   * @param db         - Admin Supabase client (already created by caller)
   * @param existingId - If a row exists but has a null prompt_config, UPDATE it; else INSERT
   * @returns DEFAULT_PROMPT_CONFIG (shallow copy)
   *
   * @throws {AppError} AppError.internal() ถ้า Supabase error (silent for now — not fatal)
   */
  private async _upsertDefaults(
    db: ReturnType<typeof createAdminSupabaseClient>,
    existingId?: string
  ): Promise<PromptConfigData> {
    if (existingId) {
      const { error } = await db
        .from("system_settings")
        .update({ prompt_config: DEFAULT_PROMPT_CONFIG, updated_at: new Date().toISOString() })
        .eq("id", existingId);

      if (error) {
        logger.error({ err: error }, "PromptConfigService._upsertDefaults: UPDATE error");
      }
    } else {
      const { error } = await db
        .from("system_settings")
        .insert({ prompt_config: DEFAULT_PROMPT_CONFIG });

      if (error) {
        logger.error({ err: error }, "PromptConfigService._upsertDefaults: INSERT error");
      }
    }

    logger.info("PromptConfigService: initialised default prompt config (first boot)");
    return { ...DEFAULT_PROMPT_CONFIG };
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/** Singleton — import this everywhere; do not instantiate directly. */
export const promptConfigService = new PromptConfigService();
