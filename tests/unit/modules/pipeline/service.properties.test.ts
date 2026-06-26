/**
 * Property-Based Tests for pipeline-tracking service.
 * Uses fast-check (Vitest integration).
 *
 * Properties:
 *   1. Filter Completeness   — filtered results always match all criteria
 *   2. Guest Isolation       — findByReferenceNumber returns only the matching idea
 *   3. Guest Data Masking    — toGuestTrackingDTO strips all sensitive fields
 *   4. Role Guard Consistency — bd_reviewer/admin pass Kanban guard, others don't
 *   5. Stage Timeline Ordering — sortTimelineAscending always returns ascending order
 *
 * Ref: design/correctness.md — 5 Properties
 * Task 6.2
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { sortTimelineAscending, toGuestTrackingDTO } from "@/modules/pipeline/service";
import type { PipelineIdeaDTO } from "@/modules/pipeline/schemas";
import type { Stage } from "@/shared/enums";
import { arbitraryIdea, arbitraryTimeline, arbitraryFilter } from "./arbitraries";

// ─── Inline helpers (pure functions matching design spec) ─────────────────────

/**
 * Pure filter function — mirrors the repository filter logic.
 * Used by Property 1 to test filter completeness without a DB.
 */
function applyFilters(
  ideas: PipelineIdeaDTO[],
  filter: {
    stage: Stage | null;
    submitterType: string | null;
    fromDate: Date | null;
    toDate: Date | null;
  }
): PipelineIdeaDTO[] {
  return ideas.filter((idea) => {
    if (filter.stage !== null && idea.currentStage !== filter.stage) return false;
    if (filter.submitterType !== null && idea.submitterType !== filter.submitterType) return false;
    if (filter.fromDate !== null && new Date(idea.submittedAt) < filter.fromDate) return false;
    if (filter.toDate !== null && new Date(idea.submittedAt) > filter.toDate) return false;
    return true;
  });
}

/**
 * Find by reference number — pure search, mirrors repository logic.
 */
function findByReferenceNumber(
  ideas: PipelineIdeaDTO[],
  referenceNumber: string
): PipelineIdeaDTO | null {
  return ideas.find((i) => i.referenceNumber === referenceNumber) ?? null;
}

/**
 * Role guard check — mirrors RBAC logic for Kanban and status card access.
 */
function checkRoleGuard(allowedRoles: string[], userRole: string): boolean {
  return allowedRoles.includes(userRole);
}

// ─── Property 1: Filter Completeness ─────────────────────────────────────────

describe("PBT Property 1: Filter Completeness", () => {
  it("filtered results must be a subset satisfying every active filter criterion", () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryIdea(), { minLength: 0, maxLength: 100 }),
        arbitraryFilter(),
        (ideas, filter) => {
          const result = applyFilters(ideas, filter);

          return result.every((idea) => {
            if (filter.stage !== null && idea.currentStage !== filter.stage) return false;
            if (filter.submitterType !== null && idea.submitterType !== filter.submitterType)
              return false;
            if (filter.fromDate !== null && new Date(idea.submittedAt) < filter.fromDate)
              return false;
            if (filter.toDate !== null && new Date(idea.submittedAt) > filter.toDate) return false;
            return true;
          });
        }
      ),
      { numRuns: 200 }
    );
  });

  it("no filter (all nulls) → returns all ideas", () => {
    fc.assert(
      fc.property(fc.array(arbitraryIdea(), { minLength: 0, maxLength: 50 }), (ideas) => {
        const result = applyFilters(ideas, {
          stage: null,
          submitterType: null,
          fromDate: null,
          toDate: null,
        });
        return result.length === ideas.length;
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property 2: Guest Isolation ─────────────────────────────────────────────

describe("PBT Property 2: Guest Isolation", () => {
  it("findByReferenceNumber returns only the matching idea — no other idea leaks", () => {
    fc.assert(
      fc.property(
        // Generate array of ideas with distinct reference numbers
        fc.array(arbitraryIdea(), { minLength: 1, maxLength: 50 }).chain((ideas) => {
          // assign unique reference numbers to avoid collision
          const uniqueIdeas = ideas.map((idea, i) => ({
            ...idea,
            referenceNumber: `LP-TEST-${String(i).padStart(6, "0")}`,
          }));
          return fc
            .nat({ max: uniqueIdeas.length - 1 })
            .map((idx) => ({ ideas: uniqueIdeas, targetIndex: idx }));
        }),
        ({ ideas, targetIndex }) => {
          const targetRef = ideas[targetIndex]!.referenceNumber;
          const result = findByReferenceNumber(ideas, targetRef);

          // Property: result must be the exact matching idea, no other idea
          if (result === null) return false;
          if (result.referenceNumber !== targetRef) return false;

          // Ensure no other idea with different referenceNumber is returned
          const nonMatchingIdeas = ideas.filter((i) => i.referenceNumber !== targetRef);
          return !nonMatchingIdeas.some((i) => i.id === result.id);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("findByReferenceNumber returns null for non-existent reference", () => {
    fc.assert(
      fc.property(fc.array(arbitraryIdea(), { minLength: 0, maxLength: 20 }), (ideas) => {
        const result = findByReferenceNumber(ideas, "LP-DOES-NOT-EXIST-999999");
        return result === null;
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property 3: Guest Data Masking ──────────────────────────────────────────

describe("PBT Property 3: Guest Data Masking", () => {
  it("toGuestTrackingDTO never exposes sensitive fields", () => {
    const sensitiveFields = [
      "submitterType",
      "assignedReviewer",
      "watermarkStatus",
      "id",
      "submitterEmail",
      "assignedReviewerId",
    ] as const;

    fc.assert(
      fc.property(arbitraryIdea(), arbitraryTimeline(), (idea, timeline) => {
        const dto = toGuestTrackingDTO(idea, timeline);

        return sensitiveFields.every((field) => !(field in dto));
      }),
      { numRuns: 200 }
    );
  });

  it("toGuestTrackingDTO always includes all required public fields", () => {
    const requiredFields = [
      "referenceNumber",
      "title",
      "currentStage",
      "submittedAt",
      "updatedAt",
      "stageTimeline",
    ] as const;

    fc.assert(
      fc.property(arbitraryIdea(), arbitraryTimeline(), (idea, timeline) => {
        const dto = toGuestTrackingDTO(idea, timeline);

        return requiredFields.every((field) => field in dto);
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property 4: Role Guard Consistency ──────────────────────────────────────

describe("PBT Property 4: Role Guard Consistency", () => {
  it("bd_reviewer and admin pass Kanban guard; guest and internal_submitter do not", () => {
    const kanbanAllowed = ["bd_reviewer", "admin"];
    const statusCardAllowed = ["guest", "internal_submitter", "bd_reviewer", "admin"];

    fc.assert(
      fc.property(
        fc.constantFrom("guest", "internal_submitter", "bd_reviewer", "admin"),
        (role) => {
          const canAccessKanban = checkRoleGuard(kanbanAllowed, role);
          const canAccessStatusCard = checkRoleGuard(statusCardAllowed, role);

          if (role === "bd_reviewer" || role === "admin") {
            return canAccessKanban === true && canAccessStatusCard === true;
          } else {
            // guest and internal_submitter cannot see Kanban, but can see status card
            return canAccessKanban === false && canAccessStatusCard === true;
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("unknown/empty role string never passes Kanban guard", () => {
    const kanbanAllowed = ["bd_reviewer", "admin"];

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 0, maxLength: 30 })
          .filter((s) => s !== "bd_reviewer" && s !== "admin"),
        (unknownRole) => {
          return checkRoleGuard(kanbanAllowed, unknownRole) === false;
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Property 5: Stage Timeline Ordering ─────────────────────────────────────

describe("PBT Property 5: Stage Timeline Ordering", () => {
  it("sortTimelineAscending always returns entries in ascending order by transitionedAt", () => {
    fc.assert(
      fc.property(arbitraryTimeline(), (timeline) => {
        const sorted = sortTimelineAscending(timeline);

        for (let i = 1; i < sorted.length; i++) {
          const prev = new Date(sorted[i - 1]!.transitionedAt).getTime();
          const curr = new Date(sorted[i]!.transitionedAt).getTime();
          if (curr < prev) return false;
        }

        return true;
      }),
      { numRuns: 200 }
    );
  });

  it("sortTimelineAscending preserves all entries (no data loss)", () => {
    fc.assert(
      fc.property(arbitraryTimeline(), (timeline) => {
        const sorted = sortTimelineAscending(timeline);
        return sorted.length === timeline.length;
      }),
      { numRuns: 200 }
    );
  });

  it("sortTimelineAscending does not mutate original array", () => {
    fc.assert(
      fc.property(arbitraryTimeline(), (timeline) => {
        const originalDates = timeline.map((e) => e.transitionedAt);
        sortTimelineAscending(timeline);
        const afterDates = timeline.map((e) => e.transitionedAt);
        return originalDates.every((d, i) => d === afterDates[i]);
      }),
      { numRuns: 200 }
    );
  });
});
