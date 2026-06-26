/**
 * Shared Zod schemas used across all modules.
 * Import from "@/shared" or "@/shared/schemas" — do not duplicate these.
 */
import { z } from "zod";

/** Valid email address */
export const emailSchema = z.string().email();

/**
 * Reference number format: LP-XXXXXXXX (8 uppercase alphanumeric chars)
 * Example: LP-AB12CD34
 */
export const referenceNumberSchema = z
  .string()
  .regex(/^LP-[A-Z0-9]{8}$/, "Invalid reference number format. Expected LP-XXXXXXXX");

/**
 * Cursor-based pagination input.
 * Defaults: limit = 20.
 * Max limit = 100.
 */
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

/** Supported UI locales */
export const localeSchema = z.enum(["th", "en"]).default("th");

// Inferred types
export type PaginationInput = z.infer<typeof paginationSchema>;
export type Locale = z.infer<typeof localeSchema>;
