import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Skeleton loading placeholder.
 *
 * Conveys loading state to assistive technologies via `aria-busy` and a
 * visually hidden label. The animated shimmer is hidden from screen readers
 * (`aria-hidden="true"` on the animation layer).
 *
 * Usage:
 * ```tsx
 * <Skeleton className="h-4 w-full" />
 * <Skeleton className="h-10 w-10 rounded-full" />
 * ```
 */
function Skeleton({
  className,
  "aria-label": ariaLabel = "Loading...",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { "aria-label"?: string }) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
