/**
 * PipelineRouter — tRPC procedures for pipeline-tracking.
 *
 * Procedures:
 *   pipeline.getKanban        — Kanban board data (bd_reviewer+)
 *   pipeline.getStatusCard    — Single idea status card (authenticated)
 *   pipeline.trackByReference — Guest public tracking by reference number
 *
 * Ref: design/api-spec.md, design/components.md
 *
 * Task 4.1
 *
 * Rate limiting note:
 *   No tRPC-layer rate limiting middleware exists in this project yet.
 *   The spec calls for per-IP / per-user limits on these procedures
 *   (30 req/min for trackByReference, 60/120 req/min for authenticated procedures).
 *   AppError.rateLimitExceeded() is available in src/lib/errors/AppError.ts,
 *   but a middleware/adapter (e.g., upstash/ratelimit or similar) has not been
 *   wired into the tRPC context. Rate limiting should be added as a dedicated
 *   middleware when that infrastructure is set up.
 */

import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, roleProcedure } from "@/server/trpc";
import { AppError } from "@/lib/errors/AppError";
import { pipelineService } from "./service";
import {
  GetKanbanInputSchema,
  GetStatusCardInputSchema,
  TrackByReferenceInputSchema,
} from "./schemas";

export const pipelineRouter = router({
  /**
   * pipeline.getKanban
   *
   * Returns Kanban board data grouped by pipeline stage with per-column
   * cursor pagination and optional filters.
   *
   * Auth: roleProcedure('bd_reviewer') — bd_reviewer and admin (admin ranks higher
   * in ROLE_HIERARCHY, so hasRole check passes for both roles).
   */
  getKanban: roleProcedure("bd_reviewer")
    .input(GetKanbanInputSchema)
    .query(async ({ input }) => {
      try {
        return await pipelineService.getKanbanData(input);
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (err instanceof AppError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err.message,
            cause: err,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load Kanban data.",
          cause: AppError.internal("Failed to load Kanban data."),
        });
      }
    }),

  /**
   * pipeline.getStatusCard
   *
   * Returns full status card + stage timeline for a single idea.
   *
   * Auth: protectedProcedure — all authenticated internal users.
   */
  getStatusCard: protectedProcedure.input(GetStatusCardInputSchema).query(async ({ input }) => {
    try {
      return await pipelineService.getStatusCard(input);
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      if (err instanceof AppError) {
        // Map AppError status codes to appropriate tRPC error codes
        if (err.statusCode === 404) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: err.message,
            cause: err,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message,
          cause: err,
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to load status card.",
        cause: AppError.internal("Failed to load status card."),
      });
    }
  }),

  /**
   * pipeline.trackByReference
   *
   * Public guest tracking endpoint — no session required.
   * Returns privacy-safe GuestTrackingDTO (no reviewer PII, no submitter contact).
   *
   * Auth: publicProcedure — accessible without authentication.
   *
   * Rate limiting: Not yet implemented at the tRPC layer.
   * See file-level note above.
   */
  trackByReference: publicProcedure.input(TrackByReferenceInputSchema).query(async ({ input }) => {
    try {
      return await pipelineService.trackByReference(input);
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      if (err instanceof AppError) {
        if (err.statusCode === 404) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: err.message,
            cause: err,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message,
          cause: err,
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to track by reference number.",
        cause: AppError.internal("Failed to track by reference number."),
      });
    }
  }),
});
