import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkScope } from "../scope.js";
import type { AuthenticatedRequest } from "../auth.js";
import type { Response, NextFunction } from "express";

/**
 * Creates a minimal mock AuthenticatedRequest with the given HTTP method and scope.
 */
function mockRequest(
  method: string,
  scope?: "READ" | "WRITE" | "ADMIN"
): AuthenticatedRequest {
  const req = {
    method,
    apiKey: scope
      ? ({
          id: "key-1",
          customerId: "cust-1",
          scope,
        } as AuthenticatedRequest["apiKey"])
      : undefined,
  } as AuthenticatedRequest;
  return req;
}

/**
 * Creates a mock Express Response with json and status methods.
 */
function mockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("checkScope middleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  describe("when no apiKey is set (unauthenticated)", () => {
    it("calls next without blocking", () => {
      const req = mockRequest("GET");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("READ scope", () => {
    it("allows GET requests", () => {
      const req = mockRequest("GET", "READ");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("allows HEAD requests", () => {
      const req = mockRequest("HEAD", "READ");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("rejects POST requests with 403", () => {
      const req = mockRequest("POST", "READ");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Insufficient permissions",
        code: "FORBIDDEN",
      });
    });

    it("rejects PUT requests with 403", () => {
      const req = mockRequest("PUT", "READ");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("rejects PATCH requests with 403", () => {
      const req = mockRequest("PATCH", "READ");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("rejects DELETE requests with 403", () => {
      const req = mockRequest("DELETE", "READ");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("WRITE scope", () => {
    it("allows GET requests", () => {
      const req = mockRequest("GET", "WRITE");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it("allows HEAD requests", () => {
      const req = mockRequest("HEAD", "WRITE");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it("allows POST requests", () => {
      const req = mockRequest("POST", "WRITE");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it("rejects PUT requests with 403", () => {
      const req = mockRequest("PUT", "WRITE");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("rejects PATCH requests with 403", () => {
      const req = mockRequest("PATCH", "WRITE");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("rejects DELETE requests with 403", () => {
      const req = mockRequest("DELETE", "WRITE");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("ADMIN scope", () => {
    const allMethods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];

    for (const method of allMethods) {
      it(`allows ${method} requests`, () => {
        const req = mockRequest(method, "ADMIN");
        const res = mockResponse();

        checkScope(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
      });
    }
  });

  describe("case insensitivity", () => {
    it("handles lowercase HTTP methods", () => {
      const req = mockRequest("get", "READ");
      const res = mockResponse();

      checkScope(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });
});
