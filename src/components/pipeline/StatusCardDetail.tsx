"use client";

/**
 * StatusCardDetail — full status card for a single idea with stage timeline.
 *
 * Calls api.pipeline.getStatusCard with 30s polling.
 * Shows: title, stage badge, submitter type, reviewer, dates.
 * Renders <StageTimeline> with timeline data.
 * Loading skeleton + error state.
 *
 * Task 5.3
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/trpc/client";
import { Stage } from "@/shared/enums";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StageTimeline } from "./StageTimeline";
import { cn } from "@/lib/utils";

// ─── Stage colours (same palette as IdeaCard) ────────────────────────────────

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
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function StatusCardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-2/3" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

// ─── Meta row ─────────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="min-w-[160px] text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface StatusCardDetailProps {
  ideaId: string;
  className?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StatusCardDetail({ ideaId, className }: StatusCardDetailProps) {
  const t = useTranslations("pipeline");

  const { data, isLoading, error } = api.pipeline.getStatusCard.useQuery(
    { ideaId },
    {
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    }
  );

  // Loading state
  if (isLoading) {
    return <StatusCardSkeleton />;
  }

  // Error / not found state
  if (error || !data?.statusCard) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-lg font-semibold text-foreground">{t("statusCard.notFound")}</p>
        <p className="text-sm text-muted-foreground">{t("statusCard.notFoundDesc")}</p>
      </div>
    );
  }

  const { statusCard } = data;

  // Stage colors and label
  const stageColor =
    STAGE_COLORS[statusCard.currentStage] ?? "bg-secondary text-secondary-foreground";

  let stageLabel: string;
  try {
    stageLabel = t(`stages.${statusCard.currentStage}`);
  } catch {
    stageLabel = statusCard.currentStage;
  }

  let submitterTypeLabel: string;
  try {
    submitterTypeLabel = t(`submitterType.${statusCard.submitterType}`);
  } catch {
    submitterTypeLabel = statusCard.submitterType;
  }

  return (
    <article className={cn("flex flex-col gap-8", className)}>
      {/* Title + badges */}
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold leading-tight text-foreground">{statusCard.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge className={cn("border text-xs font-medium", stageColor)}>{stageLabel}</Badge>
          <Badge variant="secondary" className="text-xs font-medium">
            {submitterTypeLabel}
          </Badge>
        </div>
      </div>

      {/* Meta table */}
      <dl className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <MetaRow
          label={t("statusCard.assignedReviewer")}
          value={statusCard.assignedReviewer?.fullName ?? t("statusCard.noReviewer")}
        />
        <MetaRow label={t("statusCard.submittedAt")} value={formatDate(statusCard.submittedAt)} />
        <MetaRow label={t("statusCard.updatedAt")} value={formatDate(statusCard.updatedAt)} />
      </dl>

      {/* Stage timeline */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t("statusCard.timeline")}</h2>
        <StageTimeline timeline={statusCard.stageTimeline} currentStage={statusCard.currentStage} />
      </div>
    </article>
  );
}
