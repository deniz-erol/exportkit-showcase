import { describe, it, expect, beforeAll, afterEach } from "vitest";
import fc from "fast-check";
import { PrismaClient } from "@prisma/client";

/**
 * Property-Based Tests for OAuth Optional Token Storage
 *
 * These tests validate that OAuth Account records correctly store optional
 * tokens (refresh_token, expires_at, scope, id_token, session_state) when
 * provided by the OAuth provider, and leave them as null when not provided.
 *
 * **Validates: Requirements 4.3, 4.4**
 */

// Use a standard Prisma client for testing (no Neon adapter)
const prisma = new PrismaClient();

/**
 * Simulate the signIn callback that creates Account records with optional tokens
 */
async function testAccountCreationWithOptionalTokens(params: {
  user: { email: string; name?: string | null };
  account: {
    provider: string;
    providerAccountId: string;
    type: string;
    access_token: string;
    token_type: string;
    refresh_token?: string | null;
    expires_at?: number | null;
    scope?: string | null;
    id_token?: string | null;
    session_state?: string | null;
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

    // Create Account record with optional tokens
    const accountRecord = await prisma.account.create({
      data: {
        userId: customer.id,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        access_token: account.access_token,
        token_type: account.token_type,
        refresh_token: account.refresh_token ?? null,
        expires_at: account.expires_at ?? null,
        scope: account.scope ?? null,
        id_token: account.id_token ?? null,
        session_state: account.session_state ?? null,
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
const emailArb = fc.emailAddress().map((e) => `${e.split("@")[0]}@test-opt-tokens.example`);
const nameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);
const providerAccountIdArb = fc
  .string({ minLength: 10, maxLength: 50 })
  .filter((s) => s.trim().length > 0);
const accessTokenArb = fc
  .string({ minLength: 20, maxLength: 200 })
  .filter((s) => s.trim().length > 0);
const refreshTokenArb = fc
  .string({ minLength: 20, maxLength: 200 })
  .filter((s) => s.trim().length > 0);
const idTokenArb = fc
  .string({ minLength: 50, maxLength: 500 })
  .filter((s) => s.trim().length > 0);
const scopeArb = fc.constantFrom(
  "openid profile email",
  "openid email",
  "read:user user:email",
  "User.Read"
);
const sessionStateArb = fc
  .string({ minLength: 10, maxLength: 100 })
  .filter((s) => s.trim().length > 0);
const expiresAtArb = fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 3600 });

describe("OAuth Optional Token Storage Properties", () => {
  beforeAll(async () => {
    // Ensure clean state for this test file's domain only
    await prisma.account.deleteMany({
      where: { user: { email: { contains: "@test-opt-tokens.example" } } },
    });
    await prisma.subscription.deleteMany({
      where: { customer: { email: { contains: "@test-opt-tokens.example" } } },
    });
    await prisma.customer.deleteMany({
      where: { email: { contains: "@test-opt-tokens.example" } },
    });
  });

  afterEach(async () => {
    // Clean up only this test file's data
    await prisma.account.deleteMany({
      where: { user: { email: { contains: "@test-opt-tokens.example" } } },
    });
    await prisma.subscription.deleteMany({
      where: { customer: { email: { contains: "@test-opt-tokens.example" } } },
    });
    await prisma.customer.deleteMany({
      where: { email: { contains: "@test-opt-tokens.example" } },
    });
  });

  /**
   * **Validates: Requirements 4.3, 4.4**
   *
   * Property 8: Optional OAuth tokens are stored when provided
   * For any OAuth authentication, if the provider returns refresh_token or expires_at,
   * those fields should be stored in the Account record; if not provided, those fields
   * should be null.
   */
  it("stores refresh_token when provided by OAuth provider", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
          refreshToken: refreshTokenArb,
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

          // Create account with refresh_token
          const result = await testAccountCreationWithOptionalTokens({
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
              refresh_token: profile.refreshToken,
            },
          });

          expect(result.success).toBe(true);

          // Property: refresh_token should be stored
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
          });

          expect(account).toBeDefined();
          expect(account!.refresh_token).toBe(profile.refreshToken);
          expect(account!.refresh_token).not.toBeNull();

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
      { numRuns: 10 }
    );
  }, 60000);

  it("stores null for refresh_token when not provided by OAuth provider", async () => {
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

          // Create account without refresh_token
          const result = await testAccountCreationWithOptionalTokens({
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
              // refresh_token not provided
            },
          });

          expect(result.success).toBe(true);

          // Property: refresh_token should be null
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
          });

          expect(account).toBeDefined();
          expect(account!.refresh_token).toBeNull();

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
      { numRuns: 10 }
    );
  }, 60000);

  it("stores expires_at when provided by OAuth provider", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
          expiresAt: expiresAtArb,
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

          // Create account with expires_at
          const result = await testAccountCreationWithOptionalTokens({
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
              expires_at: Math.floor(profile.expiresAt),
            },
          });

          expect(result.success).toBe(true);

          // Property: expires_at should be stored
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
          });

          expect(account).toBeDefined();
          expect(account!.expires_at).toBe(Math.floor(profile.expiresAt));
          expect(account!.expires_at).not.toBeNull();

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
      { numRuns: 10 }
    );
  }, 60000);

  it("stores null for expires_at when not provided by OAuth provider", async () => {
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

          // Create account without expires_at
          const result = await testAccountCreationWithOptionalTokens({
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
              // expires_at not provided
            },
          });

          expect(result.success).toBe(true);

          // Property: expires_at should be null
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
          });

          expect(account).toBeDefined();
          expect(account!.expires_at).toBeNull();

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
      { numRuns: 10 }
    );
  }, 60000);

  it("stores all optional tokens when provided by OAuth provider", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          accessToken: accessTokenArb,
          refreshToken: refreshTokenArb,
          expiresAt: expiresAtArb,
          scope: scopeArb,
          idToken: idTokenArb,
          sessionState: sessionStateArb,
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

          // Create account with all optional tokens
          const result = await testAccountCreationWithOptionalTokens({
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
              refresh_token: profile.refreshToken,
              expires_at: Math.floor(profile.expiresAt),
              scope: profile.scope,
              id_token: profile.idToken,
              session_state: profile.sessionState,
            },
          });

          expect(result.success).toBe(true);

          // Property: All optional tokens should be stored
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
          });

          expect(account).toBeDefined();
          expect(account!.refresh_token).toBe(profile.refreshToken);
          expect(account!.expires_at).toBe(Math.floor(profile.expiresAt));
          expect(account!.scope).toBe(profile.scope);
          expect(account!.id_token).toBe(profile.idToken);
          expect(account!.session_state).toBe(profile.sessionState);

          // All should be non-null
          expect(account!.refresh_token).not.toBeNull();
          expect(account!.expires_at).not.toBeNull();
          expect(account!.scope).not.toBeNull();
          expect(account!.id_token).not.toBeNull();
          expect(account!.session_state).not.toBeNull();

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
      { numRuns: 10 }
    );
  }, 60000);

  it("stores null for all optional tokens when none are provided", async () => {
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

          // Create account without any optional tokens
          const result = await testAccountCreationWithOptionalTokens({
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
              // No optional tokens provided
            },
          });

          expect(result.success).toBe(true);

          // Property: All optional tokens should be null
          const account = await prisma.account.findUnique({
            where: { id: result.accountId },
          });

          expect(account).toBeDefined();
          expect(account!.refresh_token).toBeNull();
          expect(account!.expires_at).toBeNull();
          expect(account!.scope).toBeNull();
          expect(account!.id_token).toBeNull();
          expect(account!.session_state).toBeNull();

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
      { numRuns: 10 }
    );
  }, 60000);
});
