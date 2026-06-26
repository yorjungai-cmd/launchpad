"use client";

/**
 * TrackingForm — public guest tracking view.
 *
 * Receives referenceNumber from URL params.
 * Calls api.pipeline.trackByReference (public, no auth required).
 * Displays: title, current stage badge, submitted date, StageTimeline.
 *
 * Loading state → skeleton.
 * Error / not found → message + link back home.
 *
 * Task 5.4
 */

import * as React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/trpc/client";
import { Stage } from "@/shared/enums";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StageTimeline } from "./StageTimeline";
import { cn } from "@/lib/utils";

// ─── Stage colours ────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<Stage, string> = {
  [Stage.SANDBOX]: "bg-amber-100 text-amber-800 border-amber-200",
  [Stage.VALIDATION_SPRINT]: "bg-blue-100 text-blue-800 border-blue-200",
  [Stage.BUILD_SPRINT]: "bg-violet-100 text-violet-800 border-violet-200",
  [Stage.LAUNCH_AND_TEST]: "bg-green-100 text-green-800 border-green-200",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TrackingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

// ─── Meta row ─────────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="min-w-[140px] text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TrackingFormProps {
  referenceNumber: string;
  className?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TrackingForm({ referenceNumber, className }: TrackingFormProps) {
  const t = useTranslations("pipeline");
  const locale = useLocale();

  const { data, isLoading, error } = api.pipeline.trackByReference.useQuery(
    { referenceNumber },
    {
      enabled: !!referenceNumber,
      refetchOnWindowFocus: false,
      retry: 1,
    }
  );

  // Loading
  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-6", className)}>
        <p className="animate-pulse text-sm text-muted-foreground">{t("tracking.loading")}</p>
        <TrackingSkeleton />
      </div>
    );
  }

  // Error / not found
  if (error || !data?.tracking) {
    return (
      <div className={cn("flex flex-col items-center gap-4 py-12 text-center", className)}>
        <p className="text-lg font-semibold text-foreground">{t("tracking.notFound")}</p>
        <p className="text-sm text-muted-foreground">{t("tracking.notFoundDesc")}</p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/${locale}`}>{t("tracking.backHome")}</Link>
        </Button>
      </div>
    );
  }

  const { tracking } = data;

  const stageColor =
    STAGE_COLORS[tracking.currentStage] ?? "bg-secondary text-secondary-foreground";

  let stageLabel: string;
  try {
    stageLabel = t(`stages.${tracking.currentStage}`);
  } catch {
    stageLabel = tracking.currentStage;
  }

  return (
    <article className={cn("flex flex-col gap-8", className)}>
      {/* Title + stage badge */}
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold leading-tight text-foreground">{tracking.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge className={cn("border text-xs font-medium", stageColor)}>{stageLabel}</Badge>
        </div>
      </div>

      {/* Meta table */}
      <dl className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <MetaRow label={t("tracking.referenceNumber")} value={tracking.referenceNumber} />
        <MetaRow label={t("tracking.submittedAt")} value={formatDate(tracking.submittedAt)} />
        <MetaRow label={t("tracking.updatedAt")} value={formatDate(tracking.updatedAt)} />
      </dl>

      {/* Stage timeline */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t("tracking.timeline")}</h2>
        <StageTimeline timeline={tracking.stageTimeline} currentStage={tracking.currentStage} />
      </div>
    </article>
  );
}
