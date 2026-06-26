"use client";

/**
 * ReviewQueueView — BD review queue with server-side filter and cursor pagination.
 * Ref: design/components.md — Component 8
 * Task 6.3
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { api } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const STAGES = ["Sandbox", "Validation Sprint", "Build Sprint", "Launch & Test"];
const WATERMARKS = ["ai_draft", "bd_reviewed", "approved"];
const SUBMITTER_TYPES = ["employee", "executive", "partner", "vendor"];

function watermarkVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "approved") return "default";
  if (status === "bd_reviewed") return "secondary";
  return "outline";
}

export function ReviewQueueView() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const t = useTranslations("review");

  const [stage, setStage] = useState<string | undefined>();
  const [watermarkStatus, setWatermarkStatus] = useState<string | undefined>();
  const [submitterType, setSubmitterType] = useState<string | undefined>();
  const [cursor, setCursor] = useState<string | undefined>();

  const { data, isLoading, isError } = api.review.listQueue.useQuery({
    stage,
    watermarkStatus,
    submitterType,
    cursor,
    limit: 20,
  });

  if (isLoading) {
    return (
      <div aria-busy="true" className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Failed to load review queue.
      </div>
    );
  }

  return (
    <div>
      {/* Filter controls */}
      <div className="mb-4 flex flex-wrap gap-3" role="group" aria-label="Queue filters">
        <Select onValueChange={(v) => setStage(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-44" aria-label="Filter by stage">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={(v) => setWatermarkStatus(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {WATERMARKS.map((w) => (
              <SelectItem key={w} value={w}>
                {w.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={(v) => setSubmitterType(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-40" aria-label="Filter by submitter type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {SUBMITTER_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Queue list */}
      {!data || data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No ideas in queue matching current filters.
        </div>
      ) : (
        <>
          <ul className="space-y-2" role="list" aria-label="Review queue">
            {data.items.map((item) => (
              <li key={item.ideaId}>
                <Link
                  href={`/app/review/${item.ideaId}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:border-blue-300 hover:shadow-md"
                  aria-label={`Review idea: ${item.title}`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-900">{item.title}</span>
                    <span className="text-xs text-gray-500">
                      {item.submitterName} · {item.submitterType} ·{" "}
                      {new Date(item.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="ml-3 flex shrink-0 gap-2">
                    <Badge variant="outline" className="text-xs">
                      {item.currentStage}
                    </Badge>
                    <Badge variant={watermarkVariant(item.watermarkStatus)} className="text-xs">
                      {item.watermarkStatus.replace("_", " ")}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {data.nextCursor && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCursor(data.nextCursor ?? undefined)}
                aria-label="Load more ideas"
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
