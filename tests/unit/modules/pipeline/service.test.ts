/**
 * Unit tests for pipeline-tracking service pure functions and PipelineService.
 *
 * Tests:
 *   - sortTimelineAscending: empty, single, unsorted, duplicates, no mutation
 *   - toGuestTrackingDTO: field masking, field inclusion, timeline sort
 *   - PipelineService.getStatusCard: mock repository, sorted timeline
 *
 * Ref: tasks.md — Task 6.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sortTimelineAscending,
  toGuestTrackingDTO,
  PipelineService,
} from "@/modules/pipeline/service";
import type { StageTimelineEntryDTO, PipelineIdeaDTO } from "@/modules/pipeline/schemas";
import { Stage, WatermarkStatus } from "@/shared/enums";
import { SubmitterType } from "@/modules/pipeline/schemas";

// ─── Mock repository ──────────────────────────────────────────────────────────

vi.mock("@/modules/pipeline/repository", () => ({
  pipelineRepository: {
    findKanbanIdeas: vi.fn(),
    findIdeaById: vi.fn(),
    findIdeaByReferenceNumber: vi.fn(),
  },
  PipelineRepository: vi.fn(),
}));

// ─── Mock Supabase ────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(),
    auth: { getUser: vi.fn(), getSession: vi.fn() },
  })),
}));

// ─── Typed mock references (imported after vi.mock hoisting) ─────────────────

import { pipelineRepository } from "@/modules/pipeline/repository";
const mockFindIdeaById = vi.mocked(pipelineRepository.findIdeaById);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(isoDate: string): StageTimelineEntryDTO {
  return {
    fromStage: null,
    toStage: Stage.VALIDATION_SPRINT,
    transitionedAt: isoDate,
    note: null,
  };
}

function makeIdea(overrides: Partial<PipelineIdeaDTO> = {}): PipelineIdeaDTO {
  return {
    id: "idea-uuid-0001",
    referenceNumber: "LP-2024-000001",
    title: "Test Idea",
    currentStage: Stage.SANDBOX,
    submitterType: SubmitterType.EMPLOYEE,
    assignedReviewer: null,
    submittedAt: "2024-03-01T00:00:00.000Z",
    updatedAt: "2024-03-02T00:00:00.000Z",
    watermarkStatus: WatermarkStatus.AI_DRAFT,
    ...overrides,
  };
}

// ─── sortTimelineAscending ────────────────────────────────────────────────────

describe("sortTimelineAscending()", () => {
  it("empty array → returns []", () => {
    expect(sortTimelineAscending([])).toEqual([]);
  });

  it("single entry → returns copy (not same reference)", () => {
    const entry = makeEntry("2024-06-01T00:00:00.000Z");
    const result = sortTimelineAscending([entry]);
    expect(result).toHaveLength(1);
    expect(result).not.toBe([entry]); // different array reference
    expect(result[0]).toBe(entry); // same object inside (shallow copy)
  });

  it("unsorted array → sorted ascending by transitionedAt", () => {
    const entries = [
      makeEntry("2024-06-03T00:00:00.000Z"),
      makeEntry("2024-06-01T00:00:00.000Z"),
      makeEntry("2024-06-02T00:00:00.000Z"),
    ];
    const result = sortTimelineAscending(entries);
    expect(result[0]!.transitionedAt).toBe("2024-06-01T00:00:00.000Z");
    expect(result[1]!.transitionedAt).toBe("2024-06-02T00:00:00.000Z");
    expect(result[2]!.transitionedAt).toBe("2024-06-03T00:00:00.000Z");
  });

  it("duplicate timestamps → stable (all entries present)", () => {
    const entries = [
      makeEntry("2024-06-01T00:00:00.000Z"),
      makeEntry("2024-06-01T00:00:00.000Z"),
      makeEntry("2024-06-01T00:00:00.000Z"),
    ];
    const result = sortTimelineAscending(entries);
    expect(result).toHaveLength(3);
  });

  it("does NOT mutate the input array", () => {
    const entries = [makeEntry("2024-06-03T00:00:00.000Z"), makeEntry("2024-06-01T00:00:00.000Z")];
    const originalFirst = entries[0]!.transitionedAt;
    sortTimelineAscending(entries);
    // Original array should remain unchanged
    expect(entries[0]!.transitionedAt).toBe(originalFirst);
  });
});

// ─── toGuestTrackingDTO ───────────────────────────────────────────────────────

describe("toGuestTrackingDTO()", () => {
  const idea = makeIdea({
    assignedReviewer: { id: "reviewer-uuid", fullName: "BD Reviewer" },
  });
  const timeline: StageTimelineEntryDTO[] = [
    makeEntry("2024-06-03T00:00:00.000Z"),
    makeEntry("2024-06-01T00:00:00.000Z"),
  ];

  it('does NOT include field "submitterType" in output', () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto).not.toHaveProperty("submitterType");
  });

  it('does NOT include field "assignedReviewer" in output', () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto).not.toHaveProperty("assignedReviewer");
  });

  it('does NOT include field "watermarkStatus" in output', () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto).not.toHaveProperty("watermarkStatus");
  });

  it('does NOT include field "id" in output', () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto).not.toHaveProperty("id");
  });

  it('includes field "referenceNumber"', () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto.referenceNumber).toBe(idea.referenceNumber);
  });

  it('includes field "title"', () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto.title).toBe(idea.title);
  });

  it('includes field "currentStage"', () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto.currentStage).toBe(idea.currentStage);
  });

  it('includes field "submittedAt"', () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto.submittedAt).toBe(idea.submittedAt);
  });

  it('includes field "updatedAt"', () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto.updatedAt).toBe(idea.updatedAt);
  });

  it('includes field "stageTimeline"', () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto).toHaveProperty("stageTimeline");
  });

  it("stageTimeline is sorted ascending", () => {
    const dto = toGuestTrackingDTO(idea, timeline);
    expect(dto.stageTimeline[0]!.transitionedAt).toBe("2024-06-01T00:00:00.000Z");
    expect(dto.stageTimeline[1]!.transitionedAt).toBe("2024-06-03T00:00:00.000Z");
  });
});

// ─── PipelineService.getStatusCard ───────────────────────────────────────────

describe("PipelineService.getStatusCard()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns statusCard with sorted timeline (ascending)", async () => {
    const unsortedTimeline: StageTimelineEntryDTO[] = [
      makeEntry("2024-06-05T00:00:00.000Z"),
      makeEntry("2024-06-03T00:00:00.000Z"),
      makeEntry("2024-06-04T00:00:00.000Z"),
    ];

    mockFindIdeaById.mockResolvedValue({
      ...makeIdea(),
      stageTimeline: unsortedTimeline,
    });

    const service = new PipelineService();
    const result = await service.getStatusCard({ ideaId: "idea-uuid-0001" });

    expect(result.statusCard).toBeDefined();
    expect(result.statusCard.stageTimeline).toHaveLength(3);
    // Verify ascending order
    expect(result.statusCard.stageTimeline[0]!.transitionedAt).toBe("2024-06-03T00:00:00.000Z");
    expect(result.statusCard.stageTimeline[1]!.transitionedAt).toBe("2024-06-04T00:00:00.000Z");
    expect(result.statusCard.stageTimeline[2]!.transitionedAt).toBe("2024-06-05T00:00:00.000Z");
  });

  it("returns statusCard even when mock returns already-sorted timeline", async () => {
    const sortedTimeline: StageTimelineEntryDTO[] = [
      makeEntry("2024-01-01T00:00:00.000Z"),
      makeEntry("2024-02-01T00:00:00.000Z"),
    ];

    mockFindIdeaById.mockResolvedValue({
      ...makeIdea(),
      stageTimeline: sortedTimeline,
    });

    const service = new PipelineService();
    const result = await service.getStatusCard({ ideaId: "idea-uuid-0001" });

    expect(result.statusCard.stageTimeline[0]!.transitionedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(result.statusCard.stageTimeline[1]!.transitionedAt).toBe("2024-02-01T00:00:00.000Z");
  });

  it("timeline in output is sorted ascending even when mock returns wrong order", async () => {
    const reversedTimeline: StageTimelineEntryDTO[] = [
      makeEntry("2024-12-31T00:00:00.000Z"),
      makeEntry("2024-01-01T00:00:00.000Z"),
      makeEntry("2024-06-15T00:00:00.000Z"),
    ];

    mockFindIdeaById.mockResolvedValue({
      ...makeIdea(),
      stageTimeline: reversedTimeline,
    });

    const service = new PipelineService();
    const result = await service.getStatusCard({ ideaId: "idea-uuid-0001" });

    const dates = result.statusCard.stageTimeline.map((e) => new Date(e.transitionedAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]!).toBeGreaterThanOrEqual(dates[i - 1]!);
    }
  });
});
