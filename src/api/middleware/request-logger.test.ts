import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requestLogger } from "./request-logger.js";

function createMockReq(headers: Record<string, string> = {}): Partial<Request> {
  return {
    headers,
    method: "GET",
    originalUrl: "/api/test",
    get: vi.fn((name: string) => headers[name.toLowerCase()]),
  };
}

function createMockRes(): Partial<Response> & { _listeners: Record<string, Function[]> } {
  const listeners: Record<string, Function[]> = {};
  return {
    _listeners: listeners,
    statusCode: 200,
    setHeader: vi.fn(),
    on: vi.fn((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
  };
}

describe("requestLogger middleware", () => {
  it("should attach a correlationId to the request", () => {
    const req = createMockReq() as Request;
    const res = createMockRes() as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestLogger(req, res, next);

    expect(req.correlationId).toBeDefined();
    expect(typeof req.correlationId).toBe("string");
    expect(req.correlationId.length).toBeGreaterThan(0);
  });

  it("should generate a UUID v4 correlation ID when none provided", () => {
    const req = createMockReq() as Request;
    const res = createMockRes() as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestLogger(req, res, next);

    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(req.correlationId).toMatch(uuidV4Regex);
  });

  it("should reuse x-correlation-id header when provided", () => {
    const existingId = "existing-correlation-id-abc";
    const req = createMockReq({ "x-correlation-id": existingId }) as Request;
    const res = createMockRes() as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestLogger(req, res, next);

    expect(req.correlationId).toBe(existingId);
  });

  it("should attach a Pino logger to req.log", () => {
    const req = createMockReq() as Request;
    const res = createMockRes() as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestLogger(req, res, next);

    expect(req.log).toBeDefined();
    expect(typeof req.log.info).toBe("function");
    expect(typeof req.log.error).toBe("function");
    expect(typeof req.log.warn).toBe("function");
  });

  it("should set x-correlation-id response header", () => {
    const req = createMockReq() as Request;
    const res = createMockRes() as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestLogger(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith("x-correlation-id", req.correlationId);
  });

  it("should call next() to continue the middleware chain", () => {
    const req = createMockReq() as Request;
    const res = createMockRes() as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestLogger(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("should register a finish event listener on the response", () => {
    const req = createMockReq() as Request;
    const mockRes = createMockRes();
    const res = mockRes as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestLogger(req, res, next);

    expect(res.on).toHaveBeenCalledWith("finish", expect.any(Function));
  });

  it("should generate unique correlation IDs for different requests", () => {
    const ids = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const req = createMockReq() as Request;
      const res = createMockRes() as unknown as Response;
      const next = vi.fn() as NextFunction;

      requestLogger(req, res, next);
      ids.add(req.correlationId);
    }

    expect(ids.size).toBe(50);
  });
});
