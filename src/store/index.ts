/**
 * Zustand global UI store.
 *
 * Holds lightweight client-side UI state that does NOT belong in the server
 * or in TanStack Query (which owns server state).
 *
 * Current slices:
 *   - locale: user's preferred UI locale (TH/EN) — synced from profile.updateLocale
 *
 * @example
 * ```ts
 * import { useUIStore } from '@/store';
 *
 * function LocaleSwitcher() {
 *   const { locale, setLocale } = useUIStore();
 *   return <button onClick={() => setLocale('en')}>{locale}</button>;
 * }
 * ```
 */

import { create } from "zustand";
import type { Locale } from "@/shared/schemas/common";

// ─── State shape ──────────────────────────────────────────────────────────────

interface UIState {
  /** Current UI locale */
  locale: Locale;
  /** Update the locale (also used by LocaleSwitcher after profile.updateLocale) */
  setLocale: (locale: Locale) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>((set) => ({
  locale: "th",
  setLocale: (locale) => set({ locale }),
}));
