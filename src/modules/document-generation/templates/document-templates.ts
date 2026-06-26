/**
 * Document Templates — structure definitions for each document type.
 *
 * Each template defines: sections (ordered), which sections need Claude narrative,
 * and placeholder text for deterministic (non-AI) sections.
 *
 * Ref: design/components.md — Component 3: DocumentTemplateRegistry
 * Task 3.1
 */

import type { DocumentType, StageDisplay } from "../types";

export interface TemplateSection {
  key: string;
  order: number;
  titleKey: string; // i18n key
  needsNarrative: boolean; // true = call Claude for this section
  sourceRef: string | null; // for proposal section-addressable update
  placeholderFn?: (data: TemplateData) => string; // deterministic content builder
}

export interface DocumentTemplate {
  documentType: DocumentType;
  titleKey: string;
  sections: TemplateSection[];
}

export interface TemplateData {
  ideaTitle: string;
  stage: StageDisplay;
  ideaType: string;
  summary: string;
  strategicFitScore: number | null;
  marketPotentialScore: number | null;
  technicalFeasibilityScore: number | null;
  resourceRequirementScore: number | null;
  businessImpactScore: number | null;
  strategicFitReasoning: string | null;
  marketPotentialReasoning: string | null;
  technicalFeasibilityReasoning: string | null;
  resourceRequirementReasoning: string | null;
  businessImpactReasoning: string | null;
  recommendedAction: string | null;
  recommendedActionReasoning: string | null;
  portfolioMatches: Array<{ product: string; relevance: string; reasoning: string }>;
  referenceNumber: string;
  submitterName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreRow(label: string, score: number | null, reasoning: string | null): string {
  const stars = score ? "★".repeat(score) + "☆".repeat(5 - score) : "N/A";
  return `| ${label} | ${score ?? "N/A"}/5 | ${stars} | ${reasoning ?? "-"} |`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const FEASIBILITY_REPORT_TEMPLATE: DocumentTemplate = {
  documentType: "feasibility_report",
  titleKey: "documents.feasibilityReport.title",
  sections: [
    {
      key: "executive_summary",
      order: 1,
      titleKey: "documents.sections.executiveSummary",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "feasibility_scores",
      order: 2,
      titleKey: "documents.sections.feasibilityScores",
      needsNarrative: false,
      sourceRef: "ai_analysis.feasibility",
      placeholderFn: (d) =>
        `| Dimension | Score | Rating | Reasoning |\n|---|---|---|---|\n` +
        scoreRow("Strategic Fit", d.strategicFitScore, d.strategicFitReasoning) +
        "\n" +
        scoreRow("Market Potential", d.marketPotentialScore, d.marketPotentialReasoning) +
        "\n" +
        scoreRow(
          "Technical Feasibility",
          d.technicalFeasibilityScore,
          d.technicalFeasibilityReasoning
        ) +
        "\n" +
        scoreRow(
          "Resource Requirement",
          d.resourceRequirementScore,
          d.resourceRequirementReasoning
        ) +
        "\n" +
        scoreRow("Business Impact", d.businessImpactScore, d.businessImpactReasoning),
    },
    {
      key: "recommendation",
      order: 3,
      titleKey: "documents.sections.recommendation",
      needsNarrative: false,
      sourceRef: "ai_analysis.recommendation",
      placeholderFn: (d) =>
        `**Recommended Action**: ${d.recommendedAction ?? "Pending"}\n\n${d.recommendedActionReasoning ?? ""}`,
    },
    {
      key: "portfolio_alignment",
      order: 4,
      titleKey: "documents.sections.portfolioAlignment",
      needsNarrative: false,
      sourceRef: "ai_analysis.portfolio",
      placeholderFn: (d) => {
        if (!d.portfolioMatches.length) return "_No portfolio matches identified._";
        return d.portfolioMatches
          .map((m) => `- **${m.product}** (${m.relevance}): ${m.reasoning}`)
          .join("\n");
      },
    },
  ],
};

export const BMC_TEMPLATE: DocumentTemplate = {
  documentType: "bmc",
  titleKey: "documents.bmc.title",
  sections: [
    {
      key: "bmc_canvas",
      order: 1,
      titleKey: "documents.sections.bmcCanvas",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
  ],
};

export const LAUNCH_PAD_PLAN_TEMPLATE: DocumentTemplate = {
  documentType: "launch_pad_plan",
  titleKey: "documents.launchPadPlan.title",
  sections: [
    {
      key: "validation_sprint",
      order: 1,
      titleKey: "documents.sections.validationSprint",
      needsNarrative: true,
      sourceRef: "ai_analysis.stage",
    },
    {
      key: "success_metrics",
      order: 2,
      titleKey: "documents.sections.successMetrics",
      needsNarrative: true,
      sourceRef: "ai_analysis.stage",
    },
  ],
};

export const POC_PROPOSAL_TEMPLATE: DocumentTemplate = {
  documentType: "poc_proposal",
  titleKey: "documents.pocProposal.title",
  sections: [
    {
      key: "poc_objective",
      order: 1,
      titleKey: "documents.sections.pocObjective",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "poc_scope",
      order: 2,
      titleKey: "documents.sections.pocScope",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "poc_timeline",
      order: 3,
      titleKey: "documents.sections.pocTimeline",
      needsNarrative: true,
      sourceRef: "ai_analysis.stage",
    },
  ],
};

export const PROJECT_REQUIREMENTS_TEMPLATE: DocumentTemplate = {
  documentType: "project_requirements",
  titleKey: "documents.projectRequirements.title",
  sections: [
    {
      key: "functional_requirements",
      order: 1,
      titleKey: "documents.sections.functionalRequirements",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "non_functional_requirements",
      order: 2,
      titleKey: "documents.sections.nonFunctionalRequirements",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
  ],
};

export const ACTION_PLAN_TEMPLATE: DocumentTemplate = {
  documentType: "action_plan",
  titleKey: "documents.actionPlan.title",
  sections: [
    {
      key: "milestones",
      order: 1,
      titleKey: "documents.sections.milestones",
      needsNarrative: true,
      sourceRef: "ai_analysis.stage",
    },
    {
      key: "tasks_owners",
      order: 2,
      titleKey: "documents.sections.tasksOwners",
      needsNarrative: true,
      sourceRef: "ai_analysis.stage",
    },
  ],
};

export const RESOURCE_PLAN_TEMPLATE: DocumentTemplate = {
  documentType: "resource_plan",
  titleKey: "documents.resourcePlan.title",
  sections: [
    {
      key: "resource_requirements",
      order: 1,
      titleKey: "documents.sections.resourceRequirements",
      needsNarrative: true,
      sourceRef: "ai_analysis.feasibility",
    },
    {
      key: "budget_estimate",
      order: 2,
      titleKey: "documents.sections.budgetEstimate",
      needsNarrative: true,
      sourceRef: "ai_analysis.feasibility",
    },
  ],
};

export const GTM_SUMMARY_TEMPLATE: DocumentTemplate = {
  documentType: "gtm_summary",
  titleKey: "documents.gtmSummary.title",
  sections: [
    {
      key: "target_market",
      order: 1,
      titleKey: "documents.sections.targetMarket",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "go_to_market_strategy",
      order: 2,
      titleKey: "documents.sections.goToMarketStrategy",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "launch_metrics",
      order: 3,
      titleKey: "documents.sections.launchMetrics",
      needsNarrative: true,
      sourceRef: "ai_analysis.feasibility",
    },
  ],
};

export const EXECUTIVE_PRESENTATION_TEMPLATE: DocumentTemplate = {
  documentType: "executive_presentation",
  titleKey: "documents.executivePresentation.title",
  sections: [
    {
      key: "executive_overview",
      order: 1,
      titleKey: "documents.sections.executiveOverview",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "key_metrics",
      order: 2,
      titleKey: "documents.sections.keyMetrics",
      needsNarrative: false,
      sourceRef: "ai_analysis.feasibility",
      placeholderFn: (d) =>
        `| Metric | Value |\n|---|---|\n` +
        `| Recommended Action | ${d.recommendedAction ?? "N/A"} |\n` +
        `| Stage | ${d.stage} |\n` +
        `| Idea Type | ${d.ideaType} |`,
    },
  ],
};

export const STAGE_GATE_GUIDE_TEMPLATE: DocumentTemplate = {
  documentType: "stage_gate_guide",
  titleKey: "documents.stageGateGuide.title",
  sections: [
    {
      key: "gate_overview",
      order: 1,
      titleKey: "documents.sections.gateOverview",
      needsNarrative: false,
      sourceRef: "ai_analysis.stage",
      placeholderFn: (d) =>
        `**Current Stage**: ${d.stage}\n**Idea Type**: ${d.ideaType}\n\n` +
        `_Stage gate metrics are generated based on idea type and current stage._`,
    },
    {
      key: "gate_criteria",
      order: 2,
      titleKey: "documents.sections.gateCriteria",
      needsNarrative: false,
      sourceRef: "ai_analysis.stage",
    },
  ],
};
