"use client";

/**
 * AnalysisStatusPoller — polls analysis.getByIdeaId every 5 seconds.
 *
 * Polling behavior:
 *   - Polls every 5 s while status is 'pending' or 'processing'
 *   - Stops automatically when status is 'completed' or 'failed'
 *
 * States:
 *   - Loading / polling  → skeleton + "AI กำลังวิเคราะห์..." with aria-busy
 *   - Completed          → renders <AnalysisResultView>
 *   - Failed             → error state + retry button (admin only)
 *   - Query error        → error message
 *
 * Props:
 *   ideaId   — UUID of the idea
 *   userRole — optional role string (for admin retry + score override)
 *
 * Task 4.1
 */

import * as React from "react";
import { api } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AnalysisResultView } from "./AnalysisResultView";
import { DocumentGenerationSection } from "@/components/document-generation/document-generation-section";
import type { AIAnalysis } from "@/modules/ai-analysis/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;
const TERMINAL_STATUSES = new Set(["completed", "failed"]);

// ─── Skeleton placeholder ─────────────────────────────────────────────────────

function AnalysisSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-5 w-48" aria-label="กำลังโหลด..." />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="mt-2 h-[200px] w-full" />
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AnalysisStatusPollerProps {
  ideaId: string;
  userRole?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalysisStatusPoller({ ideaId, userRole }: AnalysisStatusPollerProps) {
  const isAdmin = userRole === "admin";

  const {
    data: analysis,
    isLoading,
    isError,
    error,
    refetch,
  } = api.analysis.getByIdeaId.useQuery(
    { ideaId },
    {
      // Poll every 5 s, stop when terminal status is reached
      refetchInterval: (query) => {
        const status = query.state.data?.processingStatus;
        if (status && TERMINAL_STATUSES.has(status)) return false;
        return POLL_INTERVAL_MS;
      },
      // Keep query enabled only while not in terminal state
      // (enabled=false would prevent initial fetch, so we keep it true)
      enabled: true,
      staleTime: 0,
    }
  );

  const triggerReanalysisMutation = api.analysis.triggerReanalysis.useMutation({
    onSuccess: () => {
      void refetch();
    },
  });

  const handleRetry = () => {
    triggerReanalysisMutation.mutate({ ideaId, reason: "Manual retry from UI" });
  };

  // ── Query error (network/server error) ──────────────────────────────────

  if (isError) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-md border border-destructive/40 bg-destructive/5 p-4"
      >
        <p className="text-sm font-medium text-destructive">ไม่สามารถโหลดผลการวิเคราะห์ได้</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"}
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()} className="mt-3">
          ลองใหม่
        </Button>
      </div>
    );
  }

  // ── Initial loading (before first data) ─────────────────────────────────

  if (isLoading || !analysis) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label="กำลังโหลดผลการวิเคราะห์"
        className="flex flex-col gap-4"
      >
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
          <span
            className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium text-foreground">AI กำลังวิเคราะห์...</p>
            <p className="text-xs text-muted-foreground">คาดว่าจะเสร็จภายใน &lt; 2 นาที</p>
          </div>
        </div>
        <AnalysisSkeleton />
      </div>
    );
  }

  // ── Polling / processing state ───────────────────────────────────────────

  const isPolling = !TERMINAL_STATUSES.has(analysis.processingStatus);

  if (isPolling) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label="AI กำลังวิเคราะห์"
        className="flex flex-col gap-4"
      >
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
          <span
            className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium text-foreground">AI กำลังวิเคราะห์...</p>
            <p className="text-xs text-muted-foreground">
              สถานะ: {analysis.processingStatus === "processing" ? "กำลังประมวลผล" : "รอดำเนินการ"}{" "}
              — คาดว่าจะเสร็จภายใน &lt; 2 นาที
            </p>
          </div>
        </div>
        <AnalysisSkeleton />
      </div>
    );
  }

  // ── Failed state ─────────────────────────────────────────────────────────

  if (analysis.processingStatus === "failed") {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
      >
        <div>
          <p className="text-sm font-semibold text-destructive">การวิเคราะห์ไม่สำเร็จ</p>
          {analysis.lastError && (
            <p className="mt-1 text-xs text-muted-foreground">{analysis.lastError}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            ลองใหม่แล้ว {analysis.attemptCount} ครั้ง
          </p>
        </div>

        {/* Retry button — visible to admin only */}
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={triggerReanalysisMutation.isPending}
            aria-busy={triggerReanalysisMutation.isPending}
            className="w-fit"
          >
            {triggerReanalysisMutation.isPending ? "กำลัง retry..." : "วิเคราะห์ใหม่"}
          </Button>
        )}
      </div>
    );
  }

  // ── Completed — render full result view ──────────────────────────────────

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="ผลการวิเคราะห์ AI"
      className="flex flex-col gap-6"
    >
      <AnalysisResultView analysis={analysis as AIAnalysis} userRole={userRole} />
      <DocumentGenerationSection ideaId={ideaId} analysisCompleted />
    </div>
  );
}
