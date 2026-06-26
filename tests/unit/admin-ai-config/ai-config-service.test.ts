/**
 * Unit tests — AiConfigService
 *
 * Covers:
 *   - getAiConfig(): returns default when no DB row exists
 *   - getAiConfig(): returns stored config when row exists
 *   - getAiConfig(): propagates DB error as AppError.internal
 *   - updateAiConfig(): valid model saves + audit log called
 *   - updateAiConfig(): verifies shape of returned AiConfigData
 *   - updateAiConfig(): propagates DB error as AppError.internal
 *
 * Mocks:
 *   - @/lib/supabase/server — createAdminSupabaseClient
 *   - @/lib/logger — prevent log noise
 *   - @/modules/admin-ai-config/audit-log-service — verify audit calls
 *
 * Ref:
 *   - design/components.md  — AiConfigService (Component 3)
 *   - design/data-model.md  — system_settings table
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

// ─── Mock Supabase admin client ───────────────────────────────────────────────

// We build a fluent mock where each method returns `this` so chains like
// .from().select().limit().maybeSingle() resolve to a controlled value.
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn();
const mockLimit = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

// Build the fluent chain — each returns an object with the next methods
const queryChain = {
  select: mockSelect,
  limit: mockLimit,
  maybeSingle: mockMaybeSingle,
  single: mockSingle,
  insert: mockInsert,
  update: mockUpdate,
  eq: mockEq,
};

// Wire each method to return the chain so you can keep chaining
mockSelect.mockReturnValue(queryChain);
mockLimit.mockReturnValue(queryChain);
mockInsert.mockReturnValue(queryChain);
mockUpdate.mockReturnValue(queryChain);
mockEq.mockReturnValue(queryChain);

const mockFrom = vi.fn().mockReturnValue(queryChain);

const mockAdminClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(() => mockAdminClient),
  createServerSupabaseClient: vi.fn(() => mockAdminClient),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_ID = "admin-uuid-1234-5678-90ab-cdef01234567";
const ROW_ID = "row-uuid-aaaa-bbbb-cccc-ddddeeee0001";

const STORED_CONFIG_JSONB = {
  analysisModel: "claude-opus-4-5",
  documentGenerationModel: "claude-opus-4-5",
  defaultModel: "claude-opus-4-5",
  fallbackModel: "claude-haiku-4-5",
};

const STORED_ROW = {
  id: ROW_ID,
  ai_config: STORED_CONFIG_JSONB,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-10T00:00:00.000Z",
};

const DEFAULT_CONFIG_JSONB = {
  analysisModel: "claude-sonnet-4-5",
  documentGenerationModel: "claude-opus-4-5",
  defaultModel: "claude-sonnet-4-5",
  fallbackModel: "claude-haiku-4-5",
};

const DEFAULT_ROW = {
  id: "row-uuid-new-insert-0000",
  ai_config: DEFAULT_CONFIG_JSONB,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const VALID_UPDATE_INPUT = {
  analysisModel: "claude-sonnet-4-5" as const,
  documentGenerationModel: "claude-haiku-4-5" as const,
  defaultModel: "claude-sonnet-4-5" as const,
  fallbackModel: "claude-haiku-4-5" as const,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AiConfigService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Rewire chains after clearAllMocks
    mockSelect.mockReturnValue(queryChain);
    mockLimit.mockReturnValue(queryChain);
    mockInsert.mockReturnValue(queryChain);
    mockUpdate.mockReturnValue(queryChain);
    mockEq.mockReturnValue(queryChain);
    mockFrom.mockReturnValue(queryChain);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getAiConfig()
  // ══════════════════════════════════════════════════════════════════════════

  describe("getAiConfig()", () => {
    it("returns default config when no row exists in system_settings", async () => {
      // First call: SELECT returns null (no row)
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      // Second call: INSERT returns the default row
      mockSingle.mockResolvedValueOnce({ data: DEFAULT_ROW, error: null });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const service = new AiConfigService();
      const result = await service.getAiConfig();

      expect(result.analysisModel).toBe("claude-sonnet-4-5");
      expect(result.defaultModel).toBe("claude-sonnet-4-5");
      expect(result.fallbackModel).toBe("claude-haiku-4-5");
      expect(result.documentGenerationModel).toBe("claude-opus-4-5");
      expect(Array.isArray(result.supportedModels)).toBe(true);
      expect(result.supportedModels.length).toBeGreaterThan(0);
    });

    it("returns stored config when row exists in system_settings", async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: STORED_ROW, error: null });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const service = new AiConfigService();
      const result = await service.getAiConfig();

      expect(result.analysisModel).toBe("claude-opus-4-5");
      expect(result.documentGenerationModel).toBe("claude-opus-4-5");
      expect(result.defaultModel).toBe("claude-opus-4-5");
      expect(result.fallbackModel).toBe("claude-haiku-4-5");
    });

    it("always appends supportedModels from SUPPORTED_MODELS constant", async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: STORED_ROW, error: null });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const { SUPPORTED_MODELS } = await import("@/modules/admin-ai-config/schemas");
      const service = new AiConfigService();
      const result = await service.getAiConfig();

      expect(result.supportedModels).toEqual([...SUPPORTED_MODELS]);
    });

    it("throws AppError.internal when DB SELECT fails", async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: { message: "connection refused" },
      });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const service = new AiConfigService();

      await expect(service.getAiConfig()).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });

    it("throws AppError.internal when INSERT default config fails (no row)", async () => {
      // SELECT returns null — triggers insert path
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      // INSERT fails
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: "unique constraint violation" },
      });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const service = new AiConfigService();

      await expect(service.getAiConfig()).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // updateAiConfig()
  // ══════════════════════════════════════════════════════════════════════════

  describe("updateAiConfig()", () => {
    it("saves valid config and calls audit log with action=ai_config_updated", async () => {
      // 1. SELECT existing row
      mockMaybeSingle.mockResolvedValueOnce({ data: STORED_ROW, error: null });
      // 2. UPDATE returns updated row
      const updatedRow = {
        ...STORED_ROW,
        ai_config: {
          analysisModel: VALID_UPDATE_INPUT.analysisModel,
          documentGenerationModel: VALID_UPDATE_INPUT.documentGenerationModel,
          defaultModel: VALID_UPDATE_INPUT.defaultModel,
          fallbackModel: VALID_UPDATE_INPUT.fallbackModel,
        },
        updated_at: new Date().toISOString(),
      };
      mockSingle.mockResolvedValueOnce({ data: updatedRow, error: null });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const service = new AiConfigService();
      await service.updateAiConfig(VALID_UPDATE_INPUT, ADMIN_ID);

      expect(mockAuditLog).toHaveBeenCalledOnce();
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ai_config_updated",
          adminId: ADMIN_ID,
          targetType: "ai_config",
          targetId: ROW_ID,
        })
      );
    });

    it("returns correct AiConfigData shape after successful update", async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: STORED_ROW, error: null });
      const updatedJsonb = {
        analysisModel: VALID_UPDATE_INPUT.analysisModel,
        documentGenerationModel: VALID_UPDATE_INPUT.documentGenerationModel,
        defaultModel: VALID_UPDATE_INPUT.defaultModel,
        fallbackModel: VALID_UPDATE_INPUT.fallbackModel,
      };
      mockSingle.mockResolvedValueOnce({
        data: { ...STORED_ROW, ai_config: updatedJsonb },
        error: null,
      });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const { SUPPORTED_MODELS } = await import("@/modules/admin-ai-config/schemas");
      const service = new AiConfigService();
      const result = await service.updateAiConfig(VALID_UPDATE_INPUT, ADMIN_ID);

      expect(result).toMatchObject({
        analysisModel: VALID_UPDATE_INPUT.analysisModel,
        documentGenerationModel: VALID_UPDATE_INPUT.documentGenerationModel,
        defaultModel: VALID_UPDATE_INPUT.defaultModel,
        fallbackModel: VALID_UPDATE_INPUT.fallbackModel,
        supportedModels: [...SUPPORTED_MODELS],
      });
    });

    it("audit log metadata includes changed_fields", async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: STORED_ROW, error: null });
      mockSingle.mockResolvedValueOnce({
        data: { ...STORED_ROW, ai_config: VALID_UPDATE_INPUT },
        error: null,
      });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const service = new AiConfigService();
      await service.updateAiConfig(VALID_UPDATE_INPUT, ADMIN_ID);

      const logCall = mockAuditLog.mock.calls[0][0];
      expect(logCall.metadata).toHaveProperty("changed_fields");
      expect(typeof logCall.metadata.changed_fields).toBe("string");
      // Should include model field names
      expect(logCall.metadata.changed_fields).toContain("analysisModel");
    });

    it("inserts new row then updates when no row exists (upsert path)", async () => {
      // SELECT returns null — no existing row
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      // INSERT new row with incoming config
      const newRowId = "row-uuid-brand-new-0001";
      mockSingle
        .mockResolvedValueOnce({
          data: { id: newRowId, ai_config: VALID_UPDATE_INPUT, created_at: "", updated_at: "" },
          error: null,
        })
        // UPDATE after insert
        .mockResolvedValueOnce({
          data: { id: newRowId, ai_config: VALID_UPDATE_INPUT, created_at: "", updated_at: "" },
          error: null,
        });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const service = new AiConfigService();
      const result = await service.updateAiConfig(VALID_UPDATE_INPUT, ADMIN_ID);

      expect(result.analysisModel).toBe(VALID_UPDATE_INPUT.analysisModel);
      // Audit log should use the new row's id
      expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ targetId: newRowId }));
    });

    it("throws AppError.internal when SELECT for update fails", async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: { message: "network timeout" },
      });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const service = new AiConfigService();

      await expect(service.updateAiConfig(VALID_UPDATE_INPUT, ADMIN_ID)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });

      // Audit log must NOT be called when DB fails
      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it("throws AppError.internal when UPDATE itself fails", async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: STORED_ROW, error: null });
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: "update error" } });

      const { AiConfigService } = await import("@/modules/admin-ai-config/ai-config-service");
      const service = new AiConfigService();

      await expect(service.updateAiConfig(VALID_UPDATE_INPUT, ADMIN_ID)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });
  });
});
