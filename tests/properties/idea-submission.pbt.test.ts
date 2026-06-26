/**
 * Property-Based Tests — idea-submission
 *
 * Property 1 (6.1): reference-number-uniqueness
 *   - N generated reference numbers are unique
 *   - All match LP-[A-Z0-9]{8}
 *
 * Property 2 (6.2): extraction-fallback-safety
 *   - extractFromFile failure always resolves { status: 'failed' } — never throws
 *   - Manual fallback text passes submitIdeaInput schema validation
 *
 * Tasks 6.1 + 6.2
 */

import * as fc from "fast-check";
import { describe, it, expect, vi } from "vitest";
import { generateReferenceNumber } from "@/lib/auth/reference-number";
import { referenceNumberSchema } from "@/shared/schemas/common";
import { submitIdeaInput } from "@/modules/idea-submission/schemas";

// ─── Property 1: reference-number-uniqueness ─────────────────────────────────

describe("PBT — reference-number-uniqueness", () => {
  it("PBT: N generated reference numbers are unique", () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 500 }), (n) => {
        const refs = Array.from({ length: n }, generateReferenceNumber);
        return new Set(refs).size === n;
      }),
      { numRuns: 100 }
    );
  });

  it("PBT: all reference numbers match LP-[A-Z0-9]{8} pattern", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (n) => {
        const pattern = /^LP-[A-Z0-9]{8}$/;
        for (let i = 0; i < n; i++) {
          if (!pattern.test(generateReferenceNumber())) return false;
        }
        return true;
      }),
      { numRuns: 50 }
    );
  });

  it("PBT: all reference numbers satisfy referenceNumberSchema", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        for (let i = 0; i < n; i++) {
          const ref = generateReferenceNumber();
          const result = referenceNumberSchema.safeParse(ref);
          if (!result.success) return false;
        }
        return true;
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 2: extraction-fallback-safety ──────────────────────────────────

// Mock modules before importing extractor
vi.mock("pdf-parse", () => ({ default: vi.fn() }));
vi.mock("mammoth", () => ({ default: { extractRawText: vi.fn() } }));
vi.mock("officeparser", () => ({ default: { parseOffice: vi.fn() } }));

const { extractFromFile } = await import("@/modules/idea-submission/extractor");

describe("PBT — extraction-fallback-safety", () => {
  it("PBT: extractFromFile with failing Supabase always resolves { status: 'failed' }, never throws", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          storagePath: fc
            .string({ minLength: 1 })
            .map((s) => `idea-files/test/${s.replace(/\//g, "_")}.pdf`),
          mimeType: fc.constantFrom(
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/msword"
          ),
          errorMessage: fc.string({ minLength: 1, maxLength: 200 }),
        }),
        async ({ storagePath, mimeType, errorMessage }) => {
          // Mock Supabase client to always reject the download
          const mockSupabase = {
            storage: {
              from: () => ({
                download: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: errorMessage },
                }),
              }),
            },
          } as Parameters<typeof extractFromFile>[2];

          let result: Awaited<ReturnType<typeof extractFromFile>>;
          let threw = false;

          try {
            result = await extractFromFile(storagePath, mimeType, mockSupabase);
          } catch {
            threw = true;
            result = { status: "failed" }; // satisfy TS
          }

          // Must never throw — the function always resolves
          expect(threw).toBe(false);
          // Status must always be 'failed' when Supabase rejects
          expect(result!.status).toBe("failed");
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("PBT: manual fallback text with valid email passes submitIdeaInput schema", () => {
    // Use a restricted email generator that only produces addresses Zod's .email() accepts.
    // fc.emailAddress() may generate RFC 5321-valid emails (e.g. "!a@a.aa") containing special
    // characters that are rejected by Zod's stricter email validator.
    const safeEmail = fc
      .tuple(
        fc.stringMatching(/^[a-z][a-z0-9]{0,19}$/),
        fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/),
        fc.constantFrom("com", "net", "org", "io")
      )
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 500 }),
          manualContent: fc.string({ minLength: 1, maxLength: 10000 }),
          submitterName: fc.string({ minLength: 1, maxLength: 255 }),
          email: safeEmail,
          submitterType: fc.constantFrom(
            "employee" as const,
            "executive" as const,
            "partner" as const,
            "vendor" as const
          ),
        }),
        ({ title, manualContent, submitterName, email, submitterType }) => {
          const input = {
            title,
            submitterName,
            submitterEmail: email,
            submitterType,
            inputType: "file" as const,
            fileStoragePath: "idea-files/uploads/test-file.pdf",
            fileOriginalName: "test-file.pdf",
            extractedText: manualContent,
          };

          const result = submitIdeaInput.safeParse(input);

          // Valid manual fallback must pass schema validation
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.extractedText).toBe(manualContent);
          }
          return result.success;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("PBT: empty extractedText with file inputType still passes (file path is present)", () => {
    // Use a restricted email generator compatible with Zod's .email() validator.
    const safeEmail = fc
      .tuple(
        fc.stringMatching(/^[a-z][a-z0-9]{0,19}$/),
        fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/),
        fc.constantFrom("com", "net", "org", "io")
      )
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 500 }),
          submitterName: fc.string({ minLength: 1, maxLength: 255 }),
          email: safeEmail,
          submitterType: fc.constantFrom(
            "employee" as const,
            "executive" as const,
            "partner" as const,
            "vendor" as const
          ),
        }),
        ({ title, submitterName, email, submitterType }) => {
          const input = {
            title,
            submitterName,
            submitterEmail: email,
            submitterType,
            inputType: "file" as const,
            fileStoragePath: "idea-files/uploads/test.pdf",
          };

          const result = submitIdeaInput.safeParse(input);
          // fileStoragePath is present → schema refine passes
          return result.success === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
