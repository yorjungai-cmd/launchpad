/**
 * Shared enums for the LaunchPad Portal domain.
 * Used across all modules for type-safe role/stage/type discrimination.
 */

/** User roles — maps to Supabase `app_role` enum and RBAC guards */
export enum UserRole {
  GUEST = "guest",
  INTERNAL_SUBMITTER = "internal_submitter",
  BD_REVIEWER = "bd_reviewer",
  ADMIN = "admin",
}

/** Launch PAD 2.0 pipeline stages */
export enum Stage {
  SANDBOX = "sandbox",
  VALIDATION_SPRINT = "validation_sprint",
  BUILD_SPRINT = "build_sprint",
  LAUNCH_AND_TEST = "launch_and_test",
}

/** Idea type — determines feasibility metric template */
export enum IdeaType {
  SAAS = "saas",
  SI = "si",
  HARDWARE = "hardware",
  PLATFORM = "platform",
  INTERNAL_TOOL = "internal_tool",
  PARTNERSHIP = "partnership",
}

/** Document watermark status — AI Draft → BD Reviewed → Approved */
export enum WatermarkStatus {
  AI_DRAFT = "ai_draft",
  BD_REVIEWED = "bd_reviewed",
  APPROVED = "approved",
}
