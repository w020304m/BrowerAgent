/**
 * Retry utility with exponential backoff and jitter.
 *
 * Retries transient HTTP errors (429, 502, 503, 504) and network errors.
 * AbortError is never retried. Respects Retry-After response headers.
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Base delay in milliseconds (default: 1000) */
  baseDelay?: number
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
}

/** HTTP status codes that are considered transient and retryable */
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504])

/**
 * Determine if an error/request result should be retried.
 */
function isRetryableError(error: unknown): boolean {
  // Never retry AbortError
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false
  }

  if (error instanceof Response) {
    return RETRYABLE_STATUS_CODES.has(error.status)
  }

  // Network errors, timeouts, etc.
  if (error instanceof TypeError) {
    return true
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('port disconnected')
    )
  }

  return false
}

/**
 * Extract Retry-After delay from a response, in milliseconds.
 * Returns undefined if no valid Retry-After header is found.
 */
function getRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after')
  if (!header) return undefined

  // Try parsing as seconds
  const seconds = Number(header)
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1000
  }

  // Try parsing as HTTP date
  const date = new Date(header)
  if (!isNaN(date.getTime())) {
    const diff = date.getTime() - Date.now()
    return diff > 0 ? diff : undefined
  }

  return undefined
}

/**
 * Calculate delay with exponential backoff and jitter.
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt)
  // Add random jitter (0-50% of the delay)
  const jitter = exponentialDelay * Math.random() * 0.5
  return Math.min(exponentialDelay + jitter, maxDelay)
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute a function with automatic retry on transient errors.
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```ts
 * const response = await withRetry(() => fetch(url, init), { maxRetries: 3 })
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: RetryConfig
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay } = { ...DEFAULT_CONFIG, ...config }

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn()

      // If the function returns a Response with a retryable status, treat as error
      if (result instanceof Response && RETRYABLE_STATUS_CODES.has(result.status)) {
        lastError = result

        if (attempt < maxRetries) {
          const retryAfter = getRetryAfterMs(result)
          const delay = retryAfter ?? calculateDelay(attempt, baseDelay, maxDelay)
          await sleep(delay)
          continue
        }
      }

      return result
    } catch (error) {
      lastError = error

      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        throw error
      }

      // If this was the last attempt, throw
      if (attempt >= maxRetries) {
        throw error
      }

      // If error is a Response with Retry-After, respect it
      let delay = calculateDelay(attempt, baseDelay, maxDelay)
      if (error instanceof Response) {
        const retryAfter = getRetryAfterMs(error)
        if (retryAfter !== undefined) {
          delay = retryAfter
        }
      }

      await sleep(delay)
    }
  }

  // This should not be reached, but just in case
  throw lastError
}
