/**
 * DashboardRouter — tRPC router for the dashboard-analytics module.
 *
 * Exposes 4 procedures for aggregated pipeline metrics and report export.
 * Role guards are enforced via `roleProcedure` middleware — no if-else in handlers.
 *
 * Role × Procedure mapping (AppRole hierarchy: guest < internal_submitter < bd_reviewer < admin):
 *
 *   getExecutiveSummary   → roleProcedure('bd_reviewer')  [bd_reviewer + admin pass]
 *   getBDTeamView         → roleProcedure('bd_reviewer')  [bd_reviewer + admin pass]
 *   getSourceAnalysis     → roleProcedure('admin')        [admin only]
 *   exportPipelineReport  → roleProcedure('bd_reviewer')  [bd_reviewer + admin pass]
 *
 * Note: The design spec defines a `bd_lead` role that maps to `admin` in the
 * concrete AppRole implementation (see src/lib/supabase/types.ts). Procedures
 * restricted to "admin + bd_lead" use roleProcedure('bd_reviewer') to include
 * all reviewer-level users; procedures restricted to "admin only" use
 * roleProcedure('admin').
 *
 * Ref:
 *   - design/api-spec.md  — tRPC Procedures, Role × Procedure Matrix
 *   - design/components.md — DashboardRouter (Component 1)
 *
 * Task 4.1
 */

import { TRPCError } from "@trpc/server";
import { router, roleProcedure } from "@/server/trpc";
import { dashboardService } from "./service";
import { DateRangeSchema, ExportReportSchema } from "./schemas";

export const dashboardRouter = router({
  /**
   * dashboard.getExecutiveSummary
   *
   * Returns high-level KPIs: total ideas, breakdown by stage, win/no-go stats,
   * and average time per stage. Intended for Admin and BD Lead dashboards.
   *
   * Role: bd_reviewer minimum (covers bd_reviewer + admin in the hierarchy)
   * Input: DateRangeSchema
   * Errors: FORBIDDEN (role), BAD_REQUEST (invalid date range), INTERNAL_SERVER_ERROR
   */
  getExecutiveSummary: roleProcedure("bd_reviewer")
    .input(DateRangeSchema)
    .query(async ({ input }) => {
      return dashboardService.getExecutiveSummary(input);
    }),

  /**
   * dashboard.getBDTeamView
   *
   * Returns pending review count and per-reviewer workload breakdown by stage.
   * Intended for BD Reviewer and BD Lead dashboards.
   *
   * Role: bd_reviewer minimum (covers bd_reviewer + admin)
   * Input: DateRangeSchema
   * Errors: FORBIDDEN (role), BAD_REQUEST (invalid date range), INTERNAL_SERVER_ERROR
   */
  getBDTeamView: roleProcedure("bd_reviewer")
    .input(DateRangeSchema)
    .query(async ({ input }) => {
      return dashboardService.getBDTeamView(input);
    }),

  /**
   * dashboard.getSourceAnalysis
   *
   * Returns idea source breakdown by submitter type with percentages.
   * Restricted to Admin only.
   *
   * Role: admin only
   * Input: DateRangeSchema
   * Errors: FORBIDDEN (role), BAD_REQUEST (invalid date range)
   */
  getSourceAnalysis: roleProcedure("admin")
    .input(DateRangeSchema)
    .query(async ({ input }) => {
      return dashboardService.getSourceAnalysis(input);
    }),

  /**
   * dashboard.exportPipelineReport
   *
   * Returns full structured data for client-side pipeline report generation
   * (Excel via xlsx or browser print/PDF). Enforces a 10,000-row cap on ideas.
   *
   * Role: bd_reviewer minimum (covers bd_reviewer + admin)
   * Input: ExportReportSchema (extends DateRangeSchema with format: 'excel' | 'print')
   * Errors: FORBIDDEN (role), BAD_REQUEST (invalid range/format), PAYLOAD_TOO_LARGE (>10 000 rows)
   */
  exportPipelineReport: roleProcedure("bd_reviewer")
    .input(ExportReportSchema)
    .query(async ({ input }) => {
      const reportData = await dashboardService.getPipelineReportData(input);

      // Enforce 10,000-row export cap (design/api-spec.md — exportPipelineReport errors)
      if (reportData.ideas.length > 10_000) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "Export exceeds 10,000 ideas. Please narrow the date range and try again.",
        });
      }

      return reportData;
    }),
});
