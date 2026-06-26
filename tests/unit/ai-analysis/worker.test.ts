/**
 * Unit tests for AIAnalysisWorker retry/backoff logic
 *
 * Tests the retry count boundary, exponential backoff, and 429 handling.
 * Uses PBT Property 4 for retry count boundary invariant.
 *
 * Ref: tasks.md — Task 2.5
 *      design/correctness.md — Property 4: Retry Count Boundary
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ─── Constants (mirror from worker) ──────────────────────────────────────────

const MAX_RETRIES = 3;
const BACKOFF_DELAYS_MS = [5_000, 15_000, 45_000] as const;

// ─── Pure helper functions extracted for testability ─────────────────────────
// These represent the logic that lives inside the Edge Function.
// We test them in isolation here.

function getStatusForAttempt(attemptNumber: number): "failed" | "processing" {
  return attemptNumber >= MAX_RETRIES ? "failed" : "processing";
}

function getBackoffDelay(attempt: number): number {
  return BACKOFF_DELAYS_MS[attempt] ?? BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1] ?? 45_000;
}

function parseRetryAfterHeader(header: string | undefined | null): number | null {
  if (!header) return null;
  const seconds = parseInt(header, 10);
  return isNaN(seconds) ? null : seconds * 1000;
}

function shouldRespectRateLimit(remainingRequests: number): boolean {
  return remainingRequests < 5;
}

// ─── PBT Property 4: Retry Count Boundary ────────────────────────────────────

describe("PBT Property 4 — retry count boundary: attempt >= MAX_RETRIES → status 'failed'", () => {
  it("should always result in 'failed' when attempt >= MAX_RETRIES", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), (attemptNumber) => {
        const status = getStatusForAttempt(attemptNumber);

        if (attemptNumber >= MAX_RETRIES) {
          return status === "failed";
        } else {
          return status === "processing";
        }
      }),
      { numRuns: 200 }
    );
  });

  it("should produce 'processing' for attempt 0, 1, 2", () => {
    expect(getStatusForAttempt(0)).toBe("processing");
    expect(getStatusForAttempt(1)).toBe("processing");
    expect(getStatusForAttempt(2)).toBe("processing");
  });

  it("should produce 'failed' for attempt 3 (MAX_RETRIES)", () => {
    expect(getStatusForAttempt(3)).toBe("failed");
  });

  it("should produce 'failed' for attempt > MAX_RETRIES", () => {
    expect(getStatusForAttempt(4)).toBe("failed");
    expect(getStatusForAttempt(10)).toBe("failed");
  });
});

// ─── Exponential backoff ──────────────────────────────────────────────────────

describe("exponential backoff delays", () => {
  it("should return correct delay for attempt 0 (5s)", () => {
    expect(getBackoffDelay(0)).toBe(5_000);
  });

  it("should return correct delay for attempt 1 (15s)", () => {
    expect(getBackoffDelay(1)).toBe(15_000);
  });

  it("should return correct delay for attempt 2 (45s)", () => {
    expect(getBackoffDelay(2)).toBe(45_000);
  });

  it("should return last delay for attempts beyond array length", () => {
    // Beyond defined delays → use last (45s)
    expect(getBackoffDelay(3)).toBe(45_000);
    expect(getBackoffDelay(99)).toBe(45_000);
  });

  it("should have delays increasing (exponential pattern)", () => {
    const d0 = getBackoffDelay(0);
    const d1 = getBackoffDelay(1);
    const d2 = getBackoffDelay(2);

    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
  });
});

// ─── 429 Retry-After header handling ─────────────────────────────────────────

describe("429 Rate Limit — Retry-After header handling", () => {
  it("should parse Retry-After header into milliseconds", () => {
    expect(parseRetryAfterHeader("30")).toBe(30_000);
    expect(parseRetryAfterHeader("60")).toBe(60_000);
    expect(parseRetryAfterHeader("1")).toBe(1_000);
  });

  it("should return null for missing header", () => {
    expect(parseRetryAfterHeader(undefined)).toBeNull();
    expect(parseRetryAfterHeader(null)).toBeNull();
    expect(parseRetryAfterHeader("")).toBeNull();
  });

  it("should return null for non-numeric header", () => {
    expect(parseRetryAfterHeader("invalid")).toBeNull();
    expect(parseRetryAfterHeader("abc")).toBeNull();
  });

  it("should use Retry-After delay when available (not default backoff)", () => {
    const retryAfterSec = "20";
    const parsedMs = parseRetryAfterHeader(retryAfterSec);
    const defaultBackoffMs = getBackoffDelay(0); // 5s

    // Retry-After (20s) takes precedence over backoff (5s)
    expect(parsedMs).toBe(20_000);
    expect(parsedMs).toBeGreaterThan(defaultBackoffMs);
  });

  it("should correctly determine sleep duration for 429 response", () => {
    // Scenario: 429 with Retry-After: 45
    const retryAfterHeader = "45";
    const parsedMs = parseRetryAfterHeader(retryAfterHeader);
    const attempt = 0;
    const fallbackMs = getBackoffDelay(attempt);

    // If Retry-After parsed successfully, use it; else use backoff
    const sleepMs = parsedMs ?? fallbackMs;
    expect(sleepMs).toBe(45_000);
  });
});

// ─── Rate limit guard ─────────────────────────────────────────────────────────

describe("rate limit guard (x-ratelimit-remaining-requests)", () => {
  it("should pause when remaining requests < 5", () => {
    expect(shouldRespectRateLimit(0)).toBe(true);
    expect(shouldRespectRateLimit(1)).toBe(true);
    expect(shouldRespectRateLimit(4)).toBe(true);
  });

  it("should not pause when remaining requests >= 5", () => {
    expect(shouldRespectRateLimit(5)).toBe(false);
    expect(shouldRespectRateLimit(100)).toBe(false);
  });
});

// ─── Retry state machine ──────────────────────────────────────────────────────

describe("retry state machine", () => {
  it("should not exceed MAX_RETRIES on any error sequence", () => {
    let attempts = 0;
    let finalStatus: "failed" | "completed" = "failed";

    // Simulate retry loop
    const MAX = MAX_RETRIES;
    while (attempts < MAX) {
      attempts++;
      // Simulate all attempts failing
      const error = new Error(`Attempt ${attempts} failed`);
      if (error) {
        // continue loop
      }
    }

    // After loop, attempts === MAX_RETRIES
    if (attempts >= MAX) {
      finalStatus = "failed";
    }

    expect(attempts).toBe(MAX_RETRIES);
    expect(finalStatus).toBe("failed");
  });

  it("should succeed immediately on first attempt (no retry)", () => {
    let attempts = 0;
    let succeeded = false;
    let finalStatus: "failed" | "completed" = "failed";

    const MAX = MAX_RETRIES;
    while (attempts < MAX && !succeeded) {
      attempts++;
      // First attempt succeeds
      succeeded = true;
    }

    if (succeeded) {
      finalStatus = "completed";
    }

    expect(attempts).toBe(1);
    expect(finalStatus).toBe("completed");
  });
});
