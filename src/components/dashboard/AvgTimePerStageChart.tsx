"use client";

/**
 * AvgTimePerStageChart — BarChart showing average days spent per pipeline stage.
 *
 * - Recharts BarChart inside ResponsiveContainer
 * - Loading: shadcn Skeleton
 * - Empty: EmptyState placeholder
 * - Accessibility: role="img" + aria-label + sr-only data table
 * - i18n: labels via next-intl
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
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { StageTimeRow } from "@/modules/dashboard-analytics/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AvgTimePerStageChartProps {
  data: StageTimeRow[];
  isLoading: boolean;
  className?: string;
}

// Warm gradient per stage (sequential in pipeline order)
const STAGE_GRADIENT_COLORS: string[] = [
  "#94a3b8", // sandbox
  "#60a5fa", // validation
  "#34d399", // build
  "#f59e0b", // launch
  "#22c55e", // closed_go
  "#f87171", // closed_no_go
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AvgTimePerStageChart({ data, isLoading, className }: AvgTimePerStageChartProps) {
  const t = useTranslations("dashboard.charts.avgTimePerStage");
  const tStages = useTranslations("dashboard.stages");
  const tCharts = useTranslations("dashboard.charts");

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)} role="status" aria-label={t("ariaLabel")}>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
  }

  const hasData = data.length > 0 && data.some((d) => d.avgDays > 0);

  if (!hasData) {
    return (
      <div className={cn("flex flex-col", className)}>
        <p className="mb-4 text-sm font-medium text-foreground">{t("title")}</p>
        <EmptyState
          icon={<Clock className="size-8" />}
          title={tCharts("noData")}
          description={tCharts("noDataDesc")}
          className="min-h-[220px]"
        />
      </div>
    );
  }

  const chartData = data.map((row, index) => ({
    name: tStages(
      row.stage as
        | "sandbox"
        | "validation_sprint"
        | "build_sprint"
        | "launch_test"
        | "closed_go"
        | "closed_no_go"
    ),
    value: parseFloat(row.avgDays.toFixed(1)),
    stage: row.stage,
    colorIndex: index,
  }));

  return (
    <figure role="img" aria-label={t("ariaLabel")} className={cn("w-full", className)}>
      <figcaption className="mb-4 text-sm font-medium text-foreground">{t("title")}</figcaption>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
          />
          <YAxis
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
            formatter={(value: unknown) => {
              const days = typeof value === "number" ? value : Number(value);
              return [`${days} วัน / days`, t("yAxis")];
            }}
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
              <Cell
                key={`cell-${index}`}
                fill={STAGE_GRADIENT_COLORS[entry.colorIndex % STAGE_GRADIENT_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Screen reader data table */}
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

export default AvgTimePerStageChart;
