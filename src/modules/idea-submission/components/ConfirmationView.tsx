"use client";

/**
 * ConfirmationView — post-submit status card with AI analysis polling.
 *
 * - Shows reference number + copy button immediately
 * - Polls api.idea.getStatus every 5 seconds
 * - Loading: Skeleton + aria-live="polite" message
 * - Complete (analysis_complete): stop polling, show "AI Draft พร้อมแล้ว" + link
 * - Error (failed): show retry message
 *
 * Task 5.1
 */

import * as React from "react";
import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { CheckCircle, Copy, AlertCircle, Clock } from "lucide-react";
import { api } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfirmationViewProps {
  ideaId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfirmationView({ ideaId }: ConfirmationViewProps) {
  const t = useTranslations("confirmation");
  const params = useParams();
  const locale = (params?.locale as string) ?? "th";
  const [copied, setCopied] = useState(false);

  // Poll every 5 seconds; stop when status is terminal
  const { data, isLoading, isError, error } = api.idea.getStatus.useQuery(
    { ideaId },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.analysisStatus;
        if (status === "analysis_complete" || status === "failed") return false;
        return 5000;
      },
    }
  );

  const copyRefNumber = useCallback(() => {
    if (data?.referenceNumber) {
      void navigator.clipboard.writeText(data.referenceNumber).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [data?.referenceNumber]);

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-48" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {t("loadingStatus")}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-center gap-3 pt-6">
          <AlertCircle className="size-5 text-destructive" />
          <p className="text-sm text-destructive">{error?.message ?? t("errorFetchStatus")}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { referenceNumber, analysisStatus, currentStage } = data;
  const isComplete = analysisStatus === "analysis_complete";
  const isFailed = analysisStatus === "failed";
  const isPending = !isComplete && !isFailed;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle className="size-5 text-green-600" />
          ) : isFailed ? (
            <AlertCircle className="size-5 text-destructive" />
          ) : (
            <Clock className="size-5 text-amber-500" />
          )}
          {isComplete ? t("statusComplete") : isFailed ? t("statusFailed") : t("statusPending")}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Reference number */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-4 py-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">{t("referenceNumber")}</p>
            <p className="font-mono text-lg font-semibold tracking-wider">{referenceNumber}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={copyRefNumber}
            aria-label={t("copyRefNumber")}
            className={cn(copied && "text-green-600")}
          >
            <Copy className="size-4" />
          </Button>
        </div>

        {/* Status message area — aria-live for screen reader updates */}
        <div aria-live="polite" aria-atomic="true">
          {isPending && (
            <div className="flex items-center gap-2">
              <div className="size-2 animate-pulse rounded-full bg-amber-500" />
              <p className="text-sm text-muted-foreground">{t("analysing")}</p>
            </div>
          )}

          {isComplete && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-green-700">{t("aiDraftReady")}</p>
              <Button asChild variant="outline" size="sm" className="self-start">
                <a href={`/${locale}/ideas/${ideaId}/analysis`}>{t("viewAiDraft")}</a>
              </Button>
            </div>
          )}

          {isFailed && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-destructive">{t("analysisFailed")}</p>
              <p className="text-xs text-muted-foreground">{t("retryMessage")}</p>
            </div>
          )}
        </div>

        {/* Current stage */}
        <div className="text-xs text-muted-foreground">
          {t("stage")}: <span className="font-medium">{currentStage}</span>
        </div>
      </CardContent>
    </Card>
  );
}
