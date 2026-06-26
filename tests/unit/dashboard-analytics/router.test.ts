/**
 * Integration tests for DashboardRouter (tRPC procedures)
 *
 * Tests:
 *   Role guard per procedure:
 *     - getExecutiveSummary: admin ✅ | bd_reviewer ✅ | internal_submitter ❌ | unauthenticated ❌
 *     - getBDTeamView:       admin ✅ | bd_reviewer ✅ | internal_submitter ❌ | unauthenticated ❌
 *     - getSourceAnalysis:   admin ✅ | bd_reviewer ❌ | internal_submitter ❌ | unauthenticated ❌
 *     - exportPipelineReport: admin ✅ | bd_reviewer ✅ | internal_submitter ❌ | unauthenticated ❌
 *
 *   Input validation (Zod + refine):
 *     - from > to → BAD_REQUEST
 *     - range > 365 days → BAD_REQUEST
 *     - invalid datetime string → BAD_REQUEST
 *     - export with missing format → BAD_REQUEST
 *
 *   Happy-path return shapes (admin + bd_reviewer)
 *
 * Uses createCallerFactory for test calling without HTTP.
 * DashboardService is mocked via vi.mock — no DB or Supabase required.
 *
 * Ref:
 *   - design/api-spec.md — Role × Procedure Matrix, Input Schemas
 *   - design/components.md — DashboardRouter (Component 1)
 *   - Task 4.1 (router implementation)
 *   - Task 7.3 (this test file)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DashboardService ────────────────────────────────────────────────────

const mockGetExecutiveSummary = vi.fn();
const mockGetBDTeamView = vi.fn();
const mockGetSourceAnalysis = vi.fn();
const mockGetPipelineReportData = vi.fn();

vi.mock("@/modules/dashboard-analytics/service", () => ({
  dashboardService: {
    getExecutiveSummary: mockGetExecutiveSummary,
    getBDTeamView: mockGetBDTeamView,
    getSourceAnalysis: mockGetSourceAnalysis,
    getPipelineReportData: mockGetPipelineReportData,
  },
}));

// ─── Mock Supabase server client ──────────────────────────────────────────────

const mockSupabaseClient = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
  createAdminSupabaseClient: vi.fn(() => mockSupabaseClient),
}));

// ─── Mock auth helpers ────────────────────────────────────────────────────────

vi.mock("@/lib/auth/server", () => ({
  getServerSession: vi.fn(),
}));

// ─── Mock RBAC (real hierarchy — same as src/lib/auth/rbac.ts) ───────────────

vi.mock("@/lib/auth/rbac", () => ({
  hasRole: vi.fn((userRole: string, requiredRole: string) => {
    const hierarchy = ["guest", "internal_submitter", "bd_reviewer", "admin"];
    return hierarchy.indexOf(userRole) >= hierarchy.indexOf(requiredRole);
  }),
}));

// ─── Test data ────────────────────────────────────────────────────────────────

/** Valid date range: 30-day window within the 365-day limit */
const VALID_FROM = "2026-01-01T00:00:00.000Z";
const VALID_TO = "2026-01-31T23:59:59.999Z";

/** Over-1-year range (366 days) */
const RANGE_OVER_1_YEAR_FROM = "2026-01-01T00:00:00.000Z";
const RANGE_OVER_1_YEAR_TO = "2027-01-02T23:59:59.999Z"; // 366 days

/** from > to */
const FROM_AFTER_TO_FROM = "2026-06-01T00:00:00.000Z";
const FROM_AFTER_TO_TO = "2026-01-01T00:00:00.000Z";

const USER_ID = "user-uuid-0001-e5f6-7890-abcd-ef1234567890";

// ─── Fixture data ─────────────────────────────────────────────────────────────

const MOCK_EXECUTIVE_SUMMARY = {
  totalIdeas: 47,
  ideaCountByStage: [
    { stage: "sandbox", count: 18 },
    { stage: "validation_sprint", count: 12 },
  ],
  winNoGoStats: {
    totalClosed: 6,
    closedGo: 4,
    closedNoGo: 2,
    inProgress: 41,
    winRate: 0.667,
  },
  avgTimePerStage: [{ stage: "sandbox", avgDays: 7.3 }],
  dateRange: { from: VALID_FROM, to: VALID_TO },
};

const MOCK_BD_TEAM_VIEW = {
  pendingReviewCount: 9,
  reviewerWorkload: [
    {
      reviewerId: "reviewer-uuid-0001",
      reviewerName: "เบลล์",
      ideaCount: 15,
      byStage: [
        { stage: "sandbox", count: 6 },
        { stage: "validation_sprint", count: 9 },
      ],
    },
  ],
  dateRange: { from: VALID_FROM, to: VALID_TO },
};

const MOCK_SOURCE_ANALYSIS = {
  totalIdeas: 47,
  bySubmitterType: [
    { submitterType: "employee", count: 20, percentage: 42.6 },
    { submitterType: "partner", count: 15, percentage: 31.9 },
  ],
  dateRange: { from: VALID_FROM, to: VALID_TO },
};

const MOCK_PIPELINE_REPORT = {
  generatedAt: "2026-01-31T12:00:00.000Z",
  dateRange: { from: VALID_FROM, to: VALID_TO },
  summary: MOCK_EXECUTIVE_SUMMARY,
  sourceAnalysis: MOCK_SOURCE_ANALYSIS,
  bdWorkload: MOCK_BD_TEAM_VIEW,
  ideas: [
    {
      referenceNumber: "LP-2026-000001",
      title: "Test Idea Alpha",
      submitterType: "employee",
      submittedAt: "2026-01-05T09:00:00.000Z",
      currentStage: "sandbox",
      ideaType: "SaaS",
      assignedReviewer: "เบลล์",
      lastUpdatedAt: "2026-01-10T12:00:00.000Z",
    },
  ],
};

// ─── Context factory ──────────────────────────────────────────────────────────

function makeContext(role?: string) {
  if (!role) {
    return {
      db: mockSupabaseClient,
      session: null,
      user: null,
      role: null,
    };
  }

  return {
    db: mockSupabaseClient,
    session: { user: { id: USER_ID, email: "user@applica.co.th" } },
    user: {
      id: USER_ID,
      email: "user@applica.co.th",
      user_metadata: { full_name: "Test User", role },
    },
    role,
  };
}

// ─── Caller factory ───────────────────────────────────────────────────────────

async function makeCaller(role?: string) {
  const { dashboardRouter } = await import("@/modules/dashboard-analytics/router");
  const { createCallerFactory } = await import("@/server/trpc");
  const factory = createCallerFactory(dashboardRouter);
  return factory(makeContext(role) as Parameters<typeof factory>[0]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DashboardRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getExecutiveSummary
  // ══════════════════════════════════════════════════════════════════════════

  describe("getExecutiveSummary", () => {
    // ── Role guard ────────────────────────────────────────────────────────

    it("allows admin to call getExecutiveSummary", async () => {
      mockGetExecutiveSummary.mockResolvedValue(MOCK_EXECUTIVE_SUMMARY);

      const caller = await makeCaller("admin");
      const result = await caller.getExecutiveSummary({ from: VALID_FROM, to: VALID_TO });

      expect(result.totalIdeas).toBe(47);
      expect(result.winNoGoStats.winRate).toBe(0.667);
      expect(mockGetExecutiveSummary).toHaveBeenCalledOnce();
    });

    it("allows bd_reviewer to call getExecutiveSummary", async () => {
      mockGetExecutiveSummary.mockResolvedValue(MOCK_EXECUTIVE_SUMMARY);

      const caller = await makeCaller("bd_reviewer");
      const result = await caller.getExecutiveSummary({ from: VALID_FROM, to: VALID_TO });

      expect(result.totalIdeas).toBe(47);
    });

    it("blocks internal_submitter from getExecutiveSummary (FORBIDDEN)", async () => {
      const caller = await makeCaller("internal_submitter");

      await expect(
        caller.getExecutiveSummary({ from: VALID_FROM, to: VALID_TO })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("blocks unauthenticated caller from getExecutiveSummary (UNAUTHORIZED)", async () => {
      const caller = await makeCaller(); // no role

      await expect(
        caller.getExecutiveSummary({ from: VALID_FROM, to: VALID_TO })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    // ── Input validation ──────────────────────────────────────────────────

    it("rejects from > to with BAD_REQUEST", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.getExecutiveSummary({ from: FROM_AFTER_TO_FROM, to: FROM_AFTER_TO_TO })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects date range > 365 days with BAD_REQUEST", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.getExecutiveSummary({ from: RANGE_OVER_1_YEAR_FROM, to: RANGE_OVER_1_YEAR_TO })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects invalid datetime string with BAD_REQUEST", async () => {
      const caller = await makeCaller("admin");

      await expect(
        // @ts-expect-error — intentionally passing invalid input
        caller.getExecutiveSummary({ from: "not-a-date", to: VALID_TO })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    // ── Return shape ──────────────────────────────────────────────────────

    it("returns correct shape: ideaCountByStage is an array", async () => {
      mockGetExecutiveSummary.mockResolvedValue(MOCK_EXECUTIVE_SUMMARY);

      const caller = await makeCaller("admin");
      const result = await caller.getExecutiveSummary({ from: VALID_FROM, to: VALID_TO });

      expect(Array.isArray(result.ideaCountByStage)).toBe(true);
      expect(result.ideaCountByStage[0]).toMatchObject({
        stage: expect.any(String),
        count: expect.any(Number),
      });
    });

    it("echoes back the requested date range", async () => {
      mockGetExecutiveSummary.mockResolvedValue(MOCK_EXECUTIVE_SUMMARY);

      const caller = await makeCaller("admin");
      const result = await caller.getExecutiveSummary({ from: VALID_FROM, to: VALID_TO });

      expect(result.dateRange.from).toBe(VALID_FROM);
      expect(result.dateRange.to).toBe(VALID_TO);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getBDTeamView
  // ══════════════════════════════════════════════════════════════════════════

  describe("getBDTeamView", () => {
    // ── Role guard ────────────────────────────────────────────────────────

    it("allows admin to call getBDTeamView", async () => {
      mockGetBDTeamView.mockResolvedValue(MOCK_BD_TEAM_VIEW);

      const caller = await makeCaller("admin");
      const result = await caller.getBDTeamView({ from: VALID_FROM, to: VALID_TO });

      expect(result.pendingReviewCount).toBe(9);
    });

    it("allows bd_reviewer to call getBDTeamView", async () => {
      mockGetBDTeamView.mockResolvedValue(MOCK_BD_TEAM_VIEW);

      const caller = await makeCaller("bd_reviewer");
      const result = await caller.getBDTeamView({ from: VALID_FROM, to: VALID_TO });

      expect(result.reviewerWorkload).toHaveLength(1);
      expect(result.reviewerWorkload[0]?.reviewerName).toBe("เบลล์");
    });

    it("blocks internal_submitter from getBDTeamView (FORBIDDEN)", async () => {
      const caller = await makeCaller("internal_submitter");

      await expect(caller.getBDTeamView({ from: VALID_FROM, to: VALID_TO })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("blocks unauthenticated caller from getBDTeamView (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();

      await expect(caller.getBDTeamView({ from: VALID_FROM, to: VALID_TO })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    // ── Input validation ──────────────────────────────────────────────────

    it("rejects from > to with BAD_REQUEST", async () => {
      const caller = await makeCaller("bd_reviewer");

      await expect(
        caller.getBDTeamView({ from: FROM_AFTER_TO_FROM, to: FROM_AFTER_TO_TO })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects date range > 365 days with BAD_REQUEST", async () => {
      const caller = await makeCaller("bd_reviewer");

      await expect(
        caller.getBDTeamView({ from: RANGE_OVER_1_YEAR_FROM, to: RANGE_OVER_1_YEAR_TO })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    // ── Return shape ──────────────────────────────────────────────────────

    it("returns reviewerWorkload array with byStage breakdown", async () => {
      mockGetBDTeamView.mockResolvedValue(MOCK_BD_TEAM_VIEW);

      const caller = await makeCaller("bd_reviewer");
      const result = await caller.getBDTeamView({ from: VALID_FROM, to: VALID_TO });

      const reviewer = result.reviewerWorkload[0];
      expect(reviewer).toBeDefined();
      expect(Array.isArray(reviewer!.byStage)).toBe(true);
      expect(reviewer!.ideaCount).toBeGreaterThan(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getSourceAnalysis
  // ══════════════════════════════════════════════════════════════════════════

  describe("getSourceAnalysis", () => {
    // ── Role guard — admin-only procedure ────────────────────────────────

    it("allows admin to call getSourceAnalysis", async () => {
      mockGetSourceAnalysis.mockResolvedValue(MOCK_SOURCE_ANALYSIS);

      const caller = await makeCaller("admin");
      const result = await caller.getSourceAnalysis({ from: VALID_FROM, to: VALID_TO });

      expect(result.totalIdeas).toBe(47);
      expect(result.bySubmitterType).toHaveLength(2);
    });

    it("blocks bd_reviewer from getSourceAnalysis (FORBIDDEN)", async () => {
      const caller = await makeCaller("bd_reviewer");

      await expect(
        caller.getSourceAnalysis({ from: VALID_FROM, to: VALID_TO })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("blocks internal_submitter from getSourceAnalysis (FORBIDDEN)", async () => {
      const caller = await makeCaller("internal_submitter");

      await expect(
        caller.getSourceAnalysis({ from: VALID_FROM, to: VALID_TO })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("blocks unauthenticated caller from getSourceAnalysis (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();

      await expect(
        caller.getSourceAnalysis({ from: VALID_FROM, to: VALID_TO })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    // ── Input validation ──────────────────────────────────────────────────

    it("rejects from > to with BAD_REQUEST", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.getSourceAnalysis({ from: FROM_AFTER_TO_FROM, to: FROM_AFTER_TO_TO })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects date range > 365 days with BAD_REQUEST", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.getSourceAnalysis({ from: RANGE_OVER_1_YEAR_FROM, to: RANGE_OVER_1_YEAR_TO })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    // ── Return shape ──────────────────────────────────────────────────────

    it("returns bySubmitterType array with percentage field", async () => {
      mockGetSourceAnalysis.mockResolvedValue(MOCK_SOURCE_ANALYSIS);

      const caller = await makeCaller("admin");
      const result = await caller.getSourceAnalysis({ from: VALID_FROM, to: VALID_TO });

      for (const row of result.bySubmitterType) {
        expect(typeof row.percentage).toBe("number");
        expect(row.percentage).toBeGreaterThanOrEqual(0);
        expect(row.percentage).toBeLessThanOrEqual(100);
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // exportPipelineReport
  // ══════════════════════════════════════════════════════════════════════════

  describe("exportPipelineReport", () => {
    const VALID_EXPORT_INPUT = { from: VALID_FROM, to: VALID_TO, format: "excel" as const };

    // ── Role guard ────────────────────────────────────────────────────────

    it("allows admin to call exportPipelineReport", async () => {
      mockGetPipelineReportData.mockResolvedValue(MOCK_PIPELINE_REPORT);

      const caller = await makeCaller("admin");
      const result = await caller.exportPipelineReport(VALID_EXPORT_INPUT);

      expect(result.generatedAt).toBeTruthy();
      expect(Array.isArray(result.ideas)).toBe(true);
    });

    it("allows bd_reviewer to call exportPipelineReport", async () => {
      mockGetPipelineReportData.mockResolvedValue(MOCK_PIPELINE_REPORT);

      const caller = await makeCaller("bd_reviewer");
      const result = await caller.exportPipelineReport(VALID_EXPORT_INPUT);

      expect(result.ideas).toHaveLength(1);
    });

    it("blocks internal_submitter from exportPipelineReport (FORBIDDEN)", async () => {
      const caller = await makeCaller("internal_submitter");

      await expect(caller.exportPipelineReport(VALID_EXPORT_INPUT)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("blocks unauthenticated caller from exportPipelineReport (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();

      await expect(caller.exportPipelineReport(VALID_EXPORT_INPUT)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    // ── Input validation ──────────────────────────────────────────────────

    it("rejects from > to with BAD_REQUEST", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.exportPipelineReport({
          from: FROM_AFTER_TO_FROM,
          to: FROM_AFTER_TO_TO,
          format: "excel",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects date range > 365 days with BAD_REQUEST", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.exportPipelineReport({
          from: RANGE_OVER_1_YEAR_FROM,
          to: RANGE_OVER_1_YEAR_TO,
          format: "excel",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects unknown format value with BAD_REQUEST", async () => {
      const caller = await makeCaller("admin");

      await expect(
        // @ts-expect-error — intentionally passing invalid format
        caller.exportPipelineReport({ from: VALID_FROM, to: VALID_TO, format: "pdf" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    // ── 10 000-row cap ────────────────────────────────────────────────────

    it("throws PAYLOAD_TOO_LARGE when ideas exceed 10 000 rows", async () => {
      const bigReport = {
        ...MOCK_PIPELINE_REPORT,
        ideas: Array.from({ length: 10_001 }, (_, i) => ({
          referenceNumber: `LP-2026-${String(i).padStart(6, "0")}`,
          title: `Idea ${i}`,
          submitterType: "employee",
          submittedAt: VALID_FROM,
          currentStage: "sandbox",
          ideaType: "SaaS",
          assignedReviewer: null,
          lastUpdatedAt: VALID_FROM,
        })),
      };
      mockGetPipelineReportData.mockResolvedValue(bigReport);

      const caller = await makeCaller("admin");

      await expect(caller.exportPipelineReport(VALID_EXPORT_INPUT)).rejects.toMatchObject({
        code: "PAYLOAD_TOO_LARGE",
      });
    });

    // ── Return shape ──────────────────────────────────────────────────────

    it("returns report with nested summary, sourceAnalysis, bdWorkload", async () => {
      mockGetPipelineReportData.mockResolvedValue(MOCK_PIPELINE_REPORT);

      const caller = await makeCaller("admin");
      const result = await caller.exportPipelineReport(VALID_EXPORT_INPUT);

      expect(result.summary).toMatchObject({ totalIdeas: expect.any(Number) });
      expect(result.sourceAnalysis).toMatchObject({ totalIdeas: expect.any(Number) });
      expect(result.bdWorkload).toMatchObject({ pendingReviewCount: expect.any(Number) });
    });

    it('accepts format = "print"', async () => {
      mockGetPipelineReportData.mockResolvedValue(MOCK_PIPELINE_REPORT);

      const caller = await makeCaller("admin");
      const result = await caller.exportPipelineReport({
        from: VALID_FROM,
        to: VALID_TO,
        format: "print",
      });

      expect(result.generatedAt).toBeTruthy();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Cross-cutting — exact boundary values for date range validation
  // ══════════════════════════════════════════════════════════════════════════

  describe("DateRangeSchema boundary values", () => {
    it("accepts exactly 365-day range (boundary, inclusive)", async () => {
      mockGetExecutiveSummary.mockResolvedValue(MOCK_EXECUTIVE_SUMMARY);

      const from = "2026-01-01T00:00:00.000Z";
      // 365 days later — exactly at the limit
      const to = "2027-01-01T00:00:00.000Z"; // exactly 365 days

      const caller = await makeCaller("admin");
      // Should NOT throw — boundary is ≤ 365
      await expect(caller.getExecutiveSummary({ from, to })).resolves.toBeDefined();
    });

    it("accepts from === to (same instant, 0-day range)", async () => {
      mockGetExecutiveSummary.mockResolvedValue(MOCK_EXECUTIVE_SUMMARY);

      const caller = await makeCaller("admin");
      await expect(
        caller.getExecutiveSummary({ from: VALID_FROM, to: VALID_FROM })
      ).resolves.toBeDefined();
    });
  });
});
