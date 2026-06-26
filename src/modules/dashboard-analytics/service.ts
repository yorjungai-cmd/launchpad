/**
 * DashboardService — business logic layer for the dashboard-analytics module.
 *
 * Consumes DashboardRepository (raw aggregates) and computes derived metrics
 * before returning typed response objects to the tRPC router.
 *
 * Design Decisions:
 *   1. Derived metrics (winRate, percentage) are computed here, not in the DB
 *      — easier to unit-test, keeps repository queries pure aggregations.
 *   2. pendingReviewCount queries output_documents directly (watermark_status =
 *      'AI Draft – Pending BD Review') — this is the canonical "ai_draft" signal
 *      that an idea is awaiting BD review (document-generation design/data-model.md).
 *   3. getPipelineReportData fans out to the other three service methods to
 *      guarantee a single fetch per aggregate, then merges with idea export rows.
 *   4. AppError from repository propagates unchanged; unexpected errors are
 *      wrapped in AppError.internal() and logged with Pino.
 *   5. Safe division: totalClosed === 0 → winRate = 0 (no divide-by-zero).
 *   6. Percentage: count / total * 100, rounded to 1 decimal; total === 0 → 0.
 *
 * Ref:
 *   - design/components.md — DashboardService (Component 2)
 *   - design/data-model.md — Business Rules §3 (winRate), §5 (export cap)
 *   - units/document-generation/design/data-model.md — watermark_status enum
 *
 * Task 3.1
 */

import logger from "@/lib/logger";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/AppError";
import { dashboardRepository } from "./repository";
import type {
  DateRangeInput,
  ExportReportInput,
  ExecutiveSummaryData,
  BDTeamViewData,
  SourceAnalysisData,
  PipelineReportData,
  SourceBreakdownRow,
} from "./schemas";

// ─── Internal raw-row shape (output_documents pending count) ─────────────────

/** Watermark DB enum value for "AI Draft" state (document-generation data-model) */
const WATERMARK_AI_DRAFT = "AI Draft – Pending BD Review";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface PendingCountRow {
  idea_id: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class DashboardService {
  // ── 1. getExecutiveSummary ───────────────────────────────────────────────

  /**
   * Aggregate metrics for the Executive Dashboard (admin, bd_lead).
   *
   * Calls:
   *   - repository.getIdeaCountByStage  → totalIdeas + ideaCountByStage
   *   - repository.getWinNoGoStats      → winNoGoStats (winRate already computed in repo)
   *   - repository.getAvgTimePerStage   → avgTimePerStage
   *
   * winRate safe-division is enforced inside repository.getWinNoGoStats (totalClosed=0 → 0).
   * The service passes through the winNoGoStats as-is.
   */
  async getExecutiveSummary(params: DateRangeInput): Promise<ExecutiveSummaryData> {
    const method = "DashboardService.getExecutiveSummary";
    logger.debug({ method, params }, "Fetching executive summary");

    try {
      const [ideaCountByStage, winNoGoStats, avgTimePerStage] = await Promise.all([
        dashboardRepository.getIdeaCountByStage(params),
        dashboardRepository.getWinNoGoStats(params),
        dashboardRepository.getAvgTimePerStage(params),
      ]);

      const totalIdeas = ideaCountByStage.reduce((sum, row) => sum + row.count, 0);

      const result: ExecutiveSummaryData = {
        totalIdeas,
        ideaCountByStage,
        winNoGoStats,
        avgTimePerStage,
        dateRange: { from: params.from, to: params.to },
      };

      logger.debug({ method, totalIdeas }, "Executive summary ready");
      return result;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method }, "Unexpected error in getExecutiveSummary");
      throw AppError.internal(`${method}: unexpected error`);
    }
  }

  // ── 2. getBDTeamView ─────────────────────────────────────────────────────

  /**
   * Workload view for BD Reviewer / BD Lead.
   *
   * pendingReviewCount = distinct ideas that have at least one output_document
   * with watermark_status = 'AI Draft – Pending BD Review' within the date range
   * (ideas.created_at filter to scope to the requested period).
   *
   * Why query output_documents here rather than from the repository:
   *   - watermark_status lives on output_documents (document-generation unit)
   *   - dashboard-analytics repository is scoped to ideas/stage_transitions/review_actions
   *   - service layer may cross-read other tables for computed counts (design/components.md §2)
   */
  async getBDTeamView(params: DateRangeInput): Promise<BDTeamViewData> {
    const method = "DashboardService.getBDTeamView";
    logger.debug({ method, params }, "Fetching BD team view");

    try {
      const [reviewerWorkload, pendingReviewCount] = await Promise.all([
        dashboardRepository.getBDWorkload(params),
        this._getPendingReviewCount(params),
      ]);

      const result: BDTeamViewData = {
        pendingReviewCount,
        reviewerWorkload,
        dateRange: { from: params.from, to: params.to },
      };

      logger.debug({ method, pendingReviewCount }, "BD team view ready");
      return result;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method }, "Unexpected error in getBDTeamView");
      throw AppError.internal(`${method}: unexpected error`);
    }
  }

  // ── 3. getSourceAnalysis ─────────────────────────────────────────────────

  /**
   * Source breakdown for the Analytics Dashboard (admin).
   *
   * Computes percentage = round(count / totalIdeas * 100, 1) per submitter type.
   * Guard: totalIdeas === 0 → percentage = 0 for all rows (no division-by-zero).
   */
  async getSourceAnalysis(params: DateRangeInput): Promise<SourceAnalysisData> {
    const method = "DashboardService.getSourceAnalysis";
    logger.debug({ method, params }, "Fetching source analysis");

    try {
      const rawRows = await dashboardRepository.getSourceBreakdown(params);

      const totalIdeas = rawRows.reduce((sum, row) => sum + row.count, 0);

      const bySubmitterType: SourceBreakdownRow[] = rawRows.map((row) => ({
        submitterType: row.submitterType,
        count: row.count,
        percentage: totalIdeas === 0 ? 0 : parseFloat(((row.count / totalIdeas) * 100).toFixed(1)),
      }));

      const result: SourceAnalysisData = {
        totalIdeas,
        bySubmitterType,
        dateRange: { from: params.from, to: params.to },
      };

      logger.debug({ method, totalIdeas }, "Source analysis ready");
      return result;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method }, "Unexpected error in getSourceAnalysis");
      throw AppError.internal(`${method}: unexpected error`);
    }
  }

  // ── 4. getPipelineReportData ─────────────────────────────────────────────

  /**
   * Full data payload for the Pipeline Report export (admin, bd_lead).
   *
   * Fans out to all three service methods in parallel, then fetches idea rows
   * from the repository. Merges everything into PipelineReportData for the
   * client-side ExportService (xlsx + print).
   *
   * Design/components.md Key Decision 2: reuse view data — no duplicate fetches.
   */
  async getPipelineReportData(params: ExportReportInput): Promise<PipelineReportData> {
    const method = "DashboardService.getPipelineReportData";
    logger.debug({ method, params }, "Building pipeline report data");

    // DateRangeInput subset from ExportReportInput
    const dateRange: DateRangeInput = { from: params.from, to: params.to };

    try {
      const [summary, sourceAnalysis, bdWorkload, ideas] = await Promise.all([
        this.getExecutiveSummary(dateRange),
        this.getSourceAnalysis(dateRange),
        this.getBDTeamView(dateRange),
        dashboardRepository.getIdeasForExport(params),
      ]);

      const result: PipelineReportData = {
        generatedAt: new Date().toISOString(),
        dateRange: { from: params.from, to: params.to },
        summary,
        sourceAnalysis,
        bdWorkload,
        ideas,
      };

      logger.info(
        { method, ideaCount: ideas.length, generatedAt: result.generatedAt },
        "Pipeline report data assembled"
      );
      return result;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method }, "Unexpected error in getPipelineReportData");
      throw AppError.internal(`${method}: unexpected error`);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Count distinct ideas whose output_documents contain at least one document
   * with watermark_status = 'AI Draft – Pending BD Review'.
   *
   * Scoped by ideas.created_at within the requested date range so the number
   * stays coherent with the other metrics on the BD Team View.
   *
   * Implementation note: Supabase JS client does not support a COUNT(DISTINCT)
   * with a sub-select in one call, so we fetch distinct idea_ids via an inner
   * join filter and count in JS.
   */
  private async _getPendingReviewCount(params: DateRangeInput): Promise<number> {
    const method = "DashboardService._getPendingReviewCount";

    try {
      const db = createServerSupabaseClient();

      // Select idea_ids from output_documents where watermark = ai_draft
      // and the parent idea was created within the date range (ideas!inner).
      const { data, error } = await db
        .from("output_documents")
        .select("idea_id, ideas!inner(created_at)")
        .eq("watermark_status", WATERMARK_AI_DRAFT)
        .gte("ideas.created_at", params.from)
        .lte("ideas.created_at", params.to);

      if (error) {
        logger.error({ err: error, method }, "Supabase error fetching pending review count");
        throw AppError.internal(`${method}: ${error.message}`);
      }

      type RawRow = { idea_id: string };
      const rows = (data as unknown as RawRow[]) ?? [];

      // Deduplicate: an idea may have multiple ai_draft documents
      const distinctIdeaIds = new Set<string>(rows.map((r) => r.idea_id));
      return distinctIdeaIds.size;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method }, "Unexpected error fetching pending review count");
      throw AppError.internal(`${method}: unexpected error`);
    }
  }
}

/** Singleton — import this everywhere; do not instantiate directly */
export const dashboardService = new DashboardService();
