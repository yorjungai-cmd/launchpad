/**
 * HTML Shell — self-contained inline <style> block with AppliCAD branding,
 * responsive layout, sticky nav, watermark badge and print CSS.
 *
 * Ref: design/components.md — Component 7: DocumentExporter
 * Task 4.3
 */

export const HTML_STYLES = `
/* ── AppliCAD LaunchPad Portal — Document Export Styles ── */
:root {
  --brand-dark: #1E3A5F;
  --brand-mid: #2563EB;
  --brand-light: #EFF6FF;
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --border: #E5E7EB;
  --bg: #FFFFFF;
  --font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--bg);
  margin: 0;
  padding: 0;
  line-height: 1.6;
}
/* ── Layout ── */
.doc-container { max-width: 900px; margin: 0 auto; padding: 0 24px 64px; }
/* ── Header ── */
.doc-header {
  background: var(--brand-dark);
  color: white;
  padding: 20px 24px;
  margin-bottom: 32px;
  position: relative;
}
.doc-header h1 { margin: 0 0 4px; font-size: 1.4rem; font-weight: 700; }
.doc-header .doc-meta { font-size: 0.8rem; opacity: 0.8; }
/* ── Watermark badge ── */
.watermark-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.watermark-badge.ai-draft { background: #FEF3C7; color: #92400E; }
.watermark-badge.bd-reviewed { background: #DBEAFE; color: #1E40AF; }
.watermark-badge.approved { background: #D1FAE5; color: #065F46; }
/* ── Sticky nav ── */
.doc-nav {
  position: sticky;
  top: 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 8px 0;
  margin-bottom: 24px;
  z-index: 10;
  overflow-x: auto;
  white-space: nowrap;
}
.doc-nav a {
  display: inline-block;
  margin-right: 16px;
  color: var(--brand-mid);
  font-size: 0.85rem;
  text-decoration: none;
}
.doc-nav a:hover { text-decoration: underline; }
/* ── Typography ── */
h1, h2, h3, h4 { color: var(--brand-dark); margin-top: 1.8em; }
h2 { border-bottom: 2px solid var(--brand-light); padding-bottom: 4px; }
code { background: var(--brand-light); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
pre { background: #F3F4F6; padding: 16px; border-radius: 6px; overflow-x: auto; }
/* ── Tables ── */
table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.9rem; }
th { background: var(--brand-dark); color: white; padding: 8px 12px; text-align: left; }
td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
tr:nth-child(even) td { background: var(--brand-light); }
/* ── Visuals ── */
.doc-visual { margin: 24px 0; overflow-x: auto; }
.doc-visual svg { display: block; max-width: 100%; }
/* ── Print ── */
@media print {
  .doc-nav { position: static; }
  .watermark-badge { position: static; display: inline-block; margin-top: 8px; }
  h2 { page-break-after: avoid; }
  .doc-visual { page-break-inside: avoid; }
  body { font-size: 12pt; }
}
/* ── Responsive ── */
@media (max-width: 600px) {
  .doc-header { padding: 16px; }
  .watermark-badge { position: static; display: block; margin-top: 8px; width: fit-content; }
}
`;

/**
 * Returns the watermark CSS class for a given WatermarkStatus value.
 */
export function watermarkClass(status: string): string {
  if (status === "ai_draft") return "ai-draft";
  if (status === "bd_reviewed") return "bd-reviewed";
  if (status === "approved") return "approved";
  return "ai-draft";
}

/**
 * Returns the human-readable watermark label.
 */
export function watermarkLabel(status: string): string {
  if (status === "ai_draft") return "AI Draft – Pending BD Review";
  if (status === "bd_reviewed") return "BD Reviewed – Pending Approval";
  if (status === "approved") return "Approved";
  return "AI Draft – Pending BD Review";
}
