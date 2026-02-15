import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authenticateApiKey } from "../middleware/auth.js";
import { deleteAccount } from "../../services/account-deletion-service.js";
import { generateDataExport } from "../../services/data-export-service.js";
import { updateConsent, acceptTos } from "../../services/consent-service.js";
import type { AuthenticatedRequest } from "../../types/index.js";
import logger from "../../lib/logger.js";

const router = Router();

function asyncHandler(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
}

// --- Zod schemas ---

const deleteAccountSchema = z.object({
  confirmEmail: z.string().email(),
});

const updateConsentSchema = z.object({
  emailNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  tosVersion: z.string().optional(),
});

// --- Routes ---

/**
 * DELETE /api/account
 *
 * Permanently deletes the authenticated customer's account and all associated data.
 * Requires email confirmation in the request body to prevent accidental deletion.
 * Satisfies GDPR Right to Erasure (Article 17).
 *
 * @security ApiKeyAuth
 */
router.delete(
  "/",
  authenticateApiKey,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

/**
 * GET /api/account/data-export
 *
 * Generates a JSON archive of all personal data held about the authenticated customer
 * and returns a signed download URL valid for 24 hours.
 * Satisfies GDPR Right to Data Portability (Article 20).
 *
 * @security ApiKeyAuth
 */
router.get(
  "/data-export",
  authenticateApiKey,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

/**
 * PATCH /api/account/consent
 *
 * Updates consent preferences and/or accepts a new TOS version.
 * Creates audit log entries for all changes.
 * Satisfies GDPR Consent Management (Article 7).
 *
 * @security ApiKeyAuth
 */
router.patch(
  "/consent",
  authenticateApiKey,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

export default router;
