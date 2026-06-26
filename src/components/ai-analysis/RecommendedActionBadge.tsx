"use client";

/**
 * RecommendedActionBadge — Go / Conditional Go / No Go decision badge.
 *
 * Colors (WCAG 2.1 AA compliant):
 *   Go            → green
 *   Conditional Go → amber/yellow
 *   No Go          → red
 *
 * Props:
 *   action    — recommended action string
 *   reasoning — optional explanation (expandable)
 *
 * Task 4.2
 */

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecommendedAction = "Go" | "Conditional Go" | "No Go";

export interface RecommendedActionBadgeProps {
  action: string;
  reasoning?: string | null;
  className?: string;
}

// ─── Action colour config ─────────────────────────────────────────────────────

interface ActionConfig {
  label: string;
  badgeClass: string;
  icon: string;
}

const ACTION_CONFIG: Record<string, ActionConfig> = {
  Go: {
    label: "Go ✓",
    badgeClass:
      "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700",
    icon: "✓",
  },
  "Conditional Go": {
    label: "Conditional Go",
    badgeClass:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",
    icon: "⚠",
  },
  "No Go": {
    label: "No Go ✗",
    badgeClass:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",
    icon: "✗",
  },
};

const DEFAULT_CONFIG: ActionConfig = {
  label: "ยังไม่ระบุ",
  badgeClass: "bg-gray-100 text-gray-700 border-gray-300",
  icon: "?",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RecommendedActionBadge({
  action,
  reasoning,
  className,
}: RecommendedActionBadgeProps) {
  const [expanded, setExpanded] = React.useState(false);
  const config = ACTION_CONFIG[action] ?? DEFAULT_CONFIG;
  const reasoningId = React.useId();
  const hasReasoning = Boolean(reasoning);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Action badge */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">คำแนะนำ:</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-bold",
            config.badgeClass
          )}
          role="status"
          aria-label={`คำแนะนำ: ${config.label}`}
        >
          {config.label}
        </span>
      </div>

      {/* Expandable reasoning */}
      {hasReasoning && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={reasoningId}
            className="flex items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {expanded ? (
              <ChevronUp className="size-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3" aria-hidden="true" />
            )}
            {expanded ? "ซ่อนเหตุผล" : "ดูเหตุผล"}
          </button>

          {expanded && (
            <div
              id={reasoningId}
              className="mt-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground"
            >
              <p className="whitespace-pre-wrap">{reasoning}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
