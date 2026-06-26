"use client";

/**
 * ExportReportButton — Export trigger button for the Analytics Dashboard.
 *
 * Handles the two export flows:
 *   1. Excel — calls exportToExcel() with PipelineReportData from tRPC
 *   2. Print/PDF — calls triggerPrintPDF() after fetching data
 *
 * Shows loading + error states inline.
 *
 * Design ref: design/components.md — AnalyticsDashboardPage (Component 6)
 */

import * as React from "react";
import { Download, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ExportReportButtonProps {
  onExportExcel: () => void;
  onExportPrint: () => void;
  isExporting?: boolean;
  className?: string;
}

export function ExportReportButton({
  onExportExcel,
  onExportPrint,
  isExporting = false,
  className,
}: ExportReportButtonProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={onExportExcel}
        disabled={isExporting}
        aria-label="Export รายงาน Excel"
        className="flex items-center gap-2"
      >
        {isExporting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-4" aria-hidden="true" />
        )}
        Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onExportPrint}
        disabled={isExporting}
        aria-label="Print / Export PDF"
        className="flex items-center gap-2"
      >
        <Printer className="size-4" aria-hidden="true" />
        Print / PDF
      </Button>
    </div>
  );
}

export default ExportReportButton;
