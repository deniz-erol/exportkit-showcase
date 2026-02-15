import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  apiVersionMiddleware,
  LATEST_STABLE_VERSION,
  SUPPORTED_VERSIONS,
  DEPRECATED_VERSIONS,
  toHttpDate,
} from "../api-version.js";
import type { Request, Response, NextFunction } from "express";

/**
 * Creates a minimal mock Request with the given originalUrl.
 */
function mockRequest(originalUrl: string): Request {
  return { originalUrl } as Request;
}

/**
 * Creates a mock Express Response with setHeader tracking.
 */
function mockResponse(): Response {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    _headers: headers,
  } as unknown as Response;
  return res;
}

describe("apiVersionMiddleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it("detects v1 from explicit /api/v1/ path", () => {
    const req = mockRequest("/api/v1/jobs");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    expect(req.apiVersion).toBe("v1");
    expect(res.setHeader).toHaveBeenCalledWith("X-API-Version", "v1");
    expect(next).toHaveBeenCalledOnce();
  });

  it("defaults to latest stable version when no version in path", () => {
    const req = mockRequest("/api/jobs");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    expect(req.apiVersion).toBe(LATEST_STABLE_VERSION);
    expect(res.setHeader).toHaveBeenCalledWith(
      "X-API-Version",
      LATEST_STABLE_VERSION
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("handles nested paths under versioned prefix", () => {
    const req = mockRequest("/api/v1/jobs/abc-123/download");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    expect(req.apiVersion).toBe("v1");
  });

  it("handles nested paths under unversioned prefix", () => {
    const req = mockRequest("/api/keys");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    expect(req.apiVersion).toBe(LATEST_STABLE_VERSION);
  });

  it("detects higher version numbers if present in path", () => {
    const req = mockRequest("/api/v2/jobs");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    expect(req.apiVersion).toBe("v2");
    expect(res.setHeader).toHaveBeenCalledWith("X-API-Version", "v2");
  });

  it("defaults for paths without /api/ prefix", () => {
    const req = mockRequest("/health");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    expect(req.apiVersion).toBe(LATEST_STABLE_VERSION);
    expect(next).toHaveBeenCalledOnce();
  });

  it("always calls next", () => {
    const req = mockRequest("/api/v1/billing");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("exports LATEST_STABLE_VERSION as v1", () => {
    expect(LATEST_STABLE_VERSION).toBe("v1");
  });

  it("exports SUPPORTED_VERSIONS containing v1", () => {
    expect(SUPPORTED_VERSIONS.has("v1")).toBe(true);
  });

  it("exports DEPRECATED_VERSIONS as an empty map by default", () => {
    expect(DEPRECATED_VERSIONS.size).toBe(0);
  });
});

describe("apiVersionMiddleware — deprecation headers", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  afterEach(() => {
    DEPRECATED_VERSIONS.clear();
  });

  it("does not add deprecation headers for a non-deprecated version", () => {
    const req = mockRequest("/api/v1/jobs");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith("X-API-Version", "v1");
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Sunset",
      expect.anything()
    );
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Deprecation",
      expect.anything()
    );
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Link",
      expect.anything()
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("adds Sunset, Deprecation, and Link headers for a deprecated version", () => {
    DEPRECATED_VERSIONS.set("v1", {
      sunsetDate: "2025-12-31",
      deprecatedSince: "2025-06-01",
    });

    const req = mockRequest("/api/v1/jobs");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Sunset",
      toHttpDate("2025-12-31")
    );
    expect(res.setHeader).toHaveBeenCalledWith("Deprecation", "true");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Link",
      `</api/${LATEST_STABLE_VERSION}>; rel="successor-version"`
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("sets Sunset header in RFC 7231 HTTP-date format", () => {
    DEPRECATED_VERSIONS.set("v2", {
      sunsetDate: "2026-06-15",
      deprecatedSince: "2026-01-01",
    });

    const req = mockRequest("/api/v2/jobs");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    const expectedDate = new Date("2026-06-15").toUTCString();
    expect(res.setHeader).toHaveBeenCalledWith("Sunset", expectedDate);
  });

  it("does not add deprecation headers for a version not in the map", () => {
    DEPRECATED_VERSIONS.set("v0", {
      sunsetDate: "2025-01-01",
      deprecatedSince: "2024-06-01",
    });

    const req = mockRequest("/api/v1/jobs");
    const res = mockResponse();

    apiVersionMiddleware(req, res, next);

    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Sunset",
      expect.anything()
    );
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Deprecation",
      expect.anything()
    );
  });
});

describe("toHttpDate", () => {
  it("converts an ISO date string to RFC 7231 HTTP-date format", () => {
    const result = toHttpDate("2025-12-31");
    expect(result).toBe(new Date("2025-12-31").toUTCString());
  });
});
