import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../auth.js";

vi.mock("../../../lib/circuit-breaker/counter.js", () => ({
  incrementAndCheck: vi.fn(),
}));

vi.mock("../../../lib/circuit-breaker/payload-hash.js", () => ({
  computePayloadHash: vi.fn().mockReturnValue("abc123hash"),
}));

vi.mock("../../../queue/connection.js", () => ({
  default: {},
}));

vi.mock("../../../lib/logger.js", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { createCircuitBreaker } from "../circuit-breaker.js";
import { incrementAndCheck } from "../../../lib/circuit-breaker/counter.js";
import logger from "../../../lib/logger.js";

function mockRequest(apiKeyId?: string, body?: Record<string, unknown>): AuthenticatedRequest {
  return {
    apiKey: apiKeyId ? ({ id: apiKeyId } as AuthenticatedRequest["apiKey"]) : undefined,
    body: body ?? {},
  } as AuthenticatedRequest;
}

function mockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("createCircuitBreaker middleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    vi.clearAllMocks();
  });

  it("returns 429 with exact CIRCUIT_BREAKER JSON when blocked", async () => {
    vi.mocked(incrementAndCheck).mockResolvedValue({ count: 11, blocked: true });

    const middleware = createCircuitBreaker();
    const req = mockRequest("key-1", { table: "users" });
    const res = mockResponse();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "Runaway Agent Detected. Loop protection enabled.",
      code: "CIRCUIT_BREAKER",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when under threshold (not blocked)", async () => {
    vi.mocked(incrementAndCheck).mockResolvedValue({ count: 3, blocked: false });

    const middleware = createCircuitBreaker();
    const req = mockRequest("key-1", { table: "orders" });
    const res = mockResponse();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("fails open and calls next() when Redis throws", async () => {
    vi.mocked(incrementAndCheck).mockRejectedValue(new Error("Redis connection refused"));

    const middleware = createCircuitBreaker();
    const req = mockRequest("key-1");
    const res = mockResponse();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("logs the error when Redis throws", async () => {
    const redisError = new Error("ECONNREFUSED");
    vi.mocked(incrementAndCheck).mockRejectedValue(redisError);

    const middleware = createCircuitBreaker();
    const req = mockRequest("key-1");
    const res = mockResponse();

    await middleware(req, res, next);

    expect(logger.error).toHaveBeenCalledWith(
      { err: redisError },
      "Circuit breaker Redis error, failing open",
    );
  });

  it("calls next() when no apiKey is present on the request", async () => {
    const middleware = createCircuitBreaker();
    const req = mockRequest(undefined);
    const res = mockResponse();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(incrementAndCheck).not.toHaveBeenCalled();
  });
});
