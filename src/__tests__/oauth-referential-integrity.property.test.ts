import { describe, it, expect, beforeAll, afterEach } from "vitest";
import fc from "fast-check";
import { PrismaClient } from "@prisma/client";

/**
 * Property-Based Tests for OAuth Account Referential Integrity
 *
 * These tests validate that Account records maintain proper referential integrity
 * with Customer records, including cascade delete behavior.
 *
 * **Validates: Requirements 4.5**
 */

// Use a standard Prisma client for testing (no Neon adapter)
const prisma = new PrismaClient();

/**
 * Simulate the signIn callback that creates Account records
 */
async function testAccountCreation(params: {
  user: { email: string; name?: string | null };
  account: {
    provider: string;
    providerAccountId: string;
    type: string;
    access_token: string;
    token_type: string;
  };
}): Promise<{ success: boolean; customerId?: string; accountId?: string }> {
  const { user, account } = params;

  try {
    // Create customer
    const customer = await prisma.customer.create({
      data: {
        email: user.email,
        name: user.name || user.email.split("@")[0],
        isActive: true,
      },
    });

    // Create Free plan subscription
    const freePlan = await prisma.plan.findUnique({
      where: { tier: "FREE" },
    });

    if (freePlan) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await prisma.subscription.create({
        data: {
          customerId: customer.id,
          planId: freePlan.id,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
    }

    // Create Account record
    const accountRecord = await prisma.account.create({
      data: {
        userId: customer.id,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        access_token: account.access_token,
        token_type: account.token_type,
      },
    });

    return {
      success: true,
      customerId: customer.id,
      accountId: accountRecord.id,
    };
  } catch (error) {
    console.error("Account creation error:", error);
    return { success: false };
  }
}

// Arbitraries for generating test data
const oauthProviderArb = fc.constantFrom("google", "github", "azure-ad");
const emailArb = fc.emailAddress().map((e) => `${e.split("@")[0]}@test-ref-integrity.example`);
const nameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);
const providerAccountIdArb = fc
  .string({ minLength: 10, maxLength: 50 })
  .filter((s) => s.trim().length > 0);
const accessTokenArb = fc
  .string({ minLength: 20, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

describe("OAuth Account Referential Integrity Properties", () => {
  beforeAll(async () => {
    // Ensure clean state for this test file's domain only
    await prisma.account.deleteMany({
      where: { user: { email: { contains: "@test-ref-integrity.example" } } },
    });
    await prisma.subscription.deleteMany({
      where: { customer: { email: { contains: "@test-ref-integrity.example" } } },
    });
    await prisma.customer.deleteMany({
      where: { email: { contains: "@test-ref-integrity.example" } },
    });
  });

  afterEach(async () => {
    // Clean up only this test file's data
    await prisma.account.deleteMany({
      where: { user: { email: { contains: "@test-ref-integrity.example" } } },
    });
    await prisma.subscription.deleteMany({
      where: { customer: { email: { contains: "@test-ref-integrity.example" } } },
    });
    await prisma.customer.deleteMany({
      where: { email: { contains: "@test-ref-integrity.example" } },
    });
  });

  /**
   * **Validates: Requirements 4.5**
   *
   * Property 9: Account records maintain referential integrity
   * For any Account record, the userId field should reference an existing Customer.id,
   * and deleting the Customer should cascade delete the Account.
   */
  it("links Account records to valid Customer records via userId", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
        }),
        async (profile) => {
          // Clean up any existing data for this email
          await prisma.account.deleteMany({
            where: {
              user: {
                email: profile.email,
              },
            },
          });
          await prisma.subscription.deleteMany({
            where: {
              customer: {
                email: profile.email,
              },
            },
          });
          await prisma.customer.deleteMany({
            where: {
              email: profile.email,
            },
          });

          // Create account
          const result = await testAccountCreation({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: profile.accessToken,
              token_type: "Bearer",
            },
          });

          expect(result.success).toBe(true);

          // Property 1: Account should reference a valid Customer
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
            include: { user: true },
          });

          expect(account).toBeDefined();
          expect(account!.userId).toBe(result.customerId);
          expect(account!.user).toBeDefined();
          expect(account!.user.id).toBe(result.customerId);

          // Property 2: Customer should exist
          const customer = await prisma.customer.findUnique({
            where: { id: result.customerId },
          });

          expect(customer).toBeDefined();
          expect(customer!.id).toBe(result.customerId);
          expect(customer!.email).toBe(profile.email);

          // Clean up
          await prisma.account.delete({
            where: { id: result.accountId },
          });
          await prisma.subscription.deleteMany({
            where: { customerId: result.customerId },
          });
          await prisma.customer.delete({
            where: { id: result.customerId },
          });
        }
      ),
      { numRuns: 3 }
    );
  }, 60000);

  it("cascade deletes Account records when Customer is deleted", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
        }),
        async (profile) => {
          // Clean up any existing data for this email
          await prisma.account.deleteMany({
            where: {
              user: {
                email: profile.email,
              },
            },
          });
          await prisma.subscription.deleteMany({
            where: {
              customer: {
                email: profile.email,
              },
            },
          });
          await prisma.customer.deleteMany({
            where: {
              email: profile.email,
            },
          });

          // Create account
          const result = await testAccountCreation({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: profile.accessToken,
              token_type: "Bearer",
            },
          });

          expect(result.success).toBe(true);

          // Verify account exists
          const accountBefore = await prisma.account.findUnique({
            where: { id: result.accountId },
          });
          expect(accountBefore).toBeDefined();

          // Property: Deleting Customer should cascade delete Account
          await prisma.subscription.deleteMany({
            where: { customerId: result.customerId },
          });
          await prisma.customer.delete({
            where: { id: result.customerId },
          });

          // Verify account was cascade deleted
          const accountAfter = await prisma.account.findUnique({
            where: { id: result.accountId },
          });
          expect(accountAfter).toBeNull();
        }
      ),
      { numRuns: 3 }
    );
  }, 60000);

  it("maintains referential integrity with multiple Account records per Customer", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider1: oauthProviderArb,
          provider2: oauthProviderArb,
          providerAccountId1: providerAccountIdArb,
          providerAccountId2: providerAccountIdArb,
          accessToken1: accessTokenArb,
          accessToken2: accessTokenArb,
        }),
        async (profile) => {
          // Skip if both providers are the same (would violate unique constraint)
          if (profile.provider1 === profile.provider2) {
            return;
          }

          // Clean up any existing data for this email
          await prisma.account.deleteMany({
            where: {
              user: {
                email: profile.email,
              },
            },
          });
          await prisma.subscription.deleteMany({
            where: {
              customer: {
                email: profile.email,
              },
            },
          });
          await prisma.customer.deleteMany({
            where: {
              email: profile.email,
            },
          });

          // Create first account
          const result1 = await testAccountCreation({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider1,
              providerAccountId: profile.providerAccountId1,
              type: "oauth",
              access_token: profile.accessToken1,
              token_type: "Bearer",
            },
          });

          expect(result1.success).toBe(true);

          // Create second account for same customer
          const account2 = await prisma.account.create({
            data: {
              userId: result1.customerId!,
              type: "oauth",
              provider: profile.provider2,
              providerAccountId: profile.providerAccountId2,
              access_token: profile.accessToken2,
              token_type: "Bearer",
            },
          });

          // Property 1: Both accounts should reference the same Customer
          const accounts = await prisma.account.findMany({
            where: { userId: result1.customerId },
            include: { user: true },
          });

          expect(accounts).toHaveLength(2);
          expect(accounts[0].userId).toBe(result1.customerId);
          expect(accounts[1].userId).toBe(result1.customerId);
          expect(accounts[0].user.id).toBe(result1.customerId);
          expect(accounts[1].user.id).toBe(result1.customerId);

          // Property 2: Deleting Customer should cascade delete all accounts
          await prisma.subscription.deleteMany({
            where: { customerId: result1.customerId },
          });
          await prisma.customer.delete({
            where: { id: result1.customerId },
          });

          // Verify both accounts were cascade deleted
          const accountsAfter = await prisma.account.findMany({
            where: {
              id: {
                in: [result1.accountId!, account2.id],
              },
            },
          });

          expect(accountsAfter).toHaveLength(0);
        }
      ),
      { numRuns: 3 }
    );
  }, 60000);

  it("prevents Account creation with invalid userId", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
          invalidUserId: fc.uuid(),
        }),
        async (profile) => {
          // Property: Attempting to create Account with non-existent userId should fail
          await expect(
            prisma.account.create({
              data: {
                userId: profile.invalidUserId,
                type: "oauth",
                provider: profile.provider,
                providerAccountId: profile.providerAccountId,
                access_token: profile.accessToken,
                token_type: "Bearer",
              },
            })
          ).rejects.toThrow();
        }
      ),
      { numRuns: 3 }
    );
  }, 60000);

  it("maintains referential integrity across Customer updates", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          newName: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
        }),
        async (profile) => {
          // Clean up any existing data for this email
          await prisma.account.deleteMany({
            where: {
              user: {
                email: profile.email,
              },
            },
          });
          await prisma.subscription.deleteMany({
            where: {
              customer: {
                email: profile.email,
              },
            },
          });
          await prisma.customer.deleteMany({
            where: {
              email: profile.email,
            },
          });

          // Create account
          const result = await testAccountCreation({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: profile.accessToken,
              token_type: "Bearer",
            },
          });

          expect(result.success).toBe(true);

          // Property: Updating Customer should not break Account reference
          await prisma.customer.update({
            where: { id: result.customerId },
            data: { name: profile.newName },
          });

          // Verify account still references the customer
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
            include: { user: true },
          });

          expect(account).toBeDefined();
          expect(account!.userId).toBe(result.customerId);
          expect(account!.user.id).toBe(result.customerId);
          expect(account!.user.name).toBe(profile.newName);

          // Clean up
          await prisma.account.delete({
            where: { id: result.accountId },
          });
          await prisma.subscription.deleteMany({
            where: { customerId: result.customerId },
          });
          await prisma.customer.delete({
            where: { id: result.customerId },
          });
        }
      ),
      { numRuns: 3 }
    );
  }, 60000);

  it("maintains referential integrity when querying Account with Customer", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
        }),
        async (profile) => {
          // Clean up any existing data for this email
          await prisma.account.deleteMany({
            where: {
              user: {
                email: profile.email,
              },
            },
          });
          await prisma.subscription.deleteMany({
            where: {
              customer: {
                email: profile.email,
              },
            },
          });
          await prisma.customer.deleteMany({
            where: {
              email: profile.email,
            },
          });

          // Create account
          const result = await testAccountCreation({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: profile.accessToken,
              token_type: "Bearer",
            },
          });

          expect(result.success).toBe(true);

          // Property: Querying Account with include should return valid Customer
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
            include: { user: true },
          });

          expect(account).toBeDefined();
          expect(account!.user).toBeDefined();
          expect(account!.user.id).toBe(account!.userId);
          expect(account!.user.email).toBe(profile.email);
          expect(account!.user.name).toBe(profile.name);

          // Property: Querying Customer with include should return Account
          const customer = await prisma.customer.findUnique({
            where: { id: result.customerId },
            include: { accounts: true },
          });

          expect(customer).toBeDefined();
          expect(customer!.accounts).toHaveLength(1);
          expect(customer!.accounts[0].id).toBe(result.accountId);
          expect(customer!.accounts[0].userId).toBe(result.customerId);

          // Clean up
          await prisma.account.delete({
            where: { id: result.accountId },
          });
          await prisma.subscription.deleteMany({
            where: { customerId: result.customerId },
          });
          await prisma.customer.delete({
            where: { id: result.customerId },
          });
        }
      ),
      { numRuns: 3 }
    );
  }, 60000);
});
