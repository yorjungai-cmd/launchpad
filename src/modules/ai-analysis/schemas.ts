/**
 * Zod schemas for the ai-analysis module.
 *
 * Covers:
 *   - Claude AI structured output validation (ClaudeAnalysisOutputSchema)
 *   - Portfolio match objects (PortfolioMatchSchema)
 *   - Feasibility dimension objects (FeasibilityDimensionSchema)
 *   - Score override audit entries (ScoreOverrideEntrySchema)
 *   - Override-eligible field names (OverrideScoreFieldSchema)
 *
 * Ref: design/api-spec.md — Zod Schemas
 *      design/data-model.md — score_overrides JSONB schema
 *
 * Task 1.4
 */

import { z } from "zod";

// ─── FeasibilityDimensionSchema ───────────────────────────────────────────────
// Represents a single feasibility evaluation dimension returned by Claude.
// score: integer 1–5 (BD scoring scale)
// reasoning: Claude's explanation for the score

export const FeasibilityDimensionSchema = z.object({
  score: z.number().int().min(1).max(5),
  reasoning: z.string(),
});

// ─── PortfolioMatchSchema ─────────────────────────────────────────────────────
// Represents how an idea relates to a product in AppliCAD's portfolio.
// Embedded as a JSONB array in ai_analyses.portfolio_matches.

export const PortfolioMatchSchema = z.object({
  product: z.enum(["PTCAD", "APP.AI", "COBO", "CRM"]),
  relevance: z.enum(["High", "Medium", "Low"]),
  reasoning: z.string(),
});

// ─── ClaudeAnalysisOutputSchema ───────────────────────────────────────────────
// Validates the structured JSON output returned by Claude via tool use.
// Every field is required — Claude is prompted to populate all of them.

export const ClaudeAnalysisOutputSchema = z.object({
  summary: z.string().max(2000),

  // Stage classification
  stage: z.enum(["Sandbox", "Validation Sprint", "Build Sprint", "Launch & Test"]),
  stage_confidence: z.number().min(0).max(1),
  stage_reasoning: z.string(),

  // Idea type classification
  idea_type: z.enum(["SaaS", "SI", "Hardware", "Platform", "Internal Tool", "Partnership"]),
  idea_type_confidence: z.number().min(0).max(1),

  // Portfolio relevance
  portfolio_matches: z.array(PortfolioMatchSchema),

  // 5-dimension feasibility evaluation
  feasibility: z.object({
    strategic_fit: FeasibilityDimensionSchema,
    market_potential: FeasibilityDimensionSchema,
    technical_feasibility: FeasibilityDimensionSchema,
    resource_requirement: FeasibilityDimensionSchema,
    business_impact: FeasibilityDimensionSchema,
  }),

  // Go / No-Go recommendation
  recommended_action: z.enum(["Go", "Conditional Go", "No Go"]),
  recommended_action_reasoning: z.string(),
});

// ─── OverrideScoreFieldSchema ─────────────────────────────────────────────────
// Enum of the five score field names that a BD Reviewer is allowed to override.
// Used as the `field` discriminator in ScoreOverrideEntrySchema and the
// `analysis.overrideScore` tRPC input.

export const OverrideScoreFieldSchema = z.enum([
  "strategic_fit_score",
  "market_potential_score",
  "technical_feasibility_score",
  "resource_requirement_score",
  "business_impact_score",
]);

// ─── ScoreOverrideEntrySchema ─────────────────────────────────────────────────
// Single entry in the ai_analyses.score_overrides JSONB append-only audit array.
// Recorded every time a BD Reviewer overrides a feasibility score.

export const ScoreOverrideEntrySchema = z.object({
  field: z.string(),
  previous_value: z.number().int().min(1).max(5),
  new_value: z.number().int().min(1).max(5),
  comment: z.string(),
  reviewer_id: z.string().uuid(),
  reviewer_name: z.string(),
  overridden_at: z.string().datetime(),
});
