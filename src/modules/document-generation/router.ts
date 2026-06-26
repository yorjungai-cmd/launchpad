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
import { createAdminSupabaseClient } from "@/lib/supabase/server";
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
  TriggerGenerationPublicInputSchema,
  RegenerateSectionInputSchema,
} from "./schemas";
import type { ClaudeNarrativeFn } from "./service";

// ─── Guest reference number guard ────────────────────────────────────────────
// Uses the admin client: guests have no session, and ideas RLS would block an
// anon read of the reference number. The reference number itself is the secret
// that authorizes guest access, so this lookup is safe server-side.

async function verifyGuestAccess(ideaId: string, referenceNumber: string): Promise<void> {
  const db = createAdminSupabaseClient();
  const { data } = await db
    .from("ideas")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("reference_number")
    .eq("id", ideaId)
    .single();
  if (!data || (data as { reference_number: string }).reference_number !== referenceNumber) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Reference number does not match." });
  }
}

/**
 * Authorization guard for document read procedures.
 * Mirrors analysis.getByIdeaId: an authenticated session OR a matching
 * reference number is required. Data access uses the admin client (service
 * role), so this app-layer check is the security boundary.
 */
async function authorizeRead(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  ideaId: string,
  referenceNumber: string | undefined
): Promise<void> {
  if (!ctx.session && !referenceNumber) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in or provide a reference number to access documents.",
    });
  }
  if (referenceNumber) {
    await verifyGuestAccess(ideaId, referenceNumber);
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
    await authorizeRead(ctx, input.ideaId, input.referenceNumber);

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
    const doc = await documentGenerationRepository.findOne(input.documentId);
    if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
    if (doc.generationStatus !== "completed") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Document generation not complete.",
      });
    }

    await authorizeRead(ctx, doc.ideaId, input.referenceNumber);

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
    await authorizeRead(ctx, input.ideaId, input.referenceNumber);

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
    const doc = await documentGenerationRepository.findOne(input.documentId);
    if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
    if (doc.generationStatus !== "completed") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Document not ready." });
    }

    await authorizeRead(ctx, doc.ideaId, input.referenceNumber);

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
      await authorizeRead(ctx, input.ideaId, input.referenceNumber);

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
        title: "ข้อเสนอโครงการ (ฉบับสมบูรณ์)",
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
   * Generate the full document set for an idea (runs INLINE / awaited).
   *
   * Production runs on Vercel serverless where background work is killed once
   * the response is sent, so generation must complete within this request
   * (separate 60s budget from the analysis request). Called automatically by
   * the analysis UI once analysis completes, or manually as a retry.
   */
  triggerGeneration: protectedProcedure
    .input(TriggerGenerationInputSchema)
    .mutation(async ({ input }) => {
      const db = createAdminSupabaseClient();
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

      const { runInlineDocumentGeneration } =
        await import("@/lib/document-generation/inline-generate");
      const result = await runInlineDocumentGeneration(input.ideaId, { force: input.force });

      return { status: result };
    }),

  /**
   * Public (guest) variant of triggerGeneration — authorized by reference number.
   * Runs INLINE / awaited, same as the protected variant. Used by the guest
   * tracking page to generate documents if analysis is complete but none exist.
   */
  triggerGenerationPublic: publicProcedure
    .input(TriggerGenerationPublicInputSchema)
    .mutation(async ({ input }) => {
      const db = createAdminSupabaseClient();

      // Authorize: reference number must match the idea
      const { data: idea } = await db
        .from("ideas")
        .select("reference_number")
        .eq("id", input.ideaId)
        .single();
      if (
        !idea ||
        (idea as { reference_number: string }).reference_number !== input.referenceNumber
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Reference number does not match." });
      }

      // Analysis must be completed
      const { data: analysis } = await db
        .from("ai_analyses")
        .select("processing_status")
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

      const { runInlineDocumentGeneration } =
        await import("@/lib/document-generation/inline-generate");
      const result = await runInlineDocumentGeneration(input.ideaId, { force: input.force });

      return { status: result };
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
