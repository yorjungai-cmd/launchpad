"use client";

/**
 * RejectPanel — BD Reviewer marks idea as No Go with required reason.
 * Ref: design/components.md — Component 7
 * Task 6.5
 */

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RejectPanelProps {
  ideaId: string;
  onRejected?: () => void;
}

const MIN_REASON_LENGTH = 10;

export function RejectPanel({ ideaId, onRejected }: RejectPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const utils = api.useUtils();
  const rejectMutation = api.review.rejectIdea.useMutation({
    onSuccess: () => {
      setDialogOpen(false);
      setReason("");
      utils.review.getDetail.invalidate({ ideaId });
      utils.review.listQueue.invalidate();
      onRejected?.();
    },
  });

  const handleReasonChange = (value: string) => {
    setReason(value);
    if (value.trim().length > 0 && value.trim().length < MIN_REASON_LENGTH) {
      setReasonError(`Reason must be at least ${MIN_REASON_LENGTH} characters`);
    } else {
      setReasonError(null);
    }
  };

  const handleConfirm = () => {
    if (reason.trim().length < MIN_REASON_LENGTH) {
      setReasonError(`Reason must be at least ${MIN_REASON_LENGTH} characters`);
      return;
    }
    rejectMutation.mutate({ ideaId, reason: reason.trim() });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-red-300 text-red-600 hover:bg-red-50"
        onClick={() => setDialogOpen(true)}
        data-testid="reject-idea-btn"
        aria-label="Reject this idea (No Go)"
      >
        Reject (No Go)
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-label="Reject idea confirmation" aria-describedby="reject-desc">
          <DialogHeader>
            <DialogTitle>Reject Idea</DialogTitle>
          </DialogHeader>

          <p id="reject-desc" className="text-sm text-gray-600">
            This will mark the idea as <strong>No Go (Closed)</strong>. The submitter will be
            notified with your reason. This action cannot be easily undone.
          </p>

          <div className="mt-3">
            <label htmlFor="reject-reason" className="mb-1 block text-sm font-medium text-gray-700">
              Reason{" "}
              <span className="text-red-500" aria-label="required">
                *
              </span>
            </label>
            <textarea
              id="reject-reason"
              className={`w-full rounded border p-2 text-sm ${reasonError ? "border-red-400" : "border-gray-300"}`}
              rows={4}
              value={reason}
              onChange={(e) => handleReasonChange(e.target.value)}
              placeholder={`Explain why this idea is not progressing (min ${MIN_REASON_LENGTH} characters)…`}
              aria-describedby={reasonError ? "reason-error" : undefined}
              aria-invalid={reasonError ? "true" : "false"}
              data-testid="reject-reason-input"
            />
            {reasonError && (
              <p id="reason-error" className="mt-1 text-xs text-red-600" role="alert">
                {reasonError}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              {reason.trim().length}/{MIN_REASON_LENGTH} minimum characters
            </p>
          </div>

          {rejectMutation.isError && (
            <p className="text-xs text-red-600" role="alert">
              {(rejectMutation.error as unknown as Error)?.message ??
                "Rejection failed. Please try again."}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={rejectMutation.isPending || reason.trim().length < MIN_REASON_LENGTH}
              onClick={handleConfirm}
              data-testid="reject-confirm-btn"
              aria-label="Confirm rejection"
            >
              {rejectMutation.isPending ? "Rejecting…" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
