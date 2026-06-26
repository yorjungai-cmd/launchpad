/**
 * Server-side Supabase client factory.
 *
 * Uses @supabase/ssr to create a cookie-aware client for use in:
 * - Server Components
 * - Route Handlers
 * - Server Actions
 * - tRPC context
 *
 * IMPORTANT: Never use `SUPABASE_SERVICE_ROLE_KEY` here for per-request clients.
 * The anon key + RLS is the default; use createAdminSupabaseClient() for
 * trusted server-only operations that bypass RLS.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Creates a Supabase client for Server Components / Route Handlers.
 * Reads and writes auth cookies via Next.js `cookies()`.
 *
 * @example
 * ```ts
 * const supabase = createServerSupabaseClient();
 * const { data } = await supabase.from("profiles").select("*");
 * ```
 */
export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    {
      cookies: {
        async getAll() {
          const store = await cookieStore;
          return store.getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const store = await cookieStore;
            cookiesToSet.forEach(({ name, value, options }) => {
              store.set(name, value, options);
            });
          } catch {
            // `setAll` may be called in a read-only context (e.g., Server Component).
          }
        },
      },
    }
  );
}

/**
 * Creates a Supabase admin client using the service-role key.
 * Bypasses Row Level Security — use ONLY for trusted server operations
 * (e.g., seed scripts, admin procedures that require elevated access).
 *
 * Never expose this client to the browser or use it in client-side code.
 */
export function createAdminSupabaseClient() {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Admin client requires the service-role key."
    );
  }

  return createClient<Database>(process.env["NEXT_PUBLIC_SUPABASE_URL"]!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
