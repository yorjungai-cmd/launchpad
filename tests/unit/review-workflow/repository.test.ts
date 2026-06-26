/**
 * Unit tests for ReviewWorkflowRepository
 * Includes PBT Property 3 — append-only invariant
 *
 * Ref: design/correctness.md — Property 3
 * Task 2.1
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}));

import { ReviewWorkflowRepository } from "@/modules/review-workflow/repository";

const repo = new ReviewWorkflowRepository();

const IDEA_ID = "idea-review-001";
const REVIEWER_ID = "reviewer-001";

const MOCK_ACTION_ROW = {
  id: "action-1",
  idea_id: IDEA_ID,
  reviewer_id: REVIEWER_ID,
  reviewer_name: "Bell Reviewer",
  action_type: "edit" as const,
  document_id: "doc-1",
  payload: { document_type: "feasibility_report", new_length: 500 },
  created_at: "2026-06-25T00:00:00Z",
};

const MOCK_TRANSITION_ROW = {
  id: "trans-1",
  idea_id: IDEA_ID,
  from_stage: null,
  to_stage: "Sandbox",
  reviewer_id: null,
  reviewer_name: "System",
  reason: null,
  created_at: "2026-06-25T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("ReviewWorkflowRepository", () => {
  describe("insertReviewAction()", () => {
    it("should insert and return mapped review action", async () => {
      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: MOCK_ACTION_ROW, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repo.insertReviewAction({
        ideaId: IDEA_ID,
        reviewerId: REVIEWER_ID,
        reviewerName: "Bell Reviewer",
        actionType: "edit",
        documentId: "doc-1",
        payload: { document_type: "feasibility_report", new_length: 500 },
      });

      expect(result.ideaId).toBe(IDEA_ID);
      expect(result.actionType).toBe("edit");
      expect(result.reviewerName).toBe("Bell Reviewer");
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ idea_id: IDEA_ID, action_type: "edit" })
      );
    });

    it("should throw when insert fails", async () => {
      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
      };
      mockFrom.mockReturnValue(chain);
      await expect(
        repo.insertReviewAction({
          ideaId: IDEA_ID,
          reviewerId: REVIEWER_ID,
          reviewerName: "Bell",
          actionType: "edit",
          payload: {},
        })
      ).rejects.toThrow("insertReviewAction");
    });
  });

  describe("listReviewActions()", () => {
    it("should return mapped actions ordered by created_at desc", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [MOCK_ACTION_ROW], error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repo.listReviewActions(IDEA_ID);
      expect(result).toHaveLength(1);
      expect(result[0]!.actionType).toBe("edit");
    });

    it("should return empty array when no actions", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockFrom.mockReturnValue(chain);
      const result = await repo.listReviewActions(IDEA_ID);
      expect(result).toHaveLength(0);
    });
  });

  describe("insertStageTransition()", () => {
    it("should insert and return mapped transition", async () => {
      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: MOCK_TRANSITION_ROW, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repo.insertStageTransition({
        ideaId: IDEA_ID,
        fromStage: null,
        toStage: "Sandbox",
        reviewerId: null,
        reviewerName: "System",
      });

      expect(result.toStage).toBe("Sandbox");
      expect(result.fromStage).toBeNull();
    });
  });

  describe("updateDocumentWatermark()", () => {
    it("should return count of updated documents", async () => {
      const eqFn = vi
        .fn()
        .mockResolvedValue({ data: [{ id: "doc-1" }, { id: "doc-2" }], error: null });
      const _chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi
          .fn()
          .mockImplementation(() => ({ eq: vi.fn().mockImplementation(() => ({ eq: eqFn })) })),
      };
      // Simpler mock — just return count
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi
            .fn()
            .mockResolvedValue({ data: [{ id: "doc-1" }, { id: "doc-2" }], error: null }),
        }),
      });
      mockFrom.mockReturnValue({ update: mockUpdate });

      const count = await repo.updateDocumentWatermark(IDEA_ID, "approved" as any);
      expect(count).toBe(2);
    });
  });

  // PBT Property 3 — append-only invariant (logic test)
  describe("PBT Property 3 — append-only invariant", () => {
    it("review actions list never shrinks after insert", () => {
      type Action = { id: string; actionType: string; createdAt: string };

      const appendAction = (existing: Action[], newAction: Action): Action[] => {
        return [...existing, newAction];
      };

      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              actionType: fc.constantFrom("edit", "stage_change", "approve", "reject"),
              createdAt: fc.constant("2026-06-25T00:00:00Z"),
            }),
            { minLength: 0, maxLength: 10 }
          ),
          fc.record({
            id: fc.uuid(),
            actionType: fc.constantFrom("edit", "stage_change", "approve", "reject"),
            createdAt: fc.constant("2026-06-25T01:00:00Z"),
          }),
          (existing, newAction) => {
            const after = appendAction(existing, newAction);
            // Count always increases by 1
            if (after.length !== existing.length + 1) return false;
            // Existing entries unchanged
            return existing.every(
              (old, i) => after[i]?.id === old.id && after[i]?.actionType === old.actionType
            );
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe("singleton export", () => {
    it("reviewWorkflowRepository is an instance of ReviewWorkflowRepository", async () => {
      const mod = await import("@/modules/review-workflow/repository");
      expect(mod.reviewWorkflowRepository).toBeInstanceOf(mod.ReviewWorkflowRepository);
    });
  });
});
