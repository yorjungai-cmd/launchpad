/**
 * Email template registry — maps NotificationType to its render function.
 *
 * Task 3.1
 */

import { NotificationType, type TemplateRenderResult } from "../schemas";
import { renderIdeaReceived, type IdeaReceivedData } from "./idea-received";
import { renderAnalysisComplete, type AnalysisCompleteData } from "./analysis-complete";
import { renderDocumentsReady, type DocumentsReadyData } from "./documents-ready";
import { renderStageChanged, type StageChangedData } from "./stage-changed";
import { renderIdeaApproved, type IdeaApprovedData } from "./idea-approved";
import { renderIdeaRejected, type IdeaRejectedData } from "./idea-rejected";
import { renderBDNewIdea, type BDNewIdeaData } from "./bd-new-idea";

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { renderIdeaReceived, type IdeaReceivedData } from "./idea-received";
export { renderAnalysisComplete, type AnalysisCompleteData } from "./analysis-complete";
export { renderDocumentsReady, type DocumentsReadyData } from "./documents-ready";
export { renderStageChanged, type StageChangedData } from "./stage-changed";
export { renderIdeaApproved, type IdeaApprovedData } from "./idea-approved";
export { renderIdeaRejected, type IdeaRejectedData } from "./idea-rejected";
export { renderBDNewIdea, type BDNewIdeaData } from "./bd-new-idea";
export { wrapInLayout } from "./base-layout";

// ─── Template data union (for type-safe lookup) ──────────────────────────────

export type TemplateDataMap = {
  [NotificationType.IDEA_RECEIVED]: IdeaReceivedData;
  [NotificationType.ANALYSIS_COMPLETE]: AnalysisCompleteData;
  [NotificationType.DOCUMENTS_READY]: DocumentsReadyData;
  [NotificationType.STAGE_CHANGED]: StageChangedData;
  [NotificationType.IDEA_APPROVED]: IdeaApprovedData;
  [NotificationType.IDEA_REJECTED]: IdeaRejectedData;
  [NotificationType.BD_NEW_IDEA]: BDNewIdeaData;
};

// ─── Render function type ─────────────────────────────────────────────────────

type TemplateRenderer<T> = (data: T, locale: "th" | "en") => TemplateRenderResult;

// ─── Template map ─────────────────────────────────────────────────────────────

const TEMPLATE_MAP: {
  [K in NotificationType]: TemplateRenderer<TemplateDataMap[K]>;
} = {
  [NotificationType.IDEA_RECEIVED]: renderIdeaReceived,
  [NotificationType.ANALYSIS_COMPLETE]: renderAnalysisComplete,
  [NotificationType.DOCUMENTS_READY]: renderDocumentsReady,
  [NotificationType.STAGE_CHANGED]: renderStageChanged,
  [NotificationType.IDEA_APPROVED]: renderIdeaApproved,
  [NotificationType.IDEA_REJECTED]: renderIdeaRejected,
  [NotificationType.BD_NEW_IDEA]: renderBDNewIdea,
};

/**
 * Lookup template renderer by NotificationType.
 * Returns a typed render function for the given type.
 */
export function getTemplateByType<T extends NotificationType>(
  type: T
): TemplateRenderer<TemplateDataMap[T]> {
  return TEMPLATE_MAP[type];
}
