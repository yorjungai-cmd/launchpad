/**
 * DashboardRepository — data access layer for the dashboard-analytics module.
 *
 * Read-only unit: queries across ideas, stage_transitions, review_actions, and
 * profiles tables owned by other units. Uses the server-side Supabase client so
 * that RLS policies are enforced at the DB layer.
 *
 * Ref:
 *   - design/components.md — DashboardRepository (Component 3)
 *   - design/data-model.md — Key Access Patterns
 *
 * Schema discrepancies vs design doc (actual DB migrations take precedence):
 *   - ideas.submitted_at → does not exist; use ideas.created_at instead
 *   - ideas.idea_type    → does not exist; idea_type lives on ai_analyses
 *   - stage_transitions.transitioned_at → column is named created_at
 *   - "users" table → the app uses "profiles" (extends auth.users)
 *
 * Task 2.1
 */

import logger from "@/lib/logger";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/AppError";
import {
  IdeaStage,
  SubmitterType,
  type StageCountRow,
  type WinNoGoStats,
  type StageTimeRow,
  type ReviewerWorkloadRow,
  type SourceBreakdownRow,
  type IdeaExportRow,
  type DateRangeInput,
  type ExportReportInput,
} from "./schemas";

// ─── Filter aliases ───────────────────────────────────────────────────────────

/** Filter passed to every aggregate query */
export type DateRangeFilter = DateRangeInput;

/** Filter for the export query (extends DateRangeFilter with format) */
export type ExportFilter = ExportReportInput;

// ─── Internal raw DB row shapes ───────────────────────────────────────────────
// The generated types.ts placeholder does not yet cover stage_transitions or
// review_actions. These inline shapes mirror the actual DB schema in migrations.

/** Supabase aggregate query result (count() returns a number via JS client) */
interface StageAggRow {
  current_stage: string;
  count: number;
}

interface SubmitterAggRow {
  submitter_type: string;
  count: number;
}

interface StageTransitionRow {
  idea_id: string;
  from_stage: string | null;
  to_stage: string;
  created_at: string; // actual column name in migration
  ideas: { created_at: string | null };
}

interface ReviewActionRow {
  idea_id: string;
  reviewer_id: string;
  created_at: string;
  ideas: { current_stage: string };
}

interface IdeaExportDbRow {
  id: string;
  reference_number: string;
  title: string;
  submitter_type: string;
  created_at: string;
  current_stage: string;
  updated_at: string;
}

interface ProfileNameRow {
  id: string;
  full_name: string | null;
}

interface ExportActionRow {
  idea_id: string;
  reviewer_id: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map a raw DB stage string to IdeaStage enum. Falls back to SANDBOX. */
function toIdeaStage(raw: string): IdeaStage {
  const map: Record<string, IdeaStage> = {
    sandbox: IdeaStage.SANDBOX,
    Sandbox: IdeaStage.SANDBOX,
    validation_sprint: IdeaStage.VALIDATION_SPRINT,
    build_sprint: IdeaStage.BUILD_SPRINT,
    launch_test: IdeaStage.LAUNCH_TEST,
    closed_go: IdeaStage.CLOSED_GO,
    closed_no_go: IdeaStage.CLOSED_NO_GO,
  };
  return map[raw] ?? IdeaStage.SANDBOX;
}

/** Pipeline stage order for deterministic output sorting */
const ALL_STAGES: IdeaStage[] = [
  IdeaStage.SANDBOX,
  IdeaStage.VALIDATION_SPRINT,
  IdeaStage.BUILD_SPRINT,
  IdeaStage.LAUNCH_TEST,
  IdeaStage.CLOSED_GO,
  IdeaStage.CLOSED_NO_GO,
];

const SUBMITTER_TYPE_MAP: Record<string, SubmitterType> = {
  employee: SubmitterType.EMPLOYEE,
  executive: SubmitterType.EXECUTIVE,
  partner: SubmitterType.PARTNER,
  vendor: SubmitterType.VENDOR,
};

const MS_PER_DAY = 86_400_000;

// ─── Repository ───────────────────────────────────────────────────────────────

export class DashboardRepository {
  // ── 1. getIdeaCountByStage ────────────────────────────────────────────────

  /**
   * COUNT ideas GROUP BY current_stage, filtered by created_at date range.
   * Returns one StageCountRow per stage that has ≥ 1 idea.
   * Stages with 0 ideas are omitted; callers may fill zeros for display.
   */
  async getIdeaCountByStage(filter: DateRangeFilter): Promise<StageCountRow[]> {
    try {
      const db = createServerSupabaseClient();

      const { data, error } = await db
        .from("ideas")
        .select("current_stage, count:id.count()")
        .gte("created_at", filter.from)
        .lte("created_at", filter.to);

      if (error) {
        logger.error({ err: error, method: "getIdeaCountByStage" }, "Supabase error");
        throw AppError.internal(`getIdeaCountByStage: ${error.message}`);
      }

      const rows = (data as unknown as StageAggRow[]) ?? [];

      return rows.map((row) => ({
        stage: toIdeaStage(row.current_stage),
        count: typeof row.count === "string" ? parseInt(row.count, 10) : row.count,
      }));
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method: "getIdeaCountByStage" }, "Unexpected error");
      throw AppError.internal("getIdeaCountByStage: unexpected error");
    }
  }

  // ── 2. getWinNoGoStats ────────────────────────────────────────────────────

  /**
   * Derive win/no-go statistics from idea counts grouped by current_stage.
   * Uses created_at (= submission timestamp) for date range alignment.
   */
  async getWinNoGoStats(filter: DateRangeFilter): Promise<WinNoGoStats> {
    try {
      const db = createServerSupabaseClient();

      const { data, error } = await db
        .from("ideas")
        .select("current_stage, count:id.count()")
        .gte("created_at", filter.from)
        .lte("created_at", filter.to);

      if (error) {
        logger.error({ err: error, method: "getWinNoGoStats" }, "Supabase error");
        throw AppError.internal(`getWinNoGoStats: ${error.message}`);
      }

      const rows = (data as unknown as StageAggRow[]) ?? [];

      let closedGo = 0;
      let closedNoGo = 0;
      let inProgress = 0;

      for (const row of rows) {
        const count = typeof row.count === "string" ? parseInt(row.count, 10) : row.count;
        if (row.current_stage === IdeaStage.CLOSED_GO || row.current_stage === "closed_go") {
          closedGo += count;
        } else if (
          row.current_stage === IdeaStage.CLOSED_NO_GO ||
          row.current_stage === "closed_no_go"
        ) {
          closedNoGo += count;
        } else {
          inProgress += count;
        }
      }

      const totalClosed = closedGo + closedNoGo;
      // Guard against division-by-zero per business rule (data-model.md §Business Rules)
      const winRate = totalClosed === 0 ? 0 : closedGo / totalClosed;

      return { totalClosed, closedGo, closedNoGo, inProgress, winRate };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method: "getWinNoGoStats" }, "Unexpected error");
      throw AppError.internal("getWinNoGoStats: unexpected error");
    }
  }

  // ── 3. getAvgTimePerStage ─────────────────────────────────────────────────

  /**
   * Compute average calendar days spent in each pipeline stage by analysing
   * the stage_transitions history.
   *
   * Algorithm (in-memory, post-fetch):
   *   For each idea, sort its transitions by created_at ascending.
   *   Each transition row records *leaving* from_stage → to_stage.
   *   Duration in from_stage = transition[n].created_at − transition[n-1].created_at
   *   For the very first transition (from_stage IS NULL), the clock starts at
   *   the idea's created_at (also available via the ideas!inner join).
   *
   * Why in-memory: Supabase JS client doesn't support raw EXTRACT/EPOCH AVG.
   * Internal-tool volume makes this acceptable (design/data-model.md §Business Rules 4).
   */
  async getAvgTimePerStage(filter: DateRangeFilter): Promise<StageTimeRow[]> {
    try {
      const db = createServerSupabaseClient();

      // Fetch transitions for ideas submitted (created) within the date range.
      // ideas!inner filters to only transitions where the parent idea is in range.
      const { data: rawTransitions, error } = await db
        .from("stage_transitions")
        .select("idea_id, from_stage, to_stage, created_at, ideas!inner(created_at)")
        .gte("ideas.created_at", filter.from)
        .lte("ideas.created_at", filter.to)
        .order("idea_id", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        logger.error({ err: error, method: "getAvgTimePerStage" }, "Supabase error");
        throw AppError.internal(`getAvgTimePerStage: ${error.message}`);
      }

      const transitions = (rawTransitions as unknown as StageTransitionRow[]) ?? [];

      if (transitions.length === 0) return [];

      // Group transitions by idea_id preserving order
      const byIdea = new Map<string, StageTransitionRow[]>();
      for (const t of transitions) {
        const list = byIdea.get(t.idea_id) ?? [];
        list.push(t);
        byIdea.set(t.idea_id, list);
      }

      // Accumulate total milliseconds and transition counts per stage
      const stageAccum = new Map<string, { totalMs: number; count: number }>();

      for (const [, ideaTransitions] of Array.from(byIdea.entries())) {
        const firstTransition = ideaTransitions[0];
        if (!firstTransition) continue;

        // Anchor: the idea entered its first stage at ideas.created_at
        const ideaCreatedAt = firstTransition.ideas.created_at;
        if (!ideaCreatedAt) continue;

        let prevTime = new Date(ideaCreatedAt).getTime();

        for (const t of ideaTransitions) {
          const exitTime = new Date(t.created_at).getTime();

          // The stage being timed is from_stage (null = initial → first stage,
          // clock already anchored at prevTime = ideas.created_at above)
          const stageName = t.from_stage;

          if (stageName !== null) {
            const durationMs = exitTime - prevTime;
            if (durationMs > 0) {
              const acc = stageAccum.get(stageName) ?? { totalMs: 0, count: 0 };
              acc.totalMs += durationMs;
              acc.count += 1;
              stageAccum.set(stageName, acc);
            }
          }

          prevTime = exitTime;
        }
      }

      // Return in pipeline order, only stages with at least one completed transition
      return ALL_STAGES.filter((stage) => stageAccum.has(stage)).map((stage) => {
        const acc = stageAccum.get(stage)!;
        return {
          stage,
          avgDays: parseFloat((acc.totalMs / acc.count / MS_PER_DAY).toFixed(2)),
        };
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method: "getAvgTimePerStage" }, "Unexpected error");
      throw AppError.internal("getAvgTimePerStage: unexpected error");
    }
  }

  // ── 4. getBDWorkload ──────────────────────────────────────────────────────

  /**
   * COUNT distinct ideas per reviewer from review_actions, joined to profiles
   * for display names, further broken down by the idea's current_stage.
   *
   * Date range filter is applied to review_actions.created_at (when the action
   * was taken) — represents "workload within the period".
   */
  async getBDWorkload(filter: DateRangeFilter): Promise<ReviewerWorkloadRow[]> {
    try {
      const db = createServerSupabaseClient();

      // Fetch review_actions with the idea's current stage
      const { data: rawActions, error: actionsError } = await db
        .from("review_actions")
        .select("reviewer_id, idea_id, created_at, ideas!inner(current_stage)")
        .gte("created_at", filter.from)
        .lte("created_at", filter.to);

      if (actionsError) {
        logger.error({ err: actionsError, method: "getBDWorkload" }, "Supabase error");
        throw AppError.internal(`getBDWorkload (review_actions): ${actionsError.message}`);
      }

      const actions = (rawActions as unknown as ReviewActionRow[]) ?? [];

      if (actions.length === 0) return [];

      // Collect unique reviewer IDs for a batch profile lookup
      const reviewerIdSet = new Set<string>();
      for (const a of actions) reviewerIdSet.add(a.reviewer_id);
      const reviewerIds = Array.from(reviewerIdSet);

      const { data: rawProfiles, error: profilesError } = await db
        .from("profiles")
        .select("id, full_name")
        .in("id", reviewerIds);

      if (profilesError) {
        logger.error({ err: profilesError, method: "getBDWorkload" }, "Supabase error (profiles)");
        throw AppError.internal(`getBDWorkload (profiles): ${profilesError.message}`);
      }

      const profiles = (rawProfiles as unknown as ProfileNameRow[]) ?? [];
      const nameMap = new Map<string, string>(profiles.map((p) => [p.id, p.full_name ?? p.id]));

      // Aggregate: per reviewer → Set of distinct ideaIds + per-stage Sets of ideaIds
      type ReviewerAgg = {
        ideaIds: Set<string>;
        stageMap: Map<string, Set<string>>;
      };

      const reviewerAgg = new Map<string, ReviewerAgg>();

      for (const action of actions) {
        const agg: ReviewerAgg = reviewerAgg.get(action.reviewer_id) ?? {
          ideaIds: new Set(),
          stageMap: new Map(),
        };

        agg.ideaIds.add(action.idea_id);

        const stage = action.ideas.current_stage;
        const stageSet = agg.stageMap.get(stage) ?? new Set<string>();
        stageSet.add(action.idea_id);
        agg.stageMap.set(stage, stageSet);

        reviewerAgg.set(action.reviewer_id, agg);
      }

      const result: ReviewerWorkloadRow[] = [];

      for (const [reviewerId, agg] of Array.from(reviewerAgg.entries())) {
        const byStage: StageCountRow[] = Array.from(agg.stageMap.entries()).map(
          ([stage, ideaSet]) => ({ stage: toIdeaStage(stage), count: ideaSet.size })
        );

        result.push({
          reviewerId,
          reviewerName: nameMap.get(reviewerId) ?? reviewerId,
          ideaCount: agg.ideaIds.size,
          byStage,
        });
      }

      // Sort by ideaCount descending for stable display order
      result.sort((a, b) => b.ideaCount - a.ideaCount);

      return result;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method: "getBDWorkload" }, "Unexpected error");
      throw AppError.internal("getBDWorkload: unexpected error");
    }
  }

  // ── 5. getSourceBreakdown ─────────────────────────────────────────────────

  /**
   * COUNT ideas GROUP BY submitter_type within the created_at date range.
   *
   * NOTE: percentage is returned as 0 — the service layer computes it as
   * count / totalIdeas * 100 to keep the repository free of derived business
   * logic (design/components.md — DashboardService Key Decision 1).
   */
  async getSourceBreakdown(filter: DateRangeFilter): Promise<SourceBreakdownRow[]> {
    try {
      const db = createServerSupabaseClient();

      const { data, error } = await db
        .from("ideas")
        .select("submitter_type, count:id.count()")
        .gte("created_at", filter.from)
        .lte("created_at", filter.to);

      if (error) {
        logger.error({ err: error, method: "getSourceBreakdown" }, "Supabase error");
        throw AppError.internal(`getSourceBreakdown: ${error.message}`);
      }

      const rows = (data as unknown as SubmitterAggRow[]) ?? [];

      return rows.map((row) => ({
        submitterType: SUBMITTER_TYPE_MAP[row.submitter_type] ?? SubmitterType.EMPLOYEE,
        count: typeof row.count === "string" ? parseInt(row.count, 10) : row.count,
        percentage: 0, // computed by DashboardService
      }));
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method: "getSourceBreakdown" }, "Unexpected error");
      throw AppError.internal("getSourceBreakdown: unexpected error");
    }
  }

  // ── 6. getIdeasForExport ──────────────────────────────────────────────────

  /**
   * SELECT per-idea rows for the pipeline report export, capped at 10,000 rows.
   *
   * `ideaType` is sourced from ai_analyses (not ideas) — we do a separate batch
   * lookup and merge. Non-fatal on failure: falls back to empty string.
   *
   * `assignedReviewer` is the display name of the most recent reviewer who acted
   * on the idea (latest review_actions.created_at), resolved via profiles.
   */
  async getIdeasForExport(filter: ExportFilter): Promise<IdeaExportRow[]> {
    const EXPORT_LIMIT = 10_000;

    try {
      const db = createServerSupabaseClient();

      const { data, error } = await db
        .from("ideas")
        .select(
          "id, reference_number, title, submitter_type, created_at, current_stage, updated_at"
        )
        .gte("created_at", filter.from)
        .lte("created_at", filter.to)
        .order("created_at", { ascending: false })
        .limit(EXPORT_LIMIT);

      if (error) {
        logger.error({ err: error, method: "getIdeasForExport" }, "Supabase error");
        throw AppError.internal(`getIdeasForExport: ${error.message}`);
      }

      const rows = (data as unknown as IdeaExportDbRow[]) ?? [];
      if (rows.length === 0) return [];

      const ideaIds = rows.map((r) => r.id);

      // ── Batch 1: idea_type from ai_analyses ──────────────────────────────
      type AnalysisRow = { idea_id: string; idea_type: string | null };
      let ideaTypeMap = new Map<string, string>();

      const { data: analyses, error: analysesError } = await db
        .from("ai_analyses")
        .select("idea_id, idea_type")
        .in("idea_id", ideaIds);

      if (analysesError) {
        logger.warn(
          { err: analysesError, method: "getIdeasForExport" },
          "Could not fetch ai_analyses for idea_type"
        );
      } else {
        const analysisRows = (analyses as unknown as AnalysisRow[]) ?? [];
        ideaTypeMap = new Map(
          analysisRows
            .filter((a) => a.idea_type !== null)
            .map((a) => [a.idea_id, a.idea_type as string])
        );
      }

      // ── Batch 2: most recent reviewer per idea ────────────────────────────
      const { data: rawActions, error: actionsError } = await db
        .from("review_actions")
        .select("idea_id, reviewer_id, created_at")
        .in("idea_id", ideaIds)
        .order("created_at", { ascending: false });

      if (actionsError) {
        logger.warn(
          { err: actionsError, method: "getIdeasForExport" },
          "Could not fetch review_actions for export"
        );
      }

      const exportActions = (rawActions as unknown as ExportActionRow[]) ?? [];

      // Keep only the most recent action per idea (list is already sorted desc)
      const latestReviewerByIdea = new Map<string, string>();
      for (const action of exportActions) {
        if (!latestReviewerByIdea.has(action.idea_id)) {
          latestReviewerByIdea.set(action.idea_id, action.reviewer_id);
        }
      }

      // ── Batch 3: reviewer display names ──────────────────────────────────
      const reviewerIdSet = new Set(latestReviewerByIdea.values());
      let reviewerNameMap = new Map<string, string>();

      if (reviewerIdSet.size > 0) {
        const reviewerIds = Array.from(reviewerIdSet);
        const { data: reviewerProfiles, error: profilesError } = await db
          .from("profiles")
          .select("id, full_name")
          .in("id", reviewerIds);

        if (profilesError) {
          logger.warn(
            { err: profilesError, method: "getIdeasForExport" },
            "Could not fetch reviewer profiles"
          );
        } else {
          const reviewerRows = (reviewerProfiles as unknown as ProfileNameRow[]) ?? [];
          reviewerNameMap = new Map(reviewerRows.map((p) => [p.id, p.full_name ?? p.id]));
        }
      }

      // ── Assemble final rows ───────────────────────────────────────────────
      return rows.map((row) => {
        const reviewerId = latestReviewerByIdea.get(row.id);
        const assignedReviewer = reviewerId
          ? (reviewerNameMap.get(reviewerId) ?? reviewerId)
          : null;

        return {
          referenceNumber: row.reference_number,
          title: row.title,
          submitterType: SUBMITTER_TYPE_MAP[row.submitter_type] ?? SubmitterType.EMPLOYEE,
          submittedAt: row.created_at, // DB uses created_at; design doc called it submitted_at
          currentStage: toIdeaStage(row.current_stage),
          ideaType: ideaTypeMap.get(row.id) ?? "",
          assignedReviewer,
          lastUpdatedAt: row.updated_at,
        };
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, method: "getIdeasForExport" }, "Unexpected error");
      throw AppError.internal("getIdeasForExport: unexpected error");
    }
  }
}

/** Singleton — import this everywhere; do not instantiate directly */
export const dashboardRepository = new DashboardRepository();
