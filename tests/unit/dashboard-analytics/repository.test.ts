/**
 * Unit tests — DashboardRepository
 *
 * Covers:
 *   - Mock Supabase client, verify query structure per method
 *   - Test error propagation → AppError
 *
 * Ref: design/components.md — DashboardRepository (Component 3)
 * Task 7.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DashboardRepository as DashboardRepositoryType } from "@/modules/dashboard-analytics/repository";

// ─── Mock Supabase server client ──────────────────────────────────────────────

const mockSupabaseFrom = vi.fn();
const mockSupabaseClient = {
  from: mockSupabaseFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
  createAdminSupabaseClient: vi.fn(() => mockSupabaseClient),
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Helper: Supabase fluent chain mock ───────────────────────────────────────
//
// The Supabase JS client returns a "thenable" builder: each method call returns
// `this`, and the final await resolves with { data, error }.
// We simulate this by building a Proxy-based thenable chain.

function makeChain(result: { data: unknown; error: unknown }) {
  const resolved = Promise.resolve(result);

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") return resolved.then.bind(resolved);
      if (prop === "catch") return resolved.catch.bind(resolved);
      if (prop === "finally") return resolved.finally.bind(resolved);
      // Any method call returns the same chain (proxy)
      return (..._args: unknown[]) => proxy;
    },
  };

  const proxy = new Proxy({}, handler);
  return proxy;
}

const DATE_RANGE = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-06-30T23:59:59.000Z",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DashboardRepository", () => {
  let repo: InstanceType<typeof DashboardRepositoryType>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/modules/dashboard-analytics/repository");
    repo = new mod.DashboardRepository();
  });

  // ── getIdeaCountByStage ────────────────────────────────────────────────────

  describe("getIdeaCountByStage()", () => {
    it("should return StageCountRow[] counted from raw rows", async () => {
      // Code now counts raw rows in JS (no SQL aggregate)
      const dbData = [
        ...Array(10).fill({ current_stage: "sandbox" }),
        ...Array(5).fill({ current_stage: "validation_sprint" }),
      ];

      mockSupabaseFrom.mockReturnValue(makeChain({ data: dbData, error: null }));

      const result = await repo.getIdeaCountByStage(DATE_RANGE);

      expect(mockSupabaseFrom).toHaveBeenCalledWith("ideas");
      expect(result).toHaveLength(2);
      expect(result.find((r) => r.stage === "sandbox")?.count).toBe(10);
      expect(result.find((r) => r.stage === "validation_sprint")?.count).toBe(5);
    });

    it("should count a single stage correctly", async () => {
      const dbData = Array(7).fill({ current_stage: "closed_go" });

      mockSupabaseFrom.mockReturnValue(makeChain({ data: dbData, error: null }));

      const result = await repo.getIdeaCountByStage(DATE_RANGE);

      expect(result[0]?.count).toBe(7);
      expect(typeof result[0]?.count).toBe("number");
    });

    it("should return empty array when no ideas in range", async () => {
      mockSupabaseFrom.mockReturnValue(makeChain({ data: [], error: null }));

      const result = await repo.getIdeaCountByStage(DATE_RANGE);
      expect(result).toHaveLength(0);
    });

    it("should throw AppError when Supabase returns an error", async () => {
      mockSupabaseFrom.mockReturnValue(
        makeChain({ data: null, error: { message: "DB connection refused" } })
      );

      await expect(repo.getIdeaCountByStage(DATE_RANGE)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ── getWinNoGoStats ────────────────────────────────────────────────────────

  describe("getWinNoGoStats()", () => {
    it("should derive winRate from stage counts correctly", async () => {
      const dbData = [
        ...Array(4).fill({ current_stage: "closed_go" }),
        ...Array(1).fill({ current_stage: "closed_no_go" }),
        ...Array(10).fill({ current_stage: "sandbox" }),
      ];

      mockSupabaseFrom.mockReturnValue(makeChain({ data: dbData, error: null }));

      const result = await repo.getWinNoGoStats(DATE_RANGE);

      expect(result.closedGo).toBe(4);
      expect(result.closedNoGo).toBe(1);
      expect(result.inProgress).toBe(10);
      expect(result.totalClosed).toBe(5);
      expect(result.winRate).toBeCloseTo(0.8); // 4/5
    });

    it("winRate = 0 when totalClosed = 0 (no division-by-zero)", async () => {
      const dbData = Array(8).fill({ current_stage: "sandbox" });

      mockSupabaseFrom.mockReturnValue(makeChain({ data: dbData, error: null }));

      const result = await repo.getWinNoGoStats(DATE_RANGE);

      expect(result.totalClosed).toBe(0);
      expect(result.winRate).toBe(0);
      expect(Number.isNaN(result.winRate)).toBe(false);
    });

    it("winRate = 1 when all closed are go", async () => {
      const dbData = Array(10).fill({ current_stage: "closed_go" });

      mockSupabaseFrom.mockReturnValue(makeChain({ data: dbData, error: null }));

      const result = await repo.getWinNoGoStats(DATE_RANGE);

      expect(result.winRate).toBe(1);
    });

    it("winRate = 0 when all closed are no-go", async () => {
      const dbData = Array(5).fill({ current_stage: "closed_no_go" });

      mockSupabaseFrom.mockReturnValue(makeChain({ data: dbData, error: null }));

      const result = await repo.getWinNoGoStats(DATE_RANGE);

      expect(result.winRate).toBe(0);
      expect(result.closedGo).toBe(0);
    });

    it("should throw AppError on Supabase error", async () => {
      mockSupabaseFrom.mockReturnValue(
        makeChain({ data: null, error: { message: "query timeout" } })
      );

      await expect(repo.getWinNoGoStats(DATE_RANGE)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ── getAvgTimePerStage ─────────────────────────────────────────────────────

  describe("getAvgTimePerStage()", () => {
    it("should return empty array when no transitions exist", async () => {
      mockSupabaseFrom.mockReturnValue(makeChain({ data: [], error: null }));

      const result = await repo.getAvgTimePerStage(DATE_RANGE);
      expect(result).toHaveLength(0);
    });

    it("should throw AppError on Supabase error", async () => {
      mockSupabaseFrom.mockReturnValue(
        makeChain({ data: null, error: { message: "RLS rejected" } })
      );

      await expect(repo.getAvgTimePerStage(DATE_RANGE)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });

    it("should calculate avgDays from stage_transitions", async () => {
      // idea entered sandbox at created_at and transitioned after 7 days
      const createdAt = "2026-01-01T00:00:00.000Z";
      const transitionAt = "2026-01-08T00:00:00.000Z"; // exactly 7 days later

      const dbData = [
        {
          idea_id: "idea-001",
          from_stage: "sandbox",
          to_stage: "validation_sprint",
          created_at: transitionAt,
          ideas: { created_at: createdAt },
        },
      ];

      mockSupabaseFrom.mockReturnValue(makeChain({ data: dbData, error: null }));

      const result = await repo.getAvgTimePerStage(DATE_RANGE);

      expect(result).toHaveLength(1);
      expect(result[0]?.stage).toBe("sandbox");
      expect(result[0]?.avgDays).toBe(7);
    });
  });

  // ── getBDWorkload ──────────────────────────────────────────────────────────

  describe("getBDWorkload()", () => {
    it("should return empty array when no review_actions in range", async () => {
      // First call returns empty actions → early return
      mockSupabaseFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

      const result = await repo.getBDWorkload(DATE_RANGE);
      expect(result).toHaveLength(0);
    });

    it("should throw AppError when review_actions query fails", async () => {
      mockSupabaseFrom.mockReturnValueOnce(
        makeChain({ data: null, error: { message: "RLS policy violation" } })
      );

      await expect(repo.getBDWorkload(DATE_RANGE)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });

    it("should aggregate review actions by reviewer and stage", async () => {
      const actionsData = [
        {
          reviewer_id: "rev-001",
          idea_id: "idea-A",
          created_at: "2026-02-01T00:00:00Z",
          ideas: { current_stage: "sandbox" },
        },
        {
          reviewer_id: "rev-001",
          idea_id: "idea-B",
          created_at: "2026-02-02T00:00:00Z",
          ideas: { current_stage: "validation_sprint" },
        },
      ];
      const profilesData = [{ id: "rev-001", full_name: "Alice BD" }];

      mockSupabaseFrom
        .mockReturnValueOnce(makeChain({ data: actionsData, error: null }))
        .mockReturnValueOnce(makeChain({ data: profilesData, error: null }));

      const result = await repo.getBDWorkload(DATE_RANGE);

      expect(result).toHaveLength(1);
      expect(result[0]?.reviewerName).toBe("Alice BD");
      expect(result[0]?.ideaCount).toBe(2);
    });
  });

  // ── getSourceBreakdown ─────────────────────────────────────────────────────

  describe("getSourceBreakdown()", () => {
    it("should return SourceBreakdownRow[] with percentage = 0 (service computes it)", async () => {
      const dbData = [
        ...Array(10).fill({ submitter_type: "employee" }),
        ...Array(5).fill({ submitter_type: "partner" }),
      ];

      mockSupabaseFrom.mockReturnValue(makeChain({ data: dbData, error: null }));

      const result = await repo.getSourceBreakdown(DATE_RANGE);

      expect(result).toHaveLength(2);
      // Repository always returns 0 — service computes the real percentages
      for (const row of result) {
        expect(row.percentage).toBe(0);
      }
      expect(result.find((r) => r.submitterType === "employee")?.count).toBe(10);
    });

    it("should count submitter types from raw rows", async () => {
      const dbData = Array(3).fill({ submitter_type: "vendor" });

      mockSupabaseFrom.mockReturnValue(makeChain({ data: dbData, error: null }));

      const result = await repo.getSourceBreakdown(DATE_RANGE);
      expect(result[0]?.count).toBe(3);
    });

    it("should throw AppError on Supabase error", async () => {
      mockSupabaseFrom.mockReturnValue(
        makeChain({ data: null, error: { message: "column not found" } })
      );

      await expect(repo.getSourceBreakdown(DATE_RANGE)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ── getIdeasForExport ──────────────────────────────────────────────────────

  describe("getIdeasForExport()", () => {
    const EXPORT_INPUT = { ...DATE_RANGE, format: "excel" as const };

    it("should return empty array when no ideas in range", async () => {
      // ideas → empty → early return
      mockSupabaseFrom.mockReturnValueOnce(makeChain({ data: [], error: null }));

      const result = await repo.getIdeasForExport(EXPORT_INPUT);
      expect(result).toHaveLength(0);
    });

    it("should return IdeaExportRow[] with expected shape", async () => {
      const ideasData = [
        {
          id: "idea-uuid-1",
          reference_number: "REF-001",
          title: "Test Idea",
          submitter_type: "employee",
          created_at: "2026-03-01T00:00:00Z",
          current_stage: "sandbox",
          updated_at: "2026-03-05T00:00:00Z",
        },
      ];

      // ideas, ai_analyses, review_actions (empty)
      mockSupabaseFrom
        .mockReturnValueOnce(makeChain({ data: ideasData, error: null }))
        .mockReturnValueOnce(makeChain({ data: [], error: null }))
        .mockReturnValueOnce(makeChain({ data: [], error: null }));

      const result = await repo.getIdeasForExport(EXPORT_INPUT);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        referenceNumber: "REF-001",
        title: "Test Idea",
        submitterType: "employee",
        currentStage: "sandbox",
        assignedReviewer: null,
      });
    });

    it("should throw AppError on Supabase error for ideas query", async () => {
      mockSupabaseFrom.mockReturnValueOnce(
        makeChain({ data: null, error: { message: "schema cache refresh error" } })
      );

      await expect(repo.getIdeasForExport(EXPORT_INPUT)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });
});
