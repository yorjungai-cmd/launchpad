/**
 * Domain types for the document-generation module.
 * Ref: design/data-model.md
 */

import type { WatermarkStatus } from "@/shared/enums";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type DocumentType =
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

export type DocGenerationStatus = "pending" | "generating" | "completed" | "failed";
export type JobStatus = "queued" | "processing" | "done" | "dead";

/** Maps to DB stage display strings */
export type StageDisplay = "Sandbox" | "Validation Sprint" | "Build Sprint" | "Launch & Test";

/** Maps to DB idea_type display strings */
export type IdeaTypeDisplay =
  | "SaaS"
  | "SI"
  | "Hardware"
  | "Platform"
  | "Internal Tool"
  | "Partnership";

export interface ProposalSection {
  key: string;
  order: number;
  title: string;
  content_markdown: string;
  source_ref: string | null;
  is_ai_generated: boolean;
  updated_at: string;
}

export interface OutputDocument {
  id: string;
  ideaId: string;
  analysisId: string;
  documentType: DocumentType;
  stageSnapshot: StageDisplay;
  title: string;
  contentMarkdown: string | null;
  contentEditedMarkdown: string | null;
  sections: ProposalSection[] | null;
  watermarkStatus: WatermarkStatus;
  generationStatus: DocGenerationStatus;
  lastError: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentJob {
  id: string;
  ideaId: string;
  analysisId: string;
  queueMessageId: number | null;
  status: JobStatus;
  attemptCount: number;
  lastError: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface UpsertDocumentParams {
  ideaId: string;
  analysisId: string;
  documentType: DocumentType;
  stageSnapshot: StageDisplay;
  title: string;
  contentMarkdown: string;
  sections?: ProposalSection[];
  watermarkStatus?: WatermarkStatus;
  generationStatus?: DocGenerationStatus;
}
