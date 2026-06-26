"use client";

/**
 * FeasibilityChart — Recharts-based feasibility visualization.
 *
 * Desktop: RadarChart (5 dimensions in a pentagon)
 * Mobile (< 640px): BarChart fallback — both rendered, toggled via CSS
 *
 * Dimensions (1–5 scale):
 *   strategicFit, marketPotential, technicalFeasibility,
 *   resourceRequirement, businessImpact
 *
 * If feasibility is null: shows "ยังไม่มีข้อมูล" empty state.
 *
 * Task 4.3
 */

import * as React from "react";
import {
  ResponsiveContainer,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip as RechartsTooltip,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeasibilityData {
  strategicFit: number;
  marketPotential: number;
  technicalFeasibility: number;
  resourceRequirement: number;
  businessImpact: number;
}

export interface FeasibilityChartProps {
  feasibility: FeasibilityData | null;
  className?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIMENSION_LABELS: Array<{ key: keyof FeasibilityData; label: string; shortLabel: string }> = [
  { key: "strategicFit", label: "ความสอดคล้องเชิงกลยุทธ์", shortLabel: "Strategic" },
  { key: "marketPotential", label: "ศักยภาพตลาด", shortLabel: "Market" },
  { key: "technicalFeasibility", label: "ความเป็นไปได้ทางเทคนิค", shortLabel: "Technical" },
  { key: "resourceRequirement", label: "ความต้องการทรัพยากร", shortLabel: "Resource" },
  { key: "businessImpact", label: "ผลกระทบต่อธุรกิจ", shortLabel: "Business" },
];

const BRAND_BLUE = "#0066CC";

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{label}</p>
      <p>คะแนน: {payload[0]?.value ?? 0} / 5</p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FeasibilityChart({ feasibility, className }: FeasibilityChartProps) {
  if (!feasibility) {
    return (
      <div
        className={cn(
          "flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8",
          className
        )}
        aria-label="ยังไม่มีข้อมูล feasibility"
      >
        <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>
      </div>
    );
  }

  // Build chart data arrays
  const radarData = DIMENSION_LABELS.map(({ key, label }) => ({
    metric: label,
    score: feasibility[key],
    fullMark: 5,
  }));

  const barData = DIMENSION_LABELS.map(({ key, shortLabel, label }) => ({
    name: shortLabel,
    fullName: label,
    value: feasibility[key],
  }));

  return (
    <div className={cn("w-full", className)}>
      {/* Score summary row */}
      <div className="mb-4 grid grid-cols-5 gap-1 text-center">
        {DIMENSION_LABELS.map(({ key, shortLabel }) => (
          <div key={key} className="flex flex-col items-center gap-0.5">
            <span
              className="text-lg font-bold text-foreground"
              aria-label={`${shortLabel}: ${feasibility[key]} คะแนน`}
            >
              {feasibility[key]}
            </span>
            <span className="text-[10px] leading-tight text-muted-foreground">{shortLabel}</span>
          </div>
        ))}
      </div>

      {/* Desktop: Radar chart — hidden on mobile */}
      <figure
        role="img"
        aria-label="แผนภูมิ radar แสดง feasibility 5 มิติ (คะแนน 1–5)"
        className="hidden sm:block"
      >
        <ResponsiveContainer width="100%" height={300}>
          <RechartsRadarChart
            data={radarData}
            margin={{ top: 10, right: 40, bottom: 10, left: 40 }}
          >
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 5]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickCount={6}
            />
            <Radar
              name="คะแนน"
              dataKey="score"
              stroke={BRAND_BLUE}
              fill={BRAND_BLUE}
              fillOpacity={0.25}
              strokeWidth={2}
            />
            <RechartsTooltip content={<CustomTooltip />} />
          </RechartsRadarChart>
        </ResponsiveContainer>
      </figure>

      {/* Mobile: Bar chart fallback — visible only on mobile */}
      <figure
        role="img"
        aria-label="แผนภูมิแท่งแสดง feasibility 5 มิติ (คะแนน 1–5)"
        className="block sm:hidden"
      >
        <ResponsiveContainer width="100%" height={220}>
          <RechartsBarChart data={barData} margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {barData.map((_, i) => (
                <Cell key={`cell-${i}`} fill={BRAND_BLUE} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </figure>
    </div>
  );
}
