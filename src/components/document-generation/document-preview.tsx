"use client";

/**
 * DocumentPreview — renders sanitized HTML preview with inline SVG visuals.
 *
 * Ref: design/components.md — Component 9 (UI)
 * Task 7.3
 */

import { api } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";

interface DocumentPreviewProps {
  documentId: string;
  referenceNumber?: string;
}

export function DocumentPreview({ documentId, referenceNumber }: DocumentPreviewProps) {
  const { data, isLoading, isError } = api.document.get.useQuery({ documentId, referenceNumber });

  if (isLoading) {
    return (
      <div aria-busy="true" className="space-y-4 p-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Failed to load document preview.
      </div>
    );
  }

  return (
    <article
      className="prose prose-slate max-w-none p-4"
      aria-label={`Document preview: ${data.title}`}
      // previewHtml is sanitized server-side by rehype-sanitize — safe to dangerouslySetInnerHTML
      dangerouslySetInnerHTML={{ __html: data.previewHtml }}
    />
  );
}
