import type { Redis } from "ioredis";

export interface CircuitBreakerConfig {
  /** Max identical-payload requests before tripping. Default: 10 */
  threshold: number;
  /** Window duration in seconds. Default: 60 */
  windowSeconds: number;
}

export const DEFAULT_CONFIG: CircuitBreakerConfig = {
  threshold: 10,
  windowSeconds: 60,
};

export interface CounterResult {
  /** Current count after increment */
  count: number;
  /** Whether the threshold has been exceeded */
  blocked: boolean;
}

/**
 * Atomically increments the counter for the given composite key.
 * Sets TTL on first increment (count === 1).
 * Returns the current count and whether the request should be blocked.
 *
 * @param redis - ioredis client instance
 * @param apiKeyId - The authenticated API key ID
 * @param payloadHash - SHA-256 hex digest of the payload
 * @param config - Threshold and window configuration
 * @returns CounterResult with count and blocked status
 */
export async function incrementAndCheck(
  redis: Redis,
  apiKeyId: string,
  payloadHash: string,
  config?: Partial<CircuitBreakerConfig>,
): Promise<CounterResult> {
  const { threshold, windowSeconds } = { ...DEFAULT_CONFIG, ...config };
  const key = `circuit:${apiKeyId}:${payloadHash}`;

  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  return {
    count,
    blocked: count > threshold,
  };
}
