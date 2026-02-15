import { Router, type Request, type Response } from "express";
import express from "express";
import { billingService } from "../../services/billing-service.js";

const router = Router();

/**
 * Stripe webhook endpoint.
 * Uses raw body parsing for signature verification.
 *
 * @openapi
 * /api/webhooks/stripe:
 *   post:
 *     summary: Stripe webhook handler
 *     description: Handles Stripe webhook events for subscription lifecycle management.
 *     tags: [Webhooks]
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid signature
 */
router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  }
);

export default router;
