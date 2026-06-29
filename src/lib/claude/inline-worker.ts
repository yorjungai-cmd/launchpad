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
  file_url: string | null;
  file_original_name: string | null;
}

export interface ActiveKeyInfo {
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
      .select("id, title, raw_content, extracted_text, input_type, file_url, file_original_name")
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

    // 4b. For PDF file submissions: download the file and attach as a vision document
    //     so the AI can see images, charts, and diagrams — not just extracted text.
    //     Claude (Anthropic) + Gemini (Google) support native PDF vision.
    //     Limit: 4 MB to stay within provider document size limits.
    let pdfAttachment: ProviderToolCall["pdfAttachment"];
    if (row.input_type === "file" && row.file_url) {
      const ext = row.file_url.split(".").pop()?.toLowerCase();
      if (ext === "pdf" && (keyInfo.provider === "anthropic" || keyInfo.provider === "google")) {
        pdfAttachment = await _downloadPdfAsBase64(
          db,
          row.file_url,
          row.file_original_name ?? undefined
        );
      }
    }

    // 5. Call provider (generic tool-call → analysis tool)
    const analysisRaw = await callProviderTool(keyInfo, {
      system: promptParams.system,
      messages: [...promptParams.messages],
      tool: ANALYSIS_TOOL_DEFINITION,
      toolName: ANALYSIS_TOOL_DEFINITION.name,
      maxTokens: 4096,
      pdfAttachment,
    });
    const parsed: ClaudeAnalysisOutput = ClaudeAnalysisOutputSchema.parse(analysisRaw);

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

// ─── PDF vision helper ────────────────────────────────────────────────────────

const PDF_VISION_MAX_BYTES = 4 * 1024 * 1024; // 4 MB — within provider doc size limits

/**
 * Download a PDF from Supabase Storage and return it as a base64 string.
 * Returns undefined if the file exceeds the size limit or download fails.
 */
async function _downloadPdfAsBase64(
  db: ReturnType<typeof createAdminSupabaseClient>,
  fileUrl: string,
  filename?: string
): Promise<ProviderToolCall["pdfAttachment"]> {
  try {
    const firstSlash = fileUrl.indexOf("/");
    const bucket = firstSlash !== -1 ? fileUrl.slice(0, firstSlash) : "idea-files";
    const filePath = firstSlash !== -1 ? fileUrl.slice(firstSlash + 1) : fileUrl;

    const { data, error } = await db.storage.from(bucket).download(filePath);
    if (error || !data) return undefined;

    const arrayBuffer = await data.arrayBuffer();
    if (arrayBuffer.byteLength > PDF_VISION_MAX_BYTES) {
      logger.warn(
        { fileUrl, size: arrayBuffer.byteLength },
        "_downloadPdfAsBase64: PDF too large for vision, skipping"
      );
      return undefined;
    }

    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return { base64, filename };
  } catch (err) {
    logger.warn(
      { fileUrl, err: String(err) },
      "_downloadPdfAsBase64: failed, continuing without vision"
    );
    return undefined;
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
      return "anthropic/claude-haiku-4.5";
    case "google":
      return "gemini-1.5-flash";
    case "aws_bedrock":
      return "us.anthropic.claude-haiku-4-5-20251014-v1:0";
  }
}

/**
 * Public wrapper to resolve the active provider key/model from Admin Settings.
 * Creates its own admin Supabase client. Returns null if no key is configured.
 * Reused by inline document generation for narrative calls.
 */
export async function resolveActiveKeyInfo(): Promise<ActiveKeyInfo | null> {
  const db = createAdminSupabaseClient();
  return _resolveKeyInfo(db);
}

/**
 * Returns a fast/cheap model for the given provider, used for narrative
 * generation (lower latency keeps inline document generation within the
 * serverless time budget).
 */
export function narrativeModelFor(provider: ActiveKeyInfo["provider"]): string {
  return _defaultModel(provider);
}

async function _readVaultSecret(
  db: ReturnType<typeof createAdminSupabaseClient>,
  vaultId: string
): Promise<string | null> {
  try {
    // Use public RPC — PostgREST cannot access vault schema directly via .from()
    const { data, error } = await db.rpc("vault_read_secret", { secret_id: vaultId });
    if (error) {
      logger.error({ err: error.message, vaultId }, "_readVaultSecret: RPC failed");
      return null;
    }
    return (data as string | null) ?? null;
  } catch (err) {
    logger.error({ err: String(err), vaultId }, "_readVaultSecret: exception");
    return null;
  }
}

// ─── Provider callers (generic tool-call) ─────────────────────────────────────
// All providers expose one capability here: given (system, messages, tool),
// force the model to call the tool and return the raw tool input object.
// Each caller is provider-specific; callers of callProviderTool parse/validate
// the returned object themselves (e.g. via Zod).

export interface ProviderToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ProviderToolCall {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tool: ProviderToolSpec;
  toolName: string;
  maxTokens?: number;
  /** PDF file to attach as a vision document block (Anthropic + Google only) */
  pdfAttachment?: { base64: string; filename?: string };
}

/** Dispatch a forced tool-call to the configured provider. Returns the raw tool input. */
export async function callProviderTool(
  keyInfo: ActiveKeyInfo,
  call: ProviderToolCall
): Promise<unknown> {
  switch (keyInfo.provider) {
    case "anthropic":
      return _callAnthropic(keyInfo, call);
    case "openrouter":
      return _callOpenRouter(keyInfo, call);
    case "google":
      return _callGoogle(keyInfo, call);
    case "aws_bedrock":
      return _callBedrock(keyInfo, call);
  }
}

// ── Anthropic direct ──────────────────────────────────────────────────────────

async function _callAnthropic(keyInfo: ActiveKeyInfo, call: ProviderToolCall): Promise<unknown> {
  const client = new Anthropic({ apiKey: keyInfo.apiKey });

  const toolDef = {
    name: call.tool.name,
    description: call.tool.description,
    input_schema: call.tool.input_schema,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let content: any[];

  if (call.pdfAttachment) {
    // Use the beta PDF path — build BetaMessageParam[] so types align
    const betaMessages: Anthropic.Beta.Messages.BetaMessageParam[] = call.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    for (let i = betaMessages.length - 1; i >= 0; i--) {
      if (betaMessages[i]!.role === "user") {
        const prevText = betaMessages[i]!.content as string;
        betaMessages[i] = {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: call.pdfAttachment.base64,
              },
              ...(call.pdfAttachment.filename ? { title: call.pdfAttachment.filename } : {}),
            } as Anthropic.Beta.Messages.BetaBase64PDFBlock,
            { type: "text", text: prevText },
          ],
        };
        break;
      }
    }

    const betaResp = await client.beta.messages.create({
      model: keyInfo.model,
      max_tokens: call.maxTokens ?? 4096,
      system: call.system,
      messages: betaMessages,
      tools: [toolDef] as Anthropic.Beta.Messages.BetaTool[],
      tool_choice: { type: "tool", name: call.toolName },
      betas: ["pdfs-2024-09-25"],
    });
    content = betaResp.content;
  } else {
    const messages: Anthropic.MessageParam[] = call.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const resp = await client.messages.create({
      model: keyInfo.model,
      max_tokens: call.maxTokens ?? 4096,
      system: call.system,
      messages,
      tools: [toolDef] as Anthropic.Tool[],
      tool_choice: { type: "tool", name: call.toolName },
    });
    content = resp.content;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const toolBlock = content.find((b: { type: string }) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") throw new Error("No tool_use block in response");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return toolBlock.input;
}

// ── OpenRouter (OpenAI-compatible chat completions + tool calling) ────────────

async function _callOpenRouter(keyInfo: ActiveKeyInfo, call: ProviderToolCall): Promise<unknown> {
  // OpenRouter uses OpenAI-compatible /chat/completions, NOT Anthropic /messages.
  const tool = {
    type: "function" as const,
    function: {
      name: call.tool.name,
      description: call.tool.description,
      parameters: call.tool.input_schema,
    },
  };

  const messages = [
    { role: "system" as const, content: call.system },
    ...call.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${keyInfo.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://launchpad-portal-three.vercel.app",
      "X-Title": "LaunchPad Portal",
    },
    body: JSON.stringify({
      model: _toOpenRouterModel(keyInfo.model),
      max_tokens: call.maxTokens ?? 4096,
      messages,
      tools: [tool],
      tool_choice: { type: "function", function: { name: call.toolName } },
    }),
    signal: AbortSignal.timeout(55_000),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenRouter error ${resp.status}: ${text.slice(0, 300)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await resp.json()) as any;
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("OpenRouter response missing tool_calls");
  }
  return JSON.parse(toolCall.function.arguments);
}

/** Normalise model id to OpenRouter format (uses dots: claude-haiku-4.5, with provider prefix) */
function _toOpenRouterModel(model: string): string {
  // Already in openrouter format (has provider prefix)
  if (model.includes("/")) return model;
  // Convert "claude-haiku-4-5" → "anthropic/claude-haiku-4.5"
  const normalised = model.replace(/-(\d+)-(\d+)$/, "-$1.$2");
  if (normalised.startsWith("claude")) return `anthropic/${normalised}`;
  return normalised;
}

// ── Google Gemini (REST) ──────────────────────────────────────────────────────

async function _callGoogle(keyInfo: ActiveKeyInfo, call: ProviderToolCall): Promise<unknown> {
  const modelId = keyInfo.model.startsWith("models/") ? keyInfo.model : `models/${keyInfo.model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelId}:generateContent?key=${keyInfo.apiKey}`;

  const functionDeclaration = {
    name: call.tool.name,
    description: call.tool.description,
    parameters: call.tool.input_schema,
  };

  // Find the index of the last user message so we can attach the PDF there
  const lastUserIdx =
    [...call.messages]
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.role === "user")
      .pop()?.i ?? -1;

  const body = {
    system_instruction: { parts: [{ text: call.system }] },
    contents: call.messages.map((m, idx) => {
      const baseparts = [{ text: m.content }];
      const parts =
        call.pdfAttachment && idx === lastUserIdx
          ? [
              { inlineData: { mimeType: "application/pdf", data: call.pdfAttachment.base64 } },
              ...baseparts,
            ]
          : baseparts;
      return { role: m.role === "assistant" ? "model" : "user", parts };
    }),
    tools: [{ functionDeclarations: [functionDeclaration] }],
    tool_config: {
      function_calling_config: { mode: "ANY", allowed_function_names: [call.toolName] },
    },
    generation_config: { max_output_tokens: call.maxTokens ?? 4096 },
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

  return fnCall.functionCall.args;
}

// ── AWS Bedrock (via Anthropic SDK with AWS auth) ─────────────────────────────
// Bedrock Claude models are accessible via Anthropic SDK using AWS credentials.
// Key format: "ACCESS_KEY_ID|SECRET_ACCESS_KEY[|REGION]"

async function _callBedrock(keyInfo: ActiveKeyInfo, call: ProviderToolCall): Promise<unknown> {
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
    system: [{ text: call.system }],
    messages: call.messages.map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: call.tool.name,
            description: call.tool.description,
            inputSchema: { json: call.tool.input_schema },
          },
        },
      ],
      toolChoice: { tool: { name: call.toolName } },
    },
    inferenceConfig: { maxTokens: call.maxTokens ?? 4096 },
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

  return toolUse.toolUse.input;
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
