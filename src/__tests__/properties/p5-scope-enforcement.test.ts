import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../api/middleware/auth.js";
import { checkScope } from "../../api/middleware/scope.js";

/**
 * **Validates: Requirements SEC-02 (17.2)**
 *
 * Property P5: API Key Scope Enforcement
 * For any API key scope and HTTP method combination, the scope middleware
 * allows the request if and only if the method is in the scope's allowed set
 * (READ: GET only; WRITE: GET+POST; ADMIN: all methods).
 */

// The expected allowed methods per scope (matching the middleware's logic)
// Note: HEAD is also allowed alongside GET in the middleware implementation
const EXPECTED_ALLOWED: Record<string, ReadonlySet<string>> = {
  READ: new Set(["GET", "HEAD"]),
  WRITE: new Set(["GET", "HEAD", "POST"]),
  ADMIN: new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]),
};

const ALL_SCOPES = ["READ", "WRITE", "ADMIN"] as const;
const ALL_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Arbitrary for a valid API key scope */
const scopeArb = fc.constantFrom(...ALL_SCOPES);

/** Arbitrary for an HTTP method */
const methodArb = fc.constantFrom(...ALL_METHODS);

describe("P5: API Key Scope Enforcement", () => {
  it("allows the request if and only if the method is in the scope's allowed set", async () => {
    await fc.assert(
      fc.asyncProperty(scopeArb, methodArb, async (scope, method) => {
        const shouldAllow = EXPECTED_ALLOWED[scope].has(method);

        // Build a minimal mock request
        const req = {
          method,
          apiKey: {
            id: "test-key",
            scope,
            customerId: "cust-1",
            name: "Test Key",
            keyHash: "hash",
            keyPrefix: "ek_",
            allowedIps: [],
            rateLimit: 100,
            lastUsedAt: null,
            expiresAt: null,
            isRevoked: false,
            createdAt: new Date(),
            customer: { id: "cust-1", name: "Test" },
          },
        } as unknown as AuthenticatedRequest;

        let nextCalled = false;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        let statusCode: number | undefined;
        let responseBody: unknown;
        const res = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          json(body: unknown) {
            responseBody = body;
            return this;
          },
        } as unknown as Response;

        // Execute the middleware
        checkScope(req, res, next);

        if (shouldAllow) {
          expect(nextCalled).toBe(true);
          expect(statusCode).toBeUndefined();
        } else {
          expect(nextCalled).toBe(false);
          expect(statusCode).toBe(403);
          expect(responseBody).toEqual({
            error: "Insufficient permissions",
            code: "FORBIDDEN",
          });
        }
      }),
      { numRuns: 100 }
    );
  });
});
