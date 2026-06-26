"use client";

/**
 * ExportButton — triggers server-side document export and client download.
 * Supports MD and HTML formats.
 *
 * Ref: design/api-spec.md — document.export
 * Task 7.4
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

interface ExportButtonProps {
  documentId: string;
  referenceNumber?: string;
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportButton({ documentId, referenceNumber }: ExportButtonProps) {
  const t = useTranslations("documents");
  const [format, setFormat] = useState<"markdown" | "html" | null>(null);

  const exportMutation = api.document.export.useMutation({
    onSuccess: (data) => {
      triggerDownload(data.filename, data.content, data.mimeType);
      setFormat(null);
    },
    onError: () => setFormat(null),
  });

  const handleExport = (fmt: "markdown" | "html") => {
    setFormat(fmt);
    exportMutation.mutate({ documentId, format: fmt, referenceNumber });
  };

  const isLoading = exportMutation.isPending;

  return (
    <div className="flex gap-2" role="group" aria-label={t("actions.download")}>
      <Button
        variant="outline"
        size="sm"
        disabled={isLoading}
        aria-busy={format === "markdown" && isLoading}
        onClick={() => handleExport("markdown")}
      >
        {format === "markdown" && isLoading ? "..." : t("actions.downloadMd")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={isLoading}
        aria-busy={format === "html" && isLoading}
        onClick={() => handleExport("html")}
      >
        {format === "html" && isLoading ? "..." : t("actions.downloadHtml")}
      </Button>
    </div>
  );
}
