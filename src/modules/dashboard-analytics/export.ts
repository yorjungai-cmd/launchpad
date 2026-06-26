/**
 * ExportService — client-side export utilities for the dashboard-analytics module.
 *
 * Provides two export mechanisms:
 *   1. `exportToExcel(data, filename)` — generates a multi-sheet .xlsx workbook
 *      using SheetJS (xlsx) and triggers a browser download.
 *   2. `triggerPrintPDF()` — triggers the browser print dialog so the user can
 *      save as PDF. Relies on `@media print` CSS defined in analytics/page.tsx.
 *
 * Both functions are client-side only (browser environment).
 *
 * Design ref:
 *   - design/components.md — ExportService (Component 8)
 *   - design/integration.md — xlsx Library + Browser Print API
 *
 * Task 6.3
 */

import * as XLSX from "xlsx";
import type { PipelineReportData } from "./schemas";

// ─── Excel Export ─────────────────────────────────────────────────────────────

/**
 * Exports the full pipeline report to an Excel workbook with 4 sheets:
 *   1. Summary       — high-level KPIs and win/no-go stats
 *   2. Ideas Detail  — flat list of all idea rows (capped at 10,000)
 *   3. By Stage      — idea count and avg time per stage
 *   4. Source        — idea count and percentage by submitter type
 *
 * Triggers a browser download of `{filename}.xlsx`.
 *
 * @param data     - PipelineReportData from dashboard.exportPipelineReport
 * @param filename - Base filename without extension (e.g. "pipeline-report-2026-06")
 */
export function exportToExcel(data: PipelineReportData, filename: string): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ─────────────────────────────────────────────────────
  const summaryRows: Record<string, string | number>[] = [
    { metric: "Generated At", value: data.generatedAt },
    { metric: "Date Range From", value: data.dateRange.from },
    { metric: "Date Range To", value: data.dateRange.to },
    { metric: "", value: "" },
    { metric: "Total Ideas", value: data.summary.totalIdeas },
    {
      metric: "Win Rate",
      value: `${(data.summary.winNoGoStats.winRate * 100).toFixed(1)}%`,
    },
    {
      metric: "Total Closed",
      value: data.summary.winNoGoStats.totalClosed,
    },
    { metric: "Closed (Go)", value: data.summary.winNoGoStats.closedGo },
    {
      metric: "Closed (No Go)",
      value: data.summary.winNoGoStats.closedNoGo,
    },
    { metric: "In Progress", value: data.summary.winNoGoStats.inProgress },
    { metric: "", value: "" },
    {
      metric: "Pending BD Review",
      value: data.bdWorkload.pendingReviewCount,
    },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // ── Sheet 2: Ideas Detail ─────────────────────────────────────────────────
  const ideasRows = data.ideas.map((idea) => ({
    "Reference Number": idea.referenceNumber,
    Title: idea.title,
    "Submitter Type": idea.submitterType,
    "Submitted At": idea.submittedAt,
    "Current Stage": idea.currentStage,
    "Idea Type": idea.ideaType,
    "Assigned Reviewer": idea.assignedReviewer ?? "—",
    "Last Updated At": idea.lastUpdatedAt,
  }));
  const ideasSheet = XLSX.utils.json_to_sheet(ideasRows);
  XLSX.utils.book_append_sheet(wb, ideasSheet, "Ideas Detail");

  // ── Sheet 3: By Stage ─────────────────────────────────────────────────────
  const byStageRows = data.summary.ideaCountByStage.map((row) => {
    const timeRow = data.summary.avgTimePerStage.find((t) => t.stage === row.stage);
    return {
      Stage: row.stage,
      Count: row.count,
      "Avg Days": timeRow?.avgDays ?? "—",
    };
  });
  const byStageSheet = XLSX.utils.json_to_sheet(byStageRows);
  XLSX.utils.book_append_sheet(wb, byStageSheet, "By Stage");

  // ── Sheet 4: Source ────────────────────────────────────────────────────────
  const sourceRows = data.sourceAnalysis.bySubmitterType.map((row) => ({
    "Submitter Type": row.submitterType,
    Count: row.count,
    "Percentage (%)": row.percentage.toFixed(1),
  }));
  const sourceSheet = XLSX.utils.json_to_sheet(sourceRows);
  XLSX.utils.book_append_sheet(wb, sourceSheet, "Source");

  // ── Write and trigger download ─────────────────────────────────────────────
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ─── Print / PDF Export ───────────────────────────────────────────────────────

/**
 * Triggers the browser's native print dialog.
 *
 * The analytics page uses `@media print` CSS to hide navigation, sidebars,
 * and export buttons so only the report content is printed. The user can
 * then select "Save as PDF" in the print dialog.
 *
 * Only callable in a browser environment.
 */
export function triggerPrintPDF(): void {
  if (typeof window !== "undefined") {
    window.print();
  }
}
