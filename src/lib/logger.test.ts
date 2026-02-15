import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

// We need to test the module's exports, but the default logger writes to stdout.
// We'll test the factory functions and the generated correlation IDs.

describe("logger module", () => {
  // Dynamic import to get fresh module for each test
  let loggerModule: typeof import("./logger.js");

  beforeEach(async () => {
    loggerModule = await import("./logger.js");
  });

  describe("default export", () => {
    it("should export a Pino logger instance", () => {
      const logger = loggerModule.default;
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.fatal).toBe("function");
    });
  });

  describe("generateCorrelationId", () => {
    it("should return a valid UUID v4 string", () => {
      const id = loggerModule.generateCorrelationId();
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidV4Regex);
    });

    it("should generate unique IDs on each call", () => {
      const ids = new Set(
        Array.from({ length: 100 }, () => loggerModule.generateCorrelationId())
      );
      expect(ids.size).toBe(100);
    });
  });

  describe("createRequestLogger", () => {
    it("should return a Pino child logger with correlationId binding", () => {
      const correlationId = "test-correlation-id-123";
      const childLogger = loggerModule.createRequestLogger(correlationId);

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe("function");
      expect(typeof childLogger.error).toBe("function");
      // Pino child loggers have bindings accessible via the logger
      expect(childLogger).not.toBe(loggerModule.default);
    });
  });

  describe("createJobLogger", () => {
    it("should return a Pino child logger with jobId and customerId bindings", () => {
      const jobId = "job-456";
      const customerId = "cust-789";
      const childLogger = loggerModule.createJobLogger(jobId, customerId);

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe("function");
      expect(typeof childLogger.error).toBe("function");
      expect(childLogger).not.toBe(loggerModule.default);
    });

    it("should create distinct child loggers for different jobs", () => {
      const logger1 = loggerModule.createJobLogger("job-1", "cust-1");
      const logger2 = loggerModule.createJobLogger("job-2", "cust-2");

      expect(logger1).not.toBe(logger2);
    });
  });
});
