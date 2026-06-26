"use client";

/**
 * WinNoGoChart — PieChart showing Win / No-Go / In-Progress ratio.
 *
 * - Recharts PieChart inside ResponsiveContainer
 * - Loading: shadcn Skeleton
 * - Empty: EmptyState placeholder
 * - Accessibility: role="img" + aria-label + sr-only data table
 * - i18n: labels via next-intl
 *
 * Ref: design/components.md — Chart Components (Component 7)
 * Task 5.3
 */

import * as React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { WinNoGoStats } from "@/modules/dashboard-analytics/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WinNoGoChartProps {
  data: WinNoGoStats | null;
  isLoading: boolean;
  className?: string;
}

const COLORS = {
  closedGo: "#22c55e",
  closedNoGo: "#f87171",
  inProgress: "#94a3b8",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function WinNoGoChart({ data, isLoading, className }: WinNoGoChartProps) {
  const t = useTranslations("dashboard.charts.winNoGo");
  const tCharts = useTranslations("dashboard.charts");

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)} role="status" aria-label={t("ariaLabel")}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-[280px] w-full rounded-full" />
      </div>
    );
  }

  const hasData = data !== null && data.closedGo + data.closedNoGo + data.inProgress > 0;

  if (!hasData) {
    return (
      <div className={cn("flex flex-col", className)}>
        <p className="mb-4 text-sm font-medium text-foreground">{t("title")}</p>
        <EmptyState
          icon={<PieIcon className="size-8" />}
          title={tCharts("noData")}
          description={tCharts("noDataDesc")}
          className="min-h-[220px]"
        />
      </div>
    );
  }

  const chartData = [
    { name: t("closedGo"), value: data!.closedGo, key: "closedGo" },
    { name: t("closedNoGo"), value: data!.closedNoGo, key: "closedNoGo" },
    { name: t("inProgress"), value: data!.inProgress, key: "inProgress" },
  ].filter((d) => d.value > 0);

  const winRatePct = data!.winRate > 0 ? `${(data!.winRate * 100).toFixed(1)}%` : "—";

  return (
    <figure role="img" aria-label={t("ariaLabel")} className={cn("w-full", className)}>
      <figcaption className="mb-1 text-sm font-medium text-foreground">{t("title")}</figcaption>
      <p className="mb-3 text-xs text-muted-foreground">
        Win Rate: <span className="font-semibold text-green-600">{winRatePct}</span>
      </p>

      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
            aria-label={t("ariaLabel")}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.key as keyof typeof COLORS]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
              color: "hsl(var(--popover-foreground))",
              fontSize: "12px",
            }}
            formatter={(value, name) => [String(value), String(name)]}
          />
          <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: "12px" }} />
        </PieChart>
      </ResponsiveContainer>

      {/* Screen reader data table */}
      <table className="sr-only">
        <caption>{t("title")}</caption>
        <thead>
          <tr>
            <th scope="col">ประเภท / Category</th>
            <th scope="col">จำนวน / Count</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.key}>
              <td>{row.name}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default WinNoGoChart;
