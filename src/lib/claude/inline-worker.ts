/**
 * inline-worker.ts — Synchronous AI analysis worker for Vercel serverless.
 *
 * Runs Claude analysis inline within the tRPC request (fire-and-forget from
 * the caller's perspective via setImmediate). No Edge Function or pgmq required.
 *
 * Flow:
 *   1. Read idea content from DB
 *   2. Read active API key from api_keys → Supabase Vault
 *   3. Call Claude via Anthropic SDK (tool use)
 *   4. Validate response with Zod
 *   5. Persist result to ai_analyses
 *   6. Update ideas.analysis_status
 *
 * Called from ideaSubmissionService.submitIdea() as fire-and-forget.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { buildAnalysisPrompt } from "./prompt-builder";
import { ClaudeAnalysisOutputSchema } from "@/modules/ai-analysis/schemas";
import { aiAnalysisRepository } from "@/modules/ai-analysis/repository";
import logger from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IdeaForAnalysis {
  id: string;
  title: string;
  raw_content: string | null;
  extracted_text: string | null;
  input_type: string;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * runInlineAnalysis — fetches idea, calls Claude, persists result.
 * Never throws — all errors are caught and logged.
 */
export async function runInlineAnalysis(ideaId: string): Promise<void> {
  const db = createAdminSupabaseClient();

  try {
    // 1. Create pending ai_analyses row (idempotent — skip if exists)
    try {
      await aiAnalysisRepository.create(ideaId);
    } catch {
      // Row may already exist from a previous attempt — continue
    }

    await aiAnalysisRepository.updateStatus(ideaId, "processing");

    // 2. Fetch idea content
    const { data: idea, error: ideaErr } = await db
      .from("ideas")
      .select("id, title, raw_content, extracted_text, input_type")
      .eq("id", ideaId)
      .single();

    if (ideaErr || !idea) {
      throw new Error(`Idea not found: ${ideaErr?.message ?? "no row"}`);
    }

    const row = idea as unknown as IdeaForAnalysis;

    // 3. Get active API key from vault (supports anthropic + openrouter)
    const keyInfo = await _getActiveApiKeyInfo(db);
    if (!keyInfo) {
      throw new Error("No active API key found. Please configure one in Settings → API Keys.");
    }

    // 4. Build prompt and call Claude
    const description = row.raw_content ?? "";
    const extractedText = row.extracted_text ?? "";
    const inputType = (row.input_type as "text" | "file" | "url") ?? "text";

    const promptParams = buildAnalysisPrompt({
      title: row.title,
      description,
      extractedText,
      inputType,
    });

    const response = await _callClaude(keyInfo, promptParams);

    // 5. Extract tool use result
    const toolUseBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      throw new Error("Claude did not return a tool_use block");
    }

    // 6. Validate with Zod
    const parsed = ClaudeAnalysisOutputSchema.parse(toolUseBlock.input);

    // 7. Persist result
    await aiAnalysisRepository.updateFromWorkerResult(ideaId, parsed);

    // 8. Update ideas.analysis_status = 'analysis_complete'
    await db
      .from("ideas")
      .update({ analysis_status: "analysis_complete" as const })
      .eq("id", ideaId);

    logger.info({ ideaId }, "runInlineAnalysis: completed successfully");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ ideaId, err: msg }, "runInlineAnalysis: failed");

    // Mark as failed in DB so UI can show appropriate state
    try {
      await aiAnalysisRepository.updateStatus(ideaId, "failed", msg);
      await db
        .from("ideas")
        .update({ analysis_status: "failed" as const })
        .eq("id", ideaId);
    } catch {
      // Best-effort — don't throw from error handler
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ActiveKeyInfo {
  apiKey: string;
  provider: string;
}

/**
 * Get active API key info. Prefers Anthropic, falls back to OpenRouter,
 * then env var ANTHROPIC_API_KEY.
 */
async function _getActiveApiKeyInfo(
  db: ReturnType<typeof createAdminSupabaseClient>
): Promise<ActiveKeyInfo | null> {
  // Try anthropic first, then any active key
  for (const provider of ["anthropic", "openrouter", "google"]) {
    const { data: keyRow } = await db
      .from("api_keys")
      .select("vault_id, provider")
      .eq("provider", provider)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (keyRow) {
      const plaintext = await _readVaultSecret(
        db,
        (keyRow as { vault_id: string; provider: string }).vault_id
      );
      if (plaintext) {
        return {
          apiKey: plaintext,
          provider: (keyRow as { vault_id: string; provider: string }).provider,
        };
      }
    }
  }

  // Fallback: try any active key
  const { data: anyKey } = await db
    .from("api_keys")
    .select("vault_id, provider")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (anyKey) {
    const plaintext = await _readVaultSecret(
      db,
      (anyKey as { vault_id: string; provider: string }).vault_id
    );
    if (plaintext) {
      return {
        apiKey: plaintext,
        provider: (anyKey as { vault_id: string; provider: string }).provider,
      };
    }
  }

  // Last resort: env var
  const envKey = process.env["ANTHROPIC_API_KEY"];
  if (envKey) return { apiKey: envKey, provider: "anthropic" };

  return null;
}

async function _readVaultSecret(
  db: ReturnType<typeof createAdminSupabaseClient>,
  vaultId: string
): Promise<string | null> {
  try {
    const { data } = await db
      .from("vault.decrypted_secrets" as "api_keys") // type cast workaround
      .select("decrypted_secret")
      .eq("id", vaultId)
      .single();
    return (data as unknown as { decrypted_secret: string } | null)?.decrypted_secret ?? null;
  } catch {
    return null;
  }
}

/**
 * Call Claude API — supports Anthropic direct and OpenRouter (same SDK, different baseURL).
 */
async function _callClaude(
  keyInfo: ActiveKeyInfo,
  promptParams: ReturnType<typeof buildAnalysisPrompt>
): Promise<Anthropic.Message> {
  const clientOpts: ConstructorParameters<typeof Anthropic>[0] = {
    apiKey: keyInfo.apiKey,
  };

  if (keyInfo.provider === "openrouter") {
    clientOpts.baseURL = "https://openrouter.ai/api/v1";
    clientOpts.defaultHeaders = {
      "HTTP-Referer": "https://launchpad-portal-three.vercel.app",
      "X-Title": "LaunchPad Portal",
    };
  }

  const anthropic = new Anthropic(clientOpts);

  return anthropic.messages.create({
    model: keyInfo.provider === "openrouter" ? "anthropic/claude-haiku-4-5" : "claude-haiku-4-5",
    max_tokens: 4096,
    system: promptParams.system,
    messages: [...promptParams.messages],
    tools: [...promptParams.tools] as Anthropic.Tool[],
    tool_choice: promptParams.tool_choice,
  });
}
