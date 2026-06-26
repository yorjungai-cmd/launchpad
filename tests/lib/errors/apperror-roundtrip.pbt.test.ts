/**
 * PBT: AppError roundtrip
 *
 * Properties verified:
 * 1. For any ErrorCode value, AppError(code, msg).code === code (code is preserved)
 * 2. Every AppError is an instance of Error (prototype chain is intact)
 * 3. tRPC formatter maps AppError.code through to the client error shape without corruption
 * 4. Non-AppError input to the formatter always produces INTERNAL_SERVER_ERROR code
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { AppError } from "@/lib/errors/AppError";
import { ErrorCode } from "@/lib/errors/codes";
import { formatTRPCError } from "@/lib/errors/trpc-formatter";

// ── Arbitraries ──────────────────────────────────────────────────────────────

const errorCodeArb = fc.constantFrom(...(Object.values(ErrorCode) as ErrorCode[]));

const messageArb = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0);

const statusCodeArb = fc.integer({ min: 400, max: 599 });

const metadataArb = fc.option(fc.dictionary(fc.string({ minLength: 1 }), fc.jsonValue()), {
  nil: undefined,
}) as fc.Arbitrary<Record<string, unknown> | undefined>;

// ── Helper: build a minimal object that looks like what tRPC passes to errorFormatter ──

function makeFormatterArgs(error: Error): Parameters<typeof formatTRPCError>[0] {
  // tRPC wraps the original error as the `cause` of a TRPCError.
  // We simulate that by adding a `cause` pointing to the original error — but
  // never creating a self-referential cycle.
  const wrappedError = Object.assign(new Error(error.message), { cause: error });

  return {
    shape: {
      message: error.message,
      code: -32603 as const, // INTERNAL_SERVER_ERROR in JSON-RPC codes
      data: {
        code: "INTERNAL_SERVER_ERROR" as const,
        httpStatus: 500,
        path: undefined,
        stack: error.stack,
      },
    },
    error: wrappedError,
    type: "query" as const,
    path: undefined,
    input: undefined,
    ctx: undefined,
  };
}

// ── Properties ───────────────────────────────────────────────────────────────

describe("AppError — property-based tests", () => {
  it("Property 1: code is preserved through constructor", () => {
    fc.assert(
      fc.property(
        errorCodeArb,
        messageArb,
        statusCodeArb,
        metadataArb,
        (code, message, statusCode, metadata) => {
          const err = new AppError(code, message, statusCode, metadata);
          expect(err.code).toBe(code);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("Property 2: AppError is instanceof Error", () => {
    fc.assert(
      fc.property(errorCodeArb, messageArb, (code, message) => {
        const err = new AppError(code, message);
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(AppError);
      }),
      { numRuns: 200 }
    );
  });

  it("Property 3: tRPC formatter maps AppError.code to client shape without corruption", () => {
    fc.assert(
      fc.property(errorCodeArb, messageArb, statusCodeArb, (code, message, statusCode) => {
        const appError = new AppError(code, message, statusCode);
        const args = makeFormatterArgs(appError);
        const result = formatTRPCError(args);

        // The formatter must surface the appError sub-shape
        expect(result.data.appError).toBeDefined();
        // Code must round-trip unchanged
        expect(result.data.appError.code).toBe(code);
        // Message must be preserved
        expect(result.data.appError.message).toBe(message);
        // statusCode must be preserved
        expect(result.data.appError.statusCode).toBe(statusCode);
      }),
      { numRuns: 200 }
    );
  });

  it("Property 4: non-AppError input always returns INTERNAL_SERVER_ERROR", () => {
    fc.assert(
      fc.property(messageArb, (message) => {
        const plainError = new Error(message);
        const args = makeFormatterArgs(plainError);
        const result = formatTRPCError(args);

        expect(result.data.appError.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      }),
      { numRuns: 200 }
    );
  });

  // ── Convenience factory spot-checks ────────────────────────────────────────

  it("AppError.notFound() produces NOT_FOUND with statusCode 404", () => {
    fc.assert(
      fc.property(messageArb, (message) => {
        const err = AppError.notFound(message);
        expect(err.code).toBe(ErrorCode.NOT_FOUND);
        expect(err.statusCode).toBe(404);
      }),
      { numRuns: 100 }
    );
  });

  it("AppError.unauthorized() produces UNAUTHORIZED with statusCode 401", () => {
    fc.assert(
      fc.property(messageArb, (message) => {
        const err = AppError.unauthorized(message);
        expect(err.code).toBe(ErrorCode.UNAUTHORIZED);
        expect(err.statusCode).toBe(401);
      }),
      { numRuns: 100 }
    );
  });

  it("AppError.forbidden() produces FORBIDDEN with statusCode 403", () => {
    fc.assert(
      fc.property(messageArb, (message) => {
        const err = AppError.forbidden(message);
        expect(err.code).toBe(ErrorCode.FORBIDDEN);
        expect(err.statusCode).toBe(403);
      }),
      { numRuns: 100 }
    );
  });

  it("AppError.validation() produces VALIDATION_ERROR with statusCode 422", () => {
    fc.assert(
      fc.property(messageArb, (message) => {
        const err = AppError.validation(message);
        expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(err.statusCode).toBe(422);
      }),
      { numRuns: 100 }
    );
  });

  it("metadata is preserved when supplied", () => {
    fc.assert(
      fc.property(
        errorCodeArb,
        messageArb,
        fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
        (code, message, meta) => {
          const err = new AppError(code, message, 500, meta);
          expect(err.metadata).toEqual(meta);
        }
      ),
      { numRuns: 100 }
    );
  });
});
