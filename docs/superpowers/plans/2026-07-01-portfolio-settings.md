# Product Portfolio Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to add, edit, and remove products in Settings; these products drive the AI analysis portfolio-match section instead of being hardcoded.

**Architecture:** Add `portfolio_config` JSONB column to `system_settings` (same pattern as `ai_config`/`prompt_config`). A new `PortfolioConfigService` + 2 tRPC procedures expose it. The analysis prompt layer (`portfolio-context.ts`, `analysis-system-prompt.ts`, `analysis-tool-definition.ts`, `prompt-builder.ts`) is refactored from static exports to functions that accept a products array. `inline-worker.ts` fetches the products at analysis time and passes them through.

**Tech Stack:** TypeScript, Next.js 14 (App Router), tRPC v11, Zod, Supabase (Postgres JSONB), Vitest, Tailwind CSS, shadcn/ui, lucide-react.

## Global Constraints

- All tRPC procedures that write are guarded with `roleProcedure('admin')` — never use `publicProcedure` or `protectedProcedure`.
- Service files follow the `AiConfigService` class pattern: class + singleton export, `createAdminSupabaseClient()`, `AppError.internal()`, Pino logger.
- No new DB tables — `portfolio_config` column is added to the existing `system_settings` table.
- No changes to `ai_analyses` table schema — `portfolio_matches` is already untyped JSONB (snapshot approach).
- Product `id` field must be a non-empty slug with no spaces (enforced by Zod).
- Run `pnpm typecheck` and `pnpm test` after each task to catch breakage early.
- Migration filename: `20260701000001_add_portfolio_config.sql` (follows `20260630000001_add_prompt_config.sql`).

---

## File Map

| File                                                          | Action                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260701000001_add_portfolio_config.sql` | Create — DB migration                                                                             |
| `src/lib/supabase/types.ts`                                   | Modify — add `portfolio_config` column to `system_settings` Row/Insert/Update                     |
| `src/modules/admin-ai-config/schemas.ts`                      | Modify — add `ProductSchema`, `Product`, `UpdatePortfolioConfigSchema`, `PortfolioConfigData`     |
| `src/modules/admin-ai-config/portfolio-config-service.ts`     | Create — service class                                                                            |
| `src/modules/admin-ai-config/router.ts`                       | Modify — add `getPortfolioConfig`, `updatePortfolioConfig` procedures                             |
| `src/lib/claude/prompts/portfolio-context.ts`                 | Modify — `formatPortfolioContext()` accepts `products: Product[]`                                 |
| `src/lib/claude/prompts/analysis-system-prompt.ts`            | Modify — `ANALYSIS_SYSTEM_PROMPT` constant → `buildAnalysisSystemPrompt(products)` function       |
| `src/lib/claude/prompts/analysis-tool-definition.ts`          | Modify — `ANALYSIS_TOOL_DEFINITION` constant → `buildAnalysisToolDefinition(productIds)` function |
| `src/lib/claude/prompt-builder.ts`                            | Modify — `buildAnalysisPrompt(idea, products)` signature                                          |
| `src/modules/ai-analysis/schemas.ts`                          | Modify — `PortfolioMatchSchema.product` enum → `z.string().min(1)`                                |
| `src/components/ai-analysis/PortfolioMatchCards.tsx`          | Modify — `PortfolioMatch.product` union → `string`                                                |
| `src/lib/claude/inline-worker.ts`                             | Modify — fetch `portfolio_config` at analysis time                                                |
| `tests/unit/ai-analysis/prompt-builder.test.ts`               | Modify — update to new function signatures                                                        |
| `src/components/settings/PortfolioTab.tsx`                    | Create — new settings tab component                                                               |
| `src/app/[locale]/(app)/settings/page.tsx`                    | Modify — add portfolio tab                                                                        |
| `tests/unit/admin-ai-config/portfolio-config-service.test.ts` | Create — service unit tests                                                                       |

---

### Task 1: DB Migration + Supabase Types

**Files:**

- Create: `supabase/migrations/20260701000001_add_portfolio_config.sql`
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**

- Produces: `portfolio_config` column in `system_settings` table; TypeScript types updated

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260701000001_add_portfolio_config.sql

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS portfolio_config jsonb NOT NULL DEFAULT '{"products":[]}';

UPDATE system_settings
  SET portfolio_config = jsonb_build_object(
    'products',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'PTCAD',
        'name', 'PTCAD AI',
        'category', 'CAD / Engineering Software',
        'description', 'ซอฟต์แวร์ออกแบบ CAD สำหรับงานอุตสาหกรรมการผลิต (production manufacturing) ช่วยวิศวกรและนักออกแบบสร้าง 2D/3D model, ทำ BOM, และจัดการ drawing อย่างมืออาชีพ เหมาะกับโรงงาน SME ถึงขนาดกลางในภาคการผลิตของไทยและ ASEAN',
        'targetUsers', 'วิศวกรออกแบบ, ทีม R&D, โรงงานการผลิต, ผู้รับเหมาในอุตสาหกรรม'
      ),
      jsonb_build_object(
        'id', 'APP.AI',
        'name', 'APP.AI',
        'category', 'AI Platform / No-Code / Low-Code',
        'description', 'แพลตฟอร์ม AI สำหรับสร้าง business application แบบ no-code/low-code ให้องค์กรสร้าง AI-powered workflow, chatbot, document processing, และ data pipeline โดยไม่ต้องมี developer เต็มรูปแบบ มุ่งเน้น SME และ enterprise ในไทยที่ต้องการ digital transformation',
        'targetUsers', 'Business users, ทีม IT องค์กร, SME ที่ต้องการ automation'
      ),
      jsonb_build_object(
        'id', 'COBO',
        'name', 'COBO',
        'category', 'ERP / Accounting / Business Management',
        'description', 'ระบบ ERP และบัญชีสำหรับธุรกิจไทย ครอบคลุม accounting, inventory, procurement, HR/payroll, และ financial reporting รองรับมาตรฐานบัญชีไทย (TAS) และภาษีมูลค่าเพิ่ม (VAT) เหมาะกับ SME ไทยที่ต้องการระบบบัญชีครบวงจรราคาที่เข้าถึงได้',
        'targetUsers', 'นักบัญชี, ทีม Finance, ผู้บริหาร SME, ธุรกิจการค้าและบริการ'
      ),
      jsonb_build_object(
        'id', 'CRM',
        'name', 'CRM',
        'category', 'CRM / Sales / Customer Success',
        'description', 'ระบบ CRM สำหรับจัดการลูกค้า, pipeline การขาย, และ customer success ช่วยทีมขายและ BD ติดตาม lead, จัดการ deal, บันทึก interaction history, และวิเคราะห์ performance การขาย รองรับทั้ง B2B และ B2C สำหรับธุรกิจไทย',
        'targetUsers', 'ทีมขาย, Account Manager, BD Team, Customer Success'
      )
    )
  );
```

- [ ] **Step 2: Apply the migration**

```bash
cd "launchpad-portal" && supabase db push
```

Expected: Migration applies without error. Verify: `supabase db diff` shows no pending changes.

- [ ] **Step 3: Update `src/lib/supabase/types.ts` — add `portfolio_config` to `system_settings`**

In `src/lib/supabase/types.ts`, find the `system_settings` block (around line 232) and add `portfolio_config` to Row, Insert, and Update:

```typescript
// Row (add after prompt_config line):
portfolio_config: Record<string, unknown>;

// Insert (add after prompt_config line):
portfolio_config?: Record<string, unknown>;

// Update (add after prompt_config line):
portfolio_config?: Record<string, unknown>;
```

- [ ] **Step 4: Run typecheck**

```bash
cd "launchpad-portal" && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260701000001_add_portfolio_config.sql src/lib/supabase/types.ts
git commit -m "feat: add portfolio_config column to system_settings"
```

---

### Task 2: Admin Schemas — Product Type + Zod

**Files:**

- Modify: `src/modules/admin-ai-config/schemas.ts`

**Interfaces:**

- Produces: `ProductSchema`, `Product` type, `UpdatePortfolioConfigSchema`, `UpdatePortfolioConfigInput`, `PortfolioConfigData` — all consumed by Tasks 3, 4, 5, 7, 8

- [ ] **Step 1: Write a failing test for the schema**

Create `tests/unit/admin-ai-config/portfolio-config-schemas.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ProductSchema, UpdatePortfolioConfigSchema } from "@/modules/admin-ai-config/schemas";

describe("ProductSchema", () => {
  it("accepts a valid product", () => {
    const result = ProductSchema.safeParse({
      id: "PTCAD",
      name: "PTCAD AI",
      category: "CAD",
      description: "A CAD tool",
      targetUsers: "Engineers",
    });
    expect(result.success).toBe(true);
  });

  it("rejects id with spaces", () => {
    const result = ProductSchema.safeParse({
      id: "MY PRODUCT",
      name: "My Product",
      category: "Cat",
      description: "desc",
      targetUsers: "users",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/spaces/i);
  });

  it("rejects empty id", () => {
    const result = ProductSchema.safeParse({
      id: "",
      name: "X",
      category: "C",
      description: "d",
      targetUsers: "u",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdatePortfolioConfigSchema", () => {
  const validProduct = {
    id: "PTCAD",
    name: "PTCAD AI",
    category: "CAD",
    description: "A CAD tool",
    targetUsers: "Engineers",
  };

  it("accepts an empty products array", () => {
    const result = UpdatePortfolioConfigSchema.safeParse({ products: [] });
    expect(result.success).toBe(true);
  });

  it("accepts an array of valid products", () => {
    const result = UpdatePortfolioConfigSchema.safeParse({
      products: [validProduct, { ...validProduct, id: "APP.AI", name: "APP.AI" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate ids", () => {
    const result = UpdatePortfolioConfigSchema.safeParse({
      products: [validProduct, validProduct],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/unique/i);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd "launchpad-portal" && pnpm test tests/unit/admin-ai-config/portfolio-config-schemas.test.ts
```

Expected: FAIL — `ProductSchema` and `UpdatePortfolioConfigSchema` are not exported yet.

- [ ] **Step 3: Add schemas to `src/modules/admin-ai-config/schemas.ts`**

Append after the last existing schema (after `DeleteApiKeySchema`), before the closing of the file:

```typescript
// ─── Zod: Portfolio Config ─────────────────────────────────────────────────────

export const ProductSchema = z.object({
  id: z.string().min(1).regex(/^\S+$/, "Product ID must not contain spaces"),
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  description: z.string().min(1),
  targetUsers: z.string().min(1),
});

export type Product = z.infer<typeof ProductSchema>;

export const UpdatePortfolioConfigSchema = z
  .object({
    products: z.array(ProductSchema),
  })
  .superRefine((data, ctx) => {
    const ids = data.products.map((p) => p.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Product ID must be unique",
        path: ["products"],
      });
    }
  });

export type UpdatePortfolioConfigInput = z.infer<typeof UpdatePortfolioConfigSchema>;

export interface PortfolioConfigData {
  products: Product[];
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd "launchpad-portal" && pnpm test tests/unit/admin-ai-config/portfolio-config-schemas.test.ts
```

Expected: PASS (3 describe blocks, all green).

- [ ] **Step 5: Run typecheck**

```bash
cd "launchpad-portal" && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/admin-ai-config/schemas.ts tests/unit/admin-ai-config/portfolio-config-schemas.test.ts
git commit -m "feat: add Product schema and PortfolioConfig types"
```

---

### Task 3: PortfolioConfigService + Tests

**Files:**

- Create: `src/modules/admin-ai-config/portfolio-config-service.ts`
- Create: `tests/unit/admin-ai-config/portfolio-config-service.test.ts`

**Interfaces:**

- Consumes: `Product`, `PortfolioConfigData`, `UpdatePortfolioConfigInput` from `schemas.ts`; `AppError` from `@/lib/errors/AppError`; `adminAuditLogService` from `./audit-log-service`; `createAdminSupabaseClient` from `@/lib/supabase/server`
- Produces: `portfolioConfigService.getPortfolioConfig(): Promise<PortfolioConfigData>` and `portfolioConfigService.updatePortfolioConfig(input, adminId): Promise<PortfolioConfigData>` — consumed by Task 4

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/admin-ai-config/portfolio-config-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/modules/admin-ai-config/audit-log-service", () => ({
  adminAuditLogService: { log: mockAuditLog },
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

const queryChain = {
  select: mockSelect,
  limit: mockLimit,
  maybeSingle: mockMaybeSingle,
  single: mockSingle,
  update: mockUpdate,
  eq: mockEq,
};

mockSelect.mockReturnValue(queryChain);
mockLimit.mockReturnValue(queryChain);
mockUpdate.mockReturnValue(queryChain);
mockEq.mockReturnValue(queryChain);

const mockFrom = vi.fn().mockReturnValue(queryChain);
const mockAdminClient = { from: mockFrom };

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabaseClient: vi.fn(() => mockAdminClient),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { PortfolioConfigService } from "@/modules/admin-ai-config/portfolio-config-service";
import type { Product } from "@/modules/admin-ai-config/schemas";

const SAMPLE_PRODUCTS: Product[] = [
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
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PortfolioConfigService.getPortfolioConfig()", () => {
  let service: PortfolioConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(queryChain);
    mockLimit.mockReturnValue(queryChain);
    service = new PortfolioConfigService();
  });

  it("returns products from DB when row exists", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "row-1", portfolio_config: { products: SAMPLE_PRODUCTS } },
      error: null,
    });

    const result = await service.getPortfolioConfig();
    expect(result.products).toEqual(SAMPLE_PRODUCTS);
  });

  it("returns empty products when no DB row exists", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await service.getPortfolioConfig();
    expect(result.products).toEqual([]);
  });

  it("throws AppError.internal on DB error", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "connection refused" },
    });

    await expect(service.getPortfolioConfig()).rejects.toMatchObject({
      message: expect.stringContaining("Failed to read portfolio"),
    });
  });
});

describe("PortfolioConfigService.updatePortfolioConfig()", () => {
  let service: PortfolioConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue(queryChain);
    mockLimit.mockReturnValue(queryChain);
    mockUpdate.mockReturnValue(queryChain);
    mockEq.mockReturnValue(queryChain);
    service = new PortfolioConfigService();
  });

  it("updates products and calls audit log", async () => {
    // First call: SELECT to get row id
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "row-1" }, error: null });
    // Second call: UPDATE result
    mockEq.mockResolvedValueOnce({ error: null });

    await service.updatePortfolioConfig({ products: SAMPLE_PRODUCTS }, "admin-uuid");

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "portfolio_config_updated",
        adminId: "admin-uuid",
        targetType: "portfolio_config",
      })
    );
  });

  it("throws AppError.internal when no settings row found", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      service.updatePortfolioConfig({ products: SAMPLE_PRODUCTS }, "admin-uuid")
    ).rejects.toMatchObject({ message: expect.stringContaining("not found") });
  });

  it("throws AppError.internal on DB update error", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "row-1" }, error: null });
    mockEq.mockResolvedValueOnce({ error: { message: "db error" } });

    await expect(
      service.updatePortfolioConfig({ products: SAMPLE_PRODUCTS }, "admin-uuid")
    ).rejects.toMatchObject({ message: expect.stringContaining("Failed to update") });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "launchpad-portal" && pnpm test tests/unit/admin-ai-config/portfolio-config-service.test.ts
```

Expected: FAIL — `PortfolioConfigService` does not exist.

- [ ] **Step 3: Create `src/modules/admin-ai-config/portfolio-config-service.ts`**

```typescript
import { AppError } from "@/lib/errors/AppError";
import logger from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { adminAuditLogService } from "./audit-log-service";
import type { Product, PortfolioConfigData, UpdatePortfolioConfigInput } from "./schemas";

const DEFAULT_PORTFOLIO_CONFIG: PortfolioConfigData = { products: [] };

interface SystemSettingsPortfolioRow {
  id: string;
  portfolio_config: { products: Product[] };
}

export class PortfolioConfigService {
  async getPortfolioConfig(): Promise<PortfolioConfigData> {
    const db = createAdminSupabaseClient();

    const { data, error } = await db
      .from("system_settings")
      .select("id, portfolio_config")
      .limit(1)
      .maybeSingle<SystemSettingsPortfolioRow>();

    if (error) {
      logger.error({ err: error }, "PortfolioConfigService.getPortfolioConfig: DB SELECT error");
      throw AppError.internal("Failed to read portfolio configuration");
    }

    if (data === null) return DEFAULT_PORTFOLIO_CONFIG;

    return { products: data.portfolio_config?.products ?? [] };
  }

  async updatePortfolioConfig(
    input: UpdatePortfolioConfigInput,
    adminId: string
  ): Promise<PortfolioConfigData> {
    const db = createAdminSupabaseClient();

    const { data: existing, error: fetchErr } = await db
      .from("system_settings")
      .select("id")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (fetchErr) {
      logger.error({ err: fetchErr }, "PortfolioConfigService.updatePortfolioConfig: SELECT error");
      throw AppError.internal("Failed to read settings for update");
    }

    if (existing === null) {
      throw AppError.internal("System settings row not found — run DB migration first");
    }

    const newConfig = { products: input.products };

    const { error: updateErr } = await db
      .from("system_settings")
      .update({ portfolio_config: newConfig, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (updateErr) {
      logger.error(
        { err: updateErr },
        "PortfolioConfigService.updatePortfolioConfig: UPDATE error"
      );
      throw AppError.internal("Failed to update portfolio configuration");
    }

    await adminAuditLogService.log({
      action: "portfolio_config_updated",
      adminId,
      targetType: "portfolio_config",
      targetId: existing.id,
      metadata: { product_count: String(input.products.length) },
    });

    return newConfig;
  }
}

export const portfolioConfigService = new PortfolioConfigService();
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "launchpad-portal" && pnpm test tests/unit/admin-ai-config/portfolio-config-service.test.ts
```

Expected: PASS (all 6 tests green).

- [ ] **Step 5: Run typecheck**

```bash
cd "launchpad-portal" && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/admin-ai-config/portfolio-config-service.ts tests/unit/admin-ai-config/portfolio-config-service.test.ts tests/unit/admin-ai-config/portfolio-config-schemas.test.ts
git commit -m "feat: add PortfolioConfigService with getPortfolioConfig and updatePortfolioConfig"
```

---

### Task 4: tRPC Router — Add Portfolio Procedures

**Files:**

- Modify: `src/modules/admin-ai-config/router.ts`

**Interfaces:**

- Consumes: `portfolioConfigService` from `./portfolio-config-service`; `UpdatePortfolioConfigSchema` from `./schemas`
- Produces: `admin.getPortfolioConfig` query, `admin.updatePortfolioConfig` mutation — consumed by Task 8 (UI)

- [ ] **Step 1: Add imports to `src/modules/admin-ai-config/router.ts`**

After the existing import block (after the `SAMPLE_TEST_IDEA` import line), add:

```typescript
import { portfolioConfigService } from "./portfolio-config-service";
import { UpdatePortfolioConfigSchema } from "./schemas";
```

Note: `UpdatePortfolioConfigSchema` is already imported from `./schemas` if it was added in Task 2. If the schemas import line already exists, just add `UpdatePortfolioConfigSchema` to the named import list.

- [ ] **Step 2: Add procedures to the router object in `src/modules/admin-ai-config/router.ts`**

Inside the `router({...})` call, after the `updateAiConfig` procedure block, add:

```typescript
  // ─── Portfolio Config ──────────────────────────────────────────────────────

  /**
   * admin.getPortfolioConfig
   *
   * Returns current product portfolio configuration from system_settings.
   *
   * Role: admin only
   * Input: none
   * Output: PortfolioConfigData ({ products: Product[] })
   */
  getPortfolioConfig: roleProcedure("admin").query(async () => {
    return portfolioConfigService.getPortfolioConfig();
  }),

  /**
   * admin.updatePortfolioConfig
   *
   * Replaces the full products array in system_settings.portfolio_config.
   *
   * Role: admin only
   * Input: UpdatePortfolioConfigSchema ({ products: Product[] })
   * Output: PortfolioConfigData
   * Errors: BAD_REQUEST (duplicate ids, invalid fields — caught by Zod before service)
   */
  updatePortfolioConfig: roleProcedure("admin")
    .input(UpdatePortfolioConfigSchema)
    .mutation(async ({ input, ctx }) => {
      const adminId = ctx.user.id;
      return portfolioConfigService.updatePortfolioConfig(input, adminId);
    }),
```

- [ ] **Step 3: Run typecheck**

```bash
cd "launchpad-portal" && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Run full test suite**

```bash
cd "launchpad-portal" && pnpm test
```

Expected: All previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin-ai-config/router.ts
git commit -m "feat: add getPortfolioConfig and updatePortfolioConfig tRPC procedures"
```

---

### Task 5: Analysis Prompt Layer — Make Portfolio Dynamic

This task refactors 6 files so the analysis engine reads products from DB instead of hardcoded constants. It also fixes the two downstream type references.

**Files:**

- Modify: `src/lib/claude/prompts/portfolio-context.ts`
- Modify: `src/lib/claude/prompts/analysis-system-prompt.ts`
- Modify: `src/lib/claude/prompts/analysis-tool-definition.ts`
- Modify: `src/lib/claude/prompt-builder.ts`
- Modify: `src/modules/ai-analysis/schemas.ts`
- Modify: `src/components/ai-analysis/PortfolioMatchCards.tsx`

**Interfaces:**

- Consumes: `Product` from `@/modules/admin-ai-config/schemas`
- Produces:
  - `formatPortfolioContext(products: Product[]): string`
  - `buildAnalysisSystemPrompt(products: Product[]): string`
  - `buildAnalysisToolDefinition(productIds: string[]): { name: "analyze_idea", description: string, input_schema: object }`
  - `buildAnalysisPrompt(idea: IdeaContent, products: Product[]): ClaudeMessageParams`
  - `PortfolioMatch.product: string` (was a union type)

- [ ] **Step 1: Update `src/lib/claude/prompts/portfolio-context.ts`**

Replace the entire file content with:

```typescript
import type { Product } from "@/modules/admin-ai-config/schemas";

export function formatPortfolioContext(products: Product[]): string {
  if (products.length === 0) {
    return "No portfolio products are currently configured.";
  }
  return products
    .map(
      (p) =>
        `**${p.name}** (ID: ${p.id})\n` +
        `Category: ${p.category}\n` +
        `Description: ${p.description}\n` +
        `Target Users: ${p.targetUsers}`
    )
    .join("\n\n");
}
```

- [ ] **Step 2: Update `src/lib/claude/prompts/analysis-system-prompt.ts`**

Replace the entire file with a function instead of a constant. Keep all prompt text identical except change "include ALL 4 products" to "include ALL products" (line 88 of the original):

```typescript
import { formatPortfolioContext } from "./portfolio-context";
import type { Product } from "@/modules/admin-ai-config/schemas";

export function buildAnalysisSystemPrompt(products: Product[]): string {
  const portfolioContext = formatPortfolioContext(products);

  return `You are an expert business development analyst for AppliCAD, a Thai technology company. Your role is to analyze business ideas submitted to the LaunchPad Portal and provide structured evaluations using the Launch PAD 2.0 framework.

## Language Instructions / คำแนะนำภาษา

- If the idea is submitted in Thai (ภาษาไทย): respond with all text fields (summary, reasoning, etc.) in Thai
- If the idea is submitted in English: respond with all text fields in English
- If mixed: use the dominant language of the idea content
- Always use the 'analyze_idea' tool to return your structured analysis

## AppliCAD Product Portfolio / พอร์ตโฟลิโอผลิตภัณฑ์ AppliCAD

Use these product descriptions to determine how relevant each idea is to our portfolio:

${portfolioContext}

## Launch PAD 2.0 Stage Definitions / คำนิยาม Stage

**Sandbox**: แนวคิดเริ่มต้นที่ยังไม่ผ่านการ validate — ยังต้องการ research และ exploration มาก
**Validation Sprint**: แนวคิดที่มีความชัดเจนพอที่จะทำ rapid validation ด้วย MVP หรือ prototype ใน 2–4 สัปดาห์
**Build Sprint**: แนวคิดที่ผ่าน validation แล้ว พร้อม build เป็น full product หรือ feature
**Launch & Test**: ผลิตภัณฑ์/feature ที่ ready to launch และ gather real-world feedback

## Feasibility Scoring Criteria / เกณฑ์การให้คะแนน (1–5)

**Strategic Fit (ความสอดคล้องเชิงกลยุทธ์)**
- 5: ตรงกับทิศทางหลักของ AppliCAD อย่างชัดเจน เสริมสร้าง competitive advantage
- 4: สอดคล้องดีกับกลยุทธ์ มีประโยชน์ชัดเจน
- 3: สอดคล้องพอสมควร ต้องการ alignment เพิ่มเติม
- 2: สอดคล้องน้อย อาจเบี่ยงเบนจาก core focus
- 1: ไม่สอดคล้อง หรือขัดแย้งกับทิศทางธุรกิจ

**Market Potential (ศักยภาพตลาด)**
- 5: ตลาดใหญ่มาก (TAM > 100M USD) growth สูง demand ชัดเจน
- 4: ตลาดดี มี demand ชัดเจน growth สม่ำเสมอ
- 3: ตลาดขนาดกลาง demand พอสมควร
- 2: ตลาดเล็ก หรือ niche มาก demand ไม่ชัดเจน
- 1: ตลาดไม่ชัดเจน หรือ demand ต่ำมาก

**Technical Feasibility (ความเป็นไปได้ทางเทคนิค)**
- 5: ใช้ technology ที่ team มีอยู่แล้ว implement ได้ทันที
- 4: ต้องการ skill/tech ที่ acquire ได้ง่าย risk ต่ำ
- 3: ต้องการ technology ใหม่ risk พอสมควร
- 2: ต้องการ expertise หรือ technology ที่หายาก risk สูง
- 1: ต้องการ breakthrough technology หรือ R&D ลึก

**Resource Requirement (ความต้องการทรัพยากร)**
- 5: ต้องการทรัพยากรน้อยมาก สามารถ launch ได้เร็ว
- 4: ต้องการทรัพยากรพอสมควร manageable ได้
- 3: ต้องการทรัพยากรปานกลาง ต้องวางแผนดี
- 2: ต้องการทรัพยากรมาก อาจกระทบ existing projects
- 1: ต้องการทรัพยากรสูงมาก เกินขีดความสามารถปัจจุบัน

**Business Impact (ผลกระทบต่อธุรกิจ)**
- 5: ผลกระทบสูงมาก สร้าง revenue ใหม่ หรือลด cost อย่างมีนัยสำคัญ
- 4: ผลกระทบดี สร้าง value ชัดเจนต่อธุรกิจ
- 3: ผลกระทบปานกลาง มี value แต่ไม่ dramatic
- 2: ผลกระทบน้อย incremental improvement เท่านั้น
- 1: ผลกระทบไม่ชัดเจน หรืออาจส่งผลลบ

## Recommended Action Criteria / เกณฑ์การแนะนำ

**Go**: คะแนน feasibility รวมสูง (average ≥ 3.5) และ strategic fit ≥ 3 — แนะนำให้ดำเนินการต่อ
**Conditional Go**: คะแนนรวม 2.5–3.4 หรือมีบาง dimension ที่ต้องปรับก่อน — ดำเนินการได้ถ้าแก้ไขข้อกังวลหลัก
**No Go**: คะแนนรวม < 2.5 หรือ strategic fit < 2 — ไม่แนะนำให้ดำเนินการในเวลานี้

## Important Instructions / คำแนะนำสำคัญ

1. Be objective and evidence-based in your analysis
2. Use all available information from the idea title, description, and extracted text
3. For portfolio_matches: include ALL products with their respective relevance levels (High/Medium/Low)
4. stage_confidence and idea_type_confidence should be decimal values between 0.0 and 1.0
5. All reasoning fields should be concise but informative (2–4 sentences)
6. summary should be a concise overview (≤ 200 words) in the idea's language
7. ALWAYS use the 'analyze_idea' tool — do not respond in plain text

คุณต้องวิเคราะห์อย่างเป็นกลางและอิงจากข้อมูลที่มี ใช้ข้อมูลทั้งหมดที่ได้รับมาในการประเมิน`;
}
```

- [ ] **Step 3: Update `src/lib/claude/prompts/analysis-tool-definition.ts`**

Replace `ANALYSIS_TOOL_DEFINITION` constant with a builder function. Keep `ANALYZE_IDEA_TOOL_CHOICE` static. Replace the entire file content:

```typescript
export function buildAnalysisToolDefinition(productIds: string[]) {
  const effectiveIds = productIds.length > 0 ? productIds : ["(no products configured)"];

  return {
    name: "analyze_idea" as const,
    description:
      "Analyze a business idea using the Launch PAD 2.0 framework. " +
      "Returns structured evaluation including stage classification, idea type, " +
      "feasibility scores across 5 dimensions, portfolio match analysis, and recommended action. " +
      "วิเคราะห์ idea ทางธุรกิจโดยใช้ Launch PAD 2.0 framework และส่งคืนผลการประเมินแบบ structured.",
    input_schema: {
      type: "object" as const,
      required: [
        "summary",
        "stage",
        "stage_confidence",
        "stage_reasoning",
        "idea_type",
        "idea_type_confidence",
        "portfolio_matches",
        "feasibility",
        "recommended_action",
        "recommended_action_reasoning",
      ],
      properties: {
        summary: {
          type: "string",
          maxLength: 2000,
          description:
            "Concise summary of the idea content (≤ 200 words). Write in the same language as the idea (Thai or English).",
        },
        stage: {
          type: "string",
          enum: ["Sandbox", "Validation Sprint", "Build Sprint", "Launch & Test"],
          description: "Classified Launch PAD 2.0 stage for this idea.",
        },
        stage_confidence: {
          type: "number",
          minimum: 0.0,
          maximum: 1.0,
          description:
            "Confidence level for the stage classification (0.0 = very uncertain, 1.0 = very confident).",
        },
        stage_reasoning: {
          type: "string",
          description:
            "Explanation for why this stage was assigned (2–4 sentences). Same language as idea.",
        },
        idea_type: {
          type: "string",
          enum: ["SaaS", "SI", "Hardware", "Platform", "Internal Tool", "Partnership"],
          description: "Classified idea/project type.",
        },
        idea_type_confidence: {
          type: "number",
          minimum: 0.0,
          maximum: 1.0,
          description: "Confidence level for the idea type classification.",
        },
        portfolio_matches: {
          type: "array",
          description: "Relevance of this idea to each AppliCAD product. Include ALL products.",
          items: {
            type: "object",
            required: ["product", "relevance", "reasoning"],
            properties: {
              product: {
                type: "string",
                enum: effectiveIds,
                description: "AppliCAD product ID.",
              },
              relevance: {
                type: "string",
                enum: ["High", "Medium", "Low"],
                description: "Relevance level to this product.",
              },
              reasoning: {
                type: "string",
                description: "Brief explanation of why this product is relevant (1–2 sentences).",
              },
            },
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: Math.max(1, effectiveIds.length),
        },
        feasibility: {
          type: "object",
          description: "5-dimension feasibility evaluation using 1–5 scoring scale.",
          required: [
            "strategic_fit",
            "market_potential",
            "technical_feasibility",
            "resource_requirement",
            "business_impact",
          ],
          properties: {
            strategic_fit: {
              type: "object",
              required: ["score", "reasoning"],
              properties: {
                score: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Strategic alignment score (1=poor, 5=excellent).",
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the strategic fit score.",
                },
              },
              additionalProperties: false,
            },
            market_potential: {
              type: "object",
              required: ["score", "reasoning"],
              properties: {
                score: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Market potential score (1=very small, 5=very large).",
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the market potential score.",
                },
              },
              additionalProperties: false,
            },
            technical_feasibility: {
              type: "object",
              required: ["score", "reasoning"],
              properties: {
                score: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Technical feasibility score (1=very hard, 5=very easy).",
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the technical feasibility score.",
                },
              },
              additionalProperties: false,
            },
            resource_requirement: {
              type: "object",
              required: ["score", "reasoning"],
              properties: {
                score: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Resource requirement score (1=very heavy, 5=very light).",
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the resource requirement score.",
                },
              },
              additionalProperties: false,
            },
            business_impact: {
              type: "object",
              required: ["score", "reasoning"],
              properties: {
                score: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Business impact score (1=minimal, 5=transformational).",
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the business impact score.",
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        recommended_action: {
          type: "string",
          enum: ["Go", "Conditional Go", "No Go"],
          description: "Overall recommendation for this idea.",
        },
        recommended_action_reasoning: {
          type: "string",
          description:
            "Explanation for the recommended action (2–4 sentences). Same language as idea.",
        },
      },
      additionalProperties: false,
    },
  };
}

export const ANALYZE_IDEA_TOOL_CHOICE = {
  type: "tool" as const,
  name: "analyze_idea" as const,
};
```

- [ ] **Step 4: Update `src/lib/claude/prompt-builder.ts`**

Replace the entire file:

```typescript
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
```

- [ ] **Step 5: Update `src/modules/ai-analysis/schemas.ts` — relax product enum**

On line 34, change:

```typescript
// Before:
  product: z.enum(["PTCAD", "APP.AI", "COBO", "CRM"]),

// After:
  product: z.string().min(1),
```

- [ ] **Step 6: Update `src/components/ai-analysis/PortfolioMatchCards.tsx` — relax product type**

On line 27, change:

```typescript
// Before:
export interface PortfolioMatch {
  product: "PTCAD" | "APP.AI" | "COBO" | "CRM";

// After:
export interface PortfolioMatch {
  product: string;
```

- [ ] **Step 7: Run typecheck**

```bash
cd "launchpad-portal" && pnpm typecheck
```

Expected: 0 errors. If errors appear in `prompt-builder.test.ts`, that's expected — the test update is in Task 6.

- [ ] **Step 8: Commit**

```bash
git add \
  src/lib/claude/prompts/portfolio-context.ts \
  src/lib/claude/prompts/analysis-system-prompt.ts \
  src/lib/claude/prompts/analysis-tool-definition.ts \
  src/lib/claude/prompt-builder.ts \
  src/modules/ai-analysis/schemas.ts \
  src/components/ai-analysis/PortfolioMatchCards.tsx
git commit -m "feat: make analysis prompt layer dynamic — accept products array"
```

---

### Task 6: Update Prompt-Builder Tests

**Files:**

- Modify: `tests/unit/ai-analysis/prompt-builder.test.ts`

**Interfaces:**

- Consumes: `buildAnalysisPrompt(idea, products)`, `buildAnalysisSystemPrompt(products)`, `buildAnalysisToolDefinition(ids)`, `Product` type

- [ ] **Step 1: Run existing prompt-builder tests — confirm they fail**

```bash
cd "launchpad-portal" && pnpm test tests/unit/ai-analysis/prompt-builder.test.ts
```

Expected: FAIL — `ANALYSIS_SYSTEM_PROMPT` and `ANALYSIS_TOOL_DEFINITION` no longer exported; `buildAnalysisPrompt` signature mismatch.

- [ ] **Step 2: Rewrite `tests/unit/ai-analysis/prompt-builder.test.ts`**

Replace the entire file:

```typescript
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
```

- [ ] **Step 3: Run tests — verify they pass**

```bash
cd "launchpad-portal" && pnpm test tests/unit/ai-analysis/prompt-builder.test.ts
```

Expected: PASS (all tests green).

- [ ] **Step 4: Run full test suite**

```bash
cd "launchpad-portal" && pnpm test
```

Expected: All tests pass (≥ the count before this task).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/ai-analysis/prompt-builder.test.ts
git commit -m "test: update prompt-builder tests for dynamic products signature"
```

---

### Task 7: inline-worker.ts — Fetch Portfolio Products Dynamically

**Files:**

- Modify: `src/lib/claude/inline-worker.ts`

**Interfaces:**

- Consumes: `buildAnalysisPrompt(idea, products)` from `./prompt-builder`; `buildAnalysisToolDefinition(ids)` from `./prompts/analysis-tool-definition`; `Product` from `@/modules/admin-ai-config/schemas`
- Produces: `runInlineAnalysis` fetches products from DB and passes to prompt builder

- [ ] **Step 1: Add imports at the top of `src/lib/claude/inline-worker.ts`**

After the existing imports block, add:

```typescript
import { buildAnalysisToolDefinition } from "./prompts/analysis-tool-definition";
import type { Product } from "@/modules/admin-ai-config/schemas";
```

Remove the existing import line for `ANALYSIS_TOOL_DEFINITION`:

```typescript
// Remove this line:
import { ANALYSIS_TOOL_DEFINITION } from "./prompts/analysis-tool-definition";
```

Replace it with:

```typescript
import { buildAnalysisToolDefinition } from "./prompts/analysis-tool-definition";
import type { Product } from "@/modules/admin-ai-config/schemas";
```

- [ ] **Step 2: Add `_fetchPortfolioProducts` helper function**

Add this function before `_resolveKeyInfo` (around line 209):

```typescript
async function _fetchPortfolioProducts(
  db: ReturnType<typeof createAdminSupabaseClient>
): Promise<Product[]> {
  const { data } = await db
    .from("system_settings")
    .select("portfolio_config")
    .limit(1)
    .maybeSingle();

  const config = data?.portfolio_config as { products?: Product[] } | null;
  return config?.products ?? [];
}
```

- [ ] **Step 3: Update `runInlineAnalysis` to use dynamic products**

In the `runInlineAnalysis` function, after step 3 (`const keyInfo = await _resolveKeyInfo(db)`), add the portfolio fetch:

```typescript
// 3b. Read portfolio products for analysis prompt
const products = await _fetchPortfolioProducts(db);
```

Change step 4 (build prompt) from:

```typescript
// 4. Build prompt
const promptParams = buildAnalysisPrompt({
  title: row.title,
  description: row.raw_content ?? "",
  extractedText: row.extracted_text ?? "",
  inputType: (row.input_type as "text" | "file" | "url") ?? "text",
});
```

to:

```typescript
// 4. Build prompt
const promptParams = buildAnalysisPrompt(
  {
    title: row.title,
    description: row.raw_content ?? "",
    extractedText: row.extracted_text ?? "",
    inputType: (row.input_type as "text" | "file" | "url") ?? "text",
  },
  products
);
```

Change step 5 (call provider) from using `ANALYSIS_TOOL_DEFINITION` to the dynamic builder. Find this block:

```typescript
const analysisRaw = await callProviderTool(keyInfo, {
  system: promptParams.system,
  messages: [...promptParams.messages],
  tool: ANALYSIS_TOOL_DEFINITION,
  toolName: ANALYSIS_TOOL_DEFINITION.name,
  maxTokens: 4096,
  pdfAttachment,
});
```

Replace with:

```typescript
const toolDef = buildAnalysisToolDefinition(products.map((p) => p.id));
const analysisRaw = await callProviderTool(keyInfo, {
  system: promptParams.system,
  messages: [...promptParams.messages],
  tool: toolDef,
  toolName: "analyze_idea",
  maxTokens: 4096,
  pdfAttachment,
});
```

- [ ] **Step 4: Run typecheck**

```bash
cd "launchpad-portal" && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Run full test suite**

```bash
cd "launchpad-portal" && pnpm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/claude/inline-worker.ts
git commit -m "feat: fetch portfolio products dynamically in runInlineAnalysis"
```

---

### Task 8: PortfolioTab UI Component

**Files:**

- Create: `src/components/settings/PortfolioTab.tsx`

**Interfaces:**

- Consumes: `trpc.admin.getPortfolioConfig`, `trpc.admin.updatePortfolioConfig`; `Product` type from `@/modules/admin-ai-config/schemas`
- Produces: `PortfolioTab` React component (default and named export)

- [ ] **Step 1: Create `src/components/settings/PortfolioTab.tsx`**

```typescript
"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import type { Product } from "@/modules/admin-ai-config/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  id: string;
  name: string;
  category: string;
  description: string;
  targetUsers: string;
};

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  category: "",
  description: "",
  targetUsers: "",
};

// ─── usePortfolioConfig hook ──────────────────────────────────────────────────

function usePortfolioConfig() {
  const utils = api.useUtils();
  const query = api.admin.getPortfolioConfig.useQuery();
  const mutation = api.admin.updatePortfolioConfig.useMutation({
    onSuccess: () => {
      void utils.admin.getPortfolioConfig.invalidate();
    },
  });

  function saveProducts(products: Product[]) {
    mutation.mutate({ products });
  }

  return {
    products: query.data?.products ?? [],
    isLoading: query.isLoading,
    isSaving: mutation.isPending,
    saveError: mutation.error?.message,
    saveProducts,
  };
}

// ─── ProductCard ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {product.id}
            </span>
            <span className="text-sm font-semibold text-foreground">{product.name}</span>
            <span className="text-xs text-muted-foreground">{product.category}</span>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {expanded ? "ซ่อน" : "Target Users"}
          </button>

          {expanded && (
            <p className="mt-1 text-xs text-muted-foreground">{product.targetUsers}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${product.name}`}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${product.name}`}
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DeleteConfirmation ───────────────────────────────────────────────────────

function DeleteConfirmation({
  product,
  onConfirm,
  onCancel,
}: {
  product: Product;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <p className="text-sm text-foreground">
        Remove <strong>{product.name}</strong> from portfolio? Existing analyses referencing it
        will still display the original product name.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
        >
          Confirm Delete
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── ProductForm ──────────────────────────────────────────────────────────────

function ProductForm({
  initial,
  isEdit,
  onSave,
  onCancel,
  existingIds,
}: {
  initial: FormState;
  isEdit: boolean;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  existingIds: string[];
}) {
  const [form, setForm] = React.useState<FormState>(initial);
  const [error, setError] = React.useState<string | null>(null);

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.id.trim()) { setError("Product ID is required"); return; }
    if (/\s/.test(form.id)) { setError("Product ID must not contain spaces"); return; }
    if (!isEdit && existingIds.includes(form.id)) { setError("Product ID already exists"); return; }
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.category.trim()) { setError("Category is required"); return; }
    if (!form.description.trim()) { setError("Description is required"); return; }
    if (!form.targetUsers.trim()) { setError("Target Users is required"); return; }
    onSave(form);
  }

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const labelClass = "block text-xs font-medium text-foreground mb-1";

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">{isEdit ? "Edit Product" : "Add Product"}</h3>

      <div>
        <label className={labelClass} htmlFor="product-id">
          Product ID {isEdit && <span className="ml-1 text-xs text-muted-foreground">(read-only — changing ID breaks historical analyses)</span>}
        </label>
        <input
          id="product-id"
          type="text"
          value={form.id}
          onChange={(e) => handleChange("id", e.target.value)}
          readOnly={isEdit}
          placeholder="e.g. PTCAD"
          className={cn(inputClass, isEdit && "cursor-not-allowed opacity-60")}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="product-name">Name</label>
        <input
          id="product-name"
          type="text"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="e.g. PTCAD AI"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="product-category">Category</label>
        <input
          id="product-category"
          type="text"
          value={form.category}
          onChange={(e) => handleChange("category", e.target.value)}
          placeholder="e.g. CAD / Engineering Software"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="product-description">Description</label>
        <textarea
          id="product-description"
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          rows={3}
          placeholder="Describe the product and its use cases..."
          className={cn(inputClass, "resize-y")}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="product-target-users">Target Users</label>
        <textarea
          id="product-target-users"
          value={form.targetUsers}
          onChange={(e) => handleChange("targetUsers", e.target.value)}
          rows={2}
          placeholder="e.g. Engineers, R&D teams, SME manufacturers"
          className={cn(inputClass, "resize-y")}
        />
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── PortfolioTab ─────────────────────────────────────────────────────────────

export function PortfolioTab() {
  const { products, isLoading, isSaving, saveError, saveProducts } = usePortfolioConfig();

  type UiState =
    | { type: "idle" }
    | { type: "adding" }
    | { type: "editing"; index: number }
    | { type: "deleting"; index: number };

  const [ui, setUi] = React.useState<UiState>({ type: "idle" });

  function handleAdd(form: FormState) {
    saveProducts([...products, form]);
    setUi({ type: "idle" });
  }

  function handleEdit(index: number, form: FormState) {
    const next = products.map((p, i) => (i === index ? form : p));
    saveProducts(next);
    setUi({ type: "idle" });
  }

  function handleDelete(index: number) {
    const next = products.filter((_, i) => i !== index);
    saveProducts(next);
    setUi({ type: "idle" });
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4" aria-busy="true">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-16 w-full rounded-lg bg-muted" />
        <div className="h-16 w-full rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Product Portfolio</h2>
          <p className="text-sm text-muted-foreground">
            Products used in AI analysis portfolio matching. Changes apply to new analyses only.
          </p>
        </div>
        {ui.type === "idle" && (
          <button
            type="button"
            onClick={() => setUi({ type: "adding" })}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="size-4" />
            Add Product
          </button>
        )}
      </div>

      {saveError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Save failed: {saveError}
        </p>
      )}

      {/* Product list */}
      {products.length === 0 && ui.type !== "adding" && (
        <div className="flex min-h-[80px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6">
          <p className="text-sm text-muted-foreground">
            No products configured. Add one to enable portfolio matching.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {products.map((product, index) => {
          if (ui.type === "editing" && ui.index === index) {
            return (
              <ProductForm
                key={product.id}
                initial={product}
                isEdit={true}
                onSave={(form) => handleEdit(index, form)}
                onCancel={() => setUi({ type: "idle" })}
                existingIds={products.map((p) => p.id)}
              />
            );
          }
          if (ui.type === "deleting" && ui.index === index) {
            return (
              <DeleteConfirmation
                key={product.id}
                product={product}
                onConfirm={() => handleDelete(index)}
                onCancel={() => setUi({ type: "idle" })}
              />
            );
          }
          return (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => setUi({ type: "editing", index })}
              onDelete={() => setUi({ type: "deleting", index })}
            />
          );
        })}
      </div>

      {/* Add form */}
      {ui.type === "adding" && (
        <ProductForm
          initial={EMPTY_FORM}
          isEdit={false}
          onSave={handleAdd}
          onCancel={() => setUi({ type: "idle" })}
          existingIds={products.map((p) => p.id)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd "launchpad-portal" && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/PortfolioTab.tsx
git commit -m "feat: add PortfolioTab settings component with add/edit/delete"
```

---

### Task 9: Wire Portfolio Tab into Settings Page

**Files:**

- Modify: `src/app/[locale]/(app)/settings/page.tsx`

**Interfaces:**

- Consumes: `PortfolioTab` from `@/components/settings/PortfolioTab`
- Produces: Settings page with 5 tabs: AI Config, Prompt Config, Portfolio, API Keys, Users

- [ ] **Step 1: Update `src/app/[locale]/(app)/settings/page.tsx`**

**a)** Add the dynamic import after the existing `PromptConfigTab` dynamic import block (around line 79):

```typescript
const PortfolioTab = dynamic(
  () =>
    import("@/components/settings/PortfolioTab").then((m) => ({
      default: m.PortfolioTab,
    })),
  { loading: () => <TabContentSkeleton />, ssr: false }
);
```

**b)** Add the icon import — add `Package` to the existing lucide-react import line:

```typescript
// Before:
import { Settings, Bot, KeyRound, Users, SlidersHorizontal } from "lucide-react";

// After:
import { Settings, Bot, KeyRound, Users, SlidersHorizontal, Package } from "lucide-react";
```

**c)** Update the `TabId` type (line 115):

```typescript
// Before:
type TabId = "ai-config" | "prompt-config" | "api-keys" | "users";

// After:
type TabId = "ai-config" | "prompt-config" | "portfolio" | "api-keys" | "users";
```

**d)** Update the `TABS` array (after line 123) — insert the `portfolio` entry between `prompt-config` and `api-keys`:

```typescript
const TABS: TabDef[] = [
  { id: "ai-config", label: "AI Configuration", icon: Bot },
  { id: "prompt-config", label: "Prompt Config", icon: SlidersHorizontal },
  { id: "portfolio", label: "Portfolio", icon: Package },
  { id: "api-keys", label: "API Keys", icon: KeyRound },
  { id: "users", label: "Users", icon: Users },
];
```

**e)** Update `TabContent` switch — add the `portfolio` case between `prompt-config` and `api-keys`:

```typescript
function TabContent({ activeTab }: { activeTab: TabId }) {
  switch (activeTab) {
    case "ai-config":
      return <AiConfigTab />;
    case "prompt-config":
      return <PromptConfigTab />;
    case "portfolio":
      return <PortfolioTab />;
    case "api-keys":
      return <ApiKeysTab />;
    case "users":
      return <UsersTab />;
    default:
      return null;
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd "launchpad-portal" && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Run full test suite**

```bash
cd "launchpad-portal" && pnpm test
```

Expected: All tests pass (≥ count before this feature branch).

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/\(app\)/settings/page.tsx
git commit -m "feat: add Portfolio tab to Settings page"
```

---

## Self-Review

**Spec coverage check:**

- [x] `portfolio_config` JSONB on `system_settings` — Task 1
- [x] Seeded with 4 products — Task 1, Step 1
- [x] `supabase/types.ts` updated — Task 1, Step 3
- [x] `ProductSchema` + `Product` type — Task 2
- [x] Duplicate ID validation — Task 2
- [x] `PortfolioConfigService.getPortfolioConfig` — Task 3
- [x] `PortfolioConfigService.updatePortfolioConfig` + audit log — Task 3
- [x] tRPC `getPortfolioConfig` + `updatePortfolioConfig` — Task 4
- [x] `formatPortfolioContext(products)` — Task 5
- [x] `buildAnalysisSystemPrompt(products)` — Task 5
- [x] `buildAnalysisToolDefinition(productIds)` — Task 5
- [x] `buildAnalysisPrompt(idea, products)` — Task 5
- [x] `PortfolioMatchSchema.product` → `z.string()` — Task 5
- [x] `PortfolioMatch.product` type → `string` — Task 5
- [x] `inline-worker.ts` fetches products dynamically — Task 7
- [x] Test suite updated — Tasks 2, 3, 6
- [x] `PortfolioTab` UI — Task 8
- [x] Settings page wiring (5 tabs) — Task 9
- [x] Historical analyses preserved as-is (no migration of `ai_analyses`) — by design
- [x] Empty products list handled gracefully (no crash in prompt layer) — Task 5, Step 3

**Type consistency check:**

- `Product` type defined once in `admin-ai-config/schemas.ts`; imported everywhere else — consistent
- `buildAnalysisToolDefinition` returns a plain object — `ProviderToolCall.tool: ProviderToolSpec` expects `{ name, description, input_schema }` — compatible
- `buildAnalysisPrompt` returns `ClaudeMessageParams.tools: ReturnType<typeof buildAnalysisToolDefinition>[]` — used in `inline-worker.ts` only for `.system` and `.messages`, not `.tools` (tools built separately there) — no conflict
