"use client";

/**
 * GuidedField — accessible field wrapper with Label + optional Tooltip + error message.
 *
 * - WCAG 2.1 AA: focus-visible ring on children, aria-describedby links error,
 *   aria-required on the labeled control.
 * - Renders a visually hidden asterisk for required fields (screen reader: "required").
 *
 * Task 4.2
 */

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface GuidedFieldProps {
  /** Input's `id` — used to wire `htmlFor` on label */
  htmlFor: string;
  /** Visible label text */
  label: string;
  /** Whether the field is required */
  required?: boolean;
  /** Tooltip hint shown on hover/focus of the help icon */
  tooltip?: string;
  /** Error message — shown below the field */
  error?: string;
  /** Additional class for the outer wrapper */
  className?: string;
  children: React.ReactNode;
}

export function GuidedField({
  htmlFor,
  label,
  required,
  tooltip,
  error,
  className,
  children,
}: GuidedFieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined;

  // Clone single child to inject accessibility props
  const child = React.Children.only(children) as React.ReactElement;
  const clonedChild = React.cloneElement(
    child as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
    {
      id: (child.props as { id?: string }).id ?? htmlFor,
      "aria-required": required ?? undefined,
      "aria-invalid": error ? true : undefined,
      "aria-describedby":
        errorId ?? (child.props as { "aria-describedby"?: string })["aria-describedby"],
    }
  );

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col gap-1.5", className)}>
        {/* Label row */}
        <div className="flex items-center gap-1.5">
          <Label htmlFor={htmlFor} className="flex items-center gap-0.5">
            {label}
            {required && (
              <span aria-hidden="true" className="ml-0.5 text-destructive" title="required">
                *
              </span>
            )}
          </Label>

          {tooltip && (
            <Tooltip>
              <TooltipTrigger
                type="button"
                className={cn(
                  "inline-flex size-4 items-center justify-center rounded-full text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
                aria-label={`Help: ${label}`}
              >
                <HelpCircle className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Field */}
        {clonedChild}

        {/* Error message */}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
