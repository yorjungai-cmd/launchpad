import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Root Pino logger.
 *
 * - Level:      'debug' in development, 'info' in production
 * - Formatters: level is output as a human-readable string
 * - Redact:     secrets are never logged (passwords, tokens, api keys, auth headers)
 * - Base:       includes the runtime environment in every log entry
 */
const logger = pino({
  level: isDev ? "debug" : "info",

  formatters: {
    level(label) {
      return { level: label };
    },
  },

  redact: {
    paths: [
      "password",
      "apiKey",
      "token",
      "authorization",
      "*.password",
      "*.apiKey",
      "*.token",
      "*.authorization",
    ],
    censor: "[REDACTED]",
  },

  base: {
    env: process.env.NODE_ENV ?? "development",
  },

  // Pretty-print only during local development (not supported on edge runtime)
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    },
  }),
});

/**
 * Creates a child logger scoped to a single request / correlation id.
 *
 * Usage (server component / route handler):
 * ```ts
 * const log = requestLogger(requestId);
 * log.info({ userId }, 'Processing submission');
 * ```
 */
export function requestLogger(requestId?: string) {
  return logger.child({ requestId: requestId ?? "unknown" });
}

export default logger;
