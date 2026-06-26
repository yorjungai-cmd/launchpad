/**
 * AIAnalysisRepository — data access layer for the `ai_analyses` and `analysis_jobs` tables.
 *
 * All DB column names (snake_case) are mapped to camelCase AIAnalysis interface fields.
 * Uses the server-side Supabase client (anon key + RLS) or admin client based on context.
 *
 * Note: The Database type in @/lib/supabase/types is a placeholder that will be replaced
 * by generated types from `pnpm supabase:types`. The `ai_analyses` and `analysis_jobs` tables
 * are not yet in the placeholder, so we use `any` for the Supabase client type here
 * and rely on runtime correctness validated by integration tests.
 *
 * Ref: design/components.md — AIAnalysisRepository
 *      design/data-model.md — ai_analyses, analysis_jobs tables
 *
 * Task 2.1
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AIAnalysis,
  ClaudeAnalysisOutput,
  ProcessingStatus,
  ScoreOverrideEntry,
} from "./types";

// ─── DB Row type (snake_case) ─────────────────────────────────────────────────
// Inline type since Database placeholder doesn't include ai_analyses yet
interface AiAnalysisRow {
  id: string;
  idea_id: string;
  processing_status: ProcessingStatus;
  attempt_count: number;
  last_error: string | null;
  summary: string | null;
  stage: "Sandbox" | "Validation Sprint" | "Build Sprint" | "Launch & Test" | null;
  stage_confidence: number | null;
  stage_reasoning: string | null;
  idea_type: "SaaS" | "SI" | "Hardware" | "Platform" | "Internal Tool" | "Partnership" | null;
  idea_type_confidence: number | null;
  portfolio_matches: Array<{
    product: "PTCAD" | "APP.AI" | "COBO" | "CRM";
    relevance: "High" | "Medium" | "Low";
    reasoning: string;
  }> | null;
  strategic_fit_score: number | null;
  strategic_fit_reasoning: string | null;
  market_potential_score: number | null;
  market_potential_reasoning: string | null;
  technical_feasibility_score: number | null;
  technical_feasibility_reasoning: string | null;
  resource_requirement_score: number | null;
  resource_requirement_reasoning: string | null;
  business_impact_score: number | null;
  business_impact_reasoning: string | null;
  recommended_action: "Go" | "Conditional Go" | "No Go" | null;
  recommended_action_reasoning: string | null;
  score_overrides: ScoreOverrideEntry[];
  raw_claude_response: Record<string, unknown> | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapRowToAIAnalysis(row: AiAnalysisRow): AIAnalysis {
  return {
    id: row.id,
    ideaId: row.idea_id,
    processingStatus: row.processing_status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    summary: row.summary,
    stage: row.stage,
    stageConfidence: row.stage_confidence,
    stageReasoning: row.stage_reasoning,
    ideaType: row.idea_type,
    ideaTypeConfidence: row.idea_type_confidence,
    portfolioMatches: row.portfolio_matches ?? [],
    strategicFitScore: row.strategic_fit_score,
    strategicFitReasoning: row.strategic_fit_reasoning,
    marketPotentialScore: row.market_potential_score,
    marketPotentialReasoning: row.market_potential_reasoning,
    technicalFeasibilityScore: row.technical_feasibility_score,
    technicalFeasibilityReasoning: row.technical_feasibility_reasoning,
    resourceRequirementScore: row.resource_requirement_score,
    resourceRequirementReasoning: row.resource_requirement_reasoning,
    businessImpactScore: row.business_impact_score,
    businessImpactReasoning: row.business_impact_reasoning,
    recommendedAction: row.recommended_action,
    recommendedActionReasoning: row.recommended_action_reasoning,
    scoreOverrides: row.score_overrides ?? [],
    rawClaudeResponse: row.raw_claude_response,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class AIAnalysisRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getClient(): any {
    return createServerSupabaseClient();
  }

  /**
   * INSERT a new ai_analyses row with status='pending'.
   * Called immediately after idea is submitted.
   */
  async create(ideaId: string): Promise<AIAnalysis> {
    const db = this.getClient();

    const { data, error } = await db
      .from("ai_analyses")
      .insert({
        idea_id: ideaId,
        processing_status: "pending",
        attempt_count: 0,
        score_overrides: [],
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(
        `AIAnalysisRepository.create failed for idea ${ideaId}: ${error?.message ?? "no row returned"}`
      );
    }

    return mapRowToAIAnalysis(data as unknown as AiAnalysisRow);
  }

  /**
   * UPDATE all analysis fields and set processing_status='completed'.
   * Called by the worker after successful Claude API response.
   */
  async updateFromWorkerResult(ideaId: string, result: ClaudeAnalysisOutput): Promise<AIAnalysis> {
    const db = this.getClient();

    const { data, error } = await db
      .from("ai_analyses")
      .update({
        processing_status: "completed",
        summary: result.summary,
        stage: result.stage,
        stage_confidence: result.stage_confidence,
        stage_reasoning: result.stage_reasoning,
        idea_type: result.idea_type,
        idea_type_confidence: result.idea_type_confidence,
        portfolio_matches: result.portfolio_matches,
        strategic_fit_score: result.feasibility.strategic_fit.score,
        strategic_fit_reasoning: result.feasibility.strategic_fit.reasoning,
        market_potential_score: result.feasibility.market_potential.score,
        market_potential_reasoning: result.feasibility.market_potential.reasoning,
        technical_feasibility_score: result.feasibility.technical_feasibility.score,
        technical_feasibility_reasoning: result.feasibility.technical_feasibility.reasoning,
        resource_requirement_score: result.feasibility.resource_requirement.score,
        resource_requirement_reasoning: result.feasibility.resource_requirement.reasoning,
        business_impact_score: result.feasibility.business_impact.score,
        business_impact_reasoning: result.feasibility.business_impact.reasoning,
        recommended_action: result.recommended_action,
        recommended_action_reasoning: result.recommended_action_reasoning,
        raw_claude_response: result as unknown as Record<string, unknown>,
        completed_at: new Date().toISOString(),
      })
      .eq("idea_id", ideaId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(
        `AIAnalysisRepository.updateFromWorkerResult failed for idea ${ideaId}: ${error?.message ?? "no row returned"}`
      );
    }

    return mapRowToAIAnalysis(data as unknown as AiAnalysisRow);
  }

  /**
   * UPDATE processing_status, last_error, and increment attempt_count.
   * Called by the worker on each attempt (pending → processing, etc.)
   */
  async updateStatus(ideaId: string, status: ProcessingStatus, error?: string): Promise<void> {
    const db = this.getClient();

    const updatePayload: Record<string, unknown> = {
      processing_status: status,
      last_error: error ?? null,
    };

    // Attempt atomic increment via RPC first; fall back to read-modify-write
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (db as any).rpc("increment_analysis_attempt_count", {
      p_idea_id: ideaId,
      p_status: status,
      p_error: error ?? null,
    });

    if (updateError) {
      // Fallback: direct update without atomic increment
      const { data: current } = await db
        .from("ai_analyses")
        .select("attempt_count")
        .eq("idea_id", ideaId)
        .single();

      const currentCount = (current as { attempt_count: number } | null)?.attempt_count ?? 0;

      const { error: fallbackError } = await db
        .from("ai_analyses")
        .update({
          ...updatePayload,
          attempt_count: currentCount + 1,
        })
        .eq("idea_id", ideaId);

      if (fallbackError) {
        throw new Error(
          `AIAnalysisRepository.updateStatus failed for idea ${ideaId}: ${(fallbackError as { message: string }).message}`
        );
      }
    }
  }

  /**
   * SELECT * FROM ai_analyses WHERE idea_id = $1.
   * Returns null when no row found.
   */
  async findByIdeaId(ideaId: string): Promise<AIAnalysis | null> {
    const db = this.getClient();

    const { data, error } = await db.from("ai_analyses").select("*").eq("idea_id", ideaId).single();

    if (error) {
      // PGRST116 = no rows returned (PostgREST)
      if (error.code === "PGRST116") return null;
      // Any other error: return null (caller treats as not found)
      return null;
    }

    return data ? mapRowToAIAnalysis(data as unknown as AiAnalysisRow) : null;
  }

  /**
   * UPDATE processing_status='failed', last_error, attempt_count.
   * Called when max retries exceeded.
   */
  async markJobFailed(ideaId: string, error: string, attemptCount: number): Promise<void> {
    const db = this.getClient();

    const { error: updateError } = await db
      .from("ai_analyses")
      .update({
        processing_status: "failed",
        last_error: error,
        attempt_count: attemptCount,
      })
      .eq("idea_id", ideaId);

    if (updateError) {
      throw new Error(
        `AIAnalysisRepository.markJobFailed failed for idea ${ideaId}: ${updateError.message}`
      );
    }
  }

  /**
   * Override a feasibility score field + append to audit trail.
   *
   * Steps:
   *  1. Read current row to get current score_overrides array
   *  2. Append new entry to the array
   *  3. UPDATE the score field + score_overrides in one call
   *  4. Return updated AIAnalysis
   *
   * Throws if the row is not found.
   */
  async overrideScore(
    ideaId: string,
    field: string,
    newValue: number,
    entry: ScoreOverrideEntry
  ): Promise<AIAnalysis> {
    const db = this.getClient();

    // Step 1: Read current row to get current score_overrides
    const { data: current, error: readError } = await db
      .from("ai_analyses")
      .select("score_overrides")
      .eq("idea_id", ideaId)
      .single();

    if (readError || !current) {
      throw new Error(
        `AIAnalysisRepository.overrideScore: analysis not found for idea ${ideaId}: ${readError?.message ?? "no row returned"}`
      );
    }

    // Step 2: Build updated score_overrides array (append-only)
    const currentOverrides: ScoreOverrideEntry[] =
      (current as { score_overrides: ScoreOverrideEntry[] | null }).score_overrides ?? [];
    const updatedOverrides = [...currentOverrides, entry];

    // Step 3: UPDATE field + score_overrides in a single call
    const { data, error: updateError } = await db
      .from("ai_analyses")
      .update({
        [field]: newValue,
        score_overrides: updatedOverrides,
      })
      .eq("idea_id", ideaId)
      .select()
      .single();

    if (updateError || !data) {
      throw new Error(
        `AIAnalysisRepository.overrideScore update failed for idea ${ideaId}: ${updateError?.message ?? "no row returned"}`
      );
    }

    return mapRowToAIAnalysis(data as unknown as AiAnalysisRow);
  }
}

/** Singleton — import this everywhere, do not instantiate directly */
export const aiAnalysisRepository = new AIAnalysisRepository();
