/**
 * AdminRouter — tRPC router for the admin-ai-config module.
 *
 * Exposes 11 procedures covering:
 *   - User Management (US-32): listUsers, createUser, updateUserRole, deleteUser
 *   - AI Model Config (US-33): getAiConfig, updateAiConfig
 *   - API Key Management (US-34): listApiKeys, validateApiKey, saveApiKey, updateApiKey, deleteApiKey
 *
 * All procedures are guarded with `roleProcedure('admin')` — admin-only access.
 *
 * adminId extraction:
 *   After `roleProcedure('admin')` the `enforceAuth` middleware has already narrowed
 *   `ctx.user` to a non-null `User`. We extract the admin's UUID from `ctx.user.id`.
 *
 * Ref:
 *   - design/api-spec.md    — tRPC Procedures + Role × Procedure Matrix
 *   - design/components.md  — AdminRouter (Component 1)
 *
 * Task 7.1
 */

import { router, roleProcedure } from "@/server/trpc";
import { userManagementService } from "./user-service";
import { aiConfigService } from "./ai-config-service";
import { apiKeyService } from "./api-key-service";
import {
  CreateUserSchema,
  UpdateUserRoleSchema,
  DeleteUserSchema,
  UpdateAiConfigSchema,
  ValidateApiKeySchema,
  SaveApiKeySchema,
  UpdateApiKeySchema,
  DeleteApiKeySchema,
} from "./schemas";

export const adminRouter = router({
  // ─── User Management (US-32) ───────────────────────────────────────────────

  /**
   * admin.listUsers
   *
   * Returns all users merged from Supabase Auth and the profiles table.
   *
   * Role: admin only
   * Input: none
   * Output: UserRow[]
   */
  listUsers: roleProcedure("admin").query(async () => {
    return userManagementService.listUsers();
  }),

  /**
   * admin.createUser
   *
   * Creates a new Auth user (email_confirm: true), upserts the profile row,
   * and logs the action to the audit log.
   *
   * Role: admin only
   * Input: CreateUserSchema
   * Output: UserRow
   * Errors: INTERNAL_SERVER_ERROR (Auth Admin fail), BAD_REQUEST (email exists)
   */
  createUser: roleProcedure("admin")
    .input(CreateUserSchema)
    .mutation(async ({ input, ctx }) => {
      const adminId = ctx.user.id;
      return userManagementService.createUser(input, adminId);
    }),

  /**
   * admin.updateUserRole
   *
   * Changes a user's role. Guards against self-demotion when the admin is
   * the sole remaining admin (prevents lockout).
   *
   * Role: admin only
   * Input: UpdateUserRoleSchema
   * Output: UserRow
   * Errors: FORBIDDEN (self-demotion with no other admin), NOT_FOUND
   */
  updateUserRole: roleProcedure("admin")
    .input(UpdateUserRoleSchema)
    .mutation(async ({ input, ctx }) => {
      const adminId = ctx.user.id;
      return userManagementService.updateUserRole(input.userId, input.role, adminId);
    }),

  /**
   * admin.deleteUser
   *
   * Deletes a user from Auth (cascades to profile). Self-delete is always forbidden.
   *
   * Role: admin only
   * Input: DeleteUserSchema
   * Output: { success: true }
   * Errors: FORBIDDEN (self-delete), NOT_FOUND
   */
  deleteUser: roleProcedure("admin")
    .input(DeleteUserSchema)
    .mutation(async ({ input, ctx }) => {
      const adminId = ctx.user.id;
      await userManagementService.deleteUser(input.userId, adminId);
      return { success: true as const };
    }),

  // ─── AI Model Config (US-33) ───────────────────────────────────────────────

  /**
   * admin.getAiConfig
   *
   * Returns current AI model configuration from system_settings.
   * Initialises with defaults if no row exists yet.
   *
   * Role: admin only
   * Input: none
   * Output: AiConfigData (includes supportedModels)
   */
  getAiConfig: roleProcedure("admin").query(async () => {
    return aiConfigService.getAiConfig();
  }),

  /**
   * admin.updateAiConfig
   *
   * Updates AI model selections in system_settings and writes an audit log entry.
   *
   * Role: admin only
   * Input: UpdateAiConfigSchema
   * Output: AiConfigData
   * Errors: BAD_REQUEST (model not in supported list — caught by Zod before service)
   */
  updateAiConfig: roleProcedure("admin")
    .input(UpdateAiConfigSchema)
    .mutation(async ({ input, ctx }) => {
      const adminId = ctx.user.id;
      return aiConfigService.updateAiConfig(input, adminId);
    }),

  // ─── API Key Management (US-34) ────────────────────────────────────────────

  /**
   * admin.listApiKeys
   *
   * Returns all API key rows as masked objects — plaintext key is never returned.
   *
   * Role: admin only
   * Input: none
   * Output: ApiKeyMasked[]
   */
  listApiKeys: roleProcedure("admin").query(async () => {
    return apiKeyService.listApiKeys();
  }),

  /**
   * admin.validateApiKey
   *
   * Makes a minimal test call to the provider API to check key validity.
   * Does NOT persist anything. Never throws on invalid key — returns { valid: false }.
   *
   * Role: admin only
   * Input: ValidateApiKeySchema
   * Output: { valid: boolean, error?: string, latencyMs?: number }
   */
  validateApiKey: roleProcedure("admin")
    .input(ValidateApiKeySchema)
    .mutation(async ({ input }) => {
      return apiKeyService.validateApiKey(input.key, input.provider);
    }),

  /**
   * admin.saveApiKey
   *
   * Validates key → stores in Supabase Vault → inserts api_keys row → audit log.
   * If setActive is true, all other keys for the same provider are deactivated first.
   *
   * Role: admin only
   * Input: SaveApiKeySchema
   * Output: ApiKeyMasked
   * Errors: BAD_REQUEST (key fails validation), INTERNAL_SERVER_ERROR (Vault fail)
   */
  saveApiKey: roleProcedure("admin")
    .input(SaveApiKeySchema)
    .mutation(async ({ input, ctx }) => {
      const adminId = ctx.user.id;
      return apiKeyService.saveApiKey(input, adminId);
    }),

  /**
   * admin.updateApiKey
   *
   * Updates the Vault secret and refreshes masked_key in api_keys. Optionally
   * toggles the is_active flag.
   *
   * Role: admin only
   * Input: UpdateApiKeySchema
   * Output: ApiKeyMasked
   */
  updateApiKey: roleProcedure("admin")
    .input(UpdateApiKeySchema)
    .mutation(async ({ input, ctx }) => {
      const adminId = ctx.user.id;
      return apiKeyService.updateApiKey(input.id, input.newKey, adminId);
    }),

  /**
   * admin.deleteApiKey
   *
   * Deletes the Vault secret and the api_keys row, then writes an audit log entry.
   *
   * Role: admin only
   * Input: DeleteApiKeySchema
   * Output: { success: true }
   */
  deleteApiKey: roleProcedure("admin")
    .input(DeleteApiKeySchema)
    .mutation(async ({ input, ctx }) => {
      const adminId = ctx.user.id;
      await apiKeyService.deleteApiKey(input.id, adminId);
      return { success: true as const };
    }),
});
