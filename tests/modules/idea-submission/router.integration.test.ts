/**
 * Integration tests — idea tRPC procedures
 * Uses createCallerFactory pattern (same as auth-profile.integration.test.ts).
 * Mocks: createServerSupabaseClient, getServerSession, ideaRepository, extractFromFile, extractFromUrl.
 *
 * Task 3.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (must be declared before dynamic imports) ───────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/modules/idea-submission/repository", () => ({
  ideaRepository: {
    createIdea: vi.fn(),
    getIdeaById: vi.fn(),
    getIdeaByRefNum: vi.fn(),
    listIdeasByUser: vi.fn(),
    updateAnalysisStatus: vi.fn(),
  },
  IdeaRepository: vi.fn(),
}));

vi.mock("@/modules/idea-submission/extractor", () => ({
  extractFromFile: vi.fn(),
  extractFromUrl: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { createCallerFactory } from "@/server/trpc";
import { appRouter } from "@/server/root";
import type { Context } from "@/server/context";
import type { AppRole, Idea, AnalysisStatus, Stage } from "@/lib/supabase/types";
import type { User, Session } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServerSession } from "@/lib/auth/server";
import { ideaRepository } from "@/modules/idea-submission/repository";
import { extractFromFile, extractFromUrl } from "@/modules/idea-submission/extractor";

const mockCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);
const mockGetServerSession = vi.mocked(getServerSession);
const mockIdeaRepository = vi.mocked(ideaRepository);
const mockExtractFromFile = vi.mocked(extractFromFile);
const mockExtractFromUrl = vi.mocked(extractFromUrl);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fakeUser: User = {
  id: "user-123",
  email: "internal@example.com",
  user_metadata: { role: "internal_submitter" as AppRole },
  app_metadata: {},
  aud: "authenticated",
  created_at: "2026-06-25T00:00:00Z",
  role: "authenticated",
  updated_at: "2026-06-25T00:00:00Z",
  identities: [],
  factors: [],
  confirmed_at: "2026-06-25T00:00:00Z",
  email_confirmed_at: "2026-06-25T00:00:00Z",
  phone: "",
  phone_confirmed_at: undefined,
  last_sign_in_at: "2026-06-25T00:00:00Z",
  is_anonymous: false,
};

const fakeSession = {
  user: fakeUser,
  session: {
    access_token: "fake-token",
    refresh_token: "fake-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: fakeUser,
  } as Session,
};

const now = "2026-06-25T10:00:00Z";

function makeIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: "a1b2c3d4-e5f6-4789-a012-b34567890123",
    reference_number: "LP-AB12CD34",
    title: "Test Idea Title",
    submitter_name: "Alice Guest",
    submitter_email: "alice@guest.com",
    submitter_type: "employee",
    user_id: null,
    input_type: "text",
    raw_content: "Some idea content",
    file_url: null,
    file_original_name: null,
    source_url: null,
    extracted_text: "Some idea content",
    current_stage: "sandbox" as Stage,
    analysis_status: "pending" as AnalysisStatus,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const createCaller = createCallerFactory(appRouter);

function makeMockDb() {
  return {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  };
}

function makeUnauthenticatedCaller() {
  const mockDb = makeMockDb();
  mockCreateServerSupabaseClient.mockReturnValue(
    mockDb as unknown as ReturnType<typeof createServerSupabaseClient>
  );
  mockGetServerSession.mockResolvedValue(null);

  const ctx: Context = {
    db: mockDb as unknown as Context["db"],
    session: null,
    user: null,
    role: null,
  };

  return createCaller(ctx);
}

function makeAuthenticatedCaller() {
  const mockDb = makeMockDb();
  mockCreateServerSupabaseClient.mockReturnValue(
    mockDb as unknown as ReturnType<typeof createServerSupabaseClient>
  );
  mockGetServerSession.mockResolvedValue(fakeSession);

  const ctx: Context = {
    db: mockDb as unknown as Context["db"],
    session: fakeSession,
    user: fakeUser,
    role: "internal_submitter",
  };

  return createCaller(ctx);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── idea.submit ───────────────────────────────────────────────────────────────

describe("idea.submit", () => {
  it("guest submit returns { ideaId, referenceNumber, analysisStatus }", async () => {
    const idea = makeIdea();
    mockIdeaRepository.createIdea.mockResolvedValue(idea);

    const caller = makeUnauthenticatedCaller();
    const result = await caller.idea.submit({
      title: "Test Idea Title",
      submitterName: "Alice Guest",
      submitterEmail: "alice@guest.com",
      submitterType: "employee",
      inputType: "text",
      rawContent: "Some idea content",
    });

    expect(result.ideaId).toBe("a1b2c3d4-e5f6-4789-a012-b34567890123");
    expect(result.referenceNumber).toBe("LP-AB12CD34");
    expect(result.analysisStatus).toBe("pending");
    expect(mockIdeaRepository.createIdea).toHaveBeenCalledOnce();
  });

  it("authenticated submit includes user_id in created idea", async () => {
    const idea = makeIdea({ user_id: "user-123" });
    mockIdeaRepository.createIdea.mockResolvedValue(idea);

    const caller = makeAuthenticatedCaller();
    const result = await caller.idea.submit({
      title: "Internal Idea",
      submitterName: "Internal User",
      submitterEmail: "internal@example.com",
      submitterType: "employee",
      inputType: "text",
      rawContent: "Internal idea content",
    });

    expect(result.ideaId).toBe("a1b2c3d4-e5f6-4789-a012-b34567890123");
    // Verify createIdea was called with user_id
    const callArg = mockIdeaRepository.createIdea.mock.calls[0]![0];
    expect(callArg.user_id).toBe("user-123");
  });

  it("fails validation when rawContent is missing for text inputType", async () => {
    const caller = makeUnauthenticatedCaller();

    await expect(
      caller.idea.submit({
        title: "Missing Content",
        submitterName: "Alice",
        submitterEmail: "alice@test.com",
        submitterType: "employee",
        inputType: "text",
        // rawContent intentionally omitted
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("fails validation when fileStoragePath missing for file inputType", async () => {
    const caller = makeUnauthenticatedCaller();

    await expect(
      caller.idea.submit({
        title: "File Idea",
        submitterName: "Alice",
        submitterEmail: "alice@test.com",
        submitterType: "employee",
        inputType: "file",
        // fileStoragePath intentionally omitted
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("fails validation when sourceUrl missing for url inputType", async () => {
    const caller = makeUnauthenticatedCaller();

    await expect(
      caller.idea.submit({
        title: "URL Idea",
        submitterName: "Alice",
        submitterEmail: "alice@test.com",
        submitterType: "employee",
        inputType: "url",
        // sourceUrl intentionally omitted
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ── idea.getStatus ────────────────────────────────────────────────────────────

describe("idea.getStatus", () => {
  it("returns pending status for a valid ideaId", async () => {
    const idea = makeIdea({ analysis_status: "pending" });
    mockIdeaRepository.getIdeaById.mockResolvedValue(idea);

    const caller = makeUnauthenticatedCaller();
    const result = await caller.idea.getStatus({ ideaId: "a1b2c3d4-e5f6-4789-a012-b34567890123" });

    expect(result.ideaId).toBe("a1b2c3d4-e5f6-4789-a012-b34567890123");
    expect(result.analysisStatus).toBe("pending");
    expect(result.referenceNumber).toBe("LP-AB12CD34");
    expect(result.currentStage).toBe("sandbox");
  });

  it("returns NOT_FOUND for unknown ideaId", async () => {
    mockIdeaRepository.getIdeaById.mockResolvedValue(null);

    const caller = makeUnauthenticatedCaller();
    await expect(
      caller.idea.getStatus({ ideaId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND for unknown referenceNumber + email", async () => {
    mockIdeaRepository.getIdeaByRefNum.mockResolvedValue(null);

    const caller = makeUnauthenticatedCaller();
    await expect(
      caller.idea.getStatus({
        referenceNumber: "LP-UNKNOWN0",
        email: "nobody@test.com",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns status when referenceNumber + email match", async () => {
    const idea = makeIdea({
      reference_number: "LP-AABB1100",
      submitter_email: "bob@test.com",
      analysis_status: "analysis_complete",
    });
    mockIdeaRepository.getIdeaByRefNum.mockResolvedValue(idea);

    const caller = makeUnauthenticatedCaller();
    const result = await caller.idea.getStatus({
      referenceNumber: "LP-AABB1100",
      email: "bob@test.com",
    });

    expect(result.analysisStatus).toBe("analysis_complete");
  });
});

// ── idea.listMine ─────────────────────────────────────────────────────────────

describe("idea.listMine", () => {
  it("throws UNAUTHORIZED when no session", async () => {
    const caller = makeUnauthenticatedCaller();
    await expect(caller.idea.listMine({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns list of ideas for authenticated user", async () => {
    const idea = makeIdea({ user_id: "user-123" });
    mockIdeaRepository.listIdeasByUser.mockResolvedValue({
      items: [idea],
      nextCursor: undefined,
    });

    const caller = makeAuthenticatedCaller();
    const result = await caller.idea.listMine({ limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.ideaId).toBe("a1b2c3d4-e5f6-4789-a012-b34567890123");
    expect(result.items[0]!.referenceNumber).toBe("LP-AB12CD34");
    expect(result.nextCursor).toBeUndefined();
    expect(mockIdeaRepository.listIdeasByUser).toHaveBeenCalledWith(
      "user-123",
      expect.anything(),
      expect.objectContaining({ limit: 20 })
    );
  });

  it("returns nextCursor when more items available", async () => {
    const idea = makeIdea();
    mockIdeaRepository.listIdeasByUser.mockResolvedValue({
      items: [idea],
      nextCursor: "2026-06-25T08:00:00Z",
    });

    const caller = makeAuthenticatedCaller();
    const result = await caller.idea.listMine({ limit: 1 });

    expect(result.nextCursor).toBe("2026-06-25T08:00:00Z");
  });
});

// ── idea.extractFile ──────────────────────────────────────────────────────────

describe("idea.extractFile", () => {
  it("returns extractedText on success", async () => {
    mockExtractFromFile.mockResolvedValue({
      status: "success",
      text: "Extracted text content",
      charCount: 23,
      truncated: false,
    });

    const caller = makeUnauthenticatedCaller();
    const result = await caller.idea.extractFile({
      storagePath: "idea-files/user-123/doc.pdf",
      mimeType: "application/pdf",
    });

    expect(result.extractedText).toBe("Extracted text content");
    expect(result.charCount).toBe(23);
    expect(result.truncated).toBe(false);
  });

  it("throws INTERNAL_SERVER_ERROR when extraction fails", async () => {
    mockExtractFromFile.mockResolvedValue({
      status: "failed",
      error: "Could not parse PDF",
    });

    const caller = makeUnauthenticatedCaller();
    await expect(
      caller.idea.extractFile({
        storagePath: "idea-files/user-123/bad.pdf",
        mimeType: "application/pdf",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ── idea.fetchUrl ─────────────────────────────────────────────────────────────

describe("idea.fetchUrl", () => {
  it("returns extractedText on success", async () => {
    mockExtractFromUrl.mockResolvedValue({
      status: "success",
      text: "Page content here",
      charCount: 17,
      truncated: false,
    });

    const caller = makeUnauthenticatedCaller();
    const result = await caller.idea.fetchUrl({ url: "https://example.com/article" });

    expect(result.extractedText).toBe("Page content here");
    expect(result.charCount).toBe(17);
  });

  it("throws NOT_FOUND when extraction fails (status: failed)", async () => {
    mockExtractFromUrl.mockResolvedValue({
      status: "failed",
      error: "HTTP 403: Forbidden",
    });

    const caller = makeUnauthenticatedCaller();
    await expect(
      caller.idea.fetchUrl({ url: "https://private.example.com" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("propagates { status: 'failed' } error message correctly", async () => {
    const errorMsg = "Connection refused";
    mockExtractFromUrl.mockResolvedValue({
      status: "failed",
      error: errorMsg,
    });

    const caller = makeUnauthenticatedCaller();
    try {
      await caller.idea.fetchUrl({ url: "https://unreachable.example.com" });
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect((err as { message?: string }).message).toContain(errorMsg);
    }
  });
});
