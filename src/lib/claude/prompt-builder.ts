import { buildAnalysisSystemPrompt } from "./prompts/analysis-system-prompt";
import {
  buildAnalysisToolDefinition,
  ANALYZE_IDEA_TOOL_CHOICE,
} from "./prompts/analysis-tool-definition";
import type { Product } from "@/modules/admin-ai-config/schemas";

export interface IdeaContent {
  title: string;
  description: string;
  extractedText: string;
  inputType: "text" | "file" | "url";
}

export interface ClaudeMessageParams {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools: ReturnType<typeof buildAnalysisToolDefinition>[];
  tool_choice: typeof ANALYZE_IDEA_TOOL_CHOICE;
}

function formatInputTypeLabel(inputType: "text" | "file" | "url"): string {
  switch (inputType) {
    case "text":
      return "Text submission / ส่งเป็นข้อความ";
    case "file":
      return "File upload (extracted content) / ไฟล์แนบ (เนื้อหาที่ extract ได้)";
    case "url":
      return "URL / Link submission / ส่งเป็น URL";
  }
}

function buildUserMessage(idea: IdeaContent): string {
  const parts: string[] = [];

  parts.push(`## Idea Title / ชื่อ Idea`);
  parts.push(idea.title);
  parts.push("");

  parts.push(`## Submission Type / ประเภทการส่ง`);
  parts.push(formatInputTypeLabel(idea.inputType));
  parts.push("");

  if (idea.description && idea.description.trim().length > 0) {
    parts.push(`## Description / รายละเอียด`);
    parts.push(idea.description.trim());
    parts.push("");
  }

  if (idea.extractedText && idea.extractedText.trim().length > 0) {
    parts.push(`## Full Content / เนื้อหาทั้งหมด`);
    parts.push(idea.extractedText.trim());
    parts.push("");
  }

  parts.push(
    `Please analyze this idea using the 'analyze_idea' tool. / กรุณาวิเคราะห์ idea นี้โดยใช้ tool 'analyze_idea'`
  );

  return parts.join("\n");
}

export function buildAnalysisPrompt(idea: IdeaContent, products: Product[]): ClaudeMessageParams {
  const toolDef = buildAnalysisToolDefinition(products.map((p) => p.id));

  return {
    system: buildAnalysisSystemPrompt(products),
    messages: [{ role: "user", content: buildUserMessage(idea) }],
    tools: [toolDef],
    tool_choice: ANALYZE_IDEA_TOOL_CHOICE,
  };
}
