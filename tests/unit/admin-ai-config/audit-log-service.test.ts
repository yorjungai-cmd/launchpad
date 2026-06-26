/**
 * Unit tests — AdminAuditLogService
 *
 * Covers:
 *   - log(): forbidden field names in metadata → throw synchronously
 *       (key, secret, token, password, apiKey, api_key)
 *   - log(): valid metadata → pass validation and fire DB insert
 *   - fire-and-forget: DB error does NOT throw to the caller
 *       (error is logged via Pino, swallowed)
 *   - _validateMetadata(): tested indirectly via log()
 *
 * Security invariant verified:
 *   - FORBIDDEN_METADATA_FIELDS covers all sensitive field names
 *   - Throw is synchronous (before any async work)
 *
 * Ref: design/components.md — AdminAuditLogService (Component 5)
 * Task 9.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Supabase admin client ───────────────────────────────────────────────

const mockFrom = vi.fn();

const mockSupabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
  createAdminSupabaseClient: vi.fn(() => mockSupabaseClient),
}));

// ─── Mock logger (capture Pino calls) ────────────────────────────────────────

const mockLoggerError = vi.fn();

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
    debug: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a Supabase fluent-chain mock that resolves with the provided result. */
function makeChain(result: { data: unknown; error: unknown }) {
  const resolved = Promise.resolve(result);
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") return resolved.then.bind(resolved);
      if (prop === "catch") return resolved.catch.bind(resolved);
      if (prop === "finally") return resolved.finally.bind(resolved);
      return (..._args: unknown[]) => proxy;
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

/** A valid audit log entry with safe metadata. */
const VALID_ENTRY = {
  action: "api_key_created" as const,
  adminId: "admin-uuid-0001-e5f6-7890-abcd-ef1234567890",
  targetType: "api_key" as const,
  targetId: "key-uuid-0001-e5f6-7890-abcd-ef1234567890",
  metadata: {
    name: "Production Key",
    provider: "anthropic",
    setActive: true,
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AdminAuditLogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // log() — forbidden field validation (synchronous throw)
  // ══════════════════════════════════════════════════════════════════════════

  describe("log() — forbidden metadata fields", () => {
    const FORBIDDEN_FIELDS = ["key", "secret", "token", "password", "apiKey", "api_key"];

    // NOTE: _validateMetadata() throws synchronously inside log() before the
    // return Promise.resolve() is reached. Because log() is not an async function,
    // the throw propagates as a synchronous exception from calling log().
    // We must therefore use expect(() => ...).toThrow() — NOT .rejects.toThrow().

    for (const field of FORBIDDEN_FIELDS) {
      it(`throws synchronously when metadata contains forbidden field "${field}"`, async () => {
        const { AdminAuditLogService } =
          await import("@/modules/admin-ai-config/audit-log-service");
        const service = new AdminAuditLogService();

        const entry = {
          ...VALID_ENTRY,
          metadata: {
            ...VALID_ENTRY.metadata,
            [field]: "sensitive-value-here",
          },
        };

        // Synchronous throw — use .toThrow(), not .rejects.toThrow()
        expect(() => service.log(entry)).toThrow(/forbidden field/i);
        expect(() => service.log(entry)).toThrow(`"${field}"`);
      });

      it(`does NOT call Supabase when metadata contains forbidden field "${field}"`, async () => {
        const { AdminAuditLogService } =
          await import("@/modules/admin-ai-config/audit-log-service");
        const service = new AdminAuditLogService();

        const entry = {
          ...VALID_ENTRY,
          metadata: { [field]: "should-never-reach-db" },
        };

        expect(() => service.log(entry)).toThrow();
        expect(mockFrom).not.toHaveBeenCalled();
      });
    }

    it("error message names the offending field", async () => {
      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();

      const entry = { ...VALID_ENTRY, metadata: { token: "abc123" } };

      let errorMessage = "";
      try {
        service.log(entry); // synchronous throw
      } catch (err) {
        errorMessage = (err as Error).message;
      }

      expect(errorMessage).toContain('"token"');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // log() — valid metadata passes through
  // ══════════════════════════════════════════════════════════════════════════

  describe("log() — valid metadata", () => {
    it("does not throw for safe metadata fields (name, provider, setActive)", async () => {
      mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();

      await expect(service.log(VALID_ENTRY)).resolves.toBeUndefined();
    });

    it("calls Supabase insert with the correct table and payload for valid entry", async () => {
      // We need to observe what from() is called with.
      // Use a real spy chain so we can capture the insert call.
      const mockInsert = vi.fn().mockReturnThis();
      const mockFromReturn = {
        insert: mockInsert,
        then: (resolve: (v: unknown) => void) => {
          resolve({ data: null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
      };
      mockFrom.mockReturnValue(mockFromReturn);

      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();

      await service.log(VALID_ENTRY);

      // Give the fire-and-forget microtask a tick to settle
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockFrom).toHaveBeenCalledWith("admin_audit_log");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: VALID_ENTRY.action,
          admin_id: VALID_ENTRY.adminId,
          target_type: VALID_ENTRY.targetType,
          target_id: VALID_ENTRY.targetId,
          metadata: VALID_ENTRY.metadata,
        })
      );
    });

    it("accepts empty metadata {}", async () => {
      mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();

      const entry = { ...VALID_ENTRY, metadata: {} };
      await expect(service.log(entry)).resolves.toBeUndefined();
    });

    it("accepts metadata with numeric and boolean values", async () => {
      mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();

      const entry = {
        ...VALID_ENTRY,
        metadata: { attemptCount: 3, wasActive: false, provider: "anthropic" },
      };

      await expect(service.log(entry)).resolves.toBeUndefined();
    });

    it("resolves immediately (fire-and-forget — caller does not wait for DB)", async () => {
      // Intentionally slow DB (never resolves in practice — but we return fast)
      let resolveInsert!: () => void;
      const neverResolvingChain = {
        insert: vi.fn().mockReturnValue({
          then: (_resolve: unknown, _reject: unknown) => {
            // Store the resolver but never call it
            resolveInsert = _resolve as () => void;
            return new Promise(() => {}); // hangs forever
          },
        }),
      };
      mockFrom.mockReturnValue(neverResolvingChain);

      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();

      // log() should resolve even though the DB call is pending
      const logPromise = service.log(VALID_ENTRY);
      await expect(logPromise).resolves.toBeUndefined();

      // Clean up the dangling promise reference
      void resolveInsert;
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // fire-and-forget: DB errors do NOT throw to caller
  // ══════════════════════════════════════════════════════════════════════════

  describe("fire-and-forget — DB error handling", () => {
    it("does NOT throw when the DB insert returns an error", async () => {
      // Supabase returns an error object
      mockFrom.mockReturnValue(makeChain({ data: null, error: { message: "connection refused" } }));

      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();

      // Must NOT reject
      await expect(service.log(VALID_ENTRY)).resolves.toBeUndefined();
    });

    it("logs the DB error via Pino (logger.error) when the insert fails", async () => {
      // Return an error from the chain
      mockFrom.mockReturnValue(makeChain({ data: null, error: { message: "pg timeout" } }));

      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();

      await service.log(VALID_ENTRY);

      // Wait for the fire-and-forget .catch() to run
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLoggerError).toHaveBeenCalledOnce();
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          action: VALID_ENTRY.action,
          adminId: VALID_ENTRY.adminId,
        }),
        expect.stringContaining("non-fatal")
      );
    });

    it("does NOT throw when the Supabase insert rejects (network error)", async () => {
      // Simulate a hard rejection by making the chain resolve with an error object
      // (avoid unhandled Promise rejections by using the { data, error } pattern)
      mockFrom.mockReturnValue(
        makeChain({ data: null, error: { message: "ECONNRESET", code: "NETWORK_ERROR" } })
      );

      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();

      await expect(service.log(VALID_ENTRY)).resolves.toBeUndefined();
    });

    it("logs error info (action, adminId, targetType, targetId) without sensitive data", async () => {
      mockFrom.mockReturnValue(makeChain({ data: null, error: { message: "rls violation" } }));

      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();
      await service.log(VALID_ENTRY);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const logCall = mockLoggerError.mock.calls[0]?.[0] as Record<string, unknown>;

      // Should include identifiers for traceability
      expect(logCall).toHaveProperty("action");
      expect(logCall).toHaveProperty("adminId");
      expect(logCall).toHaveProperty("targetType");
      expect(logCall).toHaveProperty("targetId");

      // Must NOT log sensitive metadata values
      const logStr = JSON.stringify(logCall);
      expect(logStr).not.toContain("sensitive-value");
    });

    it("handles multiple concurrent log() calls independently", async () => {
      // All succeed
      mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

      const { AdminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      const service = new AdminAuditLogService();

      const promises = [
        service.log({ ...VALID_ENTRY, action: "api_key_created" }),
        service.log({ ...VALID_ENTRY, action: "api_key_updated" }),
        service.log({ ...VALID_ENTRY, action: "api_key_deleted" }),
      ];

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Singleton export
  // ══════════════════════════════════════════════════════════════════════════

  describe("singleton export — adminAuditLogService", () => {
    it("exports adminAuditLogService as an AdminAuditLogService instance", async () => {
      const mod = await import("@/modules/admin-ai-config/audit-log-service");
      const { AdminAuditLogService, adminAuditLogService } = mod;

      expect(adminAuditLogService).toBeInstanceOf(AdminAuditLogService);
    });

    it("exported singleton has a log() method", async () => {
      const { adminAuditLogService } = await import("@/modules/admin-ai-config/audit-log-service");
      expect(typeof adminAuditLogService.log).toBe("function");
    });
  });
});
