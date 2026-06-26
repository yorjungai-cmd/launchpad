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

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: ({ req }) => createTRPCContext({ headers: req.headers }),
    onError:
      process.env["NODE_ENV"] === "development"
        ? ({ path, error }) => {
            logger.error(
              { path, code: error.code, message: error.message },
              `tRPC error on '${path}'`
            );
          }
        : undefined,
  });

export { handler as GET, handler as POST };
