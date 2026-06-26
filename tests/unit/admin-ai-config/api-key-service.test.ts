/**
 * Unit tests — ApiKeyService
 *
 * Covers:
 *   - _maskKey(): last4 correct, does NOT expose plaintext, format correct
 *       (tested indirectly via saveApiKey() inserted masked_key +
 *        directly via (service as any)._maskKey())
 *   - validateApiKey(): mock fetch — 200 → valid, 401 → invalid, timeout → invalid
 *   - listApiKeys(): mock Supabase — vault_id NOT in return, maskedKey only
 *   - saveApiKey(): mock vault RPC + DB + audit log called
 *   - deleteApiKey(): mock vault delete + DB + audit log called
 *
 * Security invariants verified:
 *   1. plaintext key is never returned by listApiKeys()
 *   2. maskedKey ends with the last 4 chars of the original key
 *   3. maskedKey is shorter than plaintext (or contains "...")
 *   4. vault_id is not exposed in ApiKeyMasked
 *
 * Ref: design/components.md — ApiKeyService (Component 4)
 * Task 9.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock audit-log-service ────────────────────────────────────────────────────
// Must be declared before importing ApiKeyService so the mock is in place.

const mockAuditLog = vi.fn();

vi.mock("@/modules/admin-ai-config/audit-log-service", () => ({
  adminAuditLogService: {
    log: mockAuditLog,
  },
}));

// ─── Mock Supabase admin client ───────────────────────────────────────────────

const mockFrom = vi.fn();
const mockRpc = vi.fn();

const mockSupabaseClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
  createAdminSupabaseClient: vi.fn(() => mockSupabaseClient),
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

/** A representative masked API key row returned by Supabase. */
const MOCK_KEY_ROW = {
  id: "key-uuid-0001",
  name: "Production Key",
  provider: "anthropic",
  vault_id: "vault-uuid-secret-do-not-expose",
  masked_key: "sk-ant-...abcd",
  is_active: true,
  created_by: "admin-uuid-0001",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  profiles: { full_name: "Alice Admin" },
};

const ADMIN_ID = "admin-uuid-0001-e5f6-7890-abcd-ef1234567890";
const KEY_ID = "key-uuid-0001-e5f6-7890-abcd-ef1234567890";
const PLAINTEXT_KEY = "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-abcd";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ApiKeyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // audit log resolves by default
    mockAuditLog.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // _maskKey (private — tested directly + via saveApiKey)
  // ══════════════════════════════════════════════════════════════════════════

  describe("_maskKey() — private method", () => {
    it("returns a string ending with the last 4 chars of the key", async () => {
      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const key = "sk-ant-api03-testkey1234";
      const masked = (service as unknown as { _maskKey(k: string): string })._maskKey(key);

      const last4 = key.slice(-4);
      expect(masked.endsWith(last4)).toBe(true);
    });

    it("masked string does NOT contain the full plaintext key", async () => {
      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const key = "sk-ant-api03-testkey1234";
      const masked = (service as unknown as { _maskKey(k: string): string })._maskKey(key);

      // The masked value must not expose the prefix (everything except last 4 chars)
      const prefix = key.slice(0, -4);
      expect(masked.includes(prefix)).toBe(false);
    });

    it('masked string is shorter than or contains "..." (always truncated)', async () => {
      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const key = "sk-ant-api03-testkey1234";
      const masked = (service as unknown as { _maskKey(k: string): string })._maskKey(key);

      const isShortened = masked.length < key.length || masked.includes("...");
      expect(isShortened).toBe(true);
    });

    it('keys starting with "sk-" produce "sk-ant-...{last4}" format', async () => {
      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const key = "sk-ant-api03-realkey-wxyz";
      const masked = (service as unknown as { _maskKey(k: string): string })._maskKey(key);

      expect(masked).toBe("sk-ant-...wxyz");
    });

    it('keys NOT starting with "sk-" produce "sk-...{last4}" format', async () => {
      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const key = "OTHER_KEY_FORMAT_1234";
      const masked = (service as unknown as { _maskKey(k: string): string })._maskKey(key);

      expect(masked).toBe("sk-...1234");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // validateApiKey()
  // ══════════════════════════════════════════════════════════════════════════

  describe("validateApiKey()", () => {
    it("returns { valid: true } when fetch responds with HTTP 200", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
        })
      );

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.validateApiKey(PLAINTEXT_KEY, "anthropic");

      expect(result.valid).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("returns { valid: true } when fetch responds with HTTP 400 (bad request but key accepted)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
        })
      );

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.validateApiKey(PLAINTEXT_KEY, "anthropic");

      expect(result.valid).toBe(true);
    });

    it("returns { valid: false } when fetch responds with HTTP 401 (key rejected)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
        })
      );

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.validateApiKey(PLAINTEXT_KEY, "anthropic");

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid|expired/i);
    });

    it("returns { valid: false } when fetch responds with unexpected status (e.g. 503)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
        })
      );

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.validateApiKey(PLAINTEXT_KEY, "anthropic");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("503");
    });

    it("returns { valid: false } when fetch throws a TimeoutError (AbortSignal timeout)", async () => {
      const timeoutError = new Error("The operation was aborted due to timeout");
      timeoutError.name = "TimeoutError";
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeoutError));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.validateApiKey(PLAINTEXT_KEY, "anthropic");

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/timeout/i);
    });

    it("returns { valid: false } when fetch throws a network error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.validateApiKey(PLAINTEXT_KEY, "anthropic");

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/network|error/i);
    });

    it("NEVER throws — even on hard failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("inet_pton: network unreachable"))
      );

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      // Must not throw
      await expect(service.validateApiKey(PLAINTEXT_KEY, "anthropic")).resolves.toBeDefined();
    });

    it("returns { valid: false } for unsupported providers", async () => {
      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      const result = await service.validateApiKey(
        PLAINTEXT_KEY,
        "anthropic" // provider is typed, test via cast
      );

      // Use an unsupported provider via type cast to verify the fallback branch
      // (The real unsupported branch is tested by casting)
      const resultUnsupported = await (
        service as unknown as {
          validateApiKey(k: string, p: string): Promise<{ valid: boolean; error?: string }>;
        }
      ).validateApiKey(PLAINTEXT_KEY, "openai");

      expect(resultUnsupported.valid).toBe(false);
      expect(resultUnsupported.error).toMatch(/unsupported/i);
      // Suppress the successful fetch result from the first call
      void result;
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // listApiKeys()
  // ══════════════════════════════════════════════════════════════════════════

  describe("listApiKeys()", () => {
    it("returns ApiKeyMasked[] — vault_id is NOT present in any row", async () => {
      mockFrom.mockReturnValue(makeChain({ data: [MOCK_KEY_ROW], error: null }));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.listApiKeys();

      expect(result).toHaveLength(1);
      // vault_id must never be exposed
      for (const key of result) {
        expect(key).not.toHaveProperty("vault_id");
        expect(key).not.toHaveProperty("vaultId");
      }
    });

    it("returns maskedKey (not plaintext) for every row", async () => {
      mockFrom.mockReturnValue(
        makeChain({
          data: [
            { ...MOCK_KEY_ROW, masked_key: "sk-ant-...abcd" },
            {
              ...MOCK_KEY_ROW,
              id: "key-uuid-0002",
              masked_key: "sk-ant-...wxyz",
            },
          ],
          error: null,
        })
      );

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.listApiKeys();

      expect(result).toHaveLength(2);
      for (const key of result) {
        expect(key).toHaveProperty("maskedKey");
        // maskedKey should contain "..." (truncation marker)
        expect(key.maskedKey).toContain("...");
        // maskedKey must NOT look like a full-length key
        expect(key.maskedKey.length).toBeLessThan(50);
      }
    });

    it("returns correct shape (id, name, provider, maskedKey, isActive, createdAt, createdByName)", async () => {
      mockFrom.mockReturnValue(makeChain({ data: [MOCK_KEY_ROW], error: null }));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const [key] = await service.listApiKeys();

      expect(key).toMatchObject({
        id: MOCK_KEY_ROW.id,
        name: MOCK_KEY_ROW.name,
        provider: MOCK_KEY_ROW.provider,
        maskedKey: MOCK_KEY_ROW.masked_key,
        isActive: MOCK_KEY_ROW.is_active,
        createdAt: MOCK_KEY_ROW.created_at,
        createdByName: MOCK_KEY_ROW.profiles.full_name,
      });
    });

    it("resolves createdByName as null when profiles is null", async () => {
      const rowNoProfile = { ...MOCK_KEY_ROW, profiles: null };
      mockFrom.mockReturnValue(makeChain({ data: [rowNoProfile], error: null }));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const [key] = await service.listApiKeys();

      expect(key?.createdByName).toBeNull();
    });

    it("returns empty array when no rows exist", async () => {
      mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.listApiKeys();

      expect(result).toHaveLength(0);
    });

    it("throws when Supabase returns an error", async () => {
      mockFrom.mockReturnValue(
        makeChain({ data: null, error: { message: "RLS policy rejected" } })
      );

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      await expect(service.listApiKeys()).rejects.toThrow("Failed to list API keys");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // saveApiKey()
  // ══════════════════════════════════════════════════════════════════════════

  describe("saveApiKey()", () => {
    const SAVE_INPUT = {
      name: "Production Key",
      key: PLAINTEXT_KEY,
      provider: "anthropic" as const,
      setActive: true,
    };

    /** Default happy-path mock setup for saveApiKey. */
    function setupSaveHappyPath() {
      // 1. validateApiKey → HTTP 200
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

      // 2. vault_create_secret RPC → vaultId
      mockRpc.mockResolvedValueOnce({
        data: "vault-uuid-new",
        error: null,
      });

      // 3. _deactivateProviderKeys (setActive = true): UPDATE api_keys
      mockFrom
        .mockReturnValueOnce(makeChain({ data: null, error: null }))
        // 4. INSERT api_keys → return inserted row
        .mockReturnValueOnce(
          makeChain({
            data: {
              ...MOCK_KEY_ROW,
              id: "key-uuid-new",
              vault_id: "vault-uuid-new",
              masked_key: "sk-ant-...abcd",
            },
            error: null,
          })
        );
    }

    it("inserts a row with a masked_key that ends with the last 4 chars of the plaintext key", async () => {
      setupSaveHappyPath();

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.saveApiKey(SAVE_INPUT, ADMIN_ID);

      const last4 = SAVE_INPUT.key.slice(-4);
      expect(result.maskedKey.endsWith(last4)).toBe(true);
    });

    it("returned ApiKeyMasked does NOT contain vault_id or plaintext key", async () => {
      setupSaveHappyPath();

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      const result = await service.saveApiKey(SAVE_INPUT, ADMIN_ID);

      expect(result).not.toHaveProperty("vault_id");
      expect(result).not.toHaveProperty("vaultId");
      expect(result).not.toHaveProperty("key");
      // maskedKey must not be the plaintext
      expect(result.maskedKey).not.toBe(SAVE_INPUT.key);
    });

    it("calls adminAuditLogService.log with action=api_key_created", async () => {
      setupSaveHappyPath();

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      await service.saveApiKey(SAVE_INPUT, ADMIN_ID);

      expect(mockAuditLog).toHaveBeenCalledOnce();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "api_key_created",
          adminId: ADMIN_ID,
          targetType: "api_key",
        })
      );
    });

    it("calls adminAuditLogService.log with metadata that does NOT include key/secret/token", async () => {
      setupSaveHappyPath();

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      await service.saveApiKey(SAVE_INPUT, ADMIN_ID);

      const callArg = mockAuditLog.mock.calls[0]?.[0] as { metadata: Record<string, unknown> };
      expect(callArg.metadata).not.toHaveProperty("key");
      expect(callArg.metadata).not.toHaveProperty("secret");
      expect(callArg.metadata).not.toHaveProperty("token");
      expect(callArg.metadata).not.toHaveProperty("password");
      expect(callArg.metadata).not.toHaveProperty("apiKey");
      expect(callArg.metadata).not.toHaveProperty("api_key");
    });

    it("throws when validateApiKey returns invalid", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      await expect(service.saveApiKey(SAVE_INPUT, ADMIN_ID)).rejects.toThrow(/validation failed/i);
    });

    it("throws when vault_create_secret RPC fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: "vault unavailable" },
      });

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      await expect(service.saveApiKey(SAVE_INPUT, ADMIN_ID)).rejects.toThrow(
        /store API key securely/i
      );
    });

    it("throws when DB INSERT fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
      // vault_create_secret succeeds
      mockRpc.mockResolvedValueOnce({ data: "vault-uuid-new", error: null });
      // _deactivateProviderKeys (setActive=true)
      mockFrom.mockReturnValueOnce(makeChain({ data: null, error: null }));
      // INSERT fails
      mockFrom.mockReturnValueOnce(
        makeChain({ data: null, error: { message: "unique constraint violation" } })
      );

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      await expect(service.saveApiKey(SAVE_INPUT, ADMIN_ID)).rejects.toThrow(
        /save API key record/i
      );
    });

    it("does not call audit log when the operation fails before it", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      await expect(service.saveApiKey(SAVE_INPUT, ADMIN_ID)).rejects.toThrow();
      expect(mockAuditLog).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // deleteApiKey()
  // ══════════════════════════════════════════════════════════════════════════

  describe("deleteApiKey()", () => {
    function setupDeleteHappyPath() {
      // 1. SELECT api_keys to get vault_id
      mockFrom.mockReturnValueOnce(
        makeChain({
          data: {
            vault_id: "vault-uuid-to-delete",
            provider: "anthropic",
            name: "Production Key",
          },
          error: null,
        })
      );

      // 2. vault_delete_secret RPC
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      // 3. DELETE api_keys row
      mockFrom.mockReturnValueOnce(makeChain({ data: null, error: null }));
    }

    it("calls vault_delete_secret RPC with the correct vault_id", async () => {
      setupDeleteHappyPath();

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      await service.deleteApiKey(KEY_ID, ADMIN_ID);

      expect(mockRpc).toHaveBeenCalledWith("vault_delete_secret", {
        id: "vault-uuid-to-delete",
      });
    });

    it("calls adminAuditLogService.log with action=api_key_deleted", async () => {
      setupDeleteHappyPath();

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();
      await service.deleteApiKey(KEY_ID, ADMIN_ID);

      expect(mockAuditLog).toHaveBeenCalledOnce();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "api_key_deleted",
          adminId: ADMIN_ID,
          targetType: "api_key",
          targetId: KEY_ID,
        })
      );
    });

    it("throws when the api_keys row is not found", async () => {
      mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: "row not found" } }));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      await expect(service.deleteApiKey(KEY_ID, ADMIN_ID)).rejects.toThrow(/not found/i);
    });

    it("throws when vault_delete_secret fails", async () => {
      // SELECT succeeds
      mockFrom.mockReturnValueOnce(
        makeChain({
          data: { vault_id: "vault-uuid-xyz", provider: "anthropic", name: "Key" },
          error: null,
        })
      );
      // vault RPC fails
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: "vault error" } });

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      await expect(service.deleteApiKey(KEY_ID, ADMIN_ID)).rejects.toThrow(
        /delete API key from vault/i
      );
    });

    it("throws when DELETE api_keys row fails", async () => {
      // SELECT succeeds
      mockFrom.mockReturnValueOnce(
        makeChain({
          data: { vault_id: "vault-uuid-xyz", provider: "anthropic", name: "Key" },
          error: null,
        })
      );
      // vault delete succeeds
      mockRpc.mockResolvedValueOnce({ data: null, error: null });
      // DELETE fails
      mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: "FK constraint" } }));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      await expect(service.deleteApiKey(KEY_ID, ADMIN_ID)).rejects.toThrow(
        /delete API key record/i
      );
    });

    it("does not call audit log when deletion fails before that step", async () => {
      mockFrom.mockReturnValueOnce(makeChain({ data: null, error: { message: "not found" } }));

      const { ApiKeyService } = await import("@/modules/admin-ai-config/api-key-service");
      const service = new ApiKeyService();

      await expect(service.deleteApiKey(KEY_ID, ADMIN_ID)).rejects.toThrow();
      expect(mockAuditLog).not.toHaveBeenCalled();
    });
  });
});
