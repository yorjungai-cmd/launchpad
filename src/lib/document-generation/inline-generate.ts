/**
 * inline-generate.ts — Inline document generation for Vercel serverless.
 *
 * Production runs document generation INLINE (awaited within a request),
 * mirroring inline-worker.ts for AI analysis. The pgmq queue + Edge Function
 * worker (document-generation-worker) is an alternative architecture that is
 * not invoked on Vercel because serverless kills background work.
 *
 * Flow:
 *   1. Load the completed ai_analyses row + idea metadata
 *   2. Build AnalysisData for the document service
 *   3. Resolve the configured AI provider key (Admin Settings) for narratives
 *   4. Call documentGenerationService.generateDocumentSet (best-effort narrative;
 *      falls back to deterministic template content if the provider fails)
 *
 * Narratives use a fast provider model to keep total latency within the
 * serverless time budget (maxDuration on the tRPC route).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import { documentGenerationService } from "@/modules/document-generation/service";
import type { AnalysisData, ClaudeNarrativeFn } from "@/modules/document-generation/service";
import { documentGenerationRepository } from "@/modules/document-generation/repository";
import {
  resolveActiveKeyInfo,
  callProviderTool,
  narrativeModelFor,
} from "@/lib/claude/inline-worker";
import {
  DOCUMENT_NARRATIVE_SYSTEM_PROMPT,
  NARRATIVE_TOOL_DEFINITION,
  buildNarrativeContext,
} from "@/lib/claude/prompts/document-narrative";

/**
 * Generate the full Launch PAD document set for an idea whose analysis has
 * completed. Safe to call multiple times — documents upsert by
 * (idea_id, document_type), so re-runs overwrite idempotently.
 *
 * Guard: if a completed document set already exists, generation is skipped
 * unless `force` is true (the manual "regenerate" action passes force=true).
 * This avoids redundant Claude calls when BD and guest open the idea around
 * the same time.
 *
 * Throws only on unrecoverable errors (missing/incomplete analysis). Narrative
 * failures are swallowed and fall back to deterministic template content.
 *
 * @returns "generated" when documents were produced, "skipped" when an existing
 *          completed set was reused.
 */
export async function runInlineDocumentGeneration(
  ideaId: string,
  options: { force?: boolean } = {}
): Promise<"generated" | "skipped"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminSupabaseClient() as any;

  // Dedup guard: skip if a completed set already exists (unless forced)
  if (!options.force) {
    const existing = await documentGenerationRepository.findByIdea(ideaId);
    const hasCompletedSet =
      existing.length > 0 && existing.some((d) => d.generationStatus === "completed");
    if (hasCompletedSet) {
      logger.info(
        { ideaId, count: existing.length },
        "runInlineDocumentGeneration: completed set already exists — skipping (use force to regenerate)"
      );
      return "skipped";
    }
  }

  // 1. Load completed analysis
  const { data: analysisRow, error: analysisErr } = await db
    .from("ai_analyses")
    .select("*")
    .eq("idea_id", ideaId)
    .maybeSingle();

  if (analysisErr || !analysisRow) {
    throw new Error(
      `runInlineDocumentGeneration: analysis not found for idea ${ideaId}: ${
        analysisErr?.message ?? "no row"
      }`
    );
  }
  if (analysisRow.processing_status !== "completed") {
    throw new Error(
      `runInlineDocumentGeneration: analysis not completed for idea ${ideaId} (status=${analysisRow.processing_status})`
    );
  }

  // 2. Load idea metadata
  const { data: ideaRow } = await db
    .from("ideas")
    .select("id, title, reference_number, submitter_name")
    .eq("id", ideaId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = analysisRow as Record<string, any>;
  const analysisId = a["id"] as string;

  const analysisData: AnalysisData = {
    ideaTitle: (ideaRow?.title as string | undefined) ?? "Untitled",
    summary: (a["summary"] as string | null) ?? null,
    stage: (a["stage"] as string | null) ?? null,
    ideaType: (a["idea_type"] as string | null) ?? null,
    recommendedAction: (a["recommended_action"] as string | null) ?? null,
    recommendedActionReasoning: (a["recommended_action_reasoning"] as string | null) ?? null,
    portfolioMatches: (a["portfolio_matches"] as AnalysisData["portfolioMatches"] | null) ?? [],
    strategicFitScore: (a["strategic_fit_score"] as number | null) ?? null,
    marketPotentialScore: (a["market_potential_score"] as number | null) ?? null,
    technicalFeasibilityScore: (a["technical_feasibility_score"] as number | null) ?? null,
    resourceRequirementScore: (a["resource_requirement_score"] as number | null) ?? null,
    businessImpactScore: (a["business_impact_score"] as number | null) ?? null,
    strategicFitReasoning: (a["strategic_fit_reasoning"] as string | null) ?? null,
    marketPotentialReasoning: (a["market_potential_reasoning"] as string | null) ?? null,
    technicalFeasibilityReasoning: (a["technical_feasibility_reasoning"] as string | null) ?? null,
    resourceRequirementReasoning: (a["resource_requirement_reasoning"] as string | null) ?? null,
    businessImpactReasoning: (a["business_impact_reasoning"] as string | null) ?? null,
    referenceNumber: (ideaRow?.reference_number as string | undefined) ?? "",
    submitterName: (ideaRow?.submitter_name as string | null) ?? null,
  };

  // 3. Resolve provider key once; build a narrative function (best-effort)
  const keyInfo = await resolveActiveKeyInfo();
  const callClaude: ClaudeNarrativeFn = async (params) => {
    if (!keyInfo) return {};
    try {
      const raw = await callProviderTool(
        { ...keyInfo, model: narrativeModelFor(keyInfo.provider) },
        {
          system: DOCUMENT_NARRATIVE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildNarrativeContext(params) }],
          tool: NARRATIVE_TOOL_DEFINITION,
          toolName: NARRATIVE_TOOL_DEFINITION.name,
          maxTokens: 4096,
        }
      );
      const out = raw as { sections?: Array<{ key: string; content_markdown: string }> };
      const map: Record<string, string> = {};
      for (const s of out.sections ?? []) {
        if (s?.key) map[s.key] = s.content_markdown ?? "";
      }
      return map;
    } catch (err) {
      logger.warn(
        { ideaId, err: err instanceof Error ? err.message : String(err) },
        "runInlineDocumentGeneration: narrative call failed — falling back to template"
      );
      return {};
    }
  };

  // 4. Generate the document set
  await documentGenerationService.generateDocumentSet(ideaId, analysisId, analysisData, callClaude);

  logger.info({ ideaId, analysisId }, "runInlineDocumentGeneration: completed");
  return "generated";
}
