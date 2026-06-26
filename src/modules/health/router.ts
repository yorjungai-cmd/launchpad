/**
 * Health module — tRPC router.
 *
 * Procedures:
 *   health.check — publicProcedure → { status: 'ok', timestamp: ISO string }
 */

import { z } from "zod";
import { router, publicProcedure } from "@/server/trpc";

export const healthRouter = router({
  /**
   * Simple liveness check.
   * Returns HTTP 200 + { status: 'ok', timestamp } when the server is reachable.
   */
  check: publicProcedure
    .output(
      z.object({
        status: z.literal("ok"),
        timestamp: z.string(),
      })
    )
    .query(() => {
      return {
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      };
    }),
});
