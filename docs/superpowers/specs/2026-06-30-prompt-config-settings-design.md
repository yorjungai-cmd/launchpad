# Prompt Configuration Settings — Design Spec

**Date:** 2026-06-30  
**Status:** Approved  
**Scope:** Settings tab เพิ่มการตั้งค่า Prompt สำหรับแต่ละ section ของการสร้างเอกสาร Proposal อัตโนมัติ

---

## Overview

เพิ่ม tab "Prompt Config" ใน Settings page ให้ admin ปรับแต่ง AI prompt ได้ 2 ระดับ:

1. **System Prompt กลาง** — ใช้กับทุก section ทุก document type
2. **Per-Section Instruction** — instruction เพิ่มเติมแยกต่อ section ต่อ document type

เมื่อ admin บันทึก prompt ใหม่ AI จะใช้ prompt นั้น **ทันที** ในการ generate เอกสารครั้งถัดไป (no restart required)

---

## 1. Data Model

### DB Migration

```sql
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS prompt_config JSONB DEFAULT '{}';
```

ไม่กระทบ row ที่มีอยู่ — column ใหม่มี default `'{}'`

### JSONB Shape

```typescript
interface PromptConfigJsonb {
  systemPrompt: string;
  sections: {
    [documentType: string]: {
      // e.g. "feasibility_report"
      [sectionKey: string]: string; // e.g. "executive_summary" → instruction text
    };
  };
}
```

### Default Values (Pre-filled เมื่อยังไม่มี row)

**System Prompt default** = ค่าปัจจุบันใน `DOCUMENT_NARRATIVE_SYSTEM_PROMPT` (document-narrative.ts):

```
You are a business analyst assistant for AppliCAD, a Thai software company.
Generate professional, concise narrative sections for business documents...
ALWAYS write in Thai (ภาษาไทย)...
```

**Per-Section defaults** — instruction เฉพาะแต่ละ section:

| Document Type          | Section Key                 | Default Instruction                                                                                                                                                                           |
| ---------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| feasibility_report     | executive_summary           | เขียนบทสรุปผู้บริหาร 2-3 ย่อหน้า ครอบคลุมวัตถุประสงค์หลัก ศักยภาพตลาด และข้อเสนอแนะเชิงกลยุทธ์                                                                                                |
| poc_proposal           | poc_objective               | อธิบายวัตถุประสงค์ POC อย่างชัดเจน ระบุสิ่งที่ต้องการพิสูจน์และเกณฑ์ความสำเร็จ                                                                                                                |
| poc_proposal           | poc_scope                   | กำหนดขอบเขต POC ให้ชัดเจน ระบุสิ่งที่รวมและไม่รวม และระยะเวลาที่คาดหวัง                                                                                                                       |
| poc_proposal           | poc_timeline                | สร้าง timeline POC แบบ phase-by-phase พร้อม milestone หลัก                                                                                                                                    |
| bmc                    | bmc_canvas                  | สร้าง Business Model Canvas 9 ช่อง: Customer Segments, Value Propositions, Channels, Customer Relationships, Revenue Streams, Key Resources, Key Activities, Key Partnerships, Cost Structure |
| launch_pad_plan        | validation_sprint           | ออกแบบ validation sprint 2-4 สัปดาห์ ระบุ hypothesis ที่ต้องทดสอบและ experiments                                                                                                              |
| launch_pad_plan        | success_metrics             | กำหนด OKR และตัวชี้วัดความสำเร็จที่วัดได้ชัดเจน                                                                                                                                               |
| project_requirements   | functional_requirements     | ระบุ functional requirements แบบ user story format ครอบคลุม use cases หลัก                                                                                                                    |
| project_requirements   | non_functional_requirements | ระบุ non-functional requirements ด้าน performance, security, scalability                                                                                                                      |
| resource_plan          | resource_requirements       | ระบุทรัพยากรที่ต้องการ ทั้ง human resource, infrastructure, และ tools                                                                                                                         |
| resource_plan          | budget_estimate             | ประมาณการงบประมาณแบ่งตาม category พร้อม assumption ที่ชัดเจน                                                                                                                                  |
| action_plan            | milestones                  | กำหนด milestones หลัก 3-6 จุด พร้อม deliverable และ timeline                                                                                                                                  |
| action_plan            | tasks_owners                | แบ่งงานระดับ task พร้อมผู้รับผิดชอบและ deadline                                                                                                                                               |
| gtm_summary            | target_market               | วิเคราะห์ตลาดเป้าหมาย ระบุ ICP (Ideal Customer Profile) และ market size                                                                                                                       |
| gtm_summary            | go_to_market_strategy       | กำหนดกลยุทธ์ GTM ครอบคลุม channel, messaging, และ pricing                                                                                                                                     |
| gtm_summary            | launch_metrics              | กำหนด launch metrics และ KPI ที่จะวัด 30/60/90 วันหลัง launch                                                                                                                                 |
| executive_presentation | executive_overview          | สรุปภาพรวมสำหรับผู้บริหาร กระชับ ตรงประเด็น เน้น business value                                                                                                                               |
| stage_gate_guide       | gate_criteria               | กำหนดเกณฑ์ผ่าน gate ที่วัดได้และชัดเจน                                                                                                                                                        |

---

## 2. Backend

### PromptConfigService

`src/modules/admin-ai-config/prompt-config-service.ts` — pattern เดียวกับ `AiConfigService`

```typescript
class PromptConfigService {
  async getPromptConfig(): Promise<PromptConfigData>;
  // SELECT prompt_config จาก system_settings
  // ถ้าว่าง → INSERT defaults แล้ว return

  async updateSystemPrompt(systemPrompt: string, adminId: string): Promise<PromptConfigData>;
  // load → merge systemPrompt → UPSERT + audit log

  async updateDocumentTypeSections(
    documentType: string,
    sections: Record<string, string>,
    adminId: string
  ): Promise<PromptConfigData>;
  // load → merge sections ของ type นั้น → UPSERT + audit log
  // ไม่กระทบ sections ของ doc type อื่น

  async resetDocumentType(documentType: string, adminId: string): Promise<PromptConfigData>;
  // เขียน default sections กลับสำหรับ document type นั้น + audit log
}

export const promptConfigService = new PromptConfigService();
```

### Zod Schemas (เพิ่มใน `src/modules/admin-ai-config/schemas.ts`)

```typescript
// Shape ของ prompt_config JSONB (ใช้ใน service layer)
export const promptConfigSchema = z.object({
  systemPrompt: z.string().min(1).max(8000),
  sections: z.record(z.string(), z.record(z.string(), z.string().max(2000))),
});
export type PromptConfigData = z.infer<typeof promptConfigSchema>;

// Input schemas สำหรับ tRPC mutations (แยกตาม save scope)
export const updateSystemPromptSchema = z.object({
  systemPrompt: z.string().min(1).max(8000),
});

export const updateDocumentTypeSectionsSchema = z.object({
  documentType: z.string(),
  sections: z.record(z.string(), z.string().max(2000)),
});
```

### tRPC Procedures (เพิ่มใน `src/modules/admin-ai-config/router.ts`)

| Procedure                          | Type     | Input                        | Description                       |
| ---------------------------------- | -------- | ---------------------------- | --------------------------------- |
| `admin.getPromptConfig`            | query    | —                            | โหลด prompt config ทั้งหมด        |
| `admin.updateSystemPrompt`         | mutation | `{ systemPrompt: string }`   | บันทึก system prompt กลาง         |
| `admin.updateDocumentTypeSections` | mutation | `{ documentType, sections }` | บันทึก sections ของ doc type นั้น |
| `admin.resetPromptDocumentType`    | mutation | `{ documentType: string }`   | reset doc type กลับ default       |
| `admin.testSectionPrompt`          | mutation | `TestSectionPromptInput`     | ทดสอบ prompt กับ sample idea      |

แยก 2 mutation เพื่อป้องกัน client เขียนทับ sections ของ doc type อื่นโดยไม่ตั้งใจ Service load → merge → write เองภายใน

```typescript
const updateDocumentTypeSectionsSchema = z.object({
  documentType: z.string(),
  sections: z.record(z.string(), z.string().max(2000)),
});

const testSectionPromptSchema = z.object({
  systemPrompt: z.string(),
  sectionKey: z.string(),
  documentType: z.string(),
  instruction: z.string(),
});
// returns: { content: string }
```

---

## 3. Runtime Integration

### Prompt Loading Flow (inline-generate.ts)

```
รับ ideaId + documentType
  ↓
promptConfig = await promptConfigService.getPromptConfig()
  ↓ (fallback: ถ้า DB error → ใช้ DOCUMENT_NARRATIVE_SYSTEM_PROMPT hardcoded)
callProviderTool({
  system: promptConfig.systemPrompt,
  messages: [{ role: "user", content: buildNarrativeContext({
    ...params,
    sectionInstructions: promptConfig.sections[documentType]
  })}]
})
```

### buildNarrativeContext() — เพิ่ม parameter

```typescript
export function buildNarrativeContext(params: {
  // ... existing params ...
  sectionInstructions?: Record<string, string>; // [sectionKey] → instruction
}): string {
  // existing content...

  // append ถ้ามี instructions
  if (params.sectionInstructions) {
    const relevant = params.sectionKeys
      .filter((k) => params.sectionInstructions![k])
      .map((k) => `- ${k}: ${params.sectionInstructions![k]}`)
      .join("\n");
    if (relevant) {
      return `${base}\n\nSection-specific instructions:\n${relevant}`;
    }
  }
  return base;
}
```

### Fallback Chain

1. โหลด `promptConfig` จาก DB
2. DB error → ใช้ `DOCUMENT_NARRATIVE_SYSTEM_PROMPT` hardcoded + ไม่มี per-section instruction
3. `systemPrompt` ว่าง → ใช้ hardcoded default
4. `sections[type][key]` ว่าง → ไม่ append instruction (graceful skip)

### Chunked Generation (ป้องกัน Vercel 60s timeout)

**ฟังก์ชันใหม่:** `runInlineDocumentGenerationForType(ideaId, documentType)`

- สร้างเฉพาะ 1 document type ต่อ 1 tRPC call
- แต่ละ call มี budget Claude ของตัวเอง ≤ 60s
- โหลด `promptConfig` ต่อ call (ไม่ cache — ให้ prompt ที่เพิ่งแก้มีผลทันที)

**tRPC procedure ใหม่:**

```typescript
generateDocumentTypeInline: adminProcedure
  .input(z.object({
    ideaId:       z.string().uuid(),
    documentType: documentTypeSchema,
  }))
  .mutation(...)  // maxDuration=60s
```

**Client orchestration:**

```typescript
for (const docType of DOCUMENT_TYPES_IN_WORKFLOW_ORDER) {
  await generateDocumentTypeInline({ ideaId, documentType: docType });
  updateProgress(docType); // แสดง progress ทีละ type
}
```

ฟังก์ชัน `runInlineDocumentGeneration()` เดิมคงไว้ (backward compatible) สำหรับ force regenerate ทั้งหมด

---

## 4. UI/UX

### Settings Tab เพิ่ม

```typescript
// src/app/[locale]/(app)/settings/page.tsx
type TabId = "ai-config" | "prompt-config" | "api-keys" | "users";

const TABS = [
  { id: "ai-config", label: "AI Configuration", icon: Bot },
  { id: "prompt-config", label: "Prompt Config", icon: SlidersHorizontal },
  { id: "api-keys", label: "API Keys", icon: KeyRound },
  { id: "users", label: "Users", icon: Users },
];
```

### Document Type Sidebar Order (Proposal Workflow)

| ลำดับ  | Document Type          | ชื่อไทย                  |
| ------ | ---------------------- | ------------------------ |
| Global | —                      | System Prompt กลาง       |
| 1      | feasibility_report     | รายงานความเป็นไปได้      |
| 2      | poc_proposal           | ข้อเสนอ POC              |
| 3      | bmc                    | Business Model Canvas    |
| 4      | launch_pad_plan        | แผน Launch PAD           |
| 5      | project_requirements   | ข้อกำหนดโครงการ          |
| 6      | resource_plan          | แผนทรัพยากร              |
| 7      | action_plan            | แผนปฏิบัติการ            |
| 8      | gtm_summary            | สรุปแผน Go-to-Market     |
| 9      | executive_presentation | สรุปสำหรับผู้บริหาร      |
| 10     | stage_gate_guide       | คู่มือประเมิน Stage Gate |

### Component Structure

```
src/components/settings/
  PromptConfigTab.tsx                  ← main tab, loads tRPC query
  prompt-config/
    DocTypeNav.tsx                     ← left sidebar (Global + 10 types)
    SystemPromptEditor.tsx             ← global system prompt textarea + save
    DocTypeSectionEditor.tsx           ← sections list สำหรับ doc type ที่เลือก
    SectionTextarea.tsx                ← textarea + [↺] reset + test panel
```

### Per-Section Layout

แต่ละ section แสดง:

```
┌────────────────────────────────────────────────────────────────┐
│  [ชื่อ Section ภาษาไทย]                              [↺ Reset] │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ [instruction textarea — pre-filled with default]         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌── 🧪 Sample Idea ที่ใช้ทดสอบ ──────────────────────────┐  │
│  │  ชื่อ: ระบบ AI ช่วยวิเคราะห์ใบเสนอราคา                │  │
│  │  สรุป: พัฒนา AI ช่วย BD team วิเคราะห์...              │  │
│  │  Stage: Sandbox | Type: Internal Tool                    │  │
│  │  Scores: Strategic 4/5 · Market 3/5 · Tech 4/5 · ...   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                             [▶ Test Prompt]     │
│  ┌── ผลลัพธ์ ────────────────────────────────────────────── ┐  │
│  │  (กด Test Prompt เพื่อดูผลลัพธ์)                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

- **Test ใช้ค่า unsaved** (จาก textarea ปัจจุบัน) — ทดสอบก่อน save ได้
- **ผลลัพธ์แสดง markdown rendered** ในช่อง output
- **Loading state** แสดง spinner ระหว่างรอ Claude

### UX Behaviors

| Behavior                     | Detail                                                         |
| ---------------------------- | -------------------------------------------------------------- |
| Unsaved changes              | Badge "●" ที่ sidebar item ของ doc type นั้น                   |
| Save scope                   | Save ต่อ document type (ไม่ save ทั้งหมดพร้อมกัน)              |
| Reset section [↺]            | Confirm dialog → reset section นั้นกลับ default                |
| Reset All [ปุ่มบน header]    | Confirm dialog → reset ทุก section ของ type นั้น               |
| Sections ที่ไม่ใช่ narrative | แสดงชื่อ + badge "Auto-generated" — ไม่มี textarea             |
| Test Prompt                  | เรียก `admin.testSectionPrompt` mutation → แสดงผลใน output box |

---

## 5. Sample Idea (Test Data)

```typescript
// src/lib/document-generation/sample-idea.ts
export const SAMPLE_TEST_IDEA = {
  title: "ระบบ AI ช่วยวิเคราะห์ใบเสนอราคา",
  summary:
    "พัฒนาระบบ AI ที่ช่วย BD team วิเคราะห์ใบเสนอราคาจากลูกค้า " +
    "เพื่อประเมินความเป็นไปได้และจัดลำดับความสำคัญของโอกาสทางธุรกิจ " +
    "ลดเวลาวิเคราะห์จาก 2 ชั่วโมงเหลือ 15 นาทีต่อใบ",
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
};
```

---

## 6. Files to Create / Modify

### New Files

| Path                                                             | Description                  |
| ---------------------------------------------------------------- | ---------------------------- |
| `src/modules/admin-ai-config/prompt-config-service.ts`           | PromptConfigService          |
| `src/lib/document-generation/sample-idea.ts`                     | SAMPLE_TEST_IDEA             |
| `src/components/settings/PromptConfigTab.tsx`                    | Main tab component           |
| `src/components/settings/prompt-config/DocTypeNav.tsx`           | Left sidebar                 |
| `src/components/settings/prompt-config/SystemPromptEditor.tsx`   | Global prompt editor         |
| `src/components/settings/prompt-config/DocTypeSectionEditor.tsx` | Section list                 |
| `src/components/settings/prompt-config/SectionTextarea.tsx`      | Single section editor + test |
| `supabase/migrations/YYYYMMDD_add_prompt_config.sql`             | DB migration                 |

### Modified Files

| Path                                             | Change                                                   |
| ------------------------------------------------ | -------------------------------------------------------- |
| `src/modules/admin-ai-config/schemas.ts`         | เพิ่ม promptConfigSchema, TestSectionPromptInput         |
| `src/modules/admin-ai-config/router.ts`          | เพิ่ม 4 tRPC procedures                                  |
| `src/lib/claude/prompts/document-narrative.ts`   | เพิ่ม sectionInstructions param ใน buildNarrativeContext |
| `src/lib/document-generation/inline-generate.ts` | โหลด promptConfig + runInlineDocumentGenerationForType   |
| `src/app/[locale]/(app)/settings/page.tsx`       | เพิ่ม tab prompt-config                                  |

---

## 7. Out of Scope

- การ version history ของ prompt (ไม่ track เวอร์ชัน)
- Export/Import prompt config เป็น JSON
- Per-user prompt config (admin-only เท่านั้น)
- Real-time collaborative editing
