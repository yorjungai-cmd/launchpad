"use client";

/**
 * KpiCard — Summary metric card for dashboard pages.
 *
 * Displays a headline number with an optional subtitle.
 * Shows a Skeleton placeholder while data is loading.
 *
 * Ref: design/components.md — Chart Components (Component 7, KpiCard)
 * Task 5.2
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KpiCardProps {
  /**
   * Primary heading label shown above the value.
   * Alias: some consumers pass `label` (both are accepted).
   */
  label?: string;
  /** Alternative to `label` — used by dashboard pages */
  title?: string;
  /** Primary metric value (e.g. "142" or "73%") */
  value: string | number;
  /** Optional supporting line below the value */
  subtitle?: string;
  /** Optional icon displayed alongside the label */
  icon?: React.ReactNode;
  /** When true, renders a shimmer skeleton instead of content */
  isLoading: boolean;
  /** Optional click handler — wraps the card in a button role */
  onClick?: () => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KpiCard({
  label,
  title,
  value,
  subtitle,
  icon,
  isLoading,
  onClick,
  className,
}: KpiCardProps) {
  // Accept either `label` or `title` — `title` takes precedence for backward-compat
  const displayLabel = title ?? label ?? "";
  const isInteractive = typeof onClick === "function";

  const content = (
    <Card
      className={cn(
        "relative transition-shadow",
        isInteractive &&
          "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      // When interactive, expose as a button so keyboard users can activate it
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? `${displayLabel}: ${value}` : undefined}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-6">
        {isLoading ? (
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-4 w-24" aria-label={`${displayLabel} loading`} />
            <Skeleton className="h-8 w-16" />
            {subtitle !== undefined && <Skeleton className="h-3 w-32" />}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{displayLabel}</p>
              {icon && (
                <span className="text-muted-foreground" aria-hidden="true">
                  {icon}
                </span>
              )}
            </div>
            <p
              className="mt-1 text-3xl font-bold tracking-tight text-foreground"
              aria-live="polite"
            >
              {value}
            </p>
            {subtitle && <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );

  return content;
}

export default KpiCard;
