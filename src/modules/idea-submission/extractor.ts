/**
 * extractor.ts — Content Extraction for Idea Submission
 *
 * Provides two extraction functions:
 *  - extractFromFile: downloads from Supabase Storage → parses PDF/DOCX/PPTX → returns text
 *  - extractFromUrl: fetches HTML → parses with Readability → returns main content text
 *
 * Design contract: these functions NEVER throw. On any error they return
 * { status: 'failed', error: <message> } so callers can apply fallback UX safely.
 *
 * Task 2.2 + 2.3
 */

// pdf-parse MUST be lazy-imported because pdfjs-dist crashes in Next.js RSC webpack context
// when loaded at module initialization time (Object.defineProperty on non-object).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfParseModule: any = null;
async function getPdfParse() {
  if (!pdfParseModule) {
    const mod = await import("pdf-parse");
    // pdf-parse exports vary between ESM/CJS — handle both
    pdfParseModule = "default" in mod ? mod.default : mod;
  }
  return pdfParseModule;
}
import mammoth from "mammoth";
import officeparser from "officeparser";
import * as cheerio from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";

// NOTE: jsdom and @mozilla/readability are intentionally NOT imported.
// jsdom@29 depends on html-encoding-sniffer@6 → @exodus/bytes (ESM-only),
// which crashes in Vercel serverless with ERR_REQUIRE_ESM even with lazy import
// because Next.js serverExternalPackages still require()s them at runtime.
// URL content extraction uses cheerio-only pipeline instead.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractResult {
  status: "success" | "failed";
  text?: string;
  charCount?: number;
  truncated?: boolean;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_MAX_CHARS = 50_000;
const URL_MAX_CHARS = 30_000;
const FILE_TIMEOUT_MS = 30_000;
const URL_TIMEOUT_MS = 10_000;

// MIME types we handle explicitly
const MIME_PDF = "application/pdf";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const MIME_HTML = "text/html";
const MIME_XHTML = "application/xhtml+xml";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Truncate text to maxChars and set truncated flag */
function truncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}

/** Wrap a promise with a race-based timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

// ─── extractFromFile ─────────────────────────────────────────────────────────

/**
 * Download a file from Supabase Storage and extract its text content.
 *
 * @param storagePath  - Path within the bucket, e.g. "idea-files/user-123/doc.pdf"
 * @param mimeType     - MIME type of the file to choose the right parser
 * @param supabaseClient - Supabase JS client instance (already initialised by caller)
 * @returns ExtractResult — never throws
 */
export async function extractFromFile(
  storagePath: string,
  mimeType: string,
  supabaseClient: SupabaseClient
): Promise<ExtractResult> {
  try {
    const result = await withTimeout(
      _doFileExtraction(storagePath, mimeType, supabaseClient),
      FILE_TIMEOUT_MS
    );
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "failed", error: message };
  }
}

async function _doFileExtraction(
  storagePath: string,
  mimeType: string,
  supabaseClient: SupabaseClient
): Promise<ExtractResult> {
  // 1. Download file from Supabase Storage
  // storagePath may include the bucket name prefix — strip it out if necessary.
  // Convention: storagePath = "idea-files/<rest>" so we extract the bucket + path.
  const firstSlash = storagePath.indexOf("/");
  const bucket = firstSlash !== -1 ? storagePath.slice(0, firstSlash) : "idea-files";
  const filePath = firstSlash !== -1 ? storagePath.slice(firstSlash + 1) : storagePath;

  const { data, error } = await supabaseClient.storage.from(bucket).download(filePath);

  if (error || !data) {
    return {
      status: "failed",
      error: error?.message ?? "Failed to download file from storage",
    };
  }

  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 2. Parse by MIME type
  // Also check storagePath extension as a fallback — some browsers report
  // generic MIME types (text/plain, application/octet-stream) for .html files
  const pathExt = storagePath.split(".").pop()?.toLowerCase() ?? "";
  const isHtmlByExtension = pathExt === "html" || pathExt === "htm" || pathExt === "xhtml";

  let rawText: string;

  if (mimeType === MIME_PDF) {
    rawText = await _extractPdf(buffer);
  } else if (mimeType === MIME_DOCX) {
    const result = await mammoth.extractRawText({ buffer });
    rawText = result.value;
  } else if (mimeType === MIME_PPTX) {
    rawText = await _parseWithOfficeParser(buffer);
  } else if (mimeType === MIME_HTML || mimeType === MIME_XHTML || isHtmlByExtension) {
    rawText = await _extractHtml(buffer);
  } else {
    // Fallback: try officeparser for anything else
    rawText = await _parseWithOfficeParser(buffer);
  }

  // 3. Truncate and return
  const cleaned = rawText.trim();
  const { text, truncated } = truncate(cleaned, FILE_MAX_CHARS);

  return {
    status: "success",
    text,
    charCount: text.length,
    truncated,
  };
}

/** Helper: run officeparser on a Buffer, returning extracted text */
async function _parseWithOfficeParser(buffer: Buffer): Promise<string> {
  // officeparser.parseOffice accepts file path, Buffer, or config object
  const text = await officeparser.parseOffice(buffer);
  return typeof text === "string" ? text : String(text);
}

/**
 * _extractPdf — extract text from PDF buffer.
 *
 * Primary: pdf-parse (fast, text-layer based).
 * Fallback: raw text extraction via cheerio if pdf-parse returns empty
 *           (some PDFs have no text layer — e.g. scanned images).
 * If both return empty, throws so the caller shows the fallback textarea.
 */
async function _extractPdf(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = await getPdfParse();
    const parsed = await pdfParse(buffer);
    const text = (parsed.text ?? "").trim();
    if (text.length > 0) return text;
    // Empty text layer — try raw buffer decode as a best-effort
    // (won't work for image-only PDFs but worth trying)
    const rawStr = buffer.toString("latin1");
    // Extract readable ASCII strings from PDF stream
    const matches = rawStr.match(/[\x20-\x7E\u0E00-\u0E7F]{4,}/g) ?? [];
    const fallback = matches.join(" ").trim();
    if (fallback.length > 20) return fallback;
    throw new Error("PDF has no extractable text layer (may be a scanned image)");
  } catch (err) {
    // Re-throw with clearer message
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF extraction failed: ${msg}`);
  }
}

/**
 * _extractHtml — extract readable text from HTML buffer.
 *
 * Uses cheerio to strip scripts/styles then returns clean text.
 * Reuses existing cheerio dependency — no new packages needed.
 */
async function _extractHtml(buffer: Buffer): Promise<string> {
  const html = buffer.toString("utf-8");
  const $ = cheerio.load(html);

  // Remove non-content elements
  $("script, style, noscript, iframe, nav, footer, header").remove();

  // Get text from body (or whole document if no body)
  const bodyText = $("body").text() || $.root().text();

  // Normalize whitespace
  const cleaned = bodyText
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (cleaned.length === 0) {
    throw new Error("No readable text found in HTML file");
  }

  return cleaned;
}

// ─── extractFromUrl ───────────────────────────────────────────────────────────

/**
 * Fetch a URL and extract its main readable content via @mozilla/readability.
 *
 * @param url - The URL to fetch (must be http/https)
 * @returns ExtractResult — never throws
 */
export async function extractFromUrl(url: string): Promise<ExtractResult> {
  try {
    const result = await withTimeout(_doUrlExtraction(url), URL_TIMEOUT_MS);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "failed", error: message };
  }
}

async function _doUrlExtraction(url: string): Promise<ExtractResult> {
  // 1. Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { status: "failed", error: `Invalid URL: ${url}` };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      status: "failed",
      error: `Unsupported protocol: ${parsedUrl.protocol}`,
    };
  }

  // 2. Fetch HTML
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LaunchPadBot/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(URL_TIMEOUT_MS),
  });

  if (!response.ok) {
    return {
      status: "failed",
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  const html = await response.text();
  if (!html || html.trim().length === 0) {
    return { status: "failed", error: "Empty response from URL" };
  }

  // 3. Extract text with cheerio only (no jsdom — ERR_REQUIRE_ESM on Vercel)
  //    Priority: <article> → <main> → <body> → whole doc
  const $ = cheerio.load(html);

  // Remove noise elements
  $(
    "script, style, noscript, iframe, nav, header, footer, " +
      "[role=navigation], [role=banner], [role=contentinfo], " +
      ".nav, .navbar, .header, .footer, .sidebar, .menu, .ad, .ads, .advertisement"
  ).remove();

  // Try semantic containers first for better signal-to-noise ratio
  let rawText =
    $("article").text() ||
    $("main").text() ||
    $("[role=main]").text() ||
    $(".content, .main-content, .post-content, .entry-content, .article-content").first().text() ||
    $("body").text() ||
    $.root().text();

  // Normalise whitespace
  rawText = rawText
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (rawText.length < 50) {
    return {
      status: "failed",
      error: "Could not extract readable content from URL",
    };
  }

  // 4. Truncate and return
  const { text, truncated } = truncate(rawText, URL_MAX_CHARS);

  return {
    status: "success",
    text,
    charCount: text.length,
    truncated,
  };
}
