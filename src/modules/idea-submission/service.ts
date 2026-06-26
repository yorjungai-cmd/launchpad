/**
 * IdeaSubmissionService — orchestrates idea submission and retrieval.
 * Ref: design.md — Architecture
 *
 * Task 3.4
 */

import { TRPCError } from "@trpc/server";
import { AppError } from "@/lib/errors/AppError";
import type { Context } from "@/server/context";
import { ideaRepository } from "./repository";
import { notificationService } from "@/modules/notification/service";
import type { SubmitIdeaInput, TrackIdeaInput } from "./schemas";

// ─── Result types ─────────────────────────────────────────────────────────────

export interface SubmitIdeaResult {
  ideaId: string;
  referenceNumber: string;
  analysisStatus: "pending";
}

export interface IdeaStatusResult {
  ideaId: string;
  referenceNumber: string;
  analysisStatus: string;
  currentStage: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class IdeaSubmissionService {
  /**
   * Create a new idea row.
   *
   * For text inputType: extractedText is set from rawContent if not provided.
   * For file/url inputType: extractedText should be pre-populated by the caller
   * (via extractFile / fetchUrl) before calling submit.
   */
  async submitIdea(input: SubmitIdeaInput, ctx: Context): Promise<SubmitIdeaResult> {
    // Determine extractedText
    let extractedText = input.extractedText ?? null;

    if (input.inputType === "text" && !extractedText && input.rawContent) {
      extractedText = input.rawContent;
    }

    // Map input → IdeaInsert (without reference_number — repo generates it)
    const ideaInsert = {
      title: input.title,
      submitter_name: input.submitterName,
      submitter_email: input.submitterEmail,
      submitter_type: input.submitterType,
      user_id: ctx.user?.id ?? null,
      input_type: input.inputType,
      raw_content: input.rawContent ?? null,
      file_url: input.fileStoragePath ?? null,
      file_original_name: input.fileOriginalName ?? null,
      source_url: input.sourceUrl ?? null,
      extracted_text: extractedText,
      analysis_status: "pending" as const,
      current_stage: "sandbox" as const,
    };

    const idea = await ideaRepository.createIdea(ideaInsert, ctx.db);

    // Fire-and-forget notifications (non-blocking)
    notificationService.notifyIdeaReceived({
      id: idea.id,
      title: input.title,
      referenceNumber: idea.reference_number,
      submitterEmail: input.submitterEmail,
      submitterName: input.submitterName,
      submitterUserId: ctx.user?.id ?? null,
    });

    notificationService.notifyBDNewIdea({
      id: idea.id,
      title: input.title,
      referenceNumber: idea.reference_number,
      submitterName: input.submitterName,
      submitterType: input.submitterType,
    });

    // Fire-and-forget AI analysis does NOT work on Vercel serverless — the
    // function is killed once the response is sent. Instead, the analysis is
    // triggered explicitly via the "Run AI" button on the /ideas page, OR
    // could be run by a cron/queue worker. We intentionally do NOT await here
    // to keep submission fast; the idea is created with analysis_status=pending
    // and BD/Admin can trigger analysis from the Ideas page.

    return {
      ideaId: idea.id,
      referenceNumber: idea.reference_number,
      analysisStatus: "pending",
    };
  }

  /**
   * Retrieve the current status of an idea.
   *
   * - Authenticated callers can look up by ideaId.
   * - Guest callers must supply referenceNumber + email.
   */
  async getIdeaStatus(input: TrackIdeaInput, ctx: Context): Promise<IdeaStatusResult> {
    let idea = null;

    if ("ideaId" in input) {
      idea = await ideaRepository.getIdeaById(input.ideaId, ctx.db);
    } else {
      idea = await ideaRepository.getIdeaByRefNum(input.referenceNumber, input.email, ctx.db);
    }

    if (!idea) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Idea not found.",
        cause: AppError.notFound("Idea not found."),
      });
    }

    return {
      ideaId: idea.id,
      referenceNumber: idea.reference_number,
      analysisStatus: idea.analysis_status,
      currentStage: idea.current_stage,
      createdAt: idea.created_at,
      updatedAt: idea.updated_at,
    };
  }
}

/** Singleton */
export const ideaSubmissionService = new IdeaSubmissionService();
