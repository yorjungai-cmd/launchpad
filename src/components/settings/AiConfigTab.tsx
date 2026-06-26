"use client";

/**
 * AiConfigTab — AI Model Configuration UI (US-33)
 *
 * Renders four model selects (analysisModel, documentGenerationModel,
 * defaultModel, fallbackModel) populated from data.supportedModels.
 *
 * Data flow:
 *   api.admin.getAiConfig.useQuery()      → pre-fill form
 *   api.admin.updateAiConfig.useMutation() → save on submit
 *
 * Form state: React Hook Form + Zod (UpdateAiConfigSchema)
 * Toast:       Sonner via useToast()
 * Loading:     Skeleton placeholders
 * Error:       Alert card with retry button
 *
 * Design ref: design/components.md — AiConfigTab (Component 7)
 * API ref:    design/api-spec.md   — admin.getAiConfig / admin.updateAiConfig
 *
 * Task 8.1
 */

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw, AlertCircle, Bot } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { useToast } from "@/components/shared/ToastProvider";
import { UpdateAiConfigSchema } from "@/modules/admin-ai-config/schemas";
import type { UpdateAiConfigInput } from "@/modules/admin-ai-config/schemas";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Model display labels ─────────────────────────────────────────────────────

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-5": "Claude Opus 4.5 (Most capable)",
  "claude-sonnet-4-5": "Claude Sonnet 4.5 (Balanced)",
  "claude-haiku-4-5": "Claude Haiku 4.5 (Fastest)",
};

function getModelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

// ─── Field definitions ────────────────────────────────────────────────────────

interface ModelField {
  name: keyof UpdateAiConfigInput;
  label: string;
  description: string;
}

const MODEL_FIELDS: ModelField[] = [
  {
    name: "analysisModel",
    label: "Analysis Model",
    description: "ใช้สำหรับวิเคราะห์ idea และประเมิน feasibility",
  },
  {
    name: "documentGenerationModel",
    label: "Document Generation Model",
    description: "ใช้สำหรับสร้างเอกสาร Launch PAD (BMC, Feasibility Report ฯลฯ)",
  },
  {
    name: "defaultModel",
    label: "Default Model",
    description: "Model ที่ใช้เมื่อไม่ระบุ task type เฉพาะ",
  },
  {
    name: "fallbackModel",
    label: "Fallback Model",
    description: "Model สำรองเมื่อ primary model ไม่พร้อมใช้งาน",
  },
];

// ─── Skeleton loading state ───────────────────────────────────────────────────

function AiConfigSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="กำลังโหลดการตั้งค่า AI...">
      {MODEL_FIELDS.map((field) => (
        <div key={field.name} className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-72" />
          <Skeleton className="h-10 w-full max-w-sm" />
        </div>
      ))}
      <Skeleton className="h-10 w-24" />
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

interface AiConfigErrorProps {
  message: string;
  onRetry: () => void;
}

function AiConfigError({ message, onRetry }: AiConfigErrorProps) {
  return (
    <Card className="border-destructive/40 bg-destructive/5" role="alert">
      <CardContent className="flex items-center gap-3 pt-6">
        <AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">โหลดการตั้งค่าไม่สำเร็จ</p>
          <p className="mt-0.5 text-xs text-destructive/80">{message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry} className="flex items-center gap-1.5">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          ลองใหม่
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AiConfigTab() {
  const toast = useToast();

  // ── Query: fetch current config ──────────────────────────────────────────
  const { data, isLoading, isError, error, refetch } = api.admin.getAiConfig.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 min
  });

  // ── Mutation: save config ────────────────────────────────────────────────
  const updateMutation = api.admin.updateAiConfig.useMutation({
    onSuccess: () => {
      toast.success("บันทึกการตั้งค่า AI เรียบร้อยแล้ว");
    },
    onError: (err) => {
      toast.error("บันทึกไม่สำเร็จ", {
        description: err.message ?? "โปรดลองใหม่",
      });
    },
  });

  // ── React Hook Form ──────────────────────────────────────────────────────
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<UpdateAiConfigInput>({
    resolver: zodResolver(UpdateAiConfigSchema),
    defaultValues: {
      analysisModel: "claude-sonnet-4-5",
      documentGenerationModel: "claude-opus-4-5",
      defaultModel: "claude-sonnet-4-5",
      fallbackModel: "claude-haiku-4-5",
    },
  });

  // Reset form when data loads
  React.useEffect(() => {
    if (data) {
      reset({
        analysisModel: data.analysisModel as UpdateAiConfigInput["analysisModel"],
        documentGenerationModel:
          data.documentGenerationModel as UpdateAiConfigInput["documentGenerationModel"],
        defaultModel: data.defaultModel as UpdateAiConfigInput["defaultModel"],
        fallbackModel: data.fallbackModel as UpdateAiConfigInput["fallbackModel"],
      });
    }
  }, [data, reset]);

  // ── Submit handler ────────────────────────────────────────────────────────
  function onSubmit(values: UpdateAiConfigInput) {
    updateMutation.mutate(values);
  }

  // ── Render states ─────────────────────────────────────────────────────────
  if (isLoading) return <AiConfigSkeleton />;

  if (isError) {
    return (
      <AiConfigError
        message={error?.message ?? "ไม่สามารถโหลดการตั้งค่า AI ได้"}
        onRetry={() => void refetch()}
      />
    );
  }

  const supportedModels = data?.supportedModels ?? [];

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      <div className="space-y-8">
        {/* Section header */}
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-lg bg-primary/10"
            aria-hidden="true"
          >
            <Bot className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">AI Model Configuration</h2>
            <p className="text-sm text-muted-foreground">
              เลือก Claude model สำหรับแต่ละ task type
            </p>
          </div>
        </div>

        {/* Model selects */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium">Model Selection</CardTitle>
            <CardDescription>กำหนด model ที่ระบบจะใช้สำหรับแต่ละประเภทงาน</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {MODEL_FIELDS.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label
                  htmlFor={`select-${field.name}`}
                  className="text-sm font-medium text-foreground"
                >
                  {field.label}
                </Label>
                <p className="text-xs text-muted-foreground">{field.description}</p>
                <Controller
                  name={field.name}
                  control={control}
                  render={({ field: controllerField, fieldState }) => (
                    <div className="space-y-1">
                      <Select
                        value={controllerField.value}
                        onValueChange={controllerField.onChange}
                        disabled={updateMutation.isPending}
                      >
                        <SelectTrigger
                          id={`select-${field.name}`}
                          className="max-w-sm"
                          aria-describedby={fieldState.error ? `${field.name}-error` : undefined}
                          aria-invalid={fieldState.error ? "true" : undefined}
                        >
                          <SelectValue placeholder="เลือก model..." />
                        </SelectTrigger>
                        <SelectContent>
                          {supportedModels.map((model) => (
                            <SelectItem key={model} value={model}>
                              {getModelLabel(model)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.error && (
                        <p
                          id={`${field.name}-error`}
                          className="text-xs text-destructive"
                          role="alert"
                        >
                          {fieldState.error.message}
                        </p>
                      )}
                    </div>
                  )}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={updateMutation.isPending || !isDirty}
            className="flex items-center gap-2"
          >
            {updateMutation.isPending && (
              <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
            )}
            {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </Button>
          {isDirty && !updateMutation.isPending && (
            <p className="text-xs text-muted-foreground">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</p>
          )}
        </div>
      </div>
    </form>
  );
}

export default AiConfigTab;
