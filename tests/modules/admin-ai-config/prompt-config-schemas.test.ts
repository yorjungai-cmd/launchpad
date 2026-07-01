import { describe, it, expect } from "vitest";
import {
  PromptConfigSchema,
  UpdateSystemPromptSchema,
  UpdateDocumentTypeSectionsSchema,
  TestSectionPromptSchema,
} from "@/modules/admin-ai-config/schemas";

describe("PromptConfigSchema", () => {
  it("accepts valid config", () => {
    const result = PromptConfigSchema.parse({
      systemPrompt: "You are a helpful assistant.",
      sections: { feasibility_report: { executive_summary: "Write 2 paragraphs." } },
    });
    expect(result.systemPrompt).toBe("You are a helpful assistant.");
  });

  it("rejects systemPrompt over 8000 chars", () => {
    expect(() =>
      PromptConfigSchema.parse({ systemPrompt: "x".repeat(8001), sections: {} })
    ).toThrow();
  });

  it("rejects section instruction over 2000 chars", () => {
    expect(() =>
      PromptConfigSchema.parse({
        systemPrompt: "ok",
        sections: { foo: { bar: "x".repeat(2001) } },
      })
    ).toThrow();
  });
});

describe("UpdateSystemPromptSchema", () => {
  it("accepts a valid system prompt", () => {
    const result = UpdateSystemPromptSchema.parse({ systemPrompt: "Hello" });
    expect(result.systemPrompt).toBe("Hello");
  });

  it("rejects empty string", () => {
    expect(() => UpdateSystemPromptSchema.parse({ systemPrompt: "" })).toThrow();
  });
});

describe("UpdateDocumentTypeSectionsSchema", () => {
  it("accepts valid input", () => {
    const result = UpdateDocumentTypeSectionsSchema.parse({
      documentType: "feasibility_report",
      sections: { executive_summary: "Write a summary." },
    });
    expect(result.documentType).toBe("feasibility_report");
  });
});

describe("TestSectionPromptSchema", () => {
  it("accepts all required fields", () => {
    const result = TestSectionPromptSchema.parse({
      systemPrompt: "system",
      sectionKey: "executive_summary",
      documentType: "feasibility_report",
      instruction: "Write 2 paragraphs.",
    });
    expect(result.sectionKey).toBe("executive_summary");
  });

  it("rejects empty instruction string", () => {
    expect(() =>
      TestSectionPromptSchema.parse({
        systemPrompt: "system",
        sectionKey: "executive_summary",
        documentType: "feasibility_report",
        instruction: "",
      })
    ).toThrow();
  });
});
