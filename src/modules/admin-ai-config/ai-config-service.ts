/**
 * AiConfigService — อ่าน/เขียน AI model configuration ใน system_settings.ai_config JSONB
 *
 * Responsibilities:
 *   - getAiConfig()          — SELECT ai_config JSONB จาก system_settings (single row)
 *                              ถ้าไม่มี row → INSERT default config แล้ว return
 *   - updateAiConfig(config) — UPSERT ai_config, audit log
 *
 * Design decisions:
 *   1. `system_settings` เป็น single-row table — ใช้ SELECT LIMIT 1 ทุกครั้ง
 *   2. Default config ใช้ 'claude-sonnet-4-5' เป็น analysisModel / defaultModel
 *      ตาม design/data-model.md — Default value section
 *   3. `supportedModels` เพิ่มจาก SUPPORTED_MODELS ที่ service layer —
 *      ไม่ได้ persist ใน JSONB (informational only)
 *   4. updateAiConfig รับ adminId เพื่อ audit log
 *      action: 'ai_config_updated', metadata: { changed_fields: [...keys] }
 *   5. Supabase error → AppError.internal() + Pino log
 *   6. ใช้ createAdminSupabaseClient() (service role) — bypass RLS
 *
 * Ref:
 *   - design/components.md  — AiConfigService (Component 3)
 *   - design/data-model.md  — system_settings table + AiConfigData
 *
 * Task 5.1
 */

import { AppError } from "@/lib/errors/AppError";
import logger from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { adminAuditLogService } from "./audit-log-service";
import { SUPPORTED_MODELS, type AiConfigData, type UpdateAiConfigInput } from "./schemas";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Default AI configuration persisted when system_settings has no row yet.
 * Source: design/data-model.md — Default value section.
 */
const DEFAULT_AI_CONFIG: Omit<AiConfigData, "supportedModels"> = {
  analysisModel: "claude-sonnet-4-5",
  documentGenerationModel: "claude-opus-4-5",
  defaultModel: "claude-sonnet-4-5",
  fallbackModel: "claude-haiku-4-5",
};

// ─── DB row shapes ────────────────────────────────────────────────────────────

/** Raw column shape returned by SELECT on system_settings. */
interface SystemSettingsRow {
  id: string;
  ai_config: AiConfigJsonb;
  created_at: string;
  updated_at: string;
}

/**
 * Shape of the ai_config JSONB column as persisted.
 * Does NOT include supportedModels (added at service layer).
 */
interface AiConfigJsonb extends Record<string, unknown> {
  analysisModel: string;
  documentGenerationModel: string;
  defaultModel: string;
  fallbackModel: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AiConfigService {
  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * getAiConfig — อ่าน AI config จาก system_settings row เดียว
   *
   * ถ้าไม่มี row → INSERT default config แล้ว return default
   * เพิ่ม supportedModels: [...SUPPORTED_MODELS] ก่อน return เสมอ
   *
   * @throws {AppError} AppError.internal() ถ้า Supabase error
   */
  async getAiConfig(): Promise<AiConfigData> {
    const db = createAdminSupabaseClient();

    const { data, error } = await db
      .from("system_settings")
      .select("id, ai_config, created_at, updated_at")
      .limit(1)
      .maybeSingle<SystemSettingsRow>();

    if (error) {
      logger.error({ err: error }, "AiConfigService.getAiConfig: DB SELECT error");
      throw AppError.internal("Failed to read AI configuration");
    }

    // Row exists — map JSONB → AiConfigData + append supportedModels
    if (data !== null) {
      return this._toAiConfigData(data.ai_config);
    }

    // No row → INSERT default and return it
    return this._insertDefaultConfig(db);
  }

  /**
   * updateAiConfig — UPSERT ai_config JSONB ใน system_settings + audit log
   *
   * ขั้นตอน:
   *   1. SELECT existing row (เพื่อหา id สำหรับ UPSERT และ audit targetId)
   *   2. ถ้าไม่มี row → INSERT ใหม่ (เหมือน getAiConfig fallback)
   *   3. UPDATE ai_config + updated_at
   *   4. audit log: action='ai_config_updated', changed_fields=[...keys of config]
   *
   * @param config  - Validated UpdateAiConfigInput (Zod-parsed ก่อนส่งมา)
   * @param adminId - UUID ของ admin ที่ทำการแก้ไข (สำหรับ audit log)
   * @returns Updated AiConfigData including supportedModels
   *
   * @throws {AppError} AppError.internal() ถ้า Supabase error
   */
  async updateAiConfig(config: UpdateAiConfigInput, adminId: string): Promise<AiConfigData> {
    const db = createAdminSupabaseClient();

    // ── 1. Fetch existing row (need id for audit log targetId) ─────────────
    const { data: existing, error: fetchErr } = await db
      .from("system_settings")
      .select("id, ai_config, created_at, updated_at")
      .limit(1)
      .maybeSingle<SystemSettingsRow>();

    if (fetchErr) {
      logger.error({ err: fetchErr }, "AiConfigService.updateAiConfig: DB SELECT error");
      throw AppError.internal("Failed to read AI configuration for update");
    }

    let rowId: string;

    if (existing === null) {
      // No row yet — INSERT with incoming config (not default)
      const inserted = await this._insertConfig(db, config);
      rowId = inserted.id;
    } else {
      rowId = existing.id;
    }

    // ── 2. UPDATE ai_config JSONB ──────────────────────────────────────────
    const newJsonb: AiConfigJsonb = {
      analysisModel: config.analysisModel,
      documentGenerationModel: config.documentGenerationModel,
      defaultModel: config.defaultModel,
      fallbackModel: config.fallbackModel,
    };

    const { data: updated, error: updateErr } = await db
      .from("system_settings")
      .update({
        ai_config: newJsonb,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId)
      .select("id, ai_config, created_at, updated_at")
      .single<SystemSettingsRow>();

    if (updateErr || !updated) {
      logger.error({ err: updateErr, rowId }, "AiConfigService.updateAiConfig: DB UPDATE error");
      throw AppError.internal("Failed to update AI configuration");
    }

    // ── 3. Audit log ───────────────────────────────────────────────────────
    const changedFields = Object.keys(config) as Array<keyof UpdateAiConfigInput>;

    await adminAuditLogService.log({
      action: "ai_config_updated",
      adminId,
      targetType: "ai_config",
      targetId: rowId,
      metadata: {
        changed_fields: changedFields.join(","),
      },
    });

    return this._toAiConfigData(updated.ai_config);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * _toAiConfigData — map persisted JSONB → AiConfigData + append supportedModels
   *
   * supportedModels มาจาก SUPPORTED_MODELS constant ไม่ใช่จาก DB
   * (informational, always reflects the current allowlist)
   */
  private _toAiConfigData(jsonb: AiConfigJsonb): AiConfigData {
    return {
      analysisModel: jsonb.analysisModel,
      documentGenerationModel: jsonb.documentGenerationModel,
      defaultModel: jsonb.defaultModel,
      fallbackModel: jsonb.fallbackModel,
      supportedModels: [...SUPPORTED_MODELS],
    };
  }

  /**
   * _insertDefaultConfig — INSERT row with DEFAULT_AI_CONFIG, return AiConfigData
   *
   * Called when getAiConfig finds no row.
   *
   * @throws {AppError} AppError.internal() ถ้า INSERT ล้มเหลว
   */
  private async _insertDefaultConfig(
    db: ReturnType<typeof createAdminSupabaseClient>
  ): Promise<AiConfigData> {
    const { data, error } = await db
      .from("system_settings")
      .insert({ ai_config: DEFAULT_AI_CONFIG })
      .select("id, ai_config, created_at, updated_at")
      .single<SystemSettingsRow>();

    if (error || !data) {
      logger.error({ err: error }, "AiConfigService._insertDefaultConfig: DB INSERT error");
      throw AppError.internal("Failed to initialise AI configuration with defaults");
    }

    logger.info({ rowId: data.id }, "AiConfigService: inserted default AI config (first boot)");

    return this._toAiConfigData(data.ai_config);
  }

  /**
   * _insertConfig — INSERT row with a specific UpdateAiConfigInput payload.
   *
   * Called by updateAiConfig when no row exists yet (race-safe: singleton index
   * on system_settings will cause a conflict on double-insert).
   *
   * @throws {AppError} AppError.internal() ถ้า INSERT ล้มเหลว
   */
  private async _insertConfig(
    db: ReturnType<typeof createAdminSupabaseClient>,
    config: UpdateAiConfigInput
  ): Promise<SystemSettingsRow> {
    const jsonb: AiConfigJsonb = {
      analysisModel: config.analysisModel,
      documentGenerationModel: config.documentGenerationModel,
      defaultModel: config.defaultModel,
      fallbackModel: config.fallbackModel,
    };

    const { data, error } = await db
      .from("system_settings")
      .insert({ ai_config: jsonb })
      .select("id, ai_config, created_at, updated_at")
      .single<SystemSettingsRow>();

    if (error || !data) {
      logger.error({ err: error }, "AiConfigService._insertConfig: DB INSERT error");
      throw AppError.internal("Failed to create AI configuration record");
    }

    return data;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/** Singleton — import this everywhere; do not instantiate directly. */
export const aiConfigService = new AiConfigService();
