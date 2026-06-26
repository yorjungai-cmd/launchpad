"use client";

/**
 * /ideas — Ideas index page (authenticated)
 *
 * Admin/BD: แสดง ideas ทั้งหมด + สถานะ AI + ปุ่ม Run AI
 * Internal Submitter: แสดง ideas ของตัวเอง
 */

import * as React from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { format } from "date-fns";
import {
  Plus,
  Lightbulb,
  ExternalLink,
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

import { api } from "@/lib/trpc/client";
import { useSession } from "@/lib/auth/hooks";
import { useToast } from "@/components/shared/ToastProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

// ─── Stage badge ──────────────────────────────────────────────────────────────

const STAGE_COLOURS: Record<string, string> = {
  sandbox: "border-gray-200 bg-gray-50 text-gray-700",
  Sandbox: "border-gray-200 bg-gray-50 text-gray-700",
  validation_sprint: "border-blue-200 bg-blue-50 text-blue-700",
  build_sprint: "border-purple-200 bg-purple-50 text-purple-700",
  launch_test: "border-orange-200 bg-orange-50 text-orange-700",
  closed_go: "border-green-200 bg-green-50 text-green-700",
  closed_no_go: "border-red-200 bg-red-50 text-red-700",
};
const STAGE_LABELS: Record<string, string> = {
  sandbox: "Sandbox",
  Sandbox: "Sandbox",
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

// ─── AI Status badge ──────────────────────────────────────────────────────────

type AnalysisStatus = "pending" | "processing" | "analysis_complete" | "failed" | null;

function AIStatusBadge({ status }: { status: AnalysisStatus }) {
  if (!status || status === "pending") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3" />
        Pending
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-600">
        <Loader2 className="size-3 animate-spin" />
        Analyzing…
      </span>
    );
  }
  if (status === "analysis_complete") {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <CheckCircle2 className="size-3" />
        AI Done
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-500">
      <XCircle className="size-3" />
      AI Failed
    </span>
  );
}

// ─── Run AI button ─────────────────────────────────────────────────────────────

function RunAIButton({
  ideaId,
  status,
  onDone,
}: {
  ideaId: string;
  status: AnalysisStatus;
  onDone: () => void;
}) {
  const toast = useToast();
  const needsRun = !status || status === "pending" || status === "failed";

  const mutation = api.analysis.triggerAnalysis.useMutation({
    onSuccess: () => {
      toast.success("AI analysis started — refresh in ~30s");
      onDone();
    },
    onError: (err) => toast.error("Failed to start AI", { description: err.message }),
  });

  if (!needsRun) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1 text-xs"
      disabled={mutation.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate({ ideaId });
      }}
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="size-3 animate-spin" />
          Starting…
        </>
      ) : (
        <>
          <Bot className="size-3" />
          Run AI
        </>
      )}
    </Button>
  );
}

// ─── Skeletons / empty ────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
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

function EmptyState({ locale }: { locale: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Lightbulb className="size-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">ยังไม่มีไอเดีย</p>
        <p className="mt-1 text-sm text-muted-foreground">เริ่มต้นโดยส่งไอเดียแรกของคุณ</p>
      </div>
      <Button asChild>
        <Link href={`/${locale}/submit`}>
          <Plus className="mr-2 size-4" />
          ส่งไอเดียใหม่
        </Link>
      </Button>
    </div>
  );
}

// ─── All Ideas list (BD/Admin) ────────────────────────────────────────────────

function AllIdeasList({ locale }: { locale: string }) {
  const { data, isLoading, isError, refetch } = api.review.listQueue.useQuery(
    { limit: 100 },
    { staleTime: 10_000 }
  );

  if (isLoading) return <ListSkeleton />;
  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        ไม่สามารถโหลดรายการได้
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
  if (!data?.items?.length) return <EmptyState locale={locale} />;

  const pendingCount = data.items.filter((i) => !i.recommendedAction).length;

  return (
    <div className="space-y-3">
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
          <Bot className="size-3.5 shrink-0" />
          <span>
            {pendingCount} idea{pendingCount > 1 ? "s" : ""} ยังไม่ได้รัน AI — กด{" "}
            <strong>Run AI</strong> เพื่อเริ่มวิเคราะห์
          </span>
        </div>
      )}

      {data.items.map((idea) => {
        // analysis_status isn't in QueueItem — infer from recommendedAction
        const aiStatus: AnalysisStatus = idea.recommendedAction
          ? "analysis_complete"
          : ("pending" as AnalysisStatus);

        return (
          <Card key={idea.ideaId} className="transition-colors hover:bg-muted/30">
            <CardContent className="flex items-center gap-4 p-4">
              {/* Clickable area */}
              <Link href={`/${locale}/ideas/${idea.ideaId}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{idea.title}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{idea.submitterName || "—"}</span>
                  <span>·</span>
                  <span>{formatDate(idea.submittedAt)}</span>
                  <span>·</span>
                  <AIStatusBadge status={aiStatus} />
                </div>
              </Link>

              {/* Right side: stage + run AI */}
              <div className="flex shrink-0 items-center gap-2">
                <StageBadge stage={idea.currentStage ?? "sandbox"} />
                <RunAIButton ideaId={idea.ideaId} status={aiStatus} onDone={() => void refetch()} />
              </div>
            </CardContent>
          </Card>
        );
      })}
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
  if (!data?.items?.length) return <EmptyState locale={locale} />;

  return (
    <div className="space-y-3">
      {data.items.map((idea) => (
        <Link key={idea.ideaId} href={`/${locale}/ideas/${idea.ideaId}`} className="block">
          <Card className="cursor-pointer transition-colors hover:bg-muted/40">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{idea.title}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>#{idea.referenceNumber}</span>
                  <span>·</span>
                  <span>{formatDate(idea.createdAt)}</span>
                  <span>·</span>
                  <AIStatusBadge status={idea.analysisStatus as AnalysisStatus} />
                </div>
              </div>
              <StageBadge stage={idea.currentStage ?? "sandbox"} />
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isBDOrAdmin ? "All Ideas" : "ไอเดียของฉัน"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isBDOrAdmin
              ? "ไอเดียทั้งหมดในระบบ พร้อมสถานะ AI และปุ่มเริ่มวิเคราะห์"
              : "ไอเดียที่คุณส่งเข้ามาในระบบ LaunchPad"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/${locale}/submit`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-4" />
              Submit New Idea
            </Link>
          </Button>
        </div>
      </div>

      {isBDOrAdmin ? <AllIdeasList locale={locale} /> : <MyIdeasList locale={locale} />}
    </div>
  );
}
