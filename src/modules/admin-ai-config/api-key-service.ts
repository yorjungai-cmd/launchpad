/**
 * ApiKeyService — secure CRUD for AI API keys via Supabase Vault.
 *
 * Responsibilities:
 *   - listApiKeys()    — SELECT from api_keys, return ApiKeyMasked[] (never plaintext)
 *   - saveApiKey()     — validate → vault.create_secret → INSERT api_keys → audit log
 *   - updateApiKey()   — vault.update_secret → UPDATE api_keys → audit log
 *   - deleteApiKey()   — vault.delete_secret → DELETE api_keys → audit log
 *   - validateApiKey() — minimal Claude API call (haiku, 1 token, 10 s timeout)
 *   - maskKey()        — private; derives display string from plaintext — NEVER serialize
 *
 * Security invariants:
 *   1. Plaintext key is NEVER stored in the DB — only Vault UUID is persisted.
 *   2. Plaintext key is NEVER returned from any public method.
 *   3. Plaintext key is NEVER logged (not even at debug level).
 *   4. masked_key is computed once at INSERT time; never re-derived from Vault.
 *   5. Only one api_key row per provider may have is_active = true — enforced in saveApiKey.
 *
 * Design refs:
 *   - design/components.md  — ApiKeyService (Component 4)
 *   - design/integration.md — Supabase Vault + Claude API
 *   - design/data-model.md  — api_keys table
 *
 * Task 4.1
 */

import logger from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { adminAuditLogService } from "./audit-log-service";
import type { ApiKeyMasked, SaveApiKeyInput, Provider } from "./schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Raw row shape returned by `SELECT * FROM api_keys`. */
interface ApiKeyRow {
  id: string;
  name: string;
  provider: string;
  vault_id: string;
  masked_key: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Row joined with profiles for createdByName resolution. */
interface ApiKeyRowWithProfile extends ApiKeyRow {
  profiles: { full_name: string | null } | null;
}

/** Result of a key validation attempt. */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  latencyMs?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ApiKeyService {
  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * listApiKeys — return all api_keys rows, masked.
   *
   * Joins profiles for createdByName. Never reads from Vault (no plaintext).
   */
  async listApiKeys(): Promise<ApiKeyMasked[]> {
    const db = createAdminSupabaseClient();

    const { data, error } = await db
      .from("api_keys")
      .select(
        `
        id,
        name,
        provider,
        vault_id,
        masked_key,
        is_active,
        created_by,
        created_at,
        updated_at,
        profiles ( full_name )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      logger.error({ err: error }, "ApiKeyService.listApiKeys: DB error");
      throw new Error("Failed to list API keys");
    }

    return (data as ApiKeyRowWithProfile[]).map((row) => this._toMasked(row));
  }

  /**
   * saveApiKey — validate key → store in Vault → INSERT api_keys → audit log.
   *
   * If setActive is true, all other rows for the same provider are deactivated first.
   *
   * @param input   - Validated SaveApiKeyInput (name, key, provider, setActive, adminId).
   * @param adminId - UUID of the admin performing the action (for audit log + created_by).
   */
  async saveApiKey(input: SaveApiKeyInput, adminId: string): Promise<ApiKeyMasked> {
    const { name, key, provider, setActive } = input;

    // ── 1. Validate the key against the provider API ───────────────────────
    const validation = await this.validateApiKey(key, provider);
    if (!validation.valid) {
      throw new Error(`API key validation failed: ${validation.error ?? "unknown error"}`);
    }

    const db = createAdminSupabaseClient();
    const maskedKey = this._maskKey(key);
    const keyName = `${provider}:${name}`;

    // ── 2. Store plaintext in Vault ────────────────────────────────────────
    const { data: vaultId, error: vaultErr } = await db.rpc("vault_create_secret", {
      secret: key,
      name: keyName,
    });

    if (vaultErr || !vaultId) {
      logger.error({ err: vaultErr }, "ApiKeyService.saveApiKey: vault_create_secret failed");
      throw new Error("Failed to store API key securely");
    }

    // ── 3. If setActive, deactivate all other keys for this provider ───────
    if (setActive) {
      await this._deactivateProviderKeys(db, provider);
    }

    // ── 4. INSERT api_keys row ─────────────────────────────────────────────
    const { data: insertedRows, error: insertErr } = await db
      .from("api_keys")
      .insert({
        name,
        provider,
        vault_id: vaultId as string,
        masked_key: maskedKey,
        is_active: setActive,
        created_by: adminId,
      })
      .select(
        `
        id,
        name,
        provider,
        vault_id,
        masked_key,
        is_active,
        created_by,
        created_at,
        updated_at,
        profiles ( full_name )
      `
      )
      .single();

    if (insertErr || !insertedRows) {
      logger.error({ err: insertErr }, "ApiKeyService.saveApiKey: INSERT api_keys failed");
      // Vault secret was stored but DB insert failed — log for cleanup; do not expose key.
      throw new Error("Failed to save API key record");
    }

    // ── 5. Audit log ───────────────────────────────────────────────────────
    await adminAuditLogService.log({
      action: "api_key_created",
      adminId,
      targetType: "api_key",
      targetId: (insertedRows as ApiKeyRowWithProfile).id,
      metadata: {
        name,
        provider,
        setActive,
      },
    });

    return this._toMasked(insertedRows as ApiKeyRowWithProfile);
  }

  /**
   * updateApiKey — update Vault secret + UPDATE api_keys masked_key + audit log.
   *
   * @param id      - UUID of the api_keys row.
   * @param newKey  - New plaintext API key (never stored in DB).
   * @param adminId - Admin performing the operation (for audit log).
   */
  async updateApiKey(id: string, newKey: string, adminId: string): Promise<ApiKeyMasked> {
    const db = createAdminSupabaseClient();

    // ── 1. Fetch existing row to get vault_id ──────────────────────────────
    const { data: existing, error: fetchErr } = await db
      .from("api_keys")
      .select("vault_id, provider, name")
      .eq("id", id)
      .single<Pick<ApiKeyRow, "vault_id" | "provider" | "name">>();

    if (fetchErr || !existing) {
      logger.error({ err: fetchErr, id }, "ApiKeyService.updateApiKey: row not found");
      throw new Error("API key not found");
    }

    // ── 2. Update secret in Vault ──────────────────────────────────────────
    const { error: vaultErr } = await db.rpc("vault_update_secret", {
      id: existing.vault_id,
      secret: newKey,
    });

    if (vaultErr) {
      logger.error({ err: vaultErr }, "ApiKeyService.updateApiKey: vault_update_secret failed");
      throw new Error("Failed to update API key in vault");
    }

    // ── 3. UPDATE api_keys row (new masked_key + updated_at) ───────────────
    const newMasked = this._maskKey(newKey);
    const { data: updatedRows, error: updateErr } = await db
      .from("api_keys")
      .update({
        masked_key: newMasked,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        id,
        name,
        provider,
        vault_id,
        masked_key,
        is_active,
        created_by,
        created_at,
        updated_at,
        profiles ( full_name )
      `
      )
      .single();

    if (updateErr || !updatedRows) {
      logger.error({ err: updateErr }, "ApiKeyService.updateApiKey: UPDATE api_keys failed");
      throw new Error("Failed to update API key record");
    }

    // ── 4. Audit log ───────────────────────────────────────────────────────
    await adminAuditLogService.log({
      action: "api_key_updated",
      adminId,
      targetType: "api_key",
      targetId: id,
      metadata: {
        name: existing.name,
        provider: existing.provider,
      },
    });

    return this._toMasked(updatedRows as ApiKeyRowWithProfile);
  }

  /**
   * deleteApiKey — delete Vault secret + DELETE api_keys row + audit log.
   *
   * @param id      - UUID of the api_keys row.
   * @param adminId - Admin performing the operation (for audit log).
   */
  async deleteApiKey(id: string, adminId: string): Promise<void> {
    const db = createAdminSupabaseClient();

    // ── 1. Fetch existing row to get vault_id ──────────────────────────────
    const { data: existing, error: fetchErr } = await db
      .from("api_keys")
      .select("vault_id, provider, name")
      .eq("id", id)
      .single<Pick<ApiKeyRow, "vault_id" | "provider" | "name">>();

    if (fetchErr || !existing) {
      logger.error({ err: fetchErr, id }, "ApiKeyService.deleteApiKey: row not found");
      throw new Error("API key not found");
    }

    // ── 2. Delete secret from Vault ────────────────────────────────────────
    const { error: vaultErr } = await db.rpc("vault_delete_secret", {
      id: existing.vault_id,
    });

    if (vaultErr) {
      logger.error({ err: vaultErr }, "ApiKeyService.deleteApiKey: vault_delete_secret failed");
      throw new Error("Failed to delete API key from vault");
    }

    // ── 3. DELETE api_keys row ─────────────────────────────────────────────
    const { error: deleteErr } = await db.from("api_keys").delete().eq("id", id);

    if (deleteErr) {
      logger.error({ err: deleteErr }, "ApiKeyService.deleteApiKey: DELETE api_keys failed");
      throw new Error("Failed to delete API key record");
    }

    // ── 4. Audit log ───────────────────────────────────────────────────────
    await adminAuditLogService.log({
      action: "api_key_deleted",
      adminId,
      targetType: "api_key",
      targetId: id,
      metadata: {
        name: existing.name,
        provider: existing.provider,
      },
    });
  }

  /**
   * validateApiKey — make a minimal test call to the provider API.
   *
   * Currently supports `anthropic` (Claude). Sends 1-token request to haiku
   * with a 10 s AbortSignal timeout.
   *
   * Return conventions:
   *   - HTTP 200 or 400 (bad request) → { valid: true }  — key accepted
   *   - HTTP 401                       → { valid: false } — key rejected
   *   - Timeout / network error        → { valid: false } — inconclusive
   *
   * NEVER throws. NEVER logs the key value.
   *
   * @param key      - Plaintext API key to test.
   * @param provider - Provider identifier (currently only 'anthropic').
   */
  async validateApiKey(key: string, provider: Provider): Promise<ValidationResult> {
    if (provider === "anthropic") {
      return this._validateAnthropicKey(key);
    }

    // Future providers can be dispatched here.
    return { valid: false, error: `Unsupported provider: ${provider}` };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * _maskKey — derive a display-safe string from a plaintext key.
   *
   * Format:
   *   - If key starts with "sk-" → "sk-ant-...{last4}"  (Anthropic convention)
   *   - Otherwise               → "sk-...{last4}"
   *
   * SECURITY: This is the ONLY place that reads plaintext to derive the mask.
   * The mask is stored in the DB; plaintext is never persisted or returned.
   */
  private _maskKey(plaintext: string): string {
    const last4 = plaintext.slice(-4);
    if (plaintext.startsWith("sk-")) {
      return `sk-ant-...${last4}`;
    }
    return `sk-...${last4}`;
  }

  /**
   * _validateAnthropicKey — Claude minimal test call.
   *
   * Uses AbortSignal.timeout(10_000) for a hard 10 s cutoff.
   * Logs network / timeout errors via Pino without including key material.
   */
  private async _validateAnthropicKey(key: string): Promise<ValidationResult> {
    const start = Date.now();
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const latencyMs = Date.now() - start;

      if (response.ok || response.status === 400) {
        // 200 = success; 400 = bad request payload but key was accepted
        return { valid: true, latencyMs };
      }

      if (response.status === 401) {
        return { valid: false, error: "API key invalid or expired", latencyMs };
      }

      return {
        valid: false,
        error: `Unexpected status: ${response.status}`,
        latencyMs,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;

      if (err instanceof Error && err.name === "TimeoutError") {
        logger.warn({ latencyMs }, "ApiKeyService.validateApiKey: validation timed out");
        return {
          valid: false,
          error: "Validation timeout — API may be unreachable",
          latencyMs,
        };
      }

      logger.error(
        // Intentionally log only err.name / err.message, never the key.
        { errName: err instanceof Error ? err.name : "unknown", latencyMs },
        "ApiKeyService.validateApiKey: network error"
      );
      return {
        valid: false,
        error: "Network error during validation",
        latencyMs,
      };
    }
  }

  /**
   * _deactivateProviderKeys — set is_active = false for ALL rows of a given provider.
   * Called just before inserting a new active key to maintain the single-active invariant.
   */
  private async _deactivateProviderKeys(
    // Accept the Supabase client to avoid re-creating it
    db: ReturnType<typeof createAdminSupabaseClient>,
    provider: string
  ): Promise<void> {
    const { error } = await db
      .from("api_keys")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("provider", provider)
      .eq("is_active", true);

    if (error) {
      logger.error(
        { err: error, provider },
        "ApiKeyService._deactivateProviderKeys: UPDATE failed"
      );
      throw new Error("Failed to deactivate existing active key");
    }
  }

  /**
   * _toMasked — map a raw DB row (with optional profiles join) to ApiKeyMasked.
   *
   * This is the ONLY shape returned to callers — plaintext is excluded by construction.
   */
  private _toMasked(row: ApiKeyRowWithProfile): ApiKeyMasked {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      maskedKey: row.masked_key,
      isActive: row.is_active,
      createdAt: row.created_at,
      createdByName: row.profiles?.full_name ?? null,
    };
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────

/** Singleton — import this everywhere; do not instantiate directly. */
export const apiKeyService = new ApiKeyService();
