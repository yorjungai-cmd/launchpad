"use client";

/**
 * ReviewerWorkloadChart — Stacked BarChart showing idea workload per BD reviewer.
 *
 * Each bar represents one reviewer; the bar is segmented (stacked) by pipeline stage.
 * This makes it easy to see both total load and stage distribution per person.
 *
 * - Recharts BarChart (stacked) inside ResponsiveContainer
 * - Loading: shadcn Skeleton
 * - Empty: EmptyState placeholder
 * - Accessibility: role="img" + aria-label + sr-only data table
 * - i18n: labels via next-intl
 * - NOTE: does NOT display idea content — only counts per stage (privacy rule)
 *
 * Ref: design/components.md — Chart Components (Component 7), BDTeamDashboardPage
 * Task 5.3
 */

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { IdeaStage, type ReviewerWorkloadRow } from "@/modules/dashboard-analytics/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReviewerWorkloadChartProps {
  data: ReviewerWorkloadRow[];
  isLoading: boolean;
  className?: string;
}

// Ordered stages for consistent stacking
const STAGE_ORDER: IdeaStage[] = [
  IdeaStage.SANDBOX,
  IdeaStage.VALIDATION_SPRINT,
  IdeaStage.BUILD_SPRINT,
  IdeaStage.LAUNCH_TEST,
  IdeaStage.CLOSED_GO,
  IdeaStage.CLOSED_NO_GO,
];

const STAGE_COLORS: Record<IdeaStage, string> = {
  [IdeaStage.SANDBOX]: "#94a3b8",
  [IdeaStage.VALIDATION_SPRINT]: "#60a5fa",
  [IdeaStage.BUILD_SPRINT]: "#34d399",
  [IdeaStage.LAUNCH_TEST]: "#f59e0b",
  [IdeaStage.CLOSED_GO]: "#22c55e",
  [IdeaStage.CLOSED_NO_GO]: "#f87171",
};

// Transform ReviewerWorkloadRow[] into format expected by recharts stacked bar
interface ChartRow {
  name: string;
  reviewerId: string;
  total: number;
  [stage: string]: string | number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewerWorkloadChart({ data, isLoading, className }: ReviewerWorkloadChartProps) {
  const t = useTranslations("dashboard.charts.reviewerWorkload");
  const tStages = useTranslations("dashboard.stages");
  const tCharts = useTranslations("dashboard.charts");

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)} role="status" aria-label={t("ariaLabel")}>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  const hasData = data.length > 0 && data.some((r) => r.ideaCount > 0);

  if (!hasData) {
    return (
      <div className={cn("flex flex-col", className)}>
        <p className="mb-4 text-sm font-medium text-foreground">{t("title")}</p>
        <EmptyState
          icon={<Users className="size-8" />}
          title={tCharts("noData")}
          description={tCharts("noDataDesc")}
          className="min-h-[240px]"
        />
      </div>
    );
  }

  // Build flat chart rows
  const chartData: ChartRow[] = data.map((reviewer) => {
    const row: ChartRow = {
      name: reviewer.reviewerName,
      reviewerId: reviewer.reviewerId,
      total: reviewer.ideaCount,
    };
    for (const stage of STAGE_ORDER) {
      const found = reviewer.byStage.find((s) => s.stage === stage);
      row[stage] = found?.count ?? 0;
    }
    return row;
  });

  // Only render stages that have at least 1 idea across all reviewers
  const activeStages = STAGE_ORDER.filter((stage) =>
    chartData.some((row) => (row[stage] as number) > 0)
  );

  return (
    <figure role="img" aria-label={t("ariaLabel")} className={cn("w-full", className)}>
      <figcaption className="mb-4 text-sm font-medium text-foreground">{t("title")}</figcaption>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            label={{
              value: t("yAxis"),
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
            }}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
              color: "hsl(var(--popover-foreground))",
              fontSize: "12px",
            }}
          />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: "12px" }} />
          {activeStages.map((stage) => (
            <Bar
              key={stage}
              dataKey={stage as string}
              name={tStages(
                stage as
                  | "sandbox"
                  | "validation_sprint"
                  | "build_sprint"
                  | "launch_test"
                  | "closed_go"
                  | "closed_no_go"
              )}
              stackId="workload"
              fill={STAGE_COLORS[stage]}
              // Only round the top of the last stacked bar
              radius={stage === activeStages[activeStages.length - 1] ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Screen reader data table */}
      <table className="sr-only">
        <caption>{t("title")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("xAxis")}</th>
            {activeStages.map((stage) => (
              <th key={stage} scope="col">
                {tStages(
                  stage as
                    | "sandbox"
                    | "validation_sprint"
                    | "build_sprint"
                    | "launch_test"
                    | "closed_go"
                    | "closed_no_go"
                )}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.reviewerId}>
              <td>{row.name}</td>
              {activeStages.map((stage) => (
                <td key={stage}>{row[stage] as number}</td>
              ))}
              <td>{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default ReviewerWorkloadChart;
