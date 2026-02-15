/**
 * Request Logger Middleware
 *
 * Generates a UUID v4 correlation ID for each incoming request and
 * attaches a Pino child logger to `req.log`. The correlation ID is
 * included in all log entries and returned in the `x-correlation-id`
 * response header for client-side tracing.
 *
 * If the client sends an `x-correlation-id` header, it is reused
 * instead of generating a new one.
 */

import type { Request, Response, NextFunction } from "express";
import { createRequestLogger, generateCorrelationId } from "../../lib/logger.js";
import logger from "../../lib/logger.js";

/**
 * Express middleware that creates a per-request child logger with a correlation ID.
 *
 * Attaches `req.log` (Pino child logger) and `req.correlationId` to the request.
 * Sets the `x-correlation-id` response header for downstream tracing.
 * Logs request start and completion with method, URL, status, and duration.
 *
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    (req.headers["x-correlation-id"] as string) || generateCorrelationId();

  const reqLogger = createRequestLogger(correlationId);

  req.log = reqLogger;
  req.correlationId = correlationId;

  res.setHeader("x-correlation-id", correlationId);

  const startTime = Date.now();

  reqLogger.info({
    msg: "request started",
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get("user-agent"),
  });

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const logFn = res.statusCode >= 500 ? reqLogger.error : res.statusCode >= 400 ? reqLogger.warn : reqLogger.info;

    logFn.call(reqLogger, {
      msg: "request completed",
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
    });
  });

  next();
}

/**
 * Fallback logger for use in contexts where `req.log` may not be available.
 * Returns the root Pino logger instance.
 *
 * @returns Root Pino logger
 */
export function getLogger() {
  return logger;
}

export default requestLogger;
