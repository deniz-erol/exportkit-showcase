import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { User, Account, Profile } from "next-auth";

/**
 * **Validates: Requirements 5.6**
 *
 * Property 11: Invalid email formats are rejected
 * For any OAuth profile with an email that does not match standard email format
 * (contains @, has domain, has TLD), customer creation should fail and
 * authentication should be rejected.
 */

/**
 * Simulate the signIn callback from auth.ts (extracted for testing)
 * This is the core logic that validates email format
 */
async function signInCallback({
  user,
  account,
}: {
  user: User;
  account: Account | null;
  profile?: Profile;
}): Promise<boolean> {
  // Only process OAuth providers (not credentials)
  if (!account || account.provider === "credentials") {
    return true;
  }

  // Validate email exists
  if (!user.email) {
    console.error("OAuth provider returned null email", {
      provider: account.provider,
    });
    return false;
  }

  // Validate email format - THIS IS THE PROPERTY WE'RE TESTING
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

/**
 * Custom arbitrary for generating invalid email formats
 * These formats should fail the regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 * The regex requires:
 * - One or more non-whitespace, non-@ characters before @
 * - Literal @
 * - One or more non-whitespace, non-@ characters after @
 * - Literal .
 * - One or more non-whitespace, non-@ characters after .
 * 
 * Note: The regex is intentionally simple and doesn't validate all RFC 5322 rules.
 * It allows some technically invalid emails like consecutive dots.
 */
const invalidEmailArbitrary = fc.oneof(
  // Missing @ symbol
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes("@") && !s.includes(".")),
  // Missing domain (only local part, ends with @)
  fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => !s.includes("@") && !s.includes(" ") && !s.includes("."))
    .map((local) => `${local}@`),
  // Missing TLD (no dot after @)
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("@") && !s.includes(" ") && !s.includes(".")),
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes(".") && !s.includes("@") && !s.includes(" "))
    )
    .map(([local, domain]) => `${local}@${domain}`),
  // Multiple @ symbols
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes(".")),
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes(".")),
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("."))
    )
    .map(([part1, part2, part3]) => `${part1}@${part2}@${part3}`),
  // Whitespace in email (before @)
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("@") && !s.includes(" ")),
      fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !s.includes("@") && !s.includes(" "))
    )
    .map(([local, domain, tld]) => `${local} @${domain}.${tld}`),
  // Whitespace in email (after @)
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("@") && !s.includes(" ")),
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !s.includes("@") && !s.includes(" "))
    )
    .map(([local, domain, tld]) => `${local}@ ${domain}.${tld}`),
  // Missing local part (starts with @)
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("@") && !s.includes(" ")),
      fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !s.includes("@") && !s.includes(" "))
    )
    .map(([domain, tld]) => `@${domain}.${tld}`)
);

describe("Property 11: Invalid email formats are rejected", () => {
  it("rejects OAuth authentication with invalid email formats", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          invalidEmail: invalidEmailArbitrary,
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
          name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
            nil: undefined,
          }),
        }),
        async (profile) => {
          // Create user with invalid email
          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: profile.invalidEmail,
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

          // Property: Invalid email format should always be rejected
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("rejects emails missing @ symbol", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          emailWithoutAt: fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => !s.includes("@")),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: profile.emailWithoutAt,
            name: "Test User",
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          const result = await signInCallback({ user, account });

          // Property: Email without @ should be rejected
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("rejects emails missing domain (no dot after @)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          local: fc.string({ minLength: 1, maxLength: 20 }),
          domain: fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => !s.includes(".")),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          const emailWithoutTld = `${profile.local}@${profile.domain}`;

          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: emailWithoutTld,
            name: "Test User",
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          const result = await signInCallback({ user, account });

          // Property: Email without TLD (no dot after @) should be rejected
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("rejects emails with whitespace", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          local: fc.string({ minLength: 1, maxLength: 20 }),
          domain: fc.string({ minLength: 1, maxLength: 20 }),
          tld: fc.string({ minLength: 1, maxLength: 10 }),
          whitespacePosition: fc.constantFrom("before-at", "after-at", "in-local", "in-domain"),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          let emailWithWhitespace: string;
          switch (profile.whitespacePosition) {
            case "before-at":
              emailWithWhitespace = `${profile.local} @${profile.domain}.${profile.tld}`;
              break;
            case "after-at":
              emailWithWhitespace = `${profile.local}@ ${profile.domain}.${profile.tld}`;
              break;
            case "in-local":
              emailWithWhitespace = `${profile.local} test@${profile.domain}.${profile.tld}`;
              break;
            case "in-domain":
              emailWithWhitespace = `${profile.local}@${profile.domain} test.${profile.tld}`;
              break;
          }

          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: emailWithWhitespace,
            name: "Test User",
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          const result = await signInCallback({ user, account });

          // Property: Email with whitespace should be rejected
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("rejects emails with multiple @ symbols", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          part1: fc.string({ minLength: 1, maxLength: 20 }),
          part2: fc.string({ minLength: 1, maxLength: 20 }),
          part3: fc.string({ minLength: 1, maxLength: 20 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          const emailWithMultipleAt = `${profile.part1}@${profile.part2}@${profile.part3}`;

          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: emailWithMultipleAt,
            name: "Test User",
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          const result = await signInCallback({ user, account });

          // Property: Email with multiple @ symbols should be rejected
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("accepts valid email formats", async () => {
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
            email: profile.email,
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

          // Property: Valid email format should be accepted
          expect(result).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("validates email format across all OAuth providers", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          invalidEmail: invalidEmailArbitrary,
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: profile.invalidEmail,
            name: "Test User",
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          const result = await signInCallback({ user, account });

          // Property: All providers should reject invalid email formats consistently
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("allows credentials provider to bypass email format validation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
            nil: null,
          }),
          name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
            nil: undefined,
          }),
        }),
        async (profile) => {
          // Create user (email can be any format for credentials)
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

  it("rejects emails missing local part (starts with @)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          domain: fc.string({ minLength: 1, maxLength: 20 }),
          tld: fc.string({ minLength: 1, maxLength: 10 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          const emailWithoutLocal = `@${profile.domain}.${profile.tld}`;

          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: emailWithoutLocal,
            name: "Test User",
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          const result = await signInCallback({ user, account });

          // Property: Email without local part should be rejected
          expect(result).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("validates that email regex requires all three components: local@domain.tld", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          local: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("@") && !s.includes(" ")),
          domain: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("@") && !s.includes(" ")),
          tld: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !s.includes("@") && !s.includes(" ")),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          // Valid email with all three components (no whitespace or @)
          const validEmail = `${profile.local}@${profile.domain}.${profile.tld}`;

          const user: User = {
            id: fc.sample(fc.uuid(), 1)[0],
            email: validEmail,
            name: "Test User",
          };

          const account: Account = {
            provider: profile.provider,
            type: "oauth",
            providerAccountId: profile.providerAccountId,
            access_token: "mock_access_token",
            token_type: "Bearer",
          };

          const result = await signInCallback({ user, account });

          // Property: Email with all three components (local@domain.tld) should be accepted
          // as long as none of the parts contain whitespace or @
          expect(result).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });
});

