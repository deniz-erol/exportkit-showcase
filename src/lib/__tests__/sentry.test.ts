/**
 * Sentry Module Unit Tests (OBS-02)
 *
 * Tests the Sentry error tracking module's initialization,
 * no-op behavior when DSN is missing, context enrichment,
 * and job failure reporting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Track calls to scope methods
let scopeSetTag: ReturnType<typeof vi.fn>;
let scopeSetUser: ReturnType<typeof vi.fn>;
let scopeSetContext: ReturnType<typeof vi.fn>;
let mockInit: ReturnType<typeof vi.fn>;
let mockSetupExpressErrorHandler: ReturnType<typeof vi.fn>;
let mockCaptureException: ReturnType<typeof vi.fn>;
let mockWithScope: ReturnType<typeof vi.fn>;

vi.mock("@sentry/node", () => {
  scopeSetTag = vi.fn();
  scopeSetUser = vi.fn();
  scopeSetContext = vi.fn();
  mockInit = vi.fn();
  mockSetupExpressErrorHandler = vi.fn();
  mockCaptureException = vi.fn();
  mockWithScope = vi.fn((callback: (scope: unknown) => void) => {
    callback({
      setTag: scopeSetTag,
      setUser: scopeSetUser,
      setContext: scopeSetContext,
    });
  });

  return {
    init: mockInit,
    setupExpressErrorHandler: mockSetupExpressErrorHandler,
    captureException: mockCaptureException,
    withScope: mockWithScope,
  };
});

describe("Sentry Module", () => {
  let sentryModule: typeof import("../sentry.js");

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.SENTRY_DSN;
    delete process.env.NODE_ENV;
    sentryModule = await import("../sentry.js");
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  describe("initSentry", () => {
    it("does not call Sentry.init when SENTRY_DSN is not set", () => {
      sentryModule.initSentry();
      expect(mockInit).not.toHaveBeenCalled();
      expect(sentryModule.isSentryInitialized()).toBe(false);
    });

    it("calls Sentry.init with DSN from environment variable", () => {
      process.env.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";
      sentryModule.initSentry();
      expect(mockInit).toHaveBeenCalledOnce();
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
        }),
      );
      expect(sentryModule.isSentryInitialized()).toBe(true);
    });

    it("calls Sentry.init with DSN from options parameter", () => {
      sentryModule.initSentry({ dsn: "https://custom@sentry.io/1" });
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: "https://custom@sentry.io/1",
        }),
      );
      expect(sentryModule.isSentryInitialized()).toBe(true);
    });

    it("uses NODE_ENV as environment", () => {
      process.env.NODE_ENV = "staging";
      sentryModule.initSentry({ dsn: "https://test@sentry.io/1" });
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "staging",
        }),
      );
    });

    it("defaults environment to production when NODE_ENV is not set", () => {
      sentryModule.initSentry({ dsn: "https://test@sentry.io/1" });
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "production",
        }),
      );
    });

    it("strips sensitive headers via beforeSend", () => {
      sentryModule.initSentry({ dsn: "https://test@sentry.io/1" });
      const initCall = mockInit.mock.calls[0]![0]!;
      const beforeSend = initCall.beforeSend;

      const event = {
        request: {
          headers: {
            "x-api-key": "secret-key",
            authorization: "Bearer token",
            cookie: "session=abc",
            "content-type": "application/json",
          },
        },
      };

      const result = beforeSend(event, {});
      expect(result).not.toBeNull();
      expect(result.request.headers["x-api-key"]).toBeUndefined();
      expect(result.request.headers["authorization"]).toBeUndefined();
      expect(result.request.headers["cookie"]).toBeUndefined();
      expect(result.request.headers["content-type"]).toBe("application/json");
    });
  });

  describe("setupSentryExpressErrorHandler", () => {
    it("does not call setupExpressErrorHandler when not initialized", () => {
      const mockApp = {} as import("express").Application;
      sentryModule.setupSentryExpressErrorHandler(mockApp);
      expect(mockSetupExpressErrorHandler).not.toHaveBeenCalled();
    });

    it("calls setupExpressErrorHandler when initialized", () => {
      sentryModule.initSentry({ dsn: "https://test@sentry.io/1" });
      const mockApp = {} as import("express").Application;
      sentryModule.setupSentryExpressErrorHandler(mockApp);
      expect(mockSetupExpressErrorHandler).toHaveBeenCalledWith(mockApp);
    });
  });

  describe("captureExceptionWithContext", () => {
    it("does nothing when Sentry is not initialized", () => {
      sentryModule.captureExceptionWithContext(new Error("test"), {
        correlationId: "abc-123",
      });
      expect(mockWithScope).not.toHaveBeenCalled();
    });

    it("captures exception with correlation ID tag", () => {
      sentryModule.initSentry({ dsn: "https://test@sentry.io/1" });

      const error = new Error("request failed");
      sentryModule.captureExceptionWithContext(error, {
        correlationId: "corr-456",
      });

      expect(mockWithScope).toHaveBeenCalledOnce();
      expect(scopeSetTag).toHaveBeenCalledWith("correlationId", "corr-456");
      expect(mockCaptureException).toHaveBeenCalledWith(error);
    });

    it("sets user and tag for customer ID", () => {
      sentryModule.initSentry({ dsn: "https://test@sentry.io/1" });

      sentryModule.captureExceptionWithContext(new Error("test"), {
        customerId: "cust-789",
      });

      expect(scopeSetUser).toHaveBeenCalledWith({ id: "cust-789" });
      expect(scopeSetTag).toHaveBeenCalledWith("customerId", "cust-789");
    });

    it("attaches metadata as Sentry context", () => {
      sentryModule.initSentry({ dsn: "https://test@sentry.io/1" });

      const metadata = { method: "POST", url: "/api/jobs", ip: "1.2.3.4" };
      sentryModule.captureExceptionWithContext(new Error("test"), { metadata });

      expect(scopeSetContext).toHaveBeenCalledWith("metadata", metadata);
    });
  });

  describe("captureJobFailure", () => {
    it("does nothing when Sentry is not initialized", () => {
      sentryModule.captureJobFailure(new Error("job failed"), {
        jobId: "job-1",
        customerId: "cust-1",
      });
      expect(mockWithScope).not.toHaveBeenCalled();
    });

    it("captures job failure with job context tags", () => {
      sentryModule.initSentry({ dsn: "https://test@sentry.io/1" });

      const error = new Error("export failed");
      sentryModule.captureJobFailure(error, {
        jobId: "job-123",
        customerId: "cust-456",
        exportType: "csv",
        attemptsMade: 3,
        maxAttempts: 3,
      });

      expect(scopeSetTag).toHaveBeenCalledWith("jobId", "job-123");
      expect(scopeSetTag).toHaveBeenCalledWith("customerId", "cust-456");
      expect(scopeSetTag).toHaveBeenCalledWith("exportType", "csv");
      expect(scopeSetUser).toHaveBeenCalledWith({ id: "cust-456" });
      expect(scopeSetContext).toHaveBeenCalledWith("job", {
        jobId: "job-123",
        customerId: "cust-456",
        exportType: "csv",
        attemptsMade: 3,
        maxAttempts: 3,
      });
      expect(mockCaptureException).toHaveBeenCalledWith(error);
    });

    it("handles missing optional fields gracefully", () => {
      sentryModule.initSentry({ dsn: "https://test@sentry.io/1" });

      sentryModule.captureJobFailure(new Error("fail"), {
        jobId: "job-1",
        customerId: "cust-1",
      });

      expect(scopeSetTag).toHaveBeenCalledWith("jobId", "job-1");
      expect(scopeSetTag).toHaveBeenCalledWith("customerId", "cust-1");
      // exportType tag should not be set when undefined
      expect(scopeSetTag).not.toHaveBeenCalledWith("exportType", expect.anything());
    });
  });
});
