import { describe, it, expect } from "vitest";
import fc from "fast-check";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

/**
 * **Validates: Requirements DX-02 (35.1, 35.2)**
 *
 * Property P4: Rate Limit Header Consistency
 * For any sequence of API requests within a rate limit window,
 * `X-RateLimit-Remaining` is always non-negative and equals
 * `X-RateLimit-Limit` minus the number of requests made in the current window.
 * `X-RateLimit-Limit` stays constant across all requests.
 * `X-RateLimit-Reset` is a valid Unix timestamp in the future (or present).
 */

/**
 * Creates a fresh Express app with an in-memory rate limiter.
 * No Redis dependency — uses the default MemoryStore.
 */
function createTestApp(maxRequests: number) {
  const app = express();

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: maxRequests,
    standardHeaders: false,
    legacyHeaders: true,
    handler: (_req, res) => {
      res.status(429).json({ error: "Rate limit exceeded" });
    },
  });

  app.use(limiter);
  app.get("/test", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe("P4: Rate Limit Header Consistency", () => {
  it("X-RateLimit-Remaining is always non-negative and equals limit minus requests made", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Rate limit between 5 and 50
        fc.integer({ min: 5, max: 50 }),
        // Number of requests: 1 to limit (stay within the window)
        fc.integer({ min: 1, max: 50 }),
        async (rateLimit, requestCount) => {
          // Constrain requestCount to not exceed the rate limit
          const numRequests = Math.min(requestCount, rateLimit);
          const app = createTestApp(rateLimit);
          const agent = request(app);

          for (let i = 0; i < numRequests; i++) {
            const res = await agent.get("/test");

            const limit = parseInt(res.headers["x-ratelimit-limit"], 10);
            const remaining = parseInt(res.headers["x-ratelimit-remaining"], 10);
            const reset = parseInt(res.headers["x-ratelimit-reset"], 10);

            // 1. X-RateLimit-Remaining is always non-negative
            expect(remaining).toBeGreaterThanOrEqual(0);

            // 2. X-RateLimit-Remaining equals limit minus requests made so far
            expect(remaining).toBe(rateLimit - (i + 1));

            // 3. X-RateLimit-Limit stays constant and matches configured limit
            expect(limit).toBe(rateLimit);

            // 4. X-RateLimit-Reset is a valid Unix timestamp not in the past
            const nowSeconds = Math.floor(Date.now() / 1000);
            expect(reset).toBeGreaterThanOrEqual(nowSeconds);

            // Should be 200 since we stay within the limit
            expect(res.status).toBe(200);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("X-RateLimit-Limit stays constant across all requests in a sequence", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 30 }),
        fc.integer({ min: 2, max: 30 }),
        async (rateLimit, requestCount) => {
          const numRequests = Math.min(requestCount, rateLimit);
          const app = createTestApp(rateLimit);
          const agent = request(app);

          const limits: number[] = [];

          for (let i = 0; i < numRequests; i++) {
            const res = await agent.get("/test");
            limits.push(parseInt(res.headers["x-ratelimit-limit"], 10));
          }

          // All limit values should be identical
          const uniqueLimits = new Set(limits);
          expect(uniqueLimits.size).toBe(1);
          expect(limits[0]).toBe(rateLimit);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("X-RateLimit-Reset is a valid Unix timestamp in the future", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 40 }),
        fc.integer({ min: 1, max: 10 }),
        async (rateLimit, requestCount) => {
          const numRequests = Math.min(requestCount, rateLimit);
          const app = createTestApp(rateLimit);
          const agent = request(app);

          for (let i = 0; i < numRequests; i++) {
            const beforeRequest = Math.floor(Date.now() / 1000);
            const res = await agent.get("/test");
            const reset = parseInt(res.headers["x-ratelimit-reset"], 10);

            // Reset should be a reasonable Unix timestamp (not NaN, not zero)
            expect(Number.isFinite(reset)).toBe(true);
            expect(reset).toBeGreaterThan(0);

            // Reset should be in the future relative to when we started
            expect(reset).toBeGreaterThanOrEqual(beforeRequest);

            // Reset should be within the window (at most ~60s from now)
            expect(reset).toBeLessThanOrEqual(beforeRequest + 120);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
