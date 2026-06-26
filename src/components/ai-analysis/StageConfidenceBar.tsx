"use client";

/**
 * StageConfidenceBar — stage badge + confidence progress bar.
 *
 * Color coding (WCAG 2.1 AA contrast compliant):
 *   Sandbox            → gray
 *   Validation Sprint  → blue
 *   Build Sprint       → green
 *   Launch & Test      → purple
 *
 * Props:
 *   stage      — Launch PAD 2.0 stage string
 *   confidence — 0.0–1.0 float (from AI analysis)
 *
 * Task 4.2
 */

import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Stage = "Sandbox" | "Validation Sprint" | "Build Sprint" | "Launch & Test";

export interface StageConfidenceBarProps {
  stage: string;
  /** Confidence value: 0.0–1.0 */
  confidence: number;
  className?: string;
}

// ─── Stage colour config ──────────────────────────────────────────────────────

interface StageConfig {
  label: string;
  badgeClass: string;
  barClass: string;
}

const STAGE_CONFIG: Record<string, StageConfig> = {
  Sandbox: {
    label: "Sandbox",
    badgeClass:
      "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600",
    barClass: "bg-gray-500",
  },
  "Validation Sprint": {
    label: "Validation Sprint",
    badgeClass:
      "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",
    barClass: "bg-blue-500",
  },
  "Build Sprint": {
    label: "Build Sprint",
    badgeClass:
      "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700",
    barClass: "bg-green-500",
  },
  "Launch & Test": {
    label: "Launch & Test",
    badgeClass:
      "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700",
    barClass: "bg-purple-500",
  },
};

const DEFAULT_CONFIG: StageConfig = {
  label: "Unknown",
  badgeClass: "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-200",
  barClass: "bg-gray-400",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StageConfidenceBar({ stage, confidence, className }: StageConfidenceBarProps) {
  const config = STAGE_CONFIG[stage] ?? DEFAULT_CONFIG;

  // Clamp to 0–1, convert to percentage
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);

  const progressId = React.useId();

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Stage badge */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold",
            config.badgeClass
          )}
        >
          {config.label}
        </span>
        <span className="text-sm font-medium text-foreground">{pct}%</span>
        <span className="text-xs text-muted-foreground">ความมั่นใจ</span>
      </div>

      {/* Confidence progress bar */}
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`ความมั่นใจของ stage ${config.label}: ${pct}%`}
          aria-describedby={progressId}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full transition-all", config.barClass)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span id={progressId} className="sr-only">
          {config.label} confidence: {pct}%
        </span>
      </div>
    </div>
  );
}
