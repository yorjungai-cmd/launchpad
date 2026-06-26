/**
 * Unit tests for AIAnalysisService
 *
 * Tests:
 *   - analyzeIdea happy path (creates row + enqueues)
 *   - analyzeIdea deduplication guard (skips when active job exists)
 *   - getAnalysisResult returns null for unknown ideaId
 *
 * Uses vi.mock for Supabase client and repository.
 *
 * Ref: tasks.md — Task 2.6
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the repository ──────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockFindByIdeaId = vi.fn();

vi.mock("@/modules/ai-analysis/repository", () => ({
  aiAnalysisRepository: {
    create: mockCreate,
    findByIdeaId: mockFindByIdeaId,
    updateFromWorkerResult: vi.fn(),
    updateStatus: vi.fn(),
    markJobFailed: vi.fn(),
    overrideScore: vi.fn(),
  },
  AIAnalysisRepository: vi.fn(),
}));

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

// ─── Mock logger ──────────────────────────────────────────────────────────────

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock("@/lib/logger", () => ({
  default: mockLogger,
  requestLogger: vi.fn(() => mockLogger),
}));

// ─── Test data ────────────────────────────────────────────────────────────────

const IDEA_ID = "idea-uuid-service-test";

const MOCK_AI_ANALYSIS = {
  id: "analysis-uuid-001",
  ideaId: IDEA_ID,
  processingStatus: "pending" as const,
  attemptCount: 0,
  lastError: null,
  summary: null,
  stage: null,
  stageConfidence: null,
  stageReasoning: null,
  ideaType: null,
  ideaTypeConfidence: null,
  portfolioMatches: [],
  strategicFitScore: null,
  strategicFitReasoning: null,
  marketPotentialScore: null,
  marketPotentialReasoning: null,
  technicalFeasibilityScore: null,
  technicalFeasibilityReasoning: null,
  resourceRequirementScore: null,
  resourceRequirementReasoning: null,
  businessImpactScore: null,
  businessImpactReasoning: null,
  recommendedAction: null,
  recommendedActionReasoning: null,
  scoreOverrides: [],
  rawClaudeResponse: null,
  completedAt: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AIAnalysisService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("analyzeIdea()", () => {
    it("should create analysis row and enqueue job when no active job exists", async () => {
      // Setup: repository.create succeeds
      mockCreate.mockResolvedValue(MOCK_AI_ANALYSIS);

      // Setup: no active jobs
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      // Setup: analysis_jobs insert
      const insertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "job-uuid-001" },
          error: null,
        }),
      };

      // Setup: pgmq_send
      mockRpc.mockImplementation((fn: string) => {
        if (fn === "pgmq_send") {
          return Promise.resolve({ data: 42, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // Setup: update queue_message_id
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockFrom
        .mockReturnValueOnce(selectChain) // check existing jobs
        .mockReturnValueOnce(insertChain) // insert analysis_jobs
        .mockReturnValueOnce(updateChain); // update queue_message_id

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      await expect(service.analyzeIdea(IDEA_ID)).resolves.toBeUndefined();

      expect(mockCreate).toHaveBeenCalledWith(IDEA_ID);
      expect(mockRpc).toHaveBeenCalledWith(
        "pgmq_send",
        expect.objectContaining({
          queue_name: "ai_analysis_jobs",
          msg: expect.objectContaining({ ideaId: IDEA_ID }),
        })
      );
    });

    it("should skip enqueue if active job exists (deduplication guard)", async () => {
      // Setup: repository.create succeeds
      mockCreate.mockResolvedValue(MOCK_AI_ANALYSIS);

      // Setup: active job already exists
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [{ id: "existing-job-id", status: "queued" }],
          error: null,
        }),
      };

      mockFrom.mockReturnValue(selectChain);

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      await expect(service.analyzeIdea(IDEA_ID)).resolves.toBeUndefined();

      // repository.create should still be called
      expect(mockCreate).toHaveBeenCalledWith(IDEA_ID);

      // pgmq_send should NOT be called (deduplication guard)
      expect(mockRpc).not.toHaveBeenCalledWith("pgmq_send", expect.anything());
    });

    it("should handle job check DB error gracefully (fail open)", async () => {
      mockCreate.mockResolvedValue(MOCK_AI_ANALYSIS);

      // Setup: job check fails
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "DB connection error" },
        }),
      };

      // Setup: analysis_jobs insert
      const insertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "job-uuid-002" },
          error: null,
        }),
      };

      // Setup: pgmq_send
      mockRpc.mockImplementation((fn: string) => {
        if (fn === "pgmq_send") {
          return Promise.resolve({ data: 10, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockFrom
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain);

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      // Should not throw — fails open
      await expect(service.analyzeIdea(IDEA_ID)).resolves.toBeUndefined();
    });
  });

  describe("getAnalysisResult()", () => {
    it("should return null for an unknown ideaId", async () => {
      mockFindByIdeaId.mockResolvedValue(null);

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      const result = await service.getAnalysisResult("unknown-idea-id");
      expect(result).toBeNull();
      expect(mockFindByIdeaId).toHaveBeenCalledWith("unknown-idea-id");
    });

    it("should return AIAnalysis when analysis exists", async () => {
      mockFindByIdeaId.mockResolvedValue(MOCK_AI_ANALYSIS);

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      const result = await service.getAnalysisResult(IDEA_ID);
      expect(result).not.toBeNull();
      expect(result?.ideaId).toBe(IDEA_ID);
    });
  });

  describe("overrideScore()", () => {
    const COMPLETED_ANALYSIS = {
      ...MOCK_AI_ANALYSIS,
      processingStatus: "completed" as const,
      strategicFitScore: 3,
      marketPotentialScore: 4,
      technicalFeasibilityScore: 4,
      resourceRequirementScore: 3,
      businessImpactScore: 4,
    };

    const UPDATED_ANALYSIS = {
      ...COMPLETED_ANALYSIS,
      strategicFitScore: 5,
      scoreOverrides: [
        {
          field: "strategic_fit_score",
          previous_value: 3,
          new_value: 5,
          comment: "Revised after board review",
          reviewer_id: "a0000000-0000-0000-0000-000000000001",
          reviewer_name: "BD Reviewer",
          overridden_at: "2024-01-02T00:00:00.000Z",
        },
      ],
    };

    it("should return updated analysis on happy path", async () => {
      mockFindByIdeaId.mockResolvedValue(COMPLETED_ANALYSIS);

      // Patch overrideScore on the mocked repository singleton
      const { aiAnalysisRepository } = await import("@/modules/ai-analysis/repository");
      (aiAnalysisRepository.overrideScore as ReturnType<typeof vi.fn>) = vi
        .fn()
        .mockResolvedValue(UPDATED_ANALYSIS);

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      const result = await service.overrideScore({
        ideaId: IDEA_ID,
        field: "strategic_fit_score",
        newValue: 5,
        comment: "Revised after board review",
        reviewerId: "a0000000-0000-0000-0000-000000000001",
        reviewerName: "BD Reviewer",
      });

      expect(result.strategicFitScore).toBe(5);
      expect(result.scoreOverrides).toHaveLength(1);
      expect(aiAnalysisRepository.overrideScore).toHaveBeenCalledWith(
        IDEA_ID,
        "strategic_fit_score",
        5,
        expect.objectContaining({
          field: "strategic_fit_score",
          previous_value: 3,
          new_value: 5,
          comment: "Revised after board review",
          reviewer_id: "a0000000-0000-0000-0000-000000000001",
          reviewer_name: "BD Reviewer",
        })
      );
    });

    it("should throw ANALYSIS_NOT_FOUND when analysis does not exist", async () => {
      mockFindByIdeaId.mockResolvedValue(null);

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      await expect(
        service.overrideScore({
          ideaId: "non-existent-id",
          field: "strategic_fit_score",
          newValue: 4,
          comment: "test",
          reviewerId: "reviewer-uuid-001",
          reviewerName: "BD Reviewer",
        })
      ).rejects.toMatchObject({ code: "ANALYSIS_NOT_FOUND" });
    });

    it("should throw ANALYSIS_NOT_COMPLETED when status is not 'completed'", async () => {
      mockFindByIdeaId.mockResolvedValue({
        ...MOCK_AI_ANALYSIS,
        processingStatus: "pending" as const,
      });

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      await expect(
        service.overrideScore({
          ideaId: IDEA_ID,
          field: "strategic_fit_score",
          newValue: 4,
          comment: "test",
          reviewerId: "reviewer-uuid-001",
          reviewerName: "BD Reviewer",
        })
      ).rejects.toMatchObject({ code: "ANALYSIS_NOT_COMPLETED" });
    });
  });
});
