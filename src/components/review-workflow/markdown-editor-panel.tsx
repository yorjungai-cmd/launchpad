"use client";

/**
 * MarkdownEditorPanel — CodeMirror 6 markdown editor with live preview.
 * Uses dynamic import to avoid SSR issues.
 *
 * Ref: design/components.md — Component 4
 * Task 6.1, 6.2
 */

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/trpc/client";
import { renderToHtmlSync } from "@/lib/document-generation/markdown-renderer";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// CodeMirror loaded client-side only
const CodeMirrorEditor = dynamic(
  () => import("./codemirror-editor").then((m) => m.CodeMirrorEditor),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);

interface MarkdownEditorPanelProps {
  documentId: string;
  ideaId: string;
  initialContent: string;
  readOnly?: boolean;
}

const AUTOSAVE_DEBOUNCE_MS = 2000;

export function MarkdownEditorPanel({
  documentId,
  ideaId,
  initialContent,
  readOnly,
}: MarkdownEditorPanelProps) {
  const [content, setContent] = useState(initialContent);
  const [isDirty, setIsDirty] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(() => renderToHtmlSync(initialContent));
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMutation = api.review.saveEdit.useMutation({
    onSuccess: () => setIsDirty(false),
  });

  const handleChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      setIsDirty(true);
      setPreviewHtml(renderToHtmlSync(newContent));

      // Debounced auto-save
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        if (!readOnly) {
          saveMutation.mutate({ ideaId, documentId, contentEditedMarkdown: newContent });
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [ideaId, documentId, readOnly, saveMutation]
  );

  // Warn on unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Cleanup debounce timer
  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    []
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Status bar */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {isDirty && (
          <Badge variant="outline" className="border-yellow-400 text-yellow-600">
            Unsaved changes
          </Badge>
        )}
        {saveMutation.isPending && <span>Saving…</span>}
        {saveMutation.isSuccess && !isDirty && <span className="text-green-600">Saved ✓</span>}
        {readOnly && <Badge variant="secondary">Read only</Badge>}
      </div>

      {/* Editor + Preview split pane */}
      <div className="grid min-h-[400px] grid-cols-2 gap-4 overflow-hidden rounded-lg border">
        {/* Editor */}
        <div className="overflow-auto border-r" aria-label="Markdown editor">
          <CodeMirrorEditor
            value={content}
            onChange={readOnly ? undefined : handleChange}
            readOnly={readOnly}
          />
        </div>

        {/* Preview */}
        <div
          className="prose prose-slate max-w-none overflow-auto p-4 text-sm"
          aria-label="Document preview"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </div>
  );
}
