import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.js";
import type { ApiErrorResponse } from "../../types/index.js";

/**
 * Allowed HTTP methods per API key scope.
 *
 * - READ: Only GET and HEAD requests
 * - WRITE: GET, HEAD, and POST requests
 * - ADMIN: All HTTP methods
 */
const SCOPE_ALLOWED_METHODS: Record<string, ReadonlySet<string>> = {
  READ: new Set(["GET", "HEAD"]),
  WRITE: new Set(["GET", "HEAD", "POST"]),
  ADMIN: new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]),
};

/**
 * Express middleware that enforces API key scope against the HTTP method.
 *
 * Must run AFTER the auth middleware so that `req.apiKey` is populated.
 * Checks the key's `scope` field against the request method and returns
 * 403 if the scope does not permit the method.
 *
 * @param req - Express request with authenticated API key
 * @param res - Express response object
 * @param next - Express next function
 */
export function checkScope(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.apiKey;

  // If no apiKey is set, skip scope check (auth middleware handles 401)
  if (!apiKey) {
    next();
    return;
  }

  const scope = apiKey.scope;
  const method = req.method.toUpperCase();

  const allowedMethods = SCOPE_ALLOWED_METHODS[scope];

  if (!allowedMethods || !allowedMethods.has(method)) {
    const errorResponse: ApiErrorResponse = {
      error: "Insufficient permissions",
      code: "FORBIDDEN",
    };
    res.status(403).json(errorResponse);
    return;
  }

  next();
}
