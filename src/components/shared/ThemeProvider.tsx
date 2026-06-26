"use client";

import * as React from "react";

interface ThemeProviderProps {
  children: React.ReactNode;
  /**
   * Initial theme. Currently only "light" is supported.
   * Dark mode can be added by toggling the "dark" class on <html>.
   * @default "light"
   */
  defaultTheme?: "light" | "dark" | "system";
}

/**
 * ThemeProvider — placeholder for theme context.
 *
 * Currently supports light mode only. Extendable to full dark-mode support
 * by adding a `useTheme` hook that toggles the `dark` class on `<html>`.
 *
 * This component is intentionally minimal for Phase 9; full dark-mode
 * toggle will be wired in a future phase.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  // Light mode only — renders children as-is.
  // Future: read system preference, persist to localStorage, provide context.
  return <>{children}</>;
}

export default ThemeProvider;
