/**
 * DocumentExporter — generates final export files (MD and self-contained HTML).
 *
 * MD export:   content + watermark header comment
 * HTML export: self-contained single file — inline <style>, rendered markdown
 *              (with inline SVG visuals), watermark badge, sticky nav, AppliCAD branding.
 *              NO external resources (CDN, external stylesheets, external images).
 *
 * Ref: design/components.md — Component 7: DocumentExporter
 *      design/correctness.md — Properties 2 (watermark), 3 (self-contained)
 * Task 4.3
 */

import { renderToHtmlSync } from "./markdown-renderer";
import { HTML_STYLES, watermarkClass, watermarkLabel } from "./html-shell";

export interface ExportOptions {
  documentType: string;
  title: string;
  contentMarkdown: string | null;
  contentEditedMarkdown: string | null;
  watermarkStatus: string;
  ideaTitle: string;
  referenceNumber: string;
  generatedAt: string | null;
}

/**
 * Returns the effective markdown content: edited version beats AI original.
 */
export function resolveContent(
  opts: Pick<ExportOptions, "contentMarkdown" | "contentEditedMarkdown">
): string {
  return opts.contentEditedMarkdown ?? opts.contentMarkdown ?? "";
}

/**
 * Export as Markdown (.md) with watermark header.
 */
export function exportMarkdown(opts: ExportOptions): {
  content: string;
  filename: string;
  mimeType: string;
} {
  const content = resolveContent(opts);
  const label = watermarkLabel(opts.watermarkStatus);
  const header = [
    `<!-- Watermark: ${label} -->`,
    `<!-- Idea: ${opts.ideaTitle} | Ref: ${opts.referenceNumber} -->`,
    `<!-- Generated: ${opts.generatedAt ?? new Date().toISOString()} -->`,
    "",
  ].join("\n");

  return {
    content: header + content,
    filename: buildFilename(opts.documentType, opts.referenceNumber, "md"),
    mimeType: "text/markdown",
  };
}

/**
 * Export as self-contained HTML — inline styles, inline SVG visuals, watermark badge.
 * No external resources → opens offline.
 */
export function exportHtml(opts: ExportOptions): {
  content: string;
  filename: string;
  mimeType: string;
} {
  const content = resolveContent(opts);
  const renderedBody = renderToHtmlSync(content);
  const wClass = watermarkClass(opts.watermarkStatus);
  const wLabel = watermarkLabel(opts.watermarkStatus);

  // Build section nav from h2 headings (simple regex — safe on our own content)
  const headingRegex = /<h2[^>]*id="([^"]*)"[^>]*>([^<]*)/g;
  const navLinks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(renderedBody)) !== null) {
    navLinks.push(`<a href="#${match[1]}">${match[2]}</a>`);
  }
  const navHtml = navLinks.length
    ? `<nav class="doc-nav" aria-label="Document sections">${navLinks.join("")}</nav>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(opts.title)} — ${escapeHtml(opts.ideaTitle)}</title>
<style>${HTML_STYLES}</style>
</head>
<body>
<header class="doc-header">
  <h1>${escapeHtml(opts.title)}</h1>
  <div class="doc-meta">
    Idea: ${escapeHtml(opts.ideaTitle)} &nbsp;|&nbsp;
    Ref: ${escapeHtml(opts.referenceNumber)} &nbsp;|&nbsp;
    Generated: ${escapeHtml(opts.generatedAt ?? new Date().toISOString())}
  </div>
  <span class="watermark-badge ${wClass}" aria-label="Document status: ${wLabel}">${wLabel}</span>
</header>
<main class="doc-container">
${navHtml}
${renderedBody}
</main>
</body>
</html>`;

  return {
    content: html,
    filename: buildFilename(opts.documentType, opts.referenceNumber, "html"),
    mimeType: "text/html",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds the export filename: {document-type-kebab}__{reference-number}.{ext}
 * e.g. feasibility-report__APPLICAD-2026-0042.html
 */
export function buildFilename(
  documentType: string,
  referenceNumber: string,
  ext: "md" | "html"
): string {
  const slug = documentType.replace(/_/g, "-").toLowerCase();
  const ref = referenceNumber.replace(/[^a-zA-Z0-9-]/g, "-");
  return `${slug}__${ref}.${ext}`;
}
