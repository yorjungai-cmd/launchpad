import { describe, it, expect } from "vitest";
import { buildNarrativeContext } from "@/lib/claude/prompts/document-narrative";

const BASE_PARAMS = {
  ideaTitle: "Test Idea",
  summary: "A test idea summary",
  stage: "Sandbox" as const,
  ideaType: "Internal Tool",
  recommendedAction: "Proceed to POC",
  portfolioMatches: [],
  feasibilityScores: {
    strategicFit: 4,
    marketPotential: 3,
    technicalFeasibility: 4,
    resourceRequirement: 3,
    businessImpact: 4,
  },
  documentType: "feasibility_report",
  sectionKeys: ["executive_summary"],
};

describe("buildNarrativeContext", () => {
  it("returns a string containing the idea title", () => {
    const result = buildNarrativeContext(BASE_PARAMS);
    expect(result).toContain("Test Idea");
  });

  it("lists the section keys", () => {
    const result = buildNarrativeContext(BASE_PARAMS);
    expect(result).toContain("executive_summary");
  });

  it("appends sectionInstructions when provided", () => {
    const result = buildNarrativeContext({
      ...BASE_PARAMS,
      sectionInstructions: { executive_summary: "เขียน 3 ย่อหน้า" },
    });
    expect(result).toContain("Section-specific instructions");
    expect(result).toContain("เขียน 3 ย่อหน้า");
  });

  it("does NOT append instructions block when sectionInstructions is undefined", () => {
    const result = buildNarrativeContext(BASE_PARAMS);
    expect(result).not.toContain("Section-specific instructions");
  });

  it("skips section keys with no instruction in the map", () => {
    const result = buildNarrativeContext({
      ...BASE_PARAMS,
      sectionKeys: ["executive_summary", "feasibility_scores"],
      sectionInstructions: { executive_summary: "เขียน 2 ย่อหน้า" },
    });
    expect(result).toContain("executive_summary: เขียน 2 ย่อหน้า");
    expect(result).not.toContain("feasibility_scores:");
  });
});
