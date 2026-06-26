"use client";

/**
 * ApprovalPanel — approve all documents for an idea (Admin/BD Lead only).
 * Ref: design/components.md — Component 6
 * Task 6.4
 */

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ApprovalPanelProps {
  ideaId: string;
  documentCount: number;
  onApproved?: () => void;
}

export function ApprovalPanel({ ideaId, documentCount, onApproved }: ApprovalPanelProps) {
  const utils = api.useUtils();
  const approveMutation = api.review.approveDocuments.useMutation({
    onSuccess: () => {
      utils.review.getDetail.invalidate({ ideaId });
      utils.document.listByIdea.invalidate({ ideaId });
      onApproved?.();
    },
  });

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-green-800">Approve All Documents</p>
          <p className="text-xs text-green-600">
            {documentCount} document{documentCount !== 1 ? "s" : ""} will be marked as Approved.
          </p>
        </div>
        <Button
          className="bg-green-700 text-white hover:bg-green-800"
          size="sm"
          disabled={approveMutation.isPending}
          onClick={() => approveMutation.mutate({ ideaId })}
          aria-label="Approve all documents for this idea"
        >
          {approveMutation.isPending ? "Approving…" : "Approve All"}
        </Button>
      </div>

      {approveMutation.isSuccess && (
        <div className="mt-2 flex items-center gap-2">
          <Badge className="bg-green-700">Approved</Badge>
          <span className="text-xs text-green-700">All documents approved successfully.</span>
        </div>
      )}

      {approveMutation.isError && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          Approval failed. {(approveMutation.error as unknown as Error)?.message}
        </p>
      )}
    </div>
  );
}
