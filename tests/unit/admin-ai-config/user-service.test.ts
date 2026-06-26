/**
 * Unit tests — UserManagementService
 *
 * Covers:
 *   - deleteUser(): self-delete throws FORBIDDEN
 *   - deleteUser(): deletes profile + auth user + audit log called
 *   - deleteUser(): throws NOT_FOUND when target user does not exist
 *   - createUser(): Auth Admin mock + profile upsert + audit log called
 *   - createUser(): returns correct UserRow shape
 *   - createUser(): throws AppError.internal if auth create fails
 *   - updateUserRole(): self-demotion guard when sole admin (0 other admins)
 *   - updateUserRole(): allows self-demotion when another admin exists
 *   - updateUserRole(): calls audit log with previous and new role
 *
 * Mocks:
 *   - @/lib/supabase/server — createAdminSupabaseClient (Auth Admin + profiles)
 *   - @/lib/logger — prevent log noise
 *   - @/modules/admin-ai-config/audit-log-service — verify audit calls
 *
 * Ref:
 *   - design/components.md  — UserManagementService (Component 2)
 *   - design/data-model.md  — profiles table
 *   - Task 9.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock audit log service ───────────────────────────────────────────────────

const mockAuditLog = vi.fn().mockResolvedValue(undefined);

vi.mock("@/modules/admin-ai-config/audit-log-service", () => ({
  adminAuditLogService: {
    log: mockAuditLog,
  },
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Auth Admin mock helpers ──────────────────────────────────────────────────

const mockAuthAdminListUsers = vi.fn();
const mockAuthAdminCreateUser = vi.fn();
const mockAuthAdminUpdateUserById = vi.fn();
const mockAuthAdminGetUserById = vi.fn();
const mockAuthAdminDeleteUser = vi.fn();

// ─── Per-call `from()` mock factory ──────────────────────────────────────────
//
// The service calls db.from() multiple times in a single method.
// Each call returns a fresh fluent chain to avoid cross-contamination.
// We use a queue approach: each call to `mockFrom` pops the next preconfigured
// chain from `fromQueue`.

let fromQueue: ReturnType<typeof makeChain>[] = [];

/** Build a minimal fluent chain where every method returns `this` unless
 *  overridden by .mockResolvedValueOnce() on the terminal method. */
function makeChain(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  // Default terminal resolvers
  const defaults: Record<string, ReturnType<typeof vi.fn>> = {
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  // Non-terminal: return chain
  for (const method of [
    "select",
    "insert",
    "upsert",
    "update",
    "delete",
    "eq",
    "neq",
    "in",
    "order",
  ]) {
    chain[method] = vi.fn().mockImplementation((..._args: unknown[]) => chainProxy);
  }

  // Terminal: resolved promise (overrideable)
  for (const [k, fn] of Object.entries({ ...defaults, ...overrides })) {
    chain[k] = fn;
  }

  const chainProxy: typeof chain = new Proxy(chain, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      // Allow chaining unknown methods without crashing
      return vi.fn().mockReturnValue(chainProxy);
    },
  });

  return chainProxy;
}

const mockFrom = vi.fn().mockImplementation(() => {
  const next = fromQueue.shift();
  if (next) return next;
  // Fallback: empty chain so tests don't hard crash
  return makeChain();
});

const mockAdminClient = {
  from: mockFrom,
  auth: {
    admin: {
      listUsers: mockAuthAdminListUsers,
      createUser: mockAuthAdminCreateUser,
      updateUserById: mockAuthAdminUpdateUserById,
      getUserById: mockAuthAdminGetUserById,
      deleteUser: mockAuthAdminDeleteUser,
    },
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(() => mockAdminClient),
  createServerSupabaseClient: vi.fn(() => mockAdminClient),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_ID = "a0000000-0000-4000-8000-000000000001";
const TARGET_USER_ID = "b0000000-0000-4000-8000-000000000002";
const NEW_USER_ID = "c0000000-0000-4000-8000-000000000003";

const MOCK_AUTH_USER = {
  id: TARGET_USER_ID,
  email: "target@applica.co.th",
  created_at: "2026-01-15T00:00:00.000Z",
  last_sign_in_at: "2026-06-01T08:00:00.000Z",
  user_metadata: { full_name: "Target User", role: "bd_reviewer" },
};

const MOCK_NEW_AUTH_USER = {
  id: NEW_USER_ID,
  email: "newuser@applica.co.th",
  created_at: "2026-06-20T00:00:00.000Z",
  last_sign_in_at: null,
  user_metadata: { full_name: "New User", role: "internal_submitter" },
};

const CREATE_USER_INPUT = {
  email: "newuser@applica.co.th",
  password: "SecurePass1!",
  role: "internal_submitter" as const,
  fullName: "New User",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("UserManagementService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromQueue = [];
  });

  // ══════════════════════════════════════════════════════════════════════════
  // deleteUser()
  // ══════════════════════════════════════════════════════════════════════════

  describe("deleteUser()", () => {
    it("throws FORBIDDEN when admin tries to delete their own account (self-delete)", async () => {
      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      await expect(service.deleteUser(ADMIN_ID, ADMIN_ID)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      // Guard fires before any DB work
      expect(mockAuthAdminGetUserById).not.toHaveBeenCalled();
      expect(mockAuthAdminDeleteUser).not.toHaveBeenCalled();
      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it("deletes profile row, then Auth user, and calls audit log", async () => {
      // getUserById — find target
      mockAuthAdminGetUserById.mockResolvedValueOnce({
        data: { user: MOCK_AUTH_USER },
        error: null,
      });

      // Call 1: profiles.select('role, full_name').eq('id', userId).single()
      fromQueue.push(
        makeChain({
          single: vi.fn().mockResolvedValue({
            data: { role: "bd_reviewer", full_name: "Target User" },
            error: null,
          }),
        })
      );

      // Call 2: profiles.delete().eq('id', userId) — returns { error: null }
      const deleteChain = makeChain();
      deleteChain["eq"] = vi.fn().mockResolvedValue({ error: null });
      fromQueue.push(deleteChain);

      // auth.admin.deleteUser — success
      mockAuthAdminDeleteUser.mockResolvedValueOnce({ error: null });

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      await service.deleteUser(TARGET_USER_ID, ADMIN_ID);

      expect(mockAuthAdminDeleteUser).toHaveBeenCalledWith(TARGET_USER_ID);
      expect(mockAuditLog).toHaveBeenCalledOnce();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user_deleted",
          adminId: ADMIN_ID,
          targetType: "user",
          targetId: TARGET_USER_ID,
        })
      );
    });

    it("throws NOT_FOUND when target user does not exist in Auth", async () => {
      mockAuthAdminGetUserById.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "user not found" },
      });

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      await expect(service.deleteUser(TARGET_USER_ID, ADMIN_ID)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      expect(mockAuthAdminDeleteUser).not.toHaveBeenCalled();
      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it("throws AppError.internal when profile DELETE fails", async () => {
      mockAuthAdminGetUserById.mockResolvedValueOnce({
        data: { user: MOCK_AUTH_USER },
        error: null,
      });

      // Call 1: profiles.select().eq().single() — profile fetch
      fromQueue.push(
        makeChain({
          single: vi.fn().mockResolvedValue({
            data: { role: "bd_reviewer", full_name: "Target User" },
            error: null,
          }),
        })
      );

      // Call 2: profiles.delete().eq() — returns error
      const deleteChain = makeChain();
      deleteChain["eq"] = vi.fn().mockResolvedValue({ error: { message: "RLS denied" } });
      fromQueue.push(deleteChain);

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      await expect(service.deleteUser(TARGET_USER_ID, ADMIN_ID)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });

      // Auth delete must NOT run if profile delete failed
      expect(mockAuthAdminDeleteUser).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // createUser()
  // ══════════════════════════════════════════════════════════════════════════

  describe("createUser()", () => {
    it("calls Auth Admin createUser, upserts profile, and calls audit log", async () => {
      // Auth create succeeds
      mockAuthAdminCreateUser.mockResolvedValueOnce({
        data: { user: MOCK_NEW_AUTH_USER },
        error: null,
      });

      // profiles.upsert() — success (the upsert itself resolves with no error)
      const upsertChain = makeChain();
      upsertChain["upsert"] = vi.fn().mockResolvedValue({ error: null });
      fromQueue.push(upsertChain);

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      await service.createUser(CREATE_USER_INPUT, ADMIN_ID);

      expect(mockAuthAdminCreateUser).toHaveBeenCalledOnce();
      expect(mockAuthAdminCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: CREATE_USER_INPUT.email,
          password: CREATE_USER_INPUT.password,
          email_confirm: true,
        })
      );
      expect(mockAuditLog).toHaveBeenCalledOnce();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user_created",
          adminId: ADMIN_ID,
          targetType: "user",
          targetId: NEW_USER_ID,
        })
      );
    });

    it("returns correct UserRow shape with all expected fields", async () => {
      mockAuthAdminCreateUser.mockResolvedValueOnce({
        data: { user: MOCK_NEW_AUTH_USER },
        error: null,
      });

      const upsertChain = makeChain();
      upsertChain["upsert"] = vi.fn().mockResolvedValue({ error: null });
      fromQueue.push(upsertChain);

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      const result = await service.createUser(CREATE_USER_INPUT, ADMIN_ID);

      expect(result).toMatchObject({
        id: NEW_USER_ID,
        email: CREATE_USER_INPUT.email,
        fullName: CREATE_USER_INPUT.fullName,
        role: CREATE_USER_INPUT.role,
        createdAt: MOCK_NEW_AUTH_USER.created_at,
        lastSignInAt: null,
      });
    });

    it("sets fullName to null when not provided in input", async () => {
      const inputWithoutName = {
        email: "noname@applica.co.th",
        password: "SecurePass1!",
        role: "bd_reviewer" as const,
      };

      const authUserNoName = {
        ...MOCK_NEW_AUTH_USER,
        id: "d0000000-0000-4000-8000-000000000004",
        email: inputWithoutName.email,
        user_metadata: { role: "bd_reviewer" },
      };

      mockAuthAdminCreateUser.mockResolvedValueOnce({
        data: { user: authUserNoName },
        error: null,
      });

      const upsertChain = makeChain();
      upsertChain["upsert"] = vi.fn().mockResolvedValue({ error: null });
      fromQueue.push(upsertChain);

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      const result = await service.createUser(inputWithoutName, ADMIN_ID);

      expect(result.fullName).toBeNull();
    });

    it("throws AppError.internal when Auth Admin createUser fails", async () => {
      mockAuthAdminCreateUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: "email already exists" },
      });

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      await expect(service.createUser(CREATE_USER_INPUT, ADMIN_ID)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });

      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it("throws AppError.internal when profile upsert fails after Auth user creation", async () => {
      mockAuthAdminCreateUser.mockResolvedValueOnce({
        data: { user: MOCK_NEW_AUTH_USER },
        error: null,
      });

      // Upsert fails
      const upsertChain = makeChain();
      upsertChain["upsert"] = vi.fn().mockResolvedValue({ error: { message: "FK violation" } });
      fromQueue.push(upsertChain);

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      await expect(service.createUser(CREATE_USER_INPUT, ADMIN_ID)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // updateUserRole()
  // ══════════════════════════════════════════════════════════════════════════

  describe("updateUserRole()", () => {
    it("throws FORBIDDEN when admin self-demotes and is the sole admin (0 other admins)", async () => {
      // _countOtherAdmins: profiles.select('id', {count:'exact',head:true}).eq('role','admin').neq('id', excludeId)
      // The final `.neq()` resolves
      const countChain = makeChain();
      countChain["neq"] = vi.fn().mockResolvedValue({ count: 0, error: null });
      fromQueue.push(countChain);

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      await expect(service.updateUserRole(ADMIN_ID, "bd_reviewer", ADMIN_ID)).rejects.toMatchObject(
        { code: "FORBIDDEN" }
      );

      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it("allows self-demotion when at least one other admin exists", async () => {
      // _countOtherAdmins — count = 1
      const countChain = makeChain();
      countChain["neq"] = vi.fn().mockResolvedValue({ count: 1, error: null });
      fromQueue.push(countChain);

      // Fetch existing profile: profiles.select().eq().single()
      fromQueue.push(
        makeChain({
          single: vi.fn().mockResolvedValue({
            data: { full_name: "Admin User", role: "admin" },
            error: null,
          }),
        })
      );

      // UPDATE profiles.role: profiles.update().eq()
      const updateChain = makeChain();
      updateChain["eq"] = vi.fn().mockResolvedValue({ error: null });
      fromQueue.push(updateChain);

      // auth.admin.updateUserById
      mockAuthAdminUpdateUserById.mockResolvedValueOnce({ error: null });

      // auth.admin.getUserById — refreshed user
      mockAuthAdminGetUserById.mockResolvedValueOnce({
        data: {
          user: {
            id: ADMIN_ID,
            email: "admin@applica.co.th",
            created_at: "2026-01-01T00:00:00.000Z",
            last_sign_in_at: null,
            user_metadata: { full_name: "Admin User", role: "bd_reviewer" },
          },
        },
        error: null,
      });

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      const result = await service.updateUserRole(ADMIN_ID, "bd_reviewer", ADMIN_ID);

      expect(result.role).toBe("bd_reviewer");
      expect(mockAuditLog).toHaveBeenCalledOnce();
    });

    it("calls audit log with previousRole and newRole when role changes", async () => {
      // Not self — no countOtherAdmins call
      // adminId !== userId, so skip the demotion guard

      // Fetch existing profile
      fromQueue.push(
        makeChain({
          single: vi.fn().mockResolvedValue({
            data: { full_name: "Target User", role: "internal_submitter" },
            error: null,
          }),
        })
      );

      // UPDATE profiles.role
      const updateChain = makeChain();
      updateChain["eq"] = vi.fn().mockResolvedValue({ error: null });
      fromQueue.push(updateChain);

      // auth.admin.updateUserById
      mockAuthAdminUpdateUserById.mockResolvedValueOnce({ error: null });

      // auth.admin.getUserById
      mockAuthAdminGetUserById.mockResolvedValueOnce({
        data: {
          user: {
            id: TARGET_USER_ID,
            email: "target@applica.co.th",
            created_at: "2026-01-01T00:00:00.000Z",
            last_sign_in_at: null,
            user_metadata: { role: "bd_reviewer" },
          },
        },
        error: null,
      });

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      await service.updateUserRole(TARGET_USER_ID, "bd_reviewer", ADMIN_ID);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user_role_changed",
          adminId: ADMIN_ID,
          targetType: "user",
          targetId: TARGET_USER_ID,
          metadata: expect.objectContaining({
            previousRole: "internal_submitter",
            newRole: "bd_reviewer",
          }),
        })
      );
    });

    it("throws NOT_FOUND when target profile does not exist", async () => {
      // Not self-demotion — skip count check
      // Fetch profile — not found
      fromQueue.push(
        makeChain({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "no rows" },
          }),
        })
      );

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      await expect(
        service.updateUserRole("e0000000-0000-4000-8000-000000000099", "admin", ADMIN_ID)
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it("admin promotes another user — no self-demotion guard triggers", async () => {
      // adminId !== userId — no guard; go straight to profile fetch
      fromQueue.push(
        makeChain({
          single: vi.fn().mockResolvedValue({
            data: { full_name: "BD User", role: "bd_reviewer" },
            error: null,
          }),
        })
      );

      const updateChain = makeChain();
      updateChain["eq"] = vi.fn().mockResolvedValue({ error: null });
      fromQueue.push(updateChain);

      mockAuthAdminUpdateUserById.mockResolvedValueOnce({ error: null });
      mockAuthAdminGetUserById.mockResolvedValueOnce({
        data: {
          user: {
            id: TARGET_USER_ID,
            email: MOCK_AUTH_USER.email,
            created_at: MOCK_AUTH_USER.created_at,
            last_sign_in_at: null,
            user_metadata: { role: "admin" },
          },
        },
        error: null,
      });

      const { UserManagementService } = await import("@/modules/admin-ai-config/user-service");
      const service = new UserManagementService();

      const result = await service.updateUserRole(TARGET_USER_ID, "admin", ADMIN_ID);
      expect(result.role).toBe("admin");
      // Verify _countOtherAdmins was NOT called (no from() calls for that)
      // We only pushed 2 chains (select + update), both consumed
      expect(fromQueue.length).toBe(0);
    });
  });
});
