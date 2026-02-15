import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticateApiKey } from "../middleware/auth.js";
import { billingService } from "../../services/billing-service.js";
import { PlanTier } from "@prisma/client";
import type { AuthenticatedRequest, ApiErrorResponse } from "../../types/index.js";

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
 * /api/billing/checkout:
 *   post:
 *     summary: Create Stripe Checkout session
 *     description: Creates a Stripe Checkout session for upgrading to a paid plan.
 *     tags: [Billing]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planTier]
 *             properties:
 *               planTier:
 *                 type: string
 *                 enum: [PRO, SCALE]
 *     responses:
 *       200:
 *         description: Checkout session URL
 */
router.post(
  "/checkout",
  authenticateApiKey,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

/**
 * @openapi
 * /api/billing/portal:
 *   post:
 *     summary: Create Stripe Customer Portal session
 *     description: Creates a Stripe Customer Portal session for managing invoices and payment methods.
 *     tags: [Billing]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Portal session URL
 */
router.post(
  "/portal",
  authenticateApiKey,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

export default router;
