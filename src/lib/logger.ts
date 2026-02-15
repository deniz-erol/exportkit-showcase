/**
 * Structured Logger Module
 *
 * Provides a Pino-based structured JSON logger for the entire application.
 * Replaces all console.log/warn/error calls with structured, JSON-formatted
 * log entries that include timestamps, levels, and context-specific metadata.
 *
 * Usage:
 * - Import the default logger for module-level logging
 * - Use `createRequestLogger` in Express middleware for per-request child loggers
 * - Use `createJobLogger` in BullMQ workers for per-job child loggers
 *
 * Environment variables:
 * - `LOG_LEVEL`: Minimum log level (default: "info")
 * - `NODE_ENV`: When "development", enables pretty-printing via pino-pretty
 */

import pino from "pino";
import { randomUUID } from "node:crypto";

/**
 * Determine transport configuration based on environment.
 * In development, use pino-pretty for human-readable output.
 * In production, output raw JSON for log aggregation systems.
 */
function getTransport(): pino.TransportSingleOptions | undefined {
  if (process.env.NODE_ENV === "development") {
    return {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    };
  }
  return undefined;
}

/**
 * Root Pino logger instance.
 *
 * Configured with:
 * - JSON output with timestamp
 * - Configurable log level via LOG_LEVEL env var
 * - Pretty-printing in development mode
 * - Service name in base bindings
 */
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: getTransport(),
  base: {
    service: "exportkit",
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

/**
 * Creates a child logger scoped to an HTTP request with a correlation ID.
 *
 * The correlation ID is either extracted from the `x-correlation-id` request
 * header or generated as a new UUID v4. All log entries from this child
 * logger will include the correlation ID for request tracing.
 *
 * @param correlationId - UUID v4 correlation ID for the request
 * @returns Pino child logger with correlationId binding
 */
export function createRequestLogger(correlationId: string): pino.Logger {
  return logger.child({ correlationId });
}

/**
 * Creates a child logger scoped to a BullMQ job.
 *
 * Includes the job ID and customer ID in all log entries for
 * tracing job processing across the worker pipeline.
 *
 * @param jobId - BullMQ job ID
 * @param customerId - Customer ID who owns the job
 * @returns Pino child logger with jobId and customerId bindings
 */
export function createJobLogger(jobId: string, customerId: string): pino.Logger {
  return logger.child({ jobId, customerId });
}

/**
 * Generates a new UUID v4 correlation ID.
 *
 * @returns UUID v4 string
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

export default logger;
