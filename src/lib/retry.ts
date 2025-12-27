/**
 * Retry Utility with Exponential Backoff
 * Handles transient failures with configurable retry attempts
 */

export interface RetryOptions {
  /**
   * Maximum number of retry attempts (default: 3)
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds (default: 1000)
   */
  initialDelay?: number;

  /**
   * Maximum delay in milliseconds (default: 30000)
   */
  maxDelay?: number;

  /**
   * Backoff multiplier (default: 2)
   */
  backoffMultiplier?: number;

  /**
   * Add random jitter to prevent thundering herd (default: true)
   */
  addJitter?: boolean;

  /**
   * Function to determine if an error is retryable (default: all errors retryable)
   */
  isRetryable?: (error: Error) => boolean;

  /**
   * Callback executed before each retry attempt
   */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

/**
 * Default function to check if error is retryable
 */
function defaultIsRetryable(error: Error): boolean {
  // Retry on network errors, timeouts, 5xx errors
  const retryablePatterns = [
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /ENETUNREACH/i,
    /timeout/i,
    /network/i,
    /fetch failed/i,
    /5\d{2}/i, // 5xx HTTP status codes
  ];

  const errorMessage = error.message || "";
  return retryablePatterns.some((pattern) => pattern.test(errorMessage));
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  backoffMultiplier: number,
  maxDelay: number,
  addJitter: boolean
): number {
  // Exponential backoff: initialDelay * (backoffMultiplier ^ attempt)
  const baseDelay = Math.min(
    initialDelay * Math.pow(backoffMultiplier, attempt - 1),
    maxDelay
  );

  // Add jitter (random value between 0% and 25% of delay)
  if (addJitter) {
    const jitter = Math.random() * 0.25 * baseDelay;
    return Math.floor(baseDelay + jitter);
  }

  return baseDelay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 *
 * @example
 * const result = await retry(
 *   async () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 3, initialDelay: 1000 }
 * );
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    addJitter = true,
    isRetryable = defaultIsRetryable,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    try {
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this is the last attempt or error is not retryable, throw immediately
      if (attempt >= maxAttempts || !isRetryable(lastError)) {
        throw lastError;
      }

      // Calculate delay for next retry
      const delay = calculateDelay(
        attempt,
        initialDelay,
        backoffMultiplier,
        maxDelay,
        addJitter
      );

      // Execute onRetry callback if provided
      if (onRetry) {
        onRetry(lastError, attempt, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error("Retry failed");
}

/**
 * Retry wrapper that returns a result object instead of throwing
 * Useful when you want to handle failures gracefully
 *
 * @example
 * const result = await retryWithResult(
 *   async () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 3 }
 * );
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  try {
    const data = await retry(fn, options);
    return {
      success: true,
      data,
      attempts: options.maxAttempts || 3,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      attempts: options.maxAttempts || 3,
    };
  }
}

/**
 * Check if response indicates rate limiting (429)
 * and extract retry-after header if present
 */
export function getRateLimitDelay(response: Response): number | null {
  if (response.status !== 429) {
    return null;
  }

  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) {
    return 60000; // Default to 60 seconds if no header
  }

  // Retry-After can be either seconds or HTTP date
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Parse as HTTP date
  const retryDate = new Date(retryAfter);
  if (!isNaN(retryDate.getTime())) {
    return Math.max(0, retryDate.getTime() - Date.now());
  }

  return 60000; // Fallback
}

/**
 * Retry specifically for fetch requests with rate limit handling
 *
 * @example
 * const response = await retryFetch(
 *   'https://api.example.com/data',
 *   { method: 'GET' },
 *   { maxAttempts: 3 }
 * );
 */
export async function retryFetch(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  return retry(
    async () => {
      const response = await fetch(url, init);

      // Handle rate limiting
      if (response.status === 429) {
        const delay = getRateLimitDelay(response);
        const error = new Error(
          `Rate limited. Retry after ${delay}ms`
        ) as Error & { status: number; retryAfter: number };
        error.status = 429;
        error.retryAfter = delay || 0;
        throw error;
      }

      // Throw on error responses
      if (!response.ok) {
        // Try to read the error body for more details
        let errorDetails = "";
        try {
          const errorBody = await response.json();
          errorDetails = errorBody.message || errorBody.error || JSON.stringify(errorBody);
        } catch {
          // Body not JSON or already consumed
        }

        const error = new Error(
          `HTTP ${response.status}: ${response.statusText}${errorDetails ? ` - ${errorDetails}` : ""}`
        ) as Error & { status: number; response: Response };
        error.status = response.status;
        error.response = response;
        throw error;
      }

      return response;
    },
    {
      ...options,
      isRetryable: (error) => {
        const err = error as Error & { status?: number; retryAfter?: number };

        // Always retry rate limits
        if (err.status === 429) {
          return true;
        }

        // Retry 5xx errors
        if (err.status && err.status >= 500) {
          return true;
        }

        // Use custom isRetryable if provided, otherwise use default
        if (options.isRetryable) {
          return options.isRetryable(error);
        }

        return defaultIsRetryable(error);
      },
      onRetry: (error, attempt, delay) => {
        const err = error as Error & { status?: number; retryAfter?: number };

        // For rate limits, use the retry-after delay
        if (err.status === 429 && err.retryAfter) {
          console.log(
            `[Retry ${attempt}] Rate limited. Waiting ${err.retryAfter}ms before retry...`
          );
        } else {
          console.log(
            `[Retry ${attempt}] ${error.message}. Retrying in ${delay}ms...`
          );
        }

        // Call custom onRetry if provided
        if (options.onRetry) {
          options.onRetry(error, attempt, delay);
        }
      },
    }
  );
}
