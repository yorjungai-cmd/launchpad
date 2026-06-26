/**
 * Integration tests — auth & profile tRPC procedures (Task 6.6)
 *
 * Strategy:
 *   - Uses createCallerFactory to invoke procedures directly (no HTTP).
 *   - Mocks createServerSupabaseClient and getServerSession so tests are
 *     fully deterministic and never hit a real Supabase instance.
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
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { createCallerFactory } from "@/server/trpc";
import { appRouter } from "@/server/root";
import type { Context } from "@/server/context";
import type { AppRole } from "@/lib/supabase/types";
import type { User, Session } from "@supabase/supabase-js";

// Pull in the mock references so we can configure them per-test
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServerSession } from "@/lib/auth/server";

const mockCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);
const mockGetServerSession = vi.mocked(getServerSession);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fakeUser: User = {
  id: "user-123",
  email: "test@example.com",
  user_metadata: { role: "internal_submitter" as AppRole },
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

const fakeProfile = {
  id: "user-123",
  email: "test@example.com",
  full_name: "Test User",
  role: "internal_submitter" as AppRole,
  locale: "th",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a tRPC caller directly from a provided context.
 * This bypasses HTTP entirely — procedures are called in-process.
 */
const createCaller = createCallerFactory(appRouter);

function makeUnauthenticatedCaller() {
  const mockDb = {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
    },
  };

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

  return { caller: createCaller(ctx), mockDb };
}

function makeAuthenticatedCaller(profileData = fakeProfile) {
  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
    update: vi.fn().mockReturnThis(),
  });

  const mockDb = {
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: fakeUser }, error: null }),
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: fakeSession.session }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };

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

  return { caller: createCaller(ctx), mockDb, mockFrom };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("health.check", () => {
  it('returns { status: "ok" } and an ISO timestamp', async () => {
    const { caller } = makeUnauthenticatedCaller();
    const result = await caller.health.check();

    expect(result.status).toBe("ok");
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("is publicly accessible without authentication", async () => {
    const { caller } = makeUnauthenticatedCaller();
    // Should not throw
    await expect(caller.health.check()).resolves.toMatchObject({ status: "ok" });
  });
});

describe("auth.session", () => {
  it("returns null when there is no session", async () => {
    const { caller } = makeUnauthenticatedCaller();
    const result = await caller.auth.session();
    expect(result).toBeNull();
  });

  it("returns session info when authenticated", async () => {
    const { caller } = makeAuthenticatedCaller();
    const result = await caller.auth.session();

    expect(result).not.toBeNull();
    expect(result?.userId).toBe("user-123");
    expect(result?.email).toBe("test@example.com");
    expect(result?.role).toBe("internal_submitter");
  });
});

describe("profile.me", () => {
  it("throws UNAUTHORIZED when no session", async () => {
    const { caller } = makeUnauthenticatedCaller();

    await expect(caller.profile.me()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns the profile when authenticated", async () => {
    const { caller } = makeAuthenticatedCaller();

    const result = await caller.profile.me();

    expect(result.id).toBe("user-123");
    expect(result.email).toBe("test@example.com");
    expect(result.role).toBe("internal_submitter");
    expect(result.locale).toBe("th");
  });

  it("throws NOT_FOUND when profile row does not exist", async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "Row not found", details: "", hint: "" },
      }),
    });

    const mockDb = {
      from: mockFrom,
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    };

    const ctx: Context = {
      db: mockDb as unknown as Context["db"],
      session: fakeSession,
      user: fakeUser,
      role: "internal_submitter",
    };

    const caller = createCaller(ctx);

    await expect(caller.profile.me()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("profile.updateLocale", () => {
  it("throws UNAUTHORIZED when no session", async () => {
    const { caller } = makeUnauthenticatedCaller();

    await expect(caller.profile.updateLocale({ locale: "en" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("updates locale and returns updated profile", async () => {
    const updatedProfile = { ...fakeProfile, locale: "en" };

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedProfile, error: null }),
      update: vi.fn().mockReturnThis(),
    });

    const mockDb = {
      from: mockFrom,
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    };

    const ctx: Context = {
      db: mockDb as unknown as Context["db"],
      session: fakeSession,
      user: fakeUser,
      role: "internal_submitter",
    };

    const caller = createCaller(ctx);
    const result = await caller.profile.updateLocale({ locale: "en" });

    expect(result.locale).toBe("en");
  });
});

describe("auth.signOut", () => {
  it("throws UNAUTHORIZED when no session", async () => {
    const { caller } = makeUnauthenticatedCaller();
    await expect(caller.auth.signOut()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("succeeds for authenticated user", async () => {
    const { caller } = makeAuthenticatedCaller();
    const result = await caller.auth.signOut();
    expect(result).toMatchObject({ success: true });
  });
});
