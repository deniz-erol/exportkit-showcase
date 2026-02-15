import type { Request, Response, NextFunction } from "express";
import { validateApiKey } from "../../services/auth-service.js";
import { prisma } from "../../db/client.js";
import type { ApiKeyWithCustomer, ApiErrorResponse } from "../../types/index.js";

/**
 * Extended Express Request interface with API key information.
 * Augments the Express Request type to include the authenticated API key.
 */
export interface AuthenticatedRequest extends Request {
  apiKey?: ApiKeyWithCustomer;
}

/**
 * Express middleware that authenticates requests using X-API-Key header.
 *
 * Validates the API key against the database and attaches the key record
 * (including customer relation) to the request object for use in subsequent
 * middleware and route handlers.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 *
 * @example
 * ```typescript
 * app.get('/protected', authenticateApiKey, (req, res) => {
 *   // req.apiKey is available here
 *   res.json({ customer: req.apiKey.customer.name });
 * });
 * ```
 */
export async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check for internal dashboard request
    const isDashboardRequest = req.headers["x-dashboard-request"] === "true";
    const dashboardCustomerId = req.headers["x-customer-id"];

    if (isDashboardRequest && typeof dashboardCustomerId === "string") {
      const customer = await prisma.customer.findUnique({
        where: { id: dashboardCustomerId },
      });

      if (customer) {
        // Mock an API key record for the dashboard user
        // This allows downstream handlers to work without modification
        req.apiKey = {
          id: "dashboard-internal",
          customerId: customer.id,
          name: "Dashboard Internal",
          keyHash: "internal",
          keyPrefix: "dash",
          scope: "ADMIN",
          allowedIps: [],
          rateLimit: 1000,
          lastUsedAt: new Date(),
          expiresAt: null,
          isRevoked: false,
          createdAt: new Date(),
          customer: customer,
        };
        next();
        return;
      }
    }

    // Extract API key from header
    const apiKeyHeader = req.headers["x-api-key"];

    // Check if header is missing
    if (!apiKeyHeader) {
      const errorResponse: ApiErrorResponse = {
        error: "API key required",
        code: "MISSING_API_KEY",
      };
      res.status(401).json(errorResponse);
      return;
    }

    // Ensure the key is a string
    if (typeof apiKeyHeader !== "string") {
      const errorResponse: ApiErrorResponse = {
        error: "Invalid API key format",
        code: "INVALID_API_KEY_FORMAT",
      };
      res.status(401).json(errorResponse);
      return;
    }

    // Validate the API key
    const keyRecord = await validateApiKey(apiKeyHeader);

    // Check if key is valid
    if (!keyRecord) {
      const errorResponse: ApiErrorResponse = {
        error: "Invalid API key",
        code: "INVALID_API_KEY",
      };
      res.status(401).json(errorResponse);
      return;
    }

    // Attach the key record to the request
    req.apiKey = keyRecord;

    // Continue to the next middleware/route handler
    next();
  } catch (error) {
    // Pass unexpected errors to the error handler
    next(error);
  }
}

/**
 * Express middleware for optional API key authentication.
 *
 * Similar to authenticateApiKey, but allows requests without authentication.
 * If a valid API key is provided, it will be attached to the request.
 * If no key or an invalid key is provided, req.apiKey will be null.
 *
 * Useful for endpoints that work with or without authentication,
 * such as public health checks or mixed-access resources.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 *
 * @example
 * ```typescript
 * app.get('/resource', optionalAuth, (req, res) => {
 *   if (req.apiKey) {
 *     // Return full data for authenticated users
 *   } else {
 *     // Return limited data for anonymous users
 *   }
 * });
 * ```
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract API key from header
    const apiKeyHeader = req.headers["x-api-key"];

    // If no key provided, continue as unauthenticated
    if (!apiKeyHeader || typeof apiKeyHeader !== "string") {
      req.apiKey = undefined;
      next();
      return;
    }

    // Validate the API key (but don't fail if invalid)
    const keyRecord = await validateApiKey(apiKeyHeader);

    // Attach key if valid, otherwise leave as undefined
    if (keyRecord) {
      req.apiKey = keyRecord;
    } else {
      req.apiKey = undefined;
    }

    // Continue to the next middleware/route handler
    next();
  } catch (error) {
    // For optional auth, we don't fail on errors - just continue unauthenticated
    req.apiKey = undefined;
    next();
  }
}

/**
 * Type guard to check if a request is authenticated.
 *
 * @param req - Express request object
 * @returns True if the request has a valid API key attached
 */
export function isAuthenticated(
  req: AuthenticatedRequest
): req is AuthenticatedRequest & { apiKey: ApiKeyWithCustomer } {
  return req.apiKey !== undefined;
}
