/**
 * Integration Tests — /api/keys endpoints
 *
 * Tests the full Express middleware chain (rate limiting, auth, scope, validation)
 * and route handlers for key creation, listing, revocation, and IP allowlist updates.
 * Uses the shared mock infrastructure from setup.ts.
 *
 * **Validates: Requirements TEST-02 (2)**
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Application } from "express";
import { createTestApp, resetAllMocks, mocks } from "./setup.js";
import { mockApiKey, mockApiKeyWithCustomer } from "./helpers.js";
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
 * Configure mocks so auth middleware resolves a valid API key with ADMIN scope.
 * Keys endpoints need ADMIN for DELETE, WRITE for POST/GET.
 */
function setupValidAuth(scope: "READ" | "WRITE" | "ADMIN" = "ADMIN") {
  const keyWithCustomer = mockApiKeyWithCustomer({
    keyHash: TEST_KEY_HASH,
    scope,
  });

  mocks.prisma.apiKey.findUnique.mockResolvedValue(keyWithCustomer);
  mocks.prisma.apiKey.update.mockResolvedValue(keyWithCustomer);

  return keyWithCustomer;
}

describe("/api/keys", () => {
  // ── Authentication ──────────────────────────────────────────────────────

  describe("Authentication", () => {
    it("returns 401 when no API key is provided", async () => {
      const res = await request(app).get("/api/keys");

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("MISSING_API_KEY");
    });

    it("returns 401 when an invalid API key is provided", async () => {
      mocks.prisma.apiKey.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/keys")
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
        .get("/api/keys")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/keys — Key Creation ─────────────────────────────────────

  describe("POST /api/keys", () => {
    it("creates a key and returns 201 with the full key", async () => {
      setupValidAuth();

      const createdKey = mockApiKey({
        id: "key-new-1",
        customerId: "cust-test-1",
        name: "My New Key",
        keyPrefix: "abc1234567",
        scope: "WRITE",
        rateLimit: 100,
      });
      mocks.prisma.apiKey.create.mockResolvedValue(createdKey);

      const res = await request(app)
        .post("/api/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "My New Key" });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body).toHaveProperty("key"); // full key returned once
      expect(res.body).toHaveProperty("name", "My New Key");
      expect(res.body).toHaveProperty("keyPrefix");
      expect(res.body).toHaveProperty("scope", "WRITE");
      expect(res.body).toHaveProperty("createdAt");
    });

    it("accepts optional scope parameter", async () => {
      setupValidAuth();

      const createdKey = mockApiKey({
        id: "key-new-2",
        customerId: "cust-test-1",
        name: "Read Only Key",
        scope: "READ",
      });
      mocks.prisma.apiKey.create.mockResolvedValue(createdKey);

      const res = await request(app)
        .post("/api/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "Read Only Key", scope: "READ" });

      expect(res.status).toBe(201);
      expect(res.body.scope).toBe("READ");
    });

    it("accepts optional rateLimit parameter", async () => {
      setupValidAuth();

      const createdKey = mockApiKey({
        id: "key-new-3",
        customerId: "cust-test-1",
        name: "High Rate Key",
        rateLimit: 5000,
      });
      mocks.prisma.apiKey.create.mockResolvedValue(createdKey);

      const res = await request(app)
        .post("/api/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "High Rate Key", rateLimit: 5000 });

      expect(res.status).toBe(201);
      expect(res.body.rateLimit).toBe(5000);
    });

    it("returns 400 when name is missing", async () => {
      setupValidAuth();

      const res = await request(app)
        .post("/api/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when name is empty string", async () => {
      setupValidAuth();

      const res = await request(app)
        .post("/api/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "   " });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid rateLimit value", async () => {
      setupValidAuth();

      const res = await request(app)
        .post("/api/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "Test Key", rateLimit: 99999 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for invalid scope value", async () => {
      setupValidAuth();

      const res = await request(app)
        .post("/api/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "Test Key", scope: "SUPERADMIN" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 403 when using a READ-scoped key", async () => {
      setupValidAuth("READ");

      const res = await request(app)
        .post("/api/keys")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "Test Key" });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });
  });

  // ── GET /api/keys — Key Listing ───────────────────────────────────────

  describe("GET /api/keys", () => {
    it("returns paginated list of non-revoked keys", async () => {
      setupValidAuth();

      const keys = [
        {
          id: "key-1",
          name: "Production Key",
          keyPrefix: "ek_prod_ab",
          scope: "WRITE",
          allowedIps: [],
          rateLimit: 100,
          lastUsedAt: new Date("2025-01-15T09:30:00Z"),
          expiresAt: null,
          isRevoked: false,
          createdAt: new Date("2025-01-01T00:00:00Z"),
        },
        {
          id: "key-2",
          name: "Dev Key",
          keyPrefix: "ek_dev_cd",
          scope: "READ",
          allowedIps: ["10.0.0.0/8"],
          rateLimit: 50,
          lastUsedAt: null,
          expiresAt: null,
          isRevoked: false,
          createdAt: new Date("2025-01-05T00:00:00Z"),
        },
      ];
      mocks.prisma.apiKey.findMany.mockResolvedValue(keys);
      mocks.prisma.apiKey.count.mockResolvedValue(2);

      const res = await request(app)
        .get("/api/keys")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toHaveProperty("id", "key-1");
      expect(res.body.data[0]).toHaveProperty("name", "Production Key");
      expect(res.body.data[0]).toHaveProperty("scope", "WRITE");
      // keyHash should NOT be in the response
      expect(res.body.data[0]).not.toHaveProperty("keyHash");
      expect(res.body.data[1]).not.toHaveProperty("keyHash");
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.pageSize).toBe(20);
    });

    it("returns empty data array when customer has no keys", async () => {
      setupValidAuth();

      mocks.prisma.apiKey.findMany.mockResolvedValue([]);
      mocks.prisma.apiKey.count.mockResolvedValue(0);

      const res = await request(app)
        .get("/api/keys")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });
  });

  // ── DELETE /api/keys/:id — Key Revocation ─────────────────────────────

  describe("DELETE /api/keys/:id", () => {
    it("revokes a key and returns 204", async () => {
      setupValidAuth();

      const targetKey = mockApiKey({
        id: "key-to-revoke",
        customerId: "cust-test-1",
        isRevoked: false,
      });
      mocks.prisma.apiKey.findFirst.mockResolvedValue(targetKey);
      mocks.prisma.apiKey.update.mockResolvedValue({
        ...targetKey,
        isRevoked: true,
      });

      const res = await request(app)
        .delete("/api/keys/key-to-revoke")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(204);
    });

    it("returns 404 for a non-existent key", async () => {
      setupValidAuth();

      mocks.prisma.apiKey.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .delete("/api/keys/nonexistent-key")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("KEY_NOT_FOUND");
    });

    it("returns 409 for an already-revoked key", async () => {
      setupValidAuth();

      const revokedKey = mockApiKey({
        id: "key-already-revoked",
        customerId: "cust-test-1",
        isRevoked: true,
      });
      mocks.prisma.apiKey.findFirst.mockResolvedValue(revokedKey);

      const res = await request(app)
        .delete("/api/keys/key-already-revoked")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("KEY_ALREADY_REVOKED");
    });

    it("returns 403 when using a WRITE-scoped key (DELETE requires ADMIN)", async () => {
      setupValidAuth("WRITE");

      const res = await request(app)
        .delete("/api/keys/some-key-id")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });
  });
});
