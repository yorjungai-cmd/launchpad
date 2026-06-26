"use client";

/**
 * KanbanColumn — a single pipeline stage column in the Kanban board.
 *
 * Displays:
 *   - Header: stage name + idea count badge
 *   - List of IdeaCard components
 *   - "Load more" button when hasMore = true
 *   - Loading skeleton (3 cards) when isLoading = true
 *   - Empty state message when no ideas
 *
 * Task 5.2
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import type { PipelineIdeaDTO } from "@/modules/pipeline/schemas";
import { IdeaCard } from "./IdeaCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Card skeleton ────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface KanbanColumnProps {
  stage: string;
  ideas: PipelineIdeaDTO[];
  hasMore: boolean;
  cursor: string | null;
  onLoadMore: () => void;
  isLoading?: boolean;
  className?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function KanbanColumn({
  stage,
  ideas,
  hasMore,
  onLoadMore,
  isLoading = false,
  className,
}: KanbanColumnProps) {
  const t = useTranslations("pipeline");

  // Localised stage name
  let stageName: string;
  try {
    stageName = t(`stages.${stage}`);
  } catch {
    stageName = stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <section
      aria-label={stageName}
      className={cn("flex min-w-[260px] max-w-[300px] shrink-0 flex-col gap-3", className)}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">{stageName}</h2>
        <Badge variant="secondary" className="text-xs tabular-nums">
          {ideas.length}
          {hasMore ? "+" : ""}
        </Badge>
      </div>

      {/* Ideas list */}
      <div className="flex flex-col gap-2">
        {isLoading && ideas.length === 0 ? (
          // Initial loading: show skeletons
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : ideas.length === 0 ? (
          // Empty state
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">{t("kanban.emptyColumn")}</p>
          </div>
        ) : (
          <>
            {ideas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
            {/* Load-more inline skeleton (appending more) */}
            {isLoading && (
              <>
                <CardSkeleton />
                <CardSkeleton />
              </>
            )}
          </>
        )}
      </div>

      {/* Load more button */}
      {hasMore && !isLoading && (
        <Button variant="outline" size="sm" className="w-full" onClick={onLoadMore}>
          {t("kanban.loadMore")}
        </Button>
      )}
    </section>
  );
}
