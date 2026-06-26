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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — pdf-parse ESM types lack a default export; CJS default works at runtime
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import officeparser from "officeparser";
import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  let rawText: string;

  if (mimeType === MIME_PDF) {
    const parsed = await pdfParse(buffer);
    rawText = parsed.text;
  } else if (mimeType === MIME_DOCX) {
    const result = await mammoth.extractRawText({ buffer });
    rawText = result.value;
  } else if (mimeType === MIME_PPTX) {
    rawText = await _parseWithOfficeParser(buffer);
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

  // 2. Fetch HTML with abort signal
  const controller = new AbortController();
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LaunchPadBot/1.0; +https://launchpad.applcad.com)",
    },
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

  // 3. Parse HTML with cheerio to clean it up, then use Readability
  const $ = cheerio.load(html);

  // Remove script/style noise before Readability
  $("script, style, noscript, iframe").remove();

  const cleanedHtml = $.html();

  // 4. Run Readability
  const dom = new JSDOM(cleanedHtml, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.textContent || article.textContent.trim().length === 0) {
    return {
      status: "failed",
      error: "Could not extract readable content from URL",
    };
  }

  // 5. Truncate and return
  const cleaned = article.textContent.trim();
  const { text, truncated } = truncate(cleaned, URL_MAX_CHARS);

  return {
    status: "success",
    text,
    charCount: text.length,
    truncated,
  };
}
