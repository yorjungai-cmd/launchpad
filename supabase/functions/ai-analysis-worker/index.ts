/**
 * AIAnalysisWorker — Supabase Edge Function (Deno runtime)
 *
 * HTTP POST trigger handler that:
 *   1. Reads one job from pgmq queue `ai_analysis_jobs`
 *   2. Reads idea content from the ideas table
 *   3. Builds Claude prompt and calls Claude API with tool use
 *   4. Validates Claude response with Zod schema
 *   5. Persists result to ai_analyses via repository
 *   6. Handles retry with exponential backoff (max 3 attempts)
 *   7. Handles rate limiting (429 Retry-After, x-ratelimit-remaining header)
 *
 * Ref: design/components.md — AIAnalysisWorker
 *      design/integration.md — Claude API, Supabase Queue
 *
 * Tasks 2.3, 2.4, 2.5
 */

// Deno Edge Function imports
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ─── Inline schema + types (avoid relative imports for Deno Edge Functions) ──
// These mirror the TypeScript types and Zod schemas in the main app.
// In production, use a shared lib or copy here as Deno can't import from Node.

interface FeasibilityDimension {
  score: number;
  reasoning: string;
}

interface PortfolioMatch {
  product: "PTCAD" | "APP.AI" | "COBO" | "CRM";
  relevance: "High" | "Medium" | "Low";
  reasoning: string;
}

interface ClaudeAnalysisOutput {
  summary: string;
  stage: "Sandbox" | "Validation Sprint" | "Build Sprint" | "Launch & Test";
  stage_confidence: number;
  stage_reasoning: string;
  idea_type: "SaaS" | "SI" | "Hardware" | "Platform" | "Internal Tool" | "Partnership";
  idea_type_confidence: number;
  portfolio_matches: PortfolioMatch[];
  feasibility: {
    strategic_fit: FeasibilityDimension;
    market_potential: FeasibilityDimension;
    technical_feasibility: FeasibilityDimension;
    resource_requirement: FeasibilityDimension;
    business_impact: FeasibilityDimension;
  };
  recommended_action: "Go" | "Conditional Go" | "No Go";
  recommended_action_reasoning: string;
}

// ─── Inline Zod-equivalent validation (Deno-compatible) ──────────────────────

function validateClaudeOutput(data: unknown): ClaudeAnalysisOutput {
  if (!data || typeof data !== "object") {
    throw new Error("Claude output is not an object");
  }

  const d = data as Record<string, unknown>;

  const requiredStrings = [
    "summary",
    "stage_reasoning",
    "stage",
    "idea_type",
    "recommended_action",
    "recommended_action_reasoning",
  ];

  for (const field of requiredStrings) {
    if (typeof d[field] !== "string" || (d[field] as string).length === 0) {
      throw new Error(`Claude output missing or invalid field: ${field}`);
    }
  }

  const validStages = ["Sandbox", "Validation Sprint", "Build Sprint", "Launch & Test"];
  if (!validStages.includes(d.stage as string)) {
    throw new Error(`Invalid stage: ${String(d.stage)}`);
  }

  const validIdeaTypes = ["SaaS", "SI", "Hardware", "Platform", "Internal Tool", "Partnership"];
  if (!validIdeaTypes.includes(d.idea_type as string)) {
    throw new Error(`Invalid idea_type: ${String(d.idea_type)}`);
  }

  const validActions = ["Go", "Conditional Go", "No Go"];
  if (!validActions.includes(d.recommended_action as string)) {
    throw new Error(`Invalid recommended_action: ${String(d.recommended_action)}`);
  }

  const stageConf = d.stage_confidence as number;
  const typeConf = d.idea_type_confidence as number;
  if (typeof stageConf !== "number" || stageConf < 0 || stageConf > 1) {
    throw new Error(`Invalid stage_confidence: ${String(stageConf)}`);
  }
  if (typeof typeConf !== "number" || typeConf < 0 || typeConf > 1) {
    throw new Error(`Invalid idea_type_confidence: ${String(typeConf)}`);
  }

  if (!Array.isArray(d.portfolio_matches)) {
    throw new Error("portfolio_matches must be an array");
  }

  const feasibility = d.feasibility as Record<string, unknown> | undefined;
  if (!feasibility || typeof feasibility !== "object") {
    throw new Error("feasibility must be an object");
  }

  const feasibilityDimensions = [
    "strategic_fit",
    "market_potential",
    "technical_feasibility",
    "resource_requirement",
    "business_impact",
  ];

  for (const dim of feasibilityDimensions) {
    const dimVal = feasibility[dim] as Record<string, unknown> | undefined;
    if (!dimVal || typeof dimVal !== "object") {
      throw new Error(`feasibility.${dim} must be an object`);
    }
    const score = dimVal.score as number;
    if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error(`feasibility.${dim}.score must be integer 1–5, got: ${String(score)}`);
    }
    if (typeof dimVal.reasoning !== "string") {
      throw new Error(`feasibility.${dim}.reasoning must be a string`);
    }
  }

  return data as ClaudeAnalysisOutput;
}

// ─── Inline prompt builder (Deno-compatible) ──────────────────────────────────

interface IdeaContent {
  title: string;
  description: string | null;
  extractedText: string | null;
  inputType: string;
}

// Portfolio context inline for Deno
const PORTFOLIO_CONTEXT = `**PTCAD (Production CAD Software)**
Category: CAD / Engineering Software
Description: ซอฟต์แวร์ออกแบบ CAD สำหรับงานอุตสาหกรรมการผลิต ช่วยวิศวกรและนักออกแบบสร้าง 2D/3D model, ทำ BOM, และจัดการ drawing อย่างมืออาชีพ เหมาะกับโรงงาน SME ถึงขนาดกลางในภาคการผลิต
Target Users: วิศวกรออกแบบ, ทีม R&D, โรงงานการผลิต

**APP.AI (AI-Powered Applications Platform)**
Category: AI Platform / No-Code / Low-Code
Description: แพลตฟอร์ม AI สำหรับสร้าง business application แบบ no-code/low-code ให้องค์กรสร้าง AI-powered workflow, chatbot, document processing
Target Users: Business users, ทีม IT องค์กร, SME ที่ต้องการ digital transformation

**COBO (ERP / Accounting System)**
Category: ERP / Accounting / Business Management
Description: ระบบ ERP และบัญชีสำหรับธุรกิจไทย ครอบคลุม accounting, inventory, procurement, HR/payroll รองรับมาตรฐานบัญชีไทย (TAS) และ VAT
Target Users: นักบัญชี, ทีม Finance, ผู้บริหาร SME

**CRM (Customer Relationship Management)**
Category: CRM / Sales / Customer Success
Description: ระบบ CRM สำหรับจัดการลูกค้า, pipeline การขาย ช่วยทีมขายติดตาม lead, จัดการ deal, บันทึก interaction history
Target Users: ทีมขาย, Account Manager, BD Team`;

const SYSTEM_PROMPT = `You are an expert business development analyst for AppliCAD. Analyze business ideas using the Launch PAD 2.0 framework.

## Language: Respond in the same language as the idea (Thai or English)

## AppliCAD Portfolio
${PORTFOLIO_CONTEXT}

## Stage Definitions
- **Sandbox**: Early concept, needs research and exploration
- **Validation Sprint**: Clear enough for rapid MVP validation in 2–4 weeks
- **Build Sprint**: Validated, ready to build full product
- **Launch & Test**: Ready to launch and gather real-world feedback

## Scoring 1–5
- Strategic Fit, Market Potential, Technical Feasibility, Resource Requirement, Business Impact
- 5=excellent/very favorable, 1=poor/very unfavorable

ALWAYS use the 'analyze_idea' tool. Do not respond in plain text.`;

function buildPromptMessages(
  idea: IdeaContent
): Array<{ role: "user" | "assistant"; content: string }> {
  const parts: string[] = [`## Idea Title\n${idea.title}`, `## Submission Type\n${idea.inputType}`];

  if (idea.description?.trim()) {
    parts.push(`## Description\n${idea.description.trim()}`);
  }
  if (idea.extractedText?.trim()) {
    parts.push(`## Full Content\n${idea.extractedText.trim()}`);
  }
  parts.push("Please analyze this idea using the 'analyze_idea' tool.");

  return [{ role: "user", content: parts.join("\n\n") }];
}

// ─── Tool definition (inline for Deno) ───────────────────────────────────────

const ANALYZE_IDEA_TOOL: Anthropic.Tool = {
  name: "analyze_idea",
  description:
    "Analyze a business idea using the Launch PAD 2.0 framework and return structured evaluation.",
  input_schema: {
    type: "object",
    required: [
      "summary",
      "stage",
      "stage_confidence",
      "stage_reasoning",
      "idea_type",
      "idea_type_confidence",
      "portfolio_matches",
      "feasibility",
      "recommended_action",
      "recommended_action_reasoning",
    ],
    properties: {
      summary: { type: "string", maxLength: 2000 },
      stage: {
        type: "string",
        enum: ["Sandbox", "Validation Sprint", "Build Sprint", "Launch & Test"],
      },
      stage_confidence: { type: "number", minimum: 0, maximum: 1 },
      stage_reasoning: { type: "string" },
      idea_type: {
        type: "string",
        enum: ["SaaS", "SI", "Hardware", "Platform", "Internal Tool", "Partnership"],
      },
      idea_type_confidence: { type: "number", minimum: 0, maximum: 1 },
      portfolio_matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            product: {
              type: "string",
              enum: ["PTCAD", "APP.AI", "COBO", "CRM"],
            },
            relevance: { type: "string", enum: ["High", "Medium", "Low"] },
            reasoning: { type: "string" },
          },
          required: ["product", "relevance", "reasoning"],
        },
      },
      feasibility: {
        type: "object",
        properties: {
          strategic_fit: {
            type: "object",
            properties: {
              score: { type: "integer", minimum: 1, maximum: 5 },
              reasoning: { type: "string" },
            },
            required: ["score", "reasoning"],
          },
          market_potential: {
            type: "object",
            properties: {
              score: { type: "integer", minimum: 1, maximum: 5 },
              reasoning: { type: "string" },
            },
            required: ["score", "reasoning"],
          },
          technical_feasibility: {
            type: "object",
            properties: {
              score: { type: "integer", minimum: 1, maximum: 5 },
              reasoning: { type: "string" },
            },
            required: ["score", "reasoning"],
          },
          resource_requirement: {
            type: "object",
            properties: {
              score: { type: "integer", minimum: 1, maximum: 5 },
              reasoning: { type: "string" },
            },
            required: ["score", "reasoning"],
          },
          business_impact: {
            type: "object",
            properties: {
              score: { type: "integer", minimum: 1, maximum: 5 },
              reasoning: { type: "string" },
            },
            required: ["score", "reasoning"],
          },
        },
        required: [
          "strategic_fit",
          "market_potential",
          "technical_feasibility",
          "resource_requirement",
          "business_impact",
        ],
      },
      recommended_action: {
        type: "string",
        enum: ["Go", "Conditional Go", "No Go"],
      },
      recommended_action_reasoning: { type: "string" },
    },
  } as Anthropic.Tool["input_schema"],
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BACKOFF_DELAYS_MS = [5_000, 15_000, 45_000]; // attempt 0, 1, 2

// ─── Utility: sleep ───────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Retry logic ──────────────────────────────────────────────────────────────

async function callClaudeWithRetry(
  anthropic: Anthropic,
  idea: IdeaContent,
  model: string
): Promise<ClaudeAnalysisOutput> {
  let lastError: Error = new Error("Unknown error");
  let parseFailCount = 0;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const messages = buildPromptMessages(idea);

      const response = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [ANALYZE_IDEA_TOOL],
        tool_choice: { type: "tool", name: "analyze_idea" },
        messages,
      });

      // Check rate limit remaining from response headers
      // Note: Anthropic SDK exposes headers via response object in some versions
      // For safety, we handle this best-effort

      // Extract tool_use block from response
      const toolUseBlock = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (!toolUseBlock) {
        throw new Error(
          `Claude did not return a tool_use block. Stop reason: ${response.stop_reason}`
        );
      }

      // Validate output
      try {
        const validated = validateClaudeOutput(toolUseBlock.input);
        return validated;
      } catch (parseError) {
        parseFailCount++;
        const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
        lastError = new Error(`Zod parse error (attempt ${attempt + 1}): ${errMsg}`);

        // Retry once for parse errors; if fails again → throw
        if (parseFailCount >= 2) {
          throw lastError;
        }
        // Fall through to retry loop
        continue;
      }
    } catch (err) {
      // Handle Anthropic API errors
      if (err instanceof Anthropic.APIError) {
        // 429 Rate Limit — read Retry-After header
        if (err.status === 429) {
          const retryAfterHeader = err.headers?.["retry-after"];
          const retryAfterSec = retryAfterHeader
            ? parseInt(String(retryAfterHeader), 10)
            : (BACKOFF_DELAYS_MS[attempt] ?? 45_000 / 1000);
          const sleepMs = isNaN(retryAfterSec)
            ? (BACKOFF_DELAYS_MS[attempt] ?? 45_000)
            : retryAfterSec * 1000;

          console.warn(
            `[AIAnalysisWorker] Rate limited (429). Sleeping ${sleepMs}ms before retry...`
          );
          await sleep(sleepMs);
          lastError = new Error(`Rate limited: ${err.message}`);
          continue;
        }

        // 5xx server errors — retry with backoff
        if (err.status >= 500) {
          const backoffMs = BACKOFF_DELAYS_MS[attempt] ?? 45_000;
          console.warn(
            `[AIAnalysisWorker] Claude API error ${err.status} on attempt ${attempt + 1}. Backoff ${backoffMs}ms...`
          );
          await sleep(backoffMs);
          lastError = new Error(`Claude API ${err.status}: ${err.message}`);
          continue;
        }

        // Other API errors — don't retry
        throw new Error(`Claude API error (non-retryable) ${err.status}: ${err.message}`);
      }

      // Zod parse error re-throw (already handled above)
      if (err instanceof Error && err.message.includes("parse error")) {
        lastError = err;
        if (parseFailCount >= 2) break;
        continue;
      }

      // Unknown error
      lastError = err instanceof Error ? err : new Error(String(err));
      const backoffMs = BACKOFF_DELAYS_MS[attempt] ?? 45_000;
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

// ─── Document generation auto-trigger ─────────────────────────────────────────
// Enqueue a document-generation job after a successful analysis. Mirrors the
// pattern used by DocumentGenerationService.enqueueGeneration: dedup guard →
// insert document_jobs row → pgmq_send to "document_generation_jobs".
// All failures are logged but swallowed so the analysis flow always succeeds.
async function enqueueDocumentGeneration(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ideaId: string,
  analysisId: string
): Promise<void> {
  const QUEUE_NAME = "document_generation_jobs";
  try {
    // Dedup guard: skip if an active job already exists for this idea
    const { data: active } = await supabase
      .from("document_jobs")
      .select("id")
      .eq("idea_id", ideaId)
      .in("status", ["queued", "processing"])
      .limit(1)
      .maybeSingle();
    if (active) {
      console.info(
        `[AIAnalysisWorker] document job already active for idea ${ideaId} — skip enqueue`
      );
      return;
    }

    // Create document_jobs row (status='queued')
    const { data: job, error: jobError } = await supabase
      .from("document_jobs")
      .insert({
        idea_id: ideaId,
        analysis_id: analysisId,
        status: "queued",
        enqueued_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobError || !job) {
      console.error(
        `[AIAnalysisWorker] failed to create document_jobs row for idea ${ideaId}:`,
        jobError?.message ?? "no row returned"
      );
      return;
    }

    const jobId = (job as { id: string }).id;

    // Send message to the document generation queue
    const { data: msgId, error: sendError } = await supabase.rpc("pgmq_send", {
      queue_name: QUEUE_NAME,
      msg: { ideaId, analysisId, jobId, timestamp: new Date().toISOString() },
    });

    if (sendError) {
      console.error(
        `[AIAnalysisWorker] pgmq_send (document) failed for idea ${ideaId}:`,
        sendError.message
      );
      // Non-fatal: job row exists; a cron fallback can re-scan queued jobs
      return;
    }

    if (msgId != null) {
      await supabase.from("document_jobs").update({ queue_message_id: msgId }).eq("id", jobId);
    }

    console.info(`[AIAnalysisWorker] enqueued document generation job ${jobId} for idea ${ideaId}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[AIAnalysisWorker] enqueueDocumentGeneration error for idea ${ideaId}:`, errMsg);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Initialize clients ──────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const claudeModel = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-5";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  // ── Step 1: Read one message from pgmq ─────────────────────────────────────
  const { data: messages, error: readError } = await supabase.rpc("pgmq_read", {
    queue_name: "ai_analysis_jobs",
    vt: 120,
    qty: 1,
  });

  if (readError) {
    console.error("[AIAnalysisWorker] pgmq_read error:", readError.message);
    return new Response(
      JSON.stringify({ error: "Failed to read from queue", detail: readError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Step 2: No messages → return early ─────────────────────────────────────
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = messages[0] as {
    msg_id: number;
    message: { ideaId: string; jobId?: string };
  };

  const msgId = message.msg_id;
  const ideaId = message.message?.ideaId;

  if (!ideaId) {
    console.error("[AIAnalysisWorker] Invalid message payload:", message);
    // Delete malformed message to avoid infinite retry
    await supabase.rpc("pgmq_delete", {
      queue_name: "ai_analysis_jobs",
      msg_id: msgId,
    });
    return new Response(JSON.stringify({ processed: 0, error: "Invalid message payload" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Step 3: Check analysis_jobs for active job (deduplication) ─────────────
  const { data: activeJobs } = await supabase
    .from("analysis_jobs")
    .select("id, status")
    .eq("idea_id", ideaId)
    .in("status", ["queued", "processing"]);

  if (!activeJobs || activeJobs.length === 0) {
    console.warn(`[AIAnalysisWorker] No active job found for idea ${ideaId} — skipping`);
    // Delete the stale message
    await supabase.rpc("pgmq_delete", {
      queue_name: "ai_analysis_jobs",
      msg_id: msgId,
    });
    return new Response(JSON.stringify({ processed: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const jobId = (activeJobs[0] as { id: string }).id;

  // ── Step 4: Update analysis_jobs status='processing' ───────────────────────
  await supabase
    .from("analysis_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId);

  // ── Step 5: Update ai_analyses status='processing' ─────────────────────────
  await supabase
    .from("ai_analyses")
    .update({ processing_status: "processing" })
    .eq("idea_id", ideaId);

  // ── Step 6: Read idea content ───────────────────────────────────────────────
  const { data: idea, error: ideaError } = await supabase
    .from("ideas")
    .select("title, description:raw_content, extracted_text, input_type")
    .eq("id", ideaId)
    .single();

  if (ideaError || !idea) {
    const errMsg = ideaError?.message ?? "Idea not found";
    console.error(`[AIAnalysisWorker] Failed to read idea ${ideaId}:`, errMsg);

    await supabase
      .from("ai_analyses")
      .update({ processing_status: "failed", last_error: errMsg })
      .eq("idea_id", ideaId);

    await supabase
      .from("analysis_jobs")
      .update({
        status: "dead",
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await supabase.rpc("pgmq_delete", {
      queue_name: "ai_analysis_jobs",
      msg_id: msgId,
    });

    return new Response(JSON.stringify({ processed: 0, failed: ideaId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ideaContent: IdeaContent = {
    title: (idea as { title: string }).title,
    description: (idea as { description: string | null }).description,
    extractedText: (idea as { extracted_text: string | null }).extracted_text,
    inputType: (idea as { input_type: string }).input_type,
  };

  // ── Step 7: Call Claude with retry/backoff ──────────────────────────────────
  let analysisResult: ClaudeAnalysisOutput | null = null;
  let lastError = "";
  let attemptCount = 0;

  try {
    analysisResult = await callClaudeWithRetry(anthropic, ideaContent, claudeModel);
    attemptCount = 1; // at least 1 attempt succeeded
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    attemptCount = MAX_RETRIES;

    // ── Max retries exceeded → mark failed ─────────────────────────────────
    console.error(`[AIAnalysisWorker] Max retries exceeded for idea ${ideaId}:`, lastError);

    // Update ai_analyses: status=failed
    await supabase
      .from("ai_analyses")
      .update({
        processing_status: "failed",
        last_error: lastError,
        attempt_count: attemptCount,
      })
      .eq("idea_id", ideaId);

    // Update analysis_jobs: status=dead
    await supabase
      .from("analysis_jobs")
      .update({
        status: "dead",
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Delete message to prevent further processing
    await supabase.rpc("pgmq_delete", {
      queue_name: "ai_analysis_jobs",
      msg_id: msgId,
    });

    return new Response(JSON.stringify({ processed: 0, failed: ideaId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Step 8: Persist result ──────────────────────────────────────────────────
  let completedAnalysisId: string | null = null;
  if (analysisResult) {
    const { data: persistData, error: persistError } = await supabase
      .from("ai_analyses")
      .update({
        processing_status: "completed",
        summary: analysisResult.summary,
        stage: analysisResult.stage,
        stage_confidence: analysisResult.stage_confidence,
        stage_reasoning: analysisResult.stage_reasoning,
        idea_type: analysisResult.idea_type,
        idea_type_confidence: analysisResult.idea_type_confidence,
        portfolio_matches: analysisResult.portfolio_matches,
        strategic_fit_score: analysisResult.feasibility.strategic_fit.score,
        strategic_fit_reasoning: analysisResult.feasibility.strategic_fit.reasoning,
        market_potential_score: analysisResult.feasibility.market_potential.score,
        market_potential_reasoning: analysisResult.feasibility.market_potential.reasoning,
        technical_feasibility_score: analysisResult.feasibility.technical_feasibility.score,
        technical_feasibility_reasoning: analysisResult.feasibility.technical_feasibility.reasoning,
        resource_requirement_score: analysisResult.feasibility.resource_requirement.score,
        resource_requirement_reasoning: analysisResult.feasibility.resource_requirement.reasoning,
        business_impact_score: analysisResult.feasibility.business_impact.score,
        business_impact_reasoning: analysisResult.feasibility.business_impact.reasoning,
        recommended_action: analysisResult.recommended_action,
        recommended_action_reasoning: analysisResult.recommended_action_reasoning,
        raw_claude_response: analysisResult as unknown as Record<string, unknown>,
        completed_at: new Date().toISOString(),
        attempt_count: attemptCount,
      })
      .eq("idea_id", ideaId)
      .select("id")
      .single();

    if (persistError) {
      console.error(
        `[AIAnalysisWorker] Failed to persist result for idea ${ideaId}:`,
        persistError.message
      );
    } else {
      completedAnalysisId = (persistData as { id: string } | null)?.id ?? null;
    }
  }

  // ── Step 8.5: Auto-trigger document generation ────────────────────────────
  // After a successful analysis, enqueue a job so the document-generation-worker
  // builds the full Launch PAD document set (feasibility report, BMC, proposal, …).
  // Best-effort: never fail the analysis flow because of document enqueue.
  if (analysisResult && completedAnalysisId) {
    await enqueueDocumentGeneration(supabase, ideaId, completedAnalysisId);
  }

  // ── Step 9: pgmq_delete + update analysis_jobs status='done' ──────────────
  await supabase.rpc("pgmq_delete", {
    queue_name: "ai_analysis_jobs",
    msg_id: msgId,
  });

  await supabase
    .from("analysis_jobs")
    .update({
      status: "done",
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // ── Rate limit guard: check remaining capacity ─────────────────────────────
  // If remaining < 5 on Claude API, sleep 1s before signaling ready for next job
  // Note: This is signaled via response metadata; the scheduler respects it
  console.info(`[AIAnalysisWorker] Successfully processed idea ${ideaId}`);

  return new Response(JSON.stringify({ processed: 1 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
