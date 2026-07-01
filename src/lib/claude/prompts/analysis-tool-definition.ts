export function buildAnalysisToolDefinition(productIds: string[]) {
  const effectiveIds = productIds.length > 0 ? productIds : ["(no products configured)"];

  return {
    name: "analyze_idea" as const,
    description:
      "Analyze a business idea using the Launch PAD 2.0 framework. " +
      "Returns structured evaluation including stage classification, idea type, " +
      "feasibility scores across 5 dimensions, portfolio match analysis, and recommended action. " +
      "วิเคราะห์ idea ทางธุรกิจโดยใช้ Launch PAD 2.0 framework และส่งคืนผลการประเมินแบบ structured.",
    input_schema: {
      type: "object" as const,
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
        summary: {
          type: "string",
          maxLength: 2000,
          description:
            "Concise summary of the idea content (≤ 200 words). Write in the same language as the idea (Thai or English).",
        },
        stage: {
          type: "string",
          enum: ["Sandbox", "Validation Sprint", "Build Sprint", "Launch & Test"],
          description: "Classified Launch PAD 2.0 stage for this idea.",
        },
        stage_confidence: {
          type: "number",
          minimum: 0.0,
          maximum: 1.0,
          description:
            "Confidence level for the stage classification (0.0 = very uncertain, 1.0 = very confident).",
        },
        stage_reasoning: {
          type: "string",
          description:
            "Explanation for why this stage was assigned (2–4 sentences). Same language as idea.",
        },
        idea_type: {
          type: "string",
          enum: ["SaaS", "SI", "Hardware", "Platform", "Internal Tool", "Partnership"],
          description: "Classified idea/project type.",
        },
        idea_type_confidence: {
          type: "number",
          minimum: 0.0,
          maximum: 1.0,
          description: "Confidence level for the idea type classification.",
        },
        portfolio_matches: {
          type: "array",
          description: "Relevance of this idea to each AppliCAD product. Include ALL products.",
          items: {
            type: "object",
            required: ["product", "relevance", "reasoning"],
            properties: {
              product: {
                type: "string",
                enum: effectiveIds,
                description: "AppliCAD product ID.",
              },
              relevance: {
                type: "string",
                enum: ["High", "Medium", "Low"],
                description: "Relevance level to this product.",
              },
              reasoning: {
                type: "string",
                description: "Brief explanation of why this product is relevant (1–2 sentences).",
              },
            },
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: Math.max(1, effectiveIds.length),
        },
        feasibility: {
          type: "object",
          description: "5-dimension feasibility evaluation using 1–5 scoring scale.",
          required: [
            "strategic_fit",
            "market_potential",
            "technical_feasibility",
            "resource_requirement",
            "business_impact",
          ],
          properties: {
            strategic_fit: {
              type: "object",
              required: ["score", "reasoning"],
              properties: {
                score: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Strategic alignment score (1=poor, 5=excellent).",
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the strategic fit score.",
                },
              },
              additionalProperties: false,
            },
            market_potential: {
              type: "object",
              required: ["score", "reasoning"],
              properties: {
                score: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Market potential score (1=very small, 5=very large).",
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the market potential score.",
                },
              },
              additionalProperties: false,
            },
            technical_feasibility: {
              type: "object",
              required: ["score", "reasoning"],
              properties: {
                score: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Technical feasibility score (1=very hard, 5=very easy).",
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the technical feasibility score.",
                },
              },
              additionalProperties: false,
            },
            resource_requirement: {
              type: "object",
              required: ["score", "reasoning"],
              properties: {
                score: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Resource requirement score (1=very heavy, 5=very light).",
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the resource requirement score.",
                },
              },
              additionalProperties: false,
            },
            business_impact: {
              type: "object",
              required: ["score", "reasoning"],
              properties: {
                score: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Business impact score (1=minimal, 5=transformational).",
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the business impact score.",
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        recommended_action: {
          type: "string",
          enum: ["Go", "Conditional Go", "No Go"],
          description: "Overall recommendation for this idea.",
        },
        recommended_action_reasoning: {
          type: "string",
          description:
            "Explanation for the recommended action (2–4 sentences). Same language as idea.",
        },
      },
      additionalProperties: false,
    },
  };
}

export const ANALYZE_IDEA_TOOL_CHOICE = {
  type: "tool" as const,
  name: "analyze_idea" as const,
};
