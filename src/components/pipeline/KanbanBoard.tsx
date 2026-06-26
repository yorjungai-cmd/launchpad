"use client";

/**
 * KanbanBoard — full Kanban board view for BD/Admin users.
 *
 * - Calls api.pipeline.getKanban with polling (60 s)
 * - Filter state stored in URL search params (shareable links)
 * - Renders one KanbanColumn per stage
 * - Supports per-column "load more" via cursor state
 *
 * Task 5.2
 */

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/trpc/client";
import { Stage } from "@/shared/enums";
import type { SubmitterType, PipelineIdeaDTO } from "@/modules/pipeline/schemas";
import { FilterBar, type KanbanFilters } from "./FilterBar";
import { KanbanColumn } from "./KanbanColumn";
import { cn } from "@/lib/utils";

// ─── Ordered stage columns ────────────────────────────────────────────────────

const STAGE_ORDER: Stage[] = [
  Stage.SANDBOX,
  Stage.VALIDATION_SPRINT,
  Stage.BUILD_SPRINT,
  Stage.LAUNCH_AND_TEST,
];

// ─── URL ↔ filter helpers ─────────────────────────────────────────────────────

function filtersFromParams(params: URLSearchParams): KanbanFilters {
  const stage = params.get("stage") as Stage | null;
  const submitterType = params.get("submitterType") as SubmitterType | null;
  const fromDate = params.get("fromDate") ?? undefined;
  const toDate = params.get("toDate") ?? undefined;
  return {
    stage: stage ?? undefined,
    submitterType: submitterType ?? undefined,
    fromDate: fromDate ?? undefined,
    toDate: toDate ?? undefined,
  };
}

function filtersToParams(filters: KanbanFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.stage) p.set("stage", filters.stage);
  if (filters.submitterType) p.set("submitterType", filters.submitterType);
  if (filters.fromDate) p.set("fromDate", filters.fromDate);
  if (filters.toDate) p.set("toDate", filters.toDate);
  return p;
}

// ─── Per-column ideas accumulator ─────────────────────────────────────────────
// We accumulate ideas across pages per stage so "load more" appends items.

type ColumnAccumulator = Map<Stage, PipelineIdeaDTO[]>;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface KanbanBoardProps {
  className?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function KanbanBoard({ className }: KanbanBoardProps) {
  const t = useTranslations("pipeline");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Filter state from URL ────────────────────────────────────────────────
  const filters = React.useMemo(() => filtersFromParams(searchParams), [searchParams]);

  // ── Per-column cursor state ──────────────────────────────────────────────
  const [cursors, setCursors] = React.useState<Partial<Record<Stage, string>>>({});

  // ── Accumulated ideas per column ─────────────────────────────────────────
  const [accumulated, setAccumulated] = React.useState<ColumnAccumulator>(
    () => new Map(STAGE_ORDER.map((s) => [s, []]))
  );

  // ── tRPC query ───────────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = api.pipeline.getKanban.useQuery(
    {
      filters: {
        stage: filters.stage,
        submitterType: filters.submitterType,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
      },
      cursors: Object.fromEntries(
        Object.entries(cursors).filter(([, v]) => v !== undefined)
      ) as Record<string, string>,
      limit: 20,
    },
    {
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    }
  );

  // ── Accumulate new data when query returns ───────────────────────────────
  React.useEffect(() => {
    if (!data?.columns) return;
    setAccumulated((prev) => {
      const next = new Map(prev);
      for (const col of data.columns) {
        const stage = col.stage as Stage;
        const existing = next.get(stage) ?? [];
        // Deduplicate by id
        const existingIds = new Set(existing.map((i) => i.id));
        const fresh = col.ideas.filter((i) => !existingIds.has(i.id));
        next.set(stage, [...existing, ...fresh]);
      }
      return next;
    });
  }, [data]);

  // ── Reset accumulated ideas when filters change ──────────────────────────
  React.useEffect(() => {
    setAccumulated(new Map(STAGE_ORDER.map((s) => [s, []])));
    setCursors({});
  }, [filters.stage, filters.submitterType, filters.fromDate, filters.toDate]);

  // ── Filter change → update URL ───────────────────────────────────────────
  function handleFiltersChange(next: KanbanFilters) {
    const p = filtersToParams(next);
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // ── Load more per column ─────────────────────────────────────────────────
  function handleLoadMore(stage: Stage) {
    const colData = data?.columns.find((c) => c.stage === stage);
    if (colData?.cursor) {
      setCursors((prev) => ({ ...prev, [stage]: colData.cursor! }));
    }
  }

  // ── Column metadata (hasMore, cursor) from latest query ─────────────────
  function getColMeta(stage: Stage) {
    const col = data?.columns.find((c) => c.stage === stage);
    return {
      hasMore: col?.hasMore ?? false,
      cursor: col?.cursor ?? null,
    };
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-foreground">{t("kanban.pageTitle")}</h1>
        {isFetching && !isLoading && (
          <span className="animate-pulse text-xs text-muted-foreground">↻</span>
        )}
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onFiltersChange={handleFiltersChange} />

      {/* Board — horizontal scroll on small screens */}
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-4">
          {STAGE_ORDER.map((stage) => {
            const { hasMore, cursor } = getColMeta(stage);
            const ideas = accumulated.get(stage) ?? [];

            return (
              <KanbanColumn
                key={stage}
                stage={stage}
                ideas={ideas}
                hasMore={hasMore}
                cursor={cursor}
                onLoadMore={() => handleLoadMore(stage)}
                isLoading={isLoading}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
