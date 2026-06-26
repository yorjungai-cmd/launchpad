/**
 * tRPC initialisation and base procedure exports.
 *
 * Exports:
 *   t                   — raw tRPC instance (internal use)
 *   router              — alias for t.router (compose sub-routers)
 *   middleware           — alias for t.middleware
 *   createCallerFactory — factory for server-side callers (tests, server actions)
 *   publicProcedure     — no auth check
 *   protectedProcedure  — throws UNAUTHORIZED when no session
 *   roleProcedure(role) — throws UNAUTHORIZED or FORBIDDEN based on role
 */

import { initTRPC, TRPCError } from "@trpc/server";
import type { ErrorFormatter } from "@trpc/server/unstable-core-do-not-import";
import superjson from "superjson";
import { formatTRPCError } from "@/lib/errors/trpc-formatter";
import { AppError } from "@/lib/errors/AppError";
import { hasRole } from "@/lib/auth/rbac";
import type { Context } from "./context";
import type { AppRole } from "@/lib/supabase/types";

// ─── tRPC instance ────────────────────────────────────────────────────────────

/**
 * Main tRPC instance.
 * - SuperJSON transformer handles Date, Map, Set, BigInt etc.
 * - formatTRPCError maps AppError → typed client error shape.
 */
export const t = initTRPC.context<Context>().create({
  transformer: superjson,
  // The local FormatterArgs stub in trpc-formatter.ts predates the real @trpc/server
  // types; cast to any to avoid a structural mismatch until the file is updated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorFormatter: formatTRPCError as unknown as ErrorFormatter<Context, any>,
});

// ─── Conveniences ─────────────────────────────────────────────────────────────

export const router = t.router;
export const middleware = t.middleware;
export const createCallerFactory = t.createCallerFactory;

// ─── Auth middleware ──────────────────────────────────────────────────────────

/**
 * Verifies that a session exists.
 * Throws UNAUTHORIZED (HTTP 401) if the user is not authenticated.
 */
const enforceAuth = middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
      cause: AppError.unauthorized(),
    });
  }
  return next({
    ctx: {
      ...ctx,
      // Narrow the types — guaranteed non-null after this middleware
      session: ctx.session,
      user: ctx.user,
    },
  });
});

// ─── Base procedures ──────────────────────────────────────────────────────────

/**
 * Public procedure — no authentication required.
 * Usable by both authenticated and unauthenticated callers.
 */
export const publicProcedure = t.procedure;

/**
 * Protected procedure — requires a valid session.
 * Throws UNAUTHORIZED if the caller is not authenticated.
 */
export const protectedProcedure = t.procedure.use(enforceAuth);

/**
 * Role-guarded procedure factory.
 *
 * @param requiredRole - Minimum role required (inclusive, uses ROLE_HIERARCHY).
 *
 * @example
 * ```ts
 * export const adminRouter = router({
 *   listUsers: roleProcedure('admin').query(() => ...),
 * });
 * ```
 *
 * Throws:
 *   - UNAUTHORIZED  — no session
 *   - FORBIDDEN     — authenticated but insufficient role
 */
export function roleProcedure(requiredRole: AppRole) {
  return protectedProcedure.use(({ ctx, next }) => {
    const userRole = ctx.role;

    if (!userRole) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User role is not set.",
        cause: AppError.unauthorized("User role is not set."),
      });
    }

    if (!hasRole(userRole, requiredRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Insufficient permissions. Required role: ${requiredRole}.`,
        cause: AppError.forbidden(
          `Role '${userRole}' does not have permission. Required: '${requiredRole}'`
        ),
      });
    }

    return next({ ctx });
  });
}
