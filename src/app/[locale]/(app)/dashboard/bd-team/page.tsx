"use client";

/**
 * BD Team Dashboard page — US-26
 *
 * Displays pending review queue and reviewer workload for BD Reviewer / BD Lead.
 *
 * Route guard: enforced in middleware — only bd_reviewer/bd_lead roles have access.
 * tRPC procedure `dashboard.getBDTeamView` enforces FORBIDDEN for other roles.
 *
 * Features:
 *   - Pending review count card
 *   - ReviewerWorkloadChart (stacked bar per reviewer by stage)
 *   - DateRangePicker (default: last 30 days)
 *   - Auto-refetch every 60s; stale after 5m
 *   - Loading, empty, error states
 *
 * Design ref:
 *   - design/components.md — BDTeamDashboardPage (Component 5)
 *   - design/api-spec.md — dashboard.getBDTeamView
 *
 * Task 6.2
 */

import * as React from "react";
import { useState, useCallback } from "react";
import { ClipboardList, RefreshCw, AlertCircle } from "lucide-react";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard, DateRangePicker, ReviewerWorkloadChart } from "@/components/dashboard";
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

export default function BDTeamDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);

  const { data, isLoading, isError, error, refetch, isFetching } =
    api.dashboard.getBDTeamView.useQuery(
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

  // ── Error state ──────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">BD Team Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">ภาพรวม Workload และ Review Queue</p>
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
          <h1 className="text-2xl font-bold tracking-tight">BD Team Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">ภาพรวม Workload และ Review Queue</p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && !isLoading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
              กำลังอัปเดต…
            </span>
          )}
          <DateRangePicker value={dateRange} onChange={handleDateChange} />
        </div>
      </div>

      {/* Pending review count KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="รอ Review"
          value={isLoading ? "—" : String(data?.pendingReviewCount ?? 0)}
          subtitle="ไอเดียที่ยังรอ BD ตรวจสอบ"
          icon={<ClipboardList className="size-5" />}
          isLoading={isLoading}
        />
      </div>

      {/* Workload chart */}
      <Card className="p-6">
        <ReviewerWorkloadChart data={data?.reviewerWorkload ?? []} isLoading={isLoading} />
      </Card>
    </div>
  );
}
