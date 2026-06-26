/**
 * Branded types for domain identifiers.
 * Prevents accidental mixing of raw strings with typed IDs at compile time.
 *
 * Usage:
 *   const id = userId as UserId;
 *   const ref = referenceNumber as ReferenceNumber;
 */

/** Branded string for Supabase auth user IDs (UUID) */
export type UserId = string & { readonly __brand: "UserId" };

/** Branded string for idea reference numbers (format: LP-XXXXXXXX) */
export type ReferenceNumber = string & { readonly __brand: "ReferenceNumber" };
