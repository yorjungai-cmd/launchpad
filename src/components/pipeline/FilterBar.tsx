"use client";

/**
 * FilterBar — filter controls for the Kanban board.
 *
 * Supports:
 *   - Stage filter (Select)
 *   - SubmitterType filter (Select)
 *   - Date range: fromDate / toDate (native date inputs)
 *
 * State is lifted via `onFiltersChange` callback.
 *
 * Task 5.2
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { Stage } from "@/shared/enums";
import { SubmitterType } from "@/modules/pipeline/schemas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KanbanFilters {
  stage?: Stage;
  submitterType?: SubmitterType;
  fromDate?: string;
  toDate?: string;
}

export interface FilterBarProps {
  filters: KanbanFilters;
  onFiltersChange: (filters: KanbanFilters) => void;
  className?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FilterBar({ filters, onFiltersChange, className }: FilterBarProps) {
  const t = useTranslations("pipeline");

  function handleStageChange(value: string) {
    onFiltersChange({
      ...filters,
      stage: value === "all" ? undefined : (value as Stage),
    });
  }

  function handleSubmitterTypeChange(value: string) {
    onFiltersChange({
      ...filters,
      submitterType: value === "all" ? undefined : (value as SubmitterType),
    });
  }

  function handleFromDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value ? new Date(e.target.value).toISOString() : undefined;
    onFiltersChange({ ...filters, fromDate: iso });
  }

  function handleToDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value ? new Date(e.target.value).toISOString() : undefined;
    onFiltersChange({ ...filters, toDate: iso });
  }

  // Convert ISO string back to yyyy-MM-dd for date input
  function toInputDate(iso?: string): string {
    if (!iso) return "";
    return iso.slice(0, 10);
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4",
        className
      )}
      role="search"
      aria-label={t("kanban.pageTitle")}
    >
      {/* Stage filter */}
      <div className="flex min-w-[160px] flex-col gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("kanban.filterStage")}
        </Label>
        <Select value={filters.stage ?? "all"} onValueChange={handleStageChange}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={t("kanban.allStages")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("kanban.allStages")}</SelectItem>
            <SelectItem value={Stage.SANDBOX}>{t("stages.sandbox")}</SelectItem>
            <SelectItem value={Stage.VALIDATION_SPRINT}>{t("stages.validation_sprint")}</SelectItem>
            <SelectItem value={Stage.BUILD_SPRINT}>{t("stages.build_sprint")}</SelectItem>
            <SelectItem value={Stage.LAUNCH_AND_TEST}>{t("stages.launch_and_test")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Submitter type filter */}
      <div className="flex min-w-[160px] flex-col gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("kanban.filterSubmitterType")}
        </Label>
        <Select value={filters.submitterType ?? "all"} onValueChange={handleSubmitterTypeChange}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={t("kanban.allTypes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("kanban.allTypes")}</SelectItem>
            <SelectItem value={SubmitterType.EMPLOYEE}>{t("submitterType.employee")}</SelectItem>
            <SelectItem value={SubmitterType.EXECUTIVE}>{t("submitterType.executive")}</SelectItem>
            <SelectItem value={SubmitterType.PARTNER}>{t("submitterType.partner")}</SelectItem>
            <SelectItem value={SubmitterType.VENDOR}>{t("submitterType.vendor")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* From date */}
      <div className="flex min-w-[140px] flex-col gap-1.5">
        <Label htmlFor="filter-from" className="text-xs font-medium text-muted-foreground">
          {t("kanban.filterFrom")}
        </Label>
        <Input
          id="filter-from"
          type="date"
          className="h-9"
          value={toInputDate(filters.fromDate)}
          onChange={handleFromDateChange}
          max={toInputDate(filters.toDate) || undefined}
        />
      </div>

      {/* To date */}
      <div className="flex min-w-[140px] flex-col gap-1.5">
        <Label htmlFor="filter-to" className="text-xs font-medium text-muted-foreground">
          {t("kanban.filterTo")}
        </Label>
        <Input
          id="filter-to"
          type="date"
          className="h-9"
          value={toInputDate(filters.toDate)}
          onChange={handleToDateChange}
          min={toInputDate(filters.fromDate) || undefined}
        />
      </div>
    </div>
  );
}
