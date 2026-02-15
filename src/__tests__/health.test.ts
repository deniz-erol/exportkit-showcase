/**
 * Integration Tests: GET /health
 *
 * Detailed tests for the health check endpoint covering response format,
 * status codes, dependency states, and partial failure scenarios.
 * The smoke test covers basic 200/503; these tests go deeper.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Application } from "express";
import { createTestApp, resetAllMocks, mocks } from "./setup.js";

let app: Application;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  resetAllMocks();
});

describe("GET /health", () => {
  describe("response format", () => {
    it("includes all expected top-level fields", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("uptime");
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body).toHaveProperty("version");
      expect(res.body).toHaveProperty("dependencies");
    });

    it("returns application/json content type", async () => {
      const res = await request(app).get("/health");

      expect(res.headers["content-type"]).toMatch(/application\/json/);
    });

    it("includes postgres, redis, and r2 in dependencies", async () => {
      const res = await request(app).get("/health");

      expect(res.body.dependencies).toHaveProperty("postgres");
      expect(res.body.dependencies).toHaveProperty("redis");
      expect(res.body.dependencies).toHaveProperty("r2");
    });

    it("each dependency has status and latencyMs fields", async () => {
      const res = await request(app).get("/health");

      for (const dep of ["postgres", "redis", "r2"]) {
        expect(res.body.dependencies[dep]).toHaveProperty("status");
        expect(res.body.dependencies[dep]).toHaveProperty("latencyMs");
        expect(typeof res.body.dependencies[dep].status).toBe("string");
        expect(typeof res.body.dependencies[dep].latencyMs).toBe("number");
      }
    });

    it("uptime is a positive number", async () => {
      const res = await request(app).get("/health");

      expect(typeof res.body.uptime).toBe("number");
      expect(res.body.uptime).toBeGreaterThan(0);
    });

    it("timestamp is a valid epoch number", async () => {
      const before = Date.now();
      const res = await request(app).get("/health");
      const after = Date.now();

      expect(typeof res.body.timestamp).toBe("number");
      expect(res.body.timestamp).toBeGreaterThanOrEqual(before - 1000);
      expect(res.body.timestamp).toBeLessThanOrEqual(after + 1000);
    });

    it("version is a non-empty string", async () => {
      const res = await request(app).get("/health");

      expect(typeof res.body.version).toBe("string");
      expect(res.body.version.length).toBeGreaterThan(0);
    });
  });

  describe("status codes", () => {
    it("returns 200 when all dependencies are healthy", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("returns 503 when any dependency is unhealthy", async () => {
      mocks.healthService.checkHealth.mockResolvedValueOnce({
        status: "unhealthy",
        uptime: 50,
        timestamp: Date.now(),
        version: "0.1.0",
        dependencies: {
          postgres: { status: "unhealthy", latencyMs: 0, error: "Connection refused" },
          redis: { status: "healthy", latencyMs: 2 },
          r2: { status: "healthy", latencyMs: 10 },
        },
      });

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
    });

    it("returns 503 when health check throws an error", async () => {
      mocks.healthService.checkHealth.mockRejectedValueOnce(
        new Error("Health check timed out"),
      );

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
      expect(res.body.dependencies).toBeDefined();
    });
  });

  describe("no auth required", () => {
    it("responds without X-API-Key header", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("responds the same with an arbitrary header", async () => {
      const res = await request(app)
        .get("/health")
        .set("X-API-Key", "some-random-key");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });
  });

  describe("partial dependency failures", () => {
    it("reports postgres down while redis and r2 are up", async () => {
      mocks.healthService.checkHealth.mockResolvedValueOnce({
        status: "unhealthy",
        uptime: 200,
        timestamp: Date.now(),
        version: "0.1.0",
        dependencies: {
          postgres: { status: "unhealthy", latencyMs: 0, error: "Connection refused" },
          redis: { status: "healthy", latencyMs: 3 },
          r2: { status: "healthy", latencyMs: 8 },
        },
      });

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
      expect(res.body.dependencies.postgres.status).toBe("unhealthy");
      expect(res.body.dependencies.postgres.error).toBe("Connection refused");
      expect(res.body.dependencies.redis.status).toBe("healthy");
      expect(res.body.dependencies.r2.status).toBe("healthy");
    });

    it("reports redis down while postgres and r2 are up", async () => {
      mocks.healthService.checkHealth.mockResolvedValueOnce({
        status: "unhealthy",
        uptime: 200,
        timestamp: Date.now(),
        version: "0.1.0",
        dependencies: {
          postgres: { status: "healthy", latencyMs: 4 },
          redis: { status: "unhealthy", latencyMs: 0, error: "ECONNREFUSED" },
          r2: { status: "healthy", latencyMs: 12 },
        },
      });

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
      expect(res.body.dependencies.postgres.status).toBe("healthy");
      expect(res.body.dependencies.redis.status).toBe("unhealthy");
      expect(res.body.dependencies.redis.error).toBe("ECONNREFUSED");
      expect(res.body.dependencies.r2.status).toBe("healthy");
    });

    it("reports r2 down while postgres and redis are up", async () => {
      mocks.healthService.checkHealth.mockResolvedValueOnce({
        status: "unhealthy",
        uptime: 200,
        timestamp: Date.now(),
        version: "0.1.0",
        dependencies: {
          postgres: { status: "healthy", latencyMs: 5 },
          redis: { status: "healthy", latencyMs: 2 },
          r2: { status: "unhealthy", latencyMs: 0, error: "Bucket not found" },
        },
      });

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
      expect(res.body.dependencies.postgres.status).toBe("healthy");
      expect(res.body.dependencies.redis.status).toBe("healthy");
      expect(res.body.dependencies.r2.status).toBe("unhealthy");
      expect(res.body.dependencies.r2.error).toBe("Bucket not found");
    });

    it("reports all dependencies down", async () => {
      mocks.healthService.checkHealth.mockResolvedValueOnce({
        status: "unhealthy",
        uptime: 200,
        timestamp: Date.now(),
        version: "0.1.0",
        dependencies: {
          postgres: { status: "unhealthy", latencyMs: 0, error: "Timeout" },
          redis: { status: "unhealthy", latencyMs: 0, error: "Timeout" },
          r2: { status: "unhealthy", latencyMs: 0, error: "Timeout" },
        },
      });

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
      expect(res.body.dependencies.postgres.status).toBe("unhealthy");
      expect(res.body.dependencies.redis.status).toBe("unhealthy");
      expect(res.body.dependencies.r2.status).toBe("unhealthy");
    });
  });
});
