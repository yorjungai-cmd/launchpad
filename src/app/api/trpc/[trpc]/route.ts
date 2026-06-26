/**
 * Next.js App Router — tRPC HTTP handler.
 *
 * Mounts the appRouter at /api/trpc/* using the @trpc/server fetch adapter.
 * Supports both GET (queries) and POST (mutations + subscriptions).
 */

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCContext } from "@/server/context";
import { appRouter } from "@/server/root";
import logger from "@/lib/logger";

// Allow long-running mutations (AI analysis via Claude can take 10-30s).
// Vercel caps this at the plan limit (Hobby=10s default→60s max, Pro=300s).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: ({ req }) => createTRPCContext({ headers: req.headers }),
    onError: ({ path, error }) => {
      logger.error({ path, code: error.code, message: error.message }, `tRPC error on '${path}'`);
    },
  });

export { handler as GET, handler as POST };
