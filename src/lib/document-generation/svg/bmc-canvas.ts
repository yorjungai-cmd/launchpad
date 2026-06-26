/**
 * BMC Canvas SVG Generator — 9-block Business Model Canvas as inline SVG.
 * Pure string output, no browser/DOM dependencies (Node + Deno safe).
 *
 * Ref: design/components.md — Component 6: SvgVisualRenderer
 * Task 4.2
 */

export interface BmcData {
  keyPartners?: string;
  keyActivities?: string;
  keyResources?: string;
  valuePropositions?: string;
  customerRelationships?: string;
  channels?: string;
  customerSegments?: string;
  costStructure?: string;
  revenueStreams?: string;
}

interface Block {
  label: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const W = 900;
const H = 480;
const PAD = 8;
const FONT = 'font-family="system-ui,sans-serif"';
const LABEL_COLOR = "#6B7280";
const CONTENT_COLOR = "#111827";
const BORDER_COLOR = "#E5E7EB";
const BG_COLOR = "#F9FAFB";
const HEADER_BG = "#1E3A5F"; // AppliCAD brand dark blue

function escapeXml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, maxChars: number): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
    if (lines.length >= 3) {
      lines.push("…");
      return lines;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

function renderBlock(b: Block): string {
  const lines = wrapText(escapeXml(b.content), Math.floor(b.width / 7));
  const lineHeight = 16;
  const startY = b.y + 30;
  const linesHtml = lines
    .map(
      (l, i) =>
        `<text x="${b.x + PAD}" y="${startY + i * lineHeight}" ${FONT} font-size="11" fill="${CONTENT_COLOR}">${l}</text>`
    )
    .join("\n");
  return `
  <rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${BG_COLOR}" stroke="${BORDER_COLOR}" stroke-width="1" rx="3"/>
  <text x="${b.x + PAD}" y="${b.y + 16}" ${FONT} font-size="10" font-weight="600" fill="${LABEL_COLOR}">${escapeXml(b.label)}</text>
  ${linesHtml}`;
}

/**
 * Renders a Business Model Canvas as a self-contained inline SVG string.
 * WCAG: role="img", title, desc for screen readers.
 */
export function renderBmcCanvas(data: BmcData, title = "Business Model Canvas"): string {
  const col = W / 5;
  const row = H / 2;
  const blocks: Block[] = [
    {
      label: "Key Partners",
      content: data.keyPartners ?? "",
      x: 0,
      y: 0,
      width: col,
      height: row * 2,
    },
    {
      label: "Key Activities",
      content: data.keyActivities ?? "",
      x: col,
      y: 0,
      width: col,
      height: row,
    },
    {
      label: "Key Resources",
      content: data.keyResources ?? "",
      x: col,
      y: row,
      width: col,
      height: row,
    },
    {
      label: "Value Propositions",
      content: data.valuePropositions ?? "",
      x: col * 2,
      y: 0,
      width: col,
      height: row * 2,
    },
    {
      label: "Customer Relationships",
      content: data.customerRelationships ?? "",
      x: col * 3,
      y: 0,
      width: col,
      height: row,
    },
    {
      label: "Channels",
      content: data.channels ?? "",
      x: col * 3,
      y: row,
      width: col,
      height: row,
    },
    {
      label: "Customer Segments",
      content: data.customerSegments ?? "",
      x: col * 4,
      y: 0,
      width: col,
      height: row * 2,
    },
    {
      label: "Cost Structure",
      content: data.costStructure ?? "",
      x: 0,
      y: row * 2 - 1,
      width: W / 2,
      height: row,
    },
    {
      label: "Revenue Streams",
      content: data.revenueStreams ?? "",
      x: W / 2,
      y: row * 2 - 1,
      width: W / 2,
      height: row,
    },
  ];

  const blocksHtml = blocks.map(renderBlock).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + 36}" role="img" aria-labelledby="bmc-title bmc-desc" style="width:100%;max-width:${W}px">
  <title id="bmc-title">${escapeXml(title)}</title>
  <desc id="bmc-desc">Business Model Canvas diagram with 9 blocks: Key Partners, Key Activities, Key Resources, Value Propositions, Customer Relationships, Channels, Customer Segments, Cost Structure, Revenue Streams.</desc>
  <rect x="0" y="0" width="${W}" height="28" fill="${HEADER_BG}" rx="4"/>
  <text x="${W / 2}" y="18" ${FONT} font-size="13" font-weight="700" fill="white" text-anchor="middle">${escapeXml(title)}</text>
  <g transform="translate(0,28)">
  ${blocksHtml}
  </g>
</svg>`;
}
