import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../../queue/connection.js";
import type { AuthenticatedRequest } from "../../types/index.js";
import type { RedisReply } from "rate-limit-redis";
import type { Request, Response, NextFunction } from "express";

/**
 * Rate limit configuration per endpoint category.
 *
 * Each category defines:
 * - `maxPerMinute`: sustained rate limit per 1-minute window
 * - `burstMax`: burst allowance (2x per-minute) within a 10-second window
 */
export const RATE_LIMIT_TIERS = {
  /** Export creation (POST /api/jobs): 10/min, burst 20/10s */
  exportCreation: { maxPerMinute: 10, burstMax: 20, burstWindowMs: 10_000 },
  /** File downloads (GET /api/jobs/:id/download): 30/min, burst 60/10s */
  download: { maxPerMinute: 30, burstMax: 60, burstWindowMs: 10_000 },
  /** All other endpoints: 100/min, burst 200/10s */
  general: { maxPerMinute: 100, burstMax: 200, burstWindowMs: 10_000 },
} as const;

/** Window size in milliseconds: 1 minute (for sustained rate limits). */
const WINDOW_MS = 60_000;

/** Burst window size in milliseconds: 10 seconds. */
const BURST_WINDOW_MS = 10_000;

/**
 * Helper function to send commands to Redis for rate limiting.
 */
async function sendRedisCommand(...args: string[]): Promise<RedisReply> {
  const result = await redis.call(args[0], ...args.slice(1));
  return result as RedisReply;
}

/**
 * Custom 429 handler that includes rate limit headers per SEC-05 / DX-02.
 *
 * Headers set on 429 responses:
 * - `Retry-After`: seconds until the rate limit resets
 * - `X-RateLimit-Limit`: the rate limit ceiling for this endpoint
 * - `X-RateLimit-Remaining`: remaining requests in the current window
 * - `X-RateLimit-Reset`: Unix timestamp (seconds) when the window resets
 *
 * @param windowMs - The rate limit window in milliseconds
 */
function make429Handler(windowMs: number) {
  return (req: Request, res: Response, _next: NextFunction, _options: { statusCode: number; message: unknown }): void => {
    // express-rate-limit v7 attaches rateLimit info to the request
    const rl = (req as AuthenticatedRequest & { rateLimit?: { limit: number; used: number; remaining: number; resetTime?: Date } }).rateLimit;

    const limit = rl?.limit ?? 0;
    const remaining = rl?.remaining ?? 0;
    const resetTime = rl?.resetTime;
    const resetUnix = resetTime
      ? Math.ceil(resetTime.getTime() / 1000)
      : Math.ceil((Date.now() + windowMs) / 1000);
    const retryAfterSeconds = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(windowMs / 1000);

    res.set("Retry-After", String(retryAfterSeconds));
    res.set("X-RateLimit-Limit", String(limit));
    res.set("X-RateLimit-Remaining", String(remaining));
    res.set("X-RateLimit-Reset", String(resetUnix));

    res.status(429).json({
      error: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: retryAfterSeconds,
      message: `Too many requests. Please try again after ${retryAfterSeconds} seconds.`,
    });
  };
}

/**
 * Generate a rate limit key based on API key ID or IP address.
 *
 * @param prefix - Key prefix to namespace different rate limit tiers
 * @returns Key generator function for express-rate-limit
 */
function makeKeyGenerator(prefix: string) {
  return (req: Request): string => {
    const authReq = req as AuthenticatedRequest;
    const key = authReq.apiKey?.id ?? req.ip ?? "unknown";
    return `ratelimit:${prefix}:${key}`;
  };
}

/**
 * Creates a pair of rate limiters for a given endpoint category:
 * 1. A sustained rate limiter (per-minute window)
 * 2. A burst rate limiter (10-second window at 2x the per-minute limit)
 *
 * Both limiters must pass for a request to proceed. The burst limiter
 * prevents short spikes from overwhelming the system, while the sustained
 * limiter enforces the overall per-minute budget.
 *
 * The sustained limiter sends `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
 * and `X-RateLimit-Reset` headers on every response (via `legacyHeaders: true`).
 * The burst limiter suppresses these headers to avoid conflicting values.
 *
 * @param tier - Rate limit tier configuration
 * @param prefix - Redis key prefix for namespacing
 * @returns Array of two middleware functions [sustainedLimiter, burstLimiter]
 */
function createRateLimiterPair(
  tier: { maxPerMinute: number; burstMax: number; burstWindowMs: number },
  prefix: string,
) {
  const sustainedLimiter = rateLimit({
    windowMs: WINDOW_MS,
    limit: tier.maxPerMinute,
    standardHeaders: false,
    legacyHeaders: true,
    store: new RedisStore({
      sendCommand: sendRedisCommand,
      prefix: `rl:sustained:${prefix}:`,
    }),
    keyGenerator: makeKeyGenerator(`sustained:${prefix}`),
    skip: (req: Request): boolean =>
      req.path === "/health" || req.path === "/healthz",
    handler: make429Handler(WINDOW_MS),
  });

  const burstLimiter = rateLimit({
    windowMs: tier.burstWindowMs,
    limit: tier.burstMax,
    standardHeaders: false,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: sendRedisCommand,
      prefix: `rl:burst:${prefix}:`,
    }),
    keyGenerator: makeKeyGenerator(`burst:${prefix}`),
    skip: (req: Request): boolean =>
      req.path === "/health" || req.path === "/healthz",
    handler: make429Handler(tier.burstWindowMs),
  });

  return [sustainedLimiter, burstLimiter] as const;
}

// ─── Per-Endpoint Rate Limiters ──────────────────────────────────────────────

/**
 * Rate limiter for export creation (POST /api/jobs).
 * Sustained: 10 requests per minute.
 * Burst: 20 requests per 10-second window.
 */
export const [exportCreationLimiter, exportCreationBurstLimiter] =
  createRateLimiterPair(RATE_LIMIT_TIERS.exportCreation, "export");

/**
 * Rate limiter for file downloads (GET /api/jobs/:id/download).
 * Sustained: 30 requests per minute.
 * Burst: 60 requests per 10-second window.
 */
export const [downloadLimiter, downloadBurstLimiter] =
  createRateLimiterPair(RATE_LIMIT_TIERS.download, "download");

/**
 * Rate limiter for all other API endpoints.
 * Sustained: 100 requests per minute.
 * Burst: 200 requests per 10-second window.
 */
export const [generalLimiter, generalBurstLimiter] =
  createRateLimiterPair(RATE_LIMIT_TIERS.general, "general");

// ─── Legacy Exports (backward compatibility) ─────────────────────────────────

/**
 * Default API rate limiter — applies the general tier (100/min).
 * Kept for backward compatibility with existing route imports.
 *
 * @deprecated Use the specific per-endpoint limiters instead.
 */
export const apiRateLimiter = generalLimiter;

/**
 * Strict rate limiter for sensitive endpoints.
 * Uses the export creation tier (10/min) for operations like key deletion.
 *
 * @deprecated Use the specific per-endpoint limiters instead.
 */
export const strictRateLimiter = exportCreationLimiter;

/**
 * Export rate limit configuration for testing.
 */
export const rateLimitConfig = {
  windowMs: WINDOW_MS,
  burstWindowMs: BURST_WINDOW_MS,
  tiers: RATE_LIMIT_TIERS,
};

export default apiRateLimiter;
