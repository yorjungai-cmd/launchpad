/**
 * AIAnalysisRouter — tRPC router for the ai-analysis module.
 *
 * Procedures:
 *   analysis.getByIdeaId       — public/protected; poll analysis result
 *   analysis.overrideScore     — roleProcedure('bd_reviewer'); BD override + audit
 *   analysis.triggerReanalysis — roleProcedure('admin'); re-run pipeline
 *   analysis.listPending       — roleProcedure('bd_reviewer'); paginated review queue
 *
 * Ref: design/api-spec.md — Procedures
 *      design/components.md — AIAnalysisRouter
 *
 * Task 3.3
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, roleProcedure } from "@/server/trpc";
import { aiAnalysisService } from "./service";
import { OverrideScoreFieldSchema, ScoreOverrideEntrySchema } from "./schemas";

export const analysisRouter = router({
  // ─── getByIdeaId ────────────────────────────────────────────────────────────

  /**
   * Poll the AI analysis result for a given idea.
   * - Authenticated users can query by ideaId directly.
   * - Guests must supply a referenceNumber (authorization handled by idea-submission unit).
   */
  getByIdeaId: publicProcedure
    .input(
      z.object({
        ideaId: z.string().uuid(),
        referenceNumber: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // If no session and no referenceNumber, reject immediately
      if (!ctx.session && !input.referenceNumber) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "Guest access requires a reference number. Please sign in or provide your reference number.",
        });
      }

      const analysis = await aiAnalysisService.getAnalysisResult(input.ideaId);
      if (!analysis) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Analysis not found for idea ${input.ideaId}`,
        });
      }

      return analysis;
    }),

  // ─── overrideScore ──────────────────────────────────────────────────────────

  /**
   * BD Reviewer override a feasibility score field.
   * Records an append-only audit trail entry in score_overrides.
   */
  overrideScore: roleProcedure("bd_reviewer")
    .input(
      z.object({
        ideaId: z.string().uuid(),
        field: OverrideScoreFieldSchema,
        newValue: z.number().int().min(1).max(5),
        comment: z.string().min(1).max(500),
      })
    )
    .output(
      z.object({
        success: z.literal(true),
        updatedField: z.string(),
        newValue: z.number(),
        overrideEntry: ScoreOverrideEntrySchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const reviewerName =
        (ctx.user.user_metadata?.["full_name"] as string | undefined) ??
        ctx.user.email ??
        ctx.user.id;

      const updatedAnalysis = await aiAnalysisService.overrideScore({
        ideaId: input.ideaId,
        field: input.field,
        newValue: input.newValue,
        comment: input.comment,
        reviewerId: ctx.user.id,
        reviewerName,
      });

      // The most recent entry is the last one in the array
      const overrideEntry =
        updatedAnalysis.scoreOverrides[updatedAnalysis.scoreOverrides.length - 1];

      if (!overrideEntry) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Override entry was not recorded.",
        });
      }

      return {
        success: true as const,
        updatedField: input.field,
        newValue: input.newValue,
        overrideEntry,
      };
    }),

  // ─── triggerReanalysis ──────────────────────────────────────────────────────

  /**
   * Admin re-triggers the AI analysis pipeline for an idea.
   */
  triggerReanalysis: roleProcedure("admin")
    .input(
      z.object({
        ideaId: z.string().uuid(),
        reason: z.string().optional(),
      })
    )
    .output(
      z.object({
        success: z.literal(true),
        message: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await aiAnalysisService.analyzeIdea(input.ideaId);

      return {
        success: true as const,
        message: "Re-analysis queued successfully",
      };
    }),

  // ─── triggerAnalysis ─────────────────────────────────────────────────────────

  /**
   * BD Reviewer or Admin manually triggers inline AI analysis for an idea.
   * Used when an idea was submitted before the inline worker was deployed,
   * or when analysis failed and needs a retry.
   */
  triggerAnalysis: roleProcedure("bd_reviewer")
    .input(z.object({ ideaId: z.string().uuid() }))
    .output(z.object({ success: z.literal(true), message: z.string() }))
    .mutation(async ({ input }) => {
      const { runInlineAnalysis } = await import("@/lib/claude/inline-worker");
      // fire-and-forget — response returns immediately
      void runInlineAnalysis(input.ideaId);
      return { success: true as const, message: "AI analysis started" };
    }),

  // ─── listPending ────────────────────────────────────────────────────────────

  /**
   * Paginated list of completed analyses waiting for BD review.
   * Cursor-based pagination using ideaId as cursor.
   */
  listPending: roleProcedure("bd_reviewer")
    .input(
      z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
        stage: z.enum(["Sandbox", "Validation Sprint", "Build Sprint", "Launch & Test"]).optional(),
        recommendedAction: z.enum(["Go", "Conditional Go", "No Go"]).optional(),
      })
    )
    .output(
      z.object({
        items: z.array(
          z.object({
            ideaId: z.string(),
            ideaTitle: z.string(),
            stage: z.string().nullable(),
            ideaType: z.string().nullable(),
            recommendedAction: z.string().nullable(),
            completedAt: z.string().nullable(),
            hasOverrides: z.boolean(),
          })
        ),
        nextCursor: z.string().nullable(),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = ctx.db as any;

      // Build base query: join ai_analyses with ideas for title
      let query = db
        .from("ai_analyses")
        .select(
          `
          idea_id,
          stage,
          idea_type,
          recommended_action,
          score_overrides,
          completed_at,
          ideas!inner(title)
          `,
          { count: "exact" }
        )
        .eq("processing_status", "completed")
        .order("completed_at", { ascending: false })
        .limit(input.limit + 1); // fetch one extra to determine nextCursor

      // Apply optional filters
      if (input.stage) {
        query = query.eq("stage", input.stage);
      }
      if (input.recommendedAction) {
        query = query.eq("recommended_action", input.recommendedAction);
      }

      // Apply cursor pagination (cursor = idea_id from previous page's last item)
      if (input.cursor) {
        // Get completed_at of the cursor row to paginate by timestamp
        const { data: cursorRow } = await db
          .from("ai_analyses")
          .select("completed_at")
          .eq("idea_id", input.cursor)
          .single();

        if (cursorRow?.completed_at) {
          query = query.lt("completed_at", cursorRow.completed_at);
        }
      }

      const { data, error, count } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to list pending analyses: ${error.message}`,
        });
      }

      const rows = (data ?? []) as Array<{
        idea_id: string;
        stage: string | null;
        idea_type: string | null;
        recommended_action: string | null;
        score_overrides: unknown[] | null;
        completed_at: string | null;
        ideas: { title: string } | null;
      }>;

      // Determine if there's a next page
      const hasNextPage = rows.length > input.limit;
      const pageRows = hasNextPage ? rows.slice(0, input.limit) : rows;
      const nextCursor =
        hasNextPage && pageRows.length > 0 ? pageRows[pageRows.length - 1]!.idea_id : null;

      const items = pageRows.map((row) => ({
        ideaId: row.idea_id,
        ideaTitle: row.ideas?.title ?? "Untitled",
        stage: row.stage,
        ideaType: row.idea_type,
        recommendedAction: row.recommended_action,
        completedAt: row.completed_at,
        hasOverrides: Array.isArray(row.score_overrides) && row.score_overrides.length > 0,
      }));

      return {
        items,
        nextCursor,
        total: count ?? 0,
      };
    }),
});
