"use client";

/**
 * DocumentListView — shows all documents for an idea with polling,
 * watermark badges, and loading/empty/error/success states.
 *
 * Ref: design/components.md — Component 9 (UI)
 * Task 7.2
 */

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { api } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface DocumentListViewProps {
  ideaId: string;
  referenceNumber?: string;
  onDocumentsReady?: () => void;
}

function watermarkVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "approved") return "default";
  if (status === "bd_reviewed") return "secondary";
  return "outline";
}

function watermarkLabel(status: string, t: (key: string) => string): string {
  if (status === "approved") return t("watermark.approved");
  if (status === "bd_reviewed") return t("watermark.bdReviewed");
  return t("watermark.aiDraft");
}

function generationStatusLabel(status: string, t: (key: string) => string): string {
  if (status === "completed") return t("status.completed");
  if (status === "generating") return t("status.generating");
  if (status === "failed") return t("status.failed");
  return t("status.pending");
}

export function DocumentListView({
  ideaId,
  referenceNumber,
  onDocumentsReady,
}: DocumentListViewProps) {
  const t = useTranslations("documents");

  const { data, isLoading, isError, error } = api.document.listByIdea.useQuery(
    { ideaId, referenceNumber },
    {
      refetchInterval: (query) => {
        // Stop polling once all documents are completed
        if (query.state.data?.allCompleted) return false;
        return 5000; // poll every 5s
      },
      staleTime: 0,
    }
  );

  useEffect(() => {
    if (data?.allCompleted) {
      onDocumentsReady?.();
    }
  }, [data?.allCompleted, onDocumentsReady]);

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label={t("actions.generating")}>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        {(error as unknown as Error)?.message ?? "Failed to load documents"}
      </div>
    );
  }

  if (!data || data.documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        {t("actions.generating")}
      </div>
    );
  }

  return (
    <div>
      {/* Live region for polling updates */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {!data.allCompleted ? t("actions.generating") : `${data.documents.length} documents ready`}
      </div>

      <ul className="space-y-2" role="list" aria-label="Document list">
        {data.documents.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-gray-900">{doc.title}</span>
              <span className="text-xs text-gray-500">
                {generationStatusLabel(doc.generationStatus, t)}
                {doc.hasEdits && " · Edited by BD"}
              </span>
            </div>
            <Badge
              variant={watermarkVariant(doc.watermarkStatus)}
              className="ml-3 shrink-0 text-xs"
            >
              {watermarkLabel(doc.watermarkStatus, t)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
