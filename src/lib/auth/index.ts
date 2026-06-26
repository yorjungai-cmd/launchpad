/**
 * Auth library barrel export.
 *
 * Usage:
 *   // Server helpers (Server Components / Route Handlers / tRPC):
 *   import { getServerSession, getServerUser, isAuthenticated } from "@/lib/auth";
 *
 *   // Browser hooks (Client Components — "use client"):
 *   import { useSession, useUser } from "@/lib/auth/hooks";
 *
 *   // Types:
 *   import type { AuthSession, AuthUser, AuthState } from "@/lib/auth";
 *
 *   // Config constants:
 *   import { SUPPORTED_AUTH_METHODS, AUTH_REDIRECT_URL, SIGN_IN_PATH } from "@/lib/auth";
 */

// Server helpers
export { getServerSession, getServerUser, isAuthenticated } from "./server";

// Config constants
export {
  SUPPORTED_AUTH_METHODS,
  SESSION_COOKIE_NAME,
  AUTH_REDIRECT_URL,
  PUBLIC_PATH_PATTERNS,
  SIGN_IN_PATH,
} from "./config";

// Types
export type { AuthSession, AuthUser, AuthState, Session, User } from "./types";

// RBAC helpers
export { requireRole, hasRole, getRoleRank, ROLE_HIERARCHY } from "./rbac";

// NOTE: browser hooks live in @/lib/auth/hooks (client-only, "use client" directive)
// They are NOT re-exported from this barrel to prevent accidental server-side imports.
