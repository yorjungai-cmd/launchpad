"use client";

/**
 * StageTimeline — horizontal (desktop) / vertical (mobile) step indicator.
 *
 * Displays all Launch PAD 2.0 stages in order.
 * Each step shows:
 *   - Stage name (i18n)
 *   - Icon: ✓ (completed), ● (current), ○ (upcoming)
 *   - Timestamp if the stage has been reached
 *
 * Props:
 *   timeline      — array of StageTimelineEntryDTO (from tRPC)
 *   currentStage  — current stage value (Stage enum string)
 *   className     — optional Tailwind class override
 *
 * Task 5.1
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { Stage } from "@/shared/enums";
import type { StageTimelineEntryDTO } from "@/modules/pipeline/schemas";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Ordered stage display sequence */
const STAGE_ORDER: Stage[] = [
  Stage.SANDBOX,
  Stage.VALIDATION_SPRINT,
  Stage.BUILD_SPRINT,
  Stage.LAUNCH_AND_TEST,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stageIndex(stage: string): number {
  return STAGE_ORDER.indexOf(stage as Stage);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface StageTimelineProps {
  timeline: StageTimelineEntryDTO[];
  currentStage: string;
  className?: string;
}

// ─── Step icon ────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: "completed" | "current" | "upcoming" }) {
  if (status === "completed") {
    return (
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
      >
        ✓
      </span>
    );
  }
  if (status === "current") {
    return (
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-full border-2 border-primary bg-background"
      >
        <span className="size-3 rounded-full bg-primary" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-8 items-center justify-center rounded-full border-2 border-muted-foreground/30 bg-background"
    >
      <span className="size-3 rounded-full border border-muted-foreground/40" />
    </span>
  );
}

// ─── Connector line ───────────────────────────────────────────────────────────

function Connector({ active }: { active: boolean }) {
  return (
    <>
      {/* Desktop: horizontal line */}
      <div
        className={cn(
          "mx-2 hidden h-0.5 flex-1 md:block",
          active ? "bg-primary" : "bg-muted-foreground/20"
        )}
        aria-hidden="true"
      />
      {/* Mobile: vertical line */}
      <div
        className={cn(
          "my-1 ml-4 h-6 w-0.5 md:hidden",
          active ? "bg-primary" : "bg-muted-foreground/20"
        )}
        aria-hidden="true"
      />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StageTimeline({ timeline, currentStage, className }: StageTimelineProps) {
  const t = useTranslations("pipeline");

  // Build a map: toStage → transitionedAt (from timeline entries)
  const transitionMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of timeline) {
      map.set(entry.toStage, entry.transitionedAt);
    }
    return map;
  }, [timeline]);

  const currentIdx = stageIndex(currentStage);

  return (
    <nav aria-label={t("timeline.current")} className={cn("w-full", className)}>
      {/* Desktop: horizontal flex row; Mobile: vertical flex col */}
      <ol role="list" className="flex flex-col gap-0 md:flex-row md:items-start md:gap-0">
        {STAGE_ORDER.map((stage, idx) => {
          const isCompleted = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isUpcoming = idx > currentIdx;
          const status = isCompleted ? "completed" : isCurrent ? "current" : "upcoming";

          const transitionedAt = transitionMap.get(stage);

          // Stage name with fallback
          let stageName: string;
          try {
            stageName = t(`stages.${stage}`);
          } catch {
            stageName = stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          }

          const isLast = idx === STAGE_ORDER.length - 1;

          return (
            <React.Fragment key={stage}>
              <li
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex gap-3 md:flex-1 md:flex-col md:items-center md:gap-2",
                  // Mobile: row layout
                  "flex-row items-start"
                )}
              >
                {/* Mobile: icon + vertical connector wrapper */}
                <div className="flex flex-col items-center md:hidden">
                  <StepIcon status={status} />
                  {!isLast && <Connector active={isCompleted || isCurrent} />}
                </div>

                {/* Desktop: icon */}
                <div className="hidden md:flex md:flex-col md:items-center">
                  <StepIcon status={status} />
                </div>

                {/* Label area */}
                <div className="flex flex-col pb-2 pt-1 md:items-center md:pb-0 md:pt-2 md:text-center">
                  <span
                    className={cn(
                      "text-sm font-medium leading-tight",
                      isCurrent
                        ? "text-foreground"
                        : isCompleted
                          ? "text-foreground"
                          : "text-muted-foreground"
                    )}
                  >
                    {stageName}
                  </span>
                  {transitionedAt && (
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      {t("timeline.transitionedAt")} {formatDate(transitionedAt)}
                    </span>
                  )}
                  {isUpcoming && (
                    <span className="mt-0.5 text-xs text-muted-foreground/60">
                      {t("timeline.upcoming")}
                    </span>
                  )}
                </div>
              </li>

              {/* Desktop connector between steps */}
              {!isLast && (
                <div className="mt-4 hidden flex-1 items-center md:flex">
                  <Connector active={isCompleted} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
