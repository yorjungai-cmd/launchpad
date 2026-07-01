"use client";

/**
 * DocTypeSectionEditor — editor for all sections of a given document type
 *
 * - Lists all sections for `documentType` using SectionTextarea per section
 * - Tracks local edits (unsaved state) across all sections
 * - "Save All" button — calls admin.updateDocumentTypeSections
 * - "Reset All" button — calls admin.resetPromptDocumentType, restores defaults
 * - Shows loading/error/success states
 * - On save success: invalidates admin.getPromptConfig cache, shows toast
 *
 * Task 9
 */

import * as React from "react";
import { RotateCcw, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/shared/ToastProvider";
import { api } from "@/lib/trpc/client";
import { SectionTextarea } from "./SectionTextarea";
import {
  DEFAULT_PROMPT_CONFIG,
  DOCUMENT_TYPES_IN_WORKFLOW_ORDER,
  type WorkflowDocumentType,
} from "@/lib/document-generation/prompt-config-defaults";

// ─── Section metadata ─────────────────────────────────────────────────────────
// Mirrors document-templates.ts but defined here to avoid a server-only import
// in a client component.

export const SECTION_META: Record<
  string,
  Array<{ key: string; title: string; isNarrative: boolean }>
> = {
  feasibility_report: [
    { key: "executive_summary", title: "บทสรุปผู้บริหาร", isNarrative: true },
    { key: "feasibility_scores", title: "คะแนนความเป็นไปได้", isNarrative: false },
    { key: "recommendation", title: "ข้อเสนอแนะ", isNarrative: false },
    { key: "portfolio_alignment", title: "ความเชื่อมโยงกับ Portfolio", isNarrative: false },
  ],
  poc_proposal: [
    { key: "poc_objective", title: "วัตถุประสงค์ POC", isNarrative: true },
    { key: "poc_scope", title: "ขอบเขต POC", isNarrative: true },
    { key: "poc_timeline", title: "ไทม์ไลน์ POC", isNarrative: true },
  ],
  bmc: [{ key: "bmc_canvas", title: "Business Model Canvas", isNarrative: true }],
  launch_pad_plan: [
    { key: "validation_sprint", title: "Validation Sprint", isNarrative: true },
    { key: "success_metrics", title: "ตัวชี้วัดความสำเร็จ", isNarrative: true },
  ],
  project_requirements: [
    { key: "functional_requirements", title: "Functional Requirements", isNarrative: true },
    {
      key: "non_functional_requirements",
      title: "Non-Functional Requirements",
      isNarrative: true,
    },
  ],
  resource_plan: [
    { key: "resource_requirements", title: "ความต้องการทรัพยากร", isNarrative: true },
    { key: "budget_estimate", title: "ประมาณการงบประมาณ", isNarrative: true },
  ],
  action_plan: [
    { key: "milestones", title: "หมุดหมายสำคัญ (Milestones)", isNarrative: true },
    { key: "tasks_owners", title: "งานและผู้รับผิดชอบ", isNarrative: true },
  ],
  gtm_summary: [
    { key: "target_market", title: "ตลาดเป้าหมาย", isNarrative: true },
    { key: "go_to_market_strategy", title: "กลยุทธ์ Go-to-Market", isNarrative: true },
    { key: "launch_metrics", title: "ตัวชี้วัดการเปิดตัว", isNarrative: true },
  ],
  executive_presentation: [
    { key: "executive_overview", title: "ภาพรวมสำหรับผู้บริหาร", isNarrative: true },
    { key: "key_metrics", title: "ตัวชี้วัดสำคัญ", isNarrative: false },
  ],
  stage_gate_guide: [
    { key: "gate_overview", title: "ภาพรวม Stage Gate", isNarrative: false },
    { key: "gate_criteria", title: "เกณฑ์ผ่าน Gate", isNarrative: false },
  ],
  project_proposal: [
    { key: "executive_summary", title: "บทสรุปผู้บริหาร", isNarrative: true },
    { key: "problem_opportunity", title: "ปัญหาและโอกาส", isNarrative: true },
    { key: "proposed_solution", title: "แนวทางแก้ไขที่นำเสนอ", isNarrative: true },
    { key: "bmc", title: "Business Model Canvas", isNarrative: false },
    { key: "feasibility_assessment", title: "การประเมินความเป็นไปได้", isNarrative: false },
    { key: "launch_pad_plan", title: "แผน Launch PAD", isNarrative: true },
    { key: "stage_gate_guide", title: "คู่มือ Stage Gate", isNarrative: false },
    { key: "resource_investment", title: "ทรัพยากรและการลงทุน", isNarrative: true },
    { key: "expected_outcomes", title: "ผลลัพธ์ที่คาดหวังและตัวชี้วัด", isNarrative: true },
    { key: "next_steps", title: "ขั้นตอนถัดไป", isNarrative: true },
  ],
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface DocTypeSectionEditorProps {
  documentType: WorkflowDocumentType;
  currentSections: Record<string, string>;
  systemPrompt: string;
  onDirtyChange: (dirty: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocTypeSectionEditor({
  documentType,
  currentSections,
  systemPrompt,
  onDirtyChange,
}: DocTypeSectionEditorProps) {
  const toast = useToast();
  const utils = api.useUtils();

  const sections = SECTION_META[documentType] ?? [];
  const label =
    DOCUMENT_TYPES_IN_WORKFLOW_ORDER.find((d) => d.type === documentType)?.label ?? documentType;

  const defaultSections = (DEFAULT_PROMPT_CONFIG.sections[documentType] ?? {}) as Record<
    string,
    string
  >;

  // Local edit state — merge defaults with saved values so every section key has a value
  const [local, setLocal] = React.useState<Record<string, string>>(() => ({
    ...defaultSections,
    ...currentSections,
  }));

  // Sync when the parent switches to a different documentType or new data arrives
  React.useEffect(() => {
    setLocal({ ...defaultSections, ...currentSections });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentType]);

  const saved = { ...defaultSections, ...currentSections };
  const isDirty = Object.keys({ ...local, ...saved }).some((k) => local[k] !== saved[k]);

  React.useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = api.admin.updateDocumentTypeSections.useMutation({
    onSuccess: () => {
      toast.success(`บันทึก ${label} เรียบร้อยแล้ว`);
      void utils.admin.getPromptConfig.invalidate();
    },
    onError: (err) => toast.error("บันทึกไม่สำเร็จ", { description: err.message }),
  });

  const resetMutation = api.admin.resetPromptDocumentType.useMutation({
    onSuccess: () => {
      setLocal({ ...defaultSections });
      toast.success(`Reset ${label} กลับค่า default เรียบร้อยแล้ว`);
      void utils.admin.getPromptConfig.invalidate();
    },
    onError: (err) => toast.error("Reset ไม่สำเร็จ", { description: err.message }),
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleSave() {
    saveMutation.mutate({ documentType, sections: local });
  }

  function handleResetAll() {
    if (!confirm(`Reset ทุก section ของ "${label}" กลับค่า default หรือไม่?`)) return;
    resetMutation.mutate({ documentType });
  }

  function handleSectionChange(key: string, value: string) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  function handleSectionReset(key: string) {
    setLocal((prev) => ({ ...prev, [key]: defaultSections[key] ?? "" }));
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{label}</h2>
          <p className="text-sm text-muted-foreground">ตั้งค่า instruction ต่อ section</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleResetAll}
          disabled={resetMutation.isPending}
          className="gap-1.5"
        >
          {resetMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="size-3.5" aria-hidden="true" />
          )}
          Reset All
        </Button>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((section) => (
          <SectionTextarea
            key={section.key}
            sectionKey={section.key}
            sectionTitle={section.title}
            documentType={documentType}
            value={local[section.key] ?? ""}
            systemPrompt={systemPrompt}
            isNarrative={section.isNarrative}
            defaultInstruction={defaultSections[section.key] ?? ""}
            onChange={(v) => handleSectionChange(section.key, v)}
            onReset={() => handleSectionReset(section.key)}
          />
        ))}
      </div>

      {/* Save bar */}
      <div className="flex items-center gap-3 border-t border-border pt-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending || !isDirty}
          className="gap-2"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              กำลังบันทึก...
            </>
          ) : (
            <>
              <Save className="size-3.5" aria-hidden="true" />
              บันทึก {label}
            </>
          )}
        </Button>
        {isDirty && !saveMutation.isPending && (
          <p className="text-xs text-muted-foreground">● มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</p>
        )}
      </div>
    </div>
  );
}

export default DocTypeSectionEditor;
