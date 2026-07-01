/**
 * Schemas and TypeScript interfaces for the admin-ai-config module.
 *
 * Covers:
 *   - User Management (US-32): CreateUserSchema, UpdateUserRoleSchema, DeleteUserSchema
 *   - AI Model Config (US-33): UpdateAiConfigSchema, ModelNameSchema, SUPPORTED_MODELS
 *   - API Key Management (US-34): SaveApiKeySchema, UpdateApiKeySchema, ValidateApiKeySchema
 *   - Application-layer interfaces: UserRow, AiConfigData, ApiKeyMasked, AuditLogEntry
 *   - Security constants: FORBIDDEN_METADATA_FIELDS
 *
 * Ref:
 *   - design/api-spec.md   — Input Schemas + procedure contracts
 *   - design/data-model.md — TypeScript Types (Application Layer)
 *   - design/components.md — AdminAuditLogService.AuditLogEntry
 *
 * Task 2.1
 */

import { z } from "zod";
import { UserRole } from "@/shared/enums";
import { DOCUMENT_TYPES_IN_WORKFLOW_ORDER } from "@/lib/document-generation/prompt-config-defaults";

const DOCUMENT_TYPE_VALUES = DOCUMENT_TYPES_IN_WORKFLOW_ORDER.map((d) => d.type) as [
  string,
  ...string[],
];

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Allowlist of supported AI model identifiers across all providers.
 * Extending this list requires updating ModelNameSchema automatically
 * (ModelNameSchema is derived from this const).
 *
 * Bedrock model IDs follow the inference profile format:
 *   - Cross-region: us.anthropic.claude-sonnet-4-6
 *   - Direct:       anthropic.claude-sonnet-4-6
 */
export const SUPPORTED_MODELS = [
  // Anthropic (direct API)
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  // AWS Bedrock — Claude (inference profile IDs)
  "us.anthropic.claude-sonnet-4-6",
  "anthropic.claude-sonnet-4-6",
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "us.anthropic.claude-haiku-4-5-20251014-v1:0",
  "anthropic.claude-sonnet-4-5-20250929-v1:0",
  "anthropic.claude-haiku-4-5-20251014-v1:0",
  // AWS Bedrock — Amazon Nova
  "amazon.nova-pro-v1:0",
  "amazon.nova-lite-v1:0",
  "amazon.nova-micro-v1:0",
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

/**
 * Metadata field names that are unconditionally forbidden in audit log entries.
 * Any AuditLogEntry.metadata key matching one of these names will cause
 * AdminAuditLogService.log() to throw a descriptive error before the DB insert.
 *
 * Ref: design/data-model.md — admin_audit_log Business Rule #2
 */
export const FORBIDDEN_METADATA_FIELDS = [
  "key",
  "secret",
  "token",
  "password",
  "apiKey",
  "api_key",
] as const;

export type ForbiddenMetadataField = (typeof FORBIDDEN_METADATA_FIELDS)[number];

// ─── Zod: AI Model Config ─────────────────────────────────────────────────────

/**
 * ModelNameSchema — validates a single AI model identifier against
 * the SUPPORTED_MODELS allowlist.
 */
export const ModelNameSchema = z.enum(SUPPORTED_MODELS);

/**
 * UpdateAiConfigSchema — input for admin.updateAiConfig mutation (US-33).
 * All four model fields must be in the SUPPORTED_MODELS allowlist.
 */
export const UpdateAiConfigSchema = z.object({
  analysisModel: ModelNameSchema,
  documentGenerationModel: ModelNameSchema,
  defaultModel: ModelNameSchema,
  fallbackModel: ModelNameSchema,
});

export type UpdateAiConfigInput = z.infer<typeof UpdateAiConfigSchema>;

// ─── Zod: User Management ─────────────────────────────────────────────────────

/**
 * AppRoleSchema — Zod enum derived from the shared UserRole TypeScript enum.
 * Excludes 'guest' because admins cannot create guest accounts via the UI.
 */
export const AppRoleSchema = z.enum([
  UserRole.INTERNAL_SUBMITTER,
  UserRole.BD_REVIEWER,
  UserRole.ADMIN,
]);

export type AppRole = z.infer<typeof AppRoleSchema>;

/**
 * CreateUserSchema — input for admin.createUser mutation (US-32).
 */
export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: AppRoleSchema,
  fullName: z.string().min(1).max(100).optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

/**
 * UpdateUserRoleSchema — input for admin.updateUserRole mutation (US-32).
 */
export const UpdateUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: AppRoleSchema,
});

export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>;

/**
 * DeleteUserSchema — input for admin.deleteUser mutation (US-32).
 */
export const DeleteUserSchema = z.object({
  userId: z.string().uuid(),
});

export type DeleteUserInput = z.infer<typeof DeleteUserSchema>;

// ─── Zod: API Key Management ──────────────────────────────────────────────────

/**
 * ProviderSchema — currently only 'anthropic' is supported.
 * Extend this enum when additional providers are onboarded.
 */
export const ProviderSchema = z.enum(["anthropic", "google", "aws_bedrock", "openrouter"]);

export type Provider = z.infer<typeof ProviderSchema>;

/**
 * SaveApiKeySchema — input for admin.saveApiKey mutation (US-34).
 *
 * NOTE: `key` is a server-side-only plaintext value.
 * It is NEVER stored in the DB directly — only in Supabase Vault.
 * It is NEVER returned in any response.
 */
export const SaveApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  key: z.string().min(10),
  provider: ProviderSchema,
  setActive: z.boolean().default(false),
});

export type SaveApiKeyInput = z.infer<typeof SaveApiKeySchema>;

/**
 * UpdateApiKeySchema — input for admin.updateApiKey mutation (US-34).
 */
export const UpdateApiKeySchema = z.object({
  id: z.string().uuid(),
  newKey: z.string().min(10),
  setActive: z.boolean().optional(),
});

export type UpdateApiKeyInput = z.infer<typeof UpdateApiKeySchema>;

/**
 * ValidateApiKeySchema — input for admin.validateApiKey mutation (US-34).
 * Triggers a minimal test call to the provider API without persisting anything.
 */
export const ValidateApiKeySchema = z.object({
  key: z.string().min(10),
  provider: ProviderSchema,
});

export type ValidateApiKeyInput = z.infer<typeof ValidateApiKeySchema>;

/**
 * DeleteApiKeySchema — input for admin.deleteApiKey mutation (US-34).
 */
export const DeleteApiKeySchema = z.object({
  id: z.string().uuid(),
});

export type DeleteApiKeyInput = z.infer<typeof DeleteApiKeySchema>;

// ─── TypeScript Interfaces ────────────────────────────────────────────────────

/**
 * UserRow — application-layer representation of a user for the admin panel (US-32).
 * Combines data from `profiles` table and Supabase Auth.
 */
export interface UserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: AppRole;
  createdAt: string;
  lastSignInAt: string | null;
}

/**
 * AiConfigData — AI model configuration read from / written to
 * the `system_settings.ai_config` JSONB column (US-33).
 *
 * `supportedModels` is always populated from SUPPORTED_MODELS at the
 * service layer — it is informational and never persisted as part of
 * the update input.
 */
export interface AiConfigData {
  analysisModel: string;
  documentGenerationModel: string;
  defaultModel: string;
  fallbackModel: string;
  supportedModels: string[];
}

/**
 * ApiKeyMasked — masked API key returned to clients (US-34).
 * Plaintext key is NEVER included.
 *
 * `maskedKey` format: "sk-...{last4}" — computed once at insert, never decrypted.
 */
export interface ApiKeyMasked {
  id: string;
  name: string;
  provider: string;
  maskedKey: string;
  isActive: boolean;
  createdAt: string;
  createdByName: string | null;
}

/**
 * AuditAction — union of all valid audit log action strings.
 * Matches the `action` enum defined in design/data-model.md.
 */
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

/**
 * AuditTargetType — the domain entity type affected by the audited operation.
 */
export type AuditTargetType = "api_key" | "user" | "ai_config" | "prompt_config";

/**
 * AuditLogEntry — the payload passed to AdminAuditLogService.log().
 *
 * Security constraints:
 *   - `metadata` keys must NOT appear in FORBIDDEN_METADATA_FIELDS
 *   - `metadata` values are flat scalars only (string | number | boolean)
 *   - No nested objects — enforced by type and validated at runtime
 *
 * Ref: design/components.md — AdminAuditLogService
 */
export interface AuditLogEntry {
  action: AuditAction;
  adminId: string;
  targetType: AuditTargetType;
  targetId: string;
  metadata: Record<string, string | number | boolean>;
}

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
  documentType: z.enum(DOCUMENT_TYPE_VALUES),
  sections: z.record(z.string(), z.string().max(2000)),
});

export const TestSectionPromptSchema = z.object({
  systemPrompt: z.string().min(1).max(8000),
  sectionKey: z.string().min(1),
  documentType: z.string().min(1),
  instruction: z.string().min(1).max(2000),
});

export const ResetPromptDocumentTypeSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPE_VALUES),
});

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
