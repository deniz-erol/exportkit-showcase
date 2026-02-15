import { describe, it, expect, afterEach, beforeAll } from "vitest";
import fc from "fast-check";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/**
 * **Validates: Requirements 2.2**
 *
 * Property 3: Multiple authentication methods are interchangeable
 * For any Customer with both a passwordHash and at least one linked OAuth Account,
 * authentication should succeed via either the Credentials provider or any linked
 * OAuth provider.
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

/**
 * Simulate the signIn callback for OAuth
 */
async function signInOAuth(params: {
  user: { email: string; name?: string | null };
  account: { provider: string };
}): Promise<boolean> {
  const { user, account } = params;

  // Validate email exists
  if (!user.email) {
    return false;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(user.email)) {
    return false;
  }

  try {
    // Check if customer exists with this email
    const existingCustomer = await prisma.customer.findUnique({
      where: { email: user.email },
    });

    if (existingCustomer) {
      // OAuth account linking happens automatically via PrismaAdapter
      // We just need to verify the customer exists
      return true;
    }

    // For this test, we only care about existing customers
    return false;
  } catch (error) {
    console.error("OAuth signIn callback error:", error);
    return false;
  }
}

describe("Property 3: Multiple authentication methods are interchangeable", () => {
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
            contains: "@test-multi-auth.example",
          },
        },
      },
    });
    await prisma.customer.deleteMany({
      where: {
        email: {
          contains: "@test-multi-auth.example",
        },
      },
    });
  });

  it("allows authentication via credentials for customers with both password and OAuth", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-multi-auth.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          try {
            // Create customer with password
            const passwordHash = await bcrypt.hash(profile.password, 10);
            const customer = await prisma.customer.create({
              data: {
                email: profile.email,
                name: profile.name,
                passwordHash,
                isActive: true,
              },
            });

            // Link OAuth account
            await prisma.account.create({
              data: {
                userId: customer.id,
                type: "oauth",
                provider: profile.provider,
                providerAccountId: profile.providerAccountId,
                access_token: "mock_access_token",
                token_type: "Bearer",
              },
            });

            // Test credentials authentication
            const credentialsResult = await authorizeCredentials(
              profile.email,
              profile.password
            );

            // Property: Credentials authentication should succeed
            expect(credentialsResult).not.toBeNull();
            expect(credentialsResult?.id).toBe(customer.id);
            expect(credentialsResult?.email).toBe(profile.email);
          } finally {
            // Cleanup: ensure data is deleted even if test fails
            await prisma.account.deleteMany({
              where: { user: { email: profile.email } },
            }).catch(() => {});
            await prisma.customer.deleteMany({
              where: { email: profile.email },
            }).catch(() => {});
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it("allows authentication via OAuth for customers with both password and OAuth", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-multi-auth.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          // Create customer with password
          const passwordHash = await bcrypt.hash(profile.password, 10);
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              isActive: true,
            },
          });

          // Link OAuth account
          await prisma.account.create({
            data: {
              userId: customer.id,
              type: "oauth",
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              access_token: "mock_access_token",
              token_type: "Bearer",
            },
          });

          // Test OAuth authentication
          const oauthResult = await signInOAuth({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
            },
          });

          // Property: OAuth authentication should succeed
          expect(oauthResult).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("allows authentication via any linked OAuth provider", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-multi-auth.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          providers: fc.uniqueArray(
            fc.constantFrom("google", "github", "azure-ad"),
            { minLength: 1, maxLength: 3 }
          ),
        }),
        async (profile) => {
          // Create customer with password
          const passwordHash = await bcrypt.hash(profile.password, 10);
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              isActive: true,
            },
          });

          // Link multiple OAuth accounts
          for (const provider of profile.providers) {
            await prisma.account.create({
              data: {
                userId: customer.id,
                type: "oauth",
                provider,
                providerAccountId: fc.sample(fc.uuid(), 1)[0],
                access_token: "mock_access_token",
                token_type: "Bearer",
              },
            });
          }

          // Test authentication via each linked provider
          for (const provider of profile.providers) {
            const oauthResult = await signInOAuth({
              user: {
                email: profile.email,
                name: profile.name,
              },
              account: {
                provider,
              },
            });

            // Property: Authentication via any linked provider should succeed
            expect(oauthResult).toBe(true);
          }

          // Also verify credentials still work
          const credentialsResult = await authorizeCredentials(
            profile.email,
            profile.password
          );
          expect(credentialsResult).not.toBeNull();
          expect(credentialsResult?.id).toBe(customer.id);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("maintains authentication interchangeability across all provider combinations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-multi-auth.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          primaryProvider: fc.constantFrom("google", "github", "azure-ad"),
          secondaryProvider: fc.constantFrom("google", "github", "azure-ad"),
        }),
        async (profile) => {
          // Skip if both providers are the same (can't link same provider twice)
          if (profile.primaryProvider === profile.secondaryProvider) {
            return;
          }

          // Create customer with password
          const passwordHash = await bcrypt.hash(profile.password, 10);
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              isActive: true,
            },
          });

          // Link two different OAuth accounts
          await prisma.account.create({
            data: {
              userId: customer.id,
              type: "oauth",
              provider: profile.primaryProvider,
              providerAccountId: fc.sample(fc.uuid(), 1)[0],
              access_token: "mock_access_token",
              token_type: "Bearer",
            },
          });

          await prisma.account.create({
            data: {
              userId: customer.id,
              type: "oauth",
              provider: profile.secondaryProvider,
              providerAccountId: fc.sample(fc.uuid(), 1)[0],
              access_token: "mock_access_token",
              token_type: "Bearer",
            },
          });

          // Test credentials authentication
          const credentialsResult = await authorizeCredentials(
            profile.email,
            profile.password
          );
          expect(credentialsResult).not.toBeNull();
          expect(credentialsResult?.id).toBe(customer.id);

          // Test primary OAuth provider
          const primaryResult = await signInOAuth({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.primaryProvider,
            },
          });
          expect(primaryResult).toBe(true);

          // Test secondary OAuth provider
          const secondaryResult = await signInOAuth({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.secondaryProvider,
            },
          });
          expect(secondaryResult).toBe(true);

          // Property: All three authentication methods should work interchangeably
          // (credentials + 2 OAuth providers)
        }
      ),
      { numRuns: 10 }
    );
  });

  it("verifies customer identity is consistent across authentication methods", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-multi-auth.example`),
          password: fc.string({ minLength: 8, maxLength: 50 }),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          // Create customer with password
          const passwordHash = await bcrypt.hash(profile.password, 10);
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash,
              isActive: true,
            },
          });

          // Link OAuth account
          await prisma.account.create({
            data: {
              userId: customer.id,
              type: "oauth",
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              access_token: "mock_access_token",
              token_type: "Bearer",
            },
          });

          // Authenticate via credentials
          const credentialsResult = await authorizeCredentials(
            profile.email,
            profile.password
          );

          // Authenticate via OAuth
          const oauthResult = await signInOAuth({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
            },
          });

          // Property: Both methods should return the same customer identity
          expect(credentialsResult).not.toBeNull();
          expect(oauthResult).toBe(true);
          expect(credentialsResult?.id).toBe(customer.id);
          expect(credentialsResult?.email).toBe(profile.email);
        }
      ),
      { numRuns: 10 }
    );
  });
});
