"use client";

/**
 * AiConfigTab — AI Model Configuration UI (US-33)
 *
 * Shows:
 *   - Active provider badge (from active API key)
 *   - Load/Refresh models button → api.admin.listModels
 *   - Four model selects (analysisModel, documentGenerationModel,
 *     defaultModel, fallbackModel) — populated from active provider models
 *
 * Data flow:
 *   api.admin.getAiConfig.useQuery()       → pre-fill form
 *   api.admin.listApiKeys.useQuery()       → find active key + provider
 *   api.admin.listModels.useMutation()     → refresh model list
 *   api.admin.updateAiConfig.useMutation() → save on submit
 *
 * Form state: React Hook Form + Zod (UpdateAiConfigSchema)
 *
 * Task 8.1
 */

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw, AlertCircle, Bot, Loader2, CheckCircle2 } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { useToast } from "@/components/shared/ToastProvider";
import { UpdateAiConfigSchema } from "@/modules/admin-ai-config/schemas";
import type { UpdateAiConfigInput } from "@/modules/admin-ai-config/schemas";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// ─── Provider display config ──────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  google: "Google (Gemini)",
  aws_bedrock: "AWS Bedrock",
  openrouter: "OpenRouter",
};

const PROVIDER_BADGE_CLASS: Record<string, string> = {
  anthropic:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
  google:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
  aws_bedrock:
    "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
  openrouter:
    "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-400",
};

// ─── Default model lists per provider ────────────────────────────────────────

const DEFAULT_MODELS_BY_PROVIDER: Record<string, Array<{ id: string; name: string }>> = {
  anthropic: [
    { id: "claude-opus-4-5", name: "Claude Opus 4.5 (Most capable)" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5 (Balanced)" },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5 (Fastest)" },
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4 (Stable)" },
  ],
  google: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Fast)" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (Capable)" },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (Fast)" },
  ],
  aws_bedrock: [
    { id: "anthropic.claude-sonnet-4-5-20250514-v1:0", name: "Claude Sonnet 4.5 on Bedrock" },
    { id: "anthropic.claude-haiku-4-5-20250514-v1:0", name: "Claude Haiku 4.5 on Bedrock" },
    { id: "amazon.nova-pro-v1:0", name: "Amazon Nova Pro" },
    { id: "amazon.nova-lite-v1:0", name: "Amazon Nova Lite" },
  ],
  openrouter: [],
};

function getModelName(id: string, dynamicModels: Array<{ id: string; name: string }>): string {
  return dynamicModels.find((m) => m.id === id)?.name ?? id;
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AiConfigSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="กำลังโหลดการตั้งค่า AI...">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      {MODEL_FIELDS.map((f) => (
        <div key={f.name} className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-10 w-full max-w-sm" />
        </div>
      ))}
      <Skeleton className="h-10 w-28" />
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function AiConfigError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5" role="alert">
      <CardContent className="flex items-center gap-3 pt-6">
        <AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">โหลดการตั้งค่าไม่สำเร็จ</p>
          <p className="mt-0.5 text-xs text-destructive/80">{message}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
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

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data, isLoading, isError, error, refetch } = api.admin.getAiConfig.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const { data: apiKeys } = api.admin.listApiKeys.useQuery(undefined, { staleTime: 30_000 });

  // Active key = first active key, fallback to first key overall
  const activeKey = apiKeys?.find((k) => k.isActive) ?? apiKeys?.[0] ?? null;
  const activeProvider = activeKey?.provider ?? "anthropic";

  // ── Available models (dynamic, starts from defaults) ─────────────────────
  const [availableModels, setAvailableModels] = React.useState<Array<{ id: string; name: string }>>(
    DEFAULT_MODELS_BY_PROVIDER[activeProvider] ?? DEFAULT_MODELS_BY_PROVIDER["anthropic"]!
  );
  const [modelsRefreshed, setModelsRefreshed] = React.useState(false);

  React.useEffect(() => {
    if (!modelsRefreshed) {
      setAvailableModels(
        DEFAULT_MODELS_BY_PROVIDER[activeProvider] ?? DEFAULT_MODELS_BY_PROVIDER["anthropic"]!
      );
    }
  }, [activeProvider, modelsRefreshed]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateMutation = api.admin.updateAiConfig.useMutation({
    onSuccess: () => toast.success("บันทึกการตั้งค่า AI เรียบร้อยแล้ว"),
    onError: (err) => toast.error("บันทึกไม่สำเร็จ", { description: err.message }),
  });

  const listModelsMutation = api.admin.listModels.useMutation({
    onSuccess: (models) => {
      if (models.length > 0) {
        setAvailableModels(models);
        setModelsRefreshed(true);
        toast.success(`โหลด ${models.length} models สำเร็จ`);
      } else {
        toast.error("ไม่พบ models — ตรวจสอบ API key ที่ active อยู่");
      }
    },
    onError: () => toast.error("โหลด models ไม่สำเร็จ — ตรวจสอบ API key"),
  });

  // ── React Hook Form ───────────────────────────────────────────────────────
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

  function onSubmit(values: UpdateAiConfigInput) {
    updateMutation.mutate(values);
  }

  if (isLoading) return <AiConfigSkeleton />;
  if (isError) {
    return (
      <AiConfigError
        message={error?.message ?? "ไม่สามารถโหลดการตั้งค่า AI ได้"}
        onRetry={() => void refetch()}
      />
    );
  }

  // Merge config models with dynamic models (avoid losing saved value from dropdown)
  const configModelIds = data?.supportedModels ?? [];
  const allModelIds = new Set([...availableModels.map((m) => m.id), ...configModelIds]);
  const mergedModels = Array.from(allModelIds).map((id) => ({
    id,
    name: getModelName(id, availableModels),
  }));

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
            <p className="text-sm text-muted-foreground">เลือก AI model สำหรับแต่ละ task type</p>
          </div>
        </div>

        {/* Active provider card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="text-sm font-medium">Active Provider</CardTitle>
                <CardDescription className="mt-0.5 truncate">
                  {activeKey
                    ? `Key: "${activeKey.name}" · ${activeKey.maskedKey}`
                    : "ยังไม่มี API key — ไปที่ tab API Keys เพื่อเพิ่ม"}
                </CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className={PROVIDER_BADGE_CLASS[activeProvider] ?? ""}>
                  {PROVIDER_LABELS[activeProvider] ?? activeProvider}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!activeKey || listModelsMutation.isPending}
                  onClick={() => {
                    if (!activeKey) return;
                    listModelsMutation.mutate({
                      key: activeKey.maskedKey,
                      provider: activeProvider as
                        | "anthropic"
                        | "google"
                        | "aws_bedrock"
                        | "openrouter",
                    });
                  }}
                  aria-label="Refresh available models from provider"
                >
                  {listModelsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
                      กำลังโหลด...
                    </>
                  ) : modelsRefreshed ? (
                    <>
                      <CheckCircle2 className="mr-1.5 size-3.5 text-green-600" aria-hidden="true" />
                      Refresh Models
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
                      Load Models
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

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
                  render={({ field: cf, fieldState }) => (
                    <div className="space-y-1">
                      <Select
                        value={cf.value}
                        onValueChange={cf.onChange}
                        disabled={updateMutation.isPending}
                      >
                        <SelectTrigger
                          id={`select-${field.name}`}
                          className="max-w-sm"
                          aria-invalid={fieldState.error ? "true" : undefined}
                        >
                          <SelectValue placeholder="เลือก model..." />
                        </SelectTrigger>
                        <SelectContent>
                          {mergedModels.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.error && (
                        <p className="text-xs text-destructive" role="alert">
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

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={updateMutation.isPending || !isDirty} className="gap-2">
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
