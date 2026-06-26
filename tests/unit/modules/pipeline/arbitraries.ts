/**
 * fast-check Arbitrary generators for pipeline-tracking PBT tests.
 *
 * Exports:
 *   arbitraryIdea()     — generates a full PipelineIdeaDTO with random valid fields
 *   arbitraryTimeline() — generates StageTimelineEntryDTO[] with random dates
 *
 * Ref: design/correctness.md — Arbitrary Generators
 * Task 6.2
 */

import * as fc from "fast-check";
import { Stage, WatermarkStatus } from "@/shared/enums";
import { SubmitterType } from "@/modules/pipeline/schemas";
import type { PipelineIdeaDTO, StageTimelineEntryDTO } from "@/modules/pipeline/schemas";

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Generates a random ISO 8601 datetime string within [2024-01-01, 2029-12-31].
 * Uses integer milliseconds to avoid fc.date() edge-case invalid values.
 */
const MIN_TS = new Date("2024-01-01T00:00:00.000Z").getTime(); // 1_704_067_200_000
const MAX_TS = new Date("2029-12-31T23:59:59.999Z").getTime(); // 1_893_455_999_999

function arbitraryIsoDate(min = MIN_TS, max = MAX_TS): fc.Arbitrary<string> {
  return fc.integer({ min, max }).map((ms) => new Date(ms).toISOString());
}

function arbitraryDate(min = MIN_TS, max = MAX_TS): fc.Arbitrary<Date> {
  return fc.integer({ min, max }).map((ms) => new Date(ms));
}

// ─── arbitraryIdea ────────────────────────────────────────────────────────────

/**
 * Generates a PipelineIdeaDTO with random but valid field values.
 * All sensitive fields (submitterType, assignedReviewer, watermarkStatus, id)
 * are included so masking tests can verify they are stripped.
 */
export function arbitraryIdea(): fc.Arbitrary<PipelineIdeaDTO> {
  return fc.record<PipelineIdeaDTO>({
    id: fc.uuid(),
    referenceNumber: fc
      .tuple(
        fc.nat({ max: 255 }).map((n) => n.toString(16).padStart(2, "0").toUpperCase()),
        fc.nat({ max: 9999 }).map((n) => String(n).padStart(4, "0")),
        fc.nat({ max: 999999 }).map((n) => String(n).padStart(6, "0"))
      )
      .map(([prefix, year, seq]) => `LP-${prefix}${year}-${seq}`),
    title: fc.string({ minLength: 1, maxLength: 200 }),
    currentStage: fc.constantFrom(...Object.values(Stage)),
    submitterType: fc.constantFrom(...Object.values(SubmitterType)),
    assignedReviewer: fc.option(
      fc.record({
        id: fc.uuid(),
        fullName: fc.string({ minLength: 1, maxLength: 100 }),
      }),
      { nil: null }
    ),
    submittedAt: arbitraryIsoDate(),
    updatedAt: arbitraryIsoDate(),
    watermarkStatus: fc.constantFrom(...Object.values(WatermarkStatus)),
  });
}

// ─── arbitraryTimeline ────────────────────────────────────────────────────────

/**
 * Generates an array of StageTimelineEntryDTO with random dates (unordered).
 * Used to verify that sortTimelineAscending always produces a sorted output.
 */
export function arbitraryTimeline(): fc.Arbitrary<StageTimelineEntryDTO[]> {
  return fc.array(
    fc.record<StageTimelineEntryDTO>({
      fromStage: fc.option(fc.constantFrom(...Object.values(Stage)), { nil: null }),
      toStage: fc.constantFrom(...Object.values(Stage)),
      transitionedAt: arbitraryIsoDate(),
      note: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: null }),
    }),
    { minLength: 0, maxLength: 20 }
  );
}

// ─── arbitraryFilter ─────────────────────────────────────────────────────────

/**
 * Generates a KanbanFilter record with optional (nullable) fields.
 * Used for Filter Completeness property.
 */
export function arbitraryFilter(): fc.Arbitrary<{
  stage: Stage | null;
  submitterType: string | null;
  fromDate: Date | null;
  toDate: Date | null;
}> {
  return fc.record({
    stage: fc.option(fc.constantFrom(...Object.values(Stage)), { nil: null }),
    submitterType: fc.option(fc.constantFrom(...Object.values(SubmitterType)), { nil: null }),
    fromDate: fc.option(arbitraryDate(), { nil: null }),
    toDate: fc.option(arbitraryDate(), { nil: null }),
  });
}
