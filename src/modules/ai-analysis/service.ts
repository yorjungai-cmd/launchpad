/**
 * AIAnalysisService — business logic for the AI analysis pipeline.
 *
 * Orchestrates idea analysis by:
 *   1. Creating an ai_analyses row (pending)
 *   2. Deduplication check for active jobs
 *   3. Inserting an analysis_jobs row
 *   4. Enqueueing the job to pgmq
 *   5. Exposing getAnalysisResult and overrideScore (stub)
 *
 * Ref: design/components.md — AIAnalysisService
 *      design/integration.md — Inter-Unit Communication, Supabase Queue
 *
 * Task 2.6
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import { AppError } from "@/lib/errors/AppError";
import { aiAnalysisRepository } from "./repository";
import type { AIAnalysis, OverrideScoreParams, ScoreOverrideEntry } from "./types";
const QUEUE_NAME = "ai_analysis_jobs";

export class AIAnalysisService {
  /**
   * Orchestrates the full analysis pipeline for an idea:
   * 1. Creates ai_analyses row (pending)
   * 2. Guards against duplicate active jobs
   * 3. Inserts analysis_jobs row (queued)
   * 4. Enqueues to pgmq
   * 5. Updates queue_message_id on analysis_jobs
   *
   * Non-blocking: returns void immediately after enqueuing.
   */
  async analyzeIdea(ideaId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServerSupabaseClient() as any;

    // Step 1: Create ai_analyses row with status=pending
    await aiAnalysisRepository.create(ideaId);

    // Step 2: Check for existing active job (deduplication guard)
    const { data: existingJobs, error: jobCheckError } = await db
      .from("analysis_jobs")
      .select("id, status")
      .eq("idea_id", ideaId)
      .in("status", ["queued", "processing"]);

    if (jobCheckError) {
      logger.error(
        { ideaId, error: jobCheckError.message },
        "AIAnalysisService: failed to check for existing analysis jobs"
      );
      // Continue — fail open rather than blocking the submission flow
    }

    if (existingJobs && existingJobs.length > 0) {
      logger.warn(
        { ideaId, existingJobCount: existingJobs.length },
        "AIAnalysisService: active analysis job already exists for idea — skipping enqueue"
      );
      return;
    }

    // Step 3: Insert analysis_jobs row with status='queued'
    const { data: jobRow, error: jobInsertError } = await db
      .from("analysis_jobs")
      .insert({
        idea_id: ideaId,
        status: "queued",
        enqueued_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobInsertError || !jobRow) {
      logger.error(
        { ideaId, error: jobInsertError?.message },
        "AIAnalysisService: failed to insert analysis_jobs row"
      );
      throw new Error(
        `Failed to create analysis job for idea ${ideaId}: ${jobInsertError?.message ?? "no row returned"}`
      );
    }

    const jobId = (jobRow as { id: string }).id;

    // Step 4: Enqueue to pgmq
    const { data: msgId, error: enqueueError } = await db.rpc("pgmq_send", {
      queue_name: QUEUE_NAME,
      msg: {
        ideaId,
        jobId,
        timestamp: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      logger.error(
        { ideaId, jobId, error: enqueueError.message },
        "AIAnalysisService: failed to enqueue pgmq message — idea submitted but analysis not queued"
      );
      // Do not throw — idea submission already succeeded; cron fallback will handle retry
      return;
    }

    // Step 5: Update analysis_jobs with queue_message_id
    if (msgId !== null && msgId !== undefined) {
      const { error: updateError } = await db
        .from("analysis_jobs")
        .update({ queue_message_id: msgId as number })
        .eq("id", jobId);

      if (updateError) {
        logger.warn(
          { ideaId, jobId, msgId, error: updateError.message },
          "AIAnalysisService: failed to update queue_message_id on analysis_jobs — non-critical"
        );
      }
    }

    logger.info({ ideaId, jobId, msgId }, "AIAnalysisService: idea enqueued for analysis");
  }

  /**
   * Returns the current analysis result for an idea.
   * Returns null if no analysis exists yet.
   */
  async getAnalysisResult(ideaId: string): Promise<AIAnalysis | null> {
    return aiAnalysisRepository.findByIdeaId(ideaId);
  }

  /**
   * Override a feasibility score (BD Reviewer action).
   *
   * Validates that analysis exists and is completed before overriding.
   * Builds an audit entry and delegates to the repository.
   */
  async overrideScore(params: OverrideScoreParams): Promise<AIAnalysis> {
    // Step 1: Fetch analysis — throw if not found
    const analysis = await aiAnalysisRepository.findByIdeaId(params.ideaId);
    if (!analysis) {
      throw AppError.analysisNotFound(`Analysis not found for idea ${params.ideaId}`, {
        ideaId: params.ideaId,
      });
    }

    // Step 2: Validate status = 'completed'
    if (analysis.processingStatus !== "completed") {
      throw AppError.analysisNotCompleted(
        `Analysis for idea ${params.ideaId} is not completed (current status: ${analysis.processingStatus})`,
        { ideaId: params.ideaId, status: analysis.processingStatus }
      );
    }

    // Step 3: Validate newValue range (runtime check, also enforced by Zod in router)
    if (params.newValue < 1 || params.newValue > 5) {
      throw AppError.invalidScoreRange(`Score must be between 1 and 5, got ${params.newValue}`, {
        field: params.field,
        value: params.newValue,
      });
    }

    // Step 4: Get current score value for the field
    const fieldToScoreKey: Record<string, keyof typeof analysis> = {
      strategic_fit_score: "strategicFitScore",
      market_potential_score: "marketPotentialScore",
      technical_feasibility_score: "technicalFeasibilityScore",
      resource_requirement_score: "resourceRequirementScore",
      business_impact_score: "businessImpactScore",
    };
    const camelKey = fieldToScoreKey[params.field];
    const previousValue = camelKey ? (analysis[camelKey] as number | null) : null;

    // Step 5: Build audit entry
    const entry: ScoreOverrideEntry = {
      field: params.field,
      previous_value: previousValue ?? params.newValue, // fallback to newValue if current is null
      new_value: params.newValue,
      comment: params.comment,
      reviewer_id: params.reviewerId,
      reviewer_name: params.reviewerName,
      overridden_at: new Date().toISOString(),
    };

    logger.info(
      {
        ideaId: params.ideaId,
        field: params.field,
        newValue: params.newValue,
        reviewerId: params.reviewerId,
      },
      "AIAnalysisService: overriding score"
    );

    // Step 6: Delegate to repository
    return aiAnalysisRepository.overrideScore(params.ideaId, params.field, params.newValue, entry);
  }
}

/** Singleton — import this everywhere, do not instantiate directly */
export const aiAnalysisService = new AIAnalysisService();
