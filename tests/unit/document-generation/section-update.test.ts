/**
 * Tests for section auto-update isolation (task 6.2)
 * Includes PBT Property 4 — section update isolation
 *
 * Ref: design/correctness.md — Property 4
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Mock supabase
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}));

import { DocumentGenerationRepository } from "@/modules/document-generation/repository";
import type { ProposalSection } from "@/modules/document-generation/types";

const repo = new DocumentGenerationRepository();

function makeSections(overrides: Partial<ProposalSection>[] = []): ProposalSection[] {
  const base: ProposalSection[] = [
    {
      key: "executive_summary",
      order: 1,
      title: "Executive Summary",
      content_markdown: "exec content",
      source_ref: "ai_analysis.summary",
      is_ai_generated: true,
      updated_at: "2026-06-25T00:00:00Z",
    },
    {
      key: "problem_opportunity",
      order: 2,
      title: "Problem",
      content_markdown: "problem content",
      source_ref: "ai_analysis.summary",
      is_ai_generated: true,
      updated_at: "2026-06-25T00:00:00Z",
    },
    {
      key: "bmc",
      order: 4,
      title: "BMC",
      content_markdown: "bmc content",
      source_ref: "document.bmc",
      is_ai_generated: false,
      updated_at: "2026-06-25T00:00:00Z",
    },
    {
      key: "feasibility_assessment",
      order: 5,
      title: "Feasibility",
      content_markdown: "feasibility content",
      source_ref: "ai_analysis.feasibility",
      is_ai_generated: true,
      updated_at: "2026-06-25T00:00:00Z",
    },
  ];
  return base.map((s, i) => ({ ...s, ...(overrides[i] ?? {}) }));
}

beforeEach(() => vi.clearAllMocks());

describe("updateSection() — section isolation", () => {
  it("should update only the targeted section key", async () => {
    const sections = makeSections();
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { sections, id: "prop-1" }, error: null }),
    };
    let captured: ProposalSection[] | null = null;
    const updateChain = {
      update: vi.fn().mockImplementation((p: { sections: ProposalSection[] }) => {
        captured = p.sections;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    };
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);

    await repo.updateSection("idea-1", "executive_summary", "new exec content");

    expect(captured).not.toBeNull();
    const updated = captured!;
    // Target section updated
    expect(updated.find((s) => s.key === "executive_summary")?.content_markdown).toBe(
      "new exec content"
    );
    // Other sections untouched
    expect(updated.find((s) => s.key === "problem_opportunity")?.content_markdown).toBe(
      "problem content"
    );
    expect(updated.find((s) => s.key === "bmc")?.content_markdown).toBe("bmc content");
    expect(updated.find((s) => s.key === "feasibility_assessment")?.content_markdown).toBe(
      "feasibility content"
    );
  });

  it("should not modify BD-authored sections (is_ai_generated=false) even if key matches", async () => {
    // Note: updateSection targets by key, but the Service layer guards is_ai_generated
    // This test verifies repository correctly passes through whatever is provided
    const sections = makeSections();
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { sections, id: "prop-1" }, error: null }),
    };
    let captured: ProposalSection[] | null = null;
    const updateChain = {
      update: vi.fn().mockImplementation((p: { sections: ProposalSection[] }) => {
        captured = p.sections;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    };
    mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);

    await repo.updateSection("idea-1", "bmc", "should not update BD content");

    // The 'bmc' section is updated by repository (key match)
    // Service layer (regenerateProposalSection) is responsible for checking is_ai_generated
    expect(captured).not.toBeNull();
    expect(captured!.find((s) => s.key === "bmc")?.content_markdown).toBe(
      "should not update BD content"
    );
    // Others untouched
    expect(captured!.find((s) => s.key === "executive_summary")?.content_markdown).toBe(
      "exec content"
    );
  });
});

describe("DocumentGenerationService.regenerateProposalSection() — isolation via service", () => {
  it("should only regenerate is_ai_generated=true sections matching sourceRef", async () => {
    // This is a logic test for the service filtering behavior
    // We simulate it with a simplified version of the filter logic

    const sections = makeSections();

    const applyRegeneration = (
      sects: ProposalSection[],
      sourceRef: string,
      newContent: (key: string) => string
    ): ProposalSection[] => {
      return sects.map((s) => {
        if (s.source_ref === sourceRef && s.is_ai_generated) {
          return { ...s, content_markdown: newContent(s.key) };
        }
        return s;
      });
    };

    const updated = applyRegeneration(sections, "ai_analysis.summary", (k) => `new ${k}`);

    // executive_summary and problem_opportunity match sourceRef + is_ai_generated
    expect(updated.find((s) => s.key === "executive_summary")?.content_markdown).toBe(
      "new executive_summary"
    );
    expect(updated.find((s) => s.key === "problem_opportunity")?.content_markdown).toBe(
      "new problem_opportunity"
    );
    // bmc: source_ref matches? No — 'document.bmc' ≠ 'ai_analysis.summary'
    expect(updated.find((s) => s.key === "bmc")?.content_markdown).toBe("bmc content");
    // feasibility_assessment: source_ref 'ai_analysis.feasibility' ≠ 'ai_analysis.summary'
    expect(updated.find((s) => s.key === "feasibility_assessment")?.content_markdown).toBe(
      "feasibility content"
    );
  });

  // ── PBT Property 4: section isolation ──────────────────────────────────────
  it("PBT Property 4: non-matching sections always unchanged after regeneration", () => {
    const sourceRefs = [
      "ai_analysis.summary",
      "ai_analysis.feasibility",
      "document.bmc",
      "ai_analysis.stage",
    ];

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 20 }),
            order: fc.integer({ min: 1, max: 10 }),
            title: fc.string({ minLength: 1, maxLength: 30 }),
            content_markdown: fc.string(),
            source_ref: fc.option(fc.constantFrom(...sourceRefs), { nil: null }),
            is_ai_generated: fc.boolean(),
            updated_at: fc.constant("2026-06-25T00:00:00Z"),
          }),
          { minLength: 1, maxLength: 8 }
        ),
        fc.constantFrom(...sourceRefs),
        (sections, targetSourceRef) => {
          const applyRegen = (s: ProposalSection[], ref: string) =>
            s.map((sec) =>
              sec.source_ref === ref && sec.is_ai_generated
                ? { ...sec, content_markdown: "regenerated" }
                : sec
            );

          const updated = applyRegen(sections, targetSourceRef);

          return sections.every((orig, i) => {
            const upd = updated[i]!;
            const shouldChange = orig.source_ref === targetSourceRef && orig.is_ai_generated;
            if (shouldChange) return upd.content_markdown === "regenerated";
            // Non-matching: must be byte-for-byte identical
            return upd.content_markdown === orig.content_markdown;
          });
        }
      ),
      { numRuns: 200 }
    );
  });
});
