/**
 * Reference number generation.
 *
 * Format: LP-{8 uppercase alphanumeric characters}
 * Example: LP-AB12CD34
 *
 * Generated values satisfy `referenceNumberSchema` from @/shared/schemas/common.
 */

import type { ReferenceNumber } from "@/shared/types";

/** Characters used in the random segment (uppercase alphanumeric) */
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" as const;
const SEGMENT_LENGTH = 8;

/**
 * Generates a cryptographically random reference number.
 *
 * Uses `crypto.getRandomValues` (available in Node ≥ 19 globals and all modern
 * browsers) to pick 8 characters from CHARSET.  The resulting string always
 * matches /^LP-[A-Z0-9]{8}$/.
 *
 * @returns A branded `ReferenceNumber` value, e.g. "LP-A3BX9KQZ"
 */
export function generateReferenceNumber(): ReferenceNumber {
  const bytes = new Uint8Array(SEGMENT_LENGTH);
  crypto.getRandomValues(bytes);

  const segment = Array.from(bytes)
    .map((b) => CHARSET[b % CHARSET.length])
    .join("");

  return `LP-${segment}` as ReferenceNumber;
}
