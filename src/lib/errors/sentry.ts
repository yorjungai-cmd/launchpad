/**
 * Sentry integration for production error tracking.
 *
 * Call `initSentry()` once from `instrumentation.ts` (Next.js 14 App Router).
 * Use `captureException()` anywhere in server or client code.
 */

import * as Sentry from "@sentry/nextjs";

export interface SentryContext {
  /** Authenticated user id if available */
  userId?: string;
  /** tRPC procedure path or route identifier */
  path?: string;
  /** Arbitrary key-value pairs added to the Sentry event */
  extra?: Record<string, unknown>;
}

/**
 * Initialize Sentry. Safe to call in any environment — in non-production
 * environments the DSN will be absent and Sentry will be a no-op.
 */
export function initSentry(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    // Sentry is optional outside production
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 0,
    debug: false,
  });
}

/**
 * Capture an exception and attach optional context.
 * Fire-and-forget — never awaited so it never blocks the response path.
 */
export function captureException(err: unknown, context?: SentryContext): void {
  Sentry.withScope((scope) => {
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }
    if (context?.path) {
      scope.setTag("path", context.path);
    }
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureException(err);
  });
}
