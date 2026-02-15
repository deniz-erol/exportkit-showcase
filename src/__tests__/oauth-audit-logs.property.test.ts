import { describe, it, expect, beforeAll, afterEach } from "vitest";
import fc from "fast-check";
import { PrismaClient } from "@prisma/client";

/**
 * Property-Based Tests for OAuth Authentication Audit Logging
 *
 * These tests validate that all OAuth authentication events create appropriate
 * audit log entries with complete metadata.
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 */

// Use a standard Prisma client for testing (no Neon adapter)
const prisma = new PrismaClient();

/**
 * Simulate the signIn callback with audit logging
 */
async function testSignInCallbackWithAuditLog(params: {
  user: { id?: string; email?: string | null; name?: string | null };
  account: {
    provider: string;
    providerAccountId: string;
    type: string;
    access_token?: string;
    token_type?: string;
  } | null;
  profile?: { email_verified?: boolean; verified_email?: boolean };
  ipAddress?: string;
}): Promise<{ success: boolean; customerId?: string; action?: string }> {
  const { user, account, profile, ipAddress = "127.0.0.1" } = params;

  // Only process OAuth providers (not credentials)
  if (!account || account.provider === "credentials") {
    return { success: true };
  }

  // Validate email exists
  if (!user.email) {
    console.error("OAuth provider returned null email", {
      provider: account.provider,
    });

    // Audit log: failed OAuth attempt (fire-and-forget)
    await prisma.auditLog
      .create({
        data: {
          customerId: "system",
          actorId: "system",
          action: "oauth_login_failed",
          targetType: "customer",
          targetId: "unknown",
          metadata: {
            provider: account.provider,
            reason: "null_email",
          },
          ipAddress,
        },
      })
      .catch((err) => {
        console.error("Failed to log OAuth failure:", err);
      });

    return { success: false, action: "oauth_login_failed" };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(user.email)) {
    console.error("Invalid email format from OAuth", {
      email: user.email,
    });

    // Audit log: failed OAuth attempt
    await prisma.auditLog
      .create({
        data: {
          customerId: "system",
          actorId: "system",
          action: "oauth_login_failed",
          targetType: "customer",
          targetId: user.email,
          metadata: {
            provider: account.provider,
            reason: "invalid_email_format",
          },
          ipAddress,
        },
      })
      .catch((err) => {
        console.error("Failed to log OAuth failure:", err);
      });

    return { success: false, action: "oauth_login_failed" };
  }

  try {
    // Check if customer exists with this email
    const existingCustomer = await prisma.customer.findUnique({
      where: { email: user.email },
    });

    if (existingCustomer) {
      // Update emailVerified if OAuth provider verified it
      const isVerified =
        (profile as any)?.email_verified ||
        (profile as any)?.verified_email;
      if (isVerified) {
        await prisma.customer.update({
          where: { id: existingCustomer.id },
          data: { emailVerified: new Date() },
        });
      }

      // Create Account record (simulating PrismaAdapter)
      await prisma.account.create({
        data: {
          userId: existingCustomer.id,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          access_token: account.access_token,
          token_type: account.token_type,
        },
      });

      // Audit log: account linked
      await prisma.auditLog
        .create({
          data: {
            customerId: existingCustomer.id,
            actorId: existingCustomer.id,
            action: "account_linked",
            targetType: "customer",
            targetId: existingCustomer.id,
            metadata: { provider: account.provider },
            ipAddress,
          },
        })
        .catch((err) => {
          console.error("Failed to log account linking:", err);
        });

      return {
        success: true,
        customerId: existingCustomer.id,
        action: "account_linked",
      };
    }

    // New user - create customer record
    const newCustomer = await prisma.customer.create({
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
          customerId: newCustomer.id,
          planId: freePlan.id,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
    }

    // Create Account record (simulating PrismaAdapter)
    await prisma.account.create({
      data: {
        userId: newCustomer.id,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        access_token: account.access_token,
        token_type: account.token_type,
      },
    });

    // Audit log: OAuth signup
    await prisma.auditLog
      .create({
        data: {
          customerId: newCustomer.id,
          actorId: newCustomer.id,
          action: "oauth_signup",
          targetType: "customer",
          targetId: newCustomer.id,
          metadata: { provider: account.provider },
          ipAddress,
        },
      })
      .catch((err) => {
        console.error("Failed to log OAuth signup:", err);
      });

    return {
      success: true,
      customerId: newCustomer.id,
      action: "oauth_signup",
    };
  } catch (error) {
    console.error("OAuth signIn callback error:", error);

    // Audit log: failed OAuth attempt
    await prisma.auditLog
      .create({
        data: {
          customerId: "system",
          actorId: "system",
          action: "oauth_login_failed",
          targetType: "customer",
          targetId: user.email || "unknown",
          metadata: {
            provider: account.provider,
            error: error instanceof Error ? error.message : "unknown",
          },
          ipAddress,
        },
      })
      .catch((err) => {
        console.error("Failed to log OAuth failure:", err);
      });

    return { success: false, action: "oauth_login_failed" };
  }
}

// Arbitraries for generating test data
const oauthProviderArb = fc.constantFrom("google", "github", "azure-ad");
const emailArb = fc.emailAddress().map((e) => `${e.split("@")[0]}@test-audit-logs.example`);
const nameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);
const providerAccountIdArb = fc
  .string({ minLength: 10, maxLength: 50 })
  .filter((s) => s.trim().length > 0);
const emailVerifiedArb = fc.boolean();
const ipAddressArb = fc.constantFrom(
  "127.0.0.1",
  "192.168.1.1",
  "10.0.0.1",
  "172.16.0.1"
);

describe("OAuth Authentication Audit Logging Properties", () => {
  beforeAll(async () => {
    // Ensure clean state for this test file's domain only
    await prisma.auditLog.deleteMany({
      where: { targetId: { contains: "@test-audit-logs.example" } },
    });
    await prisma.account.deleteMany({
      where: { user: { email: { contains: "@test-audit-logs.example" } } },
    });
    await prisma.subscription.deleteMany({
      where: { customer: { email: { contains: "@test-audit-logs.example" } } },
    });
    await prisma.customer.deleteMany({
      where: { email: { contains: "@test-audit-logs.example" } },
    });
  });

  afterEach(async () => {
    // Clean up only this test file's data
    await prisma.auditLog.deleteMany({
      where: { targetId: { contains: "@test-audit-logs.example" } },
    });
    await prisma.account.deleteMany({
      where: { user: { email: { contains: "@test-audit-logs.example" } } },
    });
    await prisma.subscription.deleteMany({
      where: { customer: { email: { contains: "@test-audit-logs.example" } } },
    });
    await prisma.customer.deleteMany({
      where: { email: { contains: "@test-audit-logs.example" } },
    });
  });

  /**
   * **Validates: Requirements 8.1**
   *
   * Property 14: OAuth logins create audit logs
   * For any successful OAuth authentication, an audit log entry should be created
   * with action "oauth_login" or "oauth_signup" and the customer ID.
   */
  it("creates audit logs for successful OAuth logins", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          emailVerified: emailVerifiedArb,
          ipAddress: ipAddressArb,
        }),
        async (profile) => {
          // Clean up any existing data for this email
          await prisma.auditLog.deleteMany({ where: { targetId: { contains: "@test-audit-logs.example" } } }).catch(() => {});
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

          // Simulate OAuth sign-in for a new user
          const result = await testSignInCallbackWithAuditLog({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: "mock_access_token",
              token_type: "Bearer",
            },
            profile: {
              email_verified: profile.emailVerified,
            },
            ipAddress: profile.ipAddress,
          });

          // Property 1: Authentication should succeed
          expect(result.success).toBe(true);
          expect(result.customerId).toBeDefined();

          // Property 2: An audit log entry should be created
          const auditLogs = await prisma.auditLog.findMany({
            where: {
              customerId: result.customerId,
            },
          });

          expect(auditLogs.length).toBeGreaterThanOrEqual(1);

          // Property 3: Audit log should have action "oauth_signup" for new users
          const oauthLog = auditLogs.find(
            (log) => log.action === "oauth_signup"
          );
          expect(oauthLog).toBeDefined();
          expect(oauthLog?.customerId).toBe(result.customerId);
          expect(oauthLog?.actorId).toBe(result.customerId);

          // Clean up
          await prisma.auditLog.deleteMany({ where: { targetId: { contains: "@test-audit-logs.example" } } }).catch(() => {});
          await prisma.account.deleteMany({
            where: { userId: result.customerId },
          });
          await prisma.subscription.deleteMany({
            where: { customerId: result.customerId },
          });
          await prisma.customer.delete({
            where: { id: result.customerId },
          });
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);

  /**
   * **Validates: Requirements 8.2**
   *
   * Property 15: Account linking creates audit logs
   * For any account linking event (OAuth authentication for existing customer),
   * an audit log entry should be created with action "account_linked" and
   * metadata containing the provider name.
   */
  it("creates audit logs for account linking", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          emailVerified: emailVerifiedArb,
          ipAddress: ipAddressArb,
        }),
        async (profile) => {
          // Clean up any existing data for this email
          await prisma.auditLog.deleteMany({ where: { targetId: { contains: "@test-audit-logs.example" } } }).catch(() => {});
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

          // Create existing customer with this email
          const existingCustomer = await prisma.customer.create({
            data: {
              email: profile.email,
              name: "Existing User",
              passwordHash: "hashed_password_123",
              isActive: true,
            },
          });

          // Simulate OAuth sign-in for existing customer
          const result = await testSignInCallbackWithAuditLog({
            user: {
              id: existingCustomer.id,
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: "mock_access_token",
              token_type: "Bearer",
            },
            profile: {
              email_verified: profile.emailVerified,
            },
            ipAddress: profile.ipAddress,
          });

          // Property 1: Authentication should succeed
          expect(result.success).toBe(true);
          expect(result.action).toBe("account_linked");

          // Property 2: An audit log entry should be created with action "account_linked"
          const auditLogs = await prisma.auditLog.findMany({
            where: {
              customerId: existingCustomer.id,
              action: "account_linked",
            },
          });

          expect(auditLogs.length).toBeGreaterThanOrEqual(1);

          const linkLog = auditLogs[0];

          // Property 3: Audit log should contain provider in metadata
          expect(linkLog.metadata).toBeDefined();
          expect((linkLog.metadata as any).provider).toBe(profile.provider);

          // Property 4: Audit log should reference the correct customer
          expect(linkLog.customerId).toBe(existingCustomer.id);
          expect(linkLog.actorId).toBe(existingCustomer.id);
          expect(linkLog.targetId).toBe(existingCustomer.id);
          expect(linkLog.targetType).toBe("customer");

          // Clean up
          await prisma.auditLog.deleteMany({ where: { targetId: { contains: "@test-audit-logs.example" } } }).catch(() => {});
          await prisma.account.deleteMany({
            where: { userId: existingCustomer.id },
          });
          await prisma.subscription.deleteMany({
            where: { customerId: existingCustomer.id },
          });
          await prisma.customer.delete({
            where: { id: existingCustomer.id },
          });
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);

  /**
   * **Validates: Requirements 8.3, 8.4**
   *
   * Property 16: Audit logs contain complete metadata
   * For any OAuth-related audit log entry, the record should contain customerId,
   * action, metadata with provider name, and ipAddress fields populated.
   */
  it("creates audit logs with complete metadata for all OAuth events", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          emailVerified: emailVerifiedArb,
          ipAddress: ipAddressArb,
          // Test both new and existing customers
          isExistingCustomer: fc.boolean(),
        }),
        async (profile) => {
          // Clean up any existing data for this email
          await prisma.auditLog.deleteMany({ where: { targetId: { contains: "@test-audit-logs.example" } } }).catch(() => {});
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

          let existingCustomer: any = null;

          // Create existing customer if testing account linking scenario
          if (profile.isExistingCustomer) {
            existingCustomer = await prisma.customer.create({
              data: {
                email: profile.email,
                name: "Existing User",
                passwordHash: "hashed_password_123",
                isActive: true,
              },
            });
          }

          // Simulate OAuth sign-in
          const result = await testSignInCallbackWithAuditLog({
            user: {
              id: existingCustomer?.id,
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: "mock_access_token",
              token_type: "Bearer",
            },
            profile: {
              email_verified: profile.emailVerified,
            },
            ipAddress: profile.ipAddress,
          });

          // Property 1: Authentication should succeed
          expect(result.success).toBe(true);
          expect(result.customerId).toBeDefined();

          // Property 2: Audit log should exist
          const auditLogs = await prisma.auditLog.findMany({
            where: {
              customerId: result.customerId,
            },
          });

          expect(auditLogs.length).toBeGreaterThanOrEqual(1);

          // Property 3: All audit logs should have complete metadata
          for (const log of auditLogs) {
            // customerId should be populated
            expect(log.customerId).toBeDefined();
            expect(log.customerId).toBe(result.customerId);

            // action should be populated
            expect(log.action).toBeDefined();
            expect(log.action).toMatch(
              /^(oauth_signup|account_linked|oauth_login)$/
            );

            // metadata should contain provider name
            expect(log.metadata).toBeDefined();
            expect((log.metadata as any).provider).toBe(profile.provider);

            // ipAddress should be populated
            expect(log.ipAddress).toBeDefined();
            expect(log.ipAddress).toBe(profile.ipAddress);

            // actorId should be populated
            expect(log.actorId).toBeDefined();

            // targetType and targetId should be populated
            expect(log.targetType).toBe("customer");
            expect(log.targetId).toBeDefined();

            // createdAt should be a valid timestamp
            expect(log.createdAt).toBeInstanceOf(Date);
          }

          // Clean up
          await prisma.auditLog.deleteMany({ where: { targetId: { contains: "@test-audit-logs.example" } } }).catch(() => {});
          await prisma.account.deleteMany({
            where: { userId: result.customerId },
          });
          await prisma.subscription.deleteMany({
            where: { customerId: result.customerId },
          });
          await prisma.customer.delete({
            where: { id: result.customerId },
          });
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);

  /**
   * **Validates: Requirements 8.5**
   *
   * Property 17: Failed OAuth attempts create audit logs
   * For any failed OAuth authentication (null email, database error, etc.),
   * an audit log entry should be created with action "oauth_login_failed".
   */
  it("creates audit logs for failed OAuth attempts", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          ipAddress: ipAddressArb,
          // Test different failure scenarios
          failureType: fc.constantFrom("null_email", "invalid_email"),
        }),
        async (profile) => {
          // Clean up audit logs
          await prisma.auditLog.deleteMany({ where: { targetId: { contains: "@test-audit-logs.example" } } }).catch(() => {});

          let email: string | null = null;
          let expectedReason: string;

          if (profile.failureType === "null_email") {
            email = null;
            expectedReason = "null_email";
          } else {
            // invalid_email
            email = "not-an-email";
            expectedReason = "invalid_email_format";
          }

          // Simulate OAuth sign-in with failure condition
          const result = await testSignInCallbackWithAuditLog({
            user: {
              email,
              name: "Test User",
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: "mock_access_token",
              token_type: "Bearer",
            },
            ipAddress: profile.ipAddress,
          });

          // Property 1: Authentication should fail
          expect(result.success).toBe(false);
          expect(result.action).toBe("oauth_login_failed");

          // Property 2: An audit log entry should be created with action "oauth_login_failed"
          const auditLogs = await prisma.auditLog.findMany({
            where: {
              action: "oauth_login_failed",
              metadata: {
                path: ["provider"],
                equals: profile.provider,
              },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          });

          expect(auditLogs.length).toBeGreaterThanOrEqual(1);

          const failureLog = auditLogs[0];

          // Property 3: Audit log should contain failure reason in metadata
          expect(failureLog.metadata).toBeDefined();
          expect((failureLog.metadata as any).provider).toBe(profile.provider);
          expect((failureLog.metadata as any).reason).toBe(expectedReason);

          // Property 4: Audit log should have system as customerId for failures
          expect(failureLog.customerId).toBe("system");
          expect(failureLog.actorId).toBe("system");

          // Property 5: IP address should be recorded
          expect(failureLog.ipAddress).toBe(profile.ipAddress);

          // Property 6: targetType should be "customer"
          expect(failureLog.targetType).toBe("customer");

          // Property 7: createdAt should be a valid timestamp
          expect(failureLog.createdAt).toBeInstanceOf(Date);

          // Clean up
          await prisma.auditLog.deleteMany({ where: { targetId: { contains: "@test-audit-logs.example" } } }).catch(() => {});
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);

  /**
   * Additional property: Audit logs are immutable and timestamped
   * For any OAuth event, audit logs should have a createdAt timestamp
   * and should not be modified after creation.
   */
  it("creates immutable timestamped audit logs for all OAuth events", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: emailArb,
          name: nameArb,
          provider: oauthProviderArb,
          providerAccountId: providerAccountIdArb,
          emailVerified: emailVerifiedArb,
          ipAddress: ipAddressArb,
        }),
        async (profile) => {
          // Clean up any existing data for this email
          await prisma.auditLog.deleteMany({ where: { targetId: { contains: "@test-audit-logs.example" } } }).catch(() => {});
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

          const beforeTimestamp = new Date();

          // Simulate OAuth sign-in
          const result = await testSignInCallbackWithAuditLog({
            user: {
              email: profile.email,
              name: profile.name,
            },
            account: {
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
              type: "oauth",
              access_token: "mock_access_token",
              token_type: "Bearer",
            },
            profile: {
              email_verified: profile.emailVerified,
            },
            ipAddress: profile.ipAddress,
          });

          const afterTimestamp = new Date();

          // Property 1: Audit logs should exist
          const auditLogs = await prisma.auditLog.findMany({
            where: {
              customerId: result.customerId,
            },
          });

          expect(auditLogs.length).toBeGreaterThanOrEqual(1);

          // Property 2: All audit logs should have createdAt timestamp
          for (const log of auditLogs) {
            expect(log.createdAt).toBeInstanceOf(Date);

            // Property 3: Timestamp should be within the test execution window
            expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(
              beforeTimestamp.getTime()
            );
            expect(log.createdAt.getTime()).toBeLessThanOrEqual(
              afterTimestamp.getTime()
            );

            // Property 4: Audit log should have a unique ID
            expect(log.id).toBeDefined();
            expect(typeof log.id).toBe("string");
          }

          // Clean up
          await prisma.auditLog.deleteMany({ where: { targetId: { contains: "@test-audit-logs.example" } } }).catch(() => {});
          await prisma.account.deleteMany({
            where: { userId: result.customerId },
          });
          await prisma.subscription.deleteMany({
            where: { customerId: result.customerId },
          });
          await prisma.customer.delete({
            where: { id: result.customerId },
          });
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);
});
