/**
 * Integration Tests — /api/jobs endpoints
 *
 * Tests the full Express middleware chain (rate limiting, auth, validation)
 * and route handlers for job creation, status retrieval, and listing.
 * Uses the shared mock infrastructure from setup.ts.
 *
 * **Validates: Requirements TEST-02 (1)**
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Application } from "express";
import { createTestApp, resetAllMocks, mocks } from "./setup.js";
import { mockApiKeyWithCustomer, mockJob } from "./helpers.js";
import { hashApiKey } from "../services/auth-service.js";

/** A valid-format API key (43 chars, alphanumeric) */
const TEST_API_KEY = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const TEST_KEY_HASH = hashApiKey(TEST_API_KEY);

let app: Application;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  resetAllMocks();
});

/**
 * Configure mocks so auth middleware resolves a valid API key.
 * Also stubs usage cap to allow job creation by default.
 */
function setupValidAuth() {
  const keyWithCustomer = mockApiKeyWithCustomer({ keyHash: TEST_KEY_HASH });

  mocks.prisma.apiKey.findUnique.mockResolvedValue(keyWithCustomer);
  // validateApiKey fires-and-forgets an update for lastUsedAt
  mocks.prisma.apiKey.update.mockResolvedValue(keyWithCustomer);

  // Usage cap: no subscription → defaults to free with headroom
  mocks.prisma.subscription.findUnique.mockResolvedValue(null);
  mocks.prisma.usageRecord.aggregate.mockResolvedValue({ _sum: { rowCount: 0 } });

  return keyWithCustomer;
}

describe("/api/jobs", () => {
  // ── Authentication ──────────────────────────────────────────────────────

  describe("Authentication", () => {
    it("returns 401 when no API key is provided", async () => {
      const res = await request(app).get("/api/jobs");

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("MISSING_API_KEY");
    });

    it("returns 401 when an invalid API key is provided", async () => {
      mocks.prisma.apiKey.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/jobs")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("INVALID_API_KEY");
    });

    it("returns 401 for a revoked API key", async () => {
      const revokedKey = mockApiKeyWithCustomer({
        keyHash: TEST_KEY_HASH,
        isRevoked: true,
      });
      mocks.prisma.apiKey.findUnique.mockResolvedValue(revokedKey);

      const res = await request(app)
        .get("/api/jobs")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/jobs — Job Creation ──────────────────────────────────────

  describe("POST /api/jobs", () => {
    it("creates a job and returns 201", async () => {
      const keyWithCustomer = setupValidAuth();

      const createdJob = mockJob({
        customerId: keyWithCustomer.customerId,
        apiKeyId: keyWithCustomer.id,
        type: "csv",
        status: "QUEUED" as any,
      });

      mocks.prisma.job.create.mockResolvedValue(createdJob);

      const res = await request(app)
        .post("/api/jobs")
        .set("X-API-Key", TEST_API_KEY)
        .send({ type: "csv", payload: { table: "users" } });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body).toHaveProperty("status", "QUEUED");
    });

    it("returns 400 for missing type field", async () => {
      setupValidAuth();

      const res = await request(app)
        .post("/api/jobs")
        .set("X-API-Key", TEST_API_KEY)
        .send({ payload: { table: "users" } });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid type value", async () => {
      setupValidAuth();

      const res = await request(app)
        .post("/api/jobs")
        .set("X-API-Key", TEST_API_KEY)
        .send({ type: "xml" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 429 when usage cap is reached (Free plan)", async () => {
      const keyWithCustomer = setupValidAuth();

      // Override: subscription on Free plan at limit
      mocks.prisma.subscription.findUnique.mockResolvedValue({
        id: "sub-1",
        customerId: keyWithCustomer.customerId,
        planId: "plan-free",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        plan: {
          id: "plan-free",
          tier: "FREE",
          name: "Free",
          monthlyRowLimit: 10_000,
          monthlyPriceCents: 0,
          overagePer1000Cents: 0,
          features: {},
        },
      });
      mocks.prisma.usageRecord.aggregate.mockResolvedValue({
        _sum: { rowCount: 10_000 },
      });

      const res = await request(app)
        .post("/api/jobs")
        .set("X-API-Key", TEST_API_KEY)
        .send({ type: "csv" });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe("USAGE_LIMIT_REACHED");
    });

    it("defaults payload to empty object when omitted", async () => {
      const keyWithCustomer = setupValidAuth();

      const createdJob = mockJob({
        customerId: keyWithCustomer.customerId,
        apiKeyId: keyWithCustomer.id,
        type: "json",
      });
      mocks.prisma.job.create.mockResolvedValue(createdJob);

      const res = await request(app)
        .post("/api/jobs")
        .set("X-API-Key", TEST_API_KEY)
        .send({ type: "json" });

      expect(res.status).toBe(201);
    });
  });

  // ── GET /api/jobs/:id — Job Status ─────────────────────────────────────

  describe("GET /api/jobs/:id", () => {
    it("returns job details for a valid job ID", async () => {
      const keyWithCustomer = setupValidAuth();

      const job = mockJob({
        id: "job-abc-123",
        customerId: keyWithCustomer.customerId,
        status: "PROCESSING" as any,
        progress: 50,
      });
      mocks.prisma.job.findFirst.mockResolvedValue(job);

      const res = await request(app)
        .get("/api/jobs/job-abc-123")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("job-abc-123");
      expect(res.body.status).toBe("PROCESSING");
      expect(res.body.progress).toBe(50);
    });

    it("returns 404 for a non-existent job", async () => {
      setupValidAuth();
      mocks.prisma.job.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/jobs/nonexistent-id")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("JOB_NOT_FOUND");
    });

    it("includes result fields for a completed job", async () => {
      const keyWithCustomer = setupValidAuth();

      const job = mockJob({
        customerId: keyWithCustomer.customerId,
        status: "COMPLETED" as any,
        progress: 100,
        result: {
          downloadUrl: "https://r2.example.com/file.csv",
          expiresAt: "2025-01-15T10:00:00Z",
          recordCount: 500,
          fileSize: 12000,
          format: "csv",
          key: "exports/file.csv",
        },
      });
      mocks.prisma.job.findFirst.mockResolvedValue(job);

      const res = await request(app)
        .get(`/api/jobs/${job.id}`)
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.result).toBeDefined();
      expect(res.body.result.recordCount).toBe(500);
      expect(res.body.result.format).toBe("csv");
    });

    it("includes error details for a failed job", async () => {
      const keyWithCustomer = setupValidAuth();

      const job = mockJob({
        customerId: keyWithCustomer.customerId,
        status: "FAILED" as any,
        error: { message: "Database timeout", code: "DB_TIMEOUT" },
      });
      mocks.prisma.job.findFirst.mockResolvedValue(job);

      const res = await request(app)
        .get(`/api/jobs/${job.id}`)
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("FAILED");
      expect(res.body.error).toBeDefined();
      expect(res.body.error.message).toBe("Database timeout");
    });
  });

  // ── GET /api/jobs — Job Listing ────────────────────────────────────────

  describe("GET /api/jobs", () => {
    it("returns paginated list of jobs", async () => {
      const keyWithCustomer = setupValidAuth();

      const jobs = [
        mockJob({ id: "job-1", customerId: keyWithCustomer.customerId }),
        mockJob({ id: "job-2", customerId: keyWithCustomer.customerId, type: "json" }),
      ];
      mocks.prisma.job.findMany.mockResolvedValue(jobs);
      mocks.prisma.job.count.mockResolvedValue(2);

      const res = await request(app)
        .get("/api/jobs")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.pageSize).toBe(20);
    });

    it("supports status filter query parameter", async () => {
      const keyWithCustomer = setupValidAuth();

      const completedJob = mockJob({
        customerId: keyWithCustomer.customerId,
        status: "COMPLETED" as any,
      });
      mocks.prisma.job.findMany.mockResolvedValue([completedJob]);
      mocks.prisma.job.count.mockResolvedValue(1);

      const res = await request(app)
        .get("/api/jobs?status=COMPLETED")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it("supports page and pageSize query parameters", async () => {
      setupValidAuth();

      mocks.prisma.job.findMany.mockResolvedValue([]);
      mocks.prisma.job.count.mockResolvedValue(50);

      const res = await request(app)
        .get("/api/jobs?page=3&pageSize=10")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(3);
      expect(res.body.pagination.pageSize).toBe(10);
      expect(res.body.pagination.total).toBe(50);
    });

    it("returns empty list when customer has no jobs", async () => {
      setupValidAuth();

      mocks.prisma.job.findMany.mockResolvedValue([]);
      mocks.prisma.job.count.mockResolvedValue(0);

      const res = await request(app)
        .get("/api/jobs")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });
  });
});
