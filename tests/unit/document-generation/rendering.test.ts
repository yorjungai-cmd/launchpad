/**
 * Tests for rendering core: MarkdownRenderer, SvgVisualRenderer, DocumentExporter
 * Includes PBT Properties 2 (watermark), 3 (self-contained), 5 (sanitize roundtrip)
 *
 * Ref: design/correctness.md
 * Task 4.1, 4.2, 4.3
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { renderBmcCanvas } from "@/lib/document-generation/svg/bmc-canvas";
import { renderFeasibilityChart } from "@/lib/document-generation/svg/feasibility-chart";
import { renderStageGateIndicator } from "@/lib/document-generation/svg/stage-gate-indicator";
import { renderToHtmlSync } from "@/lib/document-generation/markdown-renderer";
import {
  exportMarkdown,
  exportHtml,
  buildFilename,
  resolveContent,
} from "@/lib/document-generation/exporter";
import { watermarkLabel } from "@/lib/document-generation/html-shell";

// ─── SvgVisualRenderer ───────────────────────────────────────────────────────

describe("renderBmcCanvas()", () => {
  it("should return valid SVG string with svg tag", () => {
    const svg = renderBmcCanvas({ keyPartners: "Partner A", valuePropositions: "Core value" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("should include accessibility attributes (role, title, desc)", () => {
    const svg = renderBmcCanvas({});
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title");
    expect(svg).toContain("<desc");
  });

  it("should not contain external resource references", () => {
    const svg = renderBmcCanvas({ keyPartners: "Test" });
    expect(svg).not.toMatch(/src=["']https?:/i);
    expect(svg).not.toMatch(/href=["']https?:/i);
  });

  it("should escape XML special characters in content", () => {
    const svg = renderBmcCanvas({ keyPartners: "<script>alert(1)</script>" });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});

describe("renderFeasibilityChart()", () => {
  it("should return SVG with 5 dimension labels", () => {
    const svg = renderFeasibilityChart({
      strategicFit: 4,
      marketPotential: 3,
      technicalFeasibility: 5,
      resourceRequirement: 2,
      businessImpact: 4,
    });
    expect(svg).toContain("Strategic Fit");
    expect(svg).toContain("Market Potential");
    expect(svg).toContain("Business Impact");
  });

  it("should handle null scores gracefully", () => {
    const svg = renderFeasibilityChart({
      strategicFit: null,
      marketPotential: null,
      technicalFeasibility: null,
      resourceRequirement: null,
      businessImpact: null,
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("N/A");
  });

  it("should include accessibility attributes", () => {
    const svg = renderFeasibilityChart({
      strategicFit: 4,
      marketPotential: 3,
      technicalFeasibility: 5,
      resourceRequirement: 2,
      businessImpact: 4,
    });
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title");
  });
});

describe("renderStageGateIndicator()", () => {
  const STAGES = ["Sandbox", "Validation Sprint", "Build Sprint", "Launch & Test"] as const;

  it("should return SVG for every stage", () => {
    for (const stage of STAGES) {
      const svg = renderStageGateIndicator(stage);
      expect(svg).toContain("<svg");
    }
  });

  it("should handle null stage gracefully", () => {
    const svg = renderStageGateIndicator(null);
    expect(svg).toContain("<svg");
  });

  it("should include accessibility attributes", () => {
    const svg = renderStageGateIndicator("Sandbox");
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title");
    expect(svg).toContain("<desc");
  });
});

// ─── MarkdownRenderer ────────────────────────────────────────────────────────

describe("renderToHtmlSync()", () => {
  it("should convert basic markdown to HTML", () => {
    const html = renderToHtmlSync("# Hello\n\nWorld");
    expect(html).toContain("<h1>");
    expect(html).toContain("Hello");
    expect(html).toContain("<p>");
  });

  it("should render GFM tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = renderToHtmlSync(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<td>");
  });

  it("should handle empty string", () => {
    expect(() => renderToHtmlSync("")).not.toThrow();
  });

  // ── PBT Property 5: sanitize roundtrip ─────────────────────────────────────
  describe("PBT Property 5 — sanitize roundtrip (XSS safety)", () => {
    it("should strip <script> tags from arbitrary markdown", () => {
      fc.assert(
        fc.property(fc.string(), (raw) => {
          const html = renderToHtmlSync(raw);
          return !/<script/i.test(html);
        }),
        { numRuns: 300 }
      );
    });

    it("should strip inline event handlers (onerror, onclick, etc.)", () => {
      fc.assert(
        fc.property(fc.string(), (raw) => {
          const html = renderToHtmlSync(raw);
          return !/\son\w+=/i.test(html);
        }),
        { numRuns: 300 }
      );
    });

    it("should strip javascript: URIs", () => {
      fc.assert(
        fc.property(fc.string(), (raw) => {
          const html = renderToHtmlSync(raw);
          return !/javascript:/i.test(html);
        }),
        { numRuns: 300 }
      );
    });

    it("should handle known XSS payloads", () => {
      const payloads = [
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(1)>",
        "[click](javascript:alert(1))",
        '<a href="javascript:void(0)">link</a>',
        "<svg onload=alert(1)>",
        "`<script>alert(1)</script>`",
      ];
      for (const p of payloads) {
        const html = renderToHtmlSync(p);
        expect(html, `XSS payload not sanitized: ${p}`).not.toMatch(/<script/i);
        expect(html, `Event handler not sanitized: ${p}`).not.toMatch(/\son\w+=/i);
        expect(html, `javascript: URI not sanitized: ${p}`).not.toMatch(/javascript:/i);
      }
    });
  });
});

// ─── DocumentExporter ────────────────────────────────────────────────────────

const BASE_OPTS = {
  documentType: "feasibility_report",
  title: "Feasibility Report",
  contentMarkdown: "# Test\n\nContent here.",
  contentEditedMarkdown: null,
  watermarkStatus: "ai_draft",
  ideaTitle: "My Idea",
  referenceNumber: "APPLICAD-2026-0001",
  generatedAt: "2026-06-25T00:00:00Z",
};

describe("resolveContent()", () => {
  it("should use contentEditedMarkdown when present", () => {
    expect(resolveContent({ contentMarkdown: "original", contentEditedMarkdown: "edited" })).toBe(
      "edited"
    );
  });
  it("should fall back to contentMarkdown when edited is null", () => {
    expect(resolveContent({ contentMarkdown: "original", contentEditedMarkdown: null })).toBe(
      "original"
    );
  });
  it("should return empty string when both are null", () => {
    expect(resolveContent({ contentMarkdown: null, contentEditedMarkdown: null })).toBe("");
  });
});

describe("exportMarkdown()", () => {
  it("should include watermark comment in content", () => {
    const result = exportMarkdown(BASE_OPTS);
    expect(result.content).toContain("AI Draft – Pending BD Review");
    expect(result.mimeType).toBe("text/markdown");
  });

  it("should use edited content when available", () => {
    const result = exportMarkdown({ ...BASE_OPTS, contentEditedMarkdown: "edited content" });
    expect(result.content).toContain("edited content");
    expect(result.content).not.toContain("# Test");
  });

  it("should build correct filename", () => {
    const result = exportMarkdown(BASE_OPTS);
    expect(result.filename).toBe("feasibility-report__APPLICAD-2026-0001.md");
  });
});

describe("exportHtml()", () => {
  it("should return valid HTML with DOCTYPE", () => {
    const result = exportHtml(BASE_OPTS);
    expect(result.content).toContain("<!DOCTYPE html>");
    expect(result.mimeType).toBe("text/html");
  });

  it("should include watermark badge with correct class", () => {
    const result = exportHtml(BASE_OPTS);
    expect(result.content).toContain('class="watermark-badge ai-draft"');
    expect(result.content).toContain("AI Draft – Pending BD Review");
  });

  it("should include inline style block (no external stylesheets)", () => {
    const result = exportHtml(BASE_OPTS);
    expect(result.content).toContain("<style>");
    expect(result.content).not.toMatch(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']https?:/i);
  });

  // ── PBT Property 2: watermark consistency ──────────────────────────────────
  it("PBT Property 2: watermark in export matches watermark_status", () => {
    const statuses = ["ai_draft", "bd_reviewed", "approved"] as const;
    fc.assert(
      fc.property(fc.constantFrom(...statuses), (status) => {
        const result = exportHtml({ ...BASE_OPTS, watermarkStatus: status });
        const label = watermarkLabel(status);
        return result.content.includes(label);
      }),
      { numRuns: 200 }
    );
  });

  // ── PBT Property 3: HTML export is self-contained ──────────────────────────
  it("PBT Property 3: HTML export has no external resource references", () => {
    fc.assert(
      fc.property(
        fc.string().map((s) => s.slice(0, 200)), // reasonable length
        (content) => {
          const result = exportHtml({ ...BASE_OPTS, contentMarkdown: content });
          const html = result.content;
          const noExternalStylesheet =
            !/<link[^>]+rel=["']stylesheet["'][^>]*href=["']https?:/i.test(html);
          const noExternalScript = !/<script[^>]+src=["']https?:/i.test(html);
          const noExternalImg = !/<img[^>]+src=["']https?:/i.test(html);
          return noExternalStylesheet && noExternalScript && noExternalImg;
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe("buildFilename()", () => {
  it("should convert underscores to dashes in document type", () => {
    expect(buildFilename("feasibility_report", "REF-001", "html")).toBe(
      "feasibility-report__REF-001.html"
    );
  });

  it("should sanitize special characters in reference number", () => {
    const name = buildFilename("bmc", "APPLICAD/2026", "md");
    expect(name).not.toContain("/");
  });
});
