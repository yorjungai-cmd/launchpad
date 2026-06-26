/**
 * document-generation-worker — Supabase Edge Function (Deno runtime)
 *
 * Consumes jobs from pgmq queue "document_generation_jobs",
 * generates document sets using template + Claude narrative,
 * persists to output_documents, emits DocumentsGenerated.
 *
 * Retry: max 3 attempts via attempt_count + pgmq visibility timeout (180s)
 * Fallback: Claude failure → template-only (deterministic sections persisted)
 *
 * Ref: design/components.md — Component 4: DocumentGenerationWorker
 * Task 5.2, 5.3
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.32.1";

const QUEUE_NAME = "document_generation_jobs";
const VT_SECONDS = 180;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [5000, 15000, 45000];

interface QueueMessage {
  msg_id: number;
  message: { ideaId: string; analysisId: string; jobId: string; timestamp: string };
}

// ─── Supabase client (service role) ──────────────────────────────────────────

function getDb() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

// ─── Claude client ────────────────────────────────────────────────────────────

function getAnthropic() {
  return new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
}

// ─── Document type / stage resolution ────────────────────────────────────────

type StageDisplay = "Sandbox" | "Validation Sprint" | "Build Sprint" | "Launch & Test";
type DocumentType =
  | "feasibility_report"
  | "bmc"
  | "launch_pad_plan"
  | "poc_proposal"
  | "stage_gate_guide"
  | "project_requirements"
  | "action_plan"
  | "resource_plan"
  | "gtm_summary"
  | "executive_presentation"
  | "project_proposal";

const MANDATORY: DocumentType[] = ["feasibility_report", "stage_gate_guide", "project_proposal"];
const STAGE_EXTRAS: Record<string, DocumentType[]> = {
  Sandbox: ["bmc", "launch_pad_plan", "poc_proposal"],
  "Validation Sprint": ["bmc", "launch_pad_plan", "poc_proposal"],
  "Build Sprint": ["project_requirements", "action_plan", "resource_plan"],
  "Launch & Test": ["gtm_summary", "executive_presentation"],
};

function resolveDocTypes(stage: string | null): DocumentType[] {
  const extras = (stage && STAGE_EXTRAS[stage]) ?? [];
  return [...new Set([...MANDATORY, ...extras])];
}

// ─── Score table builder ──────────────────────────────────────────────────────

function scoreTable(analysis: Record<string, unknown>): string {
  const rows = [
    ["Strategic Fit", analysis.strategic_fit_score],
    ["Market Potential", analysis.market_potential_score],
    ["Technical Feasibility", analysis.technical_feasibility_score],
    ["Resource Requirement", analysis.resource_requirement_score],
    ["Business Impact", analysis.business_impact_score],
  ];
  return (
    "| Dimension | Score |\n|---|---|\n" +
    rows.map(([l, s]) => `| ${l} | ${s ?? "N/A"}/5 |`).join("\n")
  );
}

// ─── Claude narrative call ────────────────────────────────────────────────────

async function callClaude(
  anthropic: Anthropic,
  model: string,
  analysis: Record<string, unknown>,
  documentType: string,
  sectionKeys: string[]
): Promise<Record<string, string>> {
  if (!sectionKeys.length) return {};

  const context = `Generate narrative sections for "${documentType}".
IDEA: ${analysis.idea_title ?? ""}
SUMMARY: ${analysis.summary ?? ""}
STAGE: ${analysis.stage ?? "Sandbox"}
TYPE: ${analysis.idea_type ?? "Unknown"}
RECOMMENDED ACTION: ${analysis.recommended_action ?? "Pending"}
SECTIONS TO WRITE: ${sectionKeys.join(", ")}`;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    tools: [
      {
        name: "write_sections",
        description: "Write narrative markdown content for business document sections.",
        input_schema: {
          type: "object",
          properties: {
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  content_markdown: { type: "string" },
                },
                required: ["key", "content_markdown"],
              },
            },
          },
          required: ["sections"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "write_sections" },
    system:
      "You are a business analyst at AppliCAD. ALWAYS write the document sections in Thai (ภาษาไทย), regardless of the idea's input language. Product names and established framework/technical terms may stay in English. Be professional and concise.",
    messages: [{ role: "user", content: context }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return {};

  const output = toolUse.input as { sections?: Array<{ key: string; content_markdown: string }> };
  const result: Record<string, string> = {};
  for (const s of output.sections ?? []) {
    if (s.key && s.content_markdown) result[s.key] = s.content_markdown;
  }
  return result;
}

// ─── Document generation ─────────────────────────────────────────────────────

async function generateAndPersist(
  db: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  model: string,
  ideaId: string,
  analysisId: string,
  analysis: Record<string, unknown>
): Promise<void> {
  const stage = analysis.stage as StageDisplay | null;
  const docTypes = resolveDocTypes(stage);

  for (const docType of docTypes) {
    const narrativeKeys = getNarrativeKeys(docType);
    let narratives: Record<string, string> = {};

    if (narrativeKeys.length > 0) {
      try {
        narratives = await callClaude(anthropic, model, analysis, docType, narrativeKeys);
      } catch (e) {
        console.error(`[doc-gen-worker] Claude failed for ${docType}:`, e);
        // Fallback: empty narratives → template deterministic only
      }
    }

    const contentMarkdown = buildDocumentContent(docType, analysis, narratives);
    const sections =
      docType === "project_proposal" ? buildProposalSections(analysis, narratives) : undefined;

    const { error } = await db.from("output_documents").upsert(
      {
        idea_id: ideaId,
        analysis_id: analysisId,
        document_type: docType,
        stage_snapshot: stage ?? "Sandbox",
        title: DOC_TITLES[docType] ?? docType,
        content_markdown: contentMarkdown,
        sections: sections ?? null,
        watermark_status: "ai_draft",
        generation_status: "completed",
        generated_at: new Date().toISOString(),
      },
      { onConflict: "idea_id,document_type" }
    );

    if (error) throw new Error(`Failed to upsert ${docType}: ${error.message}`);
  }
}

// ─── Document type helpers ───────────────────────────────────────────────────

const DOC_TITLES: Record<string, string> = {
  feasibility_report: "รายงานความเป็นไปได้ (Feasibility Report)",
  bmc: "Business Model Canvas (BMC)",
  launch_pad_plan: "แผน Launch PAD",
  poc_proposal: "ข้อเสนอ POC (Proof of Concept)",
  stage_gate_guide: "คู่มือประเมิน Stage Gate",
  project_requirements: "เอกสารข้อกำหนดโครงการ (Requirements)",
  action_plan: "แผนปฏิบัติการ (Action Plan)",
  resource_plan: "แผนทรัพยากร (Resource Plan)",
  gtm_summary: "สรุปแผน Go-to-Market (GTM)",
  executive_presentation: "สรุปสำหรับผู้บริหาร (Executive Presentation)",
  project_proposal: "ข้อเสนอโครงการ (ฉบับสมบูรณ์)",
};

function getNarrativeKeys(docType: string): string[] {
  const map: Record<string, string[]> = {
    feasibility_report: ["executive_summary"],
    bmc: ["bmc_canvas"],
    launch_pad_plan: ["validation_sprint", "success_metrics"],
    poc_proposal: ["poc_objective", "poc_scope", "poc_timeline"],
    stage_gate_guide: [],
    project_requirements: ["functional_requirements", "non_functional_requirements"],
    action_plan: ["milestones", "tasks_owners"],
    resource_plan: ["resource_requirements", "budget_estimate"],
    gtm_summary: ["target_market", "go_to_market_strategy", "launch_metrics"],
    executive_presentation: ["executive_overview"],
    project_proposal: [
      "executive_summary",
      "problem_opportunity",
      "proposed_solution",
      "launch_pad_plan",
      "resource_investment",
      "expected_outcomes",
      "next_steps",
    ],
  };
  return map[docType] ?? [];
}

function buildDocumentContent(
  docType: string,
  analysis: Record<string, unknown>,
  narratives: Record<string, string>
): string {
  const title = DOC_TITLES[docType] ?? docType;
  const sections: string[] = [`# ${title}`];

  const narrativeKeys = getNarrativeKeys(docType);
  for (const key of narrativeKeys) {
    const content = narratives[key] ?? `_${key} — pending review_`;
    sections.push(
      `## ${key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${content}`
    );
  }

  if (docType === "feasibility_report") {
    sections.push(`## Feasibility Scores\n\n${scoreTable(analysis)}`);
    sections.push(
      `## Recommendation\n\n**${analysis.recommended_action ?? "Pending"}**\n\n${analysis.recommended_action_reasoning ?? ""}`
    );
  }

  return sections.join("\n\n");
}

function buildProposalSections(
  analysis: Record<string, unknown>,
  narratives: Record<string, string>
): unknown[] {
  const keys = [
    "executive_summary",
    "problem_opportunity",
    "proposed_solution",
    "bmc",
    "feasibility_assessment",
    "launch_pad_plan",
    "stage_gate_guide",
    "resource_investment",
    "expected_outcomes",
    "next_steps",
  ];
  const sourceRefs: Record<string, string> = {
    executive_summary: "ai_analysis.summary",
    problem_opportunity: "ai_analysis.summary",
    proposed_solution: "ai_analysis.summary",
    bmc: "document.bmc",
    feasibility_assessment: "ai_analysis.feasibility",
    launch_pad_plan: "ai_analysis.stage",
    stage_gate_guide: "ai_analysis.stage",
    resource_investment: "ai_analysis.feasibility",
    expected_outcomes: "ai_analysis.feasibility",
    next_steps: "ai_analysis.stage",
  };
  const detContent: Record<string, string> = {
    feasibility_assessment:
      scoreTable(analysis) +
      `\n\n**Recommended Action**: ${analysis.recommended_action ?? "Pending"}`,
    stage_gate_guide: "_See Stage Gate Guide document._",
    bmc: "_See Business Model Canvas document._",
  };
  return keys.map((key, i) => ({
    key,
    order: i + 1,
    title: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    content_markdown: narratives[key] ?? detContent[key] ?? "",
    source_ref: sourceRefs[key] ?? null,
    is_ai_generated: true,
    updated_at: new Date().toISOString(),
  }));
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const db = getDb();
  const anthropic = getAnthropic();
  const model = Deno.env.get("DOC_NARRATIVE_MODEL") ?? "claude-haiku-3-5-20241022";

  // Read one message from queue
  const { data: messages, error: readErr } = await db.rpc("pgmq_read", {
    queue_name: QUEUE_NAME,
    vt: VT_SECONDS,
    qty: 1,
  });

  if (readErr) {
    console.error("[doc-gen-worker] pgmq_read error:", readErr.message);
    return new Response(JSON.stringify({ error: readErr.message }), { status: 500 });
  }

  if (!messages?.length) {
    return new Response(JSON.stringify({ status: "empty" }), { status: 200 });
  }

  const msg = messages[0] as QueueMessage;
  const { ideaId, analysisId, jobId } = msg.message;

  console.log(`[doc-gen-worker] Processing job ${jobId} for idea ${ideaId}`);

  // Update job: processing
  await db
    .from("document_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId);

  // Check attempt count
  const { data: jobRow } = await db
    .from("document_jobs")
    .select("attempt_count")
    .eq("id", jobId)
    .single();
  const attemptCount: number =
    ((jobRow as { attempt_count?: number } | null)?.attempt_count ?? 0) + 1;

  if (attemptCount > MAX_ATTEMPTS) {
    await db
      .from("document_jobs")
      .update({
        status: "dead",
        last_error: "max attempts exceeded",
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    await db.rpc("pgmq_delete", { queue_name: QUEUE_NAME, msg_id: msg.msg_id });
    return new Response(JSON.stringify({ status: "dead", jobId }), { status: 200 });
  }

  await db.from("document_jobs").update({ attempt_count: attemptCount }).eq("id", jobId);

  // Load analysis
  const { data: analysis, error: analysisErr } = await db
    .from("ai_analyses")
    .select("*, ideas(title, reference_number, submitter_name)")
    .eq("id", analysisId)
    .single();

  if (analysisErr || !analysis) {
    const errMsg = analysisErr?.message ?? "analysis not found";
    await db
      .from("document_jobs")
      .update({ status: "dead", last_error: errMsg, finished_at: new Date().toISOString() })
      .eq("id", jobId);
    await db.rpc("pgmq_delete", { queue_name: QUEUE_NAME, msg_id: msg.msg_id });
    return new Response(JSON.stringify({ error: errMsg }), { status: 200 });
  }

  const enriched = {
    ...analysis,
    idea_title: (analysis.ideas as { title?: string } | null)?.title ?? "",
    reference_number:
      (analysis.ideas as { reference_number?: string } | null)?.reference_number ?? "",
    submitter_name: (analysis.ideas as { submitter_name?: string } | null)?.submitter_name ?? "",
  };

  try {
    // Retry backoff
    if (attemptCount > 1) {
      const delay = BACKOFF_MS[attemptCount - 2] ?? 45000;
      await new Promise((r) => setTimeout(r, delay));
    }

    await generateAndPersist(db, anthropic, model, ideaId, analysisId, enriched);

    // Success
    await db
      .from("document_jobs")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", jobId);
    await db.rpc("pgmq_delete", { queue_name: QUEUE_NAME, msg_id: msg.msg_id });

    // Emit DocumentsGenerated
    await db.rpc("notify_documents_generated", { p_idea_id: ideaId }).catch((e: unknown) => {
      console.warn("[doc-gen-worker] notify_documents_generated failed (non-critical):", e);
    });

    console.log(`[doc-gen-worker] Done: job ${jobId}, idea ${ideaId}`);
    return new Response(JSON.stringify({ status: "done", jobId, ideaId }), { status: 200 });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[doc-gen-worker] Error: job ${jobId}:`, errMsg);
    await db
      .from("document_jobs")
      .update({ last_error: errMsg, attempt_count: attemptCount })
      .eq("id", jobId);
    // Message returns to queue after VT expires — auto-retry
    return new Response(JSON.stringify({ error: errMsg, attempt: attemptCount }), { status: 500 });
  }
});
