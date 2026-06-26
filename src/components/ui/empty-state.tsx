import * as React from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Icon or illustration element */
  icon?: React.ReactNode;
  /** Primary heading */
  title: string;
  /** Supporting description */
  description?: string;
  /** Optional call-to-action (e.g. a Button) */
  action?: React.ReactNode;
  className?: string;
}

/**
 * EmptyState component for zero-data screens.
 *
 * Rendered with `role="status"` so screen readers announce the message.
 *
 * Usage:
 * ```tsx
 * <EmptyState
 *   icon={<Inbox className="h-10 w-10 text-muted-foreground" />}
 *   title="ยังไม่มีรายการ"
 *   description="ยังไม่มีไอเดียที่ส่งมา เริ่มต้นด้วยการส่งไอเดียแรกของคุณ"
 *   action={<Button>ส่งไอเดีย</Button>}
 * />
 * ```
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-label={title}
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg py-16 text-center",
        className
      )}
    >
      {icon && (
        <div
          className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export default EmptyState;
