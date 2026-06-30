"use client";

/**
 * SystemPromptEditor — edit the global system prompt
 *
 * - Pre-fills from `initialValue`
 * - Shows character count vs 8000 limit
 * - Save via api.admin.updateSystemPrompt
 * - Notifies parent of dirty state via onDirtyChange
 * - Calls onSaved? on success and invalidates tRPC cache
 * - Reset to DEFAULT_PROMPT_CONFIG.systemPrompt
 *
 * Task 7
 */

import * as React from "react";
import { Globe, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/shared/ToastProvider";
import { api } from "@/lib/trpc/client";
import { DEFAULT_PROMPT_CONFIG } from "@/lib/document-generation/prompt-config-defaults";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CHARS = 8000;

// ─── Props ─────────────────────────────────────────────────────────────────────

interface SystemPromptEditorProps {
  initialValue: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaved?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SystemPromptEditor({
  initialValue,
  onDirtyChange,
  onSaved,
}: SystemPromptEditorProps) {
  const toast = useToast();
  const utils = api.useUtils();
  const [value, setValue] = React.useState(initialValue);

  // Sync if initialValue changes (parent refetches data)
  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const isDirty = value !== initialValue;

  React.useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const updateMutation = api.admin.updateSystemPrompt.useMutation({
    onSuccess: () => {
      toast.success("บันทึก System Prompt เรียบร้อยแล้ว");
      void utils.admin.getPromptConfig.invalidate();
      onSaved?.();
    },
    onError: (err) => toast.error("บันทึกไม่สำเร็จ", { description: err.message }),
  });

  function handleReset() {
    if (!confirm("Reset System Prompt กลับค่า default หรือไม่?")) return;
    setValue(DEFAULT_PROMPT_CONFIG.systemPrompt);
  }

  function handleSave() {
    updateMutation.mutate({ systemPrompt: value });
  }

  const charCount = value.length;
  const isOverLimit = charCount > MAX_CHARS;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-lg bg-primary/10"
          aria-hidden="true"
        >
          <Globe className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">System Prompt กลาง</h2>
          <p className="text-sm text-muted-foreground">
            ใช้กับทุก section ทุก document type — กำหนดบทบาทและโทนเสียงของ AI
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">System Prompt</CardTitle>
          <CardDescription>
            Prompt นี้จะถูกส่งเป็น system message ก่อนทุก section generation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={10}
            className="font-mono text-sm"
            aria-label="System prompt"
          />

          {/* Character count */}
          <p
            className={`text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}
            aria-live="polite"
          >
            {charCount} / {MAX_CHARS}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={updateMutation.isPending || !isDirty || isOverLimit}
              className="gap-2"
            >
              {updateMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              )}
              {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึก System Prompt"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="gap-1.5"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reset
            </Button>
            {isDirty && !updateMutation.isPending && (
              <p className="text-xs text-muted-foreground">● มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SystemPromptEditor;
