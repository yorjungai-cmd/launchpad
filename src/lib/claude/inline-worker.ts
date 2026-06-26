/**
 * inline-worker.ts — Multi-provider AI analysis worker for Vercel serverless.
 *
 * Supports all providers configured in Admin Settings:
 *   - anthropic    → Anthropic SDK (tool use / structured output)
 *   - openrouter   → Anthropic SDK with custom baseURL (OpenAI-compatible)
 *   - google       → Google Generative Language REST API (function calling)
 *   - aws_bedrock  → AWS SDK BedrockRuntime (converse API with tool use)
 *
 * Flow:
 *   1. Read analysisModel from system_settings.ai_config
 *   2. Find active API key matching the model's provider
 *   3. Dispatch to provider-specific caller
 *   4. Normalize response → ClaudeAnalysisOutput shape
 *   5. Persist result to ai_analyses + update ideas.analysis_status
 */

import Anthropic from "@anthropic-ai/sdk";
// AWS SDK is lazily imported inside _callBedrock() to prevent webpack from
// trying to statically bundle it — it's only needed at runtime when provider=aws_bedrock
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { buildAnalysisPrompt } from "./prompt-builder";
import { ClaudeAnalysisOutputSchema } from "@/modules/ai-analysis/schemas";
import { aiAnalysisRepository } from "@/modules/ai-analysis/repository";
import { ANALYSIS_TOOL_DEFINITION } from "./prompts/analysis-tool-definition";
import logger from "@/lib/logger";
import type { ClaudeAnalysisOutput } from "@/modules/ai-analysis/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IdeaForAnalysis {
  id: string;
  title: string;
  raw_content: string | null;
  extracted_text: string | null;
  input_type: string;
}

interface ActiveKeyInfo {
  apiKey: string;
  provider: "anthropic" | "openrouter" | "google" | "aws_bedrock";
  model: string;
}

// ─── Provider → model prefix mapping ─────────────────────────────────────────

/** Detect which provider a model ID belongs to */
function detectProviderFromModel(modelId: string): ActiveKeyInfo["provider"] {
  if (
    modelId.startsWith("anthropic.") ||
    modelId.startsWith("us.anthropic.") ||
    modelId.startsWith("amazon.nova") ||
    modelId.includes("bedrock")
  )
    return "aws_bedrock";
  if (modelId.startsWith("gemini") || modelId.startsWith("models/gemini")) return "google";
  if (modelId.includes("/") && !modelId.startsWith("claude")) return "openrouter";
  return "anthropic";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runInlineAnalysis(ideaId: string): Promise<void> {
  const db = createAdminSupabaseClient();

  try {
    // 1. Create pending ai_analyses row (idempotent)
    try {
      await aiAnalysisRepository.create(ideaId);
    } catch {
      // already exists — continue
    }
    await aiAnalysisRepository.updateStatus(ideaId, "processing");

    // 2. Fetch idea
    const { data: idea, error: ideaErr } = await db
      .from("ideas")
      .select("id, title, raw_content, extracted_text, input_type")
      .eq("id", ideaId)
      .single();
    if (ideaErr || !idea) throw new Error(`Idea not found: ${ideaErr?.message ?? "no row"}`);
    const row = idea as unknown as IdeaForAnalysis;

    // 3. Read AI config + find matching active key
    const keyInfo = await _resolveKeyInfo(db);
    if (!keyInfo) throw new Error("No active API key found. Configure one in Settings → API Keys.");

    // 4. Build prompt
    const promptParams = buildAnalysisPrompt({
      title: row.title,
      description: row.raw_content ?? "",
      extractedText: row.extracted_text ?? "",
      inputType: (row.input_type as "text" | "file" | "url") ?? "text",
    });

    // 5. Call provider
    let parsed: ClaudeAnalysisOutput;
    switch (keyInfo.provider) {
      case "anthropic":
        parsed = await _callAnthropic(keyInfo, promptParams);
        break;
      case "openrouter":
        parsed = await _callOpenRouter(keyInfo, promptParams);
        break;
      case "google":
        parsed = await _callGoogle(keyInfo, promptParams);
        break;
      case "aws_bedrock":
        parsed = await _callBedrock(keyInfo, promptParams);
        break;
    }

    // 6. Persist
    await aiAnalysisRepository.updateFromWorkerResult(ideaId, parsed);
    await db
      .from("ideas")
      .update({ analysis_status: "analysis_complete" as const })
      .eq("id", ideaId);

    logger.info(
      { ideaId, provider: keyInfo.provider, model: keyInfo.model },
      "runInlineAnalysis: completed"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ ideaId, err: msg }, "runInlineAnalysis: failed");
    try {
      await aiAnalysisRepository.updateStatus(ideaId, "failed", msg);
      await db
        .from("ideas")
        .update({ analysis_status: "failed" as const })
        .eq("id", ideaId);
    } catch {
      /* best-effort */
    }
  }
}

// ─── Key + Config resolution ──────────────────────────────────────────────────

async function _resolveKeyInfo(
  db: ReturnType<typeof createAdminSupabaseClient>
): Promise<ActiveKeyInfo | null> {
  // Read analysisModel from system_settings
  const { data: settings } = await db
    .from("system_settings")
    .select("ai_config")
    .limit(1)
    .maybeSingle();

  const aiConfig = settings?.ai_config as Record<string, string> | null;
  const analysisModel = aiConfig?.analysisModel ?? "";

  // Determine target provider from model ID
  const targetProvider = analysisModel ? detectProviderFromModel(analysisModel) : null;

  // Find active key: prefer key matching target provider, fallback to any active key
  const providers: ActiveKeyInfo["provider"][] = targetProvider
    ? [targetProvider, "anthropic", "openrouter", "google", "aws_bedrock"]
    : ["anthropic", "openrouter", "google", "aws_bedrock"];

  for (const p of providers) {
    const { data: keyRow } = await db
      .from("api_keys")
      .select("vault_id, provider")
      .eq("provider", p)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (keyRow) {
      const plaintext = await _readVaultSecret(db, (keyRow as { vault_id: string }).vault_id);
      if (plaintext) {
        const provider = (keyRow as { provider: string }).provider as ActiveKeyInfo["provider"];
        // Pick best model for this provider
        const model = _selectModel(analysisModel, provider);
        return { apiKey: plaintext, provider, model };
      }
    }
  }

  // Last resort: ANTHROPIC_API_KEY env var
  const envKey = process.env["ANTHROPIC_API_KEY"];
  if (envKey) {
    return {
      apiKey: envKey,
      provider: "anthropic",
      model: _selectModel(analysisModel, "anthropic"),
    };
  }

  return null;
}

/** Select best model: use configured if matches provider, else provider default */
function _selectModel(configuredModel: string, provider: ActiveKeyInfo["provider"]): string {
  if (!configuredModel) return _defaultModel(provider);
  const detectedProvider = detectProviderFromModel(configuredModel);
  if (detectedProvider === provider) return configuredModel;
  return _defaultModel(provider);
}

function _defaultModel(provider: ActiveKeyInfo["provider"]): string {
  switch (provider) {
    case "anthropic":
      return "claude-haiku-4-5";
    case "openrouter":
      return "anthropic/claude-haiku-4-5";
    case "google":
      return "gemini-1.5-flash";
    case "aws_bedrock":
      return "us.anthropic.claude-haiku-4-5-20251014-v1:0";
  }
}

async function _readVaultSecret(
  db: ReturnType<typeof createAdminSupabaseClient>,
  vaultId: string
): Promise<string | null> {
  try {
    const { data } = await db
      .from("vault.decrypted_secrets" as "api_keys")
      .select("decrypted_secret")
      .eq("id", vaultId)
      .single();
    return (data as unknown as { decrypted_secret: string } | null)?.decrypted_secret ?? null;
  } catch {
    return null;
  }
}

// ─── Provider callers ─────────────────────────────────────────────────────────

type PromptParams = ReturnType<typeof buildAnalysisPrompt>;

/** Parse tool use block from Anthropic-compatible response */
function _parseAnthropicToolBlock(content: Anthropic.ContentBlock[]): ClaudeAnalysisOutput {
  const toolBlock = content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("No tool_use block in response");
  return ClaudeAnalysisOutputSchema.parse(toolBlock.input);
}

// ── Anthropic direct ──────────────────────────────────────────────────────────

async function _callAnthropic(
  keyInfo: ActiveKeyInfo,
  prompt: PromptParams
): Promise<ClaudeAnalysisOutput> {
  const client = new Anthropic({ apiKey: keyInfo.apiKey });
  const resp = await client.messages.create({
    model: keyInfo.model,
    max_tokens: 4096,
    system: prompt.system,
    messages: [...prompt.messages],
    tools: [...prompt.tools] as Anthropic.Tool[],
    tool_choice: prompt.tool_choice,
  });
  return _parseAnthropicToolBlock(resp.content);
}

// ── OpenRouter ────────────────────────────────────────────────────────────────

async function _callOpenRouter(
  keyInfo: ActiveKeyInfo,
  prompt: PromptParams
): Promise<ClaudeAnalysisOutput> {
  const client = new Anthropic({
    apiKey: keyInfo.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://launchpad-portal-three.vercel.app",
      "X-Title": "LaunchPad Portal",
    },
  });
  const resp = await client.messages.create({
    model: keyInfo.model,
    max_tokens: 4096,
    system: prompt.system,
    messages: [...prompt.messages],
    tools: [...prompt.tools] as Anthropic.Tool[],
    tool_choice: prompt.tool_choice,
  });
  return _parseAnthropicToolBlock(resp.content);
}

// ── Google Gemini (REST) ──────────────────────────────────────────────────────

async function _callGoogle(
  keyInfo: ActiveKeyInfo,
  prompt: PromptParams
): Promise<ClaudeAnalysisOutput> {
  const modelId = keyInfo.model.startsWith("models/") ? keyInfo.model : `models/${keyInfo.model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelId}:generateContent?key=${keyInfo.apiKey}`;

  // Convert Anthropic tool definition to Google function declaration
  const functionDeclaration = {
    name: ANALYSIS_TOOL_DEFINITION.name,
    description: ANALYSIS_TOOL_DEFINITION.description,
    parameters: ANALYSIS_TOOL_DEFINITION.input_schema,
  };

  const body = {
    system_instruction: { parts: [{ text: prompt.system }] },
    contents: prompt.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    tools: [{ functionDeclarations: [functionDeclaration] }],
    tool_config: {
      function_calling_config: { mode: "ANY", allowed_function_names: ["analyze_idea"] },
    },
    generation_config: { max_output_tokens: 4096 },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Google API error ${resp.status}: ${text}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await resp.json()) as any;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const fnCall = parts.find((p: { functionCall?: unknown }) => p.functionCall);
  if (!fnCall?.functionCall?.args) throw new Error("Google response missing functionCall.args");

  return ClaudeAnalysisOutputSchema.parse(fnCall.functionCall.args);
}

// ── AWS Bedrock (via Anthropic SDK with AWS auth) ─────────────────────────────
// Bedrock Claude models are accessible via Anthropic SDK using AWS credentials.
// Key format: "ACCESS_KEY_ID|SECRET_ACCESS_KEY[|REGION]"

async function _callBedrock(
  keyInfo: ActiveKeyInfo,
  prompt: PromptParams
): Promise<ClaudeAnalysisOutput> {
  const parts = keyInfo.apiKey.split("|");
  if (parts.length < 2)
    throw new Error(
      "AWS Bedrock key must be formatted as 'ACCESS_KEY_ID|SECRET_ACCESS_KEY[|REGION]'"
    );

  const [accessKeyId, secretAccessKey, region = "us-east-1"] = parts;

  const modelId = keyInfo.model;
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;

  // Build AWS SigV4 signed request using native crypto (available in Node.js 18+)
  const body = JSON.stringify({
    system: [{ text: prompt.system }],
    messages: prompt.messages.map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: ANALYSIS_TOOL_DEFINITION.name,
            description: ANALYSIS_TOOL_DEFINITION.description,
            inputSchema: { json: ANALYSIS_TOOL_DEFINITION.input_schema },
          },
        },
      ],
      toolChoice: { tool: { name: "analyze_idea" } },
    },
    inferenceConfig: { maxTokens: 4096 },
  });

  const headers = await _signBedrockRequest({
    method: "POST",
    url,
    body,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    region,
    service: "bedrock",
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(55_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Bedrock API error ${resp.status}: ${text}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await resp.json()) as any;
  const toolUse = (data?.output?.message?.content ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .find((b: any) => b.toolUse !== undefined);

  if (!toolUse?.toolUse?.input) throw new Error("Bedrock response missing toolUse block");

  return ClaudeAnalysisOutputSchema.parse(toolUse.toolUse.input);
}

/** AWS SigV4 signing using native Node.js crypto — no SDK required */
async function _signBedrockRequest(opts: {
  method: string;
  url: string;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}): Promise<Record<string, string>> {
  const { method, url, body, accessKeyId, secretAccessKey, region, service } = opts;
  const parsedUrl = new URL(url);
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const { createHmac, createHash } = await import("crypto");

  const payloadHash = createHash("sha256").update(body).digest("hex");
  const canonicalHeaders = `content-type:application/json\nhost:${parsedUrl.host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = [
    method,
    parsedUrl.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const sign = (key: Buffer | string, data: string) =>
    createHmac("sha256", key).update(data).digest();

  const signingKey = sign(
    sign(sign(sign(`AWS4${secretAccessKey}`, dateStamp), region), service),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return {
    "x-amz-date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// Suppress unused variable warning — client is used for type narrowing only
void ((_unused: typeof Anthropic.prototype.messages) => {});
