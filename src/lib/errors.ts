/**
 * Custom Error Types for Namerr Application
 * Provides structured error handling with context
 */

/**
 * Base application error with additional context
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    context?: Record<string, unknown>,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.context && { details: this.context }),
    };
  }
}

/**
 * Network-related errors (connection failures, timeouts, etc.)
 */
export class NetworkError extends AppError {
  constructor(
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message, "NETWORK_ERROR", 503, context);
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthError extends AppError {
  constructor(
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message, "AUTH_ERROR", 401, context);
  }
}

/**
 * Authorization errors (user is authenticated but lacks permissions)
 */
export class ForbiddenError extends AppError {
  constructor(
    message: string = "You don't have permission to access this resource",
    context?: Record<string, unknown>
  ) {
    super(message, "FORBIDDEN", 403, context);
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends AppError {
  constructor(
    resource: string,
    identifier?: string,
    context?: Record<string, unknown>
  ) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, "NOT_FOUND", 404, { resource, identifier, ...context });
  }
}

/**
 * Rate limiting errors (429 Too Many Requests)
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(
    message: string = "Rate limit exceeded",
    retryAfter?: number,
    context?: Record<string, unknown>
  ) {
    super(message, "RATE_LIMIT_EXCEEDED", 429, {
      retryAfter,
      ...context,
    });
    this.retryAfter = retryAfter;
  }
}

/**
 * Request timeout errors
 */
export class TimeoutError extends AppError {
  public readonly timeoutMs: number;

  constructor(
    message: string = "Request timeout",
    timeoutMs: number,
    context?: Record<string, unknown>
  ) {
    super(message, "TIMEOUT", 408, { timeoutMs, ...context });
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Validation errors for user input
 */
export class ValidationError extends AppError {
  public readonly fields?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    fields?: Array<{ field: string; message: string }>,
    context?: Record<string, unknown>
  ) {
    super(message, "VALIDATION_ERROR", 400, { fields, ...context });
    this.fields = fields;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.fields && { fields: this.fields }),
      ...(this.context && { details: this.context }),
    };
  }
}

/**
 * Configuration errors (missing or invalid config)
 */
export class ConfigError extends AppError {
  constructor(
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message, "CONFIG_ERROR", 500, context, false);
  }
}

/**
 * Database errors
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message, "DATABASE_ERROR", 500, context);
  }
}

/**
 * External API errors (Seerr, TMDB, etc.)
 */
export class ExternalAPIError extends AppError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(
    service: string,
    message: string,
    statusCode: number = 502,
    originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `${service} API error: ${message}`,
      "EXTERNAL_API_ERROR",
      statusCode,
      { service, ...context }
    );
    this.service = service;
    this.originalError = originalError;
  }
}

/**
 * Worker process errors
 */
export class WorkerError extends AppError {
  public readonly workerId?: string;

  constructor(
    message: string,
    workerId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, "WORKER_ERROR", 500, { workerId, ...context });
    this.workerId = workerId;
  }
}

/**
 * SSH connection errors
 */
export class SSHError extends AppError {
  public readonly hostname?: string;

  constructor(
    message: string,
    hostname?: string,
    context?: Record<string, unknown>
  ) {
    super(message, "SSH_ERROR", 500, { hostname, ...context });
    this.hostname = hostname;
  }
}

/**
 * File system errors
 */
export class FileSystemError extends AppError {
  public readonly path?: string;

  constructor(
    message: string,
    path?: string,
    context?: Record<string, unknown>
  ) {
    super(message, "FILESYSTEM_ERROR", 500, { path, ...context });
    this.path = path;
  }
}

/**
 * Determine if an error is an operational error (expected, can be handled)
 * vs a programmer error (unexpected, should crash)
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert any error to a standardized AppError
 */
export function toAppError(error: unknown): AppError {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // Standard Error
  if (error instanceof Error) {
    // Check for specific error patterns
    const message = error.message.toLowerCase();

    if (
      message.includes("econnrefused") ||
      message.includes("etimedout") ||
      message.includes("enotfound")
    ) {
      return new NetworkError(error.message, { originalError: error.message });
    }

    if (message.includes("unauthorized") || message.includes("authentication")) {
      return new AuthError(error.message, { originalError: error.message });
    }

    if (message.includes("timeout")) {
      return new TimeoutError(error.message, 30000, { originalError: error.message });
    }

    if (message.includes("not found")) {
      return new NotFoundError("Resource", undefined, { originalError: error.message });
    }

    // Generic error
    return new AppError(
      error.message,
      "INTERNAL_ERROR",
      500,
      { originalError: error.message },
      false
    );
  }

  // Unknown error type
  return new AppError(
    String(error),
    "UNKNOWN_ERROR",
    500,
    { originalError: String(error) },
    false
  );
}

/**
 * Error logger utility
 */
export function logError(error: Error | AppError, context?: Record<string, unknown>) {
  if (error instanceof AppError) {
    console.error(`[${error.code}] ${error.message}`, {
      statusCode: error.statusCode,
      context: { ...error.context, ...context },
      stack: error.stack,
    });
  } else {
    console.error(`[ERROR] ${error.message}`, {
      context,
      stack: error.stack,
    });
  }
}

/**
 * Create a standardized error response for API routes
 */
export function errorResponse(error: unknown, fallbackMessage?: string) {
  const appError = toAppError(error);

  // Log the error
  logError(appError);

  // Return JSON response
  return {
    json: appError.toJSON(),
    status: appError.statusCode,
  };
}
