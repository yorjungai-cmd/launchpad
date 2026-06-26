"use client";

/**
 * SourceBreakdownChart — PieChart showing idea source breakdown by submitter type.
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
import { SubmitterType, type SourceBreakdownRow } from "@/modules/dashboard-analytics/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SourceBreakdownChartProps {
  data: SourceBreakdownRow[];
  isLoading: boolean;
  className?: string;
}

const SUBMITTER_COLORS: Record<SubmitterType, string> = {
  [SubmitterType.EMPLOYEE]: "#60a5fa",
  [SubmitterType.EXECUTIVE]: "#f59e0b",
  [SubmitterType.PARTNER]: "#34d399",
  [SubmitterType.VENDOR]: "#a78bfa",
};

// ─── Custom label renderer ────────────────────────────────────────────────────

interface LabelProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}

function renderCustomLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
}: LabelProps) {
  if (percent < 0.05) return null; // hide labels for tiny slices
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
      aria-hidden="true"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SourceBreakdownChart({ data, isLoading, className }: SourceBreakdownChartProps) {
  const t = useTranslations("dashboard.charts.sourceBreakdown");
  const tCharts = useTranslations("dashboard.charts");

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)} role="status" aria-label={t("ariaLabel")}>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-[280px] w-full rounded-full" />
      </div>
    );
  }

  const hasData = data.length > 0 && data.some((d) => d.count > 0);

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

  const chartData = data
    .filter((row) => row.count > 0)
    .map((row) => ({
      name: t(row.submitterType as Parameters<typeof t>[0]),
      value: row.count,
      percentage: row.percentage,
      submitterType: row.submitterType,
    }));

  return (
    <figure role="img" aria-label={t("ariaLabel")} className={cn("w-full", className)}>
      <figcaption className="mb-4 text-sm font-medium text-foreground">{t("title")}</figcaption>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            outerRadius={110}
            dataKey="value"
            labelLine={false}
            label={renderCustomLabel}
            aria-label={t("ariaLabel")}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={SUBMITTER_COLORS[entry.submitterType as SubmitterType]}
              />
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
            formatter={(value: unknown, name: unknown) => {
              const count = typeof value === "number" ? value : Number(value);
              const nameStr = String(name);
              const row = data.find(
                (d) => t(d.submitterType as Parameters<typeof t>[0]) === nameStr
              );
              return [`${count} (${row?.percentage.toFixed(1) ?? 0}%)`, nameStr];
            }}
          />
          <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: "12px" }} />
        </PieChart>
      </ResponsiveContainer>

      {/* Screen reader data table */}
      <table className="sr-only">
        <caption>{t("title")}</caption>
        <thead>
          <tr>
            <th scope="col">ประเภท / Type</th>
            <th scope="col">จำนวน / Count</th>
            <th scope="col">เปอร์เซ็นต์ / %</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.submitterType}>
              <td>{row.name}</td>
              <td>{row.value}</td>
              <td>{row.percentage.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default SourceBreakdownChart;
