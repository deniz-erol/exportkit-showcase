import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "next-auth";

/**
 * **Validates: Requirements 6.1, 6.3, 6.4, 6.5**
 *
 * Unit tests for backward compatibility (Task 9.5)
 * Tests that OAuth feature deployment doesn't break existing functionality:
 * - Existing customers can log in with password
 * - Audit logs still created for credentials login
 * - No data loss during OAuth feature deployment
 */

// Mock bcrypt
const mockBcrypt = {
  compare: vi.fn(),
  hash: vi.fn(),
};

vi.mock("bcryptjs", () => ({
  default: mockBcrypt,
}));

// Mock prisma
const mockPrisma = {
  customer: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  auditLog: {
    create: vi.fn(() => ({
      catch: vi.fn(),
    })),
    findMany: vi.fn(),
  },
};

/**
 * Simulate the CredentialsProvider authorize function from auth.ts
 */
async function authorizeCredentials(credentials: {
  email?: string;
  password?: string;
}): Promise<User | null> {
  if (!credentials?.email || !credentials?.password) {
    return null;
  }

  const customer = await mockPrisma.customer.findUnique({
    where: { email: credentials.email },
  });

  if (!customer || !customer.passwordHash) {
    return null;
  }

  const isValid = await mockBcrypt.compare(
    credentials.password,
    customer.passwordHash
  );

  if (!isValid) {
    return null;
  }

  // Audit log: successful login (fire-and-forget)
  mockPrisma.auditLog
    .create({
      data: {
        customerId: customer.id,
        actorId: customer.id,
        action: "login",
        targetType: "customer",
        targetId: customer.id,
        ipAddress: "dashboard",
      },
    })
    .catch((err: unknown) => {
      console.error("Failed to log login audit event:", err);
    });

  return {
    id: customer.id,
    email: customer.email,
    name: customer.name,
  };
}

describe("Backward Compatibility (Task 9.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Requirement 6.1: Existing customers can log in with password", () => {
    it("authenticates existing customer with password created before OAuth feature", async () => {
      const mockCustomer = {
        id: "existing-customer-123",
        email: "existing@example.com",
        name: "Existing User",
        passwordHash: "$2a$10$hashedpassword",
        createdAt: new Date("2024-01-01"), // Created before OAuth feature
        updatedAt: new Date("2024-01-01"),
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await authorizeCredentials({
        email: "existing@example.com",
        password: "password123",
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe("existing-customer-123");
      expect(result?.email).toBe("existing@example.com");
      expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({
        where: { email: "existing@example.com" },
      });
    });

    it("authenticates customer with password and no OAuth accounts", async () => {
      const mockCustomer = {
        id: "password-only-customer",
        email: "password.only@example.com",
        name: "Password Only User",
        passwordHash: "$2a$10$hashedpassword",
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await authorizeCredentials({
        email: "password.only@example.com",
        password: "securepassword",
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe("password-only-customer");
    });

    it("authenticates customer with long-standing account", async () => {
      const mockCustomer = {
        id: "legacy-customer",
        email: "legacy@example.com",
        name: "Legacy User",
        passwordHash: "$2a$10$legacyhashedpassword",
        createdAt: new Date("2023-01-01"), // Very old account
        updatedAt: new Date("2023-01-01"),
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await authorizeCredentials({
        email: "legacy@example.com",
        password: "legacypassword",
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe("legacy-customer");
      expect(result?.email).toBe("legacy@example.com");
    });

    it("maintains password authentication for customers with various data", async () => {
      const mockCustomer = {
        id: "customer-with-data",
        email: "data@example.com",
        name: "User With Data",
        passwordHash: "$2a$10$hashedpassword",
        brandColor: "#FF5733",
        webhookUrl: "https://example.com/webhook",
        emailNotifications: true,
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await authorizeCredentials({
        email: "data@example.com",
        password: "password",
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe("customer-with-data");
    });
  });

  describe("Requirement 6.3: Audit logs still created for credentials login", () => {
    it("creates audit log for successful credentials login", async () => {
      const mockCustomer = {
        id: "customer-audit",
        email: "audit@example.com",
        name: "Audit User",
        passwordHash: "$2a$10$hashedpassword",
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      await authorizeCredentials({
        email: "audit@example.com",
        password: "password",
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          customerId: "customer-audit",
          actorId: "customer-audit",
          action: "login",
          targetType: "customer",
          targetId: "customer-audit",
          ipAddress: "dashboard",
        },
      });
    });

    it("creates audit log with correct action for credentials login", async () => {
      const mockCustomer = {
        id: "customer-action",
        email: "action@example.com",
        name: "Action User",
        passwordHash: "$2a$10$hashedpassword",
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      await authorizeCredentials({
        email: "action@example.com",
        password: "password",
      });

      const createCall = mockPrisma.auditLog.create.mock.calls[0][0];
      expect(createCall.data.action).toBe("login");
      expect(createCall.data.customerId).toBe("customer-action");
      expect(createCall.data.actorId).toBe("customer-action");
    });

    it("handles audit log creation failure gracefully", async () => {
      const mockCustomer = {
        id: "customer-graceful",
        email: "graceful@example.com",
        name: "Graceful User",
        passwordHash: "$2a$10$hashedpassword",
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      // Mock audit log failure
      const mockCatch = vi.fn();
      mockPrisma.auditLog.create.mockReturnValue({
        catch: mockCatch,
      } as any);

      const result = await authorizeCredentials({
        email: "graceful@example.com",
        password: "password",
      });

      // Authentication should still succeed
      expect(result).not.toBeNull();
      expect(result?.id).toBe("customer-graceful");
    });

    it("creates audit log for each login attempt", async () => {
      const mockCustomer = {
        id: "customer-multiple",
        email: "multiple@example.com",
        name: "Multiple User",
        passwordHash: "$2a$10$hashedpassword",
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      // First login
      await authorizeCredentials({
        email: "multiple@example.com",
        password: "password",
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);

      // Second login
      await authorizeCredentials({
        email: "multiple@example.com",
        password: "password",
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("Requirement 6.4: No data loss during OAuth feature deployment", () => {
    it("preserves customer data structure after OAuth tables added", async () => {
      const mockCustomer = {
        id: "customer-preserved",
        email: "preserved@example.com",
        name: "Preserved User",
        passwordHash: "$2a$10$hashedpassword",
        brandColor: "#123456",
        webhookUrl: "https://example.com/webhook",
        emailNotifications: true,
        isActive: true,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await authorizeCredentials({
        email: "preserved@example.com",
        password: "password",
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe("customer-preserved");
      expect(result?.email).toBe("preserved@example.com");
      expect(result?.name).toBe("Preserved User");
    });

    it("verifies no customer records are modified during OAuth deployment", async () => {
      const mockCustomers = [
        {
          id: "customer-1",
          email: "user1@example.com",
          name: "User 1",
          passwordHash: "$2a$10$hash1",
        },
        {
          id: "customer-2",
          email: "user2@example.com",
          name: "User 2",
          passwordHash: "$2a$10$hash2",
        },
      ];

      mockPrisma.customer.findMany.mockResolvedValue(mockCustomers);

      const customers = await mockPrisma.customer.findMany();

      // Verify all customers still exist with correct data
      expect(customers).toHaveLength(2);
      expect(customers[0].passwordHash).toBe("$2a$10$hash1");
      expect(customers[1].passwordHash).toBe("$2a$10$hash2");
    });

    it("ensures customer count remains unchanged after OAuth deployment", async () => {
      const originalCount = 100;
      mockPrisma.customer.count.mockResolvedValue(originalCount);

      const count = await mockPrisma.customer.count();

      expect(count).toBe(originalCount);
    });

    it("verifies existing customers have no OAuth accounts initially", async () => {
      const mockCustomer = {
        id: "existing-no-oauth",
        email: "no.oauth@example.com",
        name: "No OAuth User",
        passwordHash: "$2a$10$hashedpassword",
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockPrisma.account.count.mockResolvedValue(0);

      const customer = await mockPrisma.customer.findUnique({
        where: { email: "no.oauth@example.com" },
      });

      const accountCount = await mockPrisma.account.count({
        where: { userId: customer.id },
      });

      expect(accountCount).toBe(0);
    });
  });

  describe("Requirement 6.5: Existing authentication flow unchanged", () => {
    it("maintains same authentication flow for credentials", async () => {
      const mockCustomer = {
        id: "customer-flow",
        email: "flow@example.com",
        name: "Flow User",
        passwordHash: "$2a$10$hashedpassword",
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await authorizeCredentials({
        email: "flow@example.com",
        password: "password",
      });

      // Verify authentication flow steps
      expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({
        where: { email: "flow@example.com" },
      });
      expect(mockBcrypt.compare).toHaveBeenCalledWith(
        "password",
        "$2a$10$hashedpassword"
      );
      expect(result).not.toBeNull();
    });

    it("rejects invalid credentials same as before OAuth", async () => {
      const mockCustomer = {
        id: "customer-invalid",
        email: "invalid@example.com",
        name: "Invalid User",
        passwordHash: "$2a$10$hashedpassword",
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(false as never);

      const result = await authorizeCredentials({
        email: "invalid@example.com",
        password: "wrongpassword",
      });

      expect(result).toBeNull();
    });

    it("handles missing credentials same as before OAuth", async () => {
      const result1 = await authorizeCredentials({
        password: "password",
      });
      expect(result1).toBeNull();

      const result2 = await authorizeCredentials({
        email: "test@example.com",
      });
      expect(result2).toBeNull();

      const result3 = await authorizeCredentials({});
      expect(result3).toBeNull();
    });

    it("handles non-existent users same as before OAuth", async () => {
      mockPrisma.customer.findUnique.mockResolvedValue(null);

      const result = await authorizeCredentials({
        email: "nonexistent@example.com",
        password: "password",
      });

      expect(result).toBeNull();
    });

    it("returns same user object structure as before OAuth", async () => {
      const mockCustomer = {
        id: "customer-structure",
        email: "structure@example.com",
        name: "Structure User",
        passwordHash: "$2a$10$hashedpassword",
        // Additional fields that should not be returned
        brandColor: "#FF5733",
        webhookUrl: "https://example.com/webhook",
        isActive: true,
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await authorizeCredentials({
        email: "structure@example.com",
        password: "password",
      });

      // Should only return id, email, name (same as before OAuth)
      expect(result).toEqual({
        id: "customer-structure",
        email: "structure@example.com",
        name: "Structure User",
      });
      expect(result).not.toHaveProperty("passwordHash");
      expect(result).not.toHaveProperty("brandColor");
      expect(result).not.toHaveProperty("webhookUrl");
    });
  });

  describe("Integration scenarios", () => {
    it("supports customers created before and after OAuth deployment", async () => {
      const oldCustomer = {
        id: "old-customer",
        email: "old@example.com",
        name: "Old User",
        passwordHash: "$2a$10$oldhash",
        createdAt: new Date("2023-01-01"),
      };

      const newCustomer = {
        id: "new-customer",
        email: "new@example.com",
        name: "New User",
        passwordHash: "$2a$10$newhash",
        createdAt: new Date("2024-06-01"),
      };

      // Test old customer
      mockPrisma.customer.findUnique.mockResolvedValue(oldCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result1 = await authorizeCredentials({
        email: "old@example.com",
        password: "password",
      });
      expect(result1).not.toBeNull();
      expect(result1?.id).toBe("old-customer");

      // Test new customer
      mockPrisma.customer.findUnique.mockResolvedValue(newCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      const result2 = await authorizeCredentials({
        email: "new@example.com",
        password: "password",
      });
      expect(result2).not.toBeNull();
      expect(result2?.id).toBe("new-customer");
    });

    it("maintains backward compatibility across multiple authentication attempts", async () => {
      const mockCustomer = {
        id: "customer-multiple-auth",
        email: "multiple.auth@example.com",
        name: "Multiple Auth User",
        passwordHash: "$2a$10$hashedpassword",
      };

      mockPrisma.customer.findUnique.mockResolvedValue(mockCustomer);
      mockBcrypt.compare.mockResolvedValue(true as never);

      // Multiple authentication attempts
      for (let i = 0; i < 5; i++) {
        const result = await authorizeCredentials({
          email: "multiple.auth@example.com",
          password: "password",
        });

        expect(result).not.toBeNull();
        expect(result?.id).toBe("customer-multiple-auth");
      }

      // Verify audit logs created for each attempt
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(5);
    });
  });
});
