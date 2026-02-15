import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { checkScope } from "../scope.js";
import type { AuthenticatedRequest } from "../auth.js";
import type { Response, NextFunction } from "express";

/**
 * Property-Based Test P5: API Key Scope Enforcement
 *
 * **Validates: Requirements SEC-02**
 *
 * For any API key scope and HTTP method combination, the scope middleware
 * allows the request if and only if the method is in the scope's allowed set:
 * - READ: GET, HEAD
 * - WRITE: GET, HEAD, POST
 * - ADMIN: GET, HEAD, POST, PUT, PATCH, DELETE
 */

const ALL_SCOPES = ["READ", "WRITE", "ADMIN"] as const;
type Scope = (typeof ALL_SCOPES)[number];

const ALL_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof ALL_METHODS)[number];

/** Ground-truth allowed methods per scope. */
const EXPECTED_ALLOWED: Record<Scope, ReadonlySet<Method>> = {
  READ: new Set(["GET", "HEAD"]),
  WRITE: new Set(["GET", "HEAD", "POST"]),
  ADMIN: new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]),
};

/** Arbitrary for a valid scope. */
const arbScope = fc.constantFrom(...ALL_SCOPES);

/** Arbitrary for a standard HTTP method. */
const arbMethod = fc.constantFrom(...ALL_METHODS);

function mockRequest(method: string, scope: Scope): AuthenticatedRequest {
  return {
    method,
    apiKey: {
      id: "key-test",
      customerId: "cust-test",
      scope,
    } as AuthenticatedRequest["apiKey"],
  } as AuthenticatedRequest;
}

function mockResponse(): Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  return res;
}

describe("P5: API Key Scope Enforcement", () => {
  it("allows the request iff the method is in the scope's allowed set", () => {
    fc.assert(
      fc.property(arbScope, arbMethod, (scope, method) => {
        const req = mockRequest(method, scope);
        const res = mockResponse();
        const next = vi.fn();

        checkScope(req, res, next as NextFunction);

        const shouldAllow = EXPECTED_ALLOWED[scope].has(method);

        if (shouldAllow) {
          expect(next).toHaveBeenCalledOnce();
          expect(res.status).not.toHaveBeenCalled();
        } else {
          expect(next).not.toHaveBeenCalled();
          expect(res.status).toHaveBeenCalledWith(403);
          expect(res.json).toHaveBeenCalledWith({
            error: "Insufficient permissions",
            code: "FORBIDDEN",
          });
        }
      }),
      { numRuns: 200 },
    );
  });

  it("READ scope never allows mutating methods", () => {
    const mutatingMethods = fc.constantFrom("POST" as const, "PUT" as const, "PATCH" as const, "DELETE" as const);

    fc.assert(
      fc.property(mutatingMethods, (method) => {
        const req = mockRequest(method, "READ");
        const res = mockResponse();
        const next = vi.fn();

        checkScope(req, res, next as NextFunction);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      }),
      { numRuns: 20 },
    );
  });

  it("ADMIN scope allows every standard HTTP method", () => {
    fc.assert(
      fc.property(arbMethod, (method) => {
        const req = mockRequest(method, "ADMIN");
        const res = mockResponse();
        const next = vi.fn();

        checkScope(req, res, next as NextFunction);

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
      }),
      { numRuns: 20 },
    );
  });

  it("WRITE scope allows GET, HEAD, POST but rejects PUT, PATCH, DELETE", () => {
    fc.assert(
      fc.property(arbMethod, (method) => {
        const req = mockRequest(method, "WRITE");
        const res = mockResponse();
        const next = vi.fn();

        checkScope(req, res, next as NextFunction);

        const shouldAllow = (["GET", "HEAD", "POST"] as Method[]).includes(method);

        if (shouldAllow) {
          expect(next).toHaveBeenCalledOnce();
        } else {
          expect(next).not.toHaveBeenCalled();
          expect(res.status).toHaveBeenCalledWith(403);
        }
      }),
      { numRuns: 20 },
    );
  });
});

