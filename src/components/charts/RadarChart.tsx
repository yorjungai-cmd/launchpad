"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
} from "recharts";

import { cn } from "@/lib/utils";

export interface RadarChartDataPoint {
  /** Metric label (e.g. "Strategic Fit", "ความเหมาะสมเชิงกลยุทธ์") */
  metric: string;
  /** Score value */
  score: number;
  /** Maximum possible score (defaults to 5) */
  max?: number;
}

export interface RadarChartProps {
  /** Data points for the radar */
  data: RadarChartDataPoint[];
  /** Optional chart title shown above the chart */
  title?: string;
  /** Accessible description (defaults to title) */
  ariaLabel?: string;
  className?: string;
  /** Fill colour for the radar area (defaults to primary brand blue) */
  fillColor?: string;
  /** Stroke colour for the radar area (defaults to primary brand blue) */
  strokeColor?: string;
}

/**
 * Feasibility Radar Chart.
 *
 * Renders a 5-dimension radar chart using Recharts, styled with Tailwind.
 * Designed for the LaunchPad Portal feasibility evaluation scores.
 *
 * Usage:
 * ```tsx
 * <RadarChart
 *   title="Feasibility Evaluation"
 *   data={[
 *     { metric: "Strategic Fit", score: 4 },
 *     { metric: "Market Potential", score: 3.5 },
 *     { metric: "Technical Feasibility", score: 4 },
 *     { metric: "Resource Requirement", score: 2 },
 *     { metric: "Business Impact", score: 4.5 },
 *   ]}
 * />
 * ```
 */
export function RadarChart({
  data,
  title,
  ariaLabel,
  className,
  fillColor = "#0066CC",
  strokeColor = "#0066CC",
}: RadarChartProps) {
  const label = ariaLabel ?? title ?? "Radar chart";

  // Normalise data: convert score to percentage of max for consistent display
  const chartData = data.map((d) => ({
    metric: d.metric,
    score: d.score,
    fullMark: d.max ?? 5,
  }));

  return (
    <figure role="img" aria-label={label} className={cn("w-full", className)}>
      {title && (
        <figcaption className="mb-4 text-center text-sm font-medium text-foreground">
          {title}
        </figcaption>
      )}
      <ResponsiveContainer width="100%" height={320}>
        <RechartsRadarChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 5]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickCount={6}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke={strokeColor}
            fill={fillColor}
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
              color: "hsl(var(--popover-foreground))",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </figure>
  );
}

export default RadarChart;
