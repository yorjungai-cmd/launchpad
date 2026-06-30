/**
 * Unit tests for runInlineDocumentGenerationForType
 *
 * Verifies:
 *   - The function is exported and callable
 *   - It routes project_proposal to composeProjectProposal
 *   - It routes other types to generateDocumentSet
 *   - It returns "skipped" when a completed doc already exists (dedup guard)
 *   - It loads promptConfig fresh on every call (no cache)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks must be declared before imports ────────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("@/modules/document-generation/repository", () => ({
  documentGenerationRepository: {
    findByIdea: vi.fn(),
  },
}));

vi.mock("@/modules/document-generation/service", () => ({
  documentGenerationService: {
    generateDocumentSet: vi.fn().mockResolvedValue(undefined),
    composeProjectProposal: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/claude/inline-worker", () => ({
  resolveActiveKeyInfo: vi.fn().mockResolvedValue(null),
  callProviderTool: vi.fn(),
  narrativeModelFor: vi.fn().mockReturnValue("claude-haiku-4-5"),
}));

vi.mock("@/modules/admin-ai-config/prompt-config-service", () => ({
  promptConfigService: {
    getPromptConfig: vi.fn(),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────────

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { documentGenerationRepository } from "@/modules/document-generation/repository";
import { documentGenerationService } from "@/modules/document-generation/service";
import { promptConfigService } from "@/modules/admin-ai-config/prompt-config-service";
import { runInlineDocumentGenerationForType } from "@/lib/document-generation/inline-generate";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMPLETED_ANALYSIS_ROW = {
  id: "analysis-1",
  idea_id: "idea-1",
  processing_status: "completed",
  summary: "Test summary",
  stage: "Sandbox",
  idea_type: "Internal Tool",
  recommended_action: "Proceed to POC",
  recommended_action_reasoning: null,
  portfolio_matches: [],
  strategic_fit_score: 4,
  market_potential_score: 3,
  technical_feasibility_score: 4,
  resource_requirement_score: 3,
  business_impact_score: 4,
  strategic_fit_reasoning: null,
  market_potential_reasoning: null,
  technical_feasibility_reasoning: null,
  resource_requirement_reasoning: null,
  business_impact_reasoning: null,
};

const IDEA_ROW = {
  id: "idea-1",
  title: "Test Idea",
  reference_number: "TEST-001",
  submitter_name: "Test User",
};

/**
 * Returns a Supabase mock that resolves analysis + idea rows.
 */
function makeMockDb(analysisRow: Record<string, unknown> | null = COMPLETED_ANALYSIS_ROW) {
  const maybeSingleAnalysis = vi.fn().mockResolvedValue({ data: analysisRow, error: null });
  const eqAnalysis = vi.fn().mockReturnValue({ maybeSingle: maybySingle(IDEA_ROW) });

  // For the analysis table call
  const selectAnalysis = vi
    .fn()
    .mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: maybySingle(analysisRow) }) });
  // For the idea table call
  const selectIdea = vi
    .fn()
    .mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: maybySingle(IDEA_ROW) }) });

  // from() returns different chains per table name
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "ai_analyses") return { select: selectAnalysis };
    if (table === "ideas") return { select: selectIdea };
    return {
      select: vi
        .fn()
        .mockReturnValue({
          eq: vi
            .fn()
            .mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
        }),
    };
  });

  void maybySingle;
  void eqAnalysis;
  void maybeSingleAnalysis; // silence unused-var

  return { from };
}

function maybySingle(data: unknown) {
  return vi.fn().mockResolvedValue({ data, error: null });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("runInlineDocumentGenerationForType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: promptConfig loads successfully
    (promptConfigService.getPromptConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      systemPrompt: "custom system prompt",
      sections: {},
    });
  });

  it("is exported as a function", () => {
    expect(typeof runInlineDocumentGenerationForType).toBe("function");
  });

  it("returns 'skipped' when a completed document for the type already exists (dedup guard)", async () => {
    (documentGenerationRepository.findByIdea as ReturnType<typeof vi.fn>).mockResolvedValue([
      { documentType: "feasibility_report", generationStatus: "completed" },
    ]);

    const result = await runInlineDocumentGenerationForType("idea-1", "feasibility_report");
    expect(result).toBe("skipped");
    expect(documentGenerationService.generateDocumentSet).not.toHaveBeenCalled();
  });

  it("calls generateDocumentSet (not composeProjectProposal) for non-proposal types", async () => {
    (documentGenerationRepository.findByIdea as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(makeMockDb());

    await runInlineDocumentGenerationForType("idea-1", "feasibility_report");

    expect(documentGenerationService.generateDocumentSet).toHaveBeenCalledOnce();
    expect(documentGenerationService.composeProjectProposal).not.toHaveBeenCalled();
  });

  it("calls composeProjectProposal (not generateDocumentSet) for project_proposal type", async () => {
    (documentGenerationRepository.findByIdea as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(makeMockDb());

    await runInlineDocumentGenerationForType("idea-1", "project_proposal");

    expect(documentGenerationService.composeProjectProposal).toHaveBeenCalledOnce();
    expect(documentGenerationService.generateDocumentSet).not.toHaveBeenCalled();
  });

  it("calls promptConfigService.getPromptConfig on every invocation (no cache)", async () => {
    (documentGenerationRepository.findByIdea as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(makeMockDb());

    await runInlineDocumentGenerationForType("idea-1", "bmc");
    await runInlineDocumentGenerationForType("idea-1", "bmc");

    // Called twice — once per invocation, no in-memory caching
    expect(promptConfigService.getPromptConfig).toHaveBeenCalledTimes(2);
  });

  it("falls back gracefully when promptConfigService.getPromptConfig throws", async () => {
    (documentGenerationRepository.findByIdea as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(makeMockDb());
    (promptConfigService.getPromptConfig as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB error")
    );

    // Should NOT throw — graceful fallback to hardcoded system prompt
    await expect(runInlineDocumentGenerationForType("idea-1", "feasibility_report")).resolves.toBe(
      "generated"
    );
  });

  it("throws when analysis is not found", async () => {
    (documentGenerationRepository.findByIdea as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(makeMockDb(null));

    await expect(
      runInlineDocumentGenerationForType("idea-1", "feasibility_report")
    ).rejects.toThrow("analysis not found");
  });

  it("throws when analysis processing_status is not completed", async () => {
    (documentGenerationRepository.findByIdea as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const incompleteAnalysis = { ...COMPLETED_ANALYSIS_ROW, processing_status: "processing" };
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeMockDb(incompleteAnalysis)
    );

    await expect(
      runInlineDocumentGenerationForType("idea-1", "feasibility_report")
    ).rejects.toThrow("analysis not completed");
  });
});
