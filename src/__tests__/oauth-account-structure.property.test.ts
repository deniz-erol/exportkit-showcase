import { describe, it, expect, beforeAll, afterEach } from "vitest";
import fc from "fast-check";
import { PrismaClient } from "@prisma/client";

/**
 * Property-Based Tests for OAuth Account Record Structure
 *
 * These tests validate that OAuth authentication creates complete Account records
 * with all required fields populated correctly.
 *
 * **Validates: Requirements 4.1, 4.2**
 */

// Use a standard Prisma client for testing (no Neon adapter)
const prisma = new PrismaClient();

/**
 * Simulate the signIn callback that creates Account records
 */
async function testAccountCreation(params: {
  user: { id?: string; email: string; name?: string | null };
  account: {
    provider: string;
    providerAccountId: string;
    type: string;
    access_token?: string;
    token_type?: string;
    refresh_token?: string;
    expires_at?: number;
    scope?: string;
    id_token?: string;
    session_state?: string;
  };
  profile?: { email_verified?: boolean; verified_email?: boolean };
}): Promise<{ success: boolean; customerId?: string; accountId?: string }> {
  const { user, account, profile } = params;

  try {
    // Check if customer exists with this email
    let customer = await prisma.customer.findUnique({
      where: { email: user.email },
    });

    if (!customer) {
      // Create new customer
      customer = await prisma.customer.create({
        data: {
          email: user.email,
          name: user.name || user.email.split("@")[0],
          emailVerified:
            (profile as any)?.email_verified ||
            (profile as any)?.verified_email
              ? new Date()
              : null,
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
    }

    // Create Account record (simulating PrismaAdapter)
    const accountRecord = await prisma.account.create({
      data: {
        userId: customer.id,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        access_token: account.access_token,
        token_type: account.token_type,
        refresh_token: account.refresh_token,
        expires_at: account.expires_at,
        scope: account.scope,
        id_token: account.id_token,
        session_state: account.session_state,
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
const emailArb = fc.emailAddress().map((e) => `${e.split("@")[0]}@test-acct-structure.example`);
const nameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);
const providerAccountIdArb = fc
  .string({ minLength: 10, maxLength: 50 })
  .filter((s) => s.trim().length > 0);
const accessTokenArb = fc
  .string({ minLength: 20, maxLength: 200 })
  .filter((s) => s.trim().length > 0);
const tokenTypeArb = fc.constantFrom("Bearer", "bearer");

describe("OAuth Account Record Structure Properties", () => {
  beforeAll(async () => {
    // Ensure clean state for this test file's domain only
    await prisma.account.deleteMany({
      where: { user: { email: { contains: "@test-acct-structure.example" } } },
    });
    await prisma.subscription.deleteMany({
      where: { customer: { email: { contains: "@test-acct-structure.example" } } },
    });
    await prisma.customer.deleteMany({
      where: { email: { contains: "@test-acct-structure.example" } },
    });
  });

  afterEach(async () => {
    // Clean up only this test file's data
    await prisma.account.deleteMany({
      where: { user: { email: { contains: "@test-acct-structure.example" } } },
    });
    await prisma.subscription.deleteMany({
      where: { customer: { email: { contains: "@test-acct-structure.example" } } },
    });
    await prisma.customer.deleteMany({
      where: { email: { contains: "@test-acct-structure.example" } },
    });
  });

  /**
   * **Validates: Requirements 4.1, 4.2**
   *
   * Property 7: OAuth authentication creates complete Account records
   * For any successful OAuth authentication, an Account record should be created
   * with provider, providerAccountId, access_token, and userId fields populated.
   */
  it("creates Account records with all required fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
          tokenType: tokenTypeArb,
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

          // Simulate OAuth authentication
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
              token_type: profile.tokenType,
            },
            profile: {
              email_verified: true,
            },
          });

          // Property 1: Account creation should succeed
          expect(result.success).toBe(true);
          expect(result.accountId).toBeDefined();
          expect(result.customerId).toBeDefined();

          // Property 2: Account record should exist in database
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
          });

          expect(account).toBeDefined();
          expect(account).not.toBeNull();

          // Property 3: Required fields should be populated
          expect(account!.provider).toBe(profile.provider);
          expect(account!.providerAccountId).toBe(profile.providerAccountId);
          expect(account!.access_token).toBe(profile.accessToken);
          expect(account!.userId).toBe(result.customerId);

          // Property 4: Type field should be "oauth"
          expect(account!.type).toBe("oauth");

          // Property 5: Token type should be populated
          expect(account!.token_type).toBe(profile.tokenType);

          // Property 6: Account ID should be a valid CUID
          expect(account!.id).toBeDefined();
          expect(typeof account!.id).toBe("string");
          expect(account!.id.length).toBeGreaterThan(0);

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

  it("creates Account records with unique provider-providerAccountId combinations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
          tokenType: tokenTypeArb,
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

          // Create first account
          const result1 = await testAccountCreation({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: profile.accessToken,
              token_type: profile.tokenType,
            },
          });

          expect(result1.success).toBe(true);

          // Property: Attempting to create duplicate account should fail
          // (unique constraint on provider + providerAccountId)
          const result2 = await testAccountCreation({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: "different_token",
              token_type: profile.tokenType,
            },
          });

          // Should fail due to unique constraint
          expect(result2.success).toBe(false);

          // Verify only one account exists
          const accounts = await prisma.account.findMany({
            where: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
            },
          });

          expect(accounts).toHaveLength(1);
          expect(accounts[0].id).toBe(result1.accountId);

          // Clean up
          await prisma.account.deleteMany({
            where: { userId: result1.customerId },
          });
          await prisma.subscription.deleteMany({
            where: { customerId: result1.customerId },
          });
          await prisma.customer.delete({
            where: { id: result1.customerId },
          });
        }
      ),
      { numRuns: 3 }
    );
  }, 60000);

  it("creates Account records that link to valid Customer records", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
          tokenType: tokenTypeArb,
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

          // Simulate OAuth authentication
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
              token_type: profile.tokenType,
            },
          });

          expect(result.success).toBe(true);

          // Property 1: Account should link to a valid Customer
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
            include: { user: true },
          });

          expect(account).toBeDefined();
          expect(account!.user).toBeDefined();
          expect(account!.user.id).toBe(result.customerId);

          // Property 2: Customer should have the correct email
          expect(account!.user.email).toBe(profile.email);

          // Property 3: Customer should be active
          expect(account!.user.isActive).toBe(true);

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

  it("creates Account records with consistent field types", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
          tokenType: tokenTypeArb,
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

          // Simulate OAuth authentication
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
              token_type: profile.tokenType,
            },
          });

          expect(result.success).toBe(true);

          // Property: All fields should have correct types
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
          });

          expect(account).toBeDefined();

          // String fields
          expect(typeof account!.id).toBe("string");
          expect(typeof account!.userId).toBe("string");
          expect(typeof account!.type).toBe("string");
          expect(typeof account!.provider).toBe("string");
          expect(typeof account!.providerAccountId).toBe("string");
          expect(typeof account!.access_token).toBe("string");
          expect(typeof account!.token_type).toBe("string");

          // Optional fields should be null or correct type
          if (account!.refresh_token !== null) {
            expect(typeof account!.refresh_token).toBe("string");
          }
          if (account!.expires_at !== null) {
            expect(typeof account!.expires_at).toBe("number");
          }
          if (account!.scope !== null) {
            expect(typeof account!.scope).toBe("string");
          }
          if (account!.id_token !== null) {
            expect(typeof account!.id_token).toBe("string");
          }
          if (account!.session_state !== null) {
            expect(typeof account!.session_state).toBe("string");
          }

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
