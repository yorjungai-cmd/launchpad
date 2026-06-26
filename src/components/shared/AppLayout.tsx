import * as React from "react";

import { ThemeProvider } from "./ThemeProvider";
import { Navbar } from "./Navbar";
import { ToastProvider } from "./ToastProvider";

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * AppLayout — top-level layout wrapper for authenticated pages.
 *
 * Hierarchy: ThemeProvider → Navbar → <main #main-content> → ToastProvider
 *
 * The skip-to-content link is rendered in `src/app/[locale]/layout.tsx`
 * and points to `#main-content` on this main element.
 *
 * Usage in `src/app/[locale]/(app)/layout.tsx`:
 * ```tsx
 * import { AppLayout } from '@/components/shared';
 *
 * export default function AppGroupLayout({ children }) {
 *   return <AppLayout>{children}</AppLayout>;
 * }
 * ```
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <ThemeProvider defaultTheme="light">
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main id="main-content" className="flex-1 focus:outline-none" tabIndex={-1}>
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
      <ToastProvider />
    </ThemeProvider>
  );
}

export default AppLayout;
