/**
 * DocumentTemplateRegistry — public API for document templates and stage gate metrics.
 *
 * Ref: design/components.md — Component 3
 * Task 3.1, 3.2
 */

import type { DocumentType, StageDisplay } from "../types";
import {
  FEASIBILITY_REPORT_TEMPLATE,
  BMC_TEMPLATE,
  LAUNCH_PAD_PLAN_TEMPLATE,
  POC_PROPOSAL_TEMPLATE,
  PROJECT_REQUIREMENTS_TEMPLATE,
  ACTION_PLAN_TEMPLATE,
  RESOURCE_PLAN_TEMPLATE,
  GTM_SUMMARY_TEMPLATE,
  EXECUTIVE_PRESENTATION_TEMPLATE,
  STAGE_GATE_GUIDE_TEMPLATE,
} from "./document-templates";

export type { DocumentTemplate, TemplateSection, TemplateData } from "./document-templates";
export { getStageGateMetrics } from "./stage-gate-metrics";
export type { StageGateMetrics, GateCriteria } from "./stage-gate-metrics";

// ─── Template map ─────────────────────────────────────────────────────────────

const TEMPLATE_MAP: Record<DocumentType, ReturnType<typeof Object.freeze>> = {
  feasibility_report: FEASIBILITY_REPORT_TEMPLATE,
  bmc: BMC_TEMPLATE,
  launch_pad_plan: LAUNCH_PAD_PLAN_TEMPLATE,
  poc_proposal: POC_PROPOSAL_TEMPLATE,
  stage_gate_guide: STAGE_GATE_GUIDE_TEMPLATE,
  project_requirements: PROJECT_REQUIREMENTS_TEMPLATE,
  action_plan: ACTION_PLAN_TEMPLATE,
  resource_plan: RESOURCE_PLAN_TEMPLATE,
  gtm_summary: GTM_SUMMARY_TEMPLATE,
  executive_presentation: EXECUTIVE_PRESENTATION_TEMPLATE,
  project_proposal: FEASIBILITY_REPORT_TEMPLATE, // proposal uses its own compose logic
};

/** Returns the template for a document type */
export function getTemplate(documentType: DocumentType) {
  return TEMPLATE_MAP[documentType];
}

// ─── Document set per stage ───────────────────────────────────────────────────
// Ref: design/data-model.md — Business Rules (US-11)

/** Document types always generated for every idea */
const MANDATORY_DOCUMENT_TYPES: DocumentType[] = [
  "feasibility_report",
  "stage_gate_guide",
  "project_proposal",
];

const STAGE_EXTRA_TYPES: Record<StageDisplay, DocumentType[]> = {
  Sandbox: ["bmc", "launch_pad_plan", "poc_proposal"],
  "Validation Sprint": ["bmc", "launch_pad_plan", "poc_proposal"],
  "Build Sprint": ["project_requirements", "action_plan", "resource_plan"],
  "Launch & Test": ["gtm_summary", "executive_presentation"],
};

/**
 * Returns the complete set of document types for a given stage.
 * Always includes mandatory types + stage-specific extras.
 * No duplicates.
 */
export function resolveDocumentTypesForStage(stage: StageDisplay | string | null): DocumentType[] {
  const extras: DocumentType[] =
    stage && STAGE_EXTRA_TYPES[stage as StageDisplay]
      ? (STAGE_EXTRA_TYPES[stage as StageDisplay] as DocumentType[])
      : [];
  const all: DocumentType[] = MANDATORY_DOCUMENT_TYPES.concat(extras);
  // Deduplicate preserving order
  const seen = new Map<DocumentType, true>();
  const result: DocumentType[] = [];
  for (const item of all) {
    if (!seen.has(item)) {
      seen.set(item, true);
      result.push(item);
    }
  }
  return result;
}

/** Exported constant for reference in tests and worker */
export const DOCUMENT_TYPES_BY_STAGE = STAGE_EXTRA_TYPES;
