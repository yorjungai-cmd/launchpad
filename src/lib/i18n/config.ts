/**
 * i18n configuration — shared constants for locale routing and helpers.
 *
 * Import from here in both server and client code.
 * Do NOT import from next-intl config directly — always use this module.
 */

export const locales = ["th", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "th";
