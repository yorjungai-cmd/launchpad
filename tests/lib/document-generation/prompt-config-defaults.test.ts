import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROMPT_CONFIG,
  SAMPLE_TEST_IDEA,
} from "@/lib/document-generation/prompt-config-defaults";

describe("DEFAULT_PROMPT_CONFIG", () => {
  it("has a non-empty systemPrompt", () => {
    expect(DEFAULT_PROMPT_CONFIG.systemPrompt.length).toBeGreaterThan(50);
  });

  it("has sections for all 11 document types", () => {
    const expected = [
      "feasibility_report",
      "poc_proposal",
      "bmc",
      "launch_pad_plan",
      "project_requirements",
      "resource_plan",
      "action_plan",
      "gtm_summary",
      "executive_presentation",
      "stage_gate_guide",
      "project_proposal",
    ];
    expected.forEach((t) => expect(DEFAULT_PROMPT_CONFIG.sections).toHaveProperty(t));
  });

  it("every section key has a non-empty instruction string", () => {
    for (const [, sections] of Object.entries(DEFAULT_PROMPT_CONFIG.sections)) {
      for (const [, instruction] of Object.entries(sections)) {
        expect(typeof instruction).toBe("string");
        expect(instruction.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("SAMPLE_TEST_IDEA", () => {
  it("has all required fields", () => {
    expect(SAMPLE_TEST_IDEA.title).toBeTruthy();
    expect(SAMPLE_TEST_IDEA.summary).toBeTruthy();
    expect(SAMPLE_TEST_IDEA.feasibilityScores.strategicFit).toBeGreaterThan(0);
  });
});
