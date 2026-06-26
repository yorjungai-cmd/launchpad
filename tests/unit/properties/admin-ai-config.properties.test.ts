/**
 * Property-Based Tests — admin-ai-config (Security Properties)
 *
 * Implements all 4 security-critical correctness properties defined in
 * design/correctness.md:
 *
 *   Property 1 — maskKey() never exposes plaintext (200 runs)
 *   Property 2 — Audit log metadata never contains forbidden key fields (200 runs)
 *   Property 3 — Non-admin roles always get FORBIDDEN/UNAUTHORIZED (200 runs)
 *   Property 4 — updateAiConfig rejects unsupported model names (200 runs)
 *
 * PBT framework: fast-check
 * numRuns: 200 per property
 * Shrinking: enabled (fast-check default)
 *
 * Ref: .aidlc/specs/launchpad-portal/units/admin-ai-config/design/correctness.md
 * Task 9.2
 */

import { describe, it, beforeEach, vi, expect } from "vitest";
import fc from "fast-check";

// ─── Module mocks (must be declared before imports) ───────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
  createAdminSupabaseClient: vi.fn(() => mockSupabaseClient),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
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

// Mock only the services used by the adminRouter query/mutation bodies.
// api-key-service and audit-log-service are NOT mocked here so we can
// use the real ApiKeyService and AdminAuditLogService classes in Properties 1 & 2.
vi.mock("@/modules/admin-ai-config/ai-config-service", () => ({
  aiConfigService: {
    getAiConfig: mockGetAiConfig,
    updateAiConfig: mockUpdateAiConfig,
  },
  AiConfigService: vi.fn(),
}));

vi.mock("@/modules/admin-ai-config/user-service", () => ({
  userManagementService: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUserRole: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

// ─── Shared mock objects (referenced by vi.mock factories above) ──────────────
// These must be declared in module scope so the factory closures can see them.

const mockSupabaseFrom = vi.fn();
const mockSupabaseRpc = vi.fn();
const mockSupabaseClient = {
  from: mockSupabaseFrom,
  rpc: mockSupabaseRpc,
};

const mockUpdateAiConfig = vi.fn();
const mockGetAiConfig = vi.fn();

// ─── Real class imports (after mocks are set up) ──────────────────────────────

import { ApiKeyService } from "@/modules/admin-ai-config/api-key-service";
import { AdminAuditLogService } from "@/modules/admin-ai-config/audit-log-service";
import { SUPPORTED_MODELS, FORBIDDEN_METADATA_FIELDS } from "@/modules/admin-ai-config/schemas";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal tRPC context for a given role (or null for unauthenticated). */
function makeTRPCContext(role: string | null) {
  if (!role) {
    return { db: mockSupabaseClient, session: null, user: null, role: null };
  }

  return {
    db: mockSupabaseClient,
    session: { user: { id: "user-uuid-admin-001", email: "admin@applica.co.th" } },
    user: {
      id: "user-uuid-admin-001",
      email: "admin@applica.co.th",
      user_metadata: { full_name: "Admin User", role },
    },
    role,
  };
}

// ─── Property 1: maskKey() Never Exposes Plaintext ────────────────────────────

describe("Property 1 — maskKey() never exposes plaintext (200 runs)", () => {
  // Instantiate the real ApiKeyService. _maskKey is pure with no I/O.
  const service = new ApiKeyService();
  // Access private method via any-cast (intentional for whitebox testing)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maskKey = (plaintext: string): string => (service as any)._maskKey(plaintext);

  it("masked output never contains the plaintext body (only last 4 chars allowed)", () => {
    fc.assert(
      fc.property(
        // Exclude pipe character from PBT since "|" is the Bedrock key delimiter
        fc
          .string({ minLength: 10, maxLength: 200 })
          .filter((k) => k.length >= 10 && !k.includes("|")),
        (plaintext) => {
          const masked = maskKey(plaintext);
          const last4 = plaintext.slice(-4);

          // Invariant 1: masked must end with the last 4 chars of plaintext
          if (!masked.endsWith(last4)) return false;

          // Invariant 2: masked must use "..." separator (always masked format)
          if (!masked.includes("...")) return false;

          // Invariant 3: the body of the key (everything before last 4 chars)
          // must not be fully present in the masked string.
          const keyBody = plaintext.slice(0, -4);
          if (keyBody.length > 8 && masked.includes(keyBody)) return false;

          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("edge case: key starting with 'sk-' uses anthropic format (sk-ant-...{last4})", () => {
    const masked = maskKey("sk-ant-api12345abcd");
    expect(masked).toMatch(/^sk-ant-\.\.\./);
    expect(masked).toMatch(/abcd$/);
  });

  it("edge case: key NOT starting with 'sk-' uses generic format (***...{last4})", () => {
    const masked = maskKey("xyz_random_key_1234");
    expect(masked).toMatch(/^\*{3}\.\.\./);
    expect(masked).toMatch(/1234$/);
  });

  it("masked string is always shorter than plaintext for long keys (≥ 20 chars)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 20, maxLength: 200 }), (plaintext) => {
        const masked = maskKey(plaintext);
        return masked.length < plaintext.length;
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property 2: Audit Log Metadata Never Contains Forbidden Fields ───────────

describe("Property 2 — Audit log metadata never contains forbidden key fields (200 runs)", () => {
  // Instantiate the real AdminAuditLogService.
  // _validateMetadata is synchronous and pure — the mocked DB client handles
  // the fire-and-forget async insert without needing real Supabase.
  const auditService = new AdminAuditLogService();

  it("should throw synchronously when metadata contains any forbidden field", () => {
    fc.assert(
      fc.property(
        fc.record({
          action: fc.constantFrom(
            "api_key_created" as const,
            "api_key_updated" as const,
            "api_key_deleted" as const
          ),
          adminId: fc.uuid(),
          targetType: fc.constant("api_key" as const),
          targetId: fc.uuid(),
          metadata: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 50 }).filter((k) => !/^[\d]/.test(k)),
            fc.oneof(fc.string(), fc.integer(), fc.boolean())
          ),
        }),
        fc.constantFrom(...FORBIDDEN_METADATA_FIELDS),
        (entry, forbiddenField) => {
          const entryWithForbidden = {
            ...entry,
            metadata: {
              ...entry.metadata,
              [forbiddenField]: "should-be-rejected",
            },
          };

          // Must throw synchronously (metadata validation runs before any async work)
          expect(() => auditService.log(entryWithForbidden)).toThrow(/forbidden field/i);
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("should NOT throw for metadata with only clean field names", () => {
    const FORBIDDEN_SET = new Set<string>(FORBIDDEN_METADATA_FIELDS);

    fc.assert(
      fc.property(
        fc.dictionary(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((k) => !FORBIDDEN_SET.has(k) && !/^[\d]/.test(k)),
          fc.oneof(fc.string(), fc.integer(), fc.boolean())
        ),
        (cleanMetadata) => {
          const entry = {
            action: "api_key_created" as const,
            adminId: "00000000-0000-0000-0000-000000000001",
            targetType: "api_key" as const,
            targetId: "00000000-0000-0000-0000-000000000002",
            metadata: cleanMetadata,
          };

          expect(() => auditService.log(entry)).not.toThrow();
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("edge case: empty metadata {} — always valid (no forbidden fields present)", () => {
    const entry = {
      action: "api_key_deleted" as const,
      adminId: "00000000-0000-0000-0000-000000000001",
      targetType: "api_key" as const,
      targetId: "00000000-0000-0000-0000-000000000002",
      metadata: {},
    };

    expect(() => auditService.log(entry)).not.toThrow();
  });

  it("edge case: each forbidden field individually triggers throw", () => {
    for (const forbidden of FORBIDDEN_METADATA_FIELDS) {
      const entry = {
        action: "api_key_created" as const,
        adminId: "00000000-0000-0000-0000-000000000001",
        targetType: "api_key" as const,
        targetId: "00000000-0000-0000-0000-000000000002",
        metadata: { [forbidden]: "value" },
      };

      expect(() => auditService.log(entry)).toThrow();
    }
  });
});

// ─── Property 3: Non-Admin Roles Always Get FORBIDDEN/UNAUTHORIZED ────────────

describe("Property 3 — Non-admin roles always get FORBIDDEN/UNAUTHORIZED (200 runs)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("all non-admin roles are blocked on getAiConfig", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "bd_reviewer" as const,
          "internal_submitter" as const,
          "guest" as const,
          null
        ),
        async (unauthorizedRole) => {
          vi.clearAllMocks();

          const { createCallerFactory } = await import("@/server/trpc");
          const { adminRouter } = await import("@/modules/admin-ai-config/router");

          const factory = createCallerFactory(adminRouter);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const caller = factory(makeTRPCContext(unauthorizedRole) as any);

          let threw = false;
          try {
            await caller.getAiConfig();
          } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            threw = code === "FORBIDDEN" || code === "UNAUTHORIZED";
          }

          return threw;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("all non-admin roles are blocked on listApiKeys", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "bd_reviewer" as const,
          "internal_submitter" as const,
          "guest" as const,
          null
        ),
        async (unauthorizedRole) => {
          vi.clearAllMocks();

          const { createCallerFactory } = await import("@/server/trpc");
          const { adminRouter } = await import("@/modules/admin-ai-config/router");

          const factory = createCallerFactory(adminRouter);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const caller = factory(makeTRPCContext(unauthorizedRole) as any);

          let threw = false;
          try {
            await caller.listApiKeys();
          } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            threw = code === "FORBIDDEN" || code === "UNAUTHORIZED";
          }

          return threw;
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Core property: all non-admin roles × query procedures → always blocked.
   * 200 total runs cycling (role × procedure) combinations.
   */
  it("non-admin roles are blocked across all admin query procedures", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "bd_reviewer" as const,
          "internal_submitter" as const,
          "guest" as const,
          null
        ),
        fc.constantFrom("listUsers" as const, "getAiConfig" as const, "listApiKeys" as const),
        async (unauthorizedRole, procedureName) => {
          vi.clearAllMocks();

          const { createCallerFactory } = await import("@/server/trpc");
          const { adminRouter } = await import("@/modules/admin-ai-config/router");

          const factory = createCallerFactory(adminRouter);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const caller = factory(makeTRPCContext(unauthorizedRole) as any);

          let threw = false;
          try {
            await caller[procedureName]();
          } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            threw = code === "FORBIDDEN" || code === "UNAUTHORIZED";
          }

          return threw;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("admin role CAN access getAiConfig (positive control)", async () => {
    mockGetAiConfig.mockResolvedValue({
      analysisModel: "claude-sonnet-4-5",
      documentGenerationModel: "claude-opus-4-5",
      defaultModel: "claude-sonnet-4-5",
      fallbackModel: "claude-haiku-4-5",
      supportedModels: [...SUPPORTED_MODELS],
    });

    const { createCallerFactory } = await import("@/server/trpc");
    const { adminRouter } = await import("@/modules/admin-ai-config/router");

    const factory = createCallerFactory(adminRouter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminCaller = factory(makeTRPCContext("admin") as any);

    await expect(adminCaller.getAiConfig()).resolves.toBeDefined();
  });
});

// ─── Property 4: updateAiConfig Rejects Unsupported Model Names ───────────────

describe("Property 4 — updateAiConfig rejects unsupported model names (200 runs)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Core property: arbitrary model name strings are almost always unsupported.
   * The tRPC layer validates against UpdateAiConfigSchema (Zod enum) before
   * reaching the service, so unsupported models must produce BAD_REQUEST.
   */
  it("rejects any config where any model field is not in SUPPORTED_MODELS", async () => {
    const SUPPORTED_SET = new Set<string>(SUPPORTED_MODELS);

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          analysisModel: fc.string({ minLength: 1, maxLength: 50 }),
          documentGenerationModel: fc.string({ minLength: 1, maxLength: 50 }),
          defaultModel: fc.string({ minLength: 1, maxLength: 50 }),
          fallbackModel: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        async (config) => {
          vi.clearAllMocks();

          const hasUnsupported = Object.values(config).some((model) => !SUPPORTED_SET.has(model));

          const { createCallerFactory } = await import("@/server/trpc");
          const { adminRouter } = await import("@/modules/admin-ai-config/router");

          const factory = createCallerFactory(adminRouter);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const caller = factory(makeTRPCContext("admin") as any);

          if (hasUnsupported) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await caller.updateAiConfig(config as any);
              return false; // must not reach here
            } catch (err: unknown) {
              const code = (err as { code?: string }).code;
              return code === "BAD_REQUEST";
            }
          } else {
            // All four fields happen to be valid — mock the service
            mockUpdateAiConfig.mockResolvedValue({
              ...config,
              supportedModels: [...SUPPORTED_MODELS],
            });

            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const result = await caller.updateAiConfig(config as any);
              return result !== null && result !== undefined;
            } catch {
              return false;
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("edge case: empty string model name is rejected with BAD_REQUEST", async () => {
    const { createCallerFactory } = await import("@/server/trpc");
    const { adminRouter } = await import("@/modules/admin-ai-config/router");

    const factory = createCallerFactory(adminRouter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = factory(makeTRPCContext("admin") as any);

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller.updateAiConfig({
        analysisModel: "" as any,
        documentGenerationModel: "claude-sonnet-4-5",
        defaultModel: "claude-sonnet-4-5",
        fallbackModel: "claude-haiku-4-5",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("all three supported models are individually accepted (positive control)", async () => {
    for (const model of SUPPORTED_MODELS) {
      vi.clearAllMocks();

      mockUpdateAiConfig.mockResolvedValue({
        analysisModel: model,
        documentGenerationModel: model,
        defaultModel: model,
        fallbackModel: model,
        supportedModels: [...SUPPORTED_MODELS],
      });

      const { createCallerFactory } = await import("@/server/trpc");
      const { adminRouter } = await import("@/modules/admin-ai-config/router");

      const factory = createCallerFactory(adminRouter);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caller = factory(makeTRPCContext("admin") as any);

      const result = await caller.updateAiConfig({
        analysisModel: model,
        documentGenerationModel: model,
        defaultModel: model,
        fallbackModel: model,
      });

      expect(result).toBeDefined();
    }
  });

  it("arbitrary non-supported strings always produce BAD_REQUEST", async () => {
    const SUPPORTED_SET = new Set<string>(SUPPORTED_MODELS);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !SUPPORTED_SET.has(s)),
        async (unsupportedModel) => {
          vi.clearAllMocks();

          const { createCallerFactory } = await import("@/server/trpc");
          const { adminRouter } = await import("@/modules/admin-ai-config/router");

          const factory = createCallerFactory(adminRouter);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const caller = factory(makeTRPCContext("admin") as any);

          try {
            await caller.updateAiConfig({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              analysisModel: unsupportedModel as any,
              documentGenerationModel: "claude-sonnet-4-5",
              defaultModel: "claude-sonnet-4-5",
              fallbackModel: "claude-haiku-4-5",
            });
            return false; // should never succeed with unsupported model
          } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            return code === "BAD_REQUEST";
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
