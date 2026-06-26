/**
 * PBT: RBAC & Reference Number
 *
 * Properties verified:
 *
 * [Task 4.3] Role-guard-monotonic
 *   1. For any two roles A and B where rank(A) >= rank(B), hasRole(A, B) === true
 *   2. For any two roles A and B where rank(A) <  rank(B), hasRole(A, B) === false
 *   3. requireRole throws AppError.forbidden (FORBIDDEN) when rank(U) < rank(R)
 *   4. requireRole does NOT throw when rank(U) >= rank(R)
 *
 * [Task 4.4] Reference-number-unique
 *   5. N generated reference numbers are all unique
 *   6. Every generated reference number matches /^LP-[A-Z0-9]{8}$/
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { hasRole, requireRole, getRoleRank, ROLE_HIERARCHY } from "@/lib/auth/rbac";
import { AppError } from "@/lib/errors/AppError";
import { ErrorCode } from "@/lib/errors/codes";
import { generateReferenceNumber } from "@/lib/auth/reference-number";
import { referenceNumberSchema } from "@/shared/schemas/common";
import type { AppRole } from "@/lib/supabase/types";

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** Arbitrary that picks any AppRole */
const roleArb = fc.constantFrom(...(ROLE_HIERARCHY as readonly AppRole[]));

/**
 * Arbitrary that produces a pair [userRole, requiredRole] where
 * rank(userRole) >= rank(requiredRole).
 */
const sufficientRolePairArb = fc
  .tuple(roleArb, roleArb)
  .filter(([a, b]) => getRoleRank(a) >= getRoleRank(b));

/**
 * Arbitrary that produces a pair [userRole, requiredRole] where
 * rank(userRole) < rank(requiredRole).
 */
const insufficientRolePairArb = fc
  .tuple(roleArb, roleArb)
  .filter(([a, b]) => getRoleRank(a) < getRoleRank(b));

// ── [Task 4.3] Role-Guard-Monotonic Properties ───────────────────────────────

describe("RBAC — role-guard-monotonic (PBT)", () => {
  it("Property 1: hasRole(A, B) === true when rank(A) >= rank(B)", () => {
    fc.assert(
      fc.property(sufficientRolePairArb, ([userRole, requiredRole]) => {
        expect(hasRole(userRole, requiredRole)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it("Property 2: hasRole(A, B) === false when rank(A) < rank(B)", () => {
    fc.assert(
      fc.property(insufficientRolePairArb, ([userRole, requiredRole]) => {
        expect(hasRole(userRole, requiredRole)).toBe(false);
      }),
      { numRuns: 500 }
    );
  });

  it("Property 3: requireRole throws AppError.forbidden when rank(U) < rank(R)", () => {
    fc.assert(
      fc.property(insufficientRolePairArb, ([userRole, requiredRole]) => {
        expect(() => requireRole(userRole, requiredRole)).toThrow(AppError);

        // Also verify the specific error code is FORBIDDEN
        try {
          requireRole(userRole, requiredRole);
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).code).toBe(ErrorCode.FORBIDDEN);
          expect((err as AppError).statusCode).toBe(403);
        }
      }),
      { numRuns: 500 }
    );
  });

  it("Property 4: requireRole does NOT throw when rank(U) >= rank(R)", () => {
    fc.assert(
      fc.property(sufficientRolePairArb, ([userRole, requiredRole]) => {
        expect(() => requireRole(userRole, requiredRole)).not.toThrow();
      }),
      { numRuns: 500 }
    );
  });

  // ── Spot-checks for role hierarchy correctness ───────────────────────────

  it("admin can do everything any other role can do (exhaustive spot-check)", () => {
    for (const role of ROLE_HIERARCHY) {
      expect(hasRole("admin", role)).toBe(true);
    }
  });

  it("guest cannot do anything that internal_submitter, bd_reviewer, or admin can do", () => {
    for (const role of ["internal_submitter", "bd_reviewer", "admin"] as AppRole[]) {
      expect(hasRole("guest", role)).toBe(false);
    }
  });

  it("every role satisfies itself (reflexive)", () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        expect(hasRole(role, role)).toBe(true);
        expect(() => requireRole(role, role)).not.toThrow();
      }),
      { numRuns: 100 }
    );
  });
});

// ── [Task 4.4] Reference-Number-Unique Properties ────────────────────────────

describe("Reference number — uniqueness & format (PBT)", () => {
  it("Property 5: N generated reference numbers are all unique", () => {
    // Test with various sample sizes (10 to 200)
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 200 }), (n) => {
        const refs = Array.from({ length: n }, generateReferenceNumber);
        const unique = new Set(refs);
        expect(unique.size).toBe(n);
      }),
      { numRuns: 50 }
    );
  });

  it("Property 6: every generated reference number matches /^LP-[A-Z0-9]{8}$/", () => {
    const REFERENCE_REGEX = /^LP-[A-Z0-9]{8}$/;

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        for (let i = 0; i < n; i++) {
          const ref = generateReferenceNumber();
          expect(ref).toMatch(REFERENCE_REGEX);
        }
      }),
      { numRuns: 50 }
    );
  });

  it("Property 6b: every generated reference number passes referenceNumberSchema", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        for (let i = 0; i < n; i++) {
          const ref = generateReferenceNumber();
          const result = referenceNumberSchema.safeParse(ref);
          expect(result.success).toBe(true);
        }
      }),
      { numRuns: 50 }
    );
  });

  it("spot-check: format LP-{8 uppercase alphanumeric}", () => {
    const ref = generateReferenceNumber();
    expect(ref).toMatch(/^LP-[A-Z0-9]{8}$/);
    expect(ref.length).toBe(11); // "LP-" (3) + 8 chars
  });

  it("spot-check: 1000 reference numbers have no duplicates", () => {
    const refs = Array.from({ length: 1000 }, generateReferenceNumber);
    expect(new Set(refs).size).toBe(1000);
  });
});
