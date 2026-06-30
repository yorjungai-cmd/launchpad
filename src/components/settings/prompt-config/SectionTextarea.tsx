"use client";

/**
 * SectionTextarea — per-section instruction editor with collapsible test panel
 *
 * - Shows Thai label, char count (max 2000), individual Reset button
 * - Test Panel: Sample Idea info + Test Prompt button + AI output area
 * - Non-narrative sections show an "Auto-generated" badge instead of textarea
 *
 * Task 8
 */

import * as React from "react";
import { RotateCcw, Play, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/shared/ToastProvider";
import { api } from "@/lib/trpc/client";
import { SAMPLE_TEST_IDEA } from "@/lib/document-generation/prompt-config-defaults";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CHARS = 2000;

// ─── Props ────────────────────────────────────────────────────────────────────

interface SectionTextareaProps {
  sectionKey: string;
  sectionTitle: string;
  documentType: string;
  value: string;
  systemPrompt: string;
  isNarrative: boolean;
  defaultInstruction: string;
  onChange: (value: string) => void;
  onReset: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SectionTextarea({
  sectionKey,
  sectionTitle,
  documentType,
  value,
  systemPrompt,
  isNarrative,
  defaultInstruction: _defaultInstruction,
  onChange,
  onReset,
}: SectionTextareaProps) {
  const toast = useToast();
  const [testOutput, setTestOutput] = React.useState<string | null>(null);
  const [testOpen, setTestOpen] = React.useState(false);

  const testMutation = api.admin.testSectionPrompt.useMutation({
    onSuccess: (data) => setTestOutput(data.content),
    onError: (err) => toast.error("Test ไม่สำเร็จ", { description: err.message }),
  });

  function handleReset() {
    if (!confirm(`Reset "${sectionTitle}" กลับค่า default หรือไม่?`)) return;
    onReset();
  }

  function handleTest() {
    setTestOpen(true);
    setTestOutput(null);
    testMutation.mutate({
      systemPrompt,
      sectionKey,
      documentType,
      instruction: value,
    });
  }

  const charCount = value.length;
  const isOverLimit = charCount > MAX_CHARS;

  // Non-narrative sections don't have AI prompts — show informational badge only
  if (!isNarrative) {
    return (
      <div className="space-y-1.5 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">{sectionTitle}</p>
          <Badge variant="secondary" className="text-xs">
            Auto-generated
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Section นี้สร้างจากข้อมูลโดยตรง ไม่ผ่าน AI narrative
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{sectionTitle}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="h-7 gap-1.5 text-xs"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          Reset
        </Button>
      </div>

      {/* Instruction textarea */}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={MAX_CHARS}
        placeholder="instruction เพิ่มเติมสำหรับ section นี้..."
        className="text-sm"
        aria-label={`Instruction for ${sectionTitle}`}
      />

      {/* Character count */}
      <p
        className={`text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}
        aria-live="polite"
      >
        {charCount} / {MAX_CHARS}
      </p>

      {/* Test panel toggle */}
      <button
        type="button"
        onClick={() => setTestOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {testOpen ? (
          <ChevronUp className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        )}
        ทดสอบ Prompt
      </button>

      {testOpen && (
        <div className="space-y-2">
          {/* Sample idea info */}
          <div className="space-y-1 rounded-md bg-muted/50 p-3 text-xs">
            <p className="font-medium text-muted-foreground">Sample Idea ที่ใช้ทดสอบ</p>
            <p>
              <span className="font-medium">ชื่อ:</span> {SAMPLE_TEST_IDEA.title}
            </p>
            <p className="line-clamp-2">
              <span className="font-medium">สรุป:</span> {SAMPLE_TEST_IDEA.summary}
            </p>
            <p>
              <span className="font-medium">Stage:</span> {SAMPLE_TEST_IDEA.stage} |{" "}
              <span className="font-medium">Type:</span> {SAMPLE_TEST_IDEA.ideaType}
            </p>
            <p>
              <span className="font-medium">Scores:</span> Strategic{" "}
              {SAMPLE_TEST_IDEA.feasibilityScores.strategicFit}/5 · Market{" "}
              {SAMPLE_TEST_IDEA.feasibilityScores.marketPotential}/5 · Tech{" "}
              {SAMPLE_TEST_IDEA.feasibilityScores.technicalFeasibility}/5 · Resource{" "}
              {SAMPLE_TEST_IDEA.feasibilityScores.resourceRequirement}/5 · Impact{" "}
              {SAMPLE_TEST_IDEA.feasibilityScores.businessImpact}/5
            </p>
          </div>

          {/* Test button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testMutation.isPending}
            className="w-full gap-1.5"
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                กำลังทดสอบ...
              </>
            ) : (
              <>
                <Play className="size-3.5" aria-hidden="true" />
                Test Prompt
              </>
            )}
          </Button>

          {/* Output area */}
          <div className="min-h-[60px] rounded-md border border-border bg-background p-3 text-xs">
            {testOutput === null && !testMutation.isPending && (
              <p className="italic text-muted-foreground">กด Test Prompt เพื่อดูผลลัพธ์</p>
            )}
            {testMutation.isPending && (
              <p className="italic text-muted-foreground">กำลังรอผลลัพธ์จาก AI...</p>
            )}
            {testOutput !== null && (
              <pre className="whitespace-pre-wrap font-sans leading-relaxed">{testOutput}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SectionTextarea;
