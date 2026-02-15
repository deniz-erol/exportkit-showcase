import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authenticateApiKey } from "../middleware/auth.js";
import { paginationMiddleware, formatPaginatedResponse } from "../middleware/pagination.js";
import { auditService, type AuditAction } from "../../services/audit-service.js";
import type { AuthenticatedRequest, ApiErrorResponse } from "../../types/index.js";

/**
 * @openapi
 * /api/audit-logs:
 *   get:
 *     summary: List audit log entries
 *     description: |
 *       Returns paginated audit log entries for the authenticated customer.
 *       Supports filtering by date range and action type.
 *     tags: [AuditLogs]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of entries per page
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter entries from this date (inclusive)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter entries up to this date (inclusive)
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [api_key.create, api_key.revoke, login, password.change, plan.change, webhook.update, branding.update, account.delete]
 *         description: Filter by action type
 *     responses:
 *       200:
 *         description: Paginated audit log entries
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized - Invalid or missing API key
 */

const router = Router();

const VALID_ACTIONS: AuditAction[] = [
  "api_key.create",
  "api_key.revoke",
  "login",
  "password.change",
  "plan.change",
  "webhook.update",
  "branding.update",
  "account.delete",
];

const querySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  action: z.enum(VALID_ACTIONS as [AuditAction, ...AuditAction[]]).optional(),
});

/**
 * Async handler wrapper to catch errors in async route handlers.
 */
function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
}

/**
 * @openapi
 * GET /api/audit-logs
 * Returns paginated audit log entries for the authenticated customer.
 */
router.get(
  "/",
  authenticateApiKey,
  paginationMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

export default router;
