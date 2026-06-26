"use client";

/**
 * PipelineBreakdownChart — BarChart showing idea count per pipeline stage.
 *
 * - Recharts BarChart inside ResponsiveContainer (mobile-responsive)
 * - Loading: shadcn Skeleton
 * - Empty: tasteful placeholder via EmptyState
 * - Accessibility: role="img" + aria-label
 * - i18n: stage labels via next-intl
 *
 * Ref: design/components.md — Chart Components (Component 7)
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
  Cell,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { StageCountRow } from "@/modules/dashboard-analytics/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineBreakdownChartProps {
  data: StageCountRow[];
  isLoading: boolean;
  className?: string;
}

// Stage colour mapping — consistent palette across the pipeline
const STAGE_COLORS: Record<string, string> = {
  sandbox: "#94a3b8",
  validation_sprint: "#60a5fa",
  build_sprint: "#34d399",
  launch_test: "#f59e0b",
  closed_go: "#22c55e",
  closed_no_go: "#f87171",
};

const DEFAULT_COLOR = "#6366f1";

// ─── Component ────────────────────────────────────────────────────────────────

export function PipelineBreakdownChart({
  data,
  isLoading,
  className,
}: PipelineBreakdownChartProps) {
  const t = useTranslations("dashboard.charts.pipelineBreakdown");
  const tStages = useTranslations("dashboard.stages");
  const tCharts = useTranslations("dashboard.charts");

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)} role="status" aria-label={t("ariaLabel")}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
  }

  const hasData = data.length > 0 && data.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <div className={cn("flex flex-col", className)}>
        <p className="mb-4 text-sm font-medium text-foreground">{t("title")}</p>
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title={tCharts("noData")}
          description={tCharts("noDataDesc")}
          className="min-h-[220px]"
        />
      </div>
    );
  }

  const chartData = data.map((row) => ({
    name: tStages(
      row.stage as
        | "sandbox"
        | "validation_sprint"
        | "build_sprint"
        | "launch_test"
        | "closed_go"
        | "closed_no_go"
    ),
    value: row.count,
    stage: row.stage,
  }));

  return (
    <figure role="img" aria-label={t("ariaLabel")} className={cn("w-full", className)}>
      <figcaption className="mb-4 text-sm font-medium text-foreground">{t("title")}</figcaption>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          aria-label={t("ariaLabel")}
        >
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
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={STAGE_COLORS[entry.stage] ?? DEFAULT_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Accessible data table fallback for screen readers */}
      <table className="sr-only">
        <caption>{t("title")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("xAxis")}</th>
            <th scope="col">{t("yAxis")}</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.stage}>
              <td>{row.name}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default PipelineBreakdownChart;
