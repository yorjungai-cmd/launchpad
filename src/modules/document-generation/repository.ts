/**
 * DocumentGenerationRepository — data access for output_documents and document_jobs.
 *
 * All DB column names (snake_case) are mapped to camelCase OutputDocument / DocumentJob
 * interface fields. Uses the server-side Supabase client (anon key + RLS).
 *
 * Note: The Database type in @/lib/supabase/types is a placeholder that will be replaced
 * by generated types from `pnpm supabase:types`. The `output_documents` and `document_jobs`
 * tables are not yet in the placeholder, so we use `any` for the Supabase client type here
 * and rely on runtime correctness validated by integration tests.
 *
 * Ref: design/components.md — Component 8: DocumentGenerationRepository
 *      design/data-model.md — output_documents, document_jobs
 *
 * Task 2.1
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WatermarkStatus } from "@/shared/enums";
import type {
  OutputDocument,
  DocumentJob,
  DocumentType,
  DocGenerationStatus,
  JobStatus,
  ProposalSection,
  StageDisplay,
  UpsertDocumentParams,
} from "./types";

// ─── DB Row types (snake_case) ────────────────────────────────────────────────

interface OutputDocumentRow {
  id: string;
  idea_id: string;
  analysis_id: string;
  document_type: DocumentType;
  stage_snapshot: StageDisplay;
  title: string;
  content_markdown: string | null;
  content_edited_markdown: string | null;
  sections: ProposalSection[] | null;
  watermark_status: string;
  generation_status: DocGenerationStatus;
  last_error: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentJobRow {
  id: string;
  idea_id: string;
  analysis_id: string;
  queue_message_id: number | null;
  status: JobStatus;
  attempt_count: number;
  last_error: string | null;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapRowToOutputDocument(row: OutputDocumentRow): OutputDocument {
  return {
    id: row.id,
    ideaId: row.idea_id,
    analysisId: row.analysis_id,
    documentType: row.document_type,
    stageSnapshot: row.stage_snapshot,
    title: row.title,
    contentMarkdown: row.content_markdown,
    contentEditedMarkdown: row.content_edited_markdown,
    sections: row.sections,
    watermarkStatus: row.watermark_status as WatermarkStatus,
    generationStatus: row.generation_status,
    lastError: row.last_error,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToDocumentJob(row: DocumentJobRow): DocumentJob {
  return {
    id: row.id,
    ideaId: row.idea_id,
    analysisId: row.analysis_id,
    queueMessageId: row.queue_message_id,
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    enqueuedAt: row.enqueued_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class DocumentGenerationRepository {
  private getClient(): any {
    return createServerSupabaseClient();
  }

  // ── output_documents ──────────────────────────────────────────────────────

  /** List all documents for an idea, ordered by document_type */
  async findByIdea(ideaId: string): Promise<OutputDocument[]> {
    const db = this.getClient();
    const { data, error } = await db
      .from("output_documents")
      .select("*")
      .eq("idea_id", ideaId)
      .order("document_type");
    if (error) throw new Error(`DocumentGenerationRepository.findByIdea: ${error.message}`);
    return (data ?? []).map((r: unknown) => mapRowToOutputDocument(r as OutputDocumentRow));
  }

  /** Get single document by id */
  async findOne(id: string): Promise<OutputDocument | null> {
    const db = this.getClient();
    const { data, error } = await db.from("output_documents").select("*").eq("id", id).single();
    if (error) {
      if (error.code === "PGRST116") return null;
      return null;
    }
    return data ? mapRowToOutputDocument(data as unknown as OutputDocumentRow) : null;
  }

  /** Get a specific document type for an idea */
  async findByIdeaAndType(
    ideaId: string,
    documentType: DocumentType
  ): Promise<OutputDocument | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from("output_documents")
      .select("*")
      .eq("idea_id", ideaId)
      .eq("document_type", documentType)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      return null;
    }
    return data ? mapRowToOutputDocument(data as unknown as OutputDocumentRow) : null;
  }

  /**
   * INSERT or UPDATE a document by (idea_id, document_type).
   * ON CONFLICT → update content, status, generated_at.
   */
  async upsertDocument(params: UpsertDocumentParams): Promise<OutputDocument> {
    const db = this.getClient();
    const { data, error } = await db
      .from("output_documents")
      .upsert(
        {
          idea_id: params.ideaId,
          analysis_id: params.analysisId,
          document_type: params.documentType,
          stage_snapshot: params.stageSnapshot,
          title: params.title,
          content_markdown: params.contentMarkdown,
          sections: params.sections ?? null,
          watermark_status: params.watermarkStatus ?? WatermarkStatus.AI_DRAFT,
          generation_status: params.generationStatus ?? "completed",
          generated_at: new Date().toISOString(),
        },
        { onConflict: "idea_id,document_type" }
      )
      .select()
      .single();
    if (error || !data)
      throw new Error(
        `DocumentGenerationRepository.upsertDocument: ${error?.message ?? "no row returned"}`
      );
    return mapRowToOutputDocument(data as unknown as OutputDocumentRow);
  }

  /** Update watermark_status for a document */
  async updateWatermark(id: string, watermarkStatus: WatermarkStatus): Promise<void> {
    const db = this.getClient();
    const { error } = await db
      .from("output_documents")
      .update({ watermark_status: watermarkStatus })
      .eq("id", id);
    if (error) throw new Error(`DocumentGenerationRepository.updateWatermark: ${error.message}`);
  }

  /** Update a single section in the sections JSONB (for proposal auto-update) */
  async updateSection(ideaId: string, sectionKey: string, contentMarkdown: string): Promise<void> {
    const db = this.getClient();
    // Read current sections
    const { data, error: readError } = await db
      .from("output_documents")
      .select("sections, id")
      .eq("idea_id", ideaId)
      .eq("document_type", "project_proposal")
      .single();
    if (readError || !data)
      throw new Error(`DocumentGenerationRepository.updateSection: proposal not found`);
    const sections: ProposalSection[] = (data as any).sections ?? [];
    const updatedSections = sections.map((s) =>
      s.key === sectionKey
        ? { ...s, content_markdown: contentMarkdown, updated_at: new Date().toISOString() }
        : s
    );
    const { error: updateError } = await db
      .from("output_documents")
      .update({ sections: updatedSections })
      .eq("id", (data as any).id);
    if (updateError)
      throw new Error(`DocumentGenerationRepository.updateSection: ${updateError.message}`);
  }

  /** Mark a document's generation as failed */
  async markGenerationFailed(
    ideaId: string,
    documentType: DocumentType,
    errorMsg: string
  ): Promise<void> {
    const db = this.getClient();
    const { error } = await db
      .from("output_documents")
      .update({ generation_status: "failed", last_error: errorMsg })
      .eq("idea_id", ideaId)
      .eq("document_type", documentType);
    if (error)
      throw new Error(`DocumentGenerationRepository.markGenerationFailed: ${error.message}`);
  }

  // ── document_jobs ─────────────────────────────────────────────────────────

  /** Create a document_jobs row with status='queued' */
  async createJob(ideaId: string, analysisId: string): Promise<DocumentJob> {
    const db = this.getClient();
    const { data, error } = await db
      .from("document_jobs")
      .insert({
        idea_id: ideaId,
        analysis_id: analysisId,
        status: "queued",
        enqueued_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !data)
      throw new Error(
        `DocumentGenerationRepository.createJob: ${error?.message ?? "no row returned"}`
      );
    return mapRowToDocumentJob(data as unknown as DocumentJobRow);
  }

  /** Update job status + optional timestamps */
  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    extra?: { startedAt?: string; finishedAt?: string; lastError?: string; queueMessageId?: number }
  ): Promise<void> {
    const db = this.getClient();
    const { error } = await db
      .from("document_jobs")
      .update({
        status,
        started_at: extra?.startedAt,
        finished_at: extra?.finishedAt,
        last_error: extra?.lastError ?? null,
        queue_message_id: extra?.queueMessageId,
      })
      .eq("id", jobId);
    if (error) throw new Error(`DocumentGenerationRepository.updateJobStatus: ${error.message}`);
  }

  /** Find an active (queued or processing) job for an idea — dedup guard */
  async findActiveJob(ideaId: string): Promise<DocumentJob | null> {
    const db = this.getClient();
    const { data, error } = await db
      .from("document_jobs")
      .select("*")
      .eq("idea_id", ideaId)
      .in("status", ["queued", "processing"])
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data ? mapRowToDocumentJob(data as unknown as DocumentJobRow) : null;
  }
}

/** Singleton — import this everywhere, do not instantiate directly */
export const documentGenerationRepository = new DocumentGenerationRepository();
