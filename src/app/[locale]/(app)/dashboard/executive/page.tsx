"use client";

/**
 * Executive Dashboard page — US-25
 *
 * Displays aggregated pipeline KPIs for Admin and BD Lead.
 *
 * Route guard: enforced in middleware — only admin/bd_lead roles have access.
 * tRPC procedure `dashboard.getExecutiveSummary` enforces FORBIDDEN for other roles.
 *
 * Features:
 *   - KPI cards: total ideas, win rate, avg time per stage
 *   - PipelineBreakdownChart, WinNoGoChart, AvgTimePerStageChart
 *   - DateRangePicker (default: last 30 days)
 *   - IdeaSummaryModal (click "View Summary")
 *   - Auto-refetch every 60s; stale after 5m
 *   - Loading, empty, error states
 *
 * Design ref:
 *   - design/components.md — ExecutiveDashboardPage (Component 4)
 *   - design/api-spec.md — dashboard.getExecutiveSummary
 *
 * Task 6.1
 */

import * as React from "react";
import { useState, useCallback } from "react";
import { Activity, TrendingUp, Clock, RefreshCw, AlertCircle } from "lucide-react";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  KpiCard,
  DateRangePicker,
  PipelineBreakdownChart,
  WinNoGoChart,
  AvgTimePerStageChart,
  IdeaSummaryModal,
} from "@/components/dashboard";
import type { DateRange } from "@/components/dashboard";

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

// ─── Page component ───────────────────────────────────────────────────────────

export default function ExecutiveDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } =
    api.dashboard.getExecutiveSummary.useQuery(
      { from: dateRange.from, to: dateRange.to },
      {
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchInterval: 60 * 1000, // 60 seconds
        retry: 1,
      }
    );

  const handleDateChange = useCallback((range: DateRange) => {
    setDateRange(range);
  }, []);

  // ── Average of all stage avg times (for KPI card) ─────────────────────────
  const overallAvgDays =
    data && data.avgTimePerStage.length > 0
      ? (
          data.avgTimePerStage.reduce((sum, s) => sum + s.avgDays, 0) / data.avgTimePerStage.length
        ).toFixed(1)
      : null;

  // ── Error state ──────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Executive Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">ภาพรวม Pipeline สำหรับผู้บริหาร</p>
          </div>
          <DateRangePicker value={dateRange} onChange={handleDateChange} />
        </div>

        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">เกิดข้อผิดพลาด</p>
              <p className="mt-0.5 text-xs text-destructive/80">
                {error?.message ?? "ไม่สามารถโหลดข้อมูลได้ โปรดลองใหม่"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
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
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">ภาพรวม Pipeline สำหรับผู้บริหาร</p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && !isLoading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
              กำลังอัปเดต…
            </span>
          )}
          <DateRangePicker value={dateRange} onChange={handleDateChange} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalOpen(true)}
            disabled={isLoading || !data}
            aria-label="ดู Executive Summary"
          >
            ดู Summary
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="ไอเดียทั้งหมด"
          value={isLoading ? "—" : String(data?.totalIdeas ?? 0)}
          subtitle="ในช่วงวันที่เลือก"
          icon={<Activity className="size-5" />}
          isLoading={isLoading}
        />
        <KpiCard
          title="Win Rate"
          value={isLoading ? "—" : `${((data?.winNoGoStats.winRate ?? 0) * 100).toFixed(1)}%`}
          subtitle={`ปิดแล้ว ${data?.winNoGoStats.totalClosed ?? 0} ไอเดีย`}
          icon={<TrendingUp className="size-5" />}
          isLoading={isLoading}
        />
        <KpiCard
          title="เวลาเฉลี่ย/Stage"
          value={isLoading ? "—" : overallAvgDays ? `${overallAvgDays} วัน` : "—"}
          subtitle="เฉลี่ยทุก stage"
          icon={<Clock className="size-5" />}
          isLoading={isLoading}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <PipelineBreakdownChart data={data?.ideaCountByStage ?? []} isLoading={isLoading} />
        </Card>
        <Card className="p-6">
          <WinNoGoChart
            data={
              data?.winNoGoStats ?? {
                totalClosed: 0,
                closedGo: 0,
                closedNoGo: 0,
                inProgress: 0,
                winRate: 0,
              }
            }
            isLoading={isLoading}
          />
        </Card>
      </div>

      <Card className="p-6">
        <AvgTimePerStageChart data={data?.avgTimePerStage ?? []} isLoading={isLoading} />
      </Card>

      {/* Executive Summary Modal */}
      <IdeaSummaryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        summary={data ?? null}
      />
    </div>
  );
}
