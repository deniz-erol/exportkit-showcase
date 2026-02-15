import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkIpAllowlist, isIpInCidr } from "../ip-allowlist.js";
import type { AuthenticatedRequest } from "../auth.js";
import type { Response, NextFunction } from "express";

/**
 * Creates a minimal mock AuthenticatedRequest with the given IP and allowedIps.
 */
function mockRequest(
  ip: string | undefined,
  allowedIps?: string[]
): AuthenticatedRequest {
  const req = {
    ip,
    apiKey: allowedIps !== undefined
      ? ({
          id: "key-1",
          customerId: "cust-1",
          scope: "WRITE",
          allowedIps,
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

describe("isIpInCidr", () => {
  describe("IPv4", () => {
    it("matches exact IPv4 address", () => {
      expect(isIpInCidr("10.0.0.1", "10.0.0.1")).toBe(true);
    });

    it("matches IPv4 within CIDR range", () => {
      expect(isIpInCidr("192.168.1.100", "192.168.1.0/24")).toBe(true);
    });

    it("rejects IPv4 outside CIDR range", () => {
      expect(isIpInCidr("192.168.2.1", "192.168.1.0/24")).toBe(false);
    });

    it("matches /32 single-host CIDR", () => {
      expect(isIpInCidr("10.0.0.5", "10.0.0.5/32")).toBe(true);
      expect(isIpInCidr("10.0.0.6", "10.0.0.5/32")).toBe(false);
    });
  });

  describe("IPv6", () => {
    it("matches exact IPv6 address", () => {
      expect(isIpInCidr("::1", "::1")).toBe(true);
    });

    it("matches IPv6 within CIDR range", () => {
      expect(isIpInCidr("2001:db8::1", "2001:db8::/32")).toBe(true);
    });

    it("rejects IPv6 outside CIDR range", () => {
      expect(isIpInCidr("2001:db9::1", "2001:db8::/32")).toBe(false);
    });

    it("matches /128 single-host CIDR", () => {
      expect(isIpInCidr("::1", "::1/128")).toBe(true);
      expect(isIpInCidr("::2", "::1/128")).toBe(false);
    });
  });

  describe("IPv4-mapped IPv6", () => {
    it("matches IPv4-mapped IPv6 against IPv4 CIDR", () => {
      expect(isIpInCidr("::ffff:192.168.1.1", "192.168.1.0/24")).toBe(true);
    });

    it("rejects IPv4-mapped IPv6 outside IPv4 CIDR", () => {
      expect(isIpInCidr("::ffff:10.0.0.1", "192.168.1.0/24")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for invalid IP", () => {
      expect(isIpInCidr("not-an-ip", "10.0.0.0/8")).toBe(false);
    });

    it("returns false for invalid CIDR", () => {
      expect(isIpInCidr("10.0.0.1", "not-a-cidr")).toBe(false);
    });

    it("returns false for mismatched address families", () => {
      expect(isIpInCidr("10.0.0.1", "2001:db8::/32")).toBe(false);
    });
  });
});

describe("checkIpAllowlist middleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  describe("when no apiKey is set", () => {
    it("calls next without blocking", () => {
      const req = mockRequest("10.0.0.1");
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("when allowlist is empty", () => {
    it("allows any IP through", () => {
      const req = mockRequest("10.0.0.1", []);
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("IPv4 allowlist", () => {
    it("allows exact IPv4 match", () => {
      const req = mockRequest("10.0.0.1", ["10.0.0.1"]);
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it("allows IPv4 within CIDR range", () => {
      const req = mockRequest("192.168.1.50", ["192.168.1.0/24"]);
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it("rejects IPv4 not in allowlist with 403", () => {
      const req = mockRequest("10.0.0.1", ["192.168.1.0/24"]);
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "IP address not allowed",
        code: "IP_NOT_ALLOWED",
      });
    });
  });

  describe("IPv6 allowlist", () => {
    it("allows exact IPv6 match", () => {
      const req = mockRequest("::1", ["::1"]);
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it("allows IPv6 within CIDR range", () => {
      const req = mockRequest("2001:db8::abcd", ["2001:db8::/32"]);
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it("rejects IPv6 not in allowlist with 403", () => {
      const req = mockRequest("2001:db9::1", ["2001:db8::/32"]);
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("IPv4-mapped IPv6 handling", () => {
    it("allows IPv4-mapped IPv6 matching an IPv4 CIDR", () => {
      const req = mockRequest("::ffff:192.168.1.1", ["192.168.1.0/24"]);
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe("multiple CIDR entries", () => {
    it("allows IP matching any entry in the list", () => {
      const req = mockRequest("10.0.0.5", ["192.168.1.0/24", "10.0.0.0/8"]);
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe("when req.ip is undefined", () => {
    it("rejects with 403", () => {
      const req = mockRequest(undefined, ["10.0.0.0/8"]);
      const res = mockResponse();

      checkIpAllowlist(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
