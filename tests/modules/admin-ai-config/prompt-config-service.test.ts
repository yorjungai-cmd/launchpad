import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase admin client
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(),
}));
vi.mock("@/modules/admin-ai-config/audit-log-service", () => ({
  adminAuditLogService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { PromptConfigService } from "@/modules/admin-ai-config/prompt-config-service";
import { DEFAULT_PROMPT_CONFIG } from "@/lib/document-generation/prompt-config-defaults";
import { adminAuditLogService } from "@/modules/admin-ai-config/audit-log-service";

// ─── Mock DB builder ──────────────────────────────────────────────────────────

/**
 * Builds a mock Supabase client with enough chain coverage for the service.
 *
 * Chain shapes used:
 *   SELECT: from().select().limit().maybeSingle()
 *   INSERT: from().insert().select().single()
 *   UPDATE: from().update().eq()                 (no select chain needed for _upsertDefaults)
 *   UPDATE+select: from().update().eq().select().single()  (used by _saveConfig)
 */
function makeMockDb(existingRow: Record<string, unknown> | null) {
  const single = vi.fn().mockResolvedValue({ data: existingRow, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });

  // update chain: .update(…).eq(…) — returns {error: null} for _upsertDefaults
  const eqForUpdate = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: eqForUpdate });

  // insert chain: .insert(…).select(…).single()
  const selectAfterInsert = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select: selectAfterInsert });

  // select chain: .select(…).limit(…).maybeSingle()
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ limit });

  const from = vi.fn().mockReturnValue({ select, update, insert });

  return {
    from,
    // expose leaves for per-test overrides
    _single: single,
    _maybeSingle: maybeSingle,
    _eqForUpdate: eqForUpdate,
    _update: update,
    _insert: insert,
    _select: select,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("PromptConfigService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getPromptConfig ──────────────────────────────────────────────────────────

  it("getPromptConfig returns defaults when no row exists", async () => {
    const db = makeMockDb(null);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const service = new PromptConfigService();
    // resolves without throwing; falls back to _upsertDefaults which inserts
    await expect(service.getPromptConfig()).resolves.toBeDefined();
  });

  it("getPromptConfig returns existing row when present", async () => {
    const existing = {
      id: "row-1",
      prompt_config: { systemPrompt: "custom", sections: {} },
    };
    const db = makeMockDb(existing);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const service = new PromptConfigService();
    await expect(service.getPromptConfig()).resolves.toMatchObject({ systemPrompt: "custom" });
  });

  it("getPromptConfig returns default config shape when row has no prompt_config", async () => {
    const existing = { id: "row-2", prompt_config: null };
    const db = makeMockDb(existing);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const service = new PromptConfigService();
    const result = await service.getPromptConfig();
    expect(result.systemPrompt).toBe(DEFAULT_PROMPT_CONFIG.systemPrompt);
  });

  // ── DEFAULT_PROMPT_CONFIG ────────────────────────────────────────────────────

  it("DEFAULT_PROMPT_CONFIG has systemPrompt containing AppliCAD and Thai", () => {
    expect(DEFAULT_PROMPT_CONFIG.systemPrompt).toContain("AppliCAD");
    expect(DEFAULT_PROMPT_CONFIG.systemPrompt).toContain("Thai");
  });

  // ── updateSystemPrompt ───────────────────────────────────────────────────────

  it("updateSystemPrompt merges new prompt and calls log with prompt_config_updated", async () => {
    const existing = {
      id: "row-1",
      prompt_config: { systemPrompt: "old prompt", sections: { foo: { bar: "baz" } } },
    };
    const db = makeMockDb(existing);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const service = new PromptConfigService();

    const result = await service.updateSystemPrompt("new prompt", "admin-uuid");

    expect(result.systemPrompt).toBe("new prompt");
    // sections should be preserved
    expect(result.sections).toEqual({ foo: { bar: "baz" } });
    expect(adminAuditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "prompt_config_updated",
        targetType: "prompt_config",
        adminId: "admin-uuid",
      })
    );
  });

  // ── updateDocumentTypeSections ───────────────────────────────────────────────

  it("updateDocumentTypeSections merges sections without clobbering other doc types", async () => {
    const existing = {
      id: "row-1",
      prompt_config: {
        systemPrompt: "sys",
        sections: {
          feasibility_report: { executive_summary: "old" },
          poc_proposal: { poc_objective: "keep me" },
        },
      },
    };
    const db = makeMockDb(existing);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const service = new PromptConfigService();

    const result = await service.updateDocumentTypeSections(
      "feasibility_report",
      { executive_summary: "new summary" },
      "admin-uuid"
    );

    // Updated section should have new value
    expect(result.sections["feasibility_report"]).toEqual({ executive_summary: "new summary" });
    // Other doc type must be preserved
    expect(result.sections["poc_proposal"]).toEqual({ poc_objective: "keep me" });
    expect(adminAuditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "prompt_config_updated",
        targetType: "prompt_config",
        adminId: "admin-uuid",
      })
    );
  });

  // ── resetDocumentType ────────────────────────────────────────────────────────

  it("resetDocumentType restores defaults for the target doc type", async () => {
    const existing = {
      id: "row-1",
      prompt_config: {
        systemPrompt: "sys",
        sections: {
          feasibility_report: { executive_summary: "custom overridden" },
        },
      },
    };
    const db = makeMockDb(existing);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const service = new PromptConfigService();

    const result = await service.resetDocumentType("feasibility_report", "admin-uuid");

    expect(result.sections["feasibility_report"]).toEqual(
      DEFAULT_PROMPT_CONFIG.sections["feasibility_report"]
    );
  });

  it("resetDocumentType emits ONLY prompt_config_reset (not a double audit log)", async () => {
    const existing = {
      id: "row-1",
      prompt_config: { systemPrompt: "sys", sections: {} },
    };
    const db = makeMockDb(existing);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const service = new PromptConfigService();

    await service.resetDocumentType("feasibility_report", "admin-uuid");

    // Must call log exactly once, and it must be for prompt_config_reset
    expect(adminAuditLogService.log).toHaveBeenCalledTimes(1);
    expect(adminAuditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "prompt_config_reset",
        targetType: "prompt_config",
        adminId: "admin-uuid",
        metadata: expect.objectContaining({ document_type: "feasibility_report" }),
      })
    );
  });
});
