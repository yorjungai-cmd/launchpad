"use client";

/**
 * ScoreOverrideForm — BD Reviewer form for overriding a feasibility score.
 *
 * Features:
 *   - Dimension select (5 options, labels in Thai)
 *   - Score radio group (1–5)
 *   - Required comment textarea (max 500 chars)
 *   - React Hook Form + Zod resolver
 *   - tRPC mutation: api.analysis.overrideScore
 *   - Sonner toast on success / error
 *   - Override history table (score_overrides)
 *   - Accessible: labels, aria-describedby, aria-invalid
 *
 * Task 4.4
 */

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/trpc/client";
import { useToast } from "@/components/shared/ToastProvider";
import { OverrideScoreFieldSchema } from "@/modules/ai-analysis/schemas";
import type {
  AIAnalysis,
  OverrideScoreField,
  ScoreOverrideEntry,
} from "@/modules/ai-analysis/types";
import { cn } from "@/lib/utils";

// ─── Shadcn/ui ────────────────────────────────────────────────────────────────
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// ─── Zod schema ───────────────────────────────────────────────────────────────

const overrideFormSchema = z.object({
  field: OverrideScoreFieldSchema,
  newValue: z.number().int().min(1).max(5),
  comment: z.string().min(1, "กรุณาใส่ความคิดเห็น").max(500, "ความคิดเห็นต้องไม่เกิน 500 ตัวอักษร"),
});

type OverrideFormValues = z.infer<typeof overrideFormSchema>;

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<OverrideScoreField, string> = {
  strategic_fit_score: "ความสอดคล้องเชิงกลยุทธ์",
  market_potential_score: "ศักยภาพตลาด",
  technical_feasibility_score: "ความเป็นไปได้ทางเทคนิค",
  resource_requirement_score: "ความต้องการทรัพยากร",
  business_impact_score: "ผลกระทบต่อธุรกิจ",
};

const SCORE_OPTIONS = [1, 2, 3, 4, 5] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatOverrideDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return dateStr;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ScoreOverrideFormProps {
  ideaId: string;
  analysis: AIAnalysis;
  onSuccess?: (updated: AIAnalysis) => void;
  className?: string;
}

// ─── Override history table ───────────────────────────────────────────────────

function OverrideHistoryTable({ overrides }: { overrides: ScoreOverrideEntry[] }) {
  if (overrides.length === 0) return null;

  return (
    <div className="mt-6">
      <h4 className="mb-3 text-sm font-semibold text-foreground">ประวัติการแก้ไขคะแนน</h4>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs" aria-label="ประวัติการแก้ไขคะแนน">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                มิติ
              </th>
              <th scope="col" className="px-3 py-2 text-center font-semibold text-muted-foreground">
                ก่อนแก้
              </th>
              <th scope="col" className="px-3 py-2 text-center font-semibold text-muted-foreground">
                หลังแก้
              </th>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                ความคิดเห็น
              </th>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                ผู้แก้
              </th>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-muted-foreground">
                วันที่
              </th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((entry, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2 text-foreground">
                  {FIELD_LABELS[entry.field as OverrideScoreField] ?? entry.field}
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground">
                  {entry.previous_value}
                </td>
                <td className="px-3 py-2 text-center font-semibold text-foreground">
                  {entry.new_value}
                </td>
                <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">
                  <span title={entry.comment}>{entry.comment}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{entry.reviewer_name}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {formatOverrideDate(entry.overridden_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScoreOverrideForm({
  ideaId,
  analysis,
  onSuccess,
  className,
}: ScoreOverrideFormProps) {
  const toast = useToast();
  const fieldErrorId = React.useId();
  const scoreErrorId = React.useId();
  const commentErrorId = React.useId();

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OverrideFormValues>({
    resolver: zodResolver(overrideFormSchema),
    defaultValues: {
      field: "strategic_fit_score",
      newValue: 3,
      comment: "",
    },
  });

  const overrideMutation = api.analysis.overrideScore.useMutation({
    onSuccess: (data) => {
      toast.success("บันทึกการแก้ไขสำเร็จ", {
        description: `${FIELD_LABELS[data.updatedField as OverrideScoreField] ?? data.updatedField} → ${data.newValue}`,
      });
      reset();
      // Build updated analysis with the new override entry appended
      const updated: AIAnalysis = {
        ...analysis,
        scoreOverrides: [...analysis.scoreOverrides, data.overrideEntry],
      };
      onSuccess?.(updated);
    },
    onError: (err) => {
      toast.error("เกิดข้อผิดพลาด", { description: err.message });
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await overrideMutation.mutateAsync({
      ideaId,
      field: values.field,
      newValue: values.newValue,
      comment: values.comment,
    });
  });

  const commentValue = watch("comment");
  const commentLength = commentValue?.length ?? 0;
  const isLoading = isSubmitting || overrideMutation.isPending;

  return (
    <div className={cn("rounded-lg border border-border bg-card p-5", className)}>
      <h3 className="mb-4 text-sm font-semibold text-foreground">แก้ไขคะแนน Feasibility</h3>

      <form
        onSubmit={onSubmit}
        noValidate
        aria-label="แบบฟอร์มแก้ไขคะแนน"
        className="flex flex-col gap-5"
      >
        {/* Dimension select */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dimension-select">
            มิติที่ต้องการแก้ไข{" "}
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          </Label>
          <Controller
            name="field"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(val) => field.onChange(val as OverrideScoreField)}
              >
                <SelectTrigger
                  id="dimension-select"
                  aria-describedby={errors.field ? fieldErrorId : undefined}
                  aria-invalid={!!errors.field}
                  className={cn(errors.field && "border-destructive")}
                >
                  <SelectValue placeholder="เลือกมิติ" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.field && (
            <p id={fieldErrorId} role="alert" className="text-xs text-destructive">
              {errors.field.message}
            </p>
          )}
        </div>

        {/* Score radio group */}
        <div className="flex flex-col gap-1.5">
          <fieldset>
            <legend className="text-sm font-medium text-foreground">
              คะแนนใหม่ (1–5){" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </legend>
            <Controller
              name="newValue"
              control={control}
              render={({ field }) => (
                <div
                  className="mt-2 flex gap-3"
                  role="radiogroup"
                  aria-describedby={errors.newValue ? scoreErrorId : undefined}
                >
                  {SCORE_OPTIONS.map((score) => (
                    <label
                      key={score}
                      className={cn(
                        "flex size-10 cursor-pointer items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                        field.value === score
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:border-primary/50"
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        value={score}
                        checked={field.value === score}
                        onChange={() => field.onChange(score)}
                        aria-label={`คะแนน ${score}`}
                      />
                      {score}
                    </label>
                  ))}
                </div>
              )}
            />
            {errors.newValue && (
              <p id={scoreErrorId} role="alert" className="mt-1 text-xs text-destructive">
                {errors.newValue.message}
              </p>
            )}
          </fieldset>
        </div>

        {/* Comment textarea */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="override-comment">
            ความคิดเห็น{" "}
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          </Label>
          <Textarea
            id="override-comment"
            rows={3}
            placeholder="อธิบายเหตุผลการแก้ไขคะแนน..."
            {...register("comment")}
            aria-describedby={cn(errors.comment ? commentErrorId : undefined, "comment-char-count")}
            aria-invalid={!!errors.comment}
            className={cn(errors.comment && "border-destructive")}
          />
          <div className="flex items-center justify-between">
            {errors.comment ? (
              <p id={commentErrorId} role="alert" className="text-xs text-destructive">
                {errors.comment.message}
              </p>
            ) : (
              <span />
            )}
            <span
              id="comment-char-count"
              className={cn(
                "text-xs",
                commentLength > 480 ? "text-destructive" : "text-muted-foreground"
              )}
              aria-live="polite"
            >
              {commentLength} / 500
            </span>
          </div>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
          className="w-full sm:w-auto"
        >
          {isLoading ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </Button>
      </form>

      {/* Override history */}
      <OverrideHistoryTable overrides={analysis.scoreOverrides} />
    </div>
  );
}
