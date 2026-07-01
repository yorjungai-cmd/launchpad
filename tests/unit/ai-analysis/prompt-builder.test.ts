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
import { buildAnalysisSystemPrompt } from "@/lib/claude/prompts/analysis-system-prompt";
import { buildAnalysisToolDefinition } from "@/lib/claude/prompts/analysis-tool-definition";
import { ClaudeAnalysisOutputSchema } from "@/modules/ai-analysis/schemas";
import type { Product } from "@/modules/admin-ai-config/schemas";

const TEST_PRODUCTS: Product[] = [
  {
    id: "PTCAD",
    name: "PTCAD AI",
    category: "CAD",
    description: "CAD software",
    targetUsers: "Engineers",
  },
  {
    id: "APP.AI",
    name: "APP.AI",
    category: "AI Platform",
    description: "AI platform",
    targetUsers: "Business users",
  },
  {
    id: "COBO",
    name: "COBO",
    category: "ERP",
    description: "ERP system",
    targetUsers: "Accountants",
  },
  {
    id: "CRM",
    name: "CRM",
    category: "CRM",
    description: "CRM system",
    targetUsers: "Sales teams",
  },
];

// ─── Example-based tests ──────────────────────────────────────────────────────

describe("buildAnalysisPrompt()", () => {
  it("should return non-empty system, messages, tools, and tool_choice", () => {
    const params = buildAnalysisPrompt(
      {
        title: "AI-powered quotation system",
        description: "Automate B2B quotation",
        extractedText: "Detailed content",
        inputType: "text",
      },
      TEST_PRODUCTS
    );

    expect(params.system).toBeTruthy();
    expect(params.system.length).toBeGreaterThan(0);
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0]?.content.length).toBeGreaterThan(0);
    expect(params.tools).toHaveLength(1);
    expect(params.tool_choice).not.toBeNull();
  });

  it("should have tool_choice with type='tool' and name='analyze_idea'", () => {
    const params = buildAnalysisPrompt(
      { title: "Test", description: "desc", extractedText: "content", inputType: "text" },
      TEST_PRODUCTS
    );
    expect(params.tool_choice.type).toBe("tool");
    expect(params.tool_choice.name).toBe("analyze_idea");
  });

  it("should include 'analyze_idea' tool in tools array", () => {
    const params = buildAnalysisPrompt(
      { title: "Test", description: "desc", extractedText: "content", inputType: "text" },
      TEST_PRODUCTS
    );
    expect(params.tools[0]?.name).toBe("analyze_idea");
  });

  it("should handle Thai (UTF-8) input without error", () => {
    const params = buildAnalysisPrompt(
      {
        title: "ระบบ AI วิเคราะห์ใบเสนอราคา",
        description: "ช่วยลดเวลาในการจัดทำ proposal",
        extractedText: "เป็น SaaS platform สำหรับธุรกิจ B2B",
        inputType: "text",
      },
      TEST_PRODUCTS
    );
    expect(params.messages[0]?.content).toContain("ระบบ AI วิเคราะห์ใบเสนอราคา");
    expect(params.system.length).toBeGreaterThan(0);
  });

  it("should handle file inputType with appropriate label", () => {
    const params = buildAnalysisPrompt(
      {
        title: "File idea",
        description: "",
        extractedText: "Extracted from PDF",
        inputType: "file",
      },
      TEST_PRODUCTS
    );
    expect(params.messages[0]?.content).toContain("File upload");
  });

  it("should handle url inputType", () => {
    const params = buildAnalysisPrompt(
      { title: "URL idea", description: "From URL", extractedText: "Content", inputType: "url" },
      TEST_PRODUCTS
    );
    expect(params.messages[0]?.content).toContain("URL");
  });

  it("should work with empty products array", () => {
    const params = buildAnalysisPrompt(
      { title: "Test", description: "desc", extractedText: "content", inputType: "text" },
      []
    );
    expect(params.system).toContain("No portfolio products are currently configured");
    expect(params.tools[0]?.name).toBe("analyze_idea");
  });
});

describe("buildAnalysisSystemPrompt()", () => {
  it("should include product names and ids in system prompt", () => {
    const prompt = buildAnalysisSystemPrompt(TEST_PRODUCTS);
    expect(prompt).toContain("PTCAD");
    expect(prompt).toContain("PTCAD AI");
    expect(prompt).toContain("APP.AI");
    expect(prompt).toContain("COBO");
    expect(prompt).toContain("CRM");
  });

  it("should show no-products message when products array is empty", () => {
    const prompt = buildAnalysisSystemPrompt([]);
    expect(prompt).toContain("No portfolio products are currently configured");
  });
});

describe("buildAnalysisToolDefinition()", () => {
  it("should return analyze_idea tool with product enum from productIds", () => {
    const tool = buildAnalysisToolDefinition(["PTCAD", "APP.AI"]);
    expect(tool.name).toBe("analyze_idea");
    const productEnum = (tool.input_schema.properties as Record<string, unknown>)[
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "portfolio_matches"
    ] as any;
    expect(productEnum.items.properties.product.enum).toEqual(["PTCAD", "APP.AI"]);
  });

  it("should require all standard analysis fields", () => {
    const tool = buildAnalysisToolDefinition(["PTCAD"]);
    expect(tool.input_schema.required).toContain("stage");
    expect(tool.input_schema.required).toContain("feasibility");
    expect(tool.input_schema.required).toContain("recommended_action");
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
          const prompt = buildAnalysisPrompt(ideaContent, TEST_PRODUCTS);
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
              product: fc.string({ minLength: 1 }),
              relevance: fc.constantFrom("High" as const, "Medium" as const, "Low" as const),
              reasoning: fc.string({ minLength: 1 }),
            }),
            { maxLength: 10 }
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
