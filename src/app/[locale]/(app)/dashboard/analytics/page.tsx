"use client";

/**
 * Analytics & Export page — US-27, US-28
 *
 * Displays idea source analysis and provides pipeline report export for Admin.
 *
 * Route guard: enforced in middleware — only admin role has access.
 * tRPC procedures enforce FORBIDDEN for other roles.
 *
 * Features:
 *   - SourceBreakdownChart (pie chart by submitter type)
 *   - ExportReportButton — Excel (xlsx) + Print/PDF
 *   - DateRangePicker (default: last 30 days)
 *   - Export flow: click → fetch exportPipelineReport → ExportService
 *   - Print CSS via <style> tag (hides nav/sidebar when printing)
 *   - Loading, empty, error states
 *
 * Design ref:
 *   - design/components.md — AnalyticsDashboardPage (Component 6)
 *   - design/integration.md — xlsx + print
 *
 * Task 6.3
 */

import * as React from "react";
import { useState, useCallback } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePicker, SourceBreakdownChart, ExportReportButton } from "@/components/dashboard";
import type { DateRange } from "@/components/dashboard";
import { exportToExcel, triggerPrintPDF } from "@/modules/dashboard-analytics/export";
import type { PipelineReportData } from "@/modules/dashboard-analytics/schemas";

// ─── Print CSS (injected once on mount) ──────────────────────────────────────

const PRINT_STYLE_ID = "dashboard-analytics-print-styles";

const printCss = `
@media print {
  /* Hide navigation and interactive chrome */
  nav,
  aside,
  header,
  .no-print,
  [data-no-print] {
    display: none !important;
  }

  /* Let content fill the page */
  body {
    font-size: 12pt;
    color: #000;
    background: #fff;
  }

  #main-content {
    margin: 0;
    padding: 0;
    max-width: 100%;
  }

  /* Page break helpers */
  .print-break-before {
    page-break-before: always;
  }

  .print-break-avoid {
    page-break-inside: avoid;
  }

  h1, h2, h3 {
    page-break-after: avoid;
  }

  /* Tables */
  table {
    border-collapse: collapse;
    width: 100%;
  }

  td, th {
    border: 1px solid #ccc;
    padding: 6px 8px;
    font-size: 10pt;
  }

  th {
    background-color: #f3f4f6;
  }

  /* Recharts / SVG — ensure they print */
  svg {
    overflow: visible;
  }
}
`;

function usePrintStyles() {
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(PRINT_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = PRINT_STYLE_ID;
    style.textContent = printCss;
    document.head.appendChild(style);

    return () => {
      const el = document.getElementById(PRINT_STYLE_ID);
      if (el) document.head.removeChild(el);
    };
  }, []);
}

// ─── Default date range (last 30 days) ───────────────────────────────────────

function getDefaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function formatFilename(dateRange: DateRange): string {
  const from = new Date(dateRange.from).toISOString().slice(0, 10);
  const to = new Date(dateRange.to).toISOString().slice(0, 10);
  return `pipeline-report-${from}-to-${to}`;
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  usePrintStyles();

  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [isExporting, setIsExporting] = useState(false);

  // Source analysis query
  const {
    data: sourceData,
    isLoading: sourceLoading,
    isError: sourceError,
    error: sourceErr,
    refetch: refetchSource,
    isFetching: sourceFetching,
  } = api.dashboard.getSourceAnalysis.useQuery(
    { from: dateRange.from, to: dateRange.to },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchInterval: 60 * 1000, // 60 seconds
      retry: 1,
    }
  );

  // Export procedure (lazy — triggered on demand via refetch)
  const exportQuery = api.dashboard.exportPipelineReport.useQuery(
    { from: dateRange.from, to: dateRange.to, format: "excel" as const },
    {
      enabled: false, // only fetch when export button is clicked
      retry: 0,
    }
  );

  const handleDateChange = useCallback((range: DateRange) => {
    setDateRange(range);
  }, []);

  // Fetch export data, then generate file
  async function fetchExportData(): Promise<PipelineReportData | null> {
    try {
      const result = await exportQuery.refetch();
      if (result.data) return result.data;
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "ไม่สามารถดึงข้อมูล Export ได้";
      toast.error(message);
      return null;
    }
  }

  const handleExportExcel = useCallback(async () => {
    setIsExporting(true);
    try {
      const reportData = await fetchExportData();
      if (!reportData) return;
      exportToExcel(reportData, formatFilename(dateRange));
      toast.success("ดาวน์โหลด Excel เรียบร้อยแล้ว");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export ล้มเหลว โปรดลองใหม่";
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const handleExportPrint = useCallback(async () => {
    setIsExporting(true);
    try {
      // Fetch data first so the page has content to print (optional pre-warm)
      await fetchExportData();
      triggerPrintPDF();
    } finally {
      setIsExporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  // ── Error state ──────────────────────────────────────────────────────────
  if (sourceError) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics & Export</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              วิเคราะห์แหล่งที่มาและ Export รายงาน
            </p>
          </div>
          <DateRangePicker value={dateRange} onChange={handleDateChange} />
        </div>

        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">เกิดข้อผิดพลาด</p>
              <p className="mt-0.5 text-xs text-destructive/80">
                {sourceErr?.message ?? "ไม่สามารถโหลดข้อมูลได้ โปรดลองใหม่"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchSource()}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              ลองใหม่
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header — hidden on print */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4" data-no-print>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics & Export</h1>
          <p className="mt-1 text-sm text-muted-foreground">วิเคราะห์แหล่งที่มาและ Export รายงาน</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {sourceFetching && !sourceLoading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
              กำลังอัปเดต…
            </span>
          )}
          <DateRangePicker value={dateRange} onChange={handleDateChange} />
          <ExportReportButton
            onExportExcel={() => void handleExportExcel()}
            onExportPrint={() => void handleExportPrint()}
            isExporting={isExporting}
          />
        </div>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Pipeline Report</h1>
        <p className="text-sm text-gray-500">
          {new Date(dateRange.from).toLocaleDateString("th-TH")} —{" "}
          {new Date(dateRange.to).toLocaleDateString("th-TH")}
        </p>
      </div>

      {/* Source Breakdown Chart */}
      <Card className="p-6">
        <SourceBreakdownChart data={sourceData?.bySubmitterType ?? []} isLoading={sourceLoading} />
      </Card>

      {/* Summary table (visible on print, screenreader-accessible) */}
      {sourceData && (
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">สรุปแหล่งที่มา</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-left font-medium text-muted-foreground">ประเภท</th>
                <th className="pb-2 text-right font-medium text-muted-foreground">จำนวน</th>
                <th className="pb-2 text-right font-medium text-muted-foreground">%</th>
              </tr>
            </thead>
            <tbody>
              {sourceData.bySubmitterType.map((row) => (
                <tr key={row.submitterType} className="border-b border-border/50 last:border-0">
                  <td className="py-2 text-foreground">{row.submitterType}</td>
                  <td className="py-2 text-right tabular-nums">{row.count}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {row.percentage.toFixed(1)}%
                  </td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2">รวม</td>
                <td className="py-2 text-right tabular-nums">{sourceData.totalIdeas}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">100%</td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
