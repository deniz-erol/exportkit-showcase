/**
 * Smoke Test
 *
 * Verifies the integration test infrastructure works correctly.
 * Tests that the Express app boots with all mocks applied and
 * responds to basic requests.
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

describe("Integration test infrastructure", () => {
  describe("GET /health", () => {
    it("returns 200 with healthy status when all dependencies are up", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.dependencies).toBeDefined();
      expect(res.body.dependencies.postgres.status).toBe("healthy");
      expect(res.body.dependencies.redis.status).toBe("healthy");
      expect(res.body.dependencies.r2.status).toBe("healthy");
    });

    it("returns 503 when a dependency is unhealthy", async () => {
      mocks.healthService.checkHealth.mockResolvedValueOnce({
        status: "unhealthy",
        uptime: 100,
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
  });

  describe("404 handler", () => {
    it("returns 404 for unknown routes", async () => {
      const res = await request(app).get("/api/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ROUTE_NOT_FOUND");
    });
  });

  describe("Mock factories", () => {
    it("mock helpers produce valid objects", async () => {
      const { mockCustomer, mockApiKey, mockApiKeyWithCustomer, mockJob } = await import("./helpers.js");

      const customer = mockCustomer();
      expect(customer.id).toBe("cust-test-1");
      expect(customer.email).toBe("test@example.com");

      const key = mockApiKey();
      expect(key.id).toBe("key-test-1");
      expect(key.scope).toBe("WRITE");

      const keyWithCustomer = mockApiKeyWithCustomer();
      expect(keyWithCustomer.customer.id).toBe(keyWithCustomer.customerId);

      const job = mockJob();
      expect(job.status).toBe("QUEUED");
      expect(job.type).toBe("csv");
    });

    it("mock helpers accept overrides", async () => {
      const { mockCustomer, mockJob } = await import("./helpers.js");

      const customer = mockCustomer({ name: "Override Co", email: "custom@test.com" });
      expect(customer.name).toBe("Override Co");
      expect(customer.email).toBe("custom@test.com");

      const job = mockJob({ status: "COMPLETED" as any, type: "xlsx" });
      expect(job.status).toBe("COMPLETED");
      expect(job.type).toBe("xlsx");
    });
  });
});
