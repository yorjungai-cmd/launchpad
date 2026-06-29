/**
 * Unit tests: extractor.ts — Content Extraction
 *
 * Coverage:
 *   extractFromFile:
 *     - PDF success: mocked pdf-parse returns text
 *     - DOCX success: mocked mammoth returns text
 *     - PPTX success: mocked officeparser returns text
 *     - Supabase download failure → { status: 'failed' }
 *     - Parse failure → { status: 'failed' }, no throw
 *     - Text > 50,000 chars is truncated → truncated=true
 *
 *   extractFromUrl:
 *     - Success: mocked fetch returns HTML → Readability extracts text
 *     - Fetch network error → { status: 'failed' }, no throw
 *     - Non-200 response → { status: 'failed' }
 *     - Invalid URL → { status: 'failed' }
 *     - Empty HTML → { status: 'failed' }
 *     - Text > 30,000 chars is truncated → truncated=true
 *
 * Task 2.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type * as cheerioModule from "cheerio";

// ─── Module mocks ─────────────────────────────────────────────────────────────

// Mock pdf-parse — use the inner lib path to match the production import
const mockPdfParse = vi.fn();
vi.mock("pdf-parse/lib/pdf-parse.js", () => ({ default: mockPdfParse }));

// Mock mammoth
const mockMammothExtractRawText = vi.fn();
vi.mock("mammoth", () => ({
  default: {
    extractRawText: mockMammothExtractRawText,
  },
}));

// Mock officeparser
const mockParseOffice = vi.fn();
vi.mock("officeparser", () => ({
  default: {
    parseOffice: mockParseOffice,
  },
}));

// Mock cheerio — passthrough, we just want it to not crash
vi.mock("cheerio", async (importOriginal) => {
  const actual = await importOriginal<typeof cheerioModule>();
  return actual;
});

// ─── Import after mocks ───────────────────────────────────────────────────────

const { extractFromFile, extractFromUrl } = await import("@/modules/idea-submission/extractor");

// ─── Supabase mock factory ────────────────────────────────────────────────────

function makeSupabaseMock(
  downloadResult: { data: Blob | null; error: { message: string } | null } = {
    data: null,
    error: { message: "not configured" },
  }
): SupabaseClient {
  return {
    storage: {
      from: () => ({
        download: vi.fn().mockResolvedValue(downloadResult),
      }),
    },
  } as unknown as SupabaseClient;
}

function makeTextBlob(text: string): Blob {
  return new Blob([Buffer.from(text)]);
}

// ─── extractFromFile tests ────────────────────────────────────────────────────

describe("extractFromFile()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts text from PDF successfully", async () => {
    const fakeText = "This is a PDF document about innovation.";
    mockPdfParse.mockResolvedValueOnce({ text: fakeText });

    const client = makeSupabaseMock({
      data: makeTextBlob("fake-pdf-bytes"),
      error: null,
    });

    const result = await extractFromFile("idea-files/user-1/doc.pdf", "application/pdf", client);

    expect(result.status).toBe("success");
    expect(result.text).toBe(fakeText);
    expect(result.charCount).toBe(fakeText.length);
    expect(result.truncated).toBe(false);
  });

  it("extracts text from DOCX successfully", async () => {
    const fakeText = "This is a Word document about a new product idea.";
    mockMammothExtractRawText.mockResolvedValueOnce({ value: fakeText });

    const client = makeSupabaseMock({
      data: makeTextBlob("fake-docx-bytes"),
      error: null,
    });

    const result = await extractFromFile(
      "idea-files/user-1/doc.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      client
    );

    expect(result.status).toBe("success");
    expect(result.text).toBe(fakeText);
    expect(result.charCount).toBe(fakeText.length);
  });

  it("extracts text from PPTX using officeparser", async () => {
    const fakeText = "Slide 1: Introduction\nSlide 2: Market Opportunity";
    mockParseOffice.mockResolvedValueOnce(fakeText);

    const client = makeSupabaseMock({
      data: makeTextBlob("fake-pptx-bytes"),
      error: null,
    });

    const result = await extractFromFile(
      "idea-files/user-1/deck.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      client
    );

    expect(result.status).toBe("success");
    expect(result.text).toBe(fakeText);
  });

  it("uses officeparser fallback for unsupported MIME types", async () => {
    const fakeText = "Extracted from unknown format";
    mockParseOffice.mockResolvedValueOnce(fakeText);

    const client = makeSupabaseMock({
      data: makeTextBlob("fake-office-bytes"),
      error: null,
    });

    const result = await extractFromFile(
      "idea-files/user-1/doc.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      client
    );

    expect(result.status).toBe("success");
    expect(result.text).toBe(fakeText);
  });

  it("returns { status: 'failed' } when Supabase download fails — does NOT throw", async () => {
    const client = makeSupabaseMock({
      data: null,
      error: { message: "Bucket not found" },
    });

    const result = await extractFromFile("idea-files/user-1/doc.pdf", "application/pdf", client);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Bucket not found");
    // Must not throw — promise resolves
  });

  it("returns { status: 'failed' } when parser throws — does NOT throw", async () => {
    mockPdfParse.mockRejectedValueOnce(new Error("Corrupt PDF"));

    const client = makeSupabaseMock({
      data: makeTextBlob("bad-pdf-bytes"),
      error: null,
    });

    const result = await extractFromFile("idea-files/user-1/bad.pdf", "application/pdf", client);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Corrupt PDF");
  });

  it("truncates text > 50,000 chars and sets truncated=true", async () => {
    const longText = "A".repeat(60_000);
    mockPdfParse.mockResolvedValueOnce({ text: longText });

    const client = makeSupabaseMock({
      data: makeTextBlob("big-pdf-bytes"),
      error: null,
    });

    const result = await extractFromFile("idea-files/user-1/large.pdf", "application/pdf", client);

    expect(result.status).toBe("success");
    expect(result.text?.length).toBe(50_000);
    expect(result.charCount).toBe(50_000);
    expect(result.truncated).toBe(true);
  });

  it("does not truncate text exactly at 50,000 chars", async () => {
    const exactText = "B".repeat(50_000);
    mockPdfParse.mockResolvedValueOnce({ text: exactText });

    const client = makeSupabaseMock({
      data: makeTextBlob("exact-pdf-bytes"),
      error: null,
    });

    const result = await extractFromFile("idea-files/user-1/exact.pdf", "application/pdf", client);

    expect(result.status).toBe("success");
    expect(result.truncated).toBe(false);
  });
});

// ─── extractFromUrl tests ─────────────────────────────────────────────────────

describe("extractFromUrl()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global fetch mock
    vi.restoreAllMocks();
  });

  const SAMPLE_HTML = `<!DOCTYPE html>
    <html>
      <head><title>Test Page</title></head>
      <body>
        <article>
          <h1>My Innovative Idea</h1>
          <p>This is a detailed description of a great product innovation that spans multiple paragraphs. It contains enough text for Readability to parse correctly.</p>
          <p>The idea involves creating a new platform for business development teams to track and evaluate incoming ideas from partners and employees alike.</p>
          <p>By leveraging AI technology, teams can now process ideas 10x faster than before and make better data-driven decisions.</p>
        </article>
      </body>
    </html>`;

  function mockFetchSuccess(html = SAMPLE_HTML): void {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => html,
      })
    );
  }

  /**
   * Conditional mock: returns different responses for Jina vs direct fetches.
   * jinaContent=null simulates Jina failing (HTTP 429).
   */
  function mockFetchConditional(directHtml: string, jinaContent: string | null): void {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((fetchUrl: string) => {
        if (String(fetchUrl).startsWith("https://r.jina.ai/")) {
          if (jinaContent === null) {
            return Promise.resolve({
              ok: false,
              status: 429,
              statusText: "Too Many Requests",
              text: async () => "",
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            text: async () => jinaContent,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => directHtml,
        });
      })
    );
  }

  it("extracts main content text from a valid URL", async () => {
    mockFetchSuccess();

    const result = await extractFromUrl("https://example.com/article");

    expect(result.status).toBe("success");
    expect(result.text).toBeTruthy();
    expect(result.charCount).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
    // Should contain part of the article text
    expect(result.text).toContain("innovation");
  });

  it("returns { status: 'failed' } for an unreachable URL — does NOT throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

    const result = await extractFromUrl("https://unreachable.example.com");

    expect(result.status).toBe("failed");
    expect(result.error).toBeTruthy();
  });

  it("returns { status: 'failed' } for non-200 HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "<html><body>Not found</body></html>",
      })
    );

    const result = await extractFromUrl("https://example.com/missing");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("404");
  });

  it("returns { status: 'failed' } for an invalid URL", async () => {
    const result = await extractFromUrl("not-a-valid-url");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Invalid URL");
  });

  it("returns { status: 'failed' } for non-http/https protocol", async () => {
    const result = await extractFromUrl("ftp://example.com/file.txt");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Unsupported protocol");
  });

  it("returns { status: 'failed' } when HTML has no readable content and Jina also fails", async () => {
    mockFetchConditional(
      "<html><head><script>var x=1;</script></head><body></body></html>",
      null // Jina fails
    );

    const result = await extractFromUrl("https://example.com/empty");

    expect(result.status).toBe("failed");
  });

  it("falls back to Jina AI Reader for JS-rendered SPA pages", async () => {
    const spaHtml = `<html><head></head><body><div id="root"></div></body></html>`;
    const jinaMarkdown = `# CiVil Pro MAX\n\nแพลตฟอร์มคำนวณทางวิศวกรรมสำหรับวิศวกรโยธาและสถาปนิก\n\n## ฟีเจอร์\n- คำนวณโครงสร้าง\n- ระบบแนะนำเพื่อน\n- ถอนเงินได้`;

    mockFetchConditional(spaHtml, jinaMarkdown);

    const result = await extractFromUrl("https://example.com/spa-app");

    expect(result.status).toBe("success");
    expect(result.text).toContain("CiVil Pro MAX");
    expect(result.text).toContain("คำนวณทางวิศวกรรม");
  });

  it("falls back to meta tags when Jina AI Reader also fails", async () => {
    const spaHtml = `<!DOCTYPE html>
      <html lang="en">
        <head>
          <title>CiVil Pro MAX ! | แพลตฟอร์มคำนวณทางวิศวกรรม</title>
          <meta name="description" content="แพลตฟอร์มคำนวณทางวิศวกรรม พร้อมระบบแนะนำเพื่อนและการถอนเงิน" />
          <script type="module" src="/assets/index.js"></script>
        </head>
        <body><div id="root"></div></body>
      </html>`;

    mockFetchConditional(spaHtml, null); // Jina fails → meta fallback

    const result = await extractFromUrl("https://example.com/spa-meta-fallback");

    expect(result.status).toBe("success");
    expect(result.text).toContain("แพลตฟอร์มคำนวณทางวิศวกรรม");
    expect(result.text).toContain("URL: https://example.com/spa-meta-fallback");
  });

  it("truncates text > 30,000 chars and sets truncated=true", async () => {
    // Build HTML with enough text to exceed 30,000 chars
    const longParagraph = "<p>" + "C".repeat(1_000) + "</p>";
    const manyParagraphs = longParagraph.repeat(40); // 40,000 chars in paragraphs
    const bigHtml = `<!DOCTYPE html>
      <html><head><title>Long</title></head><body><article>${manyParagraphs}</article></body></html>`;

    mockFetchSuccess(bigHtml);

    const result = await extractFromUrl("https://example.com/long");

    expect(result.status).toBe("success");
    expect(result.text!.length).toBe(30_000);
    expect(result.truncated).toBe(true);
  });
});
