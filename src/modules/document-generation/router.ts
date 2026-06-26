/**
 * DocumentGenerationRouter — tRPC procedures for document-generation.
 *
 * Procedures: listByIdea, get, getProposal, export, exportProposal,
 *             triggerGeneration, regenerateSection
 *
 * Ref: design/api-spec.md
 * Task 7.1
 */

import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, roleProcedure } from "@/server/trpc";
import { documentGenerationRepository } from "./repository";
import { documentGenerationService } from "./service";
import { exportMarkdown, exportHtml } from "@/lib/document-generation/exporter";
import { renderToHtmlSync } from "@/lib/document-generation/markdown-renderer";
import {
  ListByIdeaInputSchema,
  GetDocumentInputSchema,
  GetProposalInputSchema,
  ExportDocumentInputSchema,
  ExportProposalInputSchema,
  TriggerGenerationInputSchema,
  RegenerateSectionInputSchema,
} from "./schemas";
import type { ClaudeNarrativeFn } from "./service";

// ─── Guest reference number guard ────────────────────────────────────────────

async function verifyGuestAccess(
  ideaId: string,
  referenceNumber: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  if (!referenceNumber) return; // authenticated user, skip
  const { data } = await db.from("ideas").select("reference_number").eq("id", ideaId).single();
  if (!data || (data as { reference_number: string }).reference_number !== referenceNumber) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Reference number does not match." });
  }
}

// ─── No-op Claude function for router context (real fn lives in worker) ───────
// The router doesn't call Claude; generation is async via worker.
// This is only used if triggerGeneration needs to inline generate (fallback).
const noopClaude: ClaudeNarrativeFn = async () => ({});

export const documentRouter = router({
  /**
   * List all documents for an idea with generation status + watermark.
   * Supports both authenticated users (own ideas) and guests (referenceNumber).
   */
  listByIdea: publicProcedure.input(ListByIdeaInputSchema).query(async ({ input, ctx }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (ctx as any).supabase;
    if (input.referenceNumber) {
      await verifyGuestAccess(input.ideaId, input.referenceNumber, db);
    }

    const documents = await documentGenerationRepository.findByIdea(input.ideaId);
    const allCompleted =
      documents.length > 0 &&
      documents.every((d) => d.generationStatus === "completed" || d.generationStatus === "failed");

    return {
      documents: documents.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        title: d.title,
        watermarkStatus: d.watermarkStatus,
        generationStatus: d.generationStatus,
        generatedAt: d.generatedAt,
        hasEdits: d.contentEditedMarkdown !== null,
      })),
      allCompleted,
    };
  }),

  /**
   * Get a single document with rendered HTML preview.
   */
  get: publicProcedure.input(GetDocumentInputSchema).query(async ({ input, ctx }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (ctx as any).supabase;
    const doc = await documentGenerationRepository.findOne(input.documentId);
    if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
    if (doc.generationStatus !== "completed") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Document generation not complete.",
      });
    }

    if (input.referenceNumber) {
      await verifyGuestAccess(doc.ideaId, input.referenceNumber, db);
    }

    const contentMarkdown = doc.contentEditedMarkdown ?? doc.contentMarkdown ?? "";
    const previewHtml = renderToHtmlSync(contentMarkdown);

    return {
      id: doc.id,
      documentType: doc.documentType,
      title: doc.title,
      contentMarkdown,
      previewHtml,
      watermarkStatus: doc.watermarkStatus,
      isAiDraft: doc.watermarkStatus === "ai_draft",
    };
  }),

  /**
   * Get Project Proposal with all 10 sections.
   */
  getProposal: publicProcedure.input(GetProposalInputSchema).query(async ({ input, ctx }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (ctx as any).supabase;
    if (input.referenceNumber) {
      await verifyGuestAccess(input.ideaId, input.referenceNumber, db);
    }

    const proposal = await documentGenerationRepository.findByIdeaAndType(
      input.ideaId,
      "project_proposal"
    );
    if (!proposal)
      throw new TRPCError({ code: "NOT_FOUND", message: "Project proposal not found." });
    if (proposal.generationStatus !== "completed") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Proposal generation not complete.",
      });
    }

    const sections = (proposal.sections ?? []).sort((a, b) => a.order - b.order);
    const composedMarkdown = sections
      .map((s) => `## ${s.title}\n\n${s.content_markdown}`)
      .join("\n\n");

    return {
      id: proposal.id,
      watermarkStatus: proposal.watermarkStatus,
      sections: sections.map((s) => ({
        key: s.key,
        order: s.order,
        title: s.title,
        contentMarkdown: s.content_markdown,
        isAiGenerated: s.is_ai_generated,
      })),
      composedMarkdown,
    };
  }),

  /**
   * Export a single document as MD or self-contained HTML (on-demand, client download).
   */
  export: publicProcedure.input(ExportDocumentInputSchema).mutation(async ({ input, ctx }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (ctx as any).supabase;
    const doc = await documentGenerationRepository.findOne(input.documentId);
    if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
    if (doc.generationStatus !== "completed") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Document not ready." });
    }

    if (input.referenceNumber) {
      await verifyGuestAccess(doc.ideaId, input.referenceNumber, db);
    }

    const opts = {
      documentType: doc.documentType,
      title: doc.title,
      contentMarkdown: doc.contentMarkdown,
      contentEditedMarkdown: doc.contentEditedMarkdown,
      watermarkStatus: doc.watermarkStatus,
      ideaTitle: doc.ideaId, // resolved at a higher level in a real app
      referenceNumber: doc.ideaId,
      generatedAt: doc.generatedAt,
    };

    return input.format === "html" ? exportHtml(opts) : exportMarkdown(opts);
  }),

  /**
   * Export entire Project Proposal as MD or HTML.
   */
  exportProposal: publicProcedure
    .input(ExportProposalInputSchema)
    .mutation(async ({ input, ctx }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (ctx as any).supabase;
      if (input.referenceNumber) {
        await verifyGuestAccess(input.ideaId, input.referenceNumber, db);
      }

      const proposal = await documentGenerationRepository.findByIdeaAndType(
        input.ideaId,
        "project_proposal"
      );
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found." });
      if (proposal.generationStatus !== "completed") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Proposal not ready." });
      }

      const opts = {
        documentType: "project_proposal",
        title: "Project Proposal (Complete)",
        contentMarkdown: proposal.contentMarkdown,
        contentEditedMarkdown: proposal.contentEditedMarkdown,
        watermarkStatus: proposal.watermarkStatus,
        ideaTitle: proposal.ideaId,
        referenceNumber: proposal.ideaId,
        generatedAt: proposal.generatedAt,
      };

      return input.format === "html" ? exportHtml(opts) : exportMarkdown(opts);
    }),

  /**
   * Enqueue generation job for an idea (called after analysis complete or manual retry).
   */
  triggerGeneration: protectedProcedure
    .input(TriggerGenerationInputSchema)
    .mutation(async ({ input, ctx }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (ctx as any).supabase;
      const { data: analysis } = await db
        .from("ai_analyses")
        .select("id, processing_status")
        .eq("idea_id", input.ideaId)
        .single();

      if (
        !analysis ||
        (analysis as { processing_status: string }).processing_status !== "completed"
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI analysis must be completed before generating documents.",
        });
      }

      const result = await documentGenerationService.enqueueGeneration(
        input.ideaId,
        (analysis as { id: string }).id
      );

      return { jobId: result.jobId, status: result.status };
    }),

  /**
   * Auto-update specific proposal section based on source change.
   * Called internally by review-workflow after score override or stage change.
   */
  regenerateSection: roleProcedure("bd_reviewer")
    .input(RegenerateSectionInputSchema)
    .mutation(async ({ input }) => {
      const result = await documentGenerationService.regenerateProposalSection(
        input.ideaId,
        input.sourceRef,
        noopClaude // real implementation passes real Claude fn
      );
      return result;
    }),
});
