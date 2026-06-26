import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS class names without conflicts.
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 *
 * Usage:
 * ```ts
 * cn("px-4 py-2", isActive && "bg-primary text-primary-foreground")
 * // → "px-4 py-2 bg-primary text-primary-foreground" (or without active classes)
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
