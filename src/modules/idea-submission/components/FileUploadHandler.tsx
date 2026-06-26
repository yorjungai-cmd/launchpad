"use client";

/**
 * FileUploadHandler — drag-and-drop + click-to-upload zone.
 *
 * Flow:
 *  1. User drops / picks file → client MIME + size validation
 *  2. Valid file → upload to Supabase Storage (idea-files bucket)
 *  3. After upload → call api.idea.extractFile mutation
 *  4. Show extraction preview in read-only textarea
 *  5. On extraction failure → show fallback textarea for manual input
 *
 * Loading states:
 *  - Skeleton during upload
 *  - "กำลังอ่านเนื้อหา..." during extraction
 *
 * Task 4.3
 */

import * as React from "react";
import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { api } from "@/lib/trpc/client";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileUploadHandlerProps {
  /** Called when extraction succeeds */
  onExtracted: (text: string, storagePath: string, originalName: string) => void;
  /** Called when any error occurs (client validation or extraction) */
  onError: (msg: string) => void;
}

type UploadState =
  | { stage: "idle" }
  | { stage: "uploading" }
  | { stage: "extracting" }
  | { stage: "preview"; text: string; storagePath: string; originalName: string }
  | { stage: "fallback"; storagePath: string; originalName: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/msword", // doc
  "text/html", // html
  "application/xhtml+xml", // xhtml
] as const;

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// ─── Component ────────────────────────────────────────────────────────────────

export function FileUploadHandler({ onExtracted, onError }: FileUploadHandlerProps) {
  const t = useTranslations("submission.fileUpload");
  const [state, setState] = useState<UploadState>({ stage: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractFileMutation = api.idea.extractFile.useMutation();

  // ─── Validation ───────────────────────────────────────────────────────────

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
        return t("errorInvalidType");
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return t("errorTooLarge");
      }
      return null;
    },
    [t]
  );

  // ─── Upload + Extract ─────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        onError(validationError);
        return;
      }

      setState({ stage: "uploading" });

      try {
        // Upload to Supabase Storage
        const supabase = createBrowserSupabaseClient();
        const timestamp = Date.now();
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `idea-files/uploads/${timestamp}-${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("idea-files")
          .upload(`uploads/${timestamp}-${safeFileName}`, file, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        // Extract content
        setState({ stage: "extracting" });

        const extracted = await extractFileMutation.mutateAsync({
          storagePath,
          mimeType: file.type,
        });

        setState({
          stage: "preview",
          text: extracted.extractedText,
          storagePath,
          originalName: file.name,
        });
        onExtracted(extracted.extractedText, storagePath, file.name);
      } catch {
        // Extraction failure — show fallback textarea
        const uploadedPath = state.stage === "uploading" ? "" : "";
        setState({
          stage: "fallback",
          storagePath: uploadedPath,
          originalName: file.name,
        });
      }
    },
    [validateFile, onExtracted, extractFileMutation, state]
  );

  // ─── Event handlers ───────────────────────────────────────────────────────

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const onFallbackChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (state.stage === "fallback") {
        const text = e.target.value;
        if (text.length > 0) {
          onExtracted(text, state.storagePath, state.originalName);
        }
      }
    },
    [state, onExtracted]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (state.stage === "uploading") {
    return (
      <div role="status" aria-live="polite" aria-label={t("uploading")}>
        <Skeleton className="h-32 w-full" aria-label={t("uploading")} />
        <p className="mt-2 text-center text-sm text-muted-foreground">{t("uploading")}</p>
      </div>
    );
  }

  if (state.stage === "extracting") {
    return (
      <div role="status" aria-live="polite" aria-label={t("extracting")}>
        <Skeleton className="h-32 w-full" aria-label={t("extracting")} />
        <p className="mt-2 text-center text-sm text-muted-foreground">{t("extracting")}</p>
      </div>
    );
  }

  if (state.stage === "preview") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{state.originalName}</span>
        </div>
        <Textarea
          readOnly
          value={state.text}
          rows={8}
          aria-label={t("previewLabel")}
          className="resize-none font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => setState({ stage: "idle" })}
          className="self-start text-xs text-muted-foreground underline hover:text-foreground"
        >
          {t("removeFile")}
        </button>
      </div>
    );
  }

  if (state.stage === "fallback") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{t("extractionFailed")}</span>
        </div>
        <Textarea
          rows={8}
          placeholder={t("fallbackPlaceholder")}
          aria-label={t("fallbackLabel")}
          onChange={onFallbackChange}
          className="resize-none"
        />
        <button
          type="button"
          onClick={() => setState({ stage: "idle" })}
          className="self-start text-xs text-muted-foreground underline hover:text-foreground"
        >
          {t("tryAnotherFile")}
        </button>
      </div>
    );
  }

  // stage === "idle"
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={t("dropZoneLabel")}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input p-8 text-center",
          "cursor-pointer transition-colors",
          "hover:border-ring hover:bg-accent/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isDragOver && "border-ring bg-accent/50"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <Upload className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{t("dropZoneTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("dropZoneDesc")}</p>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.pptx,.docx,.doc,.html,.htm,.xhtml"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={onInputChange}
      />
    </div>
  );
}
