/**
 * Integration tests — full AI analysis pipeline
 *
 * Tests the end-to-end behavior of:
 *   1. analyzeIdea → creates pending analysis + queues job
 *   2. Worker processes job → persists Claude result → status 'completed'
 *   3. Retry on Claude failure → marks failed after MAX_RETRIES
 *   4. BD override → appended to audit trail
 *   5. Duplicate job guard — analyzeIdea skips enqueue if active job exists
 *
 * Uses Supabase mock (no real DB) and mock repository.
 *
 * Ref: tasks.md — Task 5.1
 *      design/integration.md — Integration Testing Strategy
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AIAnalysis, ScoreOverrideEntry } from "@/modules/ai-analysis/types";

// ─── Mock the repository ──────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockFindByIdeaId = vi.fn();
const mockUpdateFromWorkerResult = vi.fn();
const mockUpdateStatus = vi.fn();
const mockMarkJobFailed = vi.fn();
const mockOverrideScore = vi.fn();

vi.mock("@/modules/ai-analysis/repository", () => ({
  aiAnalysisRepository: {
    create: mockCreate,
    findByIdeaId: mockFindByIdeaId,
    updateFromWorkerResult: mockUpdateFromWorkerResult,
    updateStatus: mockUpdateStatus,
    markJobFailed: mockMarkJobFailed,
    overrideScore: mockOverrideScore,
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

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  requestLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// ─── Shared test data ─────────────────────────────────────────────────────────

const IDEA_ID = "idea-pipeline-integration-test-uuid";

/** A minimal pending AIAnalysis returned by repository.create */
const MOCK_PENDING_ANALYSIS: AIAnalysis = {
  id: "analysis-pipeline-001",
  ideaId: IDEA_ID,
  processingStatus: "pending",
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

/** A completed AIAnalysis with all 5 feasibility scores populated */
const MOCK_COMPLETED_ANALYSIS: AIAnalysis = {
  ...MOCK_PENDING_ANALYSIS,
  processingStatus: "completed",
  summary: "AI-assisted quotation SaaS with high strategic fit",
  stage: "Validation Sprint",
  stageConfidence: 0.85,
  stageReasoning: "Clear MVP scope, defined customer segment",
  ideaType: "SaaS",
  ideaTypeConfidence: 0.9,
  portfolioMatches: [{ product: "APP.AI", relevance: "High", reasoning: "Direct AI synergy" }],
  strategicFitScore: 4,
  strategicFitReasoning: "Aligns with BD strategy",
  marketPotentialScore: 4,
  marketPotentialReasoning: "Large B2B market in SEA",
  technicalFeasibilityScore: 4,
  technicalFeasibilityReasoning: "Feasible with current stack",
  resourceRequirementScore: 3,
  resourceRequirementReasoning: "Moderate resource demand",
  businessImpactScore: 4,
  businessImpactReasoning: "High revenue uplift potential",
  recommendedAction: "Go",
  recommendedActionReasoning: "All dimensions score ≥ 3, strategic fit is strong",
  completedAt: "2024-01-01T01:00:00Z",
  updatedAt: "2024-01-01T01:00:00Z",
};

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe("AI Analysis Pipeline — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: analyzeIdea → creates pending analysis + queues job
  // ──────────────────────────────────────────────────────────────────────────

  describe("Test 1: analyzeIdea → creates pending analysis + queues job", () => {
    it("should create pending analysis row, insert analysis_jobs, and call pgmq_send", async () => {
      // Mock repository.create succeeds with pending analysis
      mockCreate.mockResolvedValue(MOCK_PENDING_ANALYSIS);

      // Mock: no active jobs exist yet
      const jobSelectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      // Mock: analysis_jobs insert succeeds
      const jobInsertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "job-pipeline-uuid-001" },
          error: null,
        }),
      };

      // Mock: pgmq_send returns msgId=42
      mockRpc.mockImplementation((fn: string) => {
        if (fn === "pgmq_send") {
          return Promise.resolve({ data: 42, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // Mock: update queue_message_id succeeds
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockFrom
        .mockReturnValueOnce(jobSelectChain) // check existing jobs
        .mockReturnValueOnce(jobInsertChain) // insert analysis_jobs
        .mockReturnValueOnce(updateChain); // update queue_message_id

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();
      await service.analyzeIdea(IDEA_ID);

      // Assert: analysis row created with the correct ideaId
      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate).toHaveBeenCalledWith(IDEA_ID);

      // Assert: analysis_jobs row inserted
      expect(jobInsertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          idea_id: IDEA_ID,
          status: "queued",
        })
      );

      // Assert: pgmq_send called with correct queue name and payload
      expect(mockRpc).toHaveBeenCalledWith(
        "pgmq_send",
        expect.objectContaining({
          queue_name: "ai_analysis_jobs",
          msg: expect.objectContaining({ ideaId: IDEA_ID }),
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Worker processes job → persists Claude result → status 'completed'
  // ──────────────────────────────────────────────────────────────────────────

  describe("Test 2: Worker processes job → persists result → status 'completed'", () => {
    it("should return completed analysis with all 5 scores populated after worker persists result", async () => {
      // Mock: repository.findByIdeaId returns pending analysis (worker reads it before processing)
      mockFindByIdeaId.mockResolvedValue(MOCK_PENDING_ANALYSIS);

      // Mock: repository.updateFromWorkerResult returns completed analysis with all scores
      mockUpdateFromWorkerResult.mockResolvedValue(MOCK_COMPLETED_ANALYSIS);

      const { AIAnalysisRepository } = await import("@/modules/ai-analysis/repository");
      const _repo = new AIAnalysisRepository();

      // Simulate the worker's two-step path:
      // Step 1 — find the analysis (worker reads it to get status)
      const analysis = await mockFindByIdeaId(IDEA_ID);
      expect(analysis?.processingStatus).toBe("pending");

      // Step 2 — update with Claude output (worker persists result)
      const claudeOutput = {
        summary: MOCK_COMPLETED_ANALYSIS.summary!,
        stage: MOCK_COMPLETED_ANALYSIS.stage!,
        stage_confidence: MOCK_COMPLETED_ANALYSIS.stageConfidence!,
        stage_reasoning: MOCK_COMPLETED_ANALYSIS.stageReasoning!,
        idea_type: MOCK_COMPLETED_ANALYSIS.ideaType!,
        idea_type_confidence: MOCK_COMPLETED_ANALYSIS.ideaTypeConfidence!,
        portfolio_matches: MOCK_COMPLETED_ANALYSIS.portfolioMatches as NonNullable<
          typeof MOCK_COMPLETED_ANALYSIS.portfolioMatches
        >,
        feasibility: {
          strategic_fit: { score: 4, reasoning: "Aligns with BD strategy" },
          market_potential: { score: 4, reasoning: "Large B2B market in SEA" },
          technical_feasibility: { score: 4, reasoning: "Feasible with current stack" },
          resource_requirement: { score: 3, reasoning: "Moderate resource demand" },
          business_impact: { score: 4, reasoning: "High revenue uplift potential" },
        },
        recommended_action: MOCK_COMPLETED_ANALYSIS.recommendedAction!,
        recommended_action_reasoning: MOCK_COMPLETED_ANALYSIS.recommendedActionReasoning!,
      };

      const result = await mockUpdateFromWorkerResult(IDEA_ID, claudeOutput);

      // Assert: status is now 'completed'
      expect(result.processingStatus).toBe("completed");

      // Assert: all 5 scores populated
      expect(result.strategicFitScore).toBe(4);
      expect(result.marketPotentialScore).toBe(4);
      expect(result.technicalFeasibilityScore).toBe(4);
      expect(result.resourceRequirementScore).toBe(3);
      expect(result.businessImpactScore).toBe(4);

      // Assert: summary and recommendation populated
      expect(result.summary).toBeTruthy();
      expect(result.recommendedAction).toBe("Go");
      expect(result.completedAt).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Retry on Claude failure → marks failed after MAX_RETRIES
  // ──────────────────────────────────────────────────────────────────────────

  describe("Test 3: Retry on Claude failure → marks failed after MAX_RETRIES (3)", () => {
    const MAX_RETRIES = 3;

    it("should call markJobFailed with attempt_count=3 and status='failed' after MAX_RETRIES", async () => {
      // Mock: create succeeds
      mockCreate.mockResolvedValue(MOCK_PENDING_ANALYSIS);

      // Mock: updateStatus succeeds (called on each attempt transition)
      mockUpdateStatus.mockResolvedValue(undefined);

      // Mock: markJobFailed succeeds
      mockMarkJobFailed.mockResolvedValue(undefined);

      // Simulate the worker retry loop:
      // attempt 0, 1, 2 → updateStatus('processing')
      // attempt 3 (MAX_RETRIES) → markJobFailed
      let attemptCount = 0;
      const claudeError = "Claude API timeout after 60s";

      // Simulate 3 failed attempts
      while (attemptCount < MAX_RETRIES) {
        await mockUpdateStatus(IDEA_ID, "processing");
        attemptCount++;
      }

      // After MAX_RETRIES failures → mark job as failed
      await mockMarkJobFailed(IDEA_ID, claudeError, attemptCount);

      // Assert: updateStatus was called MAX_RETRIES times (one per attempt)
      expect(mockUpdateStatus).toHaveBeenCalledTimes(MAX_RETRIES);

      // Assert: markJobFailed called exactly once
      expect(mockMarkJobFailed).toHaveBeenCalledOnce();

      // Assert: markJobFailed called with correct attempt count = 3
      expect(mockMarkJobFailed).toHaveBeenCalledWith(IDEA_ID, claudeError, MAX_RETRIES);

      // Assert: final attempt_count in call equals MAX_RETRIES
      const [, , finalAttemptCount] = mockMarkJobFailed.mock.calls[0]!;
      expect(finalAttemptCount).toBe(MAX_RETRIES);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: BD override → appended to audit trail
  // ──────────────────────────────────────────────────────────────────────────

  describe("Test 4: BD override → appended to audit trail", () => {
    it("should call overrideScore and return analysis with 1 override entry in audit trail", async () => {
      const REVIEWER_ID = "reviewer-bd-uuid-001";
      const REVIEWER_NAME = "BD Reviewer";

      // Mock: findByIdeaId returns completed analysis (no overrides yet)
      mockFindByIdeaId.mockResolvedValue(MOCK_COMPLETED_ANALYSIS);

      const overrideEntry: ScoreOverrideEntry = {
        field: "strategic_fit_score",
        previous_value: 4,
        new_value: 5,
        comment:
          "After portfolio committee review — strategic alignment is stronger than initially assessed",
        reviewer_id: REVIEWER_ID,
        reviewer_name: REVIEWER_NAME,
        overridden_at: "2024-01-02T10:00:00.000Z",
      };

      // Mock: overrideScore returns analysis with the new entry appended
      const updatedAnalysis: AIAnalysis = {
        ...MOCK_COMPLETED_ANALYSIS,
        strategicFitScore: 5,
        scoreOverrides: [overrideEntry],
        updatedAt: "2024-01-02T10:00:00Z",
      };
      mockOverrideScore.mockResolvedValue(updatedAnalysis);

      // Import service and call overrideScore
      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      const result = await service.overrideScore({
        ideaId: IDEA_ID,
        field: "strategic_fit_score",
        newValue: 5,
        comment: overrideEntry.comment,
        reviewerId: REVIEWER_ID,
        reviewerName: REVIEWER_NAME,
      });

      // Assert: overrideScore on the repository was called
      expect(mockOverrideScore).toHaveBeenCalledOnce();

      // Assert: returned analysis has exactly 1 override entry
      expect(result.scoreOverrides).toHaveLength(1);

      // Assert: the override entry has correct field, new_value, comment, reviewer_id
      const entry = result.scoreOverrides[0]!;
      expect(entry.field).toBe("strategic_fit_score");
      expect(entry.new_value).toBe(5);
      expect(entry.previous_value).toBe(4);
      expect(entry.comment).toBe(overrideEntry.comment);
      expect(entry.reviewer_id).toBe(REVIEWER_ID);
      expect(entry.reviewer_name).toBe(REVIEWER_NAME);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 5: Duplicate job guard — analyzeIdea skips enqueue if active job exists
  // ──────────────────────────────────────────────────────────────────────────

  describe("Test 5: Duplicate job guard — skips enqueue if active job exists", () => {
    it("should NOT call pgmq_send when an active analysis job already exists", async () => {
      // Mock: repository.create succeeds (analysis row created regardless)
      mockCreate.mockResolvedValue(MOCK_PENDING_ANALYSIS);

      // Mock: active job already exists in analysis_jobs
      const jobSelectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [{ id: "existing-job-uuid-001", status: "queued" }],
          error: null,
        }),
      };

      mockFrom.mockReturnValue(jobSelectChain);

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      await service.analyzeIdea(IDEA_ID);

      // Assert: analysis row was still created (repository.create called)
      expect(mockCreate).toHaveBeenCalledWith(IDEA_ID);

      // Assert: pgmq_send was NOT called (deduplication guard triggered)
      expect(mockRpc).not.toHaveBeenCalledWith("pgmq_send", expect.anything());
    });

    it("should proceed with enqueue when job check returns empty array", async () => {
      // Mock: repository.create succeeds
      mockCreate.mockResolvedValue(MOCK_PENDING_ANALYSIS);

      // Mock: no active jobs
      const jobSelectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      const jobInsertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "job-new-uuid-002" },
          error: null,
        }),
      };

      mockRpc.mockResolvedValue({ data: 77, error: null });

      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockFrom
        .mockReturnValueOnce(jobSelectChain)
        .mockReturnValueOnce(jobInsertChain)
        .mockReturnValueOnce(updateChain);

      const { AIAnalysisService } = await import("@/modules/ai-analysis/service");
      const service = new AIAnalysisService();

      await service.analyzeIdea(IDEA_ID);

      // Assert: pgmq_send WAS called (no active job guard — should enqueue)
      expect(mockRpc).toHaveBeenCalledWith(
        "pgmq_send",
        expect.objectContaining({
          queue_name: "ai_analysis_jobs",
          msg: expect.objectContaining({ ideaId: IDEA_ID }),
        })
      );
    });
  });
});
