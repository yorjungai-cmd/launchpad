/**
 * i18n barrel export.
 *
 * Exports config constants and formatting utilities.
 * Translation hooks are split by environment:
 *   - Server: import from "@/lib/i18n/server"
 *   - Client: import from "@/lib/i18n/client"
 */
export { locales, defaultLocale } from "./config";
export type { Locale } from "./config";
export { formatDate, formatNumber } from "./format";
