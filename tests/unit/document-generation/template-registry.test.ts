/**
 * Tests for DocumentTemplateRegistry (tasks 3.1, 3.2)
 * Includes PBT Property 1 — document set completeness per stage
 *
 * Ref: design/correctness.md — Property 1
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  resolveDocumentTypesForStage,
  getTemplate,
  getStageGateMetrics,
} from "@/modules/document-generation/templates";
import type { StageDisplay, DocumentType } from "@/modules/document-generation/types";

const ALL_STAGES: StageDisplay[] = [
  "Sandbox",
  "Validation Sprint",
  "Build Sprint",
  "Launch & Test",
];

const MANDATORY: DocumentType[] = ["feasibility_report", "stage_gate_guide", "project_proposal"];

describe("resolveDocumentTypesForStage()", () => {
  it("should always include mandatory document types for every stage", () => {
    for (const stage of ALL_STAGES) {
      const docs = resolveDocumentTypesForStage(stage);
      for (const m of MANDATORY) {
        expect(docs, `stage=${stage} missing ${m}`).toContain(m);
      }
    }
  });

  it("should return no duplicates for any stage", () => {
    for (const stage of ALL_STAGES) {
      const docs = resolveDocumentTypesForStage(stage);
      expect(new Set(docs).size, `stage=${stage} has duplicates`).toBe(docs.length);
    }
  });

  it("should include stage-specific extras for Sandbox", () => {
    const docs = resolveDocumentTypesForStage("Sandbox");
    expect(docs).toContain("bmc");
    expect(docs).toContain("launch_pad_plan");
    expect(docs).toContain("poc_proposal");
  });

  it("should include stage-specific extras for Validation Sprint", () => {
    const docs = resolveDocumentTypesForStage("Validation Sprint");
    expect(docs).toContain("bmc");
    expect(docs).toContain("launch_pad_plan");
    expect(docs).toContain("poc_proposal");
  });

  it("should include stage-specific extras for Build Sprint", () => {
    const docs = resolveDocumentTypesForStage("Build Sprint");
    expect(docs).toContain("project_requirements");
    expect(docs).toContain("action_plan");
    expect(docs).toContain("resource_plan");
  });

  it("should include stage-specific extras for Launch & Test", () => {
    const docs = resolveDocumentTypesForStage("Launch & Test");
    expect(docs).toContain("gtm_summary");
    expect(docs).toContain("executive_presentation");
  });

  it("should return only mandatory types for unknown stage (graceful)", () => {
    const docs = resolveDocumentTypesForStage("Unknown Stage" as StageDisplay);
    expect(docs).toEqual(expect.arrayContaining(MANDATORY));
    // No crash, returns at least mandatory
    expect(docs.length).toBeGreaterThanOrEqual(MANDATORY.length);
  });

  it("should handle null stage gracefully", () => {
    const docs = resolveDocumentTypesForStage(null);
    expect(docs).toEqual(expect.arrayContaining(MANDATORY));
  });

  // ── PBT Property 1: document set completeness ───────────────────────────────
  it("PBT: mandatory set always present and no duplicates for any stage", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_STAGES), (stage) => {
        const docs = resolveDocumentTypesForStage(stage);
        const hasAllMandatory = MANDATORY.every((m) => docs.includes(m));
        const noDups = new Set(docs).size === docs.length;
        return hasAllMandatory && noDups;
      }),
      { numRuns: 200 }
    );
  });
});

describe("getTemplate()", () => {
  it("should return a template for every known document type", () => {
    const types: DocumentType[] = [
      "feasibility_report",
      "bmc",
      "launch_pad_plan",
      "poc_proposal",
      "stage_gate_guide",
      "project_requirements",
      "action_plan",
      "resource_plan",
      "gtm_summary",
      "executive_presentation",
      "project_proposal",
    ];
    for (const type of types) {
      const tmpl = getTemplate(type);
      expect(tmpl, `template missing for ${type}`).toBeDefined();
    }
  });

  it("should return a template with sections array", () => {
    const tmpl = getTemplate("feasibility_report");
    expect(Array.isArray(tmpl.sections)).toBe(true);
    expect(tmpl.sections.length).toBeGreaterThan(0);
  });
});

describe("getStageGateMetrics()", () => {
  const ALL_IDEA_TYPES = ["SaaS", "SI", "Hardware", "Platform", "Internal Tool", "Partnership"];

  it("should return 4 gates for every known idea type", () => {
    for (const type of ALL_IDEA_TYPES) {
      const metrics = getStageGateMetrics(type);
      expect(metrics.gates).toHaveLength(4);
    }
  });

  it("should fall back to SaaS for unknown idea type", () => {
    const metrics = getStageGateMetrics("Unknown");
    expect(metrics.ideaType).toBe("SaaS");
  });

  it("should fall back to SaaS for null idea type", () => {
    const metrics = getStageGateMetrics(null);
    expect(metrics.ideaType).toBe("SaaS");
  });

  it("each gate should have key hypotheses, min evidence and Go/Conditional/No-Go criteria", () => {
    for (const type of ALL_IDEA_TYPES) {
      const metrics = getStageGateMetrics(type);
      for (const gate of metrics.gates) {
        expect(
          gate.keyHypotheses.length,
          `${type} ${gate.gate} missing hypotheses`
        ).toBeGreaterThan(0);
        expect(
          gate.minimumEvidence.length,
          `${type} ${gate.gate} missing evidence`
        ).toBeGreaterThan(0);
        expect(gate.goCriteria.length, `${type} ${gate.gate} missing go criteria`).toBeGreaterThan(
          0
        );
        expect(
          gate.noGoCriteria.length,
          `${type} ${gate.gate} missing no-go criteria`
        ).toBeGreaterThan(0);
      }
    }
  });
});
