/**
 * Browser-side Supabase client factory.
 *
 * Uses @supabase/ssr to create a client that reads/writes cookies in the browser.
 * Safe to use in Client Components ("use client") and client-side hooks.
 *
 * The client is intentionally NOT a singleton here so that it can be
 * properly tested and re-created per context. For stable reference in
 * React components, use useMemo or a module-level singleton pattern.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Creates a Supabase client for use in Client Components.
 * Manages auth state via cookies (compatible with server-side SSR).
 *
 * @example
 * ```ts
 * const supabase = createBrowserSupabaseClient();
 * const { data, error } = await supabase.auth.signInWithPassword({ email, password });
 * ```
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!
  );
}
