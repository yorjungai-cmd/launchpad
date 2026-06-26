import { describe, it, expect } from "vitest";
import {
  emailSchema,
  referenceNumberSchema,
  paginationSchema,
  localeSchema,
} from "@/shared/schemas";

// ─── emailSchema ────────────────────────────────────────────────────────────

describe("emailSchema", () => {
  it("accepts a valid email", () => {
    expect(emailSchema.parse("user@example.com")).toBe("user@example.com");
  });

  it("accepts email with subdomain", () => {
    expect(emailSchema.parse("user@mail.example.co.th")).toBe("user@mail.example.co.th");
  });

  it("accepts email with plus alias", () => {
    expect(emailSchema.parse("user+tag@example.com")).toBe("user+tag@example.com");
  });

  it("rejects email missing @", () => {
    expect(() => emailSchema.parse("notanemail")).toThrow();
  });

  it("rejects email missing domain", () => {
    expect(() => emailSchema.parse("user@")).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => emailSchema.parse("")).toThrow();
  });
});

// ─── referenceNumberSchema ──────────────────────────────────────────────────

describe("referenceNumberSchema", () => {
  it("accepts valid reference number LP-AB12CD34", () => {
    expect(referenceNumberSchema.parse("LP-AB12CD34")).toBe("LP-AB12CD34");
  });

  it("accepts reference number with all uppercase letters", () => {
    expect(referenceNumberSchema.parse("LP-ABCDEFGH")).toBe("LP-ABCDEFGH");
  });

  it("accepts reference number with all digits", () => {
    expect(referenceNumberSchema.parse("LP-12345678")).toBe("LP-12345678");
  });

  it("rejects lowercase letters in the code part", () => {
    expect(() => referenceNumberSchema.parse("LP-ab12cd34")).toThrow();
  });

  it("rejects missing LP- prefix", () => {
    expect(() => referenceNumberSchema.parse("AB12CD34")).toThrow();
  });

  it("rejects code that is too short (7 chars)", () => {
    expect(() => referenceNumberSchema.parse("LP-AB12CD3")).toThrow();
  });

  it("rejects code that is too long (9 chars)", () => {
    expect(() => referenceNumberSchema.parse("LP-AB12CD345")).toThrow();
  });

  it("rejects wrong prefix", () => {
    expect(() => referenceNumberSchema.parse("XX-AB12CD34")).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => referenceNumberSchema.parse("")).toThrow();
  });

  it("rejects special characters in code", () => {
    expect(() => referenceNumberSchema.parse("LP-AB12CD-4")).toThrow();
  });
});

// ─── paginationSchema ───────────────────────────────────────────────────────

describe("paginationSchema", () => {
  it("applies default limit of 20 when not provided", () => {
    const result = paginationSchema.parse({});
    expect(result.limit).toBe(20);
  });

  it("accepts limit = 1 (minimum boundary)", () => {
    const result = paginationSchema.parse({ limit: 1 });
    expect(result.limit).toBe(1);
  });

  it("accepts limit = 100 (maximum boundary)", () => {
    const result = paginationSchema.parse({ limit: 100 });
    expect(result.limit).toBe(100);
  });

  it("rejects limit = 0 (below minimum)", () => {
    expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
  });

  it("rejects limit = 101 (above maximum)", () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
  });

  it("rejects non-integer limit", () => {
    expect(() => paginationSchema.parse({ limit: 10.5 })).toThrow();
  });

  it("accepts a cursor string", () => {
    const result = paginationSchema.parse({ cursor: "eyJpZCI6IjEyMyJ9" });
    expect(result.cursor).toBe("eyJpZCI6IjEyMyJ9");
  });

  it("cursor is optional — omitting it leaves it undefined", () => {
    const result = paginationSchema.parse({ limit: 10 });
    expect(result.cursor).toBeUndefined();
  });

  it("accepts valid limit alongside a cursor", () => {
    const result = paginationSchema.parse({ cursor: "abc", limit: 50 });
    expect(result.cursor).toBe("abc");
    expect(result.limit).toBe(50);
  });
});

// ─── localeSchema ────────────────────────────────────────────────────────────

describe("localeSchema", () => {
  it("accepts 'th'", () => {
    expect(localeSchema.parse("th")).toBe("th");
  });

  it("accepts 'en'", () => {
    expect(localeSchema.parse("en")).toBe("en");
  });

  it("defaults to 'th' when value is undefined", () => {
    expect(localeSchema.parse(undefined)).toBe("th");
  });

  it("rejects unknown locale", () => {
    expect(() => localeSchema.parse("fr")).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => localeSchema.parse("")).toThrow();
  });

  it("rejects locale with wrong casing", () => {
    expect(() => localeSchema.parse("TH")).toThrow();
  });
});
