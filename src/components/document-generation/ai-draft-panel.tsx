"use client";

/**
 * AIDraftPanel — shown on confirmation page (US-12).
 * Shows AI Draft documents list + download buttons for submitter/guest.
 *
 * Ref: design/components.md — Component 9 (UI)
 * Task 7.4
 */

import { useTranslations } from "next-intl";
import { api } from "@/lib/trpc/client";
import { ExportButton } from "./export-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface AIDraftPanelProps {
  ideaId: string;
  referenceNumber?: string; // guest access
}

export function AIDraftPanel({ ideaId, referenceNumber }: AIDraftPanelProps) {
  const t = useTranslations("documents");

  const { data, isLoading, isError } = api.document.listByIdea.useQuery(
    { ideaId, referenceNumber },
    {
      refetchInterval: (query) => {
        if (query.state.data?.allCompleted) return false;
        return 5000;
      },
    }
  );

  if (isLoading) {
    return (
      <div aria-busy="true" className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
        Could not load AI Draft documents.
      </div>
    );
  }

  if (data.documents.length === 0 || !data.allCompleted) {
    return (
      <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
        {t("actions.generating")}
      </div>
    );
  }

  const completedDocs = data.documents.filter((d) => d.generationStatus === "completed");

  return (
    <section aria-label="AI Draft Documents">
      <h3 className="mb-3 text-base font-semibold text-gray-900">
        AI Draft Documents
        <Badge variant="outline" className="ml-2 text-xs">
          {t("watermark.aiDraft")}
        </Badge>
      </h3>

      <ul className="space-y-2" role="list">
        {completedDocs.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
          >
            <span className="text-sm text-gray-800">{doc.title}</span>
            <ExportButton documentId={doc.id} referenceNumber={referenceNumber} />
          </li>
        ))}
      </ul>
    </section>
  );
}
