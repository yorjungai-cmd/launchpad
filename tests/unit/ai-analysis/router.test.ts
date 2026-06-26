/**
 * Integration tests for AIAnalysisRouter (tRPC procedures)
 *
 * Tests:
 *   - getByIdeaId: returns analysis when found
 *   - getByIdeaId: throws NOT_FOUND when analysis doesn't exist
 *   - overrideScore: rejects non-bd_reviewer callers (FORBIDDEN)
 *   - overrideScore: happy path returns updated entry
 *   - triggerReanalysis: requires admin role
 *   - listPending: requires bd_reviewer role
 *   - listPending: returns paginated list
 *
 * Uses createCallerFactory for test calling without HTTP.
 *
 * Ref: tasks.md — Task 3.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { AIAnalysis } from "@/modules/ai-analysis/types";

// ─── Mock the service ─────────────────────────────────────────────────────────

const mockGetAnalysisResult = vi.fn();
const mockOverrideScore = vi.fn();
const mockAnalyzeIdea = vi.fn();

vi.mock("@/modules/ai-analysis/service", () => ({
  aiAnalysisService: {
    getAnalysisResult: mockGetAnalysisResult,
    overrideScore: mockOverrideScore,
    analyzeIdea: mockAnalyzeIdea,
  },
}));

// ─── Mock Supabase server client ──────────────────────────────────────────────

const mockFrom = vi.fn();
const mockSupabaseClient = {
  from: mockFrom,
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

// ─── Mock RBAC ────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/rbac", () => ({
  hasRole: vi.fn((userRole: string, requiredRole: string) => {
    const hierarchy = ["guest", "internal_submitter", "bd_reviewer", "admin"];
    return hierarchy.indexOf(userRole) >= hierarchy.indexOf(requiredRole);
  }),
}));

// ─── Test data ────────────────────────────────────────────────────────────────

const IDEA_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const REVIEWER_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";

const MOCK_ANALYSIS: AIAnalysis = {
  id: "analysis-uuid-001",
  ideaId: IDEA_ID,
  processingStatus: "completed",
  attemptCount: 1,
  lastError: null,
  summary: "Strong AI product idea with clear market fit",
  stage: "Validation Sprint",
  stageConfidence: 0.85,
  stageReasoning: "Clear MVP scope",
  ideaType: "SaaS",
  ideaTypeConfidence: 0.9,
  portfolioMatches: [{ product: "APP.AI", relevance: "High", reasoning: "Direct synergy" }],
  strategicFitScore: 4,
  strategicFitReasoning: "Aligns with strategy",
  marketPotentialScore: 4,
  marketPotentialReasoning: "Large market",
  technicalFeasibilityScore: 4,
  technicalFeasibilityReasoning: "Feasible",
  resourceRequirementScore: 3,
  resourceRequirementReasoning: "Moderate",
  businessImpactScore: 4,
  businessImpactReasoning: "High impact",
  recommendedAction: "Go",
  recommendedActionReasoning: "All indicators positive",
  scoreOverrides: [],
  rawClaudeResponse: null,
  completedAt: "2024-01-01T12:00:00Z",
  createdAt: "2024-01-01T10:00:00Z",
  updatedAt: "2024-01-01T12:00:00Z",
};

const OVERRIDE_ENTRY = {
  field: "strategic_fit_score",
  previous_value: 4,
  new_value: 5,
  comment: "Post-review adjustment",
  reviewer_id: "b1b2c3d4-e5f6-7890-abcd-ef1234567890",
  reviewer_name: "BD Reviewer",
  overridden_at: "2024-01-02T00:00:00.000Z",
};

// ─── Context helpers ──────────────────────────────────────────────────────────

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
    session: { user: { id: REVIEWER_ID, email: "bd@applica.co.th" } },
    user: {
      id: REVIEWER_ID,
      email: "bd@applica.co.th",
      user_metadata: { full_name: "BD Reviewer", role },
    },
    role,
  };
}

// ─── Import router and create caller ─────────────────────────────────────────

async function makeRouter() {
  const { analysisRouter } = await import("@/modules/ai-analysis/router");
  return analysisRouter;
}

async function makeCaller(role?: string) {
  const { createCallerFactory } = await import("@/server/trpc");
  const router = await makeRouter();
  const factory = createCallerFactory(router);
  return factory(makeContext(role) as Parameters<typeof factory>[0]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AIAnalysisRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getByIdeaId ────────────────────────────────────────────────────────────

  describe("getByIdeaId", () => {
    it("returns analysis when found (authenticated)", async () => {
      mockGetAnalysisResult.mockResolvedValue(MOCK_ANALYSIS);

      const caller = await makeCaller("bd_reviewer");
      const result = await caller.getByIdeaId({ ideaId: IDEA_ID });

      expect(result.ideaId).toBe(IDEA_ID);
      expect(result.processingStatus).toBe("completed");
      expect(mockGetAnalysisResult).toHaveBeenCalledWith(IDEA_ID);
    });

    it("returns analysis when guest provides referenceNumber", async () => {
      mockGetAnalysisResult.mockResolvedValue(MOCK_ANALYSIS);

      const caller = await makeCaller(); // no role = guest
      const result = await caller.getByIdeaId({
        ideaId: IDEA_ID,
        referenceNumber: "LP-2024-001234",
      });

      expect(result.ideaId).toBe(IDEA_ID);
    });

    it("throws UNAUTHORIZED when guest has no referenceNumber", async () => {
      const caller = await makeCaller(); // guest, no session

      await expect(caller.getByIdeaId({ ideaId: IDEA_ID })).rejects.toThrow(TRPCError);
    });

    it("throws NOT_FOUND when analysis does not exist", async () => {
      mockGetAnalysisResult.mockResolvedValue(null);

      const caller = await makeCaller("bd_reviewer");

      await expect(caller.getByIdeaId({ ideaId: IDEA_ID })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  // ─── overrideScore ──────────────────────────────────────────────────────────

  describe("overrideScore", () => {
    it("rejects callers without bd_reviewer role (FORBIDDEN)", async () => {
      // internal_submitter does not have bd_reviewer role
      const caller = await makeCaller("internal_submitter");

      await expect(
        caller.overrideScore({
          ideaId: IDEA_ID,
          field: "strategic_fit_score",
          newValue: 5,
          comment: "test",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects unauthenticated callers (UNAUTHORIZED)", async () => {
      const caller = await makeCaller(); // no role

      await expect(
        caller.overrideScore({
          ideaId: IDEA_ID,
          field: "strategic_fit_score",
          newValue: 5,
          comment: "test",
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns updated entry on happy path (bd_reviewer)", async () => {
      const updatedAnalysis: AIAnalysis = {
        ...MOCK_ANALYSIS,
        strategicFitScore: 5,
        scoreOverrides: [OVERRIDE_ENTRY],
      };
      mockOverrideScore.mockResolvedValue(updatedAnalysis);

      const caller = await makeCaller("bd_reviewer");
      const result = await caller.overrideScore({
        ideaId: IDEA_ID,
        field: "strategic_fit_score",
        newValue: 5,
        comment: "Post-review adjustment",
      });

      expect(result.success).toBe(true);
      expect(result.updatedField).toBe("strategic_fit_score");
      expect(result.newValue).toBe(5);
      expect(result.overrideEntry.new_value).toBe(5);
      expect(mockOverrideScore).toHaveBeenCalledWith(
        expect.objectContaining({
          ideaId: IDEA_ID,
          field: "strategic_fit_score",
          newValue: 5,
          comment: "Post-review adjustment",
          reviewerId: REVIEWER_ID,
        })
      );
    });

    it("admin can also override score", async () => {
      const updatedAnalysis: AIAnalysis = {
        ...MOCK_ANALYSIS,
        strategicFitScore: 5,
        scoreOverrides: [OVERRIDE_ENTRY],
      };
      mockOverrideScore.mockResolvedValue(updatedAnalysis);

      const caller = await makeCaller("admin");
      const result = await caller.overrideScore({
        ideaId: IDEA_ID,
        field: "strategic_fit_score",
        newValue: 5,
        comment: "Admin adjustment",
      });

      expect(result.success).toBe(true);
    });
  });

  // ─── triggerReanalysis ──────────────────────────────────────────────────────

  describe("triggerReanalysis", () => {
    it("requires admin role — rejects bd_reviewer (FORBIDDEN)", async () => {
      const caller = await makeCaller("bd_reviewer");

      await expect(caller.triggerReanalysis({ ideaId: IDEA_ID })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("requires admin role — rejects unauthenticated (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();

      await expect(caller.triggerReanalysis({ ideaId: IDEA_ID })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("returns success when called by admin", async () => {
      mockAnalyzeIdea.mockResolvedValue(undefined);

      const caller = await makeCaller("admin");
      const result = await caller.triggerReanalysis({
        ideaId: IDEA_ID,
        reason: "Manual re-trigger by admin",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("queued");
      expect(mockAnalyzeIdea).toHaveBeenCalledWith(IDEA_ID);
    });
  });

  // ─── listPending ────────────────────────────────────────────────────────────

  describe("listPending", () => {
    it("requires bd_reviewer role — rejects internal_submitter (FORBIDDEN)", async () => {
      const caller = await makeCaller("internal_submitter");

      await expect(caller.listPending({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("requires bd_reviewer role — rejects unauthenticated (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();

      await expect(caller.listPending({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("returns paginated list for bd_reviewer", async () => {
      // Mock the DB call for listPending
      const mockRows = [
        {
          idea_id: IDEA_ID,
          stage: "Validation Sprint",
          idea_type: "SaaS",
          recommended_action: "Go",
          score_overrides: [],
          completed_at: "2024-01-01T12:00:00Z",
          ideas: { title: "Test Idea" },
        },
      ];

      const queryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
      };

      // Final resolution returns data
      (queryChain.limit as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockRows,
        error: null,
        count: 1,
      });

      mockFrom.mockReturnValue(queryChain);

      const caller = await makeCaller("bd_reviewer");
      const result = await caller.listPending({ limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.ideaId).toBe(IDEA_ID);
      expect(result.items[0]?.ideaTitle).toBe("Test Idea");
      expect(result.items[0]?.hasOverrides).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.total).toBe(1);
    });

    it("returns nextCursor when there are more pages", async () => {
      const LIMIT = 2;

      // Return LIMIT + 1 rows to trigger pagination
      const mockRows = Array.from({ length: LIMIT + 1 }, (_, i) => ({
        idea_id: `idea-uuid-${i + 1}00${i + 1}-e5f6-7890-abcd-ef1234567890`,
        stage: "Validation Sprint",
        idea_type: "SaaS",
        recommended_action: "Go",
        score_overrides: [],
        completed_at: `2024-01-0${i + 1}T12:00:00Z`,
        ideas: { title: `Idea ${i + 1}` },
      }));

      const queryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: mockRows,
          error: null,
          count: 10, // total items
        }),
      };

      mockFrom.mockReturnValue(queryChain);

      const caller = await makeCaller("bd_reviewer");
      const result = await caller.listPending({ limit: LIMIT });

      expect(result.items).toHaveLength(LIMIT);
      expect(result.nextCursor).not.toBeNull();
      expect(result.total).toBe(10);
    });
  });
});
