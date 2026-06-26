"use client";

/**
 * /ideas — Ideas index page (authenticated)
 *
 * Role-aware:
 *   - internal_submitter → shows "My Ideas" list via idea.listMine
 *   - bd_reviewer / admin → shows Review Queue via review.listQueue
 *
 * Both roles see a "Submit New Idea" button linking to /submit (public route).
 */

import * as React from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { format } from "date-fns";
import { Plus, Lightbulb, ClipboardList, ExternalLink } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { useSession } from "@/lib/auth/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Stage badge colour map ───────────────────────────────────────────────────

const STAGE_COLOURS: Record<string, string> = {
  Sandbox: "border-gray-200 bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sandbox: "border-gray-200 bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  validation_sprint:
    "border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  build_sprint:
    "border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  launch_test:
    "border-orange-200 bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  closed_go: "border-green-200 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  closed_no_go: "border-red-200 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const STAGE_LABELS: Record<string, string> = {
  Sandbox: "Sandbox",
  sandbox: "Sandbox",
  validation_sprint: "Validation Sprint",
  build_sprint: "Build Sprint",
  launch_test: "Launch & Test",
  closed_go: "Closed (Go)",
  closed_no_go: "Closed (No Go)",
};

function StageBadge({ stage }: { stage: string }) {
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", STAGE_COLOURS[stage] ?? "")}>
      {STAGE_LABELS[stage] ?? stage}
    </Badge>
  );
}

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="กำลังโหลด...">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ locale }: { locale: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Lightbulb className="size-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <div>
        <p className="font-medium text-foreground">ยังไม่มีไอเดีย</p>
        <p className="mt-1 text-sm text-muted-foreground">เริ่มต้นโดยส่งไอเดียแรกของคุณ</p>
      </div>
      <Button asChild>
        <Link href={`/${locale}/submit`}>
          <Plus className="mr-2 size-4" aria-hidden="true" />
          ส่งไอเดียใหม่
        </Link>
      </Button>
    </div>
  );
}

// ─── My Ideas list (internal_submitter) ──────────────────────────────────────

function MyIdeasList({ locale }: { locale: string }) {
  const { data, isLoading, isError, refetch } = api.idea.listMine.useQuery(
    { limit: 50 },
    { staleTime: 30_000 }
  );

  if (isLoading) return <ListSkeleton />;

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        ไม่สามารถโหลดรายการไอเดียได้
        <Button
          variant="link"
          size="sm"
          className="ml-2 p-0 text-destructive underline"
          onClick={() => void refetch()}
        >
          ลองใหม่
        </Button>
      </div>
    );
  }

  if (!data?.items || data.items.length === 0) {
    return <EmptyState locale={locale} />;
  }

  return (
    <div className="space-y-3">
      {data.items.map((idea) => (
        <Link key={idea.ideaId} href={`/${locale}/ideas/${idea.ideaId}`} className="block">
          <Card className="cursor-pointer transition-colors hover:bg-muted/40">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{idea.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  #{idea.referenceNumber} · {formatDate(idea.createdAt)}
                </p>
              </div>
              <StageBadge stage={idea.currentStage ?? "sandbox"} />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

// ─── Review Queue list (bd_reviewer / admin) ──────────────────────────────────

function ReviewQueueList({ locale }: { locale: string }) {
  const { data, isLoading, isError, refetch } = api.review.listQueue.useQuery(
    { limit: 50 },
    { staleTime: 30_000 }
  );

  if (isLoading) return <ListSkeleton />;

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        ไม่สามารถโหลด Review Queue ได้
        <Button
          variant="link"
          size="sm"
          className="ml-2 p-0 text-destructive underline"
          onClick={() => void refetch()}
        >
          ลองใหม่
        </Button>
      </div>
    );
  }

  if (!data?.items || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted">
          <ClipboardList className="size-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="font-medium text-foreground">ไม่มีไอเดียใน Review Queue</p>
        <p className="text-sm text-muted-foreground">ทุกไอเดียได้รับการ review แล้ว</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.items.map((idea) => (
        <Link key={idea.ideaId} href={`/${locale}/ideas/${idea.ideaId}`} className="block">
          <Card className="cursor-pointer transition-colors hover:bg-muted/40">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{idea.title}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{idea.submitterName}</span>
                  <span>·</span>
                  <span>{formatDate(idea.submittedAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StageBadge stage={idea.currentStage ?? "sandbox"} />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IdeasPage() {
  const locale = useLocale();
  const { user } = useSession();
  const role = (user?.user_metadata?.["role"] as string | undefined) ?? "internal_submitter";

  const isBDOrAdmin = role === "bd_reviewer" || role === "admin";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isBDOrAdmin ? "Review Queue" : "ไอเดียของฉัน"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isBDOrAdmin
              ? "ไอเดียทั้งหมดที่รอการ review จาก BD team"
              : "ไอเดียที่คุณส่งเข้ามาในระบบ LaunchPad"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/${locale}/submit`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-4" aria-hidden="true" />
              {locale === "th" ? "ส่งไอเดียใหม่" : "Submit New Idea"}
            </Link>
          </Button>
        </div>
      </div>

      {/* Content */}
      {isBDOrAdmin ? <ReviewQueueList locale={locale} /> : <MyIdeasList locale={locale} />}
    </div>
  );
}
