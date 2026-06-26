/**
 * PromptBuilder — assembles the complete Claude API request for idea analysis.
 *
 * Builds the full `messages.create()` parameters including:
 *   - system prompt (with portfolio context)
 *   - user message (idea content)
 *   - tools array (analysis tool definition)
 *   - tool_choice (force analyze_idea tool use)
 *
 * Ref: design/components.md — PromptBuilder
 *      design/integration.md — Claude API request pattern
 *
 * Task 2.2
 */

import { ANALYSIS_SYSTEM_PROMPT } from "./prompts/analysis-system-prompt";
import {
  ANALYSIS_TOOL_DEFINITION,
  ANALYZE_IDEA_TOOL_CHOICE,
} from "./prompts/analysis-tool-definition";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input idea content for prompt building */
export interface IdeaContent {
  title: string;
  description: string;
  extractedText: string;
  inputType: "text" | "file" | "url";
}

/** Parameters for Claude messages.create() — system, messages, tools, tool_choice */
export interface ClaudeMessageParams {
  system: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  tools: readonly [typeof ANALYSIS_TOOL_DEFINITION];
  tool_choice: typeof ANALYZE_IDEA_TOOL_CHOICE;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Builds the complete parameter object for Claude messages.create().
 *
 * @param idea - The idea content to analyze
 * @returns ClaudeMessageParams ready to spread into anthropic.messages.create()
 *
 * @example
 * ```ts
 * const params = buildAnalysisPrompt({ title, description, extractedText, inputType });
 * const response = await anthropic.messages.create({
 *   model: 'claude-sonnet-4-5',
 *   max_tokens: 2048,
 *   ...params,
 * });
 * ```
 */
export function buildAnalysisPrompt(idea: IdeaContent): ClaudeMessageParams {
  const userMessage = buildUserMessage(idea);

  return {
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
    tools: [ANALYSIS_TOOL_DEFINITION],
    tool_choice: ANALYZE_IDEA_TOOL_CHOICE,
  };
}
