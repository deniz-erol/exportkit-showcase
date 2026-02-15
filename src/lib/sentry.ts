/**
 * Sentry Error Tracking Module
 *
 * Configures Sentry for error tracking in both the Express API server
 * and BullMQ worker processes. If the `SENTRY_DSN` environment variable
 * is not set, Sentry is disabled (no-op) and the application runs normally.
 *
 * Usage:
 * - Import and call `initSentry()` early in the process lifecycle
 * - Use `setupSentryExpressErrorHandler(app)` after routes, before global error handler
 * - Use `captureJobFailure()` in worker failure handlers
 * - Use `captureExceptionWithContext()` for manual error reporting with metadata
 *
 * Environment variables:
 * - `SENTRY_DSN`: Sentry Data Source Name (required to enable tracking)
 * - `NODE_ENV`: Used as the Sentry environment tag
 * - `npm_package_version`: Used as the Sentry release tag
 */

import * as Sentry from "@sentry/node";
import type { Application } from "express";

/** Whether Sentry has been successfully initialized */
let initialized = false;

/**
 * Initializes the Sentry SDK.
 *
 * Should be called as early as possible in the process lifecycle,
 * before the Express app is created or workers are started.
 * If `SENTRY_DSN` is not set, initialization is skipped silently.
 *
 * @param options - Optional overrides for Sentry configuration
 * @param options.dsn - Sentry DSN (defaults to SENTRY_DSN env var)
 * @param options.environment - Environment name (defaults to NODE_ENV)
 * @param options.release - Release version (defaults to npm_package_version)
 */
export function initSentry(options?: {
  dsn?: string;
  environment?: string;
  release?: string;
}): void {
  const dsn = options?.dsn ?? process.env.SENTRY_DSN;

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: options?.environment ?? process.env.NODE_ENV ?? "production",
    release: options?.release ?? process.env.npm_package_version ?? "unknown",
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Strip sensitive headers from request data
      if (event.request?.headers) {
        delete event.request.headers["x-api-key"];
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      return event;
    },
  });

  initialized = true;
}

/**
 * Returns whether Sentry has been initialized.
 *
 * @returns true if Sentry is active, false otherwise
 */
export function isSentryInitialized(): boolean {
  return initialized;
}

/**
 * Sets up the Sentry Express error handler on the given app.
 *
 * This must be called AFTER all routes are registered but BEFORE
 * the global error handler middleware. It captures unhandled errors
 * from Express route handlers and reports them to Sentry.
 *
 * @param app - Express application instance
 */
export function setupSentryExpressErrorHandler(app: Application): void {
  if (!initialized) {
    return;
  }
  Sentry.setupExpressErrorHandler(app);
}

/**
 * Captures an exception and sends it to Sentry with additional context.
 *
 * Used for manual error reporting where you want to attach correlation ID,
 * customer ID, or other request metadata to the Sentry event.
 *
 * @param error - The error to report
 * @param context - Additional context to attach to the Sentry event
 * @param context.correlationId - Request correlation ID for tracing
 * @param context.customerId - Customer ID if available
 * @param context.metadata - Arbitrary key-value metadata
 */
export function captureExceptionWithContext(
  error: unknown,
  context?: {
    correlationId?: string;
    customerId?: string;
    metadata?: Record<string, unknown>;
  },
): void {
  if (!initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context?.correlationId) {
      scope.setTag("correlationId", context.correlationId);
    }
    if (context?.customerId) {
      scope.setUser({ id: context.customerId });
      scope.setTag("customerId", context.customerId);
    }
    if (context?.metadata) {
      scope.setContext("metadata", context.metadata);
    }
    Sentry.captureException(error);
  });
}

/**
 * Reports a BullMQ job failure to Sentry with job context.
 *
 * Attaches the job ID, export type, customer ID, and error details
 * as tags and context on the Sentry event for easy filtering.
 *
 * @param error - The error that caused the job to fail
 * @param jobContext - Job metadata for Sentry context
 * @param jobContext.jobId - BullMQ job ID
 * @param jobContext.customerId - Customer who owns the job
 * @param jobContext.exportType - Export format (csv, json, xlsx)
 * @param jobContext.attemptsMade - Number of attempts made
 * @param jobContext.maxAttempts - Maximum retry attempts configured
 */
export function captureJobFailure(
  error: unknown,
  jobContext: {
    jobId: string;
    customerId: string;
    exportType?: string;
    attemptsMade?: number;
    maxAttempts?: number;
  },
): void {
  if (!initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("jobId", jobContext.jobId);
    scope.setTag("customerId", jobContext.customerId);
    scope.setUser({ id: jobContext.customerId });

    if (jobContext.exportType) {
      scope.setTag("exportType", jobContext.exportType);
    }

    scope.setContext("job", {
      jobId: jobContext.jobId,
      customerId: jobContext.customerId,
      exportType: jobContext.exportType,
      attemptsMade: jobContext.attemptsMade,
      maxAttempts: jobContext.maxAttempts,
    });

    Sentry.captureException(error);
  });
}

export { Sentry };
