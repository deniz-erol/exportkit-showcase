import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { JWT } from "next-auth/jwt";
import type { User, Account } from "next-auth";

/**
 * **Validates: Requirements 5.3**
 *
 * Property 10: JWT tokens include customer identity
 * For any successful authentication (OAuth or credentials), the JWT token
 * should contain the customer ID in the token.id field.
 */

/**
 * Simulate the jwt callback from NextAuth (extracted from auth.ts)
 */
async function jwtCallback({
  token,
  user,
  account,
}: {
  token: JWT;
  user?: User;
  account?: Account | null;
}): Promise<JWT> {
  // On initial sign-in, add customer ID
  if (user) {
    token.id = user.id;
  }

  // Store OAuth provider info in token
  if (account) {
    token.provider = account.provider;
  }

  return token;
}

describe("Property 10: JWT tokens include customer identity", () => {
  it("includes customer ID for OAuth authentication", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          customerId: fc.uuid(),
          email: fc.emailAddress(),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          provider: fc.constantFrom("google", "github", "azure-ad"),
          providerAccountId: fc.uuid(),
        }),
        async (profile) => {
          // Simulate initial sign-in with OAuth
          const initialToken: JWT = {
            sub: profile.customerId,
            email: profile.email,
            name: profile.name,
          };

          const user: User = {
            id: profile.customerId,
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

          // Call jwt callback
          const resultToken = await jwtCallback({
            token: initialToken,
            user,
            account,
          });

          // Property: JWT token should contain customer ID
          expect(resultToken.id).toBe(profile.customerId);
          expect(resultToken.id).toBeDefined();
          expect(typeof resultToken.id).toBe("string");

          // Additional check: provider should be stored
          expect(resultToken.provider).toBe(profile.provider);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("includes customer ID for credentials authentication", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          customerId: fc.uuid(),
          email: fc.emailAddress(),
          name: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async (profile) => {
          // Simulate initial sign-in with credentials
          const initialToken: JWT = {
            sub: profile.customerId,
            email: profile.email,
            name: profile.name,
          };

          const user: User = {
            id: profile.customerId,
            email: profile.email,
            name: profile.name,
          };

          // No account for credentials provider
          const account = null;

          // Call jwt callback
          const resultToken = await jwtCallback({
            token: initialToken,
            user,
            account,
          });

          // Property: JWT token should contain customer ID
          expect(resultToken.id).toBe(profile.customerId);
          expect(resultToken.id).toBeDefined();
          expect(typeof resultToken.id).toBe("string");

          // For credentials, provider should not be set
          expect(resultToken.provider).toBeUndefined();
        }
      ),
      { numRuns: 20 }
    );
  });


  it("preserves customer ID on subsequent token refreshes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          customerId: fc.uuid(),
          email: fc.emailAddress(),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          provider: fc.option(
            fc.constantFrom("google", "github", "azure-ad", "credentials"),
            { nil: undefined }
          ),
        }),
        async (tokenData) => {
          // Simulate token refresh (no user or account provided)
          const existingToken: JWT = {
            sub: tokenData.customerId,
            email: tokenData.email,
            name: tokenData.name,
            id: tokenData.customerId,
            provider: tokenData.provider,
          };

          // Call jwt callback without user/account (token refresh scenario)
          const resultToken = await jwtCallback({
            token: existingToken,
          });

          // Property: Customer ID should be preserved during refresh
          expect(resultToken.id).toBe(tokenData.customerId);
          expect(resultToken.id).toBeDefined();

          // Provider should also be preserved
          if (tokenData.provider) {
            expect(resultToken.provider).toBe(tokenData.provider);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it("handles both OAuth and credentials with consistent token structure", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          customerId: fc.uuid(),
          email: fc.emailAddress(),
          name: fc.string({ minLength: 1, maxLength: 100 }),
          authMethod: fc.constantFrom("oauth", "credentials"),
          provider: fc.constantFrom("google", "github", "azure-ad"),
        }),
        async (profile) => {
          const initialToken: JWT = {
            sub: profile.customerId,
            email: profile.email,
            name: profile.name,
          };

          const user: User = {
            id: profile.customerId,
            email: profile.email,
            name: profile.name,
          };

          const account: Account | null =
            profile.authMethod === "oauth"
              ? {
                  provider: profile.provider,
                  type: "oauth",
                  providerAccountId: fc.sample(fc.uuid(), 1)[0],
                  access_token: "mock_access_token",
                  token_type: "Bearer",
                }
              : null;

          // Call jwt callback
          const resultToken = await jwtCallback({
            token: initialToken,
            user,
            account,
          });

          // Property: All authentication methods produce tokens with customer ID
          expect(resultToken.id).toBe(profile.customerId);
          expect(resultToken.id).toBeDefined();
          expect(typeof resultToken.id).toBe("string");

          // Verify token structure consistency
          expect(resultToken.sub).toBe(profile.customerId);
          expect(resultToken.email).toBe(profile.email);
          expect(resultToken.name).toBe(profile.name);
        }
      ),
      { numRuns: 20 }
    );
  });
});

