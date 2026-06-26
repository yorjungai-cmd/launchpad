/**
 * Mock Anthropic client for testing.
 *
 * Provides a pre-built valid ClaudeAnalysisOutput wrapped in a tool_use response.
 * Used to test the Claude API integration without hitting the real API.
 *
 * Ref: design/implementation.md — Mock strategy
 * Task 2.4
 */

import { vi } from "vitest";
import type { ClaudeAnalysisOutput } from "@/modules/ai-analysis/types";

// ─── Pre-built mock Claude analysis output ───────────────────────────────────

export const MOCK_CLAUDE_ANALYSIS_OUTPUT: ClaudeAnalysisOutput = {
  summary:
    "ระบบ AI วิเคราะห์ใบเสนอราคาอัตโนมัติสำหรับธุรกิจ B2B ช่วยลดเวลาในการจัดทำ proposal และเพิ่มความแม่นยำในการประเมินราคา เป็น SaaS platform ที่เชื่อมต่อกับระบบ ERP ที่มีอยู่",
  stage: "Validation Sprint",
  stage_confidence: 0.82,
  stage_reasoning:
    "แนวคิดมีความชัดเจนพอที่จะทำ rapid validation ด้วย MVP prototype ใน 2–4 สัปดาห์ มี target user ชัดเจนและสามารถทดสอบ core feature ได้ทันที",
  idea_type: "SaaS",
  idea_type_confidence: 0.88,
  portfolio_matches: [
    {
      product: "COBO",
      relevance: "High",
      reasoning: "เชื่อมต่อโดยตรงกับ COBO ERP/accounting system สำหรับข้อมูล pricing และ inventory",
    },
    {
      product: "APP.AI",
      relevance: "High",
      reasoning: "ใช้ APP.AI platform สำหรับ AI workflow และ document processing",
    },
    {
      product: "CRM",
      relevance: "Medium",
      reasoning: "สามารถ integrate กับ CRM สำหรับ sales pipeline management",
    },
    {
      product: "PTCAD",
      relevance: "Low",
      reasoning: "ไม่เกี่ยวข้องโดยตรงกับ CAD software แต่อาจมี use case ใน manufacturing quotation",
    },
  ],
  feasibility: {
    strategic_fit: {
      score: 4,
      reasoning:
        "ตรงกับทิศทาง APP.AI และ COBO อย่างชัดเจน เสริม competitive advantage ในด้าน AI-powered business automation",
    },
    market_potential: {
      score: 4,
      reasoning:
        "ตลาด B2B proposal automation มีขนาดใหญ่และ growing demand โดยเฉพาะในกลุ่ม SME ไทย",
    },
    technical_feasibility: {
      score: 4,
      reasoning:
        "ใช้ technology stack ที่มีอยู่แล้ว (Claude API, Supabase) implementation risk ต่ำ",
    },
    resource_requirement: {
      score: 3,
      reasoning: "ต้องการทีม 2–3 คน ใช้เวลา 2–3 เดือน resource manageable แต่ต้องวางแผนดี",
    },
    business_impact: {
      score: 4,
      reasoning:
        "ลด time-to-proposal > 70% สร้าง revenue stream ใหม่และเพิ่มมูลค่าให้ existing products",
    },
  },
  recommended_action: "Go",
  recommended_action_reasoning:
    "คะแนน feasibility รวมสูง (average 3.8) และ strategic fit ดีมาก แนะนำให้ดำเนินการ Validation Sprint ทันที",
};

// ─── Mock Anthropic messages.create ──────────────────────────────────────────

export const mockAnthropicCreate = vi.fn().mockResolvedValue({
  id: "msg_mock_01",
  type: "message",
  role: "assistant",
  content: [
    {
      type: "tool_use",
      id: "toolu_mock_01",
      name: "analyze_idea",
      input: MOCK_CLAUDE_ANALYSIS_OUTPUT,
    },
  ],
  model: "claude-sonnet-4-5",
  stop_reason: "tool_use",
  stop_sequence: null,
  usage: {
    input_tokens: 500,
    output_tokens: 800,
  },
});

// ─── Mock Anthropic class ─────────────────────────────────────────────────────

export const MockAnthropicClient = {
  messages: {
    create: mockAnthropicCreate,
  },
};

// Default export for vi.mock usage
export default {
  default: vi.fn().mockImplementation(() => MockAnthropicClient),
};
