"use client";

/**
 * DocumentGenerationSection — shown once AI analysis is complete (BD analysis
 * page and guest tracking page). Auto-triggers document generation (once) and
 * displays the generated Launch PAD document set with per-document preview and
 * download (MD / HTML).
 *
 * Production note: generation runs INLINE via document.triggerGeneration (BD) or
 * document.triggerGenerationPublic (guest), each with its own serverless request
 * / 60s budget. This component fires it automatically when analysis is complete
 * and no documents exist yet, then polls listByIdea.
 *
 * Modes:
 *   - BD / authenticated: omit `referenceNumber` → uses protected procedures.
 *   - Guest:              pass `referenceNumber` → uses public procedures.
 */

import * as React from "react";
import { api } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButton } from "./export-button";
import { DocumentPreview } from "./document-preview";

interface DocumentGenerationSectionProps {
  ideaId: string;
  /** Gate: only generate/show once the AI analysis has completed. */
  analysisCompleted: boolean;
  /** When provided, the component operates in guest mode (reference-number authz). */
  referenceNumber?: string;
}

function watermarkVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "approved") return "default";
  if (status === "bd_reviewed") return "secondary";
  return "outline";
}

function watermarkLabel(status: string): string {
  if (status === "approved") return "อนุมัติแล้ว";
  if (status === "bd_reviewed") return "ผ่านการตรวจ BD";
  return "ฉบับร่าง AI";
}

function generationStatusLabel(status: string): string {
  if (status === "completed") return "พร้อมใช้งาน";
  if (status === "generating") return "กำลังสร้าง...";
  if (status === "failed") return "สร้างไม่สำเร็จ";
  return "รอดำเนินการ";
}

export function DocumentGenerationSection({
  ideaId,
  analysisCompleted,
  referenceNumber,
}: DocumentGenerationSectionProps) {
  const utils = api.useUtils();
  const triggeredRef = React.useRef(false);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const isGuest = !!referenceNumber;

  const { data, isLoading, isError, error } = api.document.listByIdea.useQuery(
    { ideaId, referenceNumber },
    {
      enabled: analysisCompleted && !!ideaId,
      refetchInterval: (query) => (query.state.data?.allCompleted ? false : 5000),
      staleTime: 0,
    }
  );

  const invalidate = () => {
    void utils.document.listByIdea.invalidate({ ideaId, referenceNumber });
  };

  // Two mutation hooks; we call whichever matches the current mode.
  const protectedGen = api.document.triggerGeneration.useMutation({ onSettled: invalidate });
  const publicGen = api.document.triggerGenerationPublic.useMutation({ onSettled: invalidate });
  const gen = isGuest ? publicGen : protectedGen;

  const runGenerate = React.useCallback(
    (force: boolean) => {
      triggeredRef.current = true;
      if (isGuest) {
        publicGen.mutate({ ideaId, referenceNumber: referenceNumber!, force });
      } else {
        protectedGen.mutate({ ideaId, force });
      }
    },
    [isGuest, publicGen, protectedGen, ideaId, referenceNumber]
  );

  // Auto-trigger generation once: analysis complete + no documents yet.
  React.useEffect(() => {
    if (!analysisCompleted || !ideaId || triggeredRef.current) return;
    if (isLoading || !data) return;
    if (data.documents.length > 0) return;
    if (gen.isPending) return;
    runGenerate(false);
  }, [analysisCompleted, ideaId, isLoading, data, gen.isPending, runGenerate]);

  if (!analysisCompleted || !ideaId) return null;

  const docs = data?.documents ?? [];
  const hasDocs = docs.length > 0;
  const isGenerating =
    gen.isPending ||
    (hasDocs && !data?.allCompleted) ||
    (!hasDocs && triggeredRef.current && !gen.isError);

  return (
    <section
      aria-label="เอกสาร Launch PAD"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">เอกสาร Launch PAD</h2>
          <p className="text-xs text-muted-foreground">
            ระบบสร้างเอกสารชุดเต็มอัตโนมัติจากผลการวิเคราะห์ (Feasibility Report, BMC, Project
            Proposal และอื่น ๆ)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runGenerate(hasDocs)}
          disabled={gen.isPending}
          aria-busy={gen.isPending}
          className="shrink-0"
        >
          {gen.isPending ? "กำลังสร้าง..." : hasDocs ? "สร้างใหม่" : "สร้างเอกสาร"}
        </Button>
      </header>

      {/* Live region for polling / generation updates */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isGenerating ? "กำลังสร้างเอกสาร" : hasDocs ? `เอกสาร ${docs.length} ฉบับพร้อมใช้งาน` : ""}
      </div>

      {gen.isError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          สร้างเอกสารไม่สำเร็จ: {gen.error?.message ?? "เกิดข้อผิดพลาด"}
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          ไม่สามารถโหลดรายการเอกสารได้: {error instanceof Error ? error.message : "เกิดข้อผิดพลาด"}
        </div>
      )}

      {isLoading && (
        <div aria-busy="true" className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !hasDocs && isGenerating && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          <span
            className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden="true"
          />
          กำลังสร้างเอกสาร Launch PAD... อาจใช้เวลาสักครู่
        </div>
      )}

      {!isLoading && !hasDocs && !isGenerating && (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          ยังไม่มีเอกสาร กดปุ่ม &quot;สร้างเอกสาร&quot; เพื่อเริ่ม
        </div>
      )}

      {hasDocs && (
        <ul className="space-y-2" role="list" aria-label="รายการเอกสาร">
          {docs.map((doc) => {
            const isOpen = previewId === doc.id;
            const isReady = doc.generationStatus === "completed";
            return (
              <li
                key={doc.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-background px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{doc.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {generationStatusLabel(doc.generationStatus)}
                      {doc.hasEdits && " · แก้ไขโดย BD"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={watermarkVariant(doc.watermarkStatus)} className="text-xs">
                      {watermarkLabel(doc.watermarkStatus)}
                    </Badge>
                    {isReady && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewId(isOpen ? null : doc.id)}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? "ซ่อน" : "ดูเอกสาร"}
                      </Button>
                    )}
                    {isReady && (
                      <ExportButton documentId={doc.id} referenceNumber={referenceNumber} />
                    )}
                  </div>
                </div>

                {isOpen && isReady && (
                  <div className="overflow-hidden rounded-md border border-border bg-card">
                    <DocumentPreview documentId={doc.id} referenceNumber={referenceNumber} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
