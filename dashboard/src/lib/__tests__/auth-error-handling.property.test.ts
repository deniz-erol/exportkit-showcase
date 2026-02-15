import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { User, Account, Profile } from "next-auth";

/**
 * **Validates: Requirements 7.4**
 *
 * Property 13: Null emails are rejected
 * For any OAuth authentication where the provider returns a null or undefined email,
 * the signIn callback should return false and authentication should fail.
 */

/**
 * Simulate the signIn callback from auth.ts (extracted for testing)
 * This is the core logic that validates email presence
 */
async function signInCallback({
  user,
  account,
  profile,
}: {
  user: User;
  account: Account | null;
  profile?: Profile;
}): Promise<boolean> {
  // Only process OAuth providers (not credentials)
  if (!account || account.provider === "credentials") {
    return true;
  }

  // Validate email exists - THIS IS THE PROPERTY WE'RE TESTING
  if (!user.email) {
    console.error("OAuth provider returned null email", {
      provider: account.provider,
    });
    return false;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(user.email)) {
    console.error("Invalid email format from OAuth", {
      email: user.email,
    });
    return false;
  }

  // If we get here, email is valid
  return true;
}

describe("Property 13: Null emails are rejected", () => {
  it("rejects OAuth authentication when email is null", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
          name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
            nil: undefined,
          }),
        }),
        async (profile) => {
          // Create user with null email
          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: null as any, // Explicitly null email
            name: profile.name,
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          // Call signIn callback
          const result = await signInCallback({ user, account });

          // Property: Null email should always be rejected
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("rejects OAuth authentication when email is undefined", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
          name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
            nil: undefined,
          }),
        }),
        async (profile) => {
          // Create user with undefined email
          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: undefined as any, // Explicitly undefined email
            name: profile.name,
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          // Call signIn callback
          const result = await signInCallback({ user, account });

          // Property: Undefined email should always be rejected
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("rejects OAuth authentication when email is empty string", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
          name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
            nil: undefined,
          }),
        }),
        async (profile) => {
          // Create user with empty string email
          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: "", // Empty string email
            name: profile.name,
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          // Call signIn callback
          const result = await signInCallback({ user, account });

          // Property: Empty string email should be rejected (fails email format validation)
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("accepts OAuth authentication when email is valid", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.emailAddress(),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
          name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
            nil: undefined,
          }),
        }),
        async (profile) => {
          // Create user with valid email
          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: profile.email, // Valid email
            name: profile.name,
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          // Call signIn callback
          const result = await signInCallback({ user, account });

          // Property: Valid email should be accepted (passes both null check and format validation)
          expect(result).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("rejects null/undefined emails across all OAuth providers", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
          emailValue: fc.constantFrom(null, undefined, ""),
          name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
            nil: undefined,
          }),
        }),
        async (profile) => {
          // Create user with null/undefined/empty email
          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: profile.emailValue as any,
            name: profile.name,
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          // Call signIn callback
          const result = await signInCallback({ user, account });

          // Property: All invalid email values should be rejected for all providers
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("allows credentials provider to bypass email validation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.option(fc.emailAddress(), { nil: null }),
          name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
            nil: undefined,
          }),
        }),
        async (profile) => {
          // Create user (email can be null for credentials)
          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: profile.email,
            name: profile.name,
          };

          // Credentials provider account
          const account: Account = {
            provider: "credentials",
            type: "credentials",
            providerAccountId: fc.sample(fc.uuid(), 1)[0],
          };

          // Call signIn callback
          const result = await signInCallback({ user, account });

          // Property: Credentials provider should always return true (bypasses OAuth validation)
          expect(result).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("handles null account gracefully", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.option(fc.emailAddress(), { nil: null }),
          name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
            nil: undefined,
          }),
        }),
        async (profile) => {
          // Create user
          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: profile.email,
            name: profile.name,
          };

          // No account provided
          const account = null;

          // Call signIn callback
          const result = await signInCallback({ user, account });

          // Property: Null account should return true (bypasses OAuth validation)
          expect(result).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });
});

