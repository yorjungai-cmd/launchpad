/**
 * Integration tests — PipelineRepository
 * Uses mocked Supabase client (no real DB required).
 *
 * Tests:
 *   - findKanbanIdeas with empty filter → returns array per stage
 *   - findIdeaByReferenceNumber: not found → throws AppError NOT_FOUND
 *   - findIdeaByReferenceNumber: found → returns GuestTrackingDTO without submitterEmail
 *
 * Ref: tasks.md — Task 6.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineRepository } from "@/modules/pipeline/repository";
import { Stage } from "@/shared/enums";

// ─── Mock Supabase server client ──────────────────────────────────────────────

const mockFrom = vi.fn();
const mockSupabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
  createAdminSupabaseClient: vi.fn(() => mockSupabaseClient),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = "2024-06-01T10:00:00.000Z";
const IDEA_ID = "a0000000-0000-0000-0000-000000000001";
const REF_NUM = "LP-2024-000001";

/** Minimal raw DB row for an idea (guest-safe fields only) */
const IDEA_ROW_GUEST = {
  id: IDEA_ID,
  reference_number: REF_NUM,
  title: "Test Idea",
  current_stage: Stage.SANDBOX,
  created_at: NOW,
  updated_at: NOW,
};

/** Minimal raw DB row for an idea (full internal fields) */
const IDEA_ROW_FULL = {
  id: IDEA_ID,
  reference_number: REF_NUM,
  title: "Test Idea",
  current_stage: Stage.SANDBOX,
  submitter_type: "employee",
  assigned_reviewer_id: null,
  created_at: NOW,
  updated_at: NOW,
  watermark_status: "ai_draft",
  profiles: null,
};

/** Stage transitions rows */
const TRANSITIONS_ROWS = [
  {
    id: "trans-001",
    idea_id: IDEA_ID,
    from_stage: null,
    to_stage: Stage.SANDBOX,
    transitioned_by: null,
    created_at: NOW,
    reason: null,
  },
];

// ─── Helper: build chainable Supabase mock ────────────────────────────────────

/**
 * Creates a chainable Supabase query builder mock.
 * Most methods return `this` for chaining; the final resolution uses
 * `maybeSingle` or query-level resolve.
 */
function makeQueryChain(
  resolveValue: { data: unknown; error: unknown },
  opts: { isMaybeSingle?: boolean } = {}
) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const methods = ["select", "eq", "order", "limit", "lt", "gte", "lte"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }

  if (opts.isMaybeSingle) {
    chain["maybeSingle"] = vi.fn().mockResolvedValue(resolveValue);
    // limit falls through but if called on this chain, return resolve too
    chain["limit"] = vi.fn().mockResolvedValue(resolveValue);
  } else {
    // For array queries (limit + 1 pattern)
    chain["limit"] = vi.fn().mockResolvedValue(resolveValue);
    chain["maybeSingle"] = vi.fn().mockResolvedValue(resolveValue);
  }

  return chain;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("PipelineRepository", () => {
  let repo: PipelineRepository;

  beforeEach(() => {
    repo = new PipelineRepository();
    vi.clearAllMocks();
  });

  // ── findKanbanIdeas ────────────────────────────────────────────────────────

  describe("findKanbanIdeas()", () => {
    it("empty filter → returns a column array with one entry per stage", async () => {
      // Kanban fetches ALL_STAGES (4 stages) in parallel — mock returns empty ideas per stage
      const emptyColumn = { data: [], error: null };

      // Each stage query goes through: .from().select()...eq('current_stage', stage).order().limit()
      // We mock the full chain
      const makeStageChain = () => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["select", "eq", "order", "limit", "lt", "gte", "lte"];
        for (const m of methods) {
          chain[m] = vi.fn(() => chain);
        }
        chain["limit"] = vi.fn().mockResolvedValue(emptyColumn);
        return chain;
      };

      // from() is called once per stage (4 times)
      mockFrom
        .mockReturnValueOnce(makeStageChain())
        .mockReturnValueOnce(makeStageChain())
        .mockReturnValueOnce(makeStageChain())
        .mockReturnValueOnce(makeStageChain());

      const result = await repo.findKanbanIdeas({}, undefined, 20);

      expect(result).toBeInstanceOf(Array);
      // Should return 4 columns (all stages)
      expect(result).toHaveLength(4);
      // Each column has stage, ideas, cursor, hasMore
      for (const col of result) {
        expect(col).toHaveProperty("stage");
        expect(col).toHaveProperty("ideas");
        expect(col).toHaveProperty("cursor");
        expect(col).toHaveProperty("hasMore");
        expect(col.ideas).toBeInstanceOf(Array);
        expect(col.hasMore).toBe(false);
      }
    });

    it("stage filter → returns only the filtered stage column", async () => {
      const emptyColumn = { data: [], error: null };

      const stageChain = makeQueryChain(emptyColumn);
      mockFrom.mockReturnValue(stageChain);

      const result = await repo.findKanbanIdeas({ stage: Stage.SANDBOX }, undefined, 20);

      // Only 1 stage column when stage filter is set
      expect(result).toHaveLength(1);
      expect(result[0]!.stage).toBe(Stage.SANDBOX);
    });

    it("hasMore is true when repository returns limit+1 rows", async () => {
      const LIMIT = 2;

      // Return 3 rows (limit+1) → hasMore should be true
      const rows = [
        IDEA_ROW_FULL,
        { ...IDEA_ROW_FULL, id: "id-2" },
        { ...IDEA_ROW_FULL, id: "id-3" },
      ];
      const fullColumn = { data: rows, error: null };

      const stageChain = makeQueryChain(fullColumn);
      mockFrom.mockReturnValue(stageChain);

      const result = await repo.findKanbanIdeas({ stage: Stage.SANDBOX }, undefined, LIMIT);

      expect(result[0]!.hasMore).toBe(true);
      expect(result[0]!.ideas).toHaveLength(LIMIT);
      expect(result[0]!.cursor).not.toBeNull();
    });
  });

  // ── findIdeaByReferenceNumber ──────────────────────────────────────────────

  describe("findIdeaByReferenceNumber()", () => {
    it("not found → throws AppError with statusCode 404", async () => {
      const notFoundChain = makeQueryChain({ data: null, error: null }, { isMaybeSingle: true });
      mockFrom.mockReturnValue(notFoundChain);

      await expect(repo.findIdeaByReferenceNumber("LP-NOT-EXIST")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("found → returns GuestTrackingDTO without submitterEmail field", async () => {
      let callCount = 0;

      // First from() call is for the ideas table, second is for stage_transitions
      mockFrom.mockImplementation(() => {
        callCount += 1;

        if (callCount === 1) {
          // ideas query chain (.select().eq().maybeSingle())
          const ideaChain: Record<string, ReturnType<typeof vi.fn>> = {};
          ideaChain["select"] = vi.fn(() => ideaChain);
          ideaChain["eq"] = vi.fn(() => ideaChain);
          ideaChain["maybeSingle"] = vi
            .fn()
            .mockResolvedValue({ data: IDEA_ROW_GUEST, error: null });
          return ideaChain;
        } else {
          // stage_transitions query chain (.select().eq().order())
          const transChain: Record<string, ReturnType<typeof vi.fn>> = {};
          transChain["select"] = vi.fn(() => transChain);
          transChain["eq"] = vi.fn(() => transChain);
          transChain["order"] = vi.fn().mockResolvedValue({ data: TRANSITIONS_ROWS, error: null });
          return transChain;
        }
      });

      const result = await repo.findIdeaByReferenceNumber(REF_NUM);

      expect(result).toBeDefined();
      expect(result.referenceNumber).toBe(REF_NUM);
      expect(result.title).toBe("Test Idea");
      expect(result.currentStage).toBe(Stage.SANDBOX);

      // GuestTrackingDTO must NOT have submitterEmail (it's not even in the schema)
      expect(result).not.toHaveProperty("submitterEmail");
      // Sensitive internal fields must NOT be present
      expect(result).not.toHaveProperty("submitterType");
      expect(result).not.toHaveProperty("assignedReviewer");
      expect(result).not.toHaveProperty("watermarkStatus");
      expect(result).not.toHaveProperty("id");

      // stageTimeline must be present and be an array
      expect(result.stageTimeline).toBeInstanceOf(Array);
    });

    it("DB error → throws AppError with statusCode 500", async () => {
      const errorChain: Record<string, ReturnType<typeof vi.fn>> = {};
      errorChain["select"] = vi.fn(() => errorChain);
      errorChain["eq"] = vi.fn(() => errorChain);
      errorChain["maybeSingle"] = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Connection timeout" },
      });
      mockFrom.mockReturnValue(errorChain);

      await expect(repo.findIdeaByReferenceNumber(REF_NUM)).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });
});
