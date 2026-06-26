/**
 * Auth type definitions.
 *
 * All auth-layer types extend or wrap the Supabase SDK types so the rest of
 * the app only imports from `@/lib/auth` — not from `@supabase/supabase-js`
 * directly (except where the SDK is the implementation detail).
 */

import type { Session, User } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/supabase/types";

// ─── Re-exports (convenience) ─────────────────────────────────────────────────

export type { Session, User };

// ─── AuthUser ─────────────────────────────────────────────────────────────────

/**
 * Extends the Supabase `User` with app-level profile fields loaded from the
 * `profiles` table.  Optional fields are null when the profile row doesn't
 * exist yet (e.g. immediately after sign-up, before the trigger fires).
 */
export interface AuthUser extends User {
  /** Display name from the `profiles` table */
  fullName: string | null;
  /** App role from the `profiles` table */
  role: AppRole;
  /** Preferred locale from the `profiles` table */
  locale: string;
}

// ─── AuthSession ──────────────────────────────────────────────────────────────

/**
 * A resolved, non-null auth session as returned by `getServerSession()`.
 * Both `user` and `session` are guaranteed to be present.
 */
export interface AuthSession {
  user: User;
  session: Session;
}

// ─── AuthState ────────────────────────────────────────────────────────────────

/**
 * The state shape returned by the `useSession()` / `useUser()` hooks.
 * Reflects the async nature of auth state on the client.
 */
export interface AuthState {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
}
