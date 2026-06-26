"use client";

/**
 * DateRangePicker — shared date range selector for all dashboard pages.
 *
 * Provides preset options (7d, 30d, 3m, YTD) plus a custom date input pair.
 * State is managed in the parent page component (not global store).
 *
 * Design ref: design/components.md — DateRangePicker (Component 9)
 */

import * as React from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: string; // ISO 8601 datetime string
  to: string;
}

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

type Preset = "7d" | "30d" | "3m" | "ytd" | "custom";

function getPresetRange(preset: Preset): DateRange | null {
  const now = new Date();
  const to = now.toISOString();

  switch (preset) {
    case "7d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return { from: from.toISOString(), to };
    }
    case "30d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { from: from.toISOString(), to };
    }
    case "3m": {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      return { from: from.toISOString(), to };
    }
    case "ytd": {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: from.toISOString(), to };
    }
    case "custom":
      return null;
  }
}

function formatDateDisplay(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toDateInputValue(isoString: string): string {
  // Returns YYYY-MM-DD for <input type="date">
  return isoString.slice(0, 10);
}

const PRESETS: { label: string; value: Preset }[] = [
  { label: "7 วัน", value: "7d" },
  { label: "30 วัน", value: "30d" },
  { label: "3 เดือน", value: "3m" },
  { label: "ต้นปี", value: "ytd" },
  { label: "กำหนดเอง", value: "custom" },
];

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activePreset, setActivePreset] = React.useState<Preset>("30d");
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handlePresetClick(preset: Preset) {
    setActivePreset(preset);
    if (preset !== "custom") {
      const range = getPresetRange(preset);
      if (range) {
        onChange(range);
        setIsOpen(false);
      }
    }
  }

  function handleCustomFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    const from = new Date(e.target.value);
    from.setHours(0, 0, 0, 0);
    onChange({ ...value, from: from.toISOString() });
  }

  function handleCustomToChange(e: React.ChangeEvent<HTMLInputElement>) {
    const to = new Date(e.target.value);
    to.setHours(23, 59, 59, 999);
    onChange({ ...value, to: to.toISOString() });
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="flex items-center gap-2 text-sm"
      >
        <Calendar className="size-4" aria-hidden="true" />
        <span>
          {formatDateDisplay(value.from)} — {formatDateDisplay(value.to)}
        </span>
        <ChevronDown
          className={cn("size-4 transition-transform", isOpen && "rotate-180")}
          aria-hidden="true"
        />
      </Button>

      {isOpen && (
        <div
          className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-popover p-4 shadow-md"
          role="dialog"
          aria-label="เลือกช่วงวันที่"
        >
          {/* Preset buttons */}
          <div className="mb-4 flex flex-wrap gap-2" role="listbox">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                role="option"
                aria-selected={activePreset === preset.value}
                onClick={() => handlePresetClick(preset.value)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  activePreset === preset.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom range inputs */}
          {activePreset === "custom" && (
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="date-from" className="mb-1 block text-xs text-muted-foreground">
                  ตั้งแต่
                </label>
                <input
                  id="date-from"
                  type="date"
                  value={toDateInputValue(value.from)}
                  max={toDateInputValue(value.to)}
                  onChange={handleCustomFromChange}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="date-to" className="mb-1 block text-xs text-muted-foreground">
                  ถึง
                </label>
                <input
                  id="date-to"
                  type="date"
                  value={toDateInputValue(value.to)}
                  min={toDateInputValue(value.from)}
                  onChange={handleCustomToChange}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <Button size="sm" onClick={() => setIsOpen(false)} className="w-full">
                ยืนยัน
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
