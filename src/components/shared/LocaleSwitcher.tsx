"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface LocaleSwitcherProps {
  className?: string;
}

/**
 * LocaleSwitcher — toggles between Thai ('th') and English ('en') locales.
 *
 * Uses next-intl's `useLocale` for the current locale and Next.js router
 * to swap the locale prefix in the current path.
 *
 * Example: /th/dashboard → /en/dashboard
 */
export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const targetLocale = locale === "th" ? "en" : "th";
  const targetLabel = locale === "th" ? "EN" : "TH";
  const ariaLabel = locale === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย";

  function handleSwitch() {
    // Replace the current locale prefix in the pathname
    // e.g. /th/dashboard → /en/dashboard
    const newPath = pathname.replace(/^\/[a-z]{2}(\/|$)/, `/${targetLocale}$1`);
    router.replace(newPath);
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex min-h-8 items-center justify-center rounded-md border border-input",
        "bg-background px-3 py-1 text-sm font-medium text-foreground",
        "transition-colors hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      {targetLabel}
    </button>
  );
}

export default LocaleSwitcher;
