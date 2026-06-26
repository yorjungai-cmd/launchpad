"use client";

/**
 * IdeaSummaryModal — Executive summary modal shown when clicking an idea (US-25 AC2).
 *
 * Supports two usage modes:
 *   1. `ideaId` mode — loads individual idea detail via tRPC `review.getDetail`
 *      (per-idea summary from the pipeline kanban / drill-down)
 *   2. `summary` mode — receives a pre-loaded `ExecutiveSummaryData` object and
 *      renders an aggregate 1-page executive summary (used by ExecutiveDashboardPage)
 *
 * Displays:
 *   - Stage pipeline breakdown
 *   - Win/No-Go stats
 *   - Average time per stage
 *   - Full feasibility detail when in `ideaId` mode
 *
 * Ref: design/components.md — Component 9 (IdeaSummaryModal), US-25 AC2
 * Task 5.4
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { ExecutiveSummaryData } from "@/modules/dashboard-analytics/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdeaSummaryModalProps {
  /**
   * UUID of a specific idea to display (drill-down mode).
   * Mutually exclusive with `summary`.
   */
  ideaId?: string | null;
  /**
   * Pre-loaded aggregate executive summary data (summary mode).
   * Used by ExecutiveDashboardPage to show a pipeline overview.
   */
  summary?: ExecutiveSummaryData | null;
  /** Whether the modal is visible */
  open: boolean;
  /** Called when the user closes the modal */
  onClose: () => void;
}

// ─── Score bar ────────────────────────────────────────────────────────────────

interface ScoreRowProps {
  label: string;
  value: number | null;
}

function ScoreRow({ label, value }: ScoreRowProps) {
  const score = value ?? 0;
  const pct = Math.round((score / 5) * 100);

  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div
        className="flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-label={`${label}: ${score}/5`}
      >
        <div
          className={cn(
            "h-2 rounded-full transition-all",
            score >= 4 ? "bg-green-500" : score >= 3 ? "bg-amber-400" : "bg-red-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-sm font-semibold tabular-nums">
        {value !== null ? score.toFixed(0) : "—"}
      </span>
    </div>
  );
}

// ─── Recommendation badge ─────────────────────────────────────────────────────

function recoBadgeVariant(action: string | null): "default" | "secondary" | "destructive" {
  if (!action) return "secondary";
  const lower = action.toLowerCase();
  if (lower.includes("no go")) return "destructive";
  if (lower.includes("conditional")) return "secondary";
  return "default";
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SummarySkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-2 w-full" />
        ))}
      </div>
    </div>
  );
}

// ─── Aggregate summary view (summary mode) ────────────────────────────────────

interface AggregateSummaryViewProps {
  summary: ExecutiveSummaryData;
}

function AggregateSummaryView({ summary }: AggregateSummaryViewProps) {
  const winRate = ((summary.winNoGoStats.winRate ?? 0) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Pipeline KPIs */}
      <section aria-labelledby="agg-kpi-heading">
        <h3 id="agg-kpi-heading" className="mb-3 text-sm font-semibold text-foreground">
          Pipeline Overview
        </h3>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">ไอเดียทั้งหมด</dt>
            <dd className="mt-1 text-2xl font-bold">{summary.totalIdeas}</dd>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">Win Rate</dt>
            <dd className="mt-1 text-2xl font-bold text-green-600">{winRate}%</dd>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">ปิดไปแล้ว</dt>
            <dd className="mt-1 text-2xl font-bold">{summary.winNoGoStats.totalClosed}</dd>
          </div>
        </dl>
      </section>

      {/* Stage breakdown */}
      {summary.ideaCountByStage.length > 0 && (
        <section aria-labelledby="agg-stage-heading">
          <h3 id="agg-stage-heading" className="mb-3 text-sm font-semibold text-foreground">
            จำนวน Idea ต่อ Stage
          </h3>
          <div className="space-y-2">
            {summary.ideaCountByStage.map((row) => (
              <div key={row.stage} className="flex items-center gap-3">
                <span className="w-40 text-sm capitalize text-muted-foreground">
                  {row.stage.replace(/_/g, " ")}
                </span>
                <div className="flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{
                      width: `${summary.totalIdeas > 0 ? (row.count / summary.totalIdeas) * 100 : 0}%`,
                    }}
                    role="progressbar"
                    aria-valuenow={row.count}
                    aria-valuemin={0}
                    aria-valuemax={summary.totalIdeas}
                    aria-label={`${row.stage}: ${row.count}`}
                  />
                </div>
                <span className="w-8 text-right text-sm font-semibold tabular-nums">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Avg time per stage */}
      {summary.avgTimePerStage.length > 0 && (
        <section aria-labelledby="agg-time-heading">
          <h3 id="agg-time-heading" className="mb-3 text-sm font-semibold text-foreground">
            เวลาเฉลี่ยต่อ Stage
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {summary.avgTimePerStage.map((row) => (
              <div key={row.stage} className="rounded-md border border-border p-2 text-center">
                <p className="text-xs capitalize text-muted-foreground">
                  {row.stage.replace(/_/g, " ")}
                </p>
                <p className="mt-0.5 text-lg font-bold">
                  {row.avgDays.toFixed(1)}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">วัน</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Win / No-Go breakdown */}
      <section aria-labelledby="agg-win-heading">
        <h3 id="agg-win-heading" className="mb-3 text-sm font-semibold text-foreground">
          Win / No-Go
        </h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="default" className="bg-green-600">
            Go: {summary.winNoGoStats.closedGo}
          </Badge>
          <Badge variant="destructive">No-Go: {summary.winNoGoStats.closedNoGo}</Badge>
          <Badge variant="secondary">In Progress: {summary.winNoGoStats.inProgress}</Badge>
        </div>
      </section>
    </div>
  );
}

// ─── Idea detail view (ideaId mode) ──────────────────────────────────────────

interface IdeaDetailViewProps {
  ideaId: string;
}

function IdeaDetailView({ ideaId }: IdeaDetailViewProps) {
  const t = useTranslations("dashboard.ideaSummary");

  const { data, isLoading, isError } = api.review.getDetail.useQuery(
    { ideaId },
    { enabled: ideaId.length > 0, staleTime: 5 * 60 * 1000 }
  );

  if (isLoading) {
    return (
      <div role="status" aria-label={t("loading")}>
        <SummarySkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t("notFound")}
      </p>
    );
  }

  const { idea, analysis } = data;

  const submittedAt = idea.submittedAt ? format(new Date(idea.submittedAt), "d MMM yyyy") : "—";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{idea.title}</h3>
        {idea.submitterName && (
          <p className="mt-0.5 text-sm text-muted-foreground">{idea.submitterName}</p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">{t("stage")}</dt>
          <dd className="mt-0.5 text-sm font-medium">{idea.currentStage}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("submittedAt")}</dt>
          <dd className="mt-0.5 text-sm font-medium">{submittedAt}</dd>
        </div>
        {analysis?.ideaType && (
          <div>
            <dt className="text-xs text-muted-foreground">{t("ideaType")}</dt>
            <dd className="mt-0.5 text-sm font-medium">{analysis.ideaType}</dd>
          </div>
        )}
      </dl>

      {analysis?.recommendedAction && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">{t("recommendation")}</p>
          <Badge variant={recoBadgeVariant(analysis.recommendedAction)}>
            {analysis.recommendedAction}
          </Badge>
        </div>
      )}

      {analysis?.feasibility && (
        <section aria-labelledby="feasibility-heading">
          <h4 id="feasibility-heading" className="mb-3 text-sm font-semibold text-foreground">
            {t("feasibility")}
          </h4>
          <div className="space-y-2.5">
            <ScoreRow label={t("strategicFit")} value={analysis.feasibility.strategicFit} />
            <ScoreRow label={t("marketPotential")} value={analysis.feasibility.marketPotential} />
            <ScoreRow
              label={t("technicalFeasibility")}
              value={analysis.feasibility.technicalFeasibility}
            />
            <ScoreRow
              label={t("resourceRequirement")}
              value={analysis.feasibility.resourceRequirement}
            />
            <ScoreRow label={t("businessImpact")} value={analysis.feasibility.businessImpact} />
          </div>
        </section>
      )}

      {data.stageHistory.length > 0 && (
        <section aria-labelledby="history-heading">
          <h4 id="history-heading" className="mb-2 text-sm font-semibold text-foreground">
            Stage History
          </h4>
          <ol className="space-y-1.5">
            {data.stageHistory.slice(0, 5).map((transition, index) => (
              <li key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="inline-block size-1.5 rounded-full bg-muted-foreground"
                  aria-hidden="true"
                />
                <span>
                  {transition.fromStage} → {transition.toStage}
                  {transition.reviewerName && (
                    <span className="ml-1">by {transition.reviewerName}</span>
                  )}
                </span>
                {transition.createdAt && (
                  <span className="ml-auto">
                    {format(new Date(transition.createdAt), "d MMM yyyy")}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IdeaSummaryModal({ ideaId, summary, open, onClose }: IdeaSummaryModalProps) {
  const t = useTranslations("dashboard.ideaSummary");
  const isSummaryMode = summary !== undefined && summary !== null;
  const isIdeaMode = !isSummaryMode && ideaId != null && ideaId.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        className="max-w-2xl overflow-y-auto"
        style={{ maxHeight: "90vh" }}
        aria-labelledby="idea-summary-title"
        aria-describedby="idea-summary-desc"
      >
        <DialogHeader>
          <DialogTitle id="idea-summary-title" className="text-xl">
            {t("title")}
          </DialogTitle>
          <DialogDescription id="idea-summary-desc" className="sr-only">
            {t("title")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {isSummaryMode && <AggregateSummaryView summary={summary} />}
          {isIdeaMode && <IdeaDetailView ideaId={ideaId!} />}
          {!isSummaryMode && !isIdeaMode && (
            <p className="text-sm text-muted-foreground">{t("notFound")}</p>
          )}
        </div>

        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <DialogClose asChild>
            <Button variant="outline" onClick={onClose}>
              {t("close")}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default IdeaSummaryModal;
