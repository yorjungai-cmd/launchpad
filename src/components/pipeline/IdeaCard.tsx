"use client";

/**
 * IdeaCard — card displaying a pipeline idea in the Kanban board.
 *
 * Displays:
 *   - title
 *   - stage badge (color per stage)
 *   - submitter type badge
 *   - updated date
 *   - assigned reviewer name (or "—" if none)
 *
 * Click → navigates to `/[locale]/(app)/ideas/{id}/status`
 *
 * Task 5.2
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { PipelineIdeaDTO } from "@/modules/pipeline/schemas";
import { Stage } from "@/shared/enums";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

// ─── Props ────────────────────────────────────────────────────────────────────

export interface IdeaCardProps {
  idea: PipelineIdeaDTO;
  className?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IdeaCard({ idea, className }: IdeaCardProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("pipeline");

  const stageColor = STAGE_COLORS[idea.currentStage] ?? "bg-secondary text-secondary-foreground";

  // Localised submitter type label
  let submitterTypeLabel: string;
  try {
    submitterTypeLabel = t(`submitterType.${idea.submitterType}`);
  } catch {
    submitterTypeLabel = idea.submitterType;
  }

  // Localised stage label
  let stageLabel: string;
  try {
    stageLabel = t(`stages.${idea.currentStage}`);
  } catch {
    stageLabel = idea.currentStage;
  }

  function handleClick() {
    router.push(`/${locale}/ideas/${idea.id}/status`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={idea.title}
      className={cn(
        "cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        className
      )}
    >
      <CardContent className="flex flex-col gap-2 p-4">
        {/* Title */}
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {idea.title}
        </p>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          <Badge className={cn("border text-xs font-medium", stageColor)}>{stageLabel}</Badge>
          <Badge variant="secondary" className="text-xs font-medium">
            {submitterTypeLabel}
          </Badge>
        </div>

        {/* Meta row */}
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
          <span>{formatDate(idea.updatedAt)}</span>
          <span>{idea.assignedReviewer?.fullName ?? "—"}</span>
        </div>
      </CardContent>
    </Card>
  );
}
