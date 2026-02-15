import { describe, it, expect, afterEach, beforeAll } from "vitest";
import fc from "fast-check";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/**
 * **Validates: Requirements 6.2**
 *
 * Property 12: Password-only customers retain access
 * For any Customer with a passwordHash and no linked OAuth accounts,
 * authentication via Credentials provider should succeed.
 */

// Use a standard Prisma client for testing (no Neon adapter)
const prisma = new PrismaClient();

/**
 * Simulate the authorize callback from CredentialsProvider
 */
async function authorizeCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string; name: string } | null> {
  const customer = await prisma.customer.findUnique({
    where: { email },
  });

  if (!customer || !customer.passwordHash) {
    return null;
  }

  const isValid = await bcrypt.compare(password, customer.passwordHash);

  if (!isValid) {
    return null;
  }

  return {
    id: customer.id,
    email: customer.email,
    name: customer.name,
  };
}

describe("Property 12: Password-only customers retain access", () => {
  beforeAll(async () => {
    // Ensure Free plan exists for test setup
    const freePlan = await prisma.plan.findUnique({
      where: { tier: "FREE" },
    });

    if (!freePlan) {
      await prisma.plan.create({
        data: {
          tier: "FREE",
          name: "Free",
          monthlyRowLimit: 1000,
          monthlyPriceCents: 0,
          overagePer1000Cents: 0,
          features: {},
        },
      });
    }
  });

  // Clean up test data after each test
  afterEach(async () => {
    await prisma.account.deleteMany({
      where: {
        user: {
          email: {
            contains: "@test-password-only.example",
          },
        },
      },
    });
    await prisma.customer.deleteMany({
      where: {
        email: {
          contains: "@test-password-only.example",
        },
      },
    });
  });

  it("allows password-only customers to authenticate via credentials", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-password-only.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async (profile) => {
          // Create customer with password only (no OAuth accounts)
          const passwordHash = await bcrypt.hash(profile.password, 10);
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              isActive: true,
            },
          });

          // Verify no OAuth accounts exist
          const accountCount = await prisma.account.count({
            where: { userId: customer.id },
          });
          expect(accountCount).toBe(0);

          // Test credentials authentication
          const result = await authorizeCredentials(
            profile.email,
            profile.password
          );

          // Property: Password-only customers should be able to authenticate
          expect(result).not.toBeNull();
          expect(result?.id).toBe(customer.id);
          expect(result?.email).toBe(profile.email);
          expect(result?.name).toBe(profile.name);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("rejects password-only customers with incorrect password", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-password-only.example`),
          correctPassword: fc.string({ minLength: 8, maxLength: 50 }),
          wrongPassword: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async (profile) => {
          // Skip if passwords are the same
          if (profile.correctPassword === profile.wrongPassword) {
            return;
          }

          // Create customer with password only
          const passwordHash = await bcrypt.hash(profile.correctPassword, 10);
          await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              isActive: true,
            },
          });

          // Test authentication with wrong password
          const result = await authorizeCredentials(
            profile.email,
            profile.wrongPassword
          );

          // Property: Wrong password should be rejected
          expect(result).toBeNull();
        }
      ),
      { numRuns: 10 }
    );
  });

  it("maintains password authentication after OAuth feature deployment", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-password-only.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async (profile) => {
          // Create customer with password (simulating pre-OAuth customer)
          const passwordHash = await bcrypt.hash(profile.password, 10);
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              isActive: true,
              // Simulate customer created before OAuth feature
              createdAt: new Date("2024-01-01"),
            },
          });

          // Verify customer has no OAuth accounts
          const accounts = await prisma.account.findMany({
            where: { userId: customer.id },
          });
          expect(accounts).toHaveLength(0);

          // Test credentials authentication still works
          const result = await authorizeCredentials(
            profile.email,
            profile.password
          );

          // Property: Pre-OAuth customers should retain password access
          expect(result).not.toBeNull();
          expect(result?.id).toBe(customer.id);
          expect(result?.email).toBe(profile.email);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("allows password-only customers to authenticate regardless of account table state", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-password-only.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async (profile) => {
          // Create customer with password only
          const passwordHash = await bcrypt.hash(profile.password, 10);
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              isActive: true,
            },
          });

          // Verify account table has no records for this customer
          const accountsBefore = await prisma.account.findMany({
            where: { userId: customer.id },
          });
          expect(accountsBefore).toHaveLength(0);

          // Test credentials authentication
          const result = await authorizeCredentials(
            profile.email,
            profile.password
          );

          // Property: Authentication should succeed without checking account table
          expect(result).not.toBeNull();
          expect(result?.id).toBe(customer.id);

          // Verify account table still has no records (credentials auth doesn't create accounts)
          const accountsAfter = await prisma.account.findMany({
            where: { userId: customer.id },
          });
          expect(accountsAfter).toHaveLength(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("preserves password authentication for customers with various profile data", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-password-only.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          brandColor: fc.integer({ min: 0, max: 0xFFFFFF }).map(n => `#${n.toString(16).padStart(6, '0')}`),
          webhookUrl: fc.webUrl(),
          emailNotifications: fc.boolean(),
        }),
        async (profile) => {
          // Create customer with password and various profile settings
          const passwordHash = await bcrypt.hash(profile.password, 10);
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              brandColor: profile.brandColor,
              webhookUrl: profile.webhookUrl,
              emailNotifications: profile.emailNotifications,
              isActive: true,
            },
          });

          // Test credentials authentication
          const result = await authorizeCredentials(
            profile.email,
            profile.password
          );

          // Property: Password authentication works regardless of profile settings
          expect(result).not.toBeNull();
          expect(result?.id).toBe(customer.id);
          expect(result?.email).toBe(profile.email);
          expect(result?.name).toBe(profile.name);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("rejects customers without passwordHash", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-password-only.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async (profile) => {
          // Create customer without password (OAuth-only customer)
          await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash: null, // No password set
              isActive: true,
            },
          });

          // Test credentials authentication
          const result = await authorizeCredentials(
            profile.email,
            profile.password
          );

          // Property: Customers without passwordHash cannot use credentials auth
          expect(result).toBeNull();
        }
      ),
      { numRuns: 10 }
    );
  });

  it("maintains password authentication consistency across multiple login attempts", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-password-only.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          attemptCount: fc.integer({ min: 2, max: 5 }),
        }),
        async (profile) => {
          // Create customer with password only
          const passwordHash = await bcrypt.hash(profile.password, 10);
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              isActive: true,
            },
          });

          // Test multiple authentication attempts
          for (let i = 0; i < profile.attemptCount; i++) {
            const result = await authorizeCredentials(
              profile.email,
              profile.password
            );

            // Property: Each authentication attempt should succeed consistently
            expect(result).not.toBeNull();
            expect(result?.id).toBe(customer.id);
            expect(result?.email).toBe(profile.email);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it("verifies password-only customers have no OAuth accounts", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-password-only.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async (profile) => {
          // Create customer with password only
          const passwordHash = await bcrypt.hash(profile.password, 10);
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              isActive: true,
            },
          });

          // Verify customer can authenticate
          const authResult = await authorizeCredentials(
            profile.email,
            profile.password
          );
          expect(authResult).not.toBeNull();

          // Property: Password-only customers should have zero OAuth accounts
          const accounts = await prisma.account.findMany({
            where: { userId: customer.id },
          });
          expect(accounts).toHaveLength(0);

          // Verify customer record exists
          const customerRecord = await prisma.customer.findUnique({
            where: { id: customer.id },
            include: { accounts: true },
          });
          expect(customerRecord).not.toBeNull();
          expect(customerRecord!.accounts).toHaveLength(0);
          expect(customerRecord!.passwordHash).not.toBeNull();
        }
      ),
      { numRuns: 10 }
    );
  });
});
