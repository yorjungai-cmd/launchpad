/**
 * tRPC errorFormatter — maps AppError → typed client error shape.
 *
 * Integration (task 6.1 — server/trpc.ts):
 * ```ts
 * import { formatTRPCError } from '@/lib/errors/trpc-formatter';
 *
 * export const t = initTRPC.context<Context>().create({
 *   transformer: superjson,
 *   errorFormatter: formatTRPCError,
 * });
 * ```
 *
 * NOTE: tRPC is installed in task 6.1. Until then the types are declared locally
 * so this file compiles without the @trpc/server peer dependency.
 */

import { AppError } from "./AppError";
import { ErrorCode } from "./codes";

// ── Local type aliases (replaced by real tRPC types once @trpc/server is added) ──

interface TRPCErrorData {
  code: string;
  httpStatus: number;
  path: string | undefined;
  stack: string | undefined;
  [key: string]: unknown;
}

interface TRPCErrorShape {
  message: string;
  code: number;
  data: TRPCErrorData;
  [key: string]: unknown;
}

interface FormatterArgs {
  shape: TRPCErrorShape;
  error: Error & { cause?: unknown };
  type: string;
  path: string | undefined;
  input: unknown;
  ctx: unknown;
}

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * The typed error shape forwarded to every tRPC client.
 * This is a plain-JSON value — no class instances cross the wire.
 */
export interface TRPCClientErrorShape {
  code: ErrorCode;
  message: string;
  statusCode: number;
  metadata?: unknown;
}

export type FormattedTRPCError = TRPCErrorShape & {
  data: TRPCErrorData & { appError: TRPCClientErrorShape };
};

// ── Formatter ─────────────────────────────────────────────────────────────────

/**
 * tRPC `errorFormatter` callback.
 *
 * - AppError instances: code/message/statusCode/metadata are forwarded as-is.
 * - Any other error: code is set to INTERNAL_SERVER_ERROR, message from the
 *   tRPC shape (avoids leaking internal details in production).
 */
export function formatTRPCError(args: FormatterArgs): FormattedTRPCError {
  const { shape, error } = args;

  // Walk the cause chain looking for an AppError
  const appError = findAppError(error);

  const clientError: TRPCClientErrorShape = appError
    ? {
        code: appError.code,
        message: appError.message,
        statusCode: appError.statusCode,
        metadata: appError.metadata,
      }
    : {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: shape.message,
        statusCode: 500,
      };

  return {
    ...shape,
    data: {
      ...shape.data,
      appError: clientError,
    },
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function findAppError(err: unknown, visited = new Set<unknown>()): AppError | null {
  if (err instanceof AppError) return err;

  if (!err || typeof err !== "object") return null;

  // Guard against circular cause chains
  if (visited.has(err)) return null;
  visited.add(err);

  // tRPC wraps the original error in `cause`
  if ("cause" in err) {
    return findAppError((err as { cause: unknown }).cause, visited);
  }

  return null;
}
