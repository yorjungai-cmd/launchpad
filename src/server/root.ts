/**
 * Root tRPC router — composes all module routers into a single appRouter.
 *
 * Import the `AppRouter` type in:
 *   - src/lib/trpc/client.ts (createTRPCReact<AppRouter>)
 *   - src/app/api/trpc/[trpc]/route.ts (fetchRequestHandler)
 *   - tests (createCallerFactory)
 */

import { router } from "./trpc";
import { healthRouter } from "@/modules/health/router";
import { authRouter } from "@/modules/auth/router";
import { profileRouter } from "@/modules/profile/router";
import { ideaRouter } from "@/modules/idea-submission/router";
import { analysisRouter } from "@/modules/ai-analysis/router";
import { documentRouter } from "@/modules/document-generation/router";
import { reviewRouter } from "@/modules/review-workflow/router";
import { pipelineRouter } from "@/modules/pipeline/router";
import { notificationRouter } from "@/modules/notification/router";
import { dashboardRouter } from "@/modules/dashboard-analytics/router";
import { adminRouter } from "@/modules/admin-ai-config/router";

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  profile: profileRouter,
  idea: ideaRouter,
  analysis: analysisRouter,
  document: documentRouter,
  review: reviewRouter,
  pipeline: pipelineRouter,
  notification: notificationRouter,
  dashboard: dashboardRouter,
  admin: adminRouter,
});

/** Inferred type for the full API — use on client side */
export type AppRouter = typeof appRouter;
