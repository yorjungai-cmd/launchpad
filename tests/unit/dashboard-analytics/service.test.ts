/**
 * Unit tests — DashboardService
 *
 * Covers:
 *   - computeWinRate edge cases via getExecutiveSummary: totalClosed=0, all go, all no-go
 *   - computePercentage via getSourceAnalysis: total=0, single type, mixed
 *   - getExecutiveSummary(): mock repository, verify derived metrics shape
 *   - getBDTeamView(): mock repository + Supabase pending review count
 *
 * Ref: design/components.md — DashboardService (Component 2)
 * Task 7.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dashboardRepository ────────────────────────────────────────────────

const mockGetIdeaCountByStage = vi.fn();
const mockGetWinNoGoStats = vi.fn();
const mockGetAvgTimePerStage = vi.fn();
const mockGetBDWorkload = vi.fn();
const mockGetSourceBreakdown = vi.fn();
const mockGetIdeasForExport = vi.fn();

vi.mock("@/modules/dashboard-analytics/repository", () => ({
  dashboardRepository: {
    getIdeaCountByStage: mockGetIdeaCountByStage,
    getWinNoGoStats: mockGetWinNoGoStats,
    getAvgTimePerStage: mockGetAvgTimePerStage,
    getBDWorkload: mockGetBDWorkload,
    getSourceBreakdown: mockGetSourceBreakdown,
    getIdeasForExport: mockGetIdeasForExport,
  },
  DashboardRepository: vi.fn(),
}));

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

// ─── Test helpers ─────────────────────────────────────────────────────────────

const DATE_RANGE = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-06-30T23:59:59.000Z",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DashboardService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getExecutiveSummary ────────────────────────────────────────────────────

  describe("getExecutiveSummary()", () => {
    it("should return correct shape with totalIdeas derived from ideaCountByStage", async () => {
      mockGetIdeaCountByStage.mockResolvedValue([
        { stage: "sandbox", count: 10 },
        { stage: "validation_sprint", count: 5 },
        { stage: "closed_go", count: 3 },
      ]);
      mockGetWinNoGoStats.mockResolvedValue({
        totalClosed: 5,
        closedGo: 3,
        closedNoGo: 2,
        inProgress: 15,
        winRate: 0.6,
      });
      mockGetAvgTimePerStage.mockResolvedValue([{ stage: "sandbox", avgDays: 7.5 }]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getExecutiveSummary(DATE_RANGE);

      expect(result.totalIdeas).toBe(18); // 10 + 5 + 3
      expect(result.ideaCountByStage).toHaveLength(3);
      expect(result.winNoGoStats.winRate).toBe(0.6);
      expect(result.avgTimePerStage).toHaveLength(1);
      expect(result.dateRange).toEqual({ from: DATE_RANGE.from, to: DATE_RANGE.to });
    });

    it("totalIdeas = 0 when all stages return 0 count", async () => {
      mockGetIdeaCountByStage.mockResolvedValue([]);
      mockGetWinNoGoStats.mockResolvedValue({
        totalClosed: 0,
        closedGo: 0,
        closedNoGo: 0,
        inProgress: 0,
        winRate: 0,
      });
      mockGetAvgTimePerStage.mockResolvedValue([]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getExecutiveSummary(DATE_RANGE);

      expect(result.totalIdeas).toBe(0);
      expect(result.winNoGoStats.winRate).toBe(0);
    });

    // ── computeWinRate edge cases ──────────────────────────────────────────

    it("winRate = 0 when totalClosed = 0 (no division-by-zero)", async () => {
      mockGetIdeaCountByStage.mockResolvedValue([{ stage: "sandbox", count: 5 }]);
      mockGetWinNoGoStats.mockResolvedValue({
        totalClosed: 0,
        closedGo: 0,
        closedNoGo: 0,
        inProgress: 5,
        winRate: 0,
      });
      mockGetAvgTimePerStage.mockResolvedValue([]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getExecutiveSummary(DATE_RANGE);

      expect(result.winNoGoStats.winRate).toBe(0);
      expect(Number.isFinite(result.winNoGoStats.winRate)).toBe(true);
      expect(Number.isNaN(result.winNoGoStats.winRate)).toBe(false);
    });

    it("winRate = 1.0 when all closed ideas are go (closedNoGo = 0)", async () => {
      mockGetIdeaCountByStage.mockResolvedValue([{ stage: "closed_go", count: 8 }]);
      mockGetWinNoGoStats.mockResolvedValue({
        totalClosed: 8,
        closedGo: 8,
        closedNoGo: 0,
        inProgress: 0,
        winRate: 1.0,
      });
      mockGetAvgTimePerStage.mockResolvedValue([]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getExecutiveSummary(DATE_RANGE);

      expect(result.winNoGoStats.winRate).toBe(1.0);
      expect(result.winNoGoStats.closedNoGo).toBe(0);
    });

    it("winRate = 0 when all closed ideas are no-go (closedGo = 0)", async () => {
      mockGetIdeaCountByStage.mockResolvedValue([{ stage: "closed_no_go", count: 6 }]);
      mockGetWinNoGoStats.mockResolvedValue({
        totalClosed: 6,
        closedGo: 0,
        closedNoGo: 6,
        inProgress: 0,
        winRate: 0,
      });
      mockGetAvgTimePerStage.mockResolvedValue([]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getExecutiveSummary(DATE_RANGE);

      expect(result.winNoGoStats.winRate).toBe(0);
      expect(result.winNoGoStats.closedGo).toBe(0);
    });

    it("should propagate AppError from repository unchanged", async () => {
      const { AppError } = await import("@/lib/errors/AppError");
      const repoError = AppError.internal("DB exploded");

      mockGetIdeaCountByStage.mockRejectedValue(repoError);
      mockGetWinNoGoStats.mockResolvedValue({
        totalClosed: 0,
        closedGo: 0,
        closedNoGo: 0,
        inProgress: 0,
        winRate: 0,
      });
      mockGetAvgTimePerStage.mockResolvedValue([]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();

      await expect(service.getExecutiveSummary(DATE_RANGE)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ── getSourceAnalysis — computePercentage ─────────────────────────────────

  describe("getSourceAnalysis() — computePercentage", () => {
    it("total = 0 → all percentages are 0 (no division-by-zero)", async () => {
      mockGetSourceBreakdown.mockResolvedValue([]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getSourceAnalysis(DATE_RANGE);

      expect(result.totalIdeas).toBe(0);
      expect(result.bySubmitterType).toHaveLength(0);
    });

    it("single submitter type → percentage = 100", async () => {
      mockGetSourceBreakdown.mockResolvedValue([
        { submitterType: "employee", count: 20, percentage: 0 },
      ]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getSourceAnalysis(DATE_RANGE);

      expect(result.totalIdeas).toBe(20);
      expect(result.bySubmitterType).toHaveLength(1);
      expect(result.bySubmitterType[0]?.percentage).toBe(100);
    });

    it("mixed submitter types → percentages computed correctly", async () => {
      // 10 employee + 30 partner = 40 total → 25% + 75%
      mockGetSourceBreakdown.mockResolvedValue([
        { submitterType: "employee", count: 10, percentage: 0 },
        { submitterType: "partner", count: 30, percentage: 0 },
      ]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getSourceAnalysis(DATE_RANGE);

      expect(result.totalIdeas).toBe(40);
      const employee = result.bySubmitterType.find((r) => r.submitterType === "employee");
      const partner = result.bySubmitterType.find((r) => r.submitterType === "partner");
      expect(employee?.percentage).toBe(25);
      expect(partner?.percentage).toBe(75);
    });

    it("mixed types with rounding — sum ≈ 100 (±1)", async () => {
      // 1 + 1 + 1 = 3 total → each 33.3%
      mockGetSourceBreakdown.mockResolvedValue([
        { submitterType: "employee", count: 1, percentage: 0 },
        { submitterType: "executive", count: 1, percentage: 0 },
        { submitterType: "partner", count: 1, percentage: 0 },
      ]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getSourceAnalysis(DATE_RANGE);

      const sum = result.bySubmitterType.reduce((s, r) => s + r.percentage, 0);
      // floating-point rounding: 33.3 * 3 = 99.9
      expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1);
    });

    it("all percentages should be in [0, 100]", async () => {
      mockGetSourceBreakdown.mockResolvedValue([
        { submitterType: "employee", count: 5, percentage: 0 },
        { submitterType: "vendor", count: 15, percentage: 0 },
      ]);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getSourceAnalysis(DATE_RANGE);

      for (const row of result.bySubmitterType) {
        expect(row.percentage).toBeGreaterThanOrEqual(0);
        expect(row.percentage).toBeLessThanOrEqual(100);
      }
    });

    it("should propagate AppError from repository", async () => {
      const { AppError } = await import("@/lib/errors/AppError");
      mockGetSourceBreakdown.mockRejectedValue(AppError.internal("query failed"));

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();

      await expect(service.getSourceAnalysis(DATE_RANGE)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ── getBDTeamView ─────────────────────────────────────────────────────────

  describe("getBDTeamView()", () => {
    it("should return correct shape with pendingReviewCount and reviewerWorkload", async () => {
      mockGetBDWorkload.mockResolvedValue([
        {
          reviewerId: "reviewer-001",
          reviewerName: "Alice",
          ideaCount: 5,
          byStage: [
            { stage: "sandbox", count: 3 },
            { stage: "validation_sprint", count: 2 },
          ],
        },
      ]);

      // Mock Supabase for _getPendingReviewCount: 3 distinct idea_ids
      const mockSelectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          data: [{ idea_id: "idea-1" }, { idea_id: "idea-2" }, { idea_id: "idea-3" }],
          error: null,
        }),
      };
      mockSupabaseFrom.mockReturnValue(mockSelectChain);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getBDTeamView(DATE_RANGE);

      expect(result.pendingReviewCount).toBe(3);
      expect(result.reviewerWorkload).toHaveLength(1);
      expect(result.reviewerWorkload[0]?.reviewerName).toBe("Alice");
      expect(result.dateRange).toEqual({ from: DATE_RANGE.from, to: DATE_RANGE.to });
    });

    it("pendingReviewCount = 0 when no ai_draft documents", async () => {
      mockGetBDWorkload.mockResolvedValue([]);

      const mockSelectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };
      mockSupabaseFrom.mockReturnValue(mockSelectChain);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getBDTeamView(DATE_RANGE);

      expect(result.pendingReviewCount).toBe(0);
      expect(result.reviewerWorkload).toHaveLength(0);
    });

    it("deduplicates idea_ids for pendingReviewCount (multiple docs per idea)", async () => {
      mockGetBDWorkload.mockResolvedValue([]);

      // Same idea_id appearing twice (two ai_draft docs for one idea)
      const mockSelectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          data: [
            { idea_id: "idea-abc" },
            { idea_id: "idea-abc" }, // duplicate
            { idea_id: "idea-xyz" },
          ],
          error: null,
        }),
      };
      mockSupabaseFrom.mockReturnValue(mockSelectChain);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();
      const result = await service.getBDTeamView(DATE_RANGE);

      // 2 distinct ideas, not 3
      expect(result.pendingReviewCount).toBe(2);
    });

    it("should propagate AppError from repository", async () => {
      const { AppError } = await import("@/lib/errors/AppError");
      mockGetBDWorkload.mockRejectedValue(AppError.internal("workload query failed"));

      const mockSelectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabaseFrom.mockReturnValue(mockSelectChain);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();

      await expect(service.getBDTeamView(DATE_RANGE)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });

    it("should throw AppError.internal when Supabase returns error on pending count", async () => {
      mockGetBDWorkload.mockResolvedValue([]);

      const mockSelectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "RLS policy error" },
        }),
      };
      mockSupabaseFrom.mockReturnValue(mockSelectChain);

      const { DashboardService } = await import("@/modules/dashboard-analytics/service");
      const service = new DashboardService();

      await expect(service.getBDTeamView(DATE_RANGE)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });
});
