/**
 * RBAC — Role-Based Access Control helpers.
 *
 * Role hierarchy (higher index = more permissions):
 *   guest < internal_submitter < bd_reviewer < admin
 *
 * Usage:
 *   import { requireRole, hasRole, getRoleRank, ROLE_HIERARCHY } from "@/lib/auth/rbac";
 */

import type { AppRole } from "@/lib/supabase/types";
import { AppError } from "@/lib/errors/AppError";

// ─── Hierarchy ────────────────────────────────────────────────────────────────

/**
 * Ordered role list — index 0 is least privileged, last index is most.
 * Adding a role here is the single place that controls all rank comparisons.
 */
export const ROLE_HIERARCHY = [
  "guest",
  "internal_submitter",
  "bd_reviewer",
  "admin",
] as const satisfies readonly AppRole[];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the numeric rank of a role.
 * Higher number = more permissions.
 * Returns -1 for unknown roles (treated as below guest).
 */
export function getRoleRank(role: AppRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

/**
 * Returns true when `userRole` has at least the same rank as `requiredRole`.
 *
 * @example
 *   hasRole("bd_reviewer", "internal_submitter") // true
 *   hasRole("guest", "admin") // false
 */
export function hasRole(userRole: AppRole, requiredRole: AppRole): boolean {
  return getRoleRank(userRole) >= getRoleRank(requiredRole);
}

/**
 * Asserts that `userRole` satisfies `requiredRole`.
 * Throws `AppError.forbidden()` if the rank check fails.
 *
 * @throws {AppError} with code FORBIDDEN when userRole rank < requiredRole rank
 *
 * @example
 *   requireRole(session.user.role, "bd_reviewer");
 */
export function requireRole(userRole: AppRole, requiredRole: AppRole): void {
  if (!hasRole(userRole, requiredRole)) {
    throw AppError.forbidden(
      `Role '${userRole}' does not have permission. Required: '${requiredRole}'`
    );
  }
}
