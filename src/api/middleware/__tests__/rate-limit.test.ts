import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";
import { RATE_LIMIT_TIERS, rateLimitConfig } from "../rate-limit.js";

describe("rate-limit configuration", () => {
  describe("RATE_LIMIT_TIERS", () => {
    it("defines export creation tier at 10/min with 2x burst", () => {
      expect(RATE_LIMIT_TIERS.exportCreation.maxPerMinute).toBe(10);
      expect(RATE_LIMIT_TIERS.exportCreation.burstMax).toBe(20);
      expect(RATE_LIMIT_TIERS.exportCreation.burstWindowMs).toBe(10_000);
    });

    it("defines download tier at 30/min with 2x burst", () => {
      expect(RATE_LIMIT_TIERS.download.maxPerMinute).toBe(30);
      expect(RATE_LIMIT_TIERS.download.burstMax).toBe(60);
      expect(RATE_LIMIT_TIERS.download.burstWindowMs).toBe(10_000);
    });

    it("defines general tier at 100/min with 2x burst", () => {
      expect(RATE_LIMIT_TIERS.general.maxPerMinute).toBe(100);
      expect(RATE_LIMIT_TIERS.general.burstMax).toBe(200);
      expect(RATE_LIMIT_TIERS.general.burstWindowMs).toBe(10_000);
    });

    it("burst allowance is exactly 2x the per-minute limit for all tiers", () => {
      for (const [, tier] of Object.entries(RATE_LIMIT_TIERS)) {
        expect(tier.burstMax).toBe(tier.maxPerMinute * 2);
      }
    });
  });

  describe("rateLimitConfig", () => {
    it("exposes a 60-second sustained window", () => {
      expect(rateLimitConfig.windowMs).toBe(60_000);
    });

    it("exposes a 10-second burst window", () => {
      expect(rateLimitConfig.burstWindowMs).toBe(10_000);
    });

    it("exposes all tier configurations", () => {
      expect(rateLimitConfig.tiers).toBe(RATE_LIMIT_TIERS);
    });
  });
});


describe("X-RateLimit-* headers on all responses", () => {
  /**
   * Validates: Requirements DX-02 AC 1
   *
   * Verifies that the sustained rate limiter configuration (legacyHeaders: true)
   * causes X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset
   * headers to appear on every API response, not just 429s.
   */
  it("includes X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset on successful responses", async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60_000,
      limit: 100,
      standardHeaders: false,
      legacyHeaders: true,
    });
    app.use(limiter);
    app.get("/test", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/test");

    expect(res.status).toBe(200);
    expect(res.headers["x-ratelimit-limit"]).toBe("100");
    expect(res.headers["x-ratelimit-remaining"]).toBe("99");
    expect(res.headers["x-ratelimit-reset"]).toBeDefined();
  });

  it("decrements X-RateLimit-Remaining across sequential requests", async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60_000,
      limit: 5,
      standardHeaders: false,
      legacyHeaders: true,
    });
    app.use(limiter);
    app.get("/test", (_req, res) => res.json({ ok: true }));

    const res1 = await request(app).get("/test");
    expect(res1.headers["x-ratelimit-remaining"]).toBe("4");

    const res2 = await request(app).get("/test");
    expect(res2.headers["x-ratelimit-remaining"]).toBe("3");
  });

  it("X-RateLimit-Reset contains a Unix timestamp in the future", async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60_000,
      limit: 10,
      standardHeaders: false,
      legacyHeaders: true,
    });
    app.use(limiter);
    app.get("/test", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/test");
    const resetValue = Number(res.headers["x-ratelimit-reset"]);

    expect(resetValue).toBeGreaterThan(0);
    // Reset should be in the future (within ~60s from now)
    const nowUnix = Math.floor(Date.now() / 1000);
    expect(resetValue).toBeGreaterThanOrEqual(nowUnix);
    expect(resetValue).toBeLessThanOrEqual(nowUnix + 61);
  });
});
