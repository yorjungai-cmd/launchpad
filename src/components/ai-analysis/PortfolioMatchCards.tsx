"use client";

/**
 * PortfolioMatchCards — cards per AppliCAD product portfolio match.
 *
 * Products: PTCAD, APP.AI, COBO, CRM
 * Relevance badges:
 *   High   → green
 *   Medium → yellow/amber
 *   Low    → gray
 *
 * Expandable reasoning text (max 2 lines collapsed).
 * Empty state when array is empty.
 *
 * Task 4.3
 */

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PortfolioRelevance = "High" | "Medium" | "Low";

export interface PortfolioMatch {
  product: string;
  relevance: PortfolioRelevance;
  reasoning: string;
}

export interface PortfolioMatchCardsProps {
  portfolioMatches: PortfolioMatch[];
  className?: string;
}

// ─── Relevance config ─────────────────────────────────────────────────────────

const RELEVANCE_CONFIG: Record<PortfolioRelevance, { label: string; badgeClass: string }> = {
  High: {
    label: "สูง",
    badgeClass:
      "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-200 dark:border-green-700",
  },
  Medium: {
    label: "ปานกลาง",
    badgeClass:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",
  },
  Low: {
    label: "ต่ำ",
    badgeClass:
      "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600",
  },
};

// ─── Single card ──────────────────────────────────────────────────────────────

function PortfolioMatchCard({ match }: { match: PortfolioMatch }) {
  const [expanded, setExpanded] = React.useState(false);
  const relevanceConfig = RELEVANCE_CONFIG[match.relevance];
  const reasoningId = React.useId();

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{match.product}</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            relevanceConfig.badgeClass
          )}
          aria-label={`ความเชื่อมโยง: ${relevanceConfig.label}`}
        >
          {relevanceConfig.label}
        </span>
      </div>

      {/* Reasoning — max 2 lines collapsed */}
      <p
        id={reasoningId}
        className={cn("text-sm text-muted-foreground", !expanded && "line-clamp-2")}
      >
        {match.reasoning}
      </p>

      {/* Expand/collapse toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={reasoningId}
        className="mt-2 flex items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {expanded ? (
          <ChevronUp className="size-3" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3" aria-hidden="true" />
        )}
        {expanded ? "ย่อ" : "อ่านเพิ่มเติม"}
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PortfolioMatchCards({ portfolioMatches, className }: PortfolioMatchCardsProps) {
  if (portfolioMatches.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-[80px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6",
          className
        )}
        aria-label="ไม่พบความเชื่อมโยงกับ portfolio"
      >
        <p className="text-sm text-muted-foreground">
          ไม่พบความเชื่อมโยงกับ portfolio ที่มีนัยสำคัญ
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}
      role="list"
      aria-label="ความเชื่อมโยงกับ portfolio"
    >
      {portfolioMatches.map((match) => (
        <div key={match.product} role="listitem">
          <PortfolioMatchCard match={match} />
        </div>
      ))}
    </div>
  );
}
