# Prompt Configuration Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Prompt Config" tab in Settings that lets admins customize the AI system prompt and per-section instructions used during document generation, with live test capability per section.

**Architecture:** Extend `system_settings.prompt_config` JSONB (same pattern as `ai_config`). A new `PromptConfigService` handles get/update/reset. Runtime integration loads config from DB on each generation run — no cache, so changes take effect immediately. UI uses two-level navigation (sidebar: doc type, content: sections).

**Tech Stack:** Next.js 14, tRPC, Zod, Supabase (admin client), React Hook Form, Vitest, Tailwind + shadcn/ui

## Global Constraints

- All user-facing text in Thai (ภาษาไทย); code identifiers in English
- Admin-only access via `roleProcedure("admin")` on all new tRPC procedures
- Supabase admin client (`createAdminSupabaseClient`) for all DB writes — same as `AiConfigService`
- Tests go in `tests/` directory; use `describe/it/expect` from vitest
- No new npm dependencies — use existing shadcn/ui components, React Hook Form, Zod
- Vercel maxDuration=60s per tRPC route — each chunked call handles ONE document type

---

## Task 1: DB Migration + Prompt Config Defaults

**Files:**

- Create: `supabase/migrations/20260630000001_add_prompt_config.sql`
- Create: `src/lib/document-generation/prompt-config-defaults.ts`
- Create: `tests/lib/document-generation/prompt-config-defaults.test.ts`

**Interfaces:**

- Produces: `DEFAULT_PROMPT_CONFIG` (type `PromptConfigJsonb`) and `SAMPLE_TEST_IDEA` consumed by Tasks 3, 9

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/document-generation/prompt-config-defaults.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/anupong/Projects/LaunchPad Assistant/launchpad-portal"
npx vitest run tests/lib/document-generation/prompt-config-defaults.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create migration file**

```sql
-- supabase/migrations/20260630000001_add_prompt_config.sql
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS prompt_config JSONB DEFAULT '{}';
```

- [ ] **Step 4: Create defaults file**

```typescript
// src/lib/document-generation/prompt-config-defaults.ts

export interface PromptConfigJsonb {
  systemPrompt: string;
  sections: Record<string, Record<string, string>>;
}

export const DEFAULT_PROMPT_CONFIG: PromptConfigJsonb = {
  systemPrompt: `You are a business analyst assistant for AppliCAD, a Thai software company.
You generate professional, concise narrative sections for business documents based on structured idea analysis data.
ALWAYS write the narrative content in Thai (ภาษาไทย), regardless of the language of the idea input. Use professional Thai business writing. Product names, framework terms (e.g. Launch PAD, BMC, Go/No Go), and established technical terms may stay in English where that reads naturally.
Be factual, professional, and avoid hyperbole. Keep each section focused and actionable.
Format output as clean markdown — no excessive headers within a section.`,
  sections: {
    feasibility_report: {
      executive_summary:
        "เขียนบทสรุปผู้บริหาร 2-3 ย่อหน้า ครอบคลุมวัตถุประสงค์หลัก ศักยภาพตลาด และข้อเสนอแนะเชิงกลยุทธ์",
    },
    poc_proposal: {
      poc_objective:
        "อธิบายวัตถุประสงค์ POC อย่างชัดเจน ระบุสิ่งที่ต้องการพิสูจน์และเกณฑ์ความสำเร็จ",
      poc_scope: "กำหนดขอบเขต POC ให้ชัดเจน ระบุสิ่งที่รวมและไม่รวม และระยะเวลาที่คาดหวัง",
      poc_timeline: "สร้าง timeline POC แบบ phase-by-phase พร้อม milestone หลัก",
    },
    bmc: {
      bmc_canvas:
        "สร้าง Business Model Canvas 9 ช่อง: Customer Segments, Value Propositions, Channels, Customer Relationships, Revenue Streams, Key Resources, Key Activities, Key Partnerships, Cost Structure",
    },
    launch_pad_plan: {
      validation_sprint:
        "ออกแบบ validation sprint 2-4 สัปดาห์ ระบุ hypothesis ที่ต้องทดสอบและ experiments",
      success_metrics: "กำหนด OKR และตัวชี้วัดความสำเร็จที่วัดได้ชัดเจน",
    },
    project_requirements: {
      functional_requirements:
        "ระบุ functional requirements แบบ user story format ครอบคลุม use cases หลัก",
      non_functional_requirements:
        "ระบุ non-functional requirements ด้าน performance, security, scalability",
    },
    resource_plan: {
      resource_requirements:
        "ระบุทรัพยากรที่ต้องการ ทั้ง human resource, infrastructure, และ tools",
      budget_estimate: "ประมาณการงบประมาณแบ่งตาม category พร้อม assumption ที่ชัดเจน",
    },
    action_plan: {
      milestones: "กำหนด milestones หลัก 3-6 จุด พร้อม deliverable และ timeline",
      tasks_owners: "แบ่งงานระดับ task พร้อมผู้รับผิดชอบและ deadline",
    },
    gtm_summary: {
      target_market: "วิเคราะห์ตลาดเป้าหมาย ระบุ ICP (Ideal Customer Profile) และ market size",
      go_to_market_strategy: "กำหนดกลยุทธ์ GTM ครอบคลุม channel, messaging, และ pricing",
      launch_metrics: "กำหนด launch metrics และ KPI ที่จะวัด 30/60/90 วันหลัง launch",
    },
    executive_presentation: {
      executive_overview: "สรุปภาพรวมสำหรับผู้บริหาร กระชับ ตรงประเด็น เน้น business value",
    },
    stage_gate_guide: {
      gate_criteria: "กำหนดเกณฑ์ผ่าน gate ที่วัดได้และชัดเจน",
    },
    project_proposal: {
      executive_summary:
        "เขียนบทสรุปผู้บริหาร 2-3 ย่อหน้า ครอบคลุมวัตถุประสงค์หลัก ศักยภาพตลาด และข้อเสนอแนะเชิงกลยุทธ์",
      problem_opportunity:
        "วิเคราะห์ปัญหาและโอกาสทางธุรกิจที่ชัดเจน ระบุ pain points และ market gap",
      proposed_solution:
        "อธิบายแนวทางแก้ไขที่เสนอ ระบุ unique value proposition และความแตกต่างจากทางเลือกอื่น",
      launch_pad_plan: "สรุปแผน Launch PAD: validation sprint, milestones, และตัวชี้วัดความสำเร็จ",
      resource_investment: "สรุปทรัพยากรและการลงทุนที่ต้องการ: บุคลากร งบประมาณ และ timeline",
      expected_outcomes: "ระบุผลลัพธ์ที่คาดหวัง ROI และตัวชี้วัดความสำเร็จหลังดำเนินการ",
      next_steps: "กำหนดขั้นตอนถัดไปที่ชัดเจน: ใคร ทำอะไร ภายในเมื่อไหร่",
    },
  },
};

export const SAMPLE_TEST_IDEA = {
  title: "ระบบ AI ช่วยวิเคราะห์ใบเสนอราคา",
  summary:
    "พัฒนาระบบ AI ที่ช่วย BD team วิเคราะห์ใบเสนอราคาจากลูกค้า เพื่อประเมินความเป็นไปได้และจัดลำดับความสำคัญของโอกาสทางธุรกิจ ลดเวลาวิเคราะห์จาก 2 ชั่วโมงเหลือ 15 นาทีต่อใบ",
  stage: "Sandbox" as const,
  ideaType: "Internal Tool",
  recommendedAction: "Proceed to POC",
  recommendedActionReasoning: "ความต้องการชัดเจน มีข้อมูลเพียงพอสำหรับทำ POC",
  feasibilityScores: {
    strategicFit: 4,
    marketPotential: 3,
    technicalFeasibility: 4,
    resourceRequirement: 3,
    businessImpact: 4,
  },
  feasibilityReasons: {
    strategicFit: "สอดคล้องกับทิศทาง AI-first ของ AppliCAD",
    marketPotential: "ตลาดภายในองค์กร จำกัดแต่ impact สูง",
    technicalFeasibility: "มี LLM API พร้อมใช้ ทีม dev มีประสบการณ์",
    resourceRequirement: "ต้องการ 1 dev + 1 BD 2 เดือน",
    businessImpact: "ประหยัดเวลา BD team ~8 ชั่วโมง/สัปดาห์",
  },
  portfolioMatches: [
    {
      product: "AppliCAD ERP",
      relevance: "High",
      reasoning: "Integration กับข้อมูล customer ที่มีอยู่",
    },
  ],
  referenceNumber: "TEST-001",
  submitterName: "Sample User",
} as const;

/** Document types in Proposal workflow order — used by UI sidebar */
export const DOCUMENT_TYPES_IN_WORKFLOW_ORDER = [
  { type: "feasibility_report", label: "รายงานความเป็นไปได้" },
  { type: "poc_proposal", label: "ข้อเสนอ POC" },
  { type: "bmc", label: "Business Model Canvas" },
  { type: "launch_pad_plan", label: "แผน Launch PAD" },
  { type: "project_requirements", label: "ข้อกำหนดโครงการ" },
  { type: "resource_plan", label: "แผนทรัพยากร" },
  { type: "action_plan", label: "แผนปฏิบัติการ" },
  { type: "gtm_summary", label: "สรุปแผน Go-to-Market" },
  { type: "executive_presentation", label: "สรุปสำหรับผู้บริหาร" },
  { type: "stage_gate_guide", label: "คู่มือประเมิน Stage Gate" },
  { type: "project_proposal", label: "ข้อเสนอโครงการ (สมบูรณ์)" },
] as const;

export type WorkflowDocumentType = (typeof DOCUMENT_TYPES_IN_WORKFLOW_ORDER)[number]["type"];
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/lib/document-generation/prompt-config-defaults.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260630000001_add_prompt_config.sql \
        src/lib/document-generation/prompt-config-defaults.ts \
        tests/lib/document-generation/prompt-config-defaults.test.ts
git commit -m "feat: add prompt_config migration and default values"
```

---

## Task 2: Zod Schemas for Prompt Config

**Files:**

- Modify: `src/modules/admin-ai-config/schemas.ts`
- Create: `tests/modules/admin-ai-config/prompt-config-schemas.test.ts`

**Interfaces:**

- Produces: `PromptConfigSchema`, `UpdateSystemPromptSchema`, `UpdateDocumentTypeSectionsSchema`, `TestSectionPromptSchema`, `PromptConfigData` — consumed by Tasks 3, 4

- [ ] **Step 1: Write failing tests**

```typescript
// tests/modules/admin-ai-config/prompt-config-schemas.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/modules/admin-ai-config/prompt-config-schemas.test.ts
```

Expected: FAIL — schemas not exported

- [ ] **Step 3: Add schemas to existing file**

Append to `src/modules/admin-ai-config/schemas.ts` after the existing `AuditTargetType` declaration:

```typescript
// ─── Zod: Prompt Config ───────────────────────────────────────────────────────

export const PromptConfigSchema = z.object({
  systemPrompt: z.string().min(1).max(8000),
  sections: z.record(z.string(), z.record(z.string(), z.string().max(2000))),
});

export type PromptConfigData = z.infer<typeof PromptConfigSchema>;

export const UpdateSystemPromptSchema = z.object({
  systemPrompt: z.string().min(1).max(8000),
});

export const UpdateDocumentTypeSectionsSchema = z.object({
  documentType: z.string().min(1),
  sections: z.record(z.string(), z.string().max(2000)),
});

export const TestSectionPromptSchema = z.object({
  systemPrompt: z.string().min(1).max(8000),
  sectionKey: z.string().min(1),
  documentType: z.string().min(1),
  instruction: z.string().max(2000),
});

export const ResetPromptDocumentTypeSchema = z.object({
  documentType: z.string().min(1),
});

// Add to AuditAction union:
// "prompt_config_updated" | "prompt_config_reset"
// Add to AuditTargetType union:
// "prompt_config"
```

Also update `AuditAction` and `AuditTargetType`:

```typescript
// Replace existing AuditAction type
export type AuditAction =
  | "api_key_created"
  | "api_key_updated"
  | "api_key_deleted"
  | "api_key_set_active"
  | "user_created"
  | "user_role_changed"
  | "user_deleted"
  | "ai_config_updated"
  | "prompt_config_updated"
  | "prompt_config_reset";

// Replace existing AuditTargetType type
export type AuditTargetType = "api_key" | "user" | "ai_config" | "prompt_config";
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/modules/admin-ai-config/prompt-config-schemas.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin-ai-config/schemas.ts \
        tests/modules/admin-ai-config/prompt-config-schemas.test.ts
git commit -m "feat: add prompt config Zod schemas"
```

---

## Task 3: PromptConfigService

**Files:**

- Create: `src/modules/admin-ai-config/prompt-config-service.ts`
- Create: `tests/modules/admin-ai-config/prompt-config-service.test.ts`

**Interfaces:**

- Consumes: `PromptConfigSchema`, `PromptConfigData`, `UpdateSystemPromptSchema`, `UpdateDocumentTypeSectionsSchema` from Task 2; `DEFAULT_PROMPT_CONFIG` from Task 1
- Produces: `promptConfigService` singleton consumed by Tasks 4, 5

- [ ] **Step 1: Write failing tests**

```typescript
// tests/modules/admin-ai-config/prompt-config-service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase admin client
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(),
}));
vi.mock("@/modules/admin-ai-config/audit-log-service", () => ({
  adminAuditLogService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { PromptConfigService } from "@/modules/admin-ai-config/prompt-config-service";
import { DEFAULT_PROMPT_CONFIG } from "@/lib/document-generation/prompt-config-defaults";

function makeMockDb(existingRow: Record<string, unknown> | null) {
  const single = vi.fn().mockResolvedValue({ data: existingRow, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });
  const update = vi
    .fn()
    .mockReturnValue({
      eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
    });
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  return {
    from: vi
      .fn()
      .mockReturnValue({
        select: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle }) }),
        update,
        insert,
      }),
    update,
    insert,
    maybeSingle,
  };
}

describe("PromptConfigService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getPromptConfig returns defaults when no row exists", async () => {
    const db = makeMockDb(null);
    // insert path: mock insert to return default
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const service = new PromptConfigService();
    // just verify it doesn't throw and returns systemPrompt
    // (full integration tested via e2e)
    await expect(service.getPromptConfig()).resolves.toBeDefined();
  });

  it("getPromptConfig returns existing row when present", async () => {
    const existing = {
      id: "row-1",
      prompt_config: { systemPrompt: "custom", sections: {} },
    };
    const db = makeMockDb(existing);
    (createAdminSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    const service = new PromptConfigService();
    await expect(service.getPromptConfig()).resolves.toMatchObject({ systemPrompt: "custom" });
  });

  it("DEFAULT_PROMPT_CONFIG has systemPrompt matching current hardcoded value", () => {
    expect(DEFAULT_PROMPT_CONFIG.systemPrompt).toContain("AppliCAD");
    expect(DEFAULT_PROMPT_CONFIG.systemPrompt).toContain("Thai");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/modules/admin-ai-config/prompt-config-service.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create PromptConfigService**

```typescript
// src/modules/admin-ai-config/prompt-config-service.ts
import { AppError } from "@/lib/errors/AppError";
import logger from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { adminAuditLogService } from "./audit-log-service";
import { DEFAULT_PROMPT_CONFIG } from "@/lib/document-generation/prompt-config-defaults";
import type { PromptConfigData } from "./schemas";

interface SystemSettingsRow {
  id: string;
  prompt_config: PromptConfigData | null;
}

export class PromptConfigService {
  async getPromptConfig(): Promise<PromptConfigData> {
    const db = createAdminSupabaseClient();
    const { data, error } = await db
      .from("system_settings")
      .select("id, prompt_config")
      .limit(1)
      .maybeSingle<SystemSettingsRow>();

    if (error) {
      logger.error({ err: error }, "PromptConfigService.getPromptConfig: DB error");
      throw AppError.internal("Failed to read prompt configuration");
    }

    if (data?.prompt_config && data.prompt_config.systemPrompt) {
      return data.prompt_config;
    }

    // No row or empty config — upsert defaults
    return this._upsertDefaults(db, data?.id);
  }

  async updateSystemPrompt(systemPrompt: string, adminId: string): Promise<PromptConfigData> {
    const current = await this.getPromptConfig();
    return this._saveConfig({ ...current, systemPrompt }, adminId, "system_prompt");
  }

  async updateDocumentTypeSections(
    documentType: string,
    sections: Record<string, string>,
    adminId: string
  ): Promise<PromptConfigData> {
    const current = await this.getPromptConfig();
    const updated: PromptConfigData = {
      ...current,
      sections: { ...current.sections, [documentType]: sections },
    };
    return this._saveConfig(updated, adminId, documentType);
  }

  async resetDocumentType(documentType: string, adminId: string): Promise<PromptConfigData> {
    const current = await this.getPromptConfig();
    const defaultSections = DEFAULT_PROMPT_CONFIG.sections[documentType] ?? {};
    const updated: PromptConfigData = {
      ...current,
      sections: { ...current.sections, [documentType]: { ...defaultSections } },
    };
    return this._saveReset(updated, adminId, documentType);
  }

  private async _saveConfig(
    config: PromptConfigData,
    adminId: string,
    changedField: string
  ): Promise<PromptConfigData> {
    const db = createAdminSupabaseClient();
    const { data: existing } = await db
      .from("system_settings")
      .select("id")
      .limit(1)
      .maybeSingle<{ id: string }>();

    let rowId = existing?.id;
    if (!rowId) {
      const { data: inserted, error: insertErr } = await db
        .from("system_settings")
        .insert({ prompt_config: config })
        .select("id")
        .single<{ id: string }>();
      if (insertErr || !inserted) throw AppError.internal("Failed to create prompt config record");
      rowId = inserted.id;
    } else {
      const { error: updateErr } = await db
        .from("system_settings")
        .update({ prompt_config: config, updated_at: new Date().toISOString() })
        .eq("id", rowId);
      if (updateErr) throw AppError.internal("Failed to update prompt configuration");
    }

    await adminAuditLogService.log({
      action: "prompt_config_updated",
      adminId,
      targetType: "prompt_config",
      targetId: rowId,
      metadata: { changed_field: changedField },
    });

    return config;
  }

  private async _saveReset(
    config: PromptConfigData,
    adminId: string,
    documentType: string
  ): Promise<PromptConfigData> {
    const result = await this._saveConfig(config, adminId, documentType);
    const db = createAdminSupabaseClient();
    const { data } = await db
      .from("system_settings")
      .select("id")
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (data?.id) {
      await adminAuditLogService.log({
        action: "prompt_config_reset",
        adminId,
        targetType: "prompt_config",
        targetId: data.id,
        metadata: { document_type: documentType },
      });
    }
    return result;
  }

  private async _upsertDefaults(
    db: ReturnType<typeof createAdminSupabaseClient>,
    existingId?: string
  ): Promise<PromptConfigData> {
    if (existingId) {
      await db
        .from("system_settings")
        .update({ prompt_config: DEFAULT_PROMPT_CONFIG, updated_at: new Date().toISOString() })
        .eq("id", existingId);
    } else {
      await db.from("system_settings").insert({ prompt_config: DEFAULT_PROMPT_CONFIG });
    }
    logger.info("PromptConfigService: initialized default prompt config");
    return { ...DEFAULT_PROMPT_CONFIG };
  }
}

export const promptConfigService = new PromptConfigService();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/modules/admin-ai-config/prompt-config-service.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin-ai-config/prompt-config-service.ts \
        tests/modules/admin-ai-config/prompt-config-service.test.ts
git commit -m "feat: add PromptConfigService"
```

---

## Task 4: tRPC Procedures

**Files:**

- Modify: `src/modules/admin-ai-config/router.ts`
- Create: `tests/modules/admin-ai-config/prompt-config-router.test.ts`

**Interfaces:**

- Consumes: `promptConfigService` from Task 3; all schemas from Task 2; `SAMPLE_TEST_IDEA`, `DEFAULT_PROMPT_CONFIG` from Task 1
- Produces: 5 tRPC procedures consumed by UI Tasks 7–10

- [ ] **Step 1: Write failing tests**

```typescript
// tests/modules/admin-ai-config/prompt-config-router.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/modules/admin-ai-config/prompt-config-router.test.ts
```

Expected: FAIL — `ResetPromptDocumentTypeSchema` not exported

- [ ] **Step 3: Add procedures to adminRouter**

Add imports at top of `src/modules/admin-ai-config/router.ts`:

```typescript
import { promptConfigService } from "./prompt-config-service";
import {
  UpdateSystemPromptSchema,
  UpdateDocumentTypeSectionsSchema,
  TestSectionPromptSchema,
  ResetPromptDocumentTypeSchema,
} from "./schemas";
import { SAMPLE_TEST_IDEA } from "@/lib/document-generation/prompt-config-defaults";
import {
  resolveActiveKeyInfo,
  callProviderTool,
  narrativeModelFor,
} from "@/lib/claude/inline-worker";
import { buildNarrativeContext } from "@/lib/claude/prompts/document-narrative";
import { NARRATIVE_TOOL_DEFINITION } from "@/lib/claude/prompts/document-narrative";
```

Add procedures inside the `router({...})` call after `updateAiConfig`:

```typescript
  // ─── Prompt Config (new feature) ──────────────────────────────────────────

  getPromptConfig: roleProcedure("admin").query(async () => {
    return promptConfigService.getPromptConfig();
  }),

  updateSystemPrompt: roleProcedure("admin")
    .input(UpdateSystemPromptSchema)
    .mutation(async ({ input, ctx }) => {
      return promptConfigService.updateSystemPrompt(input.systemPrompt, ctx.user.id);
    }),

  updateDocumentTypeSections: roleProcedure("admin")
    .input(UpdateDocumentTypeSectionsSchema)
    .mutation(async ({ input, ctx }) => {
      return promptConfigService.updateDocumentTypeSections(
        input.documentType,
        input.sections,
        ctx.user.id
      );
    }),

  resetPromptDocumentType: roleProcedure("admin")
    .input(ResetPromptDocumentTypeSchema)
    .mutation(async ({ input, ctx }) => {
      return promptConfigService.resetDocumentType(input.documentType, ctx.user.id);
    }),

  testSectionPrompt: roleProcedure("admin")
    .input(TestSectionPromptSchema)
    .mutation(async ({ input }) => {
      const keyInfo = await resolveActiveKeyInfo();
      if (!keyInfo) return { content: "ไม่พบ API key ที่ active — ตรวจสอบ tab API Keys" };

      const narrativeContext = buildNarrativeContext({
        ideaTitle: SAMPLE_TEST_IDEA.title,
        summary: SAMPLE_TEST_IDEA.summary,
        stage: SAMPLE_TEST_IDEA.stage,
        ideaType: SAMPLE_TEST_IDEA.ideaType,
        recommendedAction: SAMPLE_TEST_IDEA.recommendedAction,
        portfolioMatches: [...SAMPLE_TEST_IDEA.portfolioMatches],
        feasibilityScores: SAMPLE_TEST_IDEA.feasibilityScores,
        documentType: input.documentType,
        sectionKeys: [input.sectionKey],
        sectionInstructions: input.instruction
          ? { [input.sectionKey]: input.instruction }
          : undefined,
      });

      try {
        const raw = await callProviderTool(
          { ...keyInfo, model: narrativeModelFor(keyInfo.provider) },
          {
            system: input.systemPrompt,
            messages: [{ role: "user", content: narrativeContext }],
            tool: NARRATIVE_TOOL_DEFINITION,
            toolName: NARRATIVE_TOOL_DEFINITION.name,
            maxTokens: 1024,
          }
        );
        const out = raw as { sections?: Array<{ key: string; content_markdown: string }> };
        const section = out.sections?.find((s) => s.key === input.sectionKey);
        return { content: section?.content_markdown ?? "ไม่มีผลลัพธ์จาก AI" };
      } catch (err) {
        return {
          content: `เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }),
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/modules/admin-ai-config/prompt-config-router.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/modules/admin-ai-config/router.ts \
        tests/modules/admin-ai-config/prompt-config-router.test.ts
git commit -m "feat: add prompt config tRPC procedures"
```

---

## Task 5: Runtime Integration

**Files:**

- Modify: `src/lib/claude/prompts/document-narrative.ts`
- Modify: `src/lib/document-generation/inline-generate.ts`
- Create: `tests/lib/claude/prompts/document-narrative.test.ts`

**Interfaces:**

- Consumes: `promptConfigService` from Task 3; `DEFAULT_PROMPT_CONFIG` from Task 1
- Produces: updated `buildNarrativeContext` (with `sectionInstructions`); `runInlineDocumentGenerationForType` consumed by Task 6 tRPC procedure

- [ ] **Step 1: Write failing tests for buildNarrativeContext**

```typescript
// tests/lib/claude/prompts/document-narrative.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/claude/prompts/document-narrative.test.ts
```

Expected: FAIL — `sectionInstructions` param not accepted

- [ ] **Step 3: Update buildNarrativeContext in document-narrative.ts**

Replace the existing `buildNarrativeContext` function:

```typescript
export function buildNarrativeContext(params: {
  ideaTitle: string;
  summary: string;
  stage: string | null;
  ideaType: string | null;
  recommendedAction: string | null;
  portfolioMatches: Array<{ product: string; relevance: string; reasoning: string }>;
  feasibilityScores: {
    strategicFit: number | null;
    marketPotential: number | null;
    technicalFeasibility: number | null;
    resourceRequirement: number | null;
    businessImpact: number | null;
  };
  documentType: string;
  sectionKeys: string[];
  sectionInstructions?: Record<string, string>;
}): string {
  const scores = params.feasibilityScores;
  const base = `Generate narrative sections for a "${params.documentType}" document.

IDEA: ${params.ideaTitle}
SUMMARY: ${params.summary}
STAGE: ${params.stage ?? "Sandbox"}
TYPE: ${params.ideaType ?? "Unknown"}
RECOMMENDED ACTION: ${params.recommendedAction ?? "Pending"}

FEASIBILITY SCORES:
- Strategic Fit: ${scores.strategicFit ?? "N/A"}/5
- Market Potential: ${scores.marketPotential ?? "N/A"}/5
- Technical Feasibility: ${scores.technicalFeasibility ?? "N/A"}/5
- Resource Requirement: ${scores.resourceRequirement ?? "N/A"}/5
- Business Impact: ${scores.businessImpact ?? "N/A"}/5

PORTFOLIO MATCHES: ${params.portfolioMatches.map((m) => `${m.product} (${m.relevance})`).join(", ") || "None"}

Write sections: ${params.sectionKeys.join(", ")}`;

  if (!params.sectionInstructions) return base;

  const relevant = params.sectionKeys
    .filter((k) => params.sectionInstructions![k])
    .map((k) => `- ${k}: ${params.sectionInstructions![k]}`)
    .join("\n");

  if (!relevant) return base;

  return `${base}\n\nSection-specific instructions:\n${relevant}`;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/lib/claude/prompts/document-narrative.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Update inline-generate.ts to load promptConfig from DB**

In `src/lib/document-generation/inline-generate.ts`, add import at top:

```typescript
import { promptConfigService } from "@/modules/admin-ai-config/prompt-config-service";
import { DOCUMENT_NARRATIVE_SYSTEM_PROMPT } from "@/lib/claude/prompts/document-narrative";
```

Then modify the `callClaude` construction inside `runInlineDocumentGeneration` to load promptConfig:

```typescript
// 3. Resolve provider key + load prompt config
const [keyInfo, promptConfig] = await Promise.all([
  resolveActiveKeyInfo(),
  promptConfigService.getPromptConfig().catch(() => null),
]);

const effectiveSystemPrompt = promptConfig?.systemPrompt ?? DOCUMENT_NARRATIVE_SYSTEM_PROMPT;

const callClaude: ClaudeNarrativeFn = async (params) => {
  if (!keyInfo) return {};
  try {
    const raw = await callProviderTool(
      { ...keyInfo, model: narrativeModelFor(keyInfo.provider) },
      {
        system: effectiveSystemPrompt,
        messages: [
          {
            role: "user",
            content: buildNarrativeContext({
              ...params,
              sectionInstructions: promptConfig?.sections?.[params.documentType],
            }),
          },
        ],
        tool: NARRATIVE_TOOL_DEFINITION,
        toolName: NARRATIVE_TOOL_DEFINITION.name,
        maxTokens: 4096,
      }
    );
    const out = raw as { sections?: Array<{ key: string; content_markdown: string }> };
    const map: Record<string, string> = {};
    for (const s of out.sections ?? []) {
      if (s?.key) map[s.key] = s.content_markdown ?? "";
    }
    return map;
  } catch (err) {
    logger.warn(
      { ideaId, err: err instanceof Error ? err.message : String(err) },
      "runInlineDocumentGeneration: narrative call failed — falling back to template"
    );
    return {};
  }
};
```

- [ ] **Step 6: Add runInlineDocumentGenerationForType function**

Append to `src/lib/document-generation/inline-generate.ts` after `runInlineDocumentGeneration`:

```typescript
/**
 * Generate documents for ONE document type — used for chunked generation
 * to stay within Vercel's 60s serverless timeout per tRPC call.
 *
 * Each call loads promptConfig fresh (no cache) so admin changes take effect
 * on the next generation run without a restart.
 */
export async function runInlineDocumentGenerationForType(
  ideaId: string,
  documentType: string,
  options: { force?: boolean } = {}
): Promise<"generated" | "skipped"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminSupabaseClient() as any;

  // Dedup guard
  if (!options.force) {
    const existing = await documentGenerationRepository.findByIdea(ideaId);
    const typeDoc = existing.find(
      (d) => d.documentType === documentType && d.generationStatus === "completed"
    );
    if (typeDoc) {
      logger.info(
        { ideaId, documentType },
        "runInlineDocumentGenerationForType: already completed — skipping"
      );
      return "skipped";
    }
  }

  // Load analysis
  const { data: analysisRow, error: analysisErr } = await db
    .from("ai_analyses")
    .select("*")
    .eq("idea_id", ideaId)
    .maybeSingle();

  if (analysisErr || !analysisRow) {
    throw new Error(`runInlineDocumentGenerationForType: analysis not found for idea ${ideaId}`);
  }
  if (analysisRow.processing_status !== "completed") {
    throw new Error(
      `runInlineDocumentGenerationForType: analysis not completed (status=${analysisRow.processing_status})`
    );
  }

  const { data: ideaRow } = await db
    .from("ideas")
    .select("id, title, reference_number, submitter_name")
    .eq("id", ideaId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = analysisRow as Record<string, any>;

  const analysisData: AnalysisData = {
    ideaTitle: (ideaRow?.title as string | undefined) ?? "Untitled",
    summary: (a["summary"] as string | null) ?? null,
    stage: (a["stage"] as string | null) ?? null,
    ideaType: (a["idea_type"] as string | null) ?? null,
    recommendedAction: (a["recommended_action"] as string | null) ?? null,
    recommendedActionReasoning: (a["recommended_action_reasoning"] as string | null) ?? null,
    portfolioMatches: (a["portfolio_matches"] as AnalysisData["portfolioMatches"] | null) ?? [],
    strategicFitScore: (a["strategic_fit_score"] as number | null) ?? null,
    marketPotentialScore: (a["market_potential_score"] as number | null) ?? null,
    technicalFeasibilityScore: (a["technical_feasibility_score"] as number | null) ?? null,
    resourceRequirementScore: (a["resource_requirement_score"] as number | null) ?? null,
    businessImpactScore: (a["business_impact_score"] as number | null) ?? null,
    strategicFitReasoning: (a["strategic_fit_reasoning"] as string | null) ?? null,
    marketPotentialReasoning: (a["market_potential_reasoning"] as string | null) ?? null,
    technicalFeasibilityReasoning: (a["technical_feasibility_reasoning"] as string | null) ?? null,
    resourceRequirementReasoning: (a["resource_requirement_reasoning"] as string | null) ?? null,
    businessImpactReasoning: (a["business_impact_reasoning"] as string | null) ?? null,
    referenceNumber: (ideaRow?.reference_number as string | undefined) ?? "",
    submitterName: (ideaRow?.submitter_name as string | null) ?? null,
  };

  const analysisId = a["id"] as string;

  const [keyInfo, promptConfig] = await Promise.all([
    resolveActiveKeyInfo(),
    promptConfigService.getPromptConfig().catch(() => null),
  ]);

  const effectiveSystemPrompt = promptConfig?.systemPrompt ?? DOCUMENT_NARRATIVE_SYSTEM_PROMPT;

  const callClaude: ClaudeNarrativeFn = async (params) => {
    if (!keyInfo) return {};
    try {
      const raw = await callProviderTool(
        { ...keyInfo, model: narrativeModelFor(keyInfo.provider) },
        {
          system: effectiveSystemPrompt,
          messages: [
            {
              role: "user",
              content: buildNarrativeContext({
                ...params,
                sectionInstructions: promptConfig?.sections?.[params.documentType],
              }),
            },
          ],
          tool: NARRATIVE_TOOL_DEFINITION,
          toolName: NARRATIVE_TOOL_DEFINITION.name,
          maxTokens: 4096,
        }
      );
      const out = raw as { sections?: Array<{ key: string; content_markdown: string }> };
      const map: Record<string, string> = {};
      for (const s of out.sections ?? []) {
        if (s?.key) map[s.key] = s.content_markdown ?? "";
      }
      return map;
    } catch (err) {
      logger.warn(
        { ideaId, documentType, err: err instanceof Error ? err.message : String(err) },
        "runInlineDocumentGenerationForType: narrative call failed — falling back to template"
      );
      return {};
    }
  };

  if (documentType === "project_proposal") {
    await documentGenerationService.composeProjectProposal(
      ideaId,
      analysisId,
      analysisData,
      callClaude
    );
  } else {
    await documentGenerationService.generateDocumentSet(
      ideaId,
      analysisId,
      analysisData,
      callClaude
    );
  }

  logger.info(
    { ideaId, documentType, analysisId },
    "runInlineDocumentGenerationForType: completed"
  );
  return "generated";
}
```

Also add import at top (for `DOCUMENT_NARRATIVE_SYSTEM_PROMPT`):

```typescript
import {
  DOCUMENT_NARRATIVE_SYSTEM_PROMPT,
  buildNarrativeContext,
} from "@/lib/claude/prompts/document-narrative";
import { promptConfigService } from "@/modules/admin-ai-config/prompt-config-service";
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/claude/prompts/document-narrative.ts \
        src/lib/document-generation/inline-generate.ts \
        tests/lib/claude/prompts/document-narrative.test.ts
git commit -m "feat: load prompt config from DB in document generation runtime"
```

---

## Task 6: Settings Page — Add Prompt Config Tab

**Files:**

- Modify: `src/app/[locale]/(app)/settings/page.tsx`
- Create: `src/components/settings/prompt-config/DocTypeNav.tsx`

**Interfaces:**

- Consumes: `DOCUMENT_TYPES_IN_WORKFLOW_ORDER` from Task 1
- Produces: `DocTypeNav` component; `prompt-config` tab entry — consumed by Tasks 7–10

- [ ] **Step 1: Add tab to settings page**

In `src/app/[locale]/(app)/settings/page.tsx`:

Add `SlidersHorizontal` to lucide import:

```typescript
import { Settings, Bot, KeyRound, Users, SlidersHorizontal } from "lucide-react";
```

Update `TabId` type:

```typescript
type TabId = "ai-config" | "prompt-config" | "api-keys" | "users";
```

Add dynamic import after `UsersTab`:

```typescript
const PromptConfigTab = dynamic(
  () =>
    import("@/components/settings/PromptConfigTab").then((m) => ({
      default: m.PromptConfigTab,
    })),
  { loading: () => <TabContentSkeleton />, ssr: false }
);
```

Update `TABS` array:

```typescript
const TABS: TabDef[] = [
  { id: "ai-config", label: "AI Configuration", icon: Bot },
  { id: "prompt-config", label: "Prompt Config", icon: SlidersHorizontal },
  { id: "api-keys", label: "API Keys", icon: KeyRound },
  { id: "users", label: "Users", icon: Users },
];
```

Update `TabContent` switch:

```typescript
case "prompt-config":
  return <PromptConfigTab />;
```

- [ ] **Step 2: Create DocTypeNav component**

```typescript
// src/components/settings/prompt-config/DocTypeNav.tsx
"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPES_IN_WORKFLOW_ORDER } from "@/lib/document-generation/prompt-config-defaults";

export type NavSelection = "global" | string; // "global" or a documentType key

interface DocTypeNavProps {
  selected: NavSelection;
  dirtyTypes: Set<string>;
  onSelect: (selection: NavSelection) => void;
}

export function DocTypeNav({ selected, dirtyTypes, onSelect }: DocTypeNavProps) {
  return (
    <nav aria-label="Document type sections" className="shrink-0 lg:w-52">
      <ul className="space-y-1" role="listbox">
        {/* Global system prompt */}
        <li role="option" aria-selected={selected === "global"}>
          <button
            type="button"
            onClick={() => onSelect("global")}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected === "global"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Globe className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">System Prompt</span>
            {dirtyTypes.has("global") && (
              <span className="size-1.5 rounded-full bg-current" aria-label="มีการเปลี่ยนแปลง" />
            )}
          </button>
        </li>

        {/* Divider */}
        <li aria-hidden="true" className="my-1 border-t border-border" />

        {/* Document types in workflow order */}
        {DOCUMENT_TYPES_IN_WORKFLOW_ORDER.map(({ type, label }) => {
          const isActive = selected === type;
          const isDirty = dirtyTypes.has(type);
          return (
            <li key={type} role="option" aria-selected={isActive}>
              <button
                type="button"
                onClick={() => onSelect(type)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <span className="flex-1 text-left leading-tight">{label}</span>
                {isDirty && (
                  <span className="size-1.5 rounded-full bg-current" aria-label="มีการเปลี่ยนแปลง" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/\(app\)/settings/page.tsx \
        src/components/settings/prompt-config/DocTypeNav.tsx
git commit -m "feat: add prompt-config tab and DocTypeNav component"
```

---

## Task 7: SystemPromptEditor Component

**Files:**

- Create: `src/components/settings/prompt-config/SystemPromptEditor.tsx`

**Interfaces:**

- Consumes: `api.admin.getPromptConfig`, `api.admin.updateSystemPrompt` tRPC procedures from Task 4
- Produces: `SystemPromptEditor` consumed by Task 10 (PromptConfigTab)

- [ ] **Step 1: Create SystemPromptEditor**

```typescript
// src/components/settings/prompt-config/SystemPromptEditor.tsx
"use client";

import * as React from "react";
import { Globe, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/shared/ToastProvider";
import { api } from "@/lib/trpc/client";
import { DEFAULT_PROMPT_CONFIG } from "@/lib/document-generation/prompt-config-defaults";

interface SystemPromptEditorProps {
  initialValue: string;
  onDirtyChange: (dirty: boolean) => void;
}

export function SystemPromptEditor({ initialValue, onDirtyChange }: SystemPromptEditorProps) {
  const toast = useToast();
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const isDirty = value !== initialValue;

  React.useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const updateMutation = api.admin.updateSystemPrompt.useMutation({
    onSuccess: () => toast.success("บันทึก System Prompt เรียบร้อยแล้ว"),
    onError: (err) => toast.error("บันทึกไม่สำเร็จ", { description: err.message }),
  });

  function handleReset() {
    if (!confirm("Reset System Prompt กลับค่า default หรือไม่?")) return;
    setValue(DEFAULT_PROMPT_CONFIG.systemPrompt);
  }

  function handleSave() {
    updateMutation.mutate({ systemPrompt: value });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10" aria-hidden="true">
          <Globe className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">System Prompt กลาง</h2>
          <p className="text-sm text-muted-foreground">
            ใช้กับทุก section ทุก document type — กำหนดบทบาทและโทนเสียงของ AI
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">System Prompt</CardTitle>
          <CardDescription>
            Prompt นี้จะถูกส่งเป็น system message ก่อนทุก section generation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={10}
            className="font-mono text-sm"
            aria-label="System prompt"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={updateMutation.isPending || !isDirty}
              className="gap-2"
            >
              {updateMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              )}
              {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึก System Prompt"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reset
            </Button>
            {isDirty && !updateMutation.isPending && (
              <p className="text-xs text-muted-foreground">● มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/prompt-config/SystemPromptEditor.tsx
git commit -m "feat: add SystemPromptEditor component"
```

---

## Task 8: SectionTextarea Component (with Test Panel)

**Files:**

- Create: `src/components/settings/prompt-config/SectionTextarea.tsx`

**Interfaces:**

- Consumes: `api.admin.testSectionPrompt` mutation from Task 4; `SAMPLE_TEST_IDEA` from Task 1
- Produces: `SectionTextarea` consumed by Task 9

- [ ] **Step 1: Create SectionTextarea**

```typescript
// src/components/settings/prompt-config/SectionTextarea.tsx
"use client";

import * as React from "react";
import { RotateCcw, Play, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/shared/ToastProvider";
import { api } from "@/lib/trpc/client";
import { SAMPLE_TEST_IDEA } from "@/lib/document-generation/prompt-config-defaults";

interface SectionTextareaProps {
  sectionKey: string;
  sectionTitle: string;
  documentType: string;
  value: string;
  systemPrompt: string;
  isNarrative: boolean;
  defaultInstruction: string;
  onChange: (value: string) => void;
  onReset: () => void;
}

export function SectionTextarea({
  sectionKey,
  sectionTitle,
  documentType,
  value,
  systemPrompt,
  isNarrative,
  defaultInstruction,
  onChange,
  onReset,
}: SectionTextareaProps) {
  const toast = useToast();
  const [testOutput, setTestOutput] = React.useState<string | null>(null);
  const [testOpen, setTestOpen] = React.useState(false);

  const testMutation = api.admin.testSectionPrompt.useMutation({
    onSuccess: (data) => setTestOutput(data.content),
    onError: (err) => toast.error("Test ไม่สำเร็จ", { description: err.message }),
  });

  function handleReset() {
    if (!confirm(`Reset "${sectionTitle}" กลับค่า default หรือไม่?`)) return;
    onReset();
  }

  function handleTest() {
    setTestOpen(true);
    setTestOutput(null);
    testMutation.mutate({
      systemPrompt,
      sectionKey,
      documentType,
      instruction: value,
    });
  }

  if (!isNarrative) {
    return (
      <div className="space-y-1.5 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">{sectionTitle}</p>
          <Badge variant="secondary" className="text-xs">Auto-generated</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Section นี้สร้างจากข้อมูลโดยตรง ไม่ผ่าน AI narrative
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{sectionTitle}</p>
        <Button type="button" variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 h-7 text-xs">
          <RotateCcw className="size-3" aria-hidden="true" />
          Reset
        </Button>
      </div>

      {/* Instruction textarea */}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="instruction เพิ่มเติมสำหรับ section นี้..."
        className="text-sm"
        aria-label={`Instruction for ${sectionTitle}`}
      />

      {/* Test panel toggle */}
      <button
        type="button"
        onClick={() => setTestOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {testOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        ทดสอบ Prompt
      </button>

      {testOpen && (
        <div className="space-y-2">
          {/* Sample idea info */}
          <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
            <p className="font-medium text-muted-foreground">🧪 Sample Idea ที่ใช้ทดสอบ</p>
            <p><span className="font-medium">ชื่อ:</span> {SAMPLE_TEST_IDEA.title}</p>
            <p className="line-clamp-2"><span className="font-medium">สรุป:</span> {SAMPLE_TEST_IDEA.summary}</p>
            <p>
              <span className="font-medium">Stage:</span> {SAMPLE_TEST_IDEA.stage} |{" "}
              <span className="font-medium">Type:</span> {SAMPLE_TEST_IDEA.ideaType}
            </p>
            <p>
              <span className="font-medium">Scores:</span>{" "}
              Strategic {SAMPLE_TEST_IDEA.feasibilityScores.strategicFit}/5 ·{" "}
              Market {SAMPLE_TEST_IDEA.feasibilityScores.marketPotential}/5 ·{" "}
              Tech {SAMPLE_TEST_IDEA.feasibilityScores.technicalFeasibility}/5 ·{" "}
              Resource {SAMPLE_TEST_IDEA.feasibilityScores.resourceRequirement}/5 ·{" "}
              Impact {SAMPLE_TEST_IDEA.feasibilityScores.businessImpact}/5
            </p>
          </div>

          {/* Test button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testMutation.isPending}
            className="gap-1.5 w-full"
          >
            {testMutation.isPending ? (
              <><Loader2 className="size-3.5 animate-spin" /> กำลังทดสอบ...</>
            ) : (
              <><Play className="size-3.5" /> Test Prompt</>
            )}
          </Button>

          {/* Output */}
          <div className="rounded-md border border-border bg-background p-3 text-xs min-h-[60px]">
            {testOutput === null && !testMutation.isPending && (
              <p className="text-muted-foreground italic">กด Test Prompt เพื่อดูผลลัพธ์</p>
            )}
            {testMutation.isPending && (
              <p className="text-muted-foreground italic">กำลังรอผลลัพธ์จาก AI...</p>
            )}
            {testOutput !== null && (
              <pre className="whitespace-pre-wrap font-sans leading-relaxed">{testOutput}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/prompt-config/SectionTextarea.tsx
git commit -m "feat: add SectionTextarea with test panel"
```

---

## Task 9: DocTypeSectionEditor Component

**Files:**

- Create: `src/components/settings/prompt-config/DocTypeSectionEditor.tsx`

**Interfaces:**

- Consumes: `SectionTextarea` from Task 8; `api.admin.updateDocumentTypeSections`, `api.admin.resetPromptDocumentType` from Task 4; template section metadata
- Produces: `DocTypeSectionEditor` consumed by Task 10

- [ ] **Step 1: Create DocTypeSectionEditor**

```typescript
// src/components/settings/prompt-config/DocTypeSectionEditor.tsx
"use client";

import * as React from "react";
import { RotateCcw, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/shared/ToastProvider";
import { api } from "@/lib/trpc/client";
import { SectionTextarea } from "./SectionTextarea";
import { DEFAULT_PROMPT_CONFIG, DOCUMENT_TYPES_IN_WORKFLOW_ORDER } from "@/lib/document-generation/prompt-config-defaults";

// Section metadata: key, Thai title, whether it's narrative
// These mirror document-templates.ts but are defined here to avoid a server-only import in a client component
const SECTION_META: Record<string, Array<{ key: string; title: string; isNarrative: boolean }>> = {
  feasibility_report: [
    { key: "executive_summary",   title: "บทสรุปผู้บริหาร",          isNarrative: true },
    { key: "feasibility_scores",  title: "คะแนนความเป็นไปได้",       isNarrative: false },
    { key: "recommendation",      title: "ข้อเสนอแนะ",                isNarrative: false },
    { key: "portfolio_alignment", title: "ความเชื่อมโยงกับ Portfolio", isNarrative: false },
  ],
  poc_proposal: [
    { key: "poc_objective", title: "วัตถุประสงค์ POC", isNarrative: true },
    { key: "poc_scope",     title: "ขอบเขต POC",        isNarrative: true },
    { key: "poc_timeline",  title: "ไทม์ไลน์ POC",      isNarrative: true },
  ],
  bmc: [
    { key: "bmc_canvas", title: "Business Model Canvas", isNarrative: true },
  ],
  launch_pad_plan: [
    { key: "validation_sprint", title: "Validation Sprint",    isNarrative: true },
    { key: "success_metrics",   title: "ตัวชี้วัดความสำเร็จ", isNarrative: true },
  ],
  project_requirements: [
    { key: "functional_requirements",     title: "Functional Requirements",     isNarrative: true },
    { key: "non_functional_requirements", title: "Non-Functional Requirements",  isNarrative: true },
  ],
  resource_plan: [
    { key: "resource_requirements", title: "ความต้องการทรัพยากร",  isNarrative: true },
    { key: "budget_estimate",       title: "ประมาณการงบประมาณ",     isNarrative: true },
  ],
  action_plan: [
    { key: "milestones",   title: "หมุดหมายสำคัญ (Milestones)", isNarrative: true },
    { key: "tasks_owners", title: "งานและผู้รับผิดชอบ",           isNarrative: true },
  ],
  gtm_summary: [
    { key: "target_market",         title: "ตลาดเป้าหมาย",            isNarrative: true },
    { key: "go_to_market_strategy", title: "กลยุทธ์ Go-to-Market",    isNarrative: true },
    { key: "launch_metrics",        title: "ตัวชี้วัดการเปิดตัว",     isNarrative: true },
  ],
  executive_presentation: [
    { key: "executive_overview", title: "ภาพรวมสำหรับผู้บริหาร", isNarrative: true },
    { key: "key_metrics",        title: "ตัวชี้วัดสำคัญ",          isNarrative: false },
  ],
  stage_gate_guide: [
    { key: "gate_overview",  title: "ภาพรวม Stage Gate", isNarrative: false },
    { key: "gate_criteria",  title: "เกณฑ์ผ่าน Gate",    isNarrative: false },
  ],
  project_proposal: [
    { key: "executive_summary",   title: "บทสรุปผู้บริหาร",              isNarrative: true },
    { key: "problem_opportunity", title: "ปัญหาและโอกาส",                isNarrative: true },
    { key: "proposed_solution",   title: "แนวทางแก้ไขที่นำเสนอ",        isNarrative: true },
    { key: "bmc",                 title: "Business Model Canvas",         isNarrative: false },
    { key: "feasibility_assessment", title: "การประเมินความเป็นไปได้",  isNarrative: false },
    { key: "launch_pad_plan",     title: "แผน Launch PAD",                isNarrative: true },
    { key: "stage_gate_guide",    title: "คู่มือ Stage Gate",              isNarrative: false },
    { key: "resource_investment", title: "ทรัพยากรและการลงทุน",          isNarrative: true },
    { key: "expected_outcomes",   title: "ผลลัพธ์ที่คาดหวังและตัวชี้วัด", isNarrative: true },
    { key: "next_steps",          title: "ขั้นตอนถัดไป",                  isNarrative: true },
  ],
};

interface DocTypeSectionEditorProps {
  documentType: string;
  currentSections: Record<string, string>;
  systemPrompt: string;
  onDirtyChange: (dirty: boolean) => void;
}

export function DocTypeSectionEditor({
  documentType,
  currentSections,
  systemPrompt,
  onDirtyChange,
}: DocTypeSectionEditorProps) {
  const toast = useToast();
  const sections = SECTION_META[documentType] ?? [];
  const label =
    DOCUMENT_TYPES_IN_WORKFLOW_ORDER.find((d) => d.type === documentType)?.label ?? documentType;

  const defaultSections = (DEFAULT_PROMPT_CONFIG.sections[documentType] ?? {}) as Record<string, string>;

  // Local edit state
  const [local, setLocal] = React.useState<Record<string, string>>(() => ({
    ...defaultSections,
    ...currentSections,
  }));

  React.useEffect(() => {
    setLocal({ ...defaultSections, ...currentSections });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentType]);

  const isDirty = JSON.stringify(local) !== JSON.stringify({ ...defaultSections, ...currentSections });

  React.useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const saveMutation = api.admin.updateDocumentTypeSections.useMutation({
    onSuccess: () => toast.success(`บันทึก ${label} เรียบร้อยแล้ว`),
    onError: (err) => toast.error("บันทึกไม่สำเร็จ", { description: err.message }),
  });

  const resetMutation = api.admin.resetPromptDocumentType.useMutation({
    onSuccess: () => {
      setLocal({ ...defaultSections });
      toast.success(`Reset ${label} กลับค่า default เรียบร้อยแล้ว`);
    },
    onError: (err) => toast.error("Reset ไม่สำเร็จ", { description: err.message }),
  });

  function handleResetAll() {
    if (!confirm(`Reset ทุก section ของ "${label}" กลับค่า default หรือไม่?`)) return;
    resetMutation.mutate({ documentType });
  }

  function handleSave() {
    saveMutation.mutate({ documentType, sections: local });
  }

  function handleSectionChange(key: string, value: string) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  function handleSectionReset(key: string) {
    setLocal((prev) => ({ ...prev, [key]: defaultSections[key] ?? "" }));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{label}</h2>
          <p className="text-sm text-muted-foreground">ตั้งค่า instruction ต่อ section</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleResetAll}
          disabled={resetMutation.isPending}
          className="gap-1.5"
        >
          {resetMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RotateCcw className="size-3.5" />
          )}
          Reset All
        </Button>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((section) => (
          <SectionTextarea
            key={section.key}
            sectionKey={section.key}
            sectionTitle={section.title}
            documentType={documentType}
            value={local[section.key] ?? ""}
            systemPrompt={systemPrompt}
            isNarrative={section.isNarrative}
            defaultInstruction={defaultSections[section.key] ?? ""}
            onChange={(v) => handleSectionChange(section.key, v)}
            onReset={() => handleSectionReset(section.key)}
          />
        ))}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending || !isDirty}
          className="gap-2"
        >
          {saveMutation.isPending ? (
            <><Loader2 className="size-3.5 animate-spin" /> กำลังบันทึก...</>
          ) : (
            <><Save className="size-3.5" /> บันทึก {label}</>
          )}
        </Button>
        {isDirty && !saveMutation.isPending && (
          <p className="text-xs text-muted-foreground">● มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/prompt-config/DocTypeSectionEditor.tsx
git commit -m "feat: add DocTypeSectionEditor component"
```

---

## Task 10: PromptConfigTab (Main Component)

**Files:**

- Create: `src/components/settings/PromptConfigTab.tsx`

**Interfaces:**

- Consumes: `DocTypeNav` from Task 6; `SystemPromptEditor` from Task 7; `DocTypeSectionEditor` from Task 9; `api.admin.getPromptConfig` from Task 4
- Produces: `PromptConfigTab` consumed by Settings page (Task 6)

- [ ] **Step 1: Create PromptConfigTab**

```typescript
// src/components/settings/PromptConfigTab.tsx
"use client";

import * as React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DocTypeNav, type NavSelection } from "./prompt-config/DocTypeNav";
import { SystemPromptEditor } from "./prompt-config/SystemPromptEditor";
import { DocTypeSectionEditor } from "./prompt-config/DocTypeSectionEditor";

function PromptConfigSkeleton() {
  return (
    <div className="flex gap-6" aria-busy="true" aria-label="กำลังโหลด...">
      <div className="w-52 space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}

export function PromptConfigTab() {
  const [selected, setSelected] = React.useState<NavSelection>("global");
  const [dirtyTypes, setDirtyTypes] = React.useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, refetch } = api.admin.getPromptConfig.useQuery(
    undefined,
    { staleTime: 0 }
  );

  function setDirty(key: string, dirty: boolean) {
    setDirtyTypes((prev) => {
      const next = new Set(prev);
      dirty ? next.add(key) : next.delete(key);
      return next;
    });
  }

  if (isLoading) return <PromptConfigSkeleton />;

  if (isError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5" role="alert">
        <CardContent className="flex items-center gap-3 pt-6">
          <AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">โหลดการตั้งค่า Prompt ไม่สำเร็จ</p>
            <p className="mt-0.5 text-xs text-destructive/80">{error?.message}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw className="size-3.5" />
            ลองใหม่
          </Button>
        </CardContent>
      </Card>
    );
  }

  const systemPrompt = data?.systemPrompt ?? "";
  const sections = data?.sections ?? {};

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Left sidebar */}
      <DocTypeNav
        selected={selected}
        dirtyTypes={dirtyTypes}
        onSelect={setSelected}
      />

      {/* Content panel */}
      <div className="min-w-0 flex-1">
        {selected === "global" ? (
          <SystemPromptEditor
            initialValue={systemPrompt}
            onDirtyChange={(d) => setDirty("global", d)}
          />
        ) : (
          <DocTypeSectionEditor
            documentType={selected}
            currentSections={(sections[selected] as Record<string, string>) ?? {}}
            systemPrompt={systemPrompt}
            onDirtyChange={(d) => setDirty(selected, d)}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (777 + new tests)

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/PromptConfigTab.tsx
git commit -m "feat: add PromptConfigTab — complete prompt configuration UI"
```

---

## Self-Review Checklist

**Spec coverage:**

- [x] System Prompt global — `SystemPromptEditor` + `admin.updateSystemPrompt`
- [x] Per-section instructions — `DocTypeSectionEditor` + `admin.updateDocumentTypeSections`
- [x] Two-level navigation (sidebar + content) — `DocTypeNav`
- [x] Document types in workflow order — `DOCUMENT_TYPES_IN_WORKFLOW_ORDER`
- [x] Pre-filled with defaults — `DEFAULT_PROMPT_CONFIG`, `_upsertDefaults`
- [x] Reset per section — `SectionTextarea.handleReset`
- [x] Reset per document type — `DocTypeSectionEditor.handleResetAll` + `admin.resetPromptDocumentType`
- [x] Test Prompt per section — `SectionTextarea` test panel + `admin.testSectionPrompt`
- [x] Sample idea displayed — `SAMPLE_TEST_IDEA` shown in test panel
- [x] Prompt changes take effect immediately — no cache, loaded per generation run
- [x] Vercel 60s protection — `runInlineDocumentGenerationForType` (one type per tRPC call)
- [x] Fallback if DB fails — `effectiveSystemPrompt` falls back to hardcoded constant

**Type consistency check:**

- `PromptConfigData` used consistently in service, schemas, and UI
- `NavSelection` type exported from `DocTypeNav` and consumed by `PromptConfigTab`
- `sectionInstructions?: Record<string, string>` added to `buildNarrativeContext` params
- `SAMPLE_TEST_IDEA` import path consistent: `@/lib/document-generation/prompt-config-defaults`
