/**
 * Zod schemas for document-generation tRPC procedures.
 * Ref: design/api-spec.md
 * Task 7.1
 */
import { z } from "zod";

export const DocumentTypeSchema = z.enum([
  "feasibility_report",
  "bmc",
  "launch_pad_plan",
  "poc_proposal",
  "stage_gate_guide",
  "project_requirements",
  "action_plan",
  "resource_plan",
  "gtm_summary",
  "executive_presentation",
  "project_proposal",
]);

export const WatermarkStatusSchema = z.enum(["ai_draft", "bd_reviewed", "approved"]);

export const ExportFormatSchema = z.enum(["markdown", "html"]);

// ── Input schemas ─────────────────────────────────────────────────────────────

export const ListByIdeaInputSchema = z.object({
  ideaId: z.string().uuid(),
  referenceNumber: z.string().optional(),
});

export const GetDocumentInputSchema = z.object({
  documentId: z.string().uuid(),
  referenceNumber: z.string().optional(),
});

export const GetProposalInputSchema = z.object({
  ideaId: z.string().uuid(),
  referenceNumber: z.string().optional(),
});

export const ExportDocumentInputSchema = z.object({
  documentId: z.string().uuid(),
  format: ExportFormatSchema,
  referenceNumber: z.string().optional(),
});

export const ExportProposalInputSchema = z.object({
  ideaId: z.string().uuid(),
  format: ExportFormatSchema,
  referenceNumber: z.string().optional(),
});

export const TriggerGenerationInputSchema = z.object({
  ideaId: z.string().uuid(),
  /** Force regeneration even if a completed document set already exists. */
  force: z.boolean().optional(),
});

export const TriggerGenerationPublicInputSchema = z.object({
  ideaId: z.string().uuid(),
  referenceNumber: z.string().min(1).max(50),
  /** Force regeneration even if a completed document set already exists. */
  force: z.boolean().optional(),
});

export const RegenerateSectionInputSchema = z.object({
  ideaId: z.string().uuid(),
  sourceRef: z.string(),
});

// ── Output schemas ────────────────────────────────────────────────────────────

export const DocumentSummarySchema = z.object({
  id: z.string().uuid(),
  documentType: DocumentTypeSchema,
  title: z.string(),
  watermarkStatus: WatermarkStatusSchema,
  generationStatus: z.enum(["pending", "generating", "completed", "failed"]),
  generatedAt: z.string().nullable(),
  hasEdits: z.boolean(),
});

export const ExportResultSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  content: z.string(),
});
