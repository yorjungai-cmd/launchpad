/**
 * PBT: locale-fallback
 *
 * Properties tested:
 *   1. Any locale string NOT in ['th', 'en'] resolves to the defaultLocale ('th')
 *      when passed through the locale validation logic used in i18n/request.ts.
 *   2. Valid locales 'th' and 'en' are accepted as-is (identity property).
 *   3. localeSchema.parse('th') === 'th', localeSchema.parse('en') === 'en'
 *
 * Uses fast-check for property-based generation.
 */
import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { z } from "zod";

import { defaultLocale, locales, type Locale } from "@/lib/i18n/config";

// ─── Zod schema for locale validation (mirrors i18n/request.ts logic) ───────

/** Validates that a value is one of the supported locales. */
const localeSchema = z.enum(locales);

/**
 * Mimics the locale resolution logic from src/i18n/request.ts:
 * if the locale is missing or not in the supported list, fall back to defaultLocale.
 */
function resolveLocale(input: string | undefined): Locale {
  if (!input || !locales.includes(input as Locale)) {
    return defaultLocale;
  }
  return input as Locale;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("i18n locale-fallback (PBT)", () => {
  it("resolveLocale: any unsupported locale string falls back to defaultLocale ('th')", () => {
    // Generate arbitrary strings, filter out the valid locales
    fc.assert(
      fc.property(
        fc.string().filter((s) => !locales.includes(s as Locale)),
        (unknownLocale) => {
          const result = resolveLocale(unknownLocale);
          expect(result).toBe(defaultLocale);
        }
      )
    );
  });

  it("resolveLocale: undefined input falls back to defaultLocale ('th')", () => {
    expect(resolveLocale(undefined)).toBe(defaultLocale);
  });

  it("resolveLocale: empty string falls back to defaultLocale ('th')", () => {
    expect(resolveLocale("")).toBe(defaultLocale);
  });

  it("resolveLocale: 'th' always returns 'th' (identity)", () => {
    fc.assert(
      fc.property(fc.constant("th" as const), (locale) => {
        expect(resolveLocale(locale)).toBe("th");
      })
    );
  });

  it("resolveLocale: 'en' always returns 'en' (identity)", () => {
    fc.assert(
      fc.property(fc.constant("en" as const), (locale) => {
        expect(resolveLocale(locale)).toBe("en");
      })
    );
  });

  // ─── localeSchema (Zod) properties ─────────────────────────────────────────

  it("localeSchema.parse('th') === 'th'", () => {
    expect(localeSchema.parse("th")).toBe("th");
  });

  it("localeSchema.parse('en') === 'en'", () => {
    expect(localeSchema.parse("en")).toBe("en");
  });

  it("localeSchema: any unsupported locale throws ZodError", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !locales.includes(s as Locale)),
        (unknownLocale) => {
          expect(() => localeSchema.parse(unknownLocale)).toThrow(z.ZodError);
        }
      )
    );
  });

  it("localeSchema: valid locales pass without throwing", () => {
    for (const locale of locales) {
      expect(() => localeSchema.parse(locale)).not.toThrow();
    }
  });

  it("defaultLocale is included in the locales list", () => {
    expect(locales).toContain(defaultLocale);
  });

  it("locales list has exactly 2 entries: 'th' and 'en'", () => {
    expect(locales).toHaveLength(2);
    expect(locales).toContain("th");
    expect(locales).toContain("en");
  });
});
