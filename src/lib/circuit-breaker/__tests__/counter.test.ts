import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import {
  incrementAndCheck,
  DEFAULT_CONFIG,
} from "../counter.js";
import type { Redis } from "ioredis";

/**
 * Creates a mock Redis instance that simulates INCR with an internal counter map.
 * Each key tracks its own count. `expire` is a no-op.
 */
function createMockRedis(): Redis & { _counters: Map<string, number> } {
  const counters = new Map<string, number>();

  const mock = {
    _counters: counters,
    incr: vi.fn(async (key: string) => {
      const current = counters.get(key) ?? 0;
      const next = current + 1;
      counters.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  } as unknown as Redis & { _counters: Map<string, number> };

  return mock;
}

describe("Feature: runaway-agent-protection — Counter Properties", () => {
  /**
   * **Validates: Requirements 1.3, 2.1, 2.3**
   *
   * Property 3: Threshold boundary enforcement
   *
   * For any positive integer threshold T and any API key ID and payload hash,
   * submitting exactly T identical requests SHALL all be allowed (not blocked),
   * and the (T+1)th identical request SHALL be blocked.
   */
  it("Property 3: Threshold boundary enforcement", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 200 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.stringMatching(/^[0-9a-f]{8,64}$/),
        async (threshold, apiKeyId, payloadHash) => {
          const redis = createMockRedis();

          // First T calls should all be allowed
          for (let i = 1; i <= threshold; i++) {
            const result = await incrementAndCheck(redis, apiKeyId, payloadHash, {
              threshold,
            });
            expect(result.count).toBe(i);
            expect(result.blocked).toBe(false);
          }

          // The (T+1)th call should be blocked
          const blocked = await incrementAndCheck(redis, apiKeyId, payloadHash, {
            threshold,
          });
          expect(blocked.count).toBe(threshold + 1);
          expect(blocked.blocked).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.3**
   *
   * Property 4: Custom configuration is respected
   *
   * For any valid CircuitBreakerConfig with positive threshold and positive windowSeconds,
   * the circuit breaker SHALL use the provided values instead of defaults,
   * such that the blocking boundary matches the custom threshold.
   */
  it("Property 4: Custom configuration is respected", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 3600 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.stringMatching(/^[0-9a-f]{8,64}$/),
        async (threshold, windowSeconds, apiKeyId, payloadHash) => {
          // Ensure custom config differs from defaults to prove it's actually used
          fc.pre(threshold !== DEFAULT_CONFIG.threshold || windowSeconds !== DEFAULT_CONFIG.windowSeconds);

          const redis = createMockRedis();
          const config = { threshold, windowSeconds };

          // Call exactly threshold times — all should pass
          for (let i = 1; i <= threshold; i++) {
            const result = await incrementAndCheck(redis, apiKeyId, payloadHash, config);
            expect(result.blocked).toBe(false);
          }

          // The next call should be blocked at the custom threshold
          const blocked = await incrementAndCheck(redis, apiKeyId, payloadHash, config);
          expect(blocked.blocked).toBe(true);

          // Verify expire was called with the custom windowSeconds (on first INCR)
          expect(redis.expire).toHaveBeenCalledWith(
            `circuit:${apiKeyId}:${payloadHash}`,
            windowSeconds,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});


describe("Unit: Redis counter edge cases", () => {
  /**
   * Requirement 1.4: TTL is set only on first increment (count === 1).
   */
  it("sets TTL via expire only on the first increment", async () => {
    const redis = createMockRedis();

    // First call — count becomes 1, expire should be called
    await incrementAndCheck(redis, "key-1", "hash-a");
    expect(redis.expire).toHaveBeenCalledTimes(1);

    // Second call — count becomes 2, expire should NOT be called again
    await incrementAndCheck(redis, "key-1", "hash-a");
    expect(redis.expire).toHaveBeenCalledTimes(1);

    // Third call — still no additional expire
    await incrementAndCheck(redis, "key-1", "hash-a");
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it("sets TTL with the configured windowSeconds value", async () => {
    const redis = createMockRedis();

    await incrementAndCheck(redis, "key-1", "hash-a", { windowSeconds: 120 });
    expect(redis.expire).toHaveBeenCalledWith("circuit:key-1:hash-a", 120);
  });

  it("sets TTL with default windowSeconds when no config provided", async () => {
    const redis = createMockRedis();

    await incrementAndCheck(redis, "key-1", "hash-a");
    expect(redis.expire).toHaveBeenCalledWith(
      "circuit:key-1:hash-a",
      DEFAULT_CONFIG.windowSeconds,
    );
  });

  /**
   * Requirements 4.1, 4.2: Default config values are threshold=10, windowSeconds=60.
   */
  it("DEFAULT_CONFIG has threshold=10 and windowSeconds=60", () => {
    expect(DEFAULT_CONFIG.threshold).toBe(10);
    expect(DEFAULT_CONFIG.windowSeconds).toBe(60);
  });

  it("uses default threshold when no config is provided", async () => {
    const redis = createMockRedis();

    // Send exactly 10 requests (default threshold) — all allowed
    for (let i = 0; i < 10; i++) {
      const result = await incrementAndCheck(redis, "key-1", "hash-a");
      expect(result.blocked).toBe(false);
    }

    // 11th request should be blocked
    const result = await incrementAndCheck(redis, "key-1", "hash-a");
    expect(result.blocked).toBe(true);
    expect(result.count).toBe(11);
  });

  /**
   * Requirement 1.2: Composite key format matches `circuit:{apiKeyId}:{payloadHash}`.
   */
  it("constructs composite key as circuit:{apiKeyId}:{payloadHash}", async () => {
    const redis = createMockRedis();

    await incrementAndCheck(redis, "my-api-key", "abc123def456");
    expect(redis.incr).toHaveBeenCalledWith("circuit:my-api-key:abc123def456");
  });

  it("uses distinct composite keys for different apiKeyId values", async () => {
    const redis = createMockRedis();

    await incrementAndCheck(redis, "key-A", "same-hash");
    await incrementAndCheck(redis, "key-B", "same-hash");

    expect(redis.incr).toHaveBeenCalledWith("circuit:key-A:same-hash");
    expect(redis.incr).toHaveBeenCalledWith("circuit:key-B:same-hash");
    // Each key should have count 1 (independent counters)
    expect(redis._counters.get("circuit:key-A:same-hash")).toBe(1);
    expect(redis._counters.get("circuit:key-B:same-hash")).toBe(1);
  });

  it("uses distinct composite keys for different payloadHash values", async () => {
    const redis = createMockRedis();

    await incrementAndCheck(redis, "same-key", "hash-1");
    await incrementAndCheck(redis, "same-key", "hash-2");

    expect(redis.incr).toHaveBeenCalledWith("circuit:same-key:hash-1");
    expect(redis.incr).toHaveBeenCalledWith("circuit:same-key:hash-2");
    expect(redis._counters.get("circuit:same-key:hash-1")).toBe(1);
    expect(redis._counters.get("circuit:same-key:hash-2")).toBe(1);
  });
});
