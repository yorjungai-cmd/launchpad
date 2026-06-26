/**
 * Stage Gate Indicator SVG Generator — horizontal step indicator for 4 Launch PAD gates.
 * Pure string output, no browser/DOM dependencies.
 *
 * Ref: design/components.md — Component 6: SvgVisualRenderer
 * Task 4.2
 */

import type { StageDisplay } from "@/modules/document-generation/types";

const FONT = 'font-family="system-ui,sans-serif"';
const ACTIVE_COLOR = "#1E3A5F";
const DONE_COLOR = "#059669";
const PENDING_COLOR = "#E5E7EB";
const TEXT_ACTIVE = "#FFFFFF";
const TEXT_PENDING = "#6B7280";
const TEXT_LABEL = "#374151";
void TEXT_LABEL; // used for future label styling

function escapeXml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const STAGE_ORDER: StageDisplay[] = [
  "Sandbox",
  "Validation Sprint",
  "Build Sprint",
  "Launch & Test",
];

const GATE_LABELS = ["Sandbox", "Validation", "Build", "Launch & Test"];

/**
 * Renders a horizontal stage gate step indicator as inline SVG.
 * The current stage is highlighted; previous stages are shown as completed.
 * WCAG: role="img", title, desc.
 */
export function renderStageGateIndicator(
  currentStage: StageDisplay | string | null,
  title = "Launch PAD Stage"
): string {
  const currentIdx = currentStage ? STAGE_ORDER.indexOf(currentStage as StageDisplay) : -1;
  const W = 560;
  const H = 80;
  const stepW = W / 4;
  const cy = 36;
  const r = 18;

  const steps = GATE_LABELS.map((label, i) => {
    const cx = stepW * i + stepW / 2;
    const isDone = i < currentIdx;
    const isActive = i === currentIdx;
    const circleFill = isDone ? DONE_COLOR : isActive ? ACTIVE_COLOR : PENDING_COLOR;
    const textFill = isDone || isActive ? TEXT_ACTIVE : TEXT_PENDING;
    const labelFill = isActive ? ACTIVE_COLOR : isDone ? DONE_COLOR : TEXT_PENDING;
    const checkOrNum = isDone ? "✓" : String(i + 1);
    const connector =
      i < 3
        ? `<line x1="${cx + r}" y1="${cy}" x2="${cx + stepW - r}" y2="${cy}" stroke="${i < currentIdx ? DONE_COLOR : PENDING_COLOR}" stroke-width="3"/>`
        : "";
    return `
    ${connector}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${circleFill}" stroke="none"/>
    <text x="${cx}" y="${cy + 5}" ${FONT} font-size="13" font-weight="700" fill="${textFill}" text-anchor="middle">${checkOrNum}</text>
    <text x="${cx}" y="${cy + r + 16}" ${FONT} font-size="10" fill="${labelFill}" text-anchor="middle">${escapeXml(label)}</text>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="sg-title sg-desc" style="width:100%;max-width:${W}px">
  <title id="sg-title">${escapeXml(title)}: ${escapeXml(currentStage ?? "Not set")}</title>
  <desc id="sg-desc">Launch PAD 2.0 stage indicator showing 4 stages: Sandbox, Validation Sprint, Build Sprint, Launch and Test. Current stage: ${escapeXml(currentStage ?? "Not set")}.</desc>
  <rect x="0" y="0" width="${W}" height="${H}" fill="white" rx="4"/>
  ${steps}
</svg>`;
}
