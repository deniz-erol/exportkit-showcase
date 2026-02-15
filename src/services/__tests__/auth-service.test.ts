import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ApiKey, Customer, ApiKeyScope } from "@prisma/client";

// Mock Prisma client
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockCount = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: {
    apiKey: {
      create: (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

const {
  hashApiKey,
  generateApiKey,
  validateApiKey,
  revokeApiKey,
  listApiKeys,
  getApiKeyById,
  updateApiKeyAllowedIps,
} = await import("../auth-service.js");

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    name: "Test Co",
    email: "test@example.com",
    passwordHash: null,
    emailVerified: null,
    isActive: true,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    webhookUrl: null,
    webhookSecret: null,
    webhookActive: false,
    webhookFailCount: 0,
    webhookLastSuccess: null,
    notifyBeforeDeletion: false,
    brandColor: null,
    brandLogo: null,
    brandFooter: null,
    emailNotifications: true,
    onboardingStep: null,
    emailVerifyToken: null,
    emailVerifyExpiry: null,
    selectedPlanTier: null,
    retentionDays: 7,
    tosAcceptedAt: null,
    tosVersion: null,
    subProcessorOptIn: false,
    marketingEmails: false,
    deletedAt: null,
    ...overrides,
  };
}

function makeApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: "key-1",
    customerId: "cust-1",
    name: "Test Key",
    keyHash: "abc123hash",
    keyPrefix: "abcdefghij",
    scope: "WRITE" as ApiKeyScope,
    allowedIps: [],
    rateLimit: 100,
    lastUsedAt: null,
    expiresAt: null,
    isRevoked: false,
    revokedAt: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

type ApiKeyWithCustomer = ApiKey & { customer: Customer };

function makeApiKeyWithCustomer(
  keyOverrides: Partial<ApiKey> = {},
  customerOverrides: Partial<Customer> = {}
): ApiKeyWithCustomer {
  return {
    ...makeApiKey(keyOverrides),
    customer: makeCustomer(customerOverrides),
  };
}

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress fire-and-forget update errors
    mockUpdate.mockResolvedValue(makeApiKey());
  });

  describe("hashApiKey", () => {
    it("returns a 64-character hex string (SHA-256)", () => {
      const hash = hashApiKey("test-key");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces deterministic output for the same input", () => {
      const hash1 = hashApiKey("same-key");
      const hash2 = hashApiKey("same-key");
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different inputs", () => {
      const hash1 = hashApiKey("key-a");
      const hash2 = hashApiKey("key-b");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("generateApiKey", () => {
    it("returns a key and a database record", async () => {
      const record = makeApiKey();
      mockCreate.mockResolvedValue(record);

      const result = await generateApiKey("cust-1", "My Key");

      expect(result.key).toBeDefined();
      expect(result.keyRecord).toEqual(record);
    });

    it("generates a URL-safe base64 key (no +, /, =)", async () => {
      mockCreate.mockResolvedValue(makeApiKey());

      const result = await generateApiKey("cust-1", "My Key");

      expect(result.key).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(result.key.length).toBeGreaterThanOrEqual(40);
    });

    it("stores the SHA-256 hash, not the raw key", async () => {
      mockCreate.mockResolvedValue(makeApiKey());

      const result = await generateApiKey("cust-1", "My Key");

      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.data.keyHash).toBe(hashApiKey(result.key));
    });

    it("stores the first 10 characters as keyPrefix", async () => {
      mockCreate.mockResolvedValue(makeApiKey());

      const result = await generateApiKey("cust-1", "My Key");

      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.data.keyPrefix).toBe(result.key.slice(0, 10));
    });

    it("defaults scope to WRITE", async () => {
      mockCreate.mockResolvedValue(makeApiKey());

      await generateApiKey("cust-1", "My Key");

      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.data.scope).toBe("WRITE");
    });

    it("accepts a custom scope", async () => {
      mockCreate.mockResolvedValue(makeApiKey({ scope: "READ" as ApiKeyScope }));

      await generateApiKey("cust-1", "My Key", 100, undefined, "READ" as ApiKeyScope);

      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.data.scope).toBe("READ");
    });

    it("defaults rateLimit to 100", async () => {
      mockCreate.mockResolvedValue(makeApiKey());

      await generateApiKey("cust-1", "My Key");

      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.data.rateLimit).toBe(100);
    });

    it("accepts a custom rateLimit", async () => {
      mockCreate.mockResolvedValue(makeApiKey({ rateLimit: 50 }));

      await generateApiKey("cust-1", "My Key", 50);

      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.data.rateLimit).toBe(50);
    });

    it("sets expiresAt to null when not provided", async () => {
      mockCreate.mockResolvedValue(makeApiKey());

      await generateApiKey("cust-1", "My Key");

      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.data.expiresAt).toBeNull();
    });

    it("passes expiresAt when provided", async () => {
      const expires = new Date("2026-12-31T00:00:00Z");
      mockCreate.mockResolvedValue(makeApiKey({ expiresAt: expires }));

      await generateApiKey("cust-1", "My Key", 100, expires);

      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.data.expiresAt).toEqual(expires);
    });

    it("generates unique keys on each call", async () => {
      mockCreate.mockResolvedValue(makeApiKey());

      const result1 = await generateApiKey("cust-1", "Key 1");
      const result2 = await generateApiKey("cust-1", "Key 2");

      expect(result1.key).not.toBe(result2.key);
    });
  });

  describe("validateApiKey", () => {
    it("returns the key record with customer for a valid key", async () => {
      const keyWithCustomer = makeApiKeyWithCustomer();
      // We need to generate a real key to get a valid format
      mockCreate.mockResolvedValue(makeApiKey());
      const { key } = await generateApiKey("cust-1", "Test");

      mockFindUnique.mockResolvedValue(keyWithCustomer);

      const result = await validateApiKey(key);

      expect(result).toEqual(keyWithCustomer);
    });

    it("returns null for an invalid key format (too short)", async () => {
      const result = await validateApiKey("short");

      expect(result).toBeNull();
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("returns null for an invalid key format (special characters)", async () => {
      const result = await validateApiKey("invalid key with spaces!@#$%^&*()");

      expect(result).toBeNull();
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("returns null when key is not found in database", async () => {
      mockCreate.mockResolvedValue(makeApiKey());
      const { key } = await generateApiKey("cust-1", "Test");

      mockFindUnique.mockResolvedValue(null);

      const result = await validateApiKey(key);

      expect(result).toBeNull();
    });

    it("returns null for a revoked key", async () => {
      mockCreate.mockResolvedValue(makeApiKey());
      const { key } = await generateApiKey("cust-1", "Test");

      mockFindUnique.mockResolvedValue(
        makeApiKeyWithCustomer({ isRevoked: true })
      );

      const result = await validateApiKey(key);

      expect(result).toBeNull();
    });

    it("returns null for an expired key", async () => {
      mockCreate.mockResolvedValue(makeApiKey());
      const { key } = await generateApiKey("cust-1", "Test");

      mockFindUnique.mockResolvedValue(
        makeApiKeyWithCustomer({ expiresAt: new Date("2020-01-01T00:00:00Z") })
      );

      const result = await validateApiKey(key);

      expect(result).toBeNull();
    });

    it("returns null when customer is inactive", async () => {
      mockCreate.mockResolvedValue(makeApiKey());
      const { key } = await generateApiKey("cust-1", "Test");

      mockFindUnique.mockResolvedValue(
        makeApiKeyWithCustomer({}, { isActive: false })
      );

      const result = await validateApiKey(key);

      expect(result).toBeNull();
    });

    it("updates lastUsedAt on successful validation (fire-and-forget)", async () => {
      mockCreate.mockResolvedValue(makeApiKey());
      const { key } = await generateApiKey("cust-1", "Test");

      mockFindUnique.mockResolvedValue(makeApiKeyWithCustomer());

      await validateApiKey(key);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "key-1" },
          data: { lastUsedAt: expect.any(Date) },
        })
      );
    });

    it("does not throw when lastUsedAt update fails", async () => {
      mockCreate.mockResolvedValue(makeApiKey());
      const { key } = await generateApiKey("cust-1", "Test");

      mockFindUnique.mockResolvedValue(makeApiKeyWithCustomer());
      mockUpdate.mockRejectedValue(new Error("DB error"));

      // Should not throw
      const result = await validateApiKey(key);
      expect(result).toBeDefined();
    });
  });

  describe("revokeApiKey", () => {
    it("sets isRevoked to true and revokedAt timestamp", async () => {
      const now = new Date();
      const revoked = makeApiKey({ isRevoked: true, revokedAt: now });
      mockUpdate.mockResolvedValue(revoked);

      const result = await revokeApiKey("key-1");

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "key-1" },
        data: { isRevoked: true, revokedAt: expect.any(Date) },
      });
      expect(result.isRevoked).toBe(true);
      expect(result.revokedAt).toBeInstanceOf(Date);
    });

    it("propagates errors when key not found", async () => {
      mockUpdate.mockRejectedValue(new Error("Record not found"));

      await expect(revokeApiKey("nonexistent")).rejects.toThrow(
        "Record not found"
      );
    });
  });

  describe("listApiKeys", () => {
    it("returns non-revoked keys for a customer", async () => {
      const keys = [
        {
          id: "key-1",
          name: "Key 1",
          keyPrefix: "abcdefghij",
          scope: "WRITE" as ApiKeyScope,
          allowedIps: [],
          rateLimit: 100,
          lastUsedAt: null,
          expiresAt: null,
          isRevoked: false,
          createdAt: new Date(),
        },
      ];
      mockFindMany.mockResolvedValue(keys);
      mockCount.mockResolvedValue(1);

      const result = await listApiKeys("cust-1");

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { customerId: "cust-1", isRevoked: false },
        select: expect.objectContaining({
          id: true,
          name: true,
          keyPrefix: true,
          scope: true,
        }),
        orderBy: { createdAt: "desc" },
      });
      expect(result.data).toEqual(keys);
      expect(result.total).toBe(1);
    });

    it("does not include keyHash in the response", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await listApiKeys("cust-1");

      const selectArg = mockFindMany.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty("keyHash");
    });
  });

  describe("getApiKeyById", () => {
    it("returns the key when found and owned by customer", async () => {
      const key = makeApiKey();
      mockFindFirst.mockResolvedValue(key);

      const result = await getApiKeyById("key-1", "cust-1");

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { id: "key-1", customerId: "cust-1" },
      });
      expect(result).toEqual(key);
    });

    it("returns null when key not found", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await getApiKeyById("nonexistent", "cust-1");

      expect(result).toBeNull();
    });

    it("returns null when key belongs to different customer", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await getApiKeyById("key-1", "other-customer");

      expect(result).toBeNull();
    });
  });

  describe("updateApiKeyAllowedIps", () => {
    it("updates the allowedIps for a key owned by the customer", async () => {
      const key = makeApiKey();
      mockFindFirst.mockResolvedValue(key);
      const updated = makeApiKey({ allowedIps: ["10.0.0.0/8"] });
      mockUpdate.mockResolvedValue(updated);

      const result = await updateApiKeyAllowedIps("key-1", "cust-1", [
        "10.0.0.0/8",
      ]);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "key-1" },
        data: { allowedIps: ["10.0.0.0/8"] },
      });
      expect(result).toEqual(updated);
    });

    it("returns null when key not found or not owned", async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await updateApiKeyAllowedIps("key-1", "other", [
        "10.0.0.0/8",
      ]);

      expect(result).toBeNull();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
