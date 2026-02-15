import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticateApiKey } from "../middleware/auth.js";
import { usageService } from "../../services/usage-service.js";
import type { AuthenticatedRequest } from "../../types/index.js";

const router = Router();

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
}

/**
 * @openapi
 * /api/usage:
 *   get:
 *     summary: Get current usage summary
 *     description: Returns total rows exported, plan limit, percentage consumed, and overage info for the current billing period.
 *     tags: [Usage]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Usage summary
 */
router.get(
  "/",
  authenticateApiKey,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

export default router;
