import { ErrorCode } from "./codes";

/**
 * Typed application error that carries a machine-readable code, an HTTP status,
 * and optional structured metadata. All server-side errors should be represented
 * as AppError so they can be forwarded to the client via the tRPC errorFormatter
 * with no information loss.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;

    // Maintain proper prototype chain in environments that transpile classes
    Object.setPrototypeOf(this, new.target.prototype);
  }

  // ── Convenience factories ────────────────────────────────────────────────

  static notFound(message = "Resource not found", metadata?: Record<string, unknown>): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, 404, metadata);
  }

  static unauthorized(message = "Unauthorized", metadata?: Record<string, unknown>): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message, 401, metadata);
  }

  static forbidden(message = "Forbidden", metadata?: Record<string, unknown>): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, 403, metadata);
  }

  static validation(message = "Validation error", metadata?: Record<string, unknown>): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 422, metadata);
  }

  static conflict(message = "Conflict", metadata?: Record<string, unknown>): AppError {
    return new AppError(ErrorCode.CONFLICT, message, 409, metadata);
  }

  static internal(message = "Internal server error", metadata?: Record<string, unknown>): AppError {
    return new AppError(ErrorCode.INTERNAL_SERVER_ERROR, message, 500, metadata);
  }

  static rateLimitExceeded(
    message = "Rate limit exceeded",
    metadata?: Record<string, unknown>
  ): AppError {
    return new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429, metadata);
  }

  static analysisNotFound(
    message = "Analysis not found",
    metadata?: Record<string, unknown>
  ): AppError {
    return new AppError(ErrorCode.ANALYSIS_NOT_FOUND, message, 404, metadata);
  }

  static analysisNotCompleted(
    message = "Analysis is not completed",
    metadata?: Record<string, unknown>
  ): AppError {
    return new AppError(ErrorCode.ANALYSIS_NOT_COMPLETED, message, 409, metadata);
  }

  static analysisInProgress(
    message = "Analysis is already in progress",
    metadata?: Record<string, unknown>
  ): AppError {
    return new AppError(ErrorCode.ANALYSIS_IN_PROGRESS, message, 409, metadata);
  }

  static invalidScoreRange(
    message = "Score must be between 1 and 5",
    metadata?: Record<string, unknown>
  ): AppError {
    return new AppError(ErrorCode.INVALID_SCORE_RANGE, message, 422, metadata);
  }
}
