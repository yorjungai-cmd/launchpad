/**
 * MarkdownRenderer — remark/rehype pipeline with custom directives and sanitize.
 *
 * Pipeline: remark-parse → remark-gfm → remark-directive → custom visitor
 *           → remark-rehype → rehype-sanitize → rehype-stringify
 *
 * Custom directives:
 *   :::bmc{ ... }       — replaced with inline SVG BMC canvas
 *   :::feasibility-chart{ ... } — replaced with inline SVG feasibility chart
 *   :::stage-gate{ stage="..." } — replaced with inline SVG stage gate indicator
 *
 * Ref: design/components.md — Component 5: MarkdownRenderer
 * Task 4.1
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { renderBmcCanvas, type BmcData } from "./svg/bmc-canvas";
import { renderFeasibilityChart, type FeasibilityScores } from "./svg/feasibility-chart";
import { renderStageGateIndicator } from "./svg/stage-gate-indicator";

// ─── Sanitize schema — allow SVG inline HTML passthrough ─────────────────────
// We trust our own SVG output; it's generated server-side, not from user input.
// User-provided markdown is sanitized by default schema (no scripts, no events).
const sanitizeSchema = {
  ...defaultSchema,
  // Allow SVG elements (output by our own renderers — trusted)
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "svg",
    "circle",
    "rect",
    "line",
    "text",
    "g",
    "title",
    "desc",
    "path",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "class", "style", "role", "aria-labelledby"],
    svg: ["xmlns", "viewBox", "width", "height", "style", "role", "aria-labelledby"],
    circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
    rect: ["x", "y", "width", "height", "fill", "stroke", "stroke-width", "rx", "ry"],
    line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
    text: ["x", "y", "font-family", "font-size", "font-weight", "fill", "text-anchor", "id"],
    g: ["transform"],
    path: ["d", "fill", "stroke"],
  },
};

// ─── Custom directive handler plugin ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const remarkVisualDirectives = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, (node: any) => {
      if (node.type !== "containerDirective" && node.type !== "leafDirective") return;

      const name: string = node.name ?? "";
      const attrs: Record<string, string> = node.attributes ?? {};

      let svgHtml = "";

      if (name === "bmc") {
        const data: BmcData = {
          keyPartners: attrs["key-partners"] ?? attrs["keyPartners"],
          keyActivities: attrs["key-activities"] ?? attrs["keyActivities"],
          keyResources: attrs["key-resources"] ?? attrs["keyResources"],
          valuePropositions: attrs["value-propositions"] ?? attrs["valuePropositions"],
          customerRelationships: attrs["customer-relationships"] ?? attrs["customerRelationships"],
          channels: attrs["channels"],
          customerSegments: attrs["customer-segments"] ?? attrs["customerSegments"],
          costStructure: attrs["cost-structure"] ?? attrs["costStructure"],
          revenueStreams: attrs["revenue-streams"] ?? attrs["revenueStreams"],
        };
        svgHtml = renderBmcCanvas(data, attrs["title"] ?? "Business Model Canvas");
      } else if (name === "feasibility-chart") {
        const scores: FeasibilityScores = {
          strategicFit: attrs["strategic-fit"] ? Number(attrs["strategic-fit"]) : null,
          marketPotential: attrs["market-potential"] ? Number(attrs["market-potential"]) : null,
          technicalFeasibility: attrs["technical-feasibility"]
            ? Number(attrs["technical-feasibility"])
            : null,
          resourceRequirement: attrs["resource-requirement"]
            ? Number(attrs["resource-requirement"])
            : null,
          businessImpact: attrs["business-impact"] ? Number(attrs["business-impact"]) : null,
        };
        svgHtml = renderFeasibilityChart(scores, attrs["title"] ?? "Feasibility Assessment");
      } else if (name === "stage-gate") {
        svgHtml = renderStageGateIndicator(
          attrs["stage"] ?? null,
          attrs["title"] ?? "Launch PAD Stage"
        );
      }

      if (svgHtml) {
        node.type = "html";
        node.value = `<div class="doc-visual">${svgHtml}</div>`;
        delete node.children;
        delete node.name;
        delete node.attributes;
      }
    });
  };
};

// ─── Processor factory ───────────────────────────────────────────────────────

function createProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkVisualDirectives)
    .use(remarkRehype, { allowDangerousHtml: true }) // allow our trusted SVG passthrough
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify);
}

// Lazy singleton — created once on first use
let _processor: ReturnType<typeof createProcessor> | null = null;
function getProcessor() {
  if (!_processor) _processor = createProcessor();
  return _processor;
}

/**
 * Render markdown to sanitized HTML with inline SVG visual directives.
 * Safe to call with BD-edited content — rehype-sanitize strips XSS.
 */
export async function renderToHtml(markdown: string): Promise<string> {
  const processor = getProcessor();
  const result = await processor.process(markdown ?? "");
  return String(result);
}

/**
 * Synchronous variant — for use in contexts where async is not available.
 * Uses processSync (slightly less compatible with some plugins but works for our pipeline).
 */
export function renderToHtmlSync(markdown: string): string {
  const processor = getProcessor();
  const result = processor.processSync(markdown ?? "");
  return String(result);
}
