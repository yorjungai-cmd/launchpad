/**
 * next-intl request configuration (App Router).
 *
 * Called on each request to provide locale-specific messages.
 * Must reside at src/i18n/request.ts (next-intl convention for v4).
 */
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, locales, type Locale } from "@/lib/i18n/config";

export default getRequestConfig(async ({ requestLocale }) => {
  // Resolve the locale from the segment (provided by middleware)
  let locale = await requestLocale;

  // Validate — fall back to default if locale is missing or unknown
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    // Dynamically import the correct message catalog
    messages: (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>,
  };
});
