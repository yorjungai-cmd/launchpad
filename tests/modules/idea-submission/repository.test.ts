/**
 * Unit / integration tests — IdeaRepository
 * Mock Supabase client, no real DB required.
 * Ref: tasks.md task 3.3 (test-first)
 *
 * Task 3.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Idea, IdeaInsert } from "@/lib/supabase/types";
import { IdeaRepository } from "@/modules/idea-submission/repository";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const now = "2026-06-25T10:00:00Z";

const baseInsert: Omit<IdeaInsert, "reference_number"> = {
  title: "Test Idea",
  submitter_name: "Alice",
  submitter_email: "alice@example.com",
  submitter_type: "employee",
  input_type: "text",
  raw_content: "Some raw content",
  user_id: "user-abc",
};

function makeIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: "idea-001",
    reference_number: "LP-XXXXXXXX",
    title: "Test Idea",
    submitter_name: "Alice",
    submitter_email: "alice@example.com",
    submitter_type: "employee",
    user_id: "user-abc",
    input_type: "text",
    raw_content: "Some raw content",
    file_url: null,
    file_original_name: null,
    source_url: null,
    extracted_text: null,
    current_stage: "sandbox",
    analysis_status: "pending",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ─── Mock Supabase builder factory ───────────────────────────────────────────

/**
 * Creates a minimal chainable Supabase mock.
 * Each method returns `this` to allow chaining; the terminal methods
 * (single, limit, etc.) resolve to `resolveWith`.
 */
function makeQueryBuilder(resolveWith: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};

  const methods = ["select", "insert", "update", "eq", "lt", "order", "limit", "single"];

  for (const m of methods) {
    builder[m] = vi.fn(() => builder);
  }

  // Terminal calls that actually return data
  (builder["single"] as ReturnType<typeof vi.fn>).mockResolvedValue(resolveWith);
  (builder["limit"] as ReturnType<typeof vi.fn>).mockResolvedValue(resolveWith);

  return builder as ReturnType<typeof vi.fn> & Record<string, ReturnType<typeof vi.fn>>;
}

function makeDb(resolveWith: { data: unknown; error: unknown }) {
  const builder = makeQueryBuilder(resolveWith);
  return {
    from: vi.fn(() => builder),
    _builder: builder,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("IdeaRepository", () => {
  let repo: IdeaRepository;

  beforeEach(() => {
    repo = new IdeaRepository();
    vi.clearAllMocks();
  });

  // ── createIdea ────────────────────────────────────────────────────────────

  describe("createIdea", () => {
    it("returns an Idea with a generated reference_number in LP-XXXXXXXX format", async () => {
      const expected = makeIdea({ reference_number: "LP-AB12CD34" });
      const db = makeDb({ data: expected, error: null });

      const result = await repo.createIdea(
        baseInsert,
        db as unknown as Parameters<typeof repo.createIdea>[1]
      );

      expect(result).toEqual(expected);
      expect(result.reference_number).toMatch(/^LP-[A-Z0-9]{8}$/);
    });

    it("retries on unique violation and succeeds on second attempt", async () => {
      const expected = makeIdea({ reference_number: "LP-RETRY001" });

      // First insert returns unique_violation; second succeeds
      const insertFn = vi.fn();
      insertFn
        .mockResolvedValueOnce({
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        })
        .mockResolvedValueOnce({ data: expected, error: null });

      // We need to return a builder where insert() ultimately calls single() with our mock
      const _buildSelect = () => {
        return { single: vi.fn().mockImplementation(insertFn) };
      };

      const mockDb = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: insertFn,
            })),
          })),
        })),
      };

      const result = await repo.createIdea(
        baseInsert,
        mockDb as unknown as Parameters<typeof repo.createIdea>[1]
      );

      expect(result).toEqual(expected);
      expect(insertFn).toHaveBeenCalledTimes(2);
    });

    it("throws INTERNAL_SERVER_ERROR after max retries on persistent unique violation", async () => {
      const uniqueError = { code: "23505", message: "duplicate key" };
      const insertFn = vi.fn().mockResolvedValue({ data: null, error: uniqueError });

      const mockDb = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: insertFn,
            })),
          })),
        })),
      };

      await expect(
        repo.createIdea(baseInsert, mockDb as unknown as Parameters<typeof repo.createIdea>[1])
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

      expect(insertFn).toHaveBeenCalledTimes(3); // MAX_RETRY = 3
    });

    it("throws INTERNAL_SERVER_ERROR on non-unique DB error", async () => {
      const dbError = { code: "42601", message: "syntax error" };
      const insertFn = vi.fn().mockResolvedValue({ data: null, error: dbError });

      const mockDb = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: insertFn,
            })),
          })),
        })),
      };

      await expect(
        repo.createIdea(baseInsert, mockDb as unknown as Parameters<typeof repo.createIdea>[1])
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });

  // ── getIdeaById ───────────────────────────────────────────────────────────

  describe("getIdeaById", () => {
    it("returns the idea when found", async () => {
      const idea = makeIdea({ id: "idea-found" });

      const singleFn = vi.fn().mockResolvedValue({ data: idea, error: null });
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: singleFn,
            })),
          })),
        })),
      };

      const result = await repo.getIdeaById(
        "idea-found",
        mockDb as unknown as Parameters<typeof repo.getIdeaById>[1]
      );

      expect(result).toEqual(idea);
    });

    it("returns null for unknown id (PGRST116)", async () => {
      const singleFn = vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "PGRST116", message: "no rows" } });
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: singleFn,
            })),
          })),
        })),
      };

      const result = await repo.getIdeaById(
        "unknown-id",
        mockDb as unknown as Parameters<typeof repo.getIdeaById>[1]
      );

      expect(result).toBeNull();
    });
  });

  // ── getIdeaByRefNum ───────────────────────────────────────────────────────

  describe("getIdeaByRefNum", () => {
    it("returns idea when reference_number + email match", async () => {
      const idea = makeIdea({ reference_number: "LP-AABB1100", submitter_email: "bob@test.com" });

      const singleFn = vi.fn().mockResolvedValue({ data: idea, error: null });
      const eqChain = vi.fn(() => ({ single: singleFn }));
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: eqChain,
            })),
          })),
        })),
      };

      const result = await repo.getIdeaByRefNum(
        "LP-AABB1100",
        "bob@test.com",
        mockDb as unknown as Parameters<typeof repo.getIdeaByRefNum>[2]
      );

      expect(result).toEqual(idea);
      expect(singleFn).toHaveBeenCalledOnce();
    });

    it("returns null when no match (PGRST116)", async () => {
      const singleFn = vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "PGRST116", message: "no rows" } });
      const eqChain = vi.fn(() => ({ single: singleFn }));
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: eqChain,
            })),
          })),
        })),
      };

      const result = await repo.getIdeaByRefNum(
        "LP-WRONG000",
        "wrong@test.com",
        mockDb as unknown as Parameters<typeof repo.getIdeaByRefNum>[2]
      );

      expect(result).toBeNull();
    });
  });

  // ── listIdeasByUser ───────────────────────────────────────────────────────

  describe("listIdeasByUser", () => {
    it("returns cursor-paginated results without nextCursor when fewer than limit", async () => {
      const ideas = [makeIdea({ id: "idea-1" }), makeIdea({ id: "idea-2" })];

      const limitFn = vi.fn().mockResolvedValue({ data: ideas, error: null });
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: limitFn,
              })),
            })),
          })),
        })),
      };

      const result = await repo.listIdeasByUser(
        "user-abc",
        mockDb as unknown as Parameters<typeof repo.listIdeasByUser>[1],
        { limit: 20 }
      );

      expect(result.items).toEqual(ideas);
      expect(result.nextCursor).toBeUndefined();
    });

    it("returns nextCursor when more items exist (items.length > limit)", async () => {
      // Request limit 2, return 3 rows (2+1) → has more
      const ideas = [
        makeIdea({ id: "idea-1", created_at: "2026-06-25T10:00:00Z" }),
        makeIdea({ id: "idea-2", created_at: "2026-06-25T09:00:00Z" }),
        makeIdea({ id: "idea-3", created_at: "2026-06-25T08:00:00Z" }), // extra
      ];

      const limitFn = vi.fn().mockResolvedValue({ data: ideas, error: null });
      const mockDb = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: limitFn,
              })),
            })),
          })),
        })),
      };

      const result = await repo.listIdeasByUser(
        "user-abc",
        mockDb as unknown as Parameters<typeof repo.listIdeasByUser>[1],
        { limit: 2 }
      );

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe("2026-06-25T09:00:00Z");
    });

    it("uses cursor (lt) when provided", async () => {
      const ideas = [makeIdea({ id: "idea-old" })];

      // Build a fully chainable mock where every method returns the same builder
      // and the builder itself is thenable (Promise-like)
      const makeChainableMock = (resolveData: { data: Idea[]; error: null }) => {
        // Create a thenable builder that every method returns
        const builder: Record<string, unknown> = {
          then: (resolve: (v: { data: Idea[]; error: null }) => void, _reject?: unknown) => {
            resolve(resolveData);
            return Promise.resolve(resolveData);
          },
          catch: vi.fn(),
          finally: vi.fn(),
        };

        const methods = ["select", "eq", "order", "limit", "lt"];
        for (const m of methods) {
          builder[m] = vi.fn(() => builder);
        }

        return builder;
      };

      const chain = makeChainableMock({ data: ideas, error: null });
      const mockDb = { from: vi.fn(() => chain) };

      const result = await repo.listIdeasByUser(
        "user-abc",
        mockDb as unknown as Parameters<typeof repo.listIdeasByUser>[1],
        { limit: 20, cursor: "2026-06-25T08:00:00Z" }
      );

      expect(result.items).toEqual(ideas);
      // lt should have been called with the cursor value
      expect(chain["lt"] as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        "created_at",
        "2026-06-25T08:00:00Z"
      );
    });
  });
});
