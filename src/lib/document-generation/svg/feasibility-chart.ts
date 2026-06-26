/**
 * Feasibility Chart SVG Generator — radar + bar chart for 5-dimension scores.
 * Pure string output, no browser/DOM dependencies.
 *
 * Ref: design/components.md — Component 6: SvgVisualRenderer
 * Task 4.2
 */

export interface FeasibilityScores {
  strategicFit: number | null;
  marketPotential: number | null;
  technicalFeasibility: number | null;
  resourceRequirement: number | null;
  businessImpact: number | null;
}

const FONT = 'font-family="system-ui,sans-serif"';
const BAR_COLOR = "#1E3A5F";
const BG = "#F9FAFB";
const GRID_COLOR = "#E5E7EB";
const TEXT_COLOR = "#374151";

function escapeXml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function scoreColor(score: number | null): string {
  if (score === null) return "#9CA3AF";
  if (score >= 4) return "#059669";
  if (score >= 3) return "#D97706";
  return "#DC2626";
}

/**
 * Renders a horizontal bar chart of feasibility scores as inline SVG.
 * WCAG: role="img", title, desc, accessible colors.
 */
export function renderFeasibilityChart(
  scores: FeasibilityScores,
  title = "Feasibility Assessment"
): string {
  const dimensions = [
    { label: "Strategic Fit", score: scores.strategicFit },
    { label: "Market Potential", score: scores.marketPotential },
    { label: "Technical Feasibility", score: scores.technicalFeasibility },
    { label: "Resource Requirement", score: scores.resourceRequirement },
    { label: "Business Impact", score: scores.businessImpact },
  ];

  const W = 500;
  const rowH = 40;
  const labelW = 160;
  const barMaxW = 240;
  const numW = 40;
  void numW; // reserved for future numeric label layout
  const H = dimensions.length * rowH + 60;
  const barX = labelW + 10;

  // Grid lines
  const gridLines = [1, 2, 3, 4, 5]
    .map((v) => {
      const x = barX + (v / 5) * barMaxW;
      return `<line x1="${x}" y1="30" x2="${x}" y2="${H - 20}" stroke="${GRID_COLOR}" stroke-width="1"/>
    <text x="${x}" y="22" ${FONT} font-size="9" fill="${TEXT_COLOR}" text-anchor="middle">${v}</text>`;
    })
    .join("\n");

  const rows = dimensions
    .map((d, i) => {
      const y = 36 + i * rowH;
      const barW = d.score ? (d.score / 5) * barMaxW : 0;
      const color = scoreColor(d.score);
      const scoreLabel = d.score !== null ? `${d.score}/5` : "N/A";
      return `
    <text x="${labelW - 6}" y="${y + 14}" ${FONT} font-size="11" fill="${TEXT_COLOR}" text-anchor="end">${escapeXml(d.label)}</text>
    <rect x="${barX}" y="${y}" width="${barMaxW}" height="22" fill="${BG}" stroke="${GRID_COLOR}" stroke-width="1" rx="2"/>
    <rect x="${barX}" y="${y}" width="${barW}" height="22" fill="${color}" rx="2"/>
    <text x="${barX + barMaxW + 8}" y="${y + 14}" ${FONT} font-size="11" font-weight="600" fill="${color}">${scoreLabel}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="fc-title fc-desc" style="width:100%;max-width:${W}px">
  <title id="fc-title">${escapeXml(title)}</title>
  <desc id="fc-desc">Bar chart showing 5 feasibility scores: Strategic Fit, Market Potential, Technical Feasibility, Resource Requirement, Business Impact. Each scored 1 to 5.</desc>
  <rect x="0" y="0" width="${W}" height="${H}" fill="white" rx="4"/>
  <text x="${W / 2}" y="16" ${FONT} font-size="12" font-weight="700" fill="${BAR_COLOR}" text-anchor="middle">${escapeXml(title)}</text>
  ${gridLines}
  ${rows}
</svg>`;
}
