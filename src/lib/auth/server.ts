/**
 * Server-side auth helpers.
 *
 * Use these in:
 *  - Server Components
 *  - Route Handlers
 *  - Server Actions
 *  - tRPC context (src/server/context.ts)
 *
 * All functions are async and must be called in a server context where
 * Next.js `cookies()` is available.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuthSession } from "./types";
import type { User } from "@supabase/supabase-js";

// ─── getServerSession ─────────────────────────────────────────────────────────

/**
 * Returns the authenticated session for the current request, or `null` if
 * the user is not signed in.
 *
 * Uses `auth.getUser()` (not `getSession()`) so the token is always verified
 * against the Supabase Auth server — not just read from the cookie.
 *
 * @example
 * ```ts
 * // In a Server Component:
 * const session = await getServerSession();
 * if (!session) redirect("/th/auth/sign-in");
 * const { user } = session;
 * ```
 */
export async function getServerSession(): Promise<AuthSession | null> {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    // Retrieve the session (needed for the JWT / access_token)
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return null;
    }

    return { user, session };
  } catch {
    // Gracefully degrade — treat as unauthenticated
    return null;
  }
}

// ─── getServerUser ────────────────────────────────────────────────────────────

/**
 * Convenience wrapper — returns only the `User` object or `null`.
 *
 * @example
 * ```ts
 * const user = await getServerUser();
 * if (!user) return <SignInPage />;
 * ```
 */
export async function getServerUser(): Promise<User | null> {
  const authSession = await getServerSession();
  return authSession?.user ?? null;
}

// ─── isAuthenticated ──────────────────────────────────────────────────────────

/**
 * Returns `true` if there is a valid, verified session for the current request.
 *
 * @example
 * ```ts
 * if (!(await isAuthenticated())) redirect("/th/auth/sign-in");
 * ```
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getServerSession();
  return session !== null;
}
