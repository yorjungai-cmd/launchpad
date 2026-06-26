/**
 * Unit tests for PromptBuilder + Claude prompt templates
 *
 * Includes:
 *   - Example-based tests for buildAnalysisPrompt()
 *   - PBT Property 5: no empty output for valid input
 *   - PBT Property 1: ClaudeAnalysisOutputSchema.safeParse always succeeds on valid input
 *
 * Ref: tasks.md — Task 2.2
 *      design/correctness.md — Property 1, Property 5
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildAnalysisPrompt } from "@/lib/claude/prompt-builder";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/claude/prompts/analysis-system-prompt";
import { ANALYSIS_TOOL_DEFINITION } from "@/lib/claude/prompts/analysis-tool-definition";
import { ClaudeAnalysisOutputSchema } from "@/modules/ai-analysis/schemas";

// ─── Example-based tests ──────────────────────────────────────────────────────

describe("buildAnalysisPrompt()", () => {
  it("should return non-empty system, messages, tools, and tool_choice", () => {
    const params = buildAnalysisPrompt({
      title: "AI-powered quotation system",
      description: "Automate B2B quotation with AI",
      extractedText: "Detailed content about the system",
      inputType: "text",
    });

    expect(params.system).toBeTruthy();
    expect(params.system.length).toBeGreaterThan(0);
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0]?.content.length).toBeGreaterThan(0);
    expect(params.tools).toHaveLength(1);
    expect(params.tool_choice).not.toBeNull();
  });

  it("should have tool_choice with type='tool' and name='analyze_idea'", () => {
    const params = buildAnalysisPrompt({
      title: "Test idea",
      description: "Description",
      extractedText: "Content",
      inputType: "text",
    });

    expect(params.tool_choice.type).toBe("tool");
    expect(params.tool_choice.name).toBe("analyze_idea");
  });

  it("should include 'analyze_idea' tool in tools array", () => {
    const params = buildAnalysisPrompt({
      title: "Test idea",
      description: "Description",
      extractedText: "Content",
      inputType: "text",
    });

    expect(params.tools[0]?.name).toBe("analyze_idea");
  });

  it("should handle Thai (UTF-8) input without error", () => {
    const thaiTitle = "ระบบ AI วิเคราะห์ใบเสนอราคา";
    const thaiDesc = "ช่วยลดเวลาในการจัดทำ proposal และเพิ่มความแม่นยำในการประเมินราคา";
    const thaiText =
      "เป็น SaaS platform ที่เชื่อมต่อกับระบบ ERP สำหรับธุรกิจ B2B ในประเทศไทย ครอบคลุมทุกอุตสาหกรรม";

    const params = buildAnalysisPrompt({
      title: thaiTitle,
      description: thaiDesc,
      extractedText: thaiText,
      inputType: "text",
    });

    // All Thai characters should appear in user message
    expect(params.messages[0]?.content).toContain(thaiTitle);
    expect(params.messages[0]?.content).toContain(thaiDesc);
    expect(params.messages[0]?.content).toContain(thaiText);
    expect(params.system.length).toBeGreaterThan(0);
  });

  it("should handle long extractedText (10000 chars)", () => {
    const longText = "A".repeat(10_000);

    const params = buildAnalysisPrompt({
      title: "Long content idea",
      description: "Brief description",
      extractedText: longText,
      inputType: "file",
    });

    expect(params.messages[0]?.content).toContain(longText);
    expect(params.system.length).toBeGreaterThan(0);
    expect(params.tools).toHaveLength(1);
  });

  it("should handle file inputType with appropriate label", () => {
    const params = buildAnalysisPrompt({
      title: "File-based idea",
      description: "",
      extractedText: "Extracted from PDF",
      inputType: "file",
    });

    // Label is "File upload (extracted content)" — check for "File upload" in content
    expect(params.messages[0]?.content).toContain("File upload");
    expect(params.tools[0]?.name).toBe("analyze_idea");
  });

  it("should handle url inputType", () => {
    const params = buildAnalysisPrompt({
      title: "URL-based idea",
      description: "Fetched from URL",
      extractedText: "Content from web page",
      inputType: "url",
    });

    // Label is "URL / Link submission" — check for "URL" in content
    expect(params.messages[0]?.content).toContain("URL");
    expect(params.tool_choice.name).toBe("analyze_idea");
  });

  it("should include portfolio context in system prompt", () => {
    // ANALYSIS_SYSTEM_PROMPT should reference all 4 AppliCAD products
    expect(ANALYSIS_SYSTEM_PROMPT).toContain("PTCAD");
    expect(ANALYSIS_SYSTEM_PROMPT).toContain("APP.AI");
    expect(ANALYSIS_SYSTEM_PROMPT).toContain("COBO");
    expect(ANALYSIS_SYSTEM_PROMPT).toContain("CRM");
  });

  it("ANALYSIS_TOOL_DEFINITION should reference analyze_idea", () => {
    expect(ANALYSIS_TOOL_DEFINITION.name).toBe("analyze_idea");
    expect(ANALYSIS_TOOL_DEFINITION.input_schema.required).toContain("stage");
    expect(ANALYSIS_TOOL_DEFINITION.input_schema.required).toContain("feasibility");
    expect(ANALYSIS_TOOL_DEFINITION.input_schema.required).toContain("recommended_action");
  });
});

// ─── PBT Property 5: No empty output for valid input ─────────────────────────

describe("PBT Property 5 — buildAnalysisPrompt() never returns empty for valid input", () => {
  it("should always return non-empty system, messages, tools, tool_choice for any valid input", () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 200 }),
          description: fc.string({ minLength: 1, maxLength: 5000 }),
          inputType: fc.constantFrom("text" as const, "file" as const, "url" as const),
          extractedText: fc.string({ minLength: 1, maxLength: 10_000 }),
        }),
        (ideaContent) => {
          const prompt = buildAnalysisPrompt(ideaContent);
          return (
            prompt.system.length > 0 &&
            prompt.messages.length > 0 &&
            (prompt.messages[0]?.content.length ?? 0) > 0 &&
            prompt.tools.length > 0 &&
            prompt.tool_choice !== null &&
            prompt.tool_choice.type === "tool" &&
            prompt.tool_choice.name === "analyze_idea"
          );
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── PBT Property 1: ClaudeAnalysisOutputSchema parse safety ─────────────────

describe("PBT Property 1 — ClaudeAnalysisOutputSchema.safeParse always succeeds on valid input", () => {
  it("should successfully parse any valid ClaudeAnalysisOutput", () => {
    fc.assert(
      fc.property(
        fc.record({
          summary: fc.string({ minLength: 1, maxLength: 2000 }),
          stage: fc.constantFrom(
            "Sandbox" as const,
            "Validation Sprint" as const,
            "Build Sprint" as const,
            "Launch & Test" as const
          ),
          stage_confidence: fc.float({ min: 0, max: 1, noNaN: true }),
          stage_reasoning: fc.string({ minLength: 1 }),
          idea_type: fc.constantFrom(
            "SaaS" as const,
            "SI" as const,
            "Hardware" as const,
            "Platform" as const,
            "Internal Tool" as const,
            "Partnership" as const
          ),
          idea_type_confidence: fc.float({ min: 0, max: 1, noNaN: true }),
          portfolio_matches: fc.array(
            fc.record({
              product: fc.constantFrom(
                "PTCAD" as const,
                "APP.AI" as const,
                "COBO" as const,
                "CRM" as const
              ),
              relevance: fc.constantFrom("High" as const, "Medium" as const, "Low" as const),
              reasoning: fc.string({ minLength: 1 }),
            }),
            { maxLength: 4 }
          ),
          feasibility: fc.record({
            strategic_fit: fc.record({
              score: fc.integer({ min: 1, max: 5 }),
              reasoning: fc.string(),
            }),
            market_potential: fc.record({
              score: fc.integer({ min: 1, max: 5 }),
              reasoning: fc.string(),
            }),
            technical_feasibility: fc.record({
              score: fc.integer({ min: 1, max: 5 }),
              reasoning: fc.string(),
            }),
            resource_requirement: fc.record({
              score: fc.integer({ min: 1, max: 5 }),
              reasoning: fc.string(),
            }),
            business_impact: fc.record({
              score: fc.integer({ min: 1, max: 5 }),
              reasoning: fc.string(),
            }),
          }),
          recommended_action: fc.constantFrom(
            "Go" as const,
            "Conditional Go" as const,
            "No Go" as const
          ),
          recommended_action_reasoning: fc.string({ minLength: 1 }),
        }),
        (validInput) => {
          const result = ClaudeAnalysisOutputSchema.safeParse(validInput);
          return result.success === true;
        }
      ),
      { numRuns: 200 }
    );
  });
});
