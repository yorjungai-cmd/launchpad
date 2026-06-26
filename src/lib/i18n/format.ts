/**
 * Locale-aware formatting utilities.
 *
 * Lightweight wrappers around the Intl API.
 * Safe to use on both server and client.
 */
import type { Locale } from "./config";

/**
 * Format a Date as a locale-aware string.
 *
 * @example
 *   formatDate(new Date(), 'th') // → '25/6/2568' (Buddhist era via th-TH)
 *   formatDate(new Date(), 'en') // → '6/25/2025'
 */
export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

/**
 * Format a number as a locale-aware string.
 *
 * @example
 *   formatNumber(1234567.89, 'th') // → '1,234,567.89'
 *   formatNumber(1234567.89, 'en') // → '1,234,567.89'
 */
export function formatNumber(num: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US").format(num);
}
