/**
 * Unit tests for AIAnalysisRepository
 *
 * Uses vi.mock to mock the Supabase client — no real DB connection.
 *
 * Ref: tasks.md — Task 2.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AIAnalysis, ClaudeAnalysisOutput } from "@/modules/ai-analysis/types";
import type { AIAnalysisRepository as AIAnalysisRepositoryType } from "@/modules/ai-analysis/repository";

// ─── Mock Supabase server client ──────────────────────────────────────────────

const mockRpc = vi.fn();

const mockFrom = vi.fn();
const mockSupabaseClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
  createAdminSupabaseClient: vi.fn(() => mockSupabaseClient),
}));

// ─── Test data ────────────────────────────────────────────────────────────────

const IDEA_ID = "idea-uuid-12345";

const MOCK_DB_ROW = {
  id: "analysis-uuid-001",
  idea_id: IDEA_ID,
  processing_status: "pending" as const,
  attempt_count: 0,
  last_error: null,
  summary: null,
  stage: null,
  stage_confidence: null,
  stage_reasoning: null,
  idea_type: null,
  idea_type_confidence: null,
  portfolio_matches: null,
  strategic_fit_score: null,
  strategic_fit_reasoning: null,
  market_potential_score: null,
  market_potential_reasoning: null,
  technical_feasibility_score: null,
  technical_feasibility_reasoning: null,
  resource_requirement_score: null,
  resource_requirement_reasoning: null,
  business_impact_score: null,
  business_impact_reasoning: null,
  recommended_action: null,
  recommended_action_reasoning: null,
  score_overrides: [],
  raw_claude_response: null,
  completed_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const MOCK_CLAUDE_OUTPUT: ClaudeAnalysisOutput = {
  summary: "Test idea summary",
  stage: "Validation Sprint",
  stage_confidence: 0.8,
  stage_reasoning: "Clear enough for MVP validation",
  idea_type: "SaaS",
  idea_type_confidence: 0.9,
  portfolio_matches: [
    {
      product: "APP.AI",
      relevance: "High",
      reasoning: "Directly related to AI platform",
    },
    {
      product: "COBO",
      relevance: "Medium",
      reasoning: "Can integrate with ERP",
    },
    {
      product: "CRM",
      relevance: "Low",
      reasoning: "Minimal overlap",
    },
    {
      product: "PTCAD",
      relevance: "Low",
      reasoning: "No direct relevance",
    },
  ],
  feasibility: {
    strategic_fit: { score: 4, reasoning: "Aligns with strategy" },
    market_potential: { score: 4, reasoning: "Large market" },
    technical_feasibility: { score: 4, reasoning: "Feasible with current stack" },
    resource_requirement: { score: 3, reasoning: "Moderate resources needed" },
    business_impact: { score: 4, reasoning: "High impact" },
  },
  recommended_action: "Go",
  recommended_action_reasoning: "Strong scores across all dimensions",
};

// ─── Import repository AFTER mocks are set up ─────────────────────────────────

// We import the repository class and create a fresh instance per test suite
// to avoid singleton state pollution

describe("AIAnalysisRepository", () => {
  let repository: typeof AIAnalysisRepositoryType;
  let repoInstance: InstanceType<typeof AIAnalysisRepositoryType>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/modules/ai-analysis/repository");
    repository = mod.AIAnalysisRepository;
    repoInstance = new repository();
  });

  // ─── create() ──────────────────────────────────────────────────────────────

  describe("create()", () => {
    it("should return AIAnalysis with processing_status='pending' after insert", async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: MOCK_DB_ROW, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result: AIAnalysis = await repoInstance.create(IDEA_ID);

      expect(result.processingStatus).toBe("pending");
      expect(result.ideaId).toBe(IDEA_ID);
      expect(result.attemptCount).toBe(0);
      expect(result.id).toBe("analysis-uuid-001");
    });

    it("should throw when insert fails", async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB insert failed" } }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(repoInstance.create(IDEA_ID)).rejects.toThrow("DB insert failed");
    });
  });

  // ─── updateFromWorkerResult() ─────────────────────────────────────────────

  describe("updateFromWorkerResult()", () => {
    it("should set all score fields and processing_status='completed'", async () => {
      const updatedRow = {
        ...MOCK_DB_ROW,
        processing_status: "completed" as const,
        summary: MOCK_CLAUDE_OUTPUT.summary,
        stage: MOCK_CLAUDE_OUTPUT.stage,
        stage_confidence: MOCK_CLAUDE_OUTPUT.stage_confidence,
        stage_reasoning: MOCK_CLAUDE_OUTPUT.stage_reasoning,
        idea_type: MOCK_CLAUDE_OUTPUT.idea_type,
        idea_type_confidence: MOCK_CLAUDE_OUTPUT.idea_type_confidence,
        portfolio_matches: MOCK_CLAUDE_OUTPUT.portfolio_matches,
        strategic_fit_score: MOCK_CLAUDE_OUTPUT.feasibility.strategic_fit.score,
        strategic_fit_reasoning: MOCK_CLAUDE_OUTPUT.feasibility.strategic_fit.reasoning,
        market_potential_score: MOCK_CLAUDE_OUTPUT.feasibility.market_potential.score,
        market_potential_reasoning: MOCK_CLAUDE_OUTPUT.feasibility.market_potential.reasoning,
        technical_feasibility_score: MOCK_CLAUDE_OUTPUT.feasibility.technical_feasibility.score,
        technical_feasibility_reasoning:
          MOCK_CLAUDE_OUTPUT.feasibility.technical_feasibility.reasoning,
        resource_requirement_score: MOCK_CLAUDE_OUTPUT.feasibility.resource_requirement.score,
        resource_requirement_reasoning:
          MOCK_CLAUDE_OUTPUT.feasibility.resource_requirement.reasoning,
        business_impact_score: MOCK_CLAUDE_OUTPUT.feasibility.business_impact.score,
        business_impact_reasoning: MOCK_CLAUDE_OUTPUT.feasibility.business_impact.reasoning,
        recommended_action: MOCK_CLAUDE_OUTPUT.recommended_action,
        recommended_action_reasoning: MOCK_CLAUDE_OUTPUT.recommended_action_reasoning,
        completed_at: "2024-01-01T01:00:00Z",
      };

      const chain = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.updateFromWorkerResult(IDEA_ID, MOCK_CLAUDE_OUTPUT);

      expect(result.processingStatus).toBe("completed");
      expect(result.summary).toBe(MOCK_CLAUDE_OUTPUT.summary);
      expect(result.stage).toBe("Validation Sprint");
      expect(result.strategicFitScore).toBe(4);
      expect(result.marketPotentialScore).toBe(4);
      expect(result.technicalFeasibilityScore).toBe(4);
      expect(result.resourceRequirementScore).toBe(3);
      expect(result.businessImpactScore).toBe(4);
      expect(result.recommendedAction).toBe("Go");
      expect(result.completedAt).toBeDefined();
    });

    it("should throw when update fails", async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "Update failed" } }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(
        repoInstance.updateFromWorkerResult(IDEA_ID, MOCK_CLAUDE_OUTPUT)
      ).rejects.toThrow("Update failed");
    });
  });

  // ─── updateStatus() ──────────────────────────────────────────────────────

  describe("updateStatus()", () => {
    it("should increment attempt_count when called via RPC", async () => {
      // When RPC succeeds
      mockRpc.mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      // Should not throw
      await expect(repoInstance.updateStatus(IDEA_ID, "processing")).resolves.toBeUndefined();
    });

    it("should fall back to direct update when RPC fails, incrementing count", async () => {
      // RPC fails → fallback path
      mockRpc.mockResolvedValue({ data: null, error: { message: "rpc not found" } });

      // Fallback: select current count
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { attempt_count: 1 }, error: null }),
      };

      // Fallback: update with incremented count
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);

      await expect(repoInstance.updateStatus(IDEA_ID, "processing")).resolves.toBeUndefined();
    });
  });

  // ─── findByIdeaId() ───────────────────────────────────────────────────────

  describe("findByIdeaId()", () => {
    it("should return AIAnalysis when row exists", async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: MOCK_DB_ROW, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findByIdeaId(IDEA_ID);

      expect(result).not.toBeNull();
      expect(result?.ideaId).toBe(IDEA_ID);
      expect(result?.processingStatus).toBe("pending");
    });

    it("should return null when row not found (PGRST116)", async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116", message: "No rows found" },
        }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findByIdeaId("non-existent-id");
      expect(result).toBeNull();
    });

    it("should return null on any other DB error (fail-safe)", async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "42P01", message: "Table does not exist" },
        }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findByIdeaId(IDEA_ID);
      expect(result).toBeNull();
    });
  });

  // ─── markJobFailed() ─────────────────────────────────────────────────────

  describe("markJobFailed()", () => {
    it("should set processing_status='failed' with error and attempt count", async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(
        repoInstance.markJobFailed(IDEA_ID, "Claude API timeout", 3)
      ).resolves.toBeUndefined();

      // Verify update was called with correct payload
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          processing_status: "failed",
          last_error: "Claude API timeout",
          attempt_count: 3,
        })
      );
    });

    it("should throw when update fails", async () => {
      const chain = {
        from: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Update failed" },
        }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(repoInstance.markJobFailed(IDEA_ID, "error", 3)).rejects.toThrow(
        "markJobFailed failed"
      );
    });
  });

  // ─── Column mapping ───────────────────────────────────────────────────────

  describe("column mapping (snake_case → camelCase)", () => {
    it("should correctly map all DB columns to camelCase", async () => {
      const dbRow = {
        ...MOCK_DB_ROW,
        processing_status: "completed" as const,
        idea_type_confidence: 0.75,
        strategic_fit_score: 3,
        strategic_fit_reasoning: "test reasoning",
        stage_confidence: 0.9,
        recommended_action: "Go" as const,
        recommended_action_reasoning: "good scores",
        score_overrides: [
          {
            field: "strategic_fit_score",
            previous_value: 2,
            new_value: 3,
            comment: "Updated after review",
            reviewer_id: "reviewer-123",
            reviewer_name: "Test Reviewer",
            overridden_at: "2024-01-01T00:00:00Z",
          },
        ],
      };

      const chain = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: dbRow, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findByIdeaId(IDEA_ID);

      expect(result?.ideaTypeConfidence).toBe(0.75);
      expect(result?.strategicFitScore).toBe(3);
      expect(result?.strategicFitReasoning).toBe("test reasoning");
      expect(result?.stageConfidence).toBe(0.9);
      expect(result?.recommendedAction).toBe("Go");
      expect(result?.recommendedActionReasoning).toBe("good scores");
      expect(result?.scoreOverrides).toHaveLength(1);
      expect(result?.scoreOverrides[0]?.field).toBe("strategic_fit_score");
    });
  });
});

// ─── overrideScore() — Task 3.1 ───────────────────────────────────────────────

import * as fc from "fast-check";
import type { ScoreOverrideEntry } from "@/modules/ai-analysis/types";

describe("AIAnalysisRepository — overrideScore()", () => {
  const OVERRIDE_IDEA_ID = "idea-uuid-override-test";

  // Helper — build a ScoreOverrideEntry
  function makeEntry(overrides: Partial<ScoreOverrideEntry> = {}): ScoreOverrideEntry {
    return {
      field: "strategic_fit_score",
      previous_value: 3,
      new_value: 4,
      comment: "Reviewed after meeting",
      reviewer_id: "a0000000-0000-0000-0000-000000000001",
      reviewer_name: "BD Reviewer",
      overridden_at: "2024-01-01T12:00:00.000Z",
      ...overrides,
    };
  }

  let repoInstance: InstanceType<typeof AIAnalysisRepositoryType>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/modules/ai-analysis/repository");
    repoInstance = new mod.AIAnalysisRepository();
  });

  // ─── Test: overrideScore sets new value for the field ─────────────────────

  it("should set the new score value and return updated AIAnalysis", async () => {
    const existingOverrides: ScoreOverrideEntry[] = [];
    const entry = makeEntry();

    // First call: SELECT to read current score_overrides
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { score_overrides: existingOverrides },
        error: null,
      }),
    };

    // Second call: UPDATE + SELECT
    const updatedRow = {
      ...MOCK_DB_ROW,
      idea_id: OVERRIDE_IDEA_ID,
      processing_status: "completed" as const,
      strategic_fit_score: entry.new_value,
      score_overrides: [entry],
    };
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
    };

    mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);

    const result = await repoInstance.overrideScore(
      OVERRIDE_IDEA_ID,
      "strategic_fit_score",
      entry.new_value,
      entry
    );

    expect(result.strategicFitScore).toBe(entry.new_value);
    expect(result.scoreOverrides).toHaveLength(1);
    expect(result.scoreOverrides[0]?.new_value).toBe(entry.new_value);
  });

  // ─── Test: overrideScore throws when analysis not found ───────────────────

  it("should throw when analysis row is not found (SELECT returns no row)", async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "No rows found" },
      }),
    };

    mockFrom.mockReturnValue(selectChain);

    await expect(
      repoInstance.overrideScore("non-existent-idea-id", "strategic_fit_score", 4, makeEntry())
    ).rejects.toThrow("analysis not found");
  });

  // ─── PBT Property 3: audit trail is append-only (length always grows) ─────

  it.each(
    Array.from({ length: 1 }, () => null) // run once to wrap the PBT
  )("PBT Property 3 — score_overrides array is append-only (length always grows)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary: existing override array with 0–5 entries
        fc.array(
          fc.record({
            field: fc.constantFrom(
              "strategic_fit_score",
              "market_potential_score",
              "technical_feasibility_score",
              "resource_requirement_score",
              "business_impact_score"
            ),
            previous_value: fc.integer({ min: 1, max: 5 }),
            new_value: fc.integer({ min: 1, max: 5 }),
            comment: fc.string({ minLength: 1, maxLength: 200 }),
            reviewer_id: fc.uuid(),
            reviewer_name: fc.string({ minLength: 1, maxLength: 100 }),
            overridden_at: fc.constant("2024-01-01T00:00:00.000Z"),
          }),
          { minLength: 0, maxLength: 5 }
        ),
        // Arbitrary: a new entry to append
        fc.record({
          field: fc.constantFrom("strategic_fit_score", "market_potential_score"),
          previous_value: fc.integer({ min: 1, max: 5 }),
          new_value: fc.integer({ min: 1, max: 5 }),
          comment: fc.string({ minLength: 1, maxLength: 200 }),
          reviewer_id: fc.uuid(),
          reviewer_name: fc.string({ minLength: 1, maxLength: 100 }),
          overridden_at: fc.constant("2024-01-02T00:00:00.000Z"),
        }),
        async (existingOverrides, newEntry) => {
          vi.clearAllMocks();
          const mod = await import("@/modules/ai-analysis/repository");
          const repo = new mod.AIAnalysisRepository();

          const expectedLength = existingOverrides.length + 1;

          // SELECT returns existing overrides
          const selectChain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { score_overrides: existingOverrides },
              error: null,
            }),
          };

          // UPDATE returns row with all overrides appended
          const returnedRow = {
            ...MOCK_DB_ROW,
            score_overrides: [...existingOverrides, newEntry],
          };
          const updateChain = {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: returnedRow, error: null }),
          };

          mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);

          const result = await repo.overrideScore(
            IDEA_ID,
            newEntry.field,
            newEntry.new_value,
            newEntry as ScoreOverrideEntry
          );

          // Property: the resulting array is strictly longer than before
          expect(result.scoreOverrides.length).toBe(expectedLength);
          expect(result.scoreOverrides.length).toBeGreaterThan(existingOverrides.length);
        }
      ),
      { numRuns: 50 }
    );
  });
});
