/**
 * Server-side translation helpers.
 *
 * Use in Server Components, Route Handlers, and tRPC procedures.
 * Do NOT import in client components — use client.ts instead.
 */
import { getTranslations } from "next-intl/server";

import type { Locale } from "./config";

/**
 * Returns a typed translation function for the given locale and optional namespace.
 *
 * @example
 *   const t = await getServerTranslations('th', 'common');
 *   t('loading') // → 'กำลังโหลด...'
 */
export async function getServerTranslations(locale: Locale, namespace?: string) {
  return getTranslations({ locale, namespace });
}
