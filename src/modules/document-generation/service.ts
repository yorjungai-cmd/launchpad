/**
 * DocumentGenerationService — business logic for generating document sets.
 *
 * Orchestrates:
 *  - enqueueGeneration: dedup guard → create job → pgmq_send
 *  - generateDocumentSet: template + compose + Claude narrative → upsert docs
 *  - composeProjectProposal: 10-section proposal with source_ref mapping
 *  - regenerateProposalSection: auto-update specific section (US-14.2)
 *  - resolveDocumentTypesForStage: exported for tests
 *
 * Ref: design/components.md — Component 2: DocumentGenerationService
 * Task 5.1, 6.1, 6.2
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import logger from "@/lib/logger";
import { documentGenerationRepository } from "./repository";
import { resolveDocumentTypesForStage, getTemplate } from "./templates";
import type { DocumentTemplate } from "./templates/document-templates";
import {
  composeSections,
  assembleMarkdown,
  fillNarrativeSections,
} from "@/lib/document-generation/compose";
import type { OutputDocument, UpsertDocumentParams, StageDisplay, ProposalSection } from "./types";
import type { TemplateData } from "./templates/document-templates";
import { WatermarkStatus } from "@/shared/enums";
import { notificationService } from "@/modules/notification/service";

export { resolveDocumentTypesForStage };

const QUEUE_NAME = "document_generation_jobs";

// ─── Service ─────────────────────────────────────────────────────────────────

export class DocumentGenerationService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getDb(): any {
    return createServerSupabaseClient();
  }

  /**
   * Non-blocking enqueue: guard duplicate → create job → pgmq_send.
   * Called by ai-analysis after analysis completes.
   */
  async enqueueGeneration(
    ideaId: string,
    analysisId: string
  ): Promise<{ jobId: string; status: "queued" | "already_active" }> {
    const active = await documentGenerationRepository.findActiveJob(ideaId);
    if (active) {
      logger.warn(
        { ideaId },
        "DocumentGenerationService: active job already exists — skipping enqueue"
      );
      return { jobId: active.id, status: "already_active" };
    }

    const job = await documentGenerationRepository.createJob(ideaId, analysisId);
    const db = this.getDb();

    const { data: msgId, error } = await db.rpc("pgmq_send", {
      queue_name: QUEUE_NAME,
      msg: { ideaId, analysisId, jobId: job.id, timestamp: new Date().toISOString() },
    });

    if (error) {
      logger.error(
        { ideaId, jobId: job.id, error: error.message },
        "DocumentGenerationService: pgmq_send failed — job created but not queued"
      );
      // Non-fatal: cron fallback will re-scan
    } else if (msgId != null) {
      await documentGenerationRepository.updateJobStatus(job.id, "queued", {
        queueMessageId: msgId as number,
      });
    }

    logger.info({ ideaId, jobId: job.id }, "DocumentGenerationService: generation enqueued");
    return { jobId: job.id, status: "queued" };
  }

  /**
   * Generate the full document set for an idea from analysis data.
   * Called by the Edge Function worker.
   * Returns list of created/updated documents.
   *
   * @param options.documentTypes - When provided, only the listed document type(s) are
   *   generated. Allows chunked per-type generation (Vercel 60 s timeout protection)
   *   without re-generating the entire set. When omitted, all types for the idea's
   *   stage are produced.
   */
  async generateDocumentSet(
    ideaId: string,
    analysisId: string,
    analysis: AnalysisData,
    callClaude: ClaudeNarrativeFn,
    options?: { documentTypes?: string[] }
  ): Promise<OutputDocument[]> {
    const stageDisplay = analysis.stage ?? "Sandbox";
    const allDocumentTypes = resolveDocumentTypesForStage(stageDisplay);
    const documentTypes =
      options?.documentTypes && options.documentTypes.length > 0
        ? allDocumentTypes.filter((t) => options.documentTypes!.includes(t))
        : allDocumentTypes;

    const templateData: TemplateData = {
      ideaTitle: analysis.ideaTitle,
      stage: stageDisplay as StageDisplay,
      ideaType: analysis.ideaType ?? "SaaS",
      summary: analysis.summary ?? "",
      strategicFitScore: analysis.strategicFitScore,
      marketPotentialScore: analysis.marketPotentialScore,
      technicalFeasibilityScore: analysis.technicalFeasibilityScore,
      resourceRequirementScore: analysis.resourceRequirementScore,
      businessImpactScore: analysis.businessImpactScore,
      strategicFitReasoning: analysis.strategicFitReasoning,
      marketPotentialReasoning: analysis.marketPotentialReasoning,
      technicalFeasibilityReasoning: analysis.technicalFeasibilityReasoning,
      resourceRequirementReasoning: analysis.resourceRequirementReasoning,
      businessImpactReasoning: analysis.businessImpactReasoning,
      recommendedAction: analysis.recommendedAction,
      recommendedActionReasoning: analysis.recommendedActionReasoning,
      portfolioMatches: analysis.portfolioMatches ?? [],
      referenceNumber: analysis.referenceNumber,
      submitterName: analysis.submitterName ?? "",
    };

    const results: OutputDocument[] = [];

    // Step 1: prepare all non-proposal docs synchronously (compose sections, collect narrative keys)
    const preparedDocs = documentTypes
      .filter((docType) => docType !== "project_proposal")
      .map((docType) => {
        const template = getTemplate(docType) as DocumentTemplate | undefined;
        if (!template) {
          logger.warn({ docType }, "DocumentGenerationService: no template found — skipping");
          return null;
        }
        const sections = composeSections(template, templateData);
        const narrativeKeys = sections.filter((s) => s.needsNarrative).map((s) => s.key);
        return { docType, template, sections, narrativeKeys };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    // Step 2: fire all Claude narrative calls in parallel — avoids sequential latency stacking
    // that exceeds Vercel's 60s serverless function limit on Sandbox (5 doc types × ~12s = ~60s)
    const narrativesArr = await Promise.all(
      preparedDocs.map(async ({ docType, narrativeKeys }) => {
        if (narrativeKeys.length === 0) return {} as Record<string, string>;
        try {
          return await callClaude({
            ideaTitle: templateData.ideaTitle,
            summary: templateData.summary,
            stage: templateData.stage,
            ideaType: templateData.ideaType,
            recommendedAction: templateData.recommendedAction,
            portfolioMatches: templateData.portfolioMatches,
            feasibilityScores: {
              strategicFit: templateData.strategicFitScore,
              marketPotential: templateData.marketPotentialScore,
              technicalFeasibility: templateData.technicalFeasibilityScore,
              resourceRequirement: templateData.resourceRequirementScore,
              businessImpact: templateData.businessImpactScore,
            },
            documentType: docType,
            sectionKeys: narrativeKeys,
          });
        } catch (err) {
          logger.warn(
            { docType, err },
            "DocumentGenerationService: Claude narrative failed — using placeholder fallback"
          );
          return {} as Record<string, string>;
        }
      })
    );

    // Step 3: assemble and upsert each document sequentially (fast: Supabase writes only)
    for (let i = 0; i < preparedDocs.length; i++) {
      const { docType, template, sections } = preparedDocs[i]!;
      const narratives = narrativesArr[i] ?? {};
      const filledSections =
        Object.keys(narratives).length > 0 ? fillNarrativeSections(sections, narratives) : sections;
      const contentMarkdown = assembleMarkdown(filledSections);
      const params: UpsertDocumentParams = {
        ideaId,
        analysisId,
        documentType: docType,
        stageSnapshot: stageDisplay as StageDisplay,
        title: template.titleKey,
        contentMarkdown,
        watermarkStatus: WatermarkStatus.AI_DRAFT,
        generationStatus: "completed",
      };
      const doc = await documentGenerationRepository.upsertDocument(params);
      results.push(doc);
    }

    // Compose proposal last — only when project_proposal is in the requested set.
    // In chunked (per-type) generation the caller passes documentTypes: ["project_proposal"]
    // explicitly; for the full-set path documentTypes is undefined so the guard passes.
    const shouldGenerateProposal =
      !options?.documentTypes || options.documentTypes.includes("project_proposal");
    if (shouldGenerateProposal) {
      const proposal = await this.composeProjectProposal(ideaId, analysisId, analysis, callClaude);
      results.push(proposal);
    }

    // Fire-and-forget: notify submitter that documents are ready.
    // Only fires for the full-set path (no documentTypes filter) — the chunked per-type
    // path does not send notifications (follow-up: orchestrate from the client loop instead).
    if (!options?.documentTypes) {
      this.notifyDocumentsReadyForIdea(ideaId).catch((err) => {
        logger.warn(
          { ideaId, err },
          "DocumentGenerationService: notifyDocumentsReady failed (non-critical)"
        );
      });
    }

    return results;
  }

  /**
   * Fire-and-forget: look up idea submitter data and send documents-ready notification.
   * Private helper called from generateDocumentSet.
   */
  private async notifyDocumentsReadyForIdea(ideaId: string): Promise<void> {
    const { createAdminSupabaseClient } = await import("@/lib/supabase/server");
    const db = createAdminSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db as any)
      .from("ideas")
      .select("id, title, submitter_email, submitter_name, user_id")
      .eq("id", ideaId)
      .maybeSingle();

    if (!data) return;

    notificationService.notifyDocumentsReady({
      id: data.id as string,
      title: data.title as string,
      submitterEmail: (data.submitter_email as string) ?? "",
      submitterName: (data.submitter_name as string) ?? null,
      submitterUserId: (data.user_id as string) ?? null,
    });
  }

  /**
   * Compose Project Proposal — 10 sections with source_ref mapping.
   * Task 6.1
   */
  async composeProjectProposal(
    ideaId: string,
    analysisId: string,
    analysis: AnalysisData,
    callClaude: ClaudeNarrativeFn
  ): Promise<OutputDocument> {
    const stageDisplay = (analysis.stage ?? "Sandbox") as StageDisplay;

    const PROPOSAL_SECTIONS: Array<{
      key: string;
      order: number;
      title: string;
      sourceRef: string | null;
      needsNarrative: boolean;
    }> = [
      {
        key: "executive_summary",
        order: 1,
        title: "บทสรุปผู้บริหาร",
        sourceRef: "ai_analysis.summary",
        needsNarrative: true,
      },
      {
        key: "problem_opportunity",
        order: 2,
        title: "ปัญหาและโอกาส",
        sourceRef: "ai_analysis.summary",
        needsNarrative: true,
      },
      {
        key: "proposed_solution",
        order: 3,
        title: "แนวทางแก้ไขที่นำเสนอ",
        sourceRef: "ai_analysis.summary",
        needsNarrative: true,
      },
      {
        key: "bmc",
        order: 4,
        title: "Business Model Canvas",
        sourceRef: "document.bmc",
        needsNarrative: false,
      },
      {
        key: "feasibility_assessment",
        order: 5,
        title: "การประเมินความเป็นไปได้",
        sourceRef: "ai_analysis.feasibility",
        needsNarrative: false,
      },
      {
        key: "launch_pad_plan",
        order: 6,
        title: "แผน Launch PAD",
        sourceRef: "ai_analysis.stage",
        needsNarrative: true,
      },
      {
        key: "stage_gate_guide",
        order: 7,
        title: "คู่มือ Stage Gate",
        sourceRef: "ai_analysis.stage",
        needsNarrative: false,
      },
      {
        key: "resource_investment",
        order: 8,
        title: "ทรัพยากรและการลงทุน",
        sourceRef: "ai_analysis.feasibility",
        needsNarrative: true,
      },
      {
        key: "expected_outcomes",
        order: 9,
        title: "ผลลัพธ์ที่คาดหวังและตัวชี้วัด",
        sourceRef: "ai_analysis.feasibility",
        needsNarrative: true,
      },
      {
        key: "next_steps",
        order: 10,
        title: "ขั้นตอนถัดไป",
        sourceRef: "ai_analysis.stage",
        needsNarrative: true,
      },
    ];

    // Deterministic sections content
    const deterministicContent: Record<string, string> = {
      feasibility_assessment:
        `| มิติ | คะแนน | ข้อเสนอแนะ |\n|---|---|---|\n` +
        `| ความสอดคล้องเชิงกลยุทธ์ | ${analysis.strategicFitScore ?? "N/A"}/5 | |\n` +
        `| ศักยภาพตลาด | ${analysis.marketPotentialScore ?? "N/A"}/5 | |\n` +
        `| ความเป็นไปได้ทางเทคนิค | ${analysis.technicalFeasibilityScore ?? "N/A"}/5 | |\n` +
        `| ความต้องการทรัพยากร | ${analysis.resourceRequirementScore ?? "N/A"}/5 | |\n` +
        `| ผลกระทบทางธุรกิจ | ${analysis.businessImpactScore ?? "N/A"}/5 | |\n\n` +
        `**ข้อเสนอแนะ**: ${analysis.recommendedAction ?? "รอพิจารณา"}`,
      stage_gate_guide: `_ดูรายละเอียดเกณฑ์ใน เอกสารคู่มือ Stage Gate_`,
      bmc: `_ดู canvas ฉบับเต็มใน เอกสาร Business Model Canvas_`,
    };

    // Get narrative sections via Claude
    const narrativeKeys = PROPOSAL_SECTIONS.filter((s) => s.needsNarrative).map((s) => s.key);
    let narratives: Record<string, string> = {};
    try {
      narratives = await callClaude({
        ideaTitle: analysis.ideaTitle,
        summary: analysis.summary ?? "",
        stage: stageDisplay,
        ideaType: analysis.ideaType ?? "SaaS",
        recommendedAction: analysis.recommendedAction,
        portfolioMatches: analysis.portfolioMatches ?? [],
        feasibilityScores: {
          strategicFit: analysis.strategicFitScore,
          marketPotential: analysis.marketPotentialScore,
          technicalFeasibility: analysis.technicalFeasibilityScore,
          resourceRequirement: analysis.resourceRequirementScore,
          businessImpact: analysis.businessImpactScore,
        },
        documentType: "project_proposal",
        sectionKeys: narrativeKeys,
      });
    } catch (err) {
      logger.warn(
        { err },
        "DocumentGenerationService: Claude narrative failed for proposal — using placeholders"
      );
    }

    const proposalSections: ProposalSection[] = PROPOSAL_SECTIONS.map((s) => ({
      key: s.key,
      order: s.order,
      title: s.title,
      content_markdown: narratives[s.key] ?? deterministicContent[s.key] ?? "",
      source_ref: s.sourceRef,
      is_ai_generated: true,
      updated_at: new Date().toISOString(),
    }));

    const composedMarkdown = proposalSections
      .sort((a, b) => a.order - b.order)
      .map((s) => `## ${s.title}\n\n${s.content_markdown}`)
      .join("\n\n");

    return documentGenerationRepository.upsertDocument({
      ideaId,
      analysisId,
      documentType: "project_proposal",
      stageSnapshot: stageDisplay,
      title: "ข้อเสนอโครงการ (ฉบับสมบูรณ์)",
      contentMarkdown: composedMarkdown,
      sections: proposalSections,
      watermarkStatus: WatermarkStatus.AI_DRAFT,
      generationStatus: "completed",
    });
  }

  /**
   * Regenerate only the section(s) of the proposal that map to the given sourceRef.
   * Does NOT touch is_ai_generated=false sections.
   * Task 6.2
   */
  async regenerateProposalSection(
    ideaId: string,
    sourceRef: string,
    callClaude: ClaudeNarrativeFn,
    analysisData?: Partial<AnalysisData>
  ): Promise<{ updatedSectionKeys: string[] }> {
    const proposal = await documentGenerationRepository.findByIdeaAndType(
      ideaId,
      "project_proposal"
    );
    if (!proposal?.sections) {
      logger.warn(
        { ideaId },
        "DocumentGenerationService: proposal not found for section regeneration"
      );
      return { updatedSectionKeys: [] };
    }

    const targetSections = proposal.sections.filter(
      (s) => s.source_ref === sourceRef && s.is_ai_generated
    );
    if (targetSections.length === 0) {
      return { updatedSectionKeys: [] };
    }

    const updatedKeys: string[] = [];

    for (const section of targetSections) {
      try {
        const narratives = await callClaude({
          ideaTitle: analysisData?.ideaTitle ?? "",
          summary: analysisData?.summary ?? "",
          stage: analysisData?.stage ?? null,
          ideaType: analysisData?.ideaType ?? null,
          recommendedAction: analysisData?.recommendedAction ?? null,
          portfolioMatches: analysisData?.portfolioMatches ?? [],
          feasibilityScores: {
            strategicFit: analysisData?.strategicFitScore ?? null,
            marketPotential: analysisData?.marketPotentialScore ?? null,
            technicalFeasibility: analysisData?.technicalFeasibilityScore ?? null,
            resourceRequirement: analysisData?.resourceRequirementScore ?? null,
            businessImpact: analysisData?.businessImpactScore ?? null,
          },
          documentType: "project_proposal",
          sectionKeys: [section.key],
        });

        if (narratives[section.key]) {
          await documentGenerationRepository.updateSection(
            ideaId,
            section.key,
            narratives[section.key]!
          );
          updatedKeys.push(section.key);
        }
      } catch (err) {
        logger.warn(
          { ideaId, sectionKey: section.key, err },
          "DocumentGenerationService: section narrative failed — keeping existing content"
        );
      }
    }

    return { updatedSectionKeys: updatedKeys };
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnalysisData {
  ideaTitle: string;
  summary: string | null;
  stage: string | null;
  ideaType: string | null;
  recommendedAction: string | null;
  recommendedActionReasoning: string | null;
  portfolioMatches: Array<{ product: string; relevance: string; reasoning: string }>;
  strategicFitScore: number | null;
  marketPotentialScore: number | null;
  technicalFeasibilityScore: number | null;
  resourceRequirementScore: number | null;
  businessImpactScore: number | null;
  strategicFitReasoning: string | null;
  marketPotentialReasoning: string | null;
  technicalFeasibilityReasoning: string | null;
  resourceRequirementReasoning: string | null;
  businessImpactReasoning: string | null;
  referenceNumber: string;
  submitterName: string | null;
}

export type ClaudeNarrativeFn = (params: {
  ideaTitle: string;
  summary: string;
  stage: string | null;
  ideaType: string | null;
  recommendedAction: string | null;
  portfolioMatches: Array<{ product: string; relevance: string; reasoning: string }>;
  feasibilityScores: {
    strategicFit: number | null;
    marketPotential: number | null;
    technicalFeasibility: number | null;
    resourceRequirement: number | null;
    businessImpact: number | null;
  };
  documentType: string;
  sectionKeys: string[];
}) => Promise<Record<string, string>>;

/** Singleton */
export const documentGenerationService = new DocumentGenerationService();
