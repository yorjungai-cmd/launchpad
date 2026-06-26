"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

import { cn } from "@/lib/utils";

export interface BarChartDataPoint {
  /** Category label */
  label: string;
  /** Numeric value */
  value: number;
}

export interface BarChartProps {
  /** Data points for the bar chart */
  data: BarChartDataPoint[];
  /** Optional chart title shown above the chart */
  title?: string;
  /** Accessible description (defaults to title) */
  ariaLabel?: string;
  className?: string;
  /** Primary bar colour (defaults to AppliCAD blue) */
  barColor?: string;
  /** Y-axis domain max. Defaults to "auto" */
  yMax?: number;
}

/**
 * Bar Chart primitive for the LaunchPad Portal.
 *
 * Wraps Recharts BarChart with Tailwind styling and accessibility attributes.
 * Used by the document-generation unit for score visualisations.
 *
 * Usage:
 * ```tsx
 * <BarChart
 *   title="Stage Distribution"
 *   data={[
 *     { label: "Sandbox", value: 12 },
 *     { label: "Validation", value: 8 },
 *     { label: "Build", value: 5 },
 *     { label: "Launch", value: 3 },
 *   ]}
 * />
 * ```
 */
export function BarChart({
  data,
  title,
  ariaLabel,
  className,
  barColor = "#0066CC",
  yMax,
}: BarChartProps) {
  const label = ariaLabel ?? title ?? "Bar chart";

  const chartData = data.map((d) => ({
    name: d.label,
    value: d.value,
  }));

  return (
    <figure role="img" aria-label={label} className={cn("w-full", className)}>
      {title && (
        <figcaption className="mb-4 text-center text-sm font-medium text-foreground">
          {title}
        </figcaption>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <RechartsBarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, yMax ?? "auto"]}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
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
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={barColor} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </figure>
  );
}

export default BarChart;
