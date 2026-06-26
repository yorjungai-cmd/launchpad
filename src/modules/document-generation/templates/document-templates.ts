/**
 * Document Templates — structure definitions for each document type.
 *
 * Each template defines: sections (ordered), which sections need Claude narrative,
 * and placeholder text for deterministic (non-AI) sections.
 *
 * Document titles, section headings, and deterministic content are authored in
 * Thai — Launch PAD documents are produced in Thai (per product requirement).
 * The `titleKey` field name is retained for compatibility, but values are the
 * Thai display strings used directly in the generated markdown / UI (server-side
 * composition does not run i18n resolution).
 *
 * Ref: design/components.md — Component 3: DocumentTemplateRegistry
 * Task 3.1
 */

import type { DocumentType, StageDisplay } from "../types";

export interface TemplateSection {
  key: string;
  order: number;
  titleKey: string; // Thai display title (used directly in markdown)
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
  titleKey: "รายงานความเป็นไปได้ (Feasibility Report)",
  sections: [
    {
      key: "executive_summary",
      order: 1,
      titleKey: "บทสรุปผู้บริหาร",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "feasibility_scores",
      order: 2,
      titleKey: "คะแนนความเป็นไปได้",
      needsNarrative: false,
      sourceRef: "ai_analysis.feasibility",
      placeholderFn: (d) =>
        `| มิติ | คะแนน | ระดับ | เหตุผล |\n|---|---|---|---|\n` +
        scoreRow("ความสอดคล้องเชิงกลยุทธ์", d.strategicFitScore, d.strategicFitReasoning) +
        "\n" +
        scoreRow("ศักยภาพตลาด", d.marketPotentialScore, d.marketPotentialReasoning) +
        "\n" +
        scoreRow(
          "ความเป็นไปได้ทางเทคนิค",
          d.technicalFeasibilityScore,
          d.technicalFeasibilityReasoning
        ) +
        "\n" +
        scoreRow(
          "ความต้องการทรัพยากร",
          d.resourceRequirementScore,
          d.resourceRequirementReasoning
        ) +
        "\n" +
        scoreRow("ผลกระทบทางธุรกิจ", d.businessImpactScore, d.businessImpactReasoning),
    },
    {
      key: "recommendation",
      order: 3,
      titleKey: "ข้อเสนอแนะ",
      needsNarrative: false,
      sourceRef: "ai_analysis.recommendation",
      placeholderFn: (d) =>
        `**ข้อเสนอแนะ**: ${d.recommendedAction ?? "รอพิจารณา"}\n\n${d.recommendedActionReasoning ?? ""}`,
    },
    {
      key: "portfolio_alignment",
      order: 4,
      titleKey: "ความเชื่อมโยงกับ Portfolio",
      needsNarrative: false,
      sourceRef: "ai_analysis.portfolio",
      placeholderFn: (d) => {
        if (!d.portfolioMatches.length) return "_ไม่พบความเชื่อมโยงกับ portfolio_";
        return d.portfolioMatches
          .map((m) => `- **${m.product}** (${m.relevance}): ${m.reasoning}`)
          .join("\n");
      },
    },
  ],
};

export const BMC_TEMPLATE: DocumentTemplate = {
  documentType: "bmc",
  titleKey: "Business Model Canvas (BMC)",
  sections: [
    {
      key: "bmc_canvas",
      order: 1,
      titleKey: "Business Model Canvas",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
  ],
};

export const LAUNCH_PAD_PLAN_TEMPLATE: DocumentTemplate = {
  documentType: "launch_pad_plan",
  titleKey: "แผน Launch PAD",
  sections: [
    {
      key: "validation_sprint",
      order: 1,
      titleKey: "Validation Sprint",
      needsNarrative: true,
      sourceRef: "ai_analysis.stage",
    },
    {
      key: "success_metrics",
      order: 2,
      titleKey: "ตัวชี้วัดความสำเร็จ",
      needsNarrative: true,
      sourceRef: "ai_analysis.stage",
    },
  ],
};

export const POC_PROPOSAL_TEMPLATE: DocumentTemplate = {
  documentType: "poc_proposal",
  titleKey: "ข้อเสนอ POC (Proof of Concept)",
  sections: [
    {
      key: "poc_objective",
      order: 1,
      titleKey: "วัตถุประสงค์ POC",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "poc_scope",
      order: 2,
      titleKey: "ขอบเขต POC",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "poc_timeline",
      order: 3,
      titleKey: "ไทม์ไลน์ POC",
      needsNarrative: true,
      sourceRef: "ai_analysis.stage",
    },
  ],
};

export const PROJECT_REQUIREMENTS_TEMPLATE: DocumentTemplate = {
  documentType: "project_requirements",
  titleKey: "เอกสารข้อกำหนดโครงการ (Requirements)",
  sections: [
    {
      key: "functional_requirements",
      order: 1,
      titleKey: "ความต้องการเชิงฟังก์ชัน (Functional Requirements)",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "non_functional_requirements",
      order: 2,
      titleKey: "ความต้องการที่ไม่ใช่ฟังก์ชัน (Non-Functional Requirements)",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
  ],
};

export const ACTION_PLAN_TEMPLATE: DocumentTemplate = {
  documentType: "action_plan",
  titleKey: "แผนปฏิบัติการ (Action Plan)",
  sections: [
    {
      key: "milestones",
      order: 1,
      titleKey: "หมุดหมายสำคัญ (Milestones)",
      needsNarrative: true,
      sourceRef: "ai_analysis.stage",
    },
    {
      key: "tasks_owners",
      order: 2,
      titleKey: "งานและผู้รับผิดชอบ",
      needsNarrative: true,
      sourceRef: "ai_analysis.stage",
    },
  ],
};

export const RESOURCE_PLAN_TEMPLATE: DocumentTemplate = {
  documentType: "resource_plan",
  titleKey: "แผนทรัพยากร (Resource Plan)",
  sections: [
    {
      key: "resource_requirements",
      order: 1,
      titleKey: "ความต้องการทรัพยากร",
      needsNarrative: true,
      sourceRef: "ai_analysis.feasibility",
    },
    {
      key: "budget_estimate",
      order: 2,
      titleKey: "ประมาณการงบประมาณ",
      needsNarrative: true,
      sourceRef: "ai_analysis.feasibility",
    },
  ],
};

export const GTM_SUMMARY_TEMPLATE: DocumentTemplate = {
  documentType: "gtm_summary",
  titleKey: "สรุปแผน Go-to-Market (GTM)",
  sections: [
    {
      key: "target_market",
      order: 1,
      titleKey: "ตลาดเป้าหมาย",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "go_to_market_strategy",
      order: 2,
      titleKey: "กลยุทธ์ Go-to-Market",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "launch_metrics",
      order: 3,
      titleKey: "ตัวชี้วัดการเปิดตัว",
      needsNarrative: true,
      sourceRef: "ai_analysis.feasibility",
    },
  ],
};

export const EXECUTIVE_PRESENTATION_TEMPLATE: DocumentTemplate = {
  documentType: "executive_presentation",
  titleKey: "สรุปสำหรับผู้บริหาร (Executive Presentation)",
  sections: [
    {
      key: "executive_overview",
      order: 1,
      titleKey: "ภาพรวมสำหรับผู้บริหาร",
      needsNarrative: true,
      sourceRef: "ai_analysis.summary",
    },
    {
      key: "key_metrics",
      order: 2,
      titleKey: "ตัวชี้วัดสำคัญ",
      needsNarrative: false,
      sourceRef: "ai_analysis.feasibility",
      placeholderFn: (d) =>
        `| ตัวชี้วัด | ค่า |\n|---|---|\n` +
        `| ข้อเสนอแนะ | ${d.recommendedAction ?? "N/A"} |\n` +
        `| Stage | ${d.stage} |\n` +
        `| ประเภท Idea | ${d.ideaType} |`,
    },
  ],
};

export const STAGE_GATE_GUIDE_TEMPLATE: DocumentTemplate = {
  documentType: "stage_gate_guide",
  titleKey: "คู่มือประเมิน Stage Gate",
  sections: [
    {
      key: "gate_overview",
      order: 1,
      titleKey: "ภาพรวม Stage Gate",
      needsNarrative: false,
      sourceRef: "ai_analysis.stage",
      placeholderFn: (d) =>
        `**Stage ปัจจุบัน**: ${d.stage}\n**ประเภท Idea**: ${d.ideaType}\n\n` +
        `_เกณฑ์ Stage gate สร้างขึ้นตามประเภท idea และ stage ปัจจุบัน_`,
    },
    {
      key: "gate_criteria",
      order: 2,
      titleKey: "เกณฑ์ผ่าน Gate",
      needsNarrative: false,
      sourceRef: "ai_analysis.stage",
    },
  ],
};
