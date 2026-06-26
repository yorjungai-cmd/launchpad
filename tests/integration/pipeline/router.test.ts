/**
 * Integration tests — PipelineRouter (tRPC procedures)
 * Uses createCallerFactory pattern (consistent with idea-submission router tests).
 *
 * Tests:
 *   - pipeline.trackByReference → callable without session (publicProcedure)
 *   - pipeline.getKanban        → rejects without session (UNAUTHORIZED)
 *   - pipeline.getKanban        → rejects internal_submitter (FORBIDDEN)
 *   - pipeline.getStatusCard    → rejects without session (UNAUTHORIZED)
 *   - pipeline.getStatusCard    → invalid UUID input → BAD_REQUEST
 *
 * Ref: tasks.md — Task 6.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (declared before dynamic imports) ──────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  })),
  createAdminSupabaseClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

vi.mock("@/lib/auth/server", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth/rbac", () => ({
  hasRole: vi.fn((userRole: string, requiredRole: string) => {
    const hierarchy = ["guest", "internal_submitter", "bd_reviewer", "admin"];
    return hierarchy.indexOf(userRole) >= hierarchy.indexOf(requiredRole);
  }),
}));

vi.mock("@/modules/pipeline/service", () => ({
  pipelineService: {
    trackByReference: vi.fn(),
    getKanbanData: vi.fn(),
    getStatusCard: vi.fn(),
  },
  PipelineService: vi.fn(),
  sortTimelineAscending: vi.fn((t) => t),
  toGuestTrackingDTO: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { createCallerFactory } from "@/server/trpc";
import { pipelineRouter } from "@/modules/pipeline/router";
import type { Context } from "@/server/context";
import type { User } from "@supabase/supabase-js";
import { Stage } from "@/shared/enums";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pipelineService } from "@/modules/pipeline/service";

const mockCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);
const mockTrackByReference = vi.mocked(pipelineService.trackByReference);
const mockGetKanbanData = vi.mocked(pipelineService.getKanbanData);
const mockGetStatusCard = vi.mocked(pipelineService.getStatusCard);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const IDEA_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const REF_NUM = "LP-2024-000001";
const BD_REVIEWER_ID = "bd000000-0000-0000-0000-000000000001";

const MOCK_TRACKING = {
  tracking: {
    referenceNumber: REF_NUM,
    title: "Test Idea",
    currentStage: Stage.SANDBOX,
    submittedAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
    stageTimeline: [],
  },
};

const MOCK_KANBAN = {
  columns: [
    {
      stage: Stage.SANDBOX,
      ideas: [],
      cursor: null,
      hasMore: false,
    },
  ],
};

const MOCK_STATUS_CARD = {
  statusCard: {
    id: IDEA_ID,
    referenceNumber: REF_NUM,
    title: "Test Idea",
    currentStage: Stage.SANDBOX,
    submitterType: "employee",
    assignedReviewer: null,
    submittedAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
    watermarkStatus: "ai_draft",
    stageTimeline: [],
  },
};

// ─── Context helpers ───────────────────────────────────────────────────────────

function makeMockDb() {
  return {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  };
}

function makeUnauthenticatedContext(): Context {
  const db = makeMockDb();
  mockCreateServerSupabaseClient.mockReturnValue(
    db as unknown as ReturnType<typeof createServerSupabaseClient>
  );
  return {
    db: db as unknown as Context["db"],
    session: null,
    user: null,
    role: null,
  };
}

function makeAuthenticatedContext(role: string): Context {
  const db = makeMockDb();
  const user: User = {
    id: BD_REVIEWER_ID,
    email: "bd@applica.co.th",
    user_metadata: { role, full_name: "BD Reviewer" },
    app_metadata: {},
    aud: "authenticated",
    created_at: "2024-01-01T00:00:00Z",
    role: "authenticated",
    updated_at: "2024-01-01T00:00:00Z",
    identities: [],
    factors: [],
    confirmed_at: "2024-01-01T00:00:00Z",
    email_confirmed_at: "2024-01-01T00:00:00Z",
    phone: "",
    phone_confirmed_at: undefined,
    last_sign_in_at: "2024-01-01T00:00:00Z",
    is_anonymous: false,
  };

  return {
    db: db as unknown as Context["db"],
    session: { user } as Context["session"],
    user,
    role: role as Context["role"],
  };
}

// ─── Caller factory ────────────────────────────────────────────────────────────

const createCaller = createCallerFactory(pipelineRouter);

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("PipelineRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── pipeline.trackByReference ─────────────────────────────────────────────

  describe("pipeline.trackByReference", () => {
    it("can be called without a session (publicProcedure)", async () => {
      mockTrackByReference.mockResolvedValue(MOCK_TRACKING);

      const caller = createCaller(makeUnauthenticatedContext());
      const result = await caller.trackByReference({ referenceNumber: REF_NUM });

      expect(result.tracking).toBeDefined();
      expect(result.tracking.referenceNumber).toBe(REF_NUM);
      expect(mockTrackByReference).toHaveBeenCalledWith({ referenceNumber: REF_NUM });
    });

    it("also works when called with an authenticated session", async () => {
      mockTrackByReference.mockResolvedValue(MOCK_TRACKING);

      const caller = createCaller(makeAuthenticatedContext("internal_submitter"));
      const result = await caller.trackByReference({ referenceNumber: REF_NUM });

      expect(result.tracking).toBeDefined();
    });

    it("returns NOT_FOUND when reference number does not exist", async () => {
      const { TRPCError } = await import("@trpc/server");
      mockTrackByReference.mockRejectedValue(
        new TRPCError({
          code: "NOT_FOUND",
          message: "Idea not found for reference number: LP-UNKNOWN",
        })
      );

      const caller = createCaller(makeUnauthenticatedContext());
      await expect(
        caller.trackByReference({ referenceNumber: "LP-UNKNOWN" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── pipeline.getKanban ────────────────────────────────────────────────────

  describe("pipeline.getKanban", () => {
    it("rejects unauthenticated callers with UNAUTHORIZED", async () => {
      const caller = createCaller(makeUnauthenticatedContext());

      await expect(caller.getKanban({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("rejects internal_submitter callers with FORBIDDEN", async () => {
      const caller = createCaller(makeAuthenticatedContext("internal_submitter"));

      await expect(caller.getKanban({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("allows bd_reviewer to access Kanban", async () => {
      mockGetKanbanData.mockResolvedValue(MOCK_KANBAN);

      const caller = createCaller(makeAuthenticatedContext("bd_reviewer"));
      const result = await caller.getKanban({});

      expect(result.columns).toBeInstanceOf(Array);
    });

    it("allows admin to access Kanban", async () => {
      mockGetKanbanData.mockResolvedValue(MOCK_KANBAN);

      const caller = createCaller(makeAuthenticatedContext("admin"));
      const result = await caller.getKanban({});

      expect(result.columns).toBeInstanceOf(Array);
    });
  });

  // ── pipeline.getStatusCard ────────────────────────────────────────────────

  describe("pipeline.getStatusCard", () => {
    it("rejects unauthenticated callers with UNAUTHORIZED", async () => {
      const caller = createCaller(makeUnauthenticatedContext());

      await expect(caller.getStatusCard({ ideaId: IDEA_ID })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("invalid UUID input (not UUID format) → BAD_REQUEST", async () => {
      const caller = createCaller(makeAuthenticatedContext("bd_reviewer"));

      await expect(caller.getStatusCard({ ideaId: "not-a-valid-uuid" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("valid UUID → returns statusCard for authenticated user", async () => {
      mockGetStatusCard.mockResolvedValue(MOCK_STATUS_CARD);

      const caller = createCaller(makeAuthenticatedContext("bd_reviewer"));
      const result = await caller.getStatusCard({ ideaId: IDEA_ID });

      expect(result.statusCard).toBeDefined();
      expect(result.statusCard.id).toBe(IDEA_ID);
      expect(mockGetStatusCard).toHaveBeenCalledWith({ ideaId: IDEA_ID });
    });

    it("NOT_FOUND error from service → propagated as NOT_FOUND", async () => {
      const { TRPCError } = await import("@trpc/server");
      mockGetStatusCard.mockRejectedValue(
        new TRPCError({ code: "NOT_FOUND", message: `Idea not found: ${IDEA_ID}` })
      );

      const caller = createCaller(makeAuthenticatedContext("bd_reviewer"));
      await expect(caller.getStatusCard({ ideaId: IDEA_ID })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
