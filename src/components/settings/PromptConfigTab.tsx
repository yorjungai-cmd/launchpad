"use client";

import * as React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DocTypeNav, type NavSelection } from "./prompt-config/DocTypeNav";
import { SystemPromptEditor } from "./prompt-config/SystemPromptEditor";
import { DocTypeSectionEditor } from "./prompt-config/DocTypeSectionEditor";
import type { WorkflowDocumentType } from "@/lib/document-generation/prompt-config-defaults";

function PromptConfigSkeleton() {
  return (
    <div className="flex gap-6" aria-busy="true" aria-label="กำลังโหลด...">
      <div className="w-52 space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}

export function PromptConfigTab() {
  const [selected, setSelected] = React.useState<NavSelection>("global");
  const [dirtyTypes, setDirtyTypes] = React.useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, refetch } = api.admin.getPromptConfig.useQuery(
    undefined,
    { staleTime: 0 }
  );

  function setDirty(key: string, dirty: boolean) {
    setDirtyTypes((prev) => {
      const next = new Set(prev);
      if (dirty) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  if (isLoading) return <PromptConfigSkeleton />;

  if (isError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5" role="alert">
        <CardContent className="flex items-center gap-3 pt-6">
          <AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">โหลดการตั้งค่า Prompt ไม่สำเร็จ</p>
            <p className="mt-0.5 text-xs text-destructive/80">{error?.message}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetch();
            }}
            className="gap-1.5"
          >
            <RefreshCw className="size-3.5" />
            ลองใหม่
          </Button>
        </CardContent>
      </Card>
    );
  }

  const systemPrompt = data?.systemPrompt ?? "";
  const sections = data?.sections ?? {};

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Left sidebar */}
      <DocTypeNav selected={selected} dirtyTypes={dirtyTypes} onSelect={setSelected} />

      {/* Content panel */}
      <div className="min-w-0 flex-1">
        {selected === "global" ? (
          <SystemPromptEditor
            initialValue={systemPrompt}
            onDirtyChange={(d) => setDirty("global", d)}
          />
        ) : (
          <DocTypeSectionEditor
            documentType={selected as WorkflowDocumentType}
            currentSections={(sections[selected] as Record<string, string>) ?? {}}
            systemPrompt={systemPrompt}
            onDirtyChange={(d) => setDirty(selected, d)}
          />
        )}
      </div>
    </div>
  );
}
