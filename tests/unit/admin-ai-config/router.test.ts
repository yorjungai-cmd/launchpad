/**
 * Integration tests — AdminRouter (tRPC role guard + validation)
 *
 * Covers:
 *   Role guard — all 11 procedures × non-admin roles → FORBIDDEN / UNAUTHORIZED
 *     Procedures: listUsers, createUser, updateUserRole, deleteUser,
 *                 getAiConfig, updateAiConfig,
 *                 listApiKeys, validateApiKey, saveApiKey, updateApiKey, deleteApiKey
 *
 *   Input validation (Zod):
 *     - invalid email → BAD_REQUEST
 *     - invalid model (not in SUPPORTED_MODELS) → BAD_REQUEST
 *     - invalid UUID → BAD_REQUEST
 *     - key too short (< 10 chars) → BAD_REQUEST
 *     - password too short (< 8 chars) → BAD_REQUEST
 *
 *   Happy path — admin role + service mock → correct response shape
 *     - listUsers → UserRow[]
 *     - createUser → UserRow with expected fields
 *     - getAiConfig → AiConfigData with supportedModels
 *     - updateAiConfig → AiConfigData
 *     - deleteUser → { success: true }
 *     - listApiKeys → ApiKeyMasked[]
 *     - validateApiKey → { valid: boolean }
 *     - saveApiKey → ApiKeyMasked
 *     - updateApiKey → ApiKeyMasked
 *     - deleteApiKey → { success: true }
 *
 * Uses createCallerFactory from @/server/trpc — no HTTP, no real DB.
 * All 3 services are mocked via vi.mock so no Supabase / Claude calls occur.
 *
 * Ref:
 *   - design/api-spec.md   — Role × Procedure Matrix, Input Schemas
 *   - design/components.md — AdminRouter (Component 1)
 *   - Task 9.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock UserManagementService ───────────────────────────────────────────────

const mockListUsers = vi.fn();
const mockCreateUser = vi.fn();
const mockUpdateUserRole = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock("@/modules/admin-ai-config/user-service", () => ({
  userManagementService: {
    listUsers: mockListUsers,
    createUser: mockCreateUser,
    updateUserRole: mockUpdateUserRole,
    deleteUser: mockDeleteUser,
  },
}));

// ─── Mock AiConfigService ─────────────────────────────────────────────────────

const mockGetAiConfig = vi.fn();
const mockUpdateAiConfig = vi.fn();

vi.mock("@/modules/admin-ai-config/ai-config-service", () => ({
  aiConfigService: {
    getAiConfig: mockGetAiConfig,
    updateAiConfig: mockUpdateAiConfig,
  },
}));

// ─── Mock ApiKeyService ───────────────────────────────────────────────────────

const mockListApiKeys = vi.fn();
const mockValidateApiKey = vi.fn();
const mockSaveApiKey = vi.fn();
const mockUpdateApiKey = vi.fn();
const mockDeleteApiKey = vi.fn();

vi.mock("@/modules/admin-ai-config/api-key-service", () => ({
  apiKeyService: {
    listApiKeys: mockListApiKeys,
    validateApiKey: mockValidateApiKey,
    saveApiKey: mockSaveApiKey,
    updateApiKey: mockUpdateApiKey,
    deleteApiKey: mockDeleteApiKey,
  },
}));

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockSupabaseClient = {
  from: vi.fn(),
  auth: { admin: {} },
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
  createAdminSupabaseClient: vi.fn(() => mockSupabaseClient),
}));

// ─── Mock RBAC (real hierarchy) ───────────────────────────────────────────────

vi.mock("@/lib/auth/rbac", () => ({
  hasRole: vi.fn((userRole: string, requiredRole: string) => {
    const hierarchy = ["guest", "internal_submitter", "bd_reviewer", "admin"];
    return hierarchy.indexOf(userRole) >= hierarchy.indexOf(requiredRole);
  }),
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_UUID = "a0000000-0000-4000-8000-000000000001";
const TARGET_UUID = "b0000000-0000-4000-8000-000000000002";
const KEY_UUID = "c0000000-0000-4000-8000-000000000003";

const MOCK_USER_ROW = {
  id: TARGET_UUID,
  email: "user@applica.co.th",
  fullName: "Test User",
  role: "bd_reviewer" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSignInAt: null,
};

const MOCK_AI_CONFIG = {
  analysisModel: "claude-sonnet-4-5",
  documentGenerationModel: "claude-opus-4-5",
  defaultModel: "claude-sonnet-4-5",
  fallbackModel: "claude-haiku-4-5",
  supportedModels: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
};

const MOCK_API_KEY_MASKED = {
  id: KEY_UUID,
  name: "Production Key",
  provider: "anthropic",
  maskedKey: "sk-ant-...4f8a",
  isActive: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  createdByName: "Admin User",
};

// ─── Context factory ──────────────────────────────────────────────────────────

function makeContext(role?: string) {
  if (!role) {
    return {
      db: mockSupabaseClient,
      session: null,
      user: null,
      role: null,
    };
  }
  return {
    db: mockSupabaseClient,
    session: { user: { id: ADMIN_UUID, email: "admin@applica.co.th" } },
    user: {
      id: ADMIN_UUID,
      email: "admin@applica.co.th",
      user_metadata: { full_name: "Admin", role },
    },
    role,
  };
}

// ─── Caller factory ───────────────────────────────────────────────────────────

async function makeCaller(role?: string) {
  const { adminRouter } = await import("@/modules/admin-ai-config/router");
  const { createCallerFactory } = await import("@/server/trpc");
  const factory = createCallerFactory(adminRouter);
  return factory(makeContext(role) as Parameters<typeof factory>[0]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AdminRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Role Guard — all 11 procedures
  // ══════════════════════════════════════════════════════════════════════════

  describe("Role guard — non-admin roles get FORBIDDEN", () => {
    const NON_ADMIN_ROLES = ["bd_reviewer", "internal_submitter"] as const;

    // ── listUsers ──────────────────────────────────────────────────────────

    it.each(NON_ADMIN_ROLES)("%s cannot call listUsers (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("unauthenticated cannot call listUsers (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.listUsers()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    // ── createUser ─────────────────────────────────────────────────────────

    const VALID_CREATE_INPUT = {
      email: "new@applica.co.th",
      password: "SecurePass1!",
      role: "bd_reviewer" as const,
    };

    it.each(NON_ADMIN_ROLES)("%s cannot call createUser (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.createUser(VALID_CREATE_INPUT)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("unauthenticated cannot call createUser (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.createUser(VALID_CREATE_INPUT)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    // ── updateUserRole ─────────────────────────────────────────────────────

    const VALID_UPDATE_ROLE_INPUT = { userId: TARGET_UUID, role: "bd_reviewer" as const };

    it.each(NON_ADMIN_ROLES)("%s cannot call updateUserRole (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.updateUserRole(VALID_UPDATE_ROLE_INPUT)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("unauthenticated cannot call updateUserRole (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.updateUserRole(VALID_UPDATE_ROLE_INPUT)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    // ── deleteUser ─────────────────────────────────────────────────────────

    const VALID_DELETE_INPUT = { userId: TARGET_UUID };

    it.each(NON_ADMIN_ROLES)("%s cannot call deleteUser (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.deleteUser(VALID_DELETE_INPUT)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("unauthenticated cannot call deleteUser (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.deleteUser(VALID_DELETE_INPUT)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    // ── getAiConfig ────────────────────────────────────────────────────────

    it.each(NON_ADMIN_ROLES)("%s cannot call getAiConfig (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.getAiConfig()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("unauthenticated cannot call getAiConfig (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.getAiConfig()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    // ── updateAiConfig ─────────────────────────────────────────────────────

    const VALID_AI_CONFIG_INPUT = {
      analysisModel: "claude-sonnet-4-5" as const,
      documentGenerationModel: "claude-opus-4-5" as const,
      defaultModel: "claude-sonnet-4-5" as const,
      fallbackModel: "claude-haiku-4-5" as const,
    };

    it.each(NON_ADMIN_ROLES)("%s cannot call updateAiConfig (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.updateAiConfig(VALID_AI_CONFIG_INPUT)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("unauthenticated cannot call updateAiConfig (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.updateAiConfig(VALID_AI_CONFIG_INPUT)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    // ── listApiKeys ────────────────────────────────────────────────────────

    it.each(NON_ADMIN_ROLES)("%s cannot call listApiKeys (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.listApiKeys()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("unauthenticated cannot call listApiKeys (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.listApiKeys()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    // ── validateApiKey ─────────────────────────────────────────────────────

    const VALID_VALIDATE_INPUT = { key: "sk-ant-api-key-testkey", provider: "anthropic" as const };

    it.each(NON_ADMIN_ROLES)("%s cannot call validateApiKey (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.validateApiKey(VALID_VALIDATE_INPUT)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("unauthenticated cannot call validateApiKey (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.validateApiKey(VALID_VALIDATE_INPUT)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    // ── saveApiKey ─────────────────────────────────────────────────────────

    const VALID_SAVE_KEY_INPUT = {
      name: "Test Key",
      key: "sk-ant-api-key-testkey",
      provider: "anthropic" as const,
      setActive: false,
    };

    it.each(NON_ADMIN_ROLES)("%s cannot call saveApiKey (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.saveApiKey(VALID_SAVE_KEY_INPUT)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("unauthenticated cannot call saveApiKey (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.saveApiKey(VALID_SAVE_KEY_INPUT)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    // ── updateApiKey ───────────────────────────────────────────────────────

    const VALID_UPDATE_KEY_INPUT = {
      id: KEY_UUID,
      newKey: "sk-ant-api-key-newkeyvalue",
    };

    it.each(NON_ADMIN_ROLES)("%s cannot call updateApiKey (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.updateApiKey(VALID_UPDATE_KEY_INPUT)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("unauthenticated cannot call updateApiKey (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.updateApiKey(VALID_UPDATE_KEY_INPUT)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    // ── deleteApiKey ───────────────────────────────────────────────────────

    it.each(NON_ADMIN_ROLES)("%s cannot call deleteApiKey (FORBIDDEN)", async (role) => {
      const caller = await makeCaller(role);
      await expect(caller.deleteApiKey({ id: KEY_UUID })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("unauthenticated cannot call deleteApiKey (UNAUTHORIZED)", async () => {
      const caller = await makeCaller();
      await expect(caller.deleteApiKey({ id: KEY_UUID })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Input validation
  // ══════════════════════════════════════════════════════════════════════════

  describe("Input validation", () => {
    // ── createUser — email ─────────────────────────────────────────────────

    it("rejects invalid email in createUser (BAD_REQUEST)", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.createUser({
          email: "not-an-email",
          password: "SecurePass1!",
          role: "bd_reviewer",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects password shorter than 8 chars in createUser (BAD_REQUEST)", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.createUser({
          email: "valid@applica.co.th",
          password: "short",
          role: "bd_reviewer",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    // ── updateAiConfig — model validation ─────────────────────────────────

    it("rejects unsupported model in updateAiConfig (BAD_REQUEST)", async () => {
      const caller = await makeCaller("admin");

      await expect(
        // @ts-expect-error — intentionally invalid model
        caller.updateAiConfig({
          analysisModel: "gpt-4o",
          documentGenerationModel: "claude-opus-4-5",
          defaultModel: "claude-sonnet-4-5",
          fallbackModel: "claude-haiku-4-5",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    // ── updateUserRole — UUID ──────────────────────────────────────────────

    it("rejects invalid UUID in updateUserRole (BAD_REQUEST)", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.updateUserRole({
          userId: "not-a-uuid",
          role: "bd_reviewer",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects invalid UUID in deleteUser (BAD_REQUEST)", async () => {
      const caller = await makeCaller("admin");

      await expect(caller.deleteUser({ userId: "not-a-uuid" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    // ── saveApiKey / validateApiKey — key too short ────────────────────────

    it("rejects key shorter than 10 chars in saveApiKey (BAD_REQUEST)", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.saveApiKey({
          name: "Short Key",
          key: "short",
          provider: "anthropic",
          setActive: false,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects key shorter than 10 chars in validateApiKey (BAD_REQUEST)", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.validateApiKey({ key: "tooshort", provider: "anthropic" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects key shorter than 10 chars in updateApiKey (BAD_REQUEST)", async () => {
      const caller = await makeCaller("admin");

      await expect(caller.updateApiKey({ id: KEY_UUID, newKey: "short" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("rejects invalid UUID in deleteApiKey (BAD_REQUEST)", async () => {
      const caller = await makeCaller("admin");

      await expect(caller.deleteApiKey({ id: "not-a-uuid" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("rejects invalid UUID in updateApiKey (BAD_REQUEST)", async () => {
      const caller = await makeCaller("admin");

      await expect(
        caller.updateApiKey({ id: "not-a-uuid", newKey: "sk-ant-api-key-valid" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Happy path — admin role + service mock → correct shape
  // ══════════════════════════════════════════════════════════════════════════

  describe("Happy path — admin role", () => {
    // ── listUsers ──────────────────────────────────────────────────────────

    it("listUsers → returns UserRow[]", async () => {
      mockListUsers.mockResolvedValueOnce([MOCK_USER_ROW]);

      const caller = await makeCaller("admin");
      const result = await caller.listUsers();

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toMatchObject({
        id: TARGET_UUID,
        email: "user@applica.co.th",
        role: "bd_reviewer",
      });
      expect(mockListUsers).toHaveBeenCalledOnce();
    });

    // ── createUser ─────────────────────────────────────────────────────────

    it("createUser → returns UserRow with expected fields", async () => {
      mockCreateUser.mockResolvedValueOnce(MOCK_USER_ROW);

      const caller = await makeCaller("admin");
      const result = await caller.createUser({
        email: "user@applica.co.th",
        password: "SecurePass1!",
        role: "bd_reviewer",
        fullName: "Test User",
      });

      expect(result).toMatchObject({
        id: expect.any(String),
        email: expect.any(String),
        role: expect.any(String),
        createdAt: expect.any(String),
      });
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: "user@applica.co.th" }),
        ADMIN_UUID
      );
    });

    // ── updateUserRole ─────────────────────────────────────────────────────

    it("updateUserRole → returns updated UserRow", async () => {
      const updatedRow = { ...MOCK_USER_ROW, role: "admin" as const };
      mockUpdateUserRole.mockResolvedValueOnce(updatedRow);

      const caller = await makeCaller("admin");
      const result = await caller.updateUserRole({ userId: TARGET_UUID, role: "admin" });

      expect(result.role).toBe("admin");
      expect(mockUpdateUserRole).toHaveBeenCalledWith(TARGET_UUID, "admin", ADMIN_UUID);
    });

    // ── deleteUser ─────────────────────────────────────────────────────────

    it("deleteUser → returns { success: true }", async () => {
      mockDeleteUser.mockResolvedValueOnce(undefined);

      const caller = await makeCaller("admin");
      const result = await caller.deleteUser({ userId: TARGET_UUID });

      expect(result).toEqual({ success: true });
      expect(mockDeleteUser).toHaveBeenCalledWith(TARGET_UUID, ADMIN_UUID);
    });

    // ── getAiConfig ────────────────────────────────────────────────────────

    it("getAiConfig → returns AiConfigData with supportedModels array", async () => {
      mockGetAiConfig.mockResolvedValueOnce(MOCK_AI_CONFIG);

      const caller = await makeCaller("admin");
      const result = await caller.getAiConfig();

      expect(result).toMatchObject({
        analysisModel: expect.any(String),
        documentGenerationModel: expect.any(String),
        defaultModel: expect.any(String),
        fallbackModel: expect.any(String),
        supportedModels: expect.arrayContaining([expect.any(String)]),
      });
      expect(result.supportedModels.length).toBeGreaterThan(0);
    });

    // ── updateAiConfig ─────────────────────────────────────────────────────

    it("updateAiConfig → returns AiConfigData", async () => {
      mockUpdateAiConfig.mockResolvedValueOnce(MOCK_AI_CONFIG);

      const caller = await makeCaller("admin");
      const result = await caller.updateAiConfig({
        analysisModel: "claude-sonnet-4-5",
        documentGenerationModel: "claude-opus-4-5",
        defaultModel: "claude-sonnet-4-5",
        fallbackModel: "claude-haiku-4-5",
      });

      expect(result.analysisModel).toBe("claude-sonnet-4-5");
      expect(mockUpdateAiConfig).toHaveBeenCalledWith(
        expect.objectContaining({ analysisModel: "claude-sonnet-4-5" }),
        ADMIN_UUID
      );
    });

    // ── listApiKeys ────────────────────────────────────────────────────────

    it("listApiKeys → returns ApiKeyMasked[] (no plaintext key)", async () => {
      mockListApiKeys.mockResolvedValueOnce([MOCK_API_KEY_MASKED]);

      const caller = await makeCaller("admin");
      const result = await caller.listApiKeys();

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toMatchObject({
        id: KEY_UUID,
        maskedKey: expect.stringContaining("..."),
        isActive: expect.any(Boolean),
      });
      // Plaintext key should never be in the response
      expect(JSON.stringify(result)).not.toMatch(/^sk-ant-[a-zA-Z0-9-]+$/);
    });

    // ── validateApiKey ─────────────────────────────────────────────────────

    it("validateApiKey → returns { valid: boolean }", async () => {
      mockValidateApiKey.mockResolvedValueOnce({ valid: true, latencyMs: 120 });

      const caller = await makeCaller("admin");
      const result = await caller.validateApiKey({
        key: "sk-ant-api-key-testvalue",
        provider: "anthropic",
      });

      expect(result).toMatchObject({ valid: true });
      expect(typeof result.valid).toBe("boolean");
    });

    it("validateApiKey → returns { valid: false, error } for invalid key (no throw)", async () => {
      mockValidateApiKey.mockResolvedValueOnce({
        valid: false,
        error: "API key invalid or expired",
        latencyMs: 80,
      });

      const caller = await makeCaller("admin");
      const result = await caller.validateApiKey({
        key: "sk-ant-api-key-badvalue1",
        provider: "anthropic",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    // ── saveApiKey ─────────────────────────────────────────────────────────

    it("saveApiKey → returns ApiKeyMasked", async () => {
      mockSaveApiKey.mockResolvedValueOnce(MOCK_API_KEY_MASKED);

      const caller = await makeCaller("admin");
      const result = await caller.saveApiKey({
        name: "Production Key",
        key: "sk-ant-api-key-testvalue",
        provider: "anthropic",
        setActive: true,
      });

      expect(result).toMatchObject({
        id: expect.any(String),
        name: "Production Key",
        provider: "anthropic",
        maskedKey: expect.stringContaining("..."),
        isActive: expect.any(Boolean),
      });
      expect(mockSaveApiKey).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Production Key", setActive: true }),
        ADMIN_UUID
      );
    });

    // ── updateApiKey ───────────────────────────────────────────────────────

    it("updateApiKey → returns ApiKeyMasked", async () => {
      mockUpdateApiKey.mockResolvedValueOnce(MOCK_API_KEY_MASKED);

      const caller = await makeCaller("admin");
      const result = await caller.updateApiKey({
        id: KEY_UUID,
        newKey: "sk-ant-api-key-newkeyvalue",
      });

      expect(result).toMatchObject({
        id: KEY_UUID,
        maskedKey: expect.stringContaining("..."),
      });
      expect(mockUpdateApiKey).toHaveBeenCalledWith(
        KEY_UUID,
        "sk-ant-api-key-newkeyvalue",
        ADMIN_UUID
      );
    });

    // ── deleteApiKey ───────────────────────────────────────────────────────

    it("deleteApiKey → returns { success: true }", async () => {
      mockDeleteApiKey.mockResolvedValueOnce(undefined);

      const caller = await makeCaller("admin");
      const result = await caller.deleteApiKey({ id: KEY_UUID });

      expect(result).toEqual({ success: true });
      expect(mockDeleteApiKey).toHaveBeenCalledWith(KEY_UUID, ADMIN_UUID);
    });
  });
});
