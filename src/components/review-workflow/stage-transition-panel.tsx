"use client";

/**
 * StageTransitionPanel — dropdown to change stage + history timeline.
 * Ref: design/components.md — Component 5
 * Task 6.4
 */

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const VALID_STAGES = ["Sandbox", "Validation Sprint", "Build Sprint", "Launch & Test"];

interface StageTransitionPanelProps {
  ideaId: string;
  currentStage: string;
  onStageChanged?: (newStage: string) => void;
}

export function StageTransitionPanel({
  ideaId,
  currentStage,
  onStageChanged,
}: StageTransitionPanelProps) {
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");

  const utils = api.useUtils();
  const changeStageMutation = api.review.changeStage.useMutation({
    onSuccess: (data) => {
      setConfirmOpen(false);
      setSelectedStage("");
      setReason("");
      utils.review.getDetail.invalidate({ ideaId });
      onStageChanged?.(data.toStage);
    },
  });

  const { data: historyData } = api.review.listTransitions.useQuery({ ideaId });

  const validNextStages = VALID_STAGES.filter(
    (s) => s !== currentStage && currentStage !== "closed_go" && currentStage !== "closed_no_go"
  );

  return (
    <div className="space-y-4">
      {/* Current stage indicator */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">Current stage:</span>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">
          {currentStage}
        </span>
      </div>

      {/* Stage change controls */}
      {currentStage !== "closed_go" && currentStage !== "closed_no_go" && (
        <div className="flex items-center gap-2">
          <Select value={selectedStage} onValueChange={setSelectedStage}>
            <SelectTrigger className="w-52" aria-label="Select new stage">
              <SelectValue placeholder="Move to stage…" />
            </SelectTrigger>
            <SelectContent>
              {validNextStages.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedStage || changeStageMutation.isPending}
            onClick={() => setConfirmOpen(true)}
            aria-label={`Move idea to ${selectedStage}`}
          >
            Move
          </Button>
        </div>
      )}

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent aria-label="Confirm stage change">
          <DialogHeader>
            <DialogTitle>Confirm Stage Change</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Move from <strong>{currentStage}</strong> to <strong>{selectedStage}</strong>?
          </p>
          <textarea
            className="mt-2 w-full rounded border border-gray-300 p-2 text-sm"
            placeholder="Optional comment…"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Stage change reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                changeStageMutation.mutate({
                  ideaId,
                  toStage: selectedStage,
                  reason: reason || undefined,
                })
              }
              disabled={changeStageMutation.isPending}
            >
              {changeStageMutation.isPending ? "Moving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History timeline */}
      {historyData && historyData.transitions.length > 0 && (
        <div className="mt-4" aria-label="Stage history">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Stage History
          </p>
          <ol className="space-y-2">
            {historyData.transitions.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <span
                  className="mt-0.5 size-2 shrink-0 rounded-full bg-blue-400"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-medium">{t.toStage}</span>
                  {t.fromStage && <span className="text-gray-400"> (from {t.fromStage})</span>}
                  {t.reviewerName && <span className="text-gray-500"> · {t.reviewerName}</span>}
                  <span className="ml-1 text-xs text-gray-400">
                    {new Date(t.createdAt).toLocaleString()}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
