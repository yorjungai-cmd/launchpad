/**
 * Claude narrative tool definition + system prompt for document section generation.
 * Generates natural-language narrative sections (executive summary, problem framing, etc.)
 * from structured ai_analyses data.
 *
 * Ref: design/integration.md — Claude API (narrative sections)
 * Task 5.3
 */

export const DOCUMENT_NARRATIVE_SYSTEM_PROMPT = `You are a business analyst assistant for AppliCAD, a Thai software company.
You generate professional, concise narrative sections for business documents based on structured idea analysis data.
Write in the same language as the idea content (Thai or English as appropriate).
Be factual, professional, and avoid hyperbole. Keep each section focused and actionable.
Format output as clean markdown — no excessive headers within a section.`;

/** Tool definition for Claude tool use (structured narrative output) */
export const NARRATIVE_TOOL_DEFINITION = {
  name: "write_sections",
  description:
    "Generate narrative content for specified document sections based on idea analysis data.",
  input_schema: {
    type: "object" as const,
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "Section key identifier" },
            content_markdown: {
              type: "string",
              description: "Narrative content in markdown format",
            },
          },
          required: ["key", "content_markdown"],
        },
        description: "Array of section keys with their narrative content",
      },
    },
    required: ["sections"],
  },
};

export interface NarrativeToolOutput {
  sections: Array<{ key: string; content_markdown: string }>;
}

/**
 * Builds the user message for narrative generation.
 */
export function buildNarrativeContext(params: {
  ideaTitle: string;
  summary: string;
  stage: string | null;
  ideaType: string | null;
  recommendedAction: string | null;
  portfolioMatches: Array<{ product: string; relevance: string; reasoning: string }>;
  feasibilityScores: {
    strategicFit: number | null;
    marketPotential: number | null;
    technicalFeasibility: number | null;
    resourceRequirement: number | null;
    businessImpact: number | null;
  };
  documentType: string;
  sectionKeys: string[];
}): string {
  const scores = params.feasibilityScores;
  return `Generate narrative sections for a "${params.documentType}" document.

IDEA: ${params.ideaTitle}
SUMMARY: ${params.summary}
STAGE: ${params.stage ?? "Sandbox"}
TYPE: ${params.ideaType ?? "Unknown"}
RECOMMENDED ACTION: ${params.recommendedAction ?? "Pending"}

FEASIBILITY SCORES:
- Strategic Fit: ${scores.strategicFit ?? "N/A"}/5
- Market Potential: ${scores.marketPotential ?? "N/A"}/5
- Technical Feasibility: ${scores.technicalFeasibility ?? "N/A"}/5
- Resource Requirement: ${scores.resourceRequirement ?? "N/A"}/5
- Business Impact: ${scores.businessImpact ?? "N/A"}/5

PORTFOLIO MATCHES: ${params.portfolioMatches.map((m) => `${m.product} (${m.relevance})`).join(", ") || "None"}

Write sections: ${params.sectionKeys.join(", ")}`;
}
