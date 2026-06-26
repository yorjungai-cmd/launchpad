/**
 * Unit tests for DocumentGenerationRepository
 *
 * Uses vi.mock to mock the Supabase client — no real DB connection.
 * Tests: upsert idempotency, dedup guard, section update isolates correct row
 *
 * Ref: tasks.md — Task 2.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WatermarkStatus } from "@/shared/enums";
import type { OutputDocument, DocumentJob } from "@/modules/document-generation/types";
import type { DocumentGenerationRepository as DocumentGenerationRepositoryType } from "@/modules/document-generation/repository";

// ─── Mock Supabase server client ──────────────────────────────────────────────

const mockFrom = vi.fn();
const mockSupabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient),
  createAdminSupabaseClient: vi.fn(() => mockSupabaseClient),
}));

// ─── Test data ────────────────────────────────────────────────────────────────

const IDEA_ID = "idea-uuid-docgen-001";
const ANALYSIS_ID = "analysis-uuid-docgen-001";

const MOCK_DOC_ROW = {
  id: "doc-1",
  idea_id: IDEA_ID,
  analysis_id: ANALYSIS_ID,
  document_type: "feasibility_report" as const,
  stage_snapshot: "Sandbox" as const,
  title: "Feasibility Report",
  content_markdown: "# Report",
  content_edited_markdown: null,
  sections: null,
  watermark_status: "ai_draft",
  generation_status: "completed" as const,
  last_error: null,
  generated_at: "2026-06-25T00:00:00Z",
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
};

const MOCK_JOB_ROW = {
  id: "job-1",
  idea_id: IDEA_ID,
  analysis_id: ANALYSIS_ID,
  queue_message_id: null,
  status: "queued" as const,
  attempt_count: 0,
  last_error: null,
  enqueued_at: "2026-06-25T00:00:00Z",
  started_at: null,
  finished_at: null,
  created_at: "2026-06-25T00:00:00Z",
};

// ─── Import repository AFTER mocks are set up ─────────────────────────────────

describe("DocumentGenerationRepository", () => {
  let repoInstance: InstanceType<typeof DocumentGenerationRepositoryType>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/modules/document-generation/repository");
    repoInstance = new mod.DocumentGenerationRepository();
  });

  // ─── findByIdea() ─────────────────────────────────────────────────────────

  describe("findByIdea()", () => {
    it("should return mapped documents for an idea", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [MOCK_DOC_ROW], error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result: OutputDocument[] = await repoInstance.findByIdea(IDEA_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.ideaId).toBe(IDEA_ID);
      expect(result[0]!.documentType).toBe("feasibility_report");
      expect(result[0]!.watermarkStatus).toBe(WatermarkStatus.AI_DRAFT);
    });

    it("should return empty array when no documents exist", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findByIdea(IDEA_ID);
      expect(result).toHaveLength(0);
    });

    it("should throw when DB returns an error", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: "db error" } }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(repoInstance.findByIdea(IDEA_ID)).rejects.toThrow("findByIdea");
    });
  });

  // ─── findOne() ───────────────────────────────────────────────────────────

  describe("findOne()", () => {
    it("should return mapped document when row exists", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: MOCK_DOC_ROW, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findOne("doc-1");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("doc-1");
      expect(result?.generationStatus).toBe("completed");
    });

    it("should return null when row not found (PGRST116)", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116", message: "No rows found" },
        }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findOne("non-existent-id");
      expect(result).toBeNull();
    });
  });

  // ─── findByIdeaAndType() ─────────────────────────────────────────────────

  describe("findByIdeaAndType()", () => {
    it("should return document matching idea + type", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: MOCK_DOC_ROW, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findByIdeaAndType(IDEA_ID, "feasibility_report");

      expect(result).not.toBeNull();
      expect(result?.documentType).toBe("feasibility_report");
    });

    it("should return null when not found", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116", message: "No rows found" },
        }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findByIdeaAndType(IDEA_ID, "bmc");
      expect(result).toBeNull();
    });
  });

  // ─── upsertDocument() — idempotency ──────────────────────────────────────

  describe("upsertDocument() — idempotency", () => {
    it("should upsert and return mapped document with default watermark", async () => {
      const chain = {
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: MOCK_DOC_ROW, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.upsertDocument({
        ideaId: IDEA_ID,
        analysisId: ANALYSIS_ID,
        documentType: "feasibility_report",
        stageSnapshot: "Sandbox",
        title: "Feasibility Report",
        contentMarkdown: "# Report",
      });

      expect(result.documentType).toBe("feasibility_report");
      expect(result.watermarkStatus).toBe(WatermarkStatus.AI_DRAFT);
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          idea_id: IDEA_ID,
          analysis_id: ANALYSIS_ID,
          document_type: "feasibility_report",
          watermark_status: WatermarkStatus.AI_DRAFT,
          generation_status: "completed",
        }),
        { onConflict: "idea_id,document_type" }
      );
    });

    it("should use provided watermarkStatus and generationStatus when supplied", async () => {
      const customRow = {
        ...MOCK_DOC_ROW,
        watermark_status: "bd_reviewed",
        generation_status: "generating" as const,
      };
      const chain = {
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: customRow, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const _result = await repoInstance.upsertDocument({
        ideaId: IDEA_ID,
        analysisId: ANALYSIS_ID,
        documentType: "bmc",
        stageSnapshot: "Validation Sprint",
        title: "BMC",
        contentMarkdown: "# BMC",
        watermarkStatus: WatermarkStatus.BD_REVIEWED,
        generationStatus: "generating",
      });

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          watermark_status: WatermarkStatus.BD_REVIEWED,
          generation_status: "generating",
        }),
        { onConflict: "idea_id,document_type" }
      );
    });

    it("should throw when upsert fails", async () => {
      const chain = {
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "Conflict error" } }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(
        repoInstance.upsertDocument({
          ideaId: IDEA_ID,
          analysisId: ANALYSIS_ID,
          documentType: "bmc",
          stageSnapshot: "Sandbox",
          title: "BMC",
          contentMarkdown: "# BMC",
        })
      ).rejects.toThrow("upsertDocument");
    });
  });

  // ─── updateWatermark() ───────────────────────────────────────────────────

  describe("updateWatermark()", () => {
    it("should update watermark_status without error", async () => {
      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(
        repoInstance.updateWatermark("doc-1", WatermarkStatus.APPROVED)
      ).resolves.toBeUndefined();

      expect(chain.update).toHaveBeenCalledWith({
        watermark_status: WatermarkStatus.APPROVED,
      });
    });

    it("should throw when update fails", async () => {
      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "Update failed" } }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(repoInstance.updateWatermark("doc-1", WatermarkStatus.APPROVED)).rejects.toThrow(
        "updateWatermark"
      );
    });
  });

  // ─── markGenerationFailed() ──────────────────────────────────────────────

  describe("markGenerationFailed()", () => {
    it("should set generation_status=failed and last_error", async () => {
      const _chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        // second .eq() returns the final promise
        mockResolvedValue: undefined,
      };
      // Chain: update().eq().eq() → resolves
      const eqFinal = vi.fn().mockResolvedValue({ error: null });
      const eqFirst = vi.fn().mockReturnValue({ eq: eqFinal });
      const updateMock = vi.fn().mockReturnValue({ eq: eqFirst });
      mockFrom.mockReturnValue({ update: updateMock });

      await expect(
        repoInstance.markGenerationFailed(IDEA_ID, "feasibility_report", "Claude timeout")
      ).resolves.toBeUndefined();

      expect(updateMock).toHaveBeenCalledWith({
        generation_status: "failed",
        last_error: "Claude timeout",
      });
    });
  });

  // ─── updateSection() — section update isolates correct row ───────────────

  describe("updateSection()", () => {
    it("should update only the targeted section, leaving others unchanged", async () => {
      const sections = [
        {
          key: "executive_summary",
          order: 1,
          title: "Executive Summary",
          content_markdown: "old content",
          source_ref: "ai_analysis.feasibility",
          is_ai_generated: true,
          updated_at: "2026-06-25T00:00:00Z",
        },
        {
          key: "problem_opportunity",
          order: 2,
          title: "Problem",
          content_markdown: "kept content",
          source_ref: null,
          is_ai_generated: false,
          updated_at: "2026-06-25T00:00:00Z",
        },
      ];

      // First call: read current sections
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: { sections, id: "doc-proposal-1" }, error: null }),
      };

      // Second call: update sections
      let capturedSections: typeof sections | null = null;
      const updateEqChain = {
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      const updateChain = {
        update: vi.fn().mockImplementation((payload: { sections: typeof sections }) => {
          capturedSections = payload.sections;
          return updateEqChain;
        }),
      };

      mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain);

      await repoInstance.updateSection(IDEA_ID, "executive_summary", "new content");

      // Only executive_summary should be updated
      const updated = capturedSections!;
      expect(updated[0]!.content_markdown).toBe("new content");
      // problem_opportunity is untouched
      expect(updated[1]!.content_markdown).toBe("kept content");
    });

    it("should throw when the project_proposal document is not found", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116", message: "No rows found" },
        }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(
        repoInstance.updateSection("non-existent-idea", "executive_summary", "content")
      ).rejects.toThrow("updateSection");
    });
  });

  // ─── createJob() ─────────────────────────────────────────────────────────

  describe("createJob()", () => {
    it("should create a queued job and return mapped DocumentJob", async () => {
      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: MOCK_JOB_ROW, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result: DocumentJob = await repoInstance.createJob(IDEA_ID, ANALYSIS_ID);

      expect(result.ideaId).toBe(IDEA_ID);
      expect(result.analysisId).toBe(ANALYSIS_ID);
      expect(result.status).toBe("queued");
      expect(result.attemptCount).toBe(0);
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          idea_id: IDEA_ID,
          analysis_id: ANALYSIS_ID,
          status: "queued",
        })
      );
    });

    it("should throw when insert fails", async () => {
      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "Insert failed" } }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(repoInstance.createJob(IDEA_ID, ANALYSIS_ID)).rejects.toThrow("createJob");
    });
  });

  // ─── updateJobStatus() ───────────────────────────────────────────────────

  describe("updateJobStatus()", () => {
    it("should update job status without error", async () => {
      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(
        repoInstance.updateJobStatus("job-1", "processing", { startedAt: "2026-06-25T00:00:00Z" })
      ).resolves.toBeUndefined();

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "processing",
          started_at: "2026-06-25T00:00:00Z",
        })
      );
    });

    it("should throw when update fails", async () => {
      const chain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "Update failed" } }),
      };
      mockFrom.mockReturnValue(chain);

      await expect(repoInstance.updateJobStatus("job-1", "done")).rejects.toThrow(
        "updateJobStatus"
      );
    });
  });

  // ─── findActiveJob() — dedup guard ───────────────────────────────────────

  describe("findActiveJob() — dedup guard", () => {
    it("should return null when no active job exists", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findActiveJob(IDEA_ID);
      expect(result).toBeNull();
    });

    it("should return active job when queued job exists", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: MOCK_JOB_ROW, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findActiveJob(IDEA_ID);
      expect(result).not.toBeNull();
      expect(result?.id).toBe("job-1");
      expect(result?.status).toBe("queued");
    });

    it("should return active job when processing job exists", async () => {
      const processingJob = { ...MOCK_JOB_ROW, id: "job-2", status: "processing" as const };
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: processingJob, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findActiveJob(IDEA_ID);
      expect(result?.status).toBe("processing");
    });

    it("should return null on DB error (fail-safe)", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "db error" } }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findActiveJob(IDEA_ID);
      expect(result).toBeNull();
    });

    it("should query with status IN [queued, processing] to catch both states", async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      await repoInstance.findActiveJob(IDEA_ID);

      expect(chain.in).toHaveBeenCalledWith("status", ["queued", "processing"]);
    });
  });

  // ─── Column mapping (snake_case → camelCase) ─────────────────────────────

  describe("column mapping (snake_case → camelCase)", () => {
    it("should correctly map all OutputDocument DB columns to camelCase", async () => {
      const fullRow = {
        ...MOCK_DOC_ROW,
        content_edited_markdown: "# Edited",
        sections: [
          {
            key: "executive_summary",
            order: 1,
            title: "Executive Summary",
            content_markdown: "# Summary",
            source_ref: "ai_analysis.feasibility",
            is_ai_generated: true,
            updated_at: "2026-06-25T00:00:00Z",
          },
        ],
        watermark_status: "bd_reviewed",
        generation_status: "completed" as const,
        last_error: null,
        generated_at: "2026-06-25T01:00:00Z",
      };

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: fullRow, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.findOne("doc-1");

      expect(result?.ideaId).toBe(IDEA_ID);
      expect(result?.analysisId).toBe(ANALYSIS_ID);
      expect(result?.stageSnapshot).toBe("Sandbox");
      expect(result?.contentMarkdown).toBe("# Report");
      expect(result?.contentEditedMarkdown).toBe("# Edited");
      expect(result?.watermarkStatus).toBe(WatermarkStatus.BD_REVIEWED);
      expect(result?.generationStatus).toBe("completed");
      expect(result?.generatedAt).toBe("2026-06-25T01:00:00Z");
      expect(result?.sections).toHaveLength(1);
      expect(result?.sections![0]!.key).toBe("executive_summary");
    });

    it("should correctly map all DocumentJob DB columns to camelCase", async () => {
      const fullJobRow = {
        ...MOCK_JOB_ROW,
        queue_message_id: 42,
        attempt_count: 2,
        last_error: "retry",
        started_at: "2026-06-25T00:01:00Z",
        finished_at: "2026-06-25T00:02:00Z",
      };

      const chain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: fullJobRow, error: null }),
      };
      mockFrom.mockReturnValue(chain);

      const result = await repoInstance.createJob(IDEA_ID, ANALYSIS_ID);

      expect(result.queueMessageId).toBe(42);
      expect(result.attemptCount).toBe(2);
      expect(result.lastError).toBe("retry");
      expect(result.startedAt).toBe("2026-06-25T00:01:00Z");
      expect(result.finishedAt).toBe("2026-06-25T00:02:00Z");
      expect(result.enqueuedAt).toBe("2026-06-25T00:00:00Z");
    });
  });

  // ─── singleton export ─────────────────────────────────────────────────────

  describe("singleton export", () => {
    it("documentGenerationRepository should be an instance of DocumentGenerationRepository", async () => {
      const mod = await import("@/modules/document-generation/repository");
      expect(mod.documentGenerationRepository).toBeInstanceOf(mod.DocumentGenerationRepository);
    });
  });
});
