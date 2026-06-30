import { describe, it, expect } from "vitest";
import {
  UpdateSystemPromptSchema,
  UpdateDocumentTypeSectionsSchema,
  TestSectionPromptSchema,
  ResetPromptDocumentTypeSchema,
} from "@/modules/admin-ai-config/schemas";

describe("prompt config router input schemas", () => {
  it("UpdateSystemPromptSchema validates correctly", () => {
    expect(UpdateSystemPromptSchema.parse({ systemPrompt: "Hello" })).toEqual({
      systemPrompt: "Hello",
    });
  });

  it("UpdateDocumentTypeSectionsSchema validates correctly", () => {
    expect(
      UpdateDocumentTypeSectionsSchema.parse({
        documentType: "bmc",
        sections: { bmc_canvas: "Write a canvas." },
      })
    ).toMatchObject({ documentType: "bmc" });
  });

  it("TestSectionPromptSchema validates correctly", () => {
    expect(
      TestSectionPromptSchema.parse({
        systemPrompt: "system",
        sectionKey: "executive_summary",
        documentType: "feasibility_report",
        instruction: "Write it.",
      })
    ).toMatchObject({ sectionKey: "executive_summary" });
  });

  it("ResetPromptDocumentTypeSchema validates correctly", () => {
    expect(ResetPromptDocumentTypeSchema.parse({ documentType: "bmc" })).toEqual({
      documentType: "bmc",
    });
  });
});
