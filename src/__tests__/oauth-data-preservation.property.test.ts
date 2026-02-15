import { describe, it, expect, afterEach, beforeAll } from "vitest";
import fc from "fast-check";
import { PrismaClient } from "@prisma/client";

/**
 * **Validates: Requirements 2.3**
 *
 * Property 4: Account linking preserves customer data
 * For any Customer with existing API keys, subscriptions, and other related data,
 * linking an OAuth account should not modify or delete any existing customer data
 * (invariant property).
 */

// Use a standard Prisma client for testing (no Neon adapter)
const prisma = new PrismaClient();

/**
 * Simulate the signIn callback for OAuth account linking
 */
async function signInOAuth(params: {
  user: { email: string; name?: string | null };
  account: { provider: string; providerAccountId: string };
  profile?: { email_verified?: boolean };
}): Promise<boolean> {
  const { user, account, profile } = params;

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
      // Update emailVerified if OAuth provider verified it
      if (profile?.email_verified) {
        await prisma.customer.update({
          where: { id: existingCustomer.id },
          data: { emailVerified: new Date() },
        });
      }

      // Check if account already exists (to avoid unique constraint violation)
      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
      });

      // Only create account if it doesn't exist
      if (!existingAccount) {
        await prisma.account.create({
          data: {
            userId: existingCustomer.id,
            type: "oauth",
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          },
        });
      }

      return true;
    }

    return false;
  } catch (error) {
    console.error("OAuth signIn callback error:", error);
    return false;
  }
}

describe("Property 4: Account linking preserves customer data", () => {
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
    // Delete in correct order to avoid foreign key constraints
    await prisma.account.deleteMany({
      where: {
        user: {
          email: {
            contains: "@test-data-preservation.example",
          },
        },
      },
    });
    await prisma.apiKey.deleteMany({
      where: {
        customer: {
          email: {
            contains: "@test-data-preservation.example",
          },
        },
      },
    });
    await prisma.subscription.deleteMany({
      where: {
        customer: {
          email: {
            contains: "@test-data-preservation.example",
          },
        },
      },
    });
    await prisma.customer.deleteMany({
      where: {
        email: {
          contains: "@test-data-preservation.example",
        },
      },
    });
  });

  it("preserves customer profile data during OAuth account linking", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-data-preservation.example`),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          brandColor: fc.integer({ min: 0, max: 0xFFFFFF }).map(n => `#${n.toString(16).padStart(6, '0')}`),
          brandLogo: fc.webUrl(),
          brandFooter: fc.string({ minLength: 1, maxLength: 500 }),
          webhookUrl: fc.webUrl(),
          webhookSecret: fc.string({ minLength: 32, maxLength: 64 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          // Create customer with profile data
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash: "hashed_password",
              brandColor: profile.brandColor,
              brandLogo: profile.brandLogo,
              brandFooter: profile.brandFooter,
              webhookUrl: profile.webhookUrl,
              webhookSecret: profile.webhookSecret,
              webhookActive: true,
              emailNotifications: true,
              isActive: true,
            },
          });

          try {
            // Capture original data
            const originalData = {
              name: customer.name,
              email: customer.email,
              passwordHash: customer.passwordHash,
              brandColor: customer.brandColor,
              brandLogo: customer.brandLogo,
              brandFooter: customer.brandFooter,
              webhookUrl: customer.webhookUrl,
              webhookSecret: customer.webhookSecret,
              webhookActive: customer.webhookActive,
              emailNotifications: customer.emailNotifications,
              isActive: customer.isActive,
            };

            // Link OAuth account
            const result = await signInOAuth({
              user: {
                email: profile.email,
                name: "Different Name", // OAuth might return different name
              },
              account: {
                provider: profile.provider,
                providerAccountId: profile.providerAccountId,
              },
              profile: { email_verified: true },
            });

            expect(result).toBe(true);

            // Verify customer data is preserved
            const updatedCustomer = await prisma.customer.findUnique({
              where: { id: customer.id },
            });

            expect(updatedCustomer).not.toBeNull();
            
            // Property: All original customer data should be preserved
            expect(updatedCustomer!.name).toBe(originalData.name);
            expect(updatedCustomer!.email).toBe(originalData.email);
            expect(updatedCustomer!.passwordHash).toBe(originalData.passwordHash);
            expect(updatedCustomer!.brandColor).toBe(originalData.brandColor);
            expect(updatedCustomer!.brandLogo).toBe(originalData.brandLogo);
            expect(updatedCustomer!.brandFooter).toBe(originalData.brandFooter);
            expect(updatedCustomer!.webhookUrl).toBe(originalData.webhookUrl);
            expect(updatedCustomer!.webhookSecret).toBe(originalData.webhookSecret);
            expect(updatedCustomer!.webhookActive).toBe(originalData.webhookActive);
            expect(updatedCustomer!.emailNotifications).toBe(originalData.emailNotifications);
            expect(updatedCustomer!.isActive).toBe(originalData.isActive);
          } finally {
            // Cleanup: Delete customer and related records
            await prisma.account.deleteMany({
              where: { userId: customer.id },
            });
            await prisma.customer.delete({
              where: { id: customer.id },
            }).catch(() => {});
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it("preserves API keys during OAuth account linking", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-data-preservation.example`),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          apiKeyCount: fc.integer({ min: 1, max: 5 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          // Create customer
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash: "hashed_password",
              isActive: true,
            },
          });

          // Create multiple API keys
          const apiKeys = [];
          for (let i = 0; i < profile.apiKeyCount; i++) {
            const apiKey = await prisma.apiKey.create({
              data: {
                customerId: customer.id,
                name: `API Key ${i + 1}`,
                keyHash: `hash_${i}_${Date.now()}`,
                keyPrefix: `ek_${i}`,
                rateLimit: 100 + i * 10,
              },
            });
            apiKeys.push(apiKey);
          }

          // Link OAuth account
          const result = await signInOAuth({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
            },
          });

          expect(result).toBe(true);

          // Verify all API keys are preserved
          const preservedApiKeys = await prisma.apiKey.findMany({
            where: { customerId: customer.id },
            orderBy: { createdAt: "asc" },
          });

          // Property: All API keys should be preserved
          expect(preservedApiKeys).toHaveLength(profile.apiKeyCount);
          
          for (let i = 0; i < profile.apiKeyCount; i++) {
            expect(preservedApiKeys[i].id).toBe(apiKeys[i].id);
            expect(preservedApiKeys[i].name).toBe(apiKeys[i].name);
            expect(preservedApiKeys[i].keyHash).toBe(apiKeys[i].keyHash);
            expect(preservedApiKeys[i].keyPrefix).toBe(apiKeys[i].keyPrefix);
            expect(preservedApiKeys[i].rateLimit).toBe(apiKeys[i].rateLimit);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it("preserves subscription data during OAuth account linking", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-data-preservation.example`),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          // Create customer
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash: "hashed_password",
              isActive: true,
            },
          });

          // Get Free plan
          const freePlan = await prisma.plan.findUnique({
            where: { tier: "FREE" },
          });

          expect(freePlan).not.toBeNull();

          // Create subscription
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          const subscription = await prisma.subscription.create({
            data: {
              customerId: customer.id,
              planId: freePlan!.id,
              status: "active",
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
          });

          // Link OAuth account
          const result = await signInOAuth({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
            },
          });

          expect(result).toBe(true);

          // Verify subscription is preserved
          const preservedSubscription = await prisma.subscription.findUnique({
            where: { customerId: customer.id },
          });

          // Property: Subscription should be preserved with all original data
          expect(preservedSubscription).not.toBeNull();
          expect(preservedSubscription!.id).toBe(subscription.id);
          expect(preservedSubscription!.planId).toBe(subscription.planId);
          expect(preservedSubscription!.status).toBe(subscription.status);
          expect(preservedSubscription!.currentPeriodStart.getTime()).toBe(
            subscription.currentPeriodStart.getTime()
          );
          expect(preservedSubscription!.currentPeriodEnd.getTime()).toBe(
            subscription.currentPeriodEnd.getTime()
          );
        }
      ),
      { numRuns: 10 }
    );
  });

  it("preserves all related data simultaneously during OAuth account linking", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-data-preservation.example`),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          apiKeyCount: fc.integer({ min: 1, max: 3 }),
          brandColor: fc.integer({ min: 0, max: 0xFFFFFF }).map(n => `#${n.toString(16).padStart(6, '0')}`),
          webhookUrl: fc.webUrl(),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          // Create customer with profile data
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash: "hashed_password",
              brandColor: profile.brandColor,
              webhookUrl: profile.webhookUrl,
              webhookActive: true,
              isActive: true,
            },
          });

          // Create API keys
          const apiKeys = [];
          for (let i = 0; i < profile.apiKeyCount; i++) {
            const apiKey = await prisma.apiKey.create({
              data: {
                customerId: customer.id,
                name: `API Key ${i + 1}`,
                keyHash: `hash_${i}_${Date.now()}`,
                keyPrefix: `ek_${i}`,
              },
            });
            apiKeys.push(apiKey);
          }

          // Create subscription
          const freePlan = await prisma.plan.findUnique({
            where: { tier: "FREE" },
          });
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          const subscription = await prisma.subscription.create({
            data: {
              customerId: customer.id,
              planId: freePlan!.id,
              status: "active",
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
          });

          // Link OAuth account
          const result = await signInOAuth({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
            },
          });

          expect(result).toBe(true);

          // Verify all data is preserved
          const updatedCustomer = await prisma.customer.findUnique({
            where: { id: customer.id },
            include: {
              apiKeys: true,
              subscription: true,
              accounts: true,
            },
          });

          expect(updatedCustomer).not.toBeNull();

          // Property: All customer data should be preserved
          expect(updatedCustomer!.brandColor).toBe(profile.brandColor);
          expect(updatedCustomer!.webhookUrl).toBe(profile.webhookUrl);
          expect(updatedCustomer!.webhookActive).toBe(true);
          expect(updatedCustomer!.passwordHash).toBe("hashed_password");

          // Property: All API keys should be preserved
          expect(updatedCustomer!.apiKeys).toHaveLength(profile.apiKeyCount);

          // Property: Subscription should be preserved
          expect(updatedCustomer!.subscription).not.toBeNull();
          expect(updatedCustomer!.subscription!.id).toBe(subscription.id);

          // Property: OAuth account should be linked
          expect(updatedCustomer!.accounts).toHaveLength(1);
          expect(updatedCustomer!.accounts[0].provider).toBe(profile.provider);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("preserves customer ID during OAuth account linking", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-data-preservation.example`),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          // Create customer
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash: "hashed_password",
              isActive: true,
            },
          });

          const originalId = customer.id;

          // Link OAuth account
          const result = await signInOAuth({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
            },
          });

          expect(result).toBe(true);

          // Verify customer ID is unchanged
          const updatedCustomer = await prisma.customer.findUnique({
            where: { email: profile.email },
          });

          // Property: Customer ID should never change
          expect(updatedCustomer).not.toBeNull();
          expect(updatedCustomer!.id).toBe(originalId);

          // Verify no duplicate customer was created
          const customerCount = await prisma.customer.count({
            where: { email: profile.email },
          });
          expect(customerCount).toBe(1);
        }
      ),
      { numRuns: 10 }
    );
  });

  it("preserves timestamps during OAuth account linking", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc
            .emailAddress()
            .map((e) => `${e.split("@")[0]}@test-data-preservation.example`),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          // Create customer
          const customer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: profile.name,
              passwordHash: "hashed_password",
              isActive: true,
            },
          });

          const originalCreatedAt = customer.createdAt;

          // Wait a bit to ensure updatedAt would change if modified
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Link OAuth account
          const result = await signInOAuth({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
            },
          });

          expect(result).toBe(true);

          // Verify timestamps
          const updatedCustomer = await prisma.customer.findUnique({
            where: { id: customer.id },
          });

          expect(updatedCustomer).not.toBeNull();

          // Property: createdAt should never change
          expect(updatedCustomer!.createdAt.getTime()).toBe(
            originalCreatedAt.getTime()
          );

          // Note: updatedAt may change due to emailVerified update, which is expected
        }
      ),
      { numRuns: 10 }
    );
  });
});
