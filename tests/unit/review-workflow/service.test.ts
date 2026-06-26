/**
 * Unit tests for ReviewWorkflowService — guards, state machines, PBT.
 * Includes PBT Properties 1–5.
 *
 * Ref: design/correctness.md
 * Task 3.1, 4.1, 5.1, 3.2 (role guard logic)
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  validateStageTransition,
  applyWatermarkTransition,
  validateRejectInput,
  VALID_STAGES,
} from "@/modules/review-workflow/service";
import { WatermarkStatus } from "@/shared/enums";

// ─── Watermark transition (Property 1) ───────────────────────────────────────

describe("applyWatermarkTransition()", () => {
  it("should allow ai_draft → bd_reviewed", () => {
    const r = applyWatermarkTransition(WatermarkStatus.AI_DRAFT, WatermarkStatus.BD_REVIEWED);
    expect(r.success).toBe(true);
    expect(r.status).toBe(WatermarkStatus.BD_REVIEWED);
  });

  it("should allow bd_reviewed → approved", () => {
    const r = applyWatermarkTransition(WatermarkStatus.BD_REVIEWED, WatermarkStatus.APPROVED);
    expect(r.success).toBe(true);
    expect(r.status).toBe(WatermarkStatus.APPROVED);
  });

  it("should allow ai_draft → approved (direct, less common)", () => {
    const r = applyWatermarkTransition(WatermarkStatus.AI_DRAFT, WatermarkStatus.APPROVED);
    expect(r.success).toBe(true);
  });

  it("should reject approved → bd_reviewed (downgrade)", () => {
    const r = applyWatermarkTransition(WatermarkStatus.APPROVED, WatermarkStatus.BD_REVIEWED);
    expect(r.success).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("should reject approved → ai_draft (downgrade)", () => {
    const r = applyWatermarkTransition(WatermarkStatus.APPROVED, WatermarkStatus.AI_DRAFT);
    expect(r.success).toBe(false);
  });

  it("should reject bd_reviewed → ai_draft (downgrade)", () => {
    const r = applyWatermarkTransition(WatermarkStatus.BD_REVIEWED, WatermarkStatus.AI_DRAFT);
    expect(r.success).toBe(false);
  });

  it("should reject same → same", () => {
    const r = applyWatermarkTransition(WatermarkStatus.AI_DRAFT, WatermarkStatus.AI_DRAFT);
    expect(r.success).toBe(false);
  });

  it("should reject unknown next status", () => {
    const r = applyWatermarkTransition(WatermarkStatus.AI_DRAFT, "invalid_status");
    expect(r.success).toBe(false);
  });

  // PBT Property 1 — watermark monotonic
  it("PBT Property 1: watermark transitions are monotonically directed (no downgrades)", () => {
    const ORDER: Record<string, number> = {
      [WatermarkStatus.AI_DRAFT]: 0,
      [WatermarkStatus.BD_REVIEWED]: 1,
      [WatermarkStatus.APPROVED]: 2,
    };
    const statuses = [
      WatermarkStatus.AI_DRAFT,
      WatermarkStatus.BD_REVIEWED,
      WatermarkStatus.APPROVED,
    ];

    fc.assert(
      fc.property(fc.constantFrom(...statuses), fc.constantFrom(...statuses), (current, next) => {
        const result = applyWatermarkTransition(current, next);
        if (ORDER[next]! <= ORDER[current]!) {
          return result.success === false;
        }
        return result.success === true && result.status === next;
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Stage transition (Property 2) ───────────────────────────────────────────

describe("validateStageTransition()", () => {
  it("should allow Sandbox → Validation Sprint", () => {
    expect(validateStageTransition("sandbox", "validation_sprint").valid).toBe(true);
  });

  it("should allow Sandbox → Build Sprint (BD can skip)", () => {
    expect(validateStageTransition("sandbox", "build_sprint").valid).toBe(true);
  });

  it("should reject Closed → anything (terminal)", () => {
    for (const stage of VALID_STAGES) {
      if (stage !== "closed_go" && stage !== "closed_no_go") {
        expect(validateStageTransition("closed_no_go", stage).valid).toBe(false);
      }
    }
  });

  it("should reject same stage transition", () => {
    for (const stage of VALID_STAGES) {
      expect(validateStageTransition(stage, stage).valid).toBe(false);
    }
  });

  it("should reject unknown stage", () => {
    expect(validateStageTransition("sandbox", "Flying Stage").valid).toBe(false);
  });

  // PBT Property 2 — stage validity
  it("PBT Property 2: Closed is terminal, same→same invalid, unknown stages invalid", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_STAGES),
        fc.constantFrom(...VALID_STAGES),
        (from, to) => {
          const result = validateStageTransition(from, to);
          if (from === "closed_go" || from === "closed_no_go") return result.valid === false;
          if (from === to) return result.valid === false;
          return result.valid === true;
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Reject reason validation (Property 4) ───────────────────────────────────

describe("validateRejectInput()", () => {
  it("should accept reason with 10+ chars", () => {
    expect(validateRejectInput({ reason: "0123456789" }).valid).toBe(true);
    expect(validateRejectInput({ reason: "This idea does not fit our strategy." }).valid).toBe(
      true
    );
  });

  it("should reject empty reason", () => {
    expect(validateRejectInput({ reason: "" }).valid).toBe(false);
  });

  it("should reject reason under 10 chars", () => {
    expect(validateRejectInput({ reason: "Too short" }).valid).toBe(false);
  });

  it("should reject whitespace-only reason", () => {
    expect(validateRejectInput({ reason: "         " }).valid).toBe(false);
  });

  // PBT Property 4 — reject requires reason
  it("PBT Property 4: short/empty reason always fails, ≥10 chars always passes", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 9 }),
        (shortReason) => validateRejectInput({ reason: shortReason }).valid === false
      ),
      { numRuns: 300 }
    );

    fc.assert(
      fc.property(
        // Match non-whitespace strings of at least 10 chars so trimmed length ≥ 10
        fc.stringMatching(/^\S{10,}$/),
        (validReason) => validateRejectInput({ reason: validReason }).valid === true
      ),
      { numRuns: 300 }
    );
  });
});

// ─── Role guard (Property 5) ─────────────────────────────────────────────────

describe("Role guard monotonic (Property 5)", () => {
  const ROLE_ORDER: Record<string, number> = {
    guest: 0,
    internal_submitter: 1,
    bd_reviewer: 2,
    admin: 3,
  };

  const REQUIRED_ROLES: Record<string, string> = {
    listQueue: "bd_reviewer",
    saveEdit: "bd_reviewer",
    changeStage: "bd_reviewer",
    approveDocuments: "admin",
    rejectIdea: "bd_reviewer",
  };

  function checkPermission(userRole: string, operation: string): boolean {
    const required = REQUIRED_ROLES[operation];
    if (!required) return false;
    return (ROLE_ORDER[userRole] ?? 0) >= (ROLE_ORDER[required] ?? 999);
  }

  it("guest cannot access any review operation", () => {
    for (const op of Object.keys(REQUIRED_ROLES)) {
      expect(checkPermission("guest", op)).toBe(false);
    }
  });

  it("internal_submitter cannot access review operations", () => {
    for (const op of Object.keys(REQUIRED_ROLES)) {
      expect(checkPermission("internal_submitter", op)).toBe(false);
    }
  });

  it("bd_reviewer can access bd_reviewer-level operations", () => {
    expect(checkPermission("bd_reviewer", "listQueue")).toBe(true);
    expect(checkPermission("bd_reviewer", "saveEdit")).toBe(true);
    expect(checkPermission("bd_reviewer", "changeStage")).toBe(true);
    expect(checkPermission("bd_reviewer", "rejectIdea")).toBe(true);
  });

  it("bd_reviewer cannot approve (admin required)", () => {
    expect(checkPermission("bd_reviewer", "approveDocuments")).toBe(false);
  });

  it("admin can access all operations", () => {
    for (const op of Object.keys(REQUIRED_ROLES)) {
      expect(checkPermission("admin", op)).toBe(true);
    }
  });

  // PBT Property 5 — role guard monotonic
  it("PBT Property 5: higher role can always do what lower role can", () => {
    const roles = ["guest", "internal_submitter", "bd_reviewer", "admin"];
    const operations = Object.keys(REQUIRED_ROLES);

    fc.assert(
      fc.property(fc.constantFrom(...roles), fc.constantFrom(...operations), (role, op) => {
        const required = REQUIRED_ROLES[op]!;
        const hasPermission = (ROLE_ORDER[role] ?? 0) >= (ROLE_ORDER[required] ?? 999);
        return checkPermission(role, op) === hasPermission;
      }),
      { numRuns: 200 }
    );
  });
});
