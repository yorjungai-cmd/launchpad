/**
 * tRPC context creation.
 *
 * Provides each tRPC procedure with:
 *   - db:      Supabase server client (cookie-aware)
 *   - session: AuthSession | null (verified via getServerSession)
 *   - user:    User | null
 *   - role:    AppRole | null (from user.user_metadata.role or profiles table)
 *
 * Used in:
 *   src/server/trpc.ts  → initTRPC.context<Context>()
 *   src/app/api/trpc/[trpc]/route.ts → createTRPCContext
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServerSession } from "@/lib/auth/server";
import type { AppRole } from "@/lib/supabase/types";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// ─── Context Type ─────────────────────────────────────────────────────────────

export interface Context {
  /** Cookie-aware Supabase client (anon key + RLS) */
  db: SupabaseClient<Database>;
  /** Current auth session or null if unauthenticated */
  session: Awaited<ReturnType<typeof getServerSession>>;
  /** Authenticated user or null */
  user: User | null;
  /** App role extracted from user_metadata or null */
  role: AppRole | null;
}

// ─── Context Factory ──────────────────────────────────────────────────────────

/**
 * Creates a tRPC context for each incoming request.
 *
 * @example
 * ```ts
 * // In route.ts:
 * handler({ req, createContext: () => createTRPCContext({ headers: req.headers }) })
 * ```
 */
export async function createTRPCContext(_opts: { headers: Headers }): Promise<Context> {
  const db = createServerSupabaseClient();
  const session = await getServerSession();

  const user = session?.user ?? null;

  // Role comes from user_metadata (synced from profiles table by a DB trigger).
  // Fallback: query profiles table directly if metadata is stale or not yet set.
  let role: AppRole | null = (user?.user_metadata?.["role"] as AppRole | undefined) ?? null;

  if (!role && user) {
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
    role = (profile?.role as AppRole | undefined) ?? null;
  }

  return {
    db,
    session,
    user,
    role,
  };
}
