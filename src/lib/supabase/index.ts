/**
 * Supabase library barrel export.
 *
 * Usage:
 *   // Server Component / Route Handler / tRPC context:
 *   import { createServerSupabaseClient } from "@/lib/supabase";
 *
 *   // Client Component:
 *   import { createBrowserSupabaseClient } from "@/lib/supabase";
 *
 *   // Types:
 *   import type { Database, Profile, AppRole } from "@/lib/supabase";
 */

// Server client (Next.js cookies-aware)
export { createServerSupabaseClient, createAdminSupabaseClient } from "./server";

// Browser client (Client Components)
export { createBrowserSupabaseClient } from "./client";

// Types
export type { Database, AppRole, Profile, ProfileInsert, ProfileUpdate } from "./types";
