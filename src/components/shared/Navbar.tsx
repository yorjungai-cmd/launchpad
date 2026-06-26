"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./LocaleSwitcher";

interface NavLink {
  href: string;
  label: string;
}

interface NavbarProps {
  className?: string;
}

/**
 * Navbar — sticky top navigation bar for the LaunchPad Portal.
 *
 * Features:
 * - AppliCAD brand logo and product name
 * - Locale-aware navigation links
 * - LocaleSwitcher (TH ↔ EN)
 * - Responsive: full nav on md+, hamburger menu on mobile
 * - skip-to-content link target (`#main-content`) is in the parent layout
 */
export function Navbar({ className }: NavbarProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Navigation links — locale-prefixed
  const navLinks: NavLink[] = [
    { href: `/${locale}`, label: locale === "th" ? "หน้าหลัก" : "Home" },
    {
      href: `/${locale}/ideas`,
      label: locale === "th" ? "ไอเดีย" : "Ideas",
    },
    {
      href: `/${locale}/dashboard`,
      label: locale === "th" ? "แดชบอร์ด" : "Dashboard",
    },
  ];

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        {/* Brand */}
        <Link
          href={`/${locale}`}
          className="flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="AppliCAD LaunchPad Portal — Home"
        >
          {/* AppliCAD brand mark */}
          <div
            className="flex size-8 items-center justify-center rounded bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <span className="text-xs font-bold leading-none">LP</span>
          </div>
          <span className="hidden font-semibold text-foreground sm:block">LaunchPad</span>
        </Link>

        {/* Desktop nav links */}
        <ul className="hidden items-center gap-1 md:flex" role="list">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive(link.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}
                aria-current={isActive(link.href) ? "page" : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right side: LocaleSwitcher + mobile toggle */}
        <div className="flex items-center gap-2">
          <LocaleSwitcher />

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            className={cn(
              "inline-flex items-center justify-center rounded-md p-2 text-muted-foreground md:hidden",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          role="navigation"
          aria-label="Mobile navigation"
          className="border-t border-border bg-background md:hidden"
        >
          <ul className="space-y-1 px-4 py-3" role="list">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    isActive(link.href)
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground"
                  )}
                  aria-current={isActive(link.href) ? "page" : undefined}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}

export default Navbar;
