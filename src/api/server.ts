import express, { type Request, type Response, type NextFunction, type Application } from "express";
import helmet from "helmet";
import cors from "cors";
import stripeWebhookRoutes from "./routes/stripe-webhook.js";
import v1Router from "./routes/v1.js";
import llmsTxtRouter from "./routes/llms-txt.js";
import { requestLogger } from "./middleware/request-logger.js";
import { apiVersionMiddleware } from "./middleware/api-version.js";
import { setupQueueEvents } from "../queue/events.js";
import logger from "../lib/logger.js";
import { recordApiRequest } from "../services/alert-service.js";
import { checkHealth } from "../services/health-service.js";
import { setupSentryExpressErrorHandler, captureExceptionWithContext } from "../lib/sentry.js";

/**
 * Express application instance.
 *
 * Configured with:
 * - Security headers via Helmet
 * - CORS for cross-origin requests
 * - JSON body parsing
 * - API routes for jobs and keys
 * - Health check endpoint
 * - Global error handling
 */
const app: Application = express();

/**
 * Security middleware.
 *
 * Helmet sets various HTTP headers for security:
 * - Content-Security-Policy
 * - X-DNS-Prefetch-Control
 * - X-Frame-Options: DENY
 * - X-Powered-By (removed)
 * - Strict-Transport-Security (HSTS) with 1-year max-age and includeSubDomains
 * - X-Download-Options
 * - X-Content-Type-Options: nosniff
 * - X-Permitted-Cross-Domain-Policies
 * - Referrer-Policy: strict-origin-when-cross-origin
 */
app.use(
  helmet({
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: "deny",
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for now
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },
  })
);

/**
 * CORS middleware.
 *
 * Allows cross-origin requests from any origin.
 * In production, you may want to restrict this to specific origins.
 */
app.use(cors());

/**
 * Stripe webhook route — must be registered BEFORE express.json()
 * because Stripe signature verification requires the raw request body.
 */
app.use("/api/webhooks/stripe", stripeWebhookRoutes);

/**
 * JSON body parsing middleware.
 *
 * Parses incoming JSON requests and makes the data available in req.body.
 * Limited to 100MB to support enterprise-level export payloads.
 * Usage caps and plan limits prevent abuse at the application layer.
 */
app.use(express.json({ limit: "100mb" }));

/**
 * Request logger middleware.
 *
 * Generates a UUID v4 correlation ID per request and attaches
 * a Pino child logger to req.log for structured logging.
 */
app.use(requestLogger);

/**
 * API error rate tracking middleware (OBS-04).
 *
 * Records every response status code into the AlertService sliding window
 * for error rate monitoring. Runs after request logger so correlation IDs
 * are available for debugging.
 */
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.on("finish", () => {
    recordApiRequest(res.statusCode);
  });
  next();
});

/**
 * Health check endpoint.
 *
 * Performs deep connectivity checks against Postgres, Redis, and R2.
 * Returns 200 when all dependencies are healthy, 503 when any is unhealthy.
 * Each dependency check has a 3-second timeout; overall timeout is 5 seconds.
 * Used by load balancers and monitoring systems — no authentication required.
 */
app.get("/health", async (_req: Request, res: Response) => {
  try {
    const result = await checkHealth();
    const statusCode = result.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(result);
  } catch (err) {
    logger.error({ err, msg: "Health check failed unexpectedly" });
    res.status(503).json({
      status: "unhealthy",
      uptime: process.uptime(),
      timestamp: Date.now(),
      version: process.env.npm_package_version || "0.1.0",
      error: "Health check timed out or failed unexpectedly",
      dependencies: {
        postgres: { status: "unhealthy", latencyMs: 0, error: "Check did not complete" },
        redis: { status: "unhealthy", latencyMs: 0, error: "Check did not complete" },
        r2: { status: "unhealthy", latencyMs: 0, error: "Check did not complete" },
      },
    });
  }
});

/**
 * LLM-friendly API description endpoints (AGENT-01).
 *
 * Serves plain-text files describing the API for AI agents and LLMs.
 * No authentication required — public documentation.
 */
app.use(llmsTxtRouter);

/**
 * API version negotiation middleware.
 *
 * Detects the API version from the URL path (e.g., /api/v1/jobs → "v1").
 * When no version is specified (e.g., /api/jobs), defaults to the latest
 * stable version. Sets req.apiVersion and adds X-API-Version response header.
 */
app.use("/api", apiVersionMiddleware);

/**
 * API routes — versioned.
 *
 * All versioned routes live in the v1 router (`src/api/routes/v1.ts`).
 * Mounted at `/api/v1/` as the canonical path and at `/api/` for
 * backward compatibility so existing clients continue to work.
 *
 * Rate limiting is applied inside the v1 router per-route group:
 * - /api/v1/jobs handles its own per-endpoint rate limits (export: 10/min, download: 30/min, other: 100/min)
 * - All other routes use the general rate limiter (100/min, burst 200/10s)
 */
app.use("/api/v1", v1Router);
app.use("/api", v1Router);

/**
 * Sentry error handler middleware.
 *
 * Must be registered AFTER all routes but BEFORE the 404 handler
 * and global error handler. Captures unhandled errors from route
 * handlers and reports them to Sentry with request context.
 */
setupSentryExpressErrorHandler(app);

/**
 * 404 handler for unmatched routes.
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: "Not found",
    code: "ROUTE_NOT_FOUND",
    message: "The requested endpoint does not exist",
  });
});

/**
 * Global error handling middleware.
 *
 * Catches all errors from route handlers and returns a safe response.
 * Does not leak stack traces or internal error details in production.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const reqLogger = _req.log || logger;
  reqLogger.error({ err, msg: "Unhandled error" });

  // Report to Sentry with correlation ID, customer ID, and request metadata
  captureExceptionWithContext(err, {
    correlationId: _req.correlationId,
    customerId: _req.apiKey?.customer?.id,
    metadata: {
      method: _req.method,
      url: _req.originalUrl,
      userAgent: _req.get("user-agent"),
      ip: _req.ip,
    },
  });

  // In production, don't leak error details
  const isDevelopment = process.env.NODE_ENV === "development";

  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    ...(isDevelopment && {
      message: err.message,
      stack: err.stack,
    }),
  });
});

/**
 * Initialize the server.
 *
 * Sets up queue events and returns the Express app.
 * This function should be called before starting the HTTP server.
 *
 * @returns Object containing the Express app and cleanup function
 */
export async function initServer(): Promise<{
  app: Application;
  cleanup: () => Promise<void>;
}> {
  // Set up queue event handlers for status tracking
  const cleanupQueueEvents = setupQueueEvents();

  return {
    app,
    cleanup: async () => {
      await cleanupQueueEvents();
    },
  };
}

export { app };
export default app;
