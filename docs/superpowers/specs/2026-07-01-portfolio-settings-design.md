# Product Portfolio Settings — Design Spec

**Date:** 2026-07-01
**Status:** Approved

## Overview

Allow admins to add, edit, and remove products in the company's product portfolio via the Settings page. These products are used by the AI analysis engine to determine "ความเชื่อมโยงกับ Portfolio" (portfolio match) for each idea. Currently the 4 products (PTCAD, APP.AI, COBO, CRM) are hardcoded; this feature makes them admin-configurable.

## Decisions

| Decision                      | Choice                                               | Reason                                                                 |
| ----------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Storage                       | `portfolio_config` JSONB column on `system_settings` | Consistent with `ai_config` / `prompt_config` pattern                  |
| Product fields                | id, name, category, description, targetUsers         | Structured (5 fields) — rich enough for Claude, lightweight for admins |
| Historical analyses           | Preserved as-is (snapshot)                           | Analyses reflect products at time of evaluation                        |
| Re-analysis on product change | Forward-only                                         | Admins use existing per-idea "trigger re-analysis" button              |

## Data Model

### `portfolio_config` JSONB shape

```ts
type Product = {
  id: string; // stable slug stored in ai_analyses.portfolio_matches[].product
  name: string; // display name shown in UI
  category: string; // short category label
  description: string; // free-text, injected into Claude prompt
  targetUsers: string; // free-text, injected into Claude prompt
};

type PortfolioConfig = {
  products: Product[];
};
```

**Important:** `id` is written into `ai_analyses.portfolio_matches` JSONB at analysis time. Once an `id` has been used in analyses, renaming it will cause historical analyses to show a product name that no longer exists in the config. The UI must warn admins that `id` is immutable after first use.

### Seeded default (migration)

The migration seeds the column with the 4 current hardcoded products so no existing data breaks:

```json
{
  "products": [
    {
      "id": "PTCAD",
      "name": "PTCAD AI",
      "category": "CAD / Engineering Software",
      "description": "ซอฟต์แวร์ออกแบบ CAD สำหรับงานอุตสาหกรรมการผลิต...",
      "targetUsers": "วิศวกรออกแบบ, ทีม R&D, โรงงานการผลิต, ผู้รับเหมาในอุตสาหกรรม"
    },
    {
      "id": "APP.AI",
      "name": "APP.AI",
      "category": "AI Platform / No-Code / Low-Code",
      "description": "แพลตฟอร์ม AI สำหรับสร้าง business application แบบ no-code/low-code...",
      "targetUsers": "Business users, ทีม IT องค์กร, SME ที่ต้องการ automation"
    },
    {
      "id": "COBO",
      "name": "COBO",
      "category": "ERP / Accounting / Business Management",
      "description": "ระบบ ERP และบัญชีสำหรับธุรกิจไทย...",
      "targetUsers": "นักบัญชี, ทีม Finance, ผู้บริหาร SME, ธุรกิจการค้าและบริการ"
    },
    {
      "id": "CRM",
      "name": "CRM",
      "category": "CRM / Sales / Customer Success",
      "description": "ระบบ CRM สำหรับจัดการลูกค้า, pipeline การขาย...",
      "targetUsers": "ทีมขาย, Account Manager, BD Team, Customer Success"
    }
  ]
}
```

## Backend

### DB Migration

File: `supabase/migrations/YYYYMMDDHHMMSS_add_portfolio_config.sql`

```sql
ALTER TABLE system_settings
  ADD COLUMN portfolio_config jsonb NOT NULL DEFAULT '{"products": []}';

UPDATE system_settings
  SET portfolio_config = '{ "products": [...] }'::jsonb;  -- seed with 4 products
```

### tRPC Procedures

Added to `src/modules/admin-ai-config/router.ts` alongside existing `getAiConfig`/`updateAiConfig`:

- **`getPortfolioConfig`** — `roleProcedure('admin')`, no input, returns `{ products: Product[] }`
- **`updatePortfolioConfig`** — `roleProcedure('admin')`, input: `{ products: Product[] }`, replaces entire products array. Zod validates each product has all 5 required fields, `id` must be non-empty slug (no spaces).

### Analysis Integration Changes

These files change to make the analysis engine read products from DB instead of hardcoded constants:

| File                                                 | Change                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------- |
| `src/lib/claude/prompts/portfolio-context.ts`        | `formatPortfolioContext()` → `formatPortfolioContext(products: Product[]): string`. Remove `APPLCAD_PRODUCTS` constant and `ProductDescription` interface (replaced by `Product` type from admin config).                                                        |
| `src/lib/claude/prompts/analysis-system-prompt.ts`   | `ANALYSIS_SYSTEM_PROMPT` constant (built at module load) → `buildAnalysisSystemPrompt(products: Product[]): string` function. Updates instruction "include ALL 4 products" → "include ALL products".                                                             |
| `src/lib/claude/prompts/analysis-tool-definition.ts` | `ANALYSIS_TOOL_DEFINITION` constant → `buildAnalysisToolDefinition(productIds: string[])` function. `portfolio_matches[].product` enum becomes `enum: productIds`. `maxItems: 4` becomes `maxItems: productIds.length`. `ANALYZE_IDEA_TOOL_CHOICE` stays static. |
| `src/lib/claude/prompt-builder.ts`                   | `buildAnalysisPrompt(idea)` → `buildAnalysisPrompt(idea, products: Product[])`. Calls builder functions above. `ClaudeMessageParams.tools` type changes from `readonly [typeof ANALYSIS_TOOL_DEFINITION]` to `ReturnType<typeof buildAnalysisToolDefinition>[]`. |
| `src/lib/claude/inline-worker.ts`                    | Already fetches `system_settings` at runtime for `ai_config`. Extend to also fetch `portfolio_config`, then pass `products` to `buildAnalysisPrompt`.                                                                                                            |
| `src/modules/ai-analysis/schemas.ts`                 | `PortfolioMatchSchema.product`: `z.enum(["PTCAD","APP.AI","COBO","CRM"])` → `z.string().min(1)`.                                                                                                                                                                 |
| `src/components/ai-analysis/PortfolioMatchCards.tsx` | `PortfolioMatch.product` type: `"PTCAD"                                                                                                                                                                                                                          | "APP.AI" | "COBO" | "CRM"`→`string`. |
| `src/lib/claude/__mocks__/client.ts`                 | Update hardcoded mock portfolio_matches product strings (no enum reference — just update sample values if needed).                                                                                                                                               |

**No changes to `ai_analyses` table schema** — `portfolio_matches` is already untyped JSONB.

## UI

### Settings Tab Order

```
[ AI Config ] [ Prompt Config ] [ Portfolio ] [ API Keys ] [ Users ]
```

New tab: `portfolio`, label "Portfolio"

### PortfolioTab Component

`src/components/settings/PortfolioTab.tsx`

**Layout:**

- Header row: "Product Portfolio" title (left) + "Add Product" button (right)
- List of product cards (vertical stack)
- Each card:
  - Left: `id` badge (monospace chip) + `name` (bold) + `category` (muted)
  - Right: Edit icon button + Delete icon button
  - Expandable: `targetUsers` line (truncated, expand on click)
- Add/Edit inline form (below card list, not modal):
  - **ID** field — text input, editable on create only; read-only on edit with tooltip: "ID cannot be changed after creation — it is stored in historical analysis results"
  - **Name** field — text input, required
  - **Category** field — text input, required
  - **Description** field — textarea, required
  - **Target Users** field — textarea, required
  - Save button + Cancel button
- Delete confirmation (inline, replaces card):
  - "Remove {name} from portfolio? Existing analyses referencing it will still display the original product name."
  - Confirm Delete + Cancel buttons

### State Pattern

Custom hook `usePortfolioConfig` (mirrors `useAiConfig`):

- `trpc.admin.getPortfolioConfig.useQuery()`
- `trpc.admin.updatePortfolioConfig.useMutation()` with optimistic update

Save submits the full updated products array (same replace-all pattern as `updateAiConfig`).

## Error Handling

- Empty products list: allowed — Claude prompt will note "no portfolio products configured" gracefully
- Duplicate `id`: Zod validation rejects with "Product ID must be unique"
- Save failure: toast error, revert optimistic update

## Out of Scope

- Per-product icon/color configuration
- Product ordering drag-and-drop (array order from DB is display order — moveable via delete+re-add)
- Bulk re-analysis when products change (use existing per-idea trigger re-analysis button)
- `keyFeatures` array field (dropped in favor of richer `description` free-text)
