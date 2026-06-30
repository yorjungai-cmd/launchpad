"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPES_IN_WORKFLOW_ORDER } from "@/lib/document-generation/prompt-config-defaults";

export type NavSelection = "global" | string; // "global" or a documentType key

interface DocTypeNavProps {
  selected: NavSelection;
  dirtyTypes: Set<string>;
  onSelect: (selection: NavSelection) => void;
}

export function DocTypeNav({ selected, dirtyTypes, onSelect }: DocTypeNavProps) {
  return (
    <nav aria-label="Document type sections" className="shrink-0 lg:w-52">
      <ul className="space-y-1" role="listbox">
        {/* Global system prompt */}
        <li role="option" aria-selected={selected === "global"}>
          <button
            type="button"
            onClick={() => onSelect("global")}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected === "global"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Globe className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">System Prompt</span>
            {dirtyTypes.has("global") && (
              <span className="size-1.5 rounded-full bg-current" aria-label="มีการเปลี่ยนแปลง" />
            )}
          </button>
        </li>

        {/* Divider */}
        <li aria-hidden="true" className="my-1 border-t border-border" />

        {/* Document types in workflow order */}
        {DOCUMENT_TYPES_IN_WORKFLOW_ORDER.map(({ type, label }) => {
          const isActive = selected === type;
          const isDirty = dirtyTypes.has(type);
          return (
            <li key={type} role="option" aria-selected={isActive}>
              <button
                type="button"
                onClick={() => onSelect(type)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <span className="flex-1 text-left leading-tight">{label}</span>
                {isDirty && (
                  <span
                    className="size-1.5 rounded-full bg-current"
                    aria-label="มีการเปลี่ยนแปลง"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
