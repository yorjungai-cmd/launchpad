/**
 * Auth configuration constants.
 *
 * Centralises all auth-related config so callers never hard-code strings.
 */

// ─── Supported auth methods ───────────────────────────────────────────────────

export const SUPPORTED_AUTH_METHODS = ["email_password", "magic_link"] as const;

export type SupportedAuthMethod = (typeof SUPPORTED_AUTH_METHODS)[number];

// ─── Session cookie ───────────────────────────────────────────────────────────

/**
 * The name of the Supabase auth cookie managed by @supabase/ssr.
 * Used for inspection in middleware and server helpers.
 */
export const SESSION_COOKIE_NAME = "sb-auth-token";

// ─── Redirect URLs ────────────────────────────────────────────────────────────

/**
 * Returns the full callback URL for magic-link / OAuth flows.
 *
 * Falls back to localhost:3000 in development when NEXT_PUBLIC_APP_URL is not set.
 *
 * @param path  - The path after the origin, e.g. "/auth/callback" (default)
 * @param locale - Optional locale prefix, e.g. "th" → "/th/auth/callback"
 *
 * @example
 * const url = AUTH_REDIRECT_URL("/auth/callback", "th");
 * // → "https://example.com/th/auth/callback"
 */
export function AUTH_REDIRECT_URL(path = "/auth/callback", locale?: string): string {
  const base = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";

  const localePath = locale ? `/${locale}${path}` : path;

  // Ensure no double slashes
  return `${base.replace(/\/$/, "")}${localePath}`;
}

// ─── Protected / public route patterns ───────────────────────────────────────

/**
 * Paths that are always public (no auth required).
 * Used by middleware to skip auth checks.
 */
export const PUBLIC_PATH_PATTERNS = [
  /^\/[^/]+\/(public)(\/.*)?$/, // /[locale]/(public)/*
  /^\/api\/trpc(\/.*)?$/, // /api/trpc/*
  /^\/[^/]+\/auth(\/.*)?$/, // /[locale]/auth/* (sign-in, callback, etc.)
] as const;

/**
 * Sign-in page path (locale-prefixed at runtime).
 * e.g. `/th/auth/sign-in`
 */
export const SIGN_IN_PATH = "/auth/sign-in";
