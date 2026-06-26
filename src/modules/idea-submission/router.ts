/**
 * idea-submission tRPC router — all 5 procedures.
 * Ref: design/api-spec.md — tRPC Procedures
 *
 * Task 3.5
 */

import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "@/server/trpc";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/AppError";
import { extractFromFile, extractFromUrl } from "./extractor";
import { ideaRepository } from "./repository";
import { ideaSubmissionService } from "./service";
import {
  submitIdeaInput,
  extractFileInput,
  fetchUrlInput,
  trackIdeaInput,
  listMyIdeasInput,
} from "./schemas";

export const ideaRouter = router({
  /**
   * idea.submit — create a new idea (public: guest + authenticated)
   */
  submit: publicProcedure.input(submitIdeaInput).mutation(async ({ ctx, input }) => {
    return ideaSubmissionService.submitIdea(input, ctx);
  }),

  /**
   * idea.extractFile — server-side text extraction from Supabase Storage file
   */
  extractFile: publicProcedure.input(extractFileInput).mutation(async ({ input }) => {
    const supabase = createServerSupabaseClient();
    const result = await extractFromFile(input.storagePath, input.mimeType, supabase);

    if (result.status === "failed") {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: result.error ?? "File extraction failed.",
        cause: AppError.internal(result.error ?? "File extraction failed."),
      });
    }

    return {
      extractedText: result.text ?? "",
      charCount: result.charCount ?? 0,
      truncated: result.truncated ?? false,
    };
  }),

  /**
   * idea.fetchUrl — server-side URL content extraction
   */
  fetchUrl: publicProcedure.input(fetchUrlInput).mutation(async ({ input }) => {
    const result = await extractFromUrl(input.url);

    if (result.status === "failed") {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: result.error ?? "URL extraction failed.",
        cause: AppError.notFound(result.error ?? "URL extraction failed."),
      });
    }

    return {
      title: "", // extractFromUrl returns text content; title not available separately
      extractedText: result.text ?? "",
      charCount: result.charCount ?? 0,
    };
  }),

  /**
   * idea.getStatus — query idea status (public: guest by refNum+email, auth by ideaId)
   */
  getStatus: publicProcedure.input(trackIdeaInput).query(async ({ ctx, input }) => {
    return ideaSubmissionService.getIdeaStatus(input, ctx);
  }),

  /**
   * idea.listMine — list ideas submitted by the authenticated user
   */
  listMine: protectedProcedure.input(listMyIdeasInput).query(async ({ ctx, input }) => {
    const { items, nextCursor } = await ideaRepository.listIdeasByUser(ctx.user.id, ctx.db, input);

    return {
      items: items.map((idea) => ({
        ideaId: idea.id,
        referenceNumber: idea.reference_number,
        title: idea.title,
        analysisStatus: idea.analysis_status,
        currentStage: idea.current_stage,
        createdAt: idea.created_at,
      })),
      nextCursor,
    };
  }),
});
