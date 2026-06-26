"use client";
/**
 * Browser auth hooks.
 *
 * Subscribe to real-time Supabase auth state changes in Client Components.
 *
 * All hooks wrap the Supabase `onAuthStateChange` listener so components
 * re-render automatically on sign-in / sign-out / token refresh.
 */

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { AuthState, AuthUser } from "./types";
import type { Session } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/supabase/types";

// ─── useSession ───────────────────────────────────────────────────────────────

/**
 * Subscribes to Supabase auth state and returns the current session.
 *
 * Returns `{ user, session, isLoading }`.
 * - `isLoading` is `true` until the initial auth state has been resolved.
 * - `user` and `session` are `null` when unauthenticated.
 *
 * @example
 * ```tsx
 * const { user, session, isLoading } = useSession();
 * if (isLoading) return <Skeleton />;
 * if (!user) return <SignInButton />;
 * ```
 */
export function useSession(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
  });

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    // Resolve initial session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ? enrichUser(session.user as AuthUser) : null,
        session: session ?? null,
        isLoading: false,
      });
    });

    // Subscribe to subsequent auth changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      setState({
        user: session?.user ? enrichUser(session.user as AuthUser) : null,
        session: session ?? null,
        isLoading: false,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

// ─── useUser ──────────────────────────────────────────────────────────────────

/**
 * Convenience hook — returns only the `AuthUser` or `null`.
 *
 * @example
 * ```tsx
 * const user = useUser();
 * if (!user) return null;
 * ```
 */
export function useUser(): AuthUser | null {
  const { user } = useSession();
  return user;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Enriches a raw Supabase `User` with app-level profile fields.
 * Reads from `user_metadata` (set by the auth trigger / profile table sync).
 * Falls back to sensible defaults when metadata is absent.
 */
function enrichUser(user: AuthUser): AuthUser {
  const meta = user.user_metadata as Record<string, unknown> | undefined;

  return {
    ...user,
    fullName: (meta?.["full_name"] as string | undefined) ?? null,
    role: (meta?.["role"] as AppRole | undefined) ?? "internal_submitter",
    locale: (meta?.["locale"] as string | undefined) ?? "th",
  };
}
