import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticateApiKey } from "../middleware/auth.js";
import { checkScope } from "../middleware/scope.js";
import { paginationMiddleware, formatPaginatedResponse } from "../middleware/pagination.js";
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
  getApiKeyById,
  updateApiKeyAllowedIps,
} from "../../services/auth-service.js";
import type {
  AuthenticatedRequest,
  ApiErrorResponse,
  ApiKeyCreationResult,
} from "../../types/index.js";
import { auditService } from "../../services/audit-service.js";
import logger from "../../lib/logger.js";

/** Valid API key scope values. */
const VALID_SCOPES = new Set(["READ", "WRITE", "ADMIN"] as const);

/**
 * @openapi
 * components:
 *   schemas:
 *     ApiKey:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique key identifier
 *         name:
 *           type: string
 *           description: Descriptive name for the key
 *         keyPrefix:
 *           type: string
 *           description: First 8 characters of the key (for identification)
 *         rateLimit:
 *           type: integer
 *           description: Requests per minute limit
 *         lastUsedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         isRevoked:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *       example:
 *         id: key_abc123
 *         name: "Production API Key"
 *         keyPrefix: "ek_live_"
 *         rateLimit: 100
 *         lastUsedAt: "2024-01-15T09:30:00Z"
 *         expiresAt: null
 *         isRevoked: false
 *         createdAt: "2024-01-10T00:00:00Z"
 *     CreateApiKeyRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: Descriptive name for the key
 *           minLength: 1
 *           maxLength: 100
 *         rateLimit:
 *           type: integer
 *           description: Requests per minute limit (1-10000)
 *           minimum: 1
 *           maximum: 10000
 *           default: 100
 *       example:
 *         name: "Production API Key"
 *         rateLimit: 1000
 *     CreateApiKeyResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         keyPrefix:
 *           type: string
 *         rateLimit:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         key:
 *           type: string
 *           description: FULL API KEY - ONLY SHOWN ONCE
 *       example:
 *         id: key_abc123
 *         name: "Production API Key"
 *         keyPrefix: "ek_live_"
 *         rateLimit: 1000
 *         createdAt: "2024-01-15T09:00:00Z"
 *         key: "ek_live_abc123def456ghi789jkl012mnop345"
 */

const router = Router();

/**
 * Async handler wrapper to catch errors in async route handlers.
 * Eliminates need for try-catch in every route.
 */
function asyncHandler(
  fn: (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => Promise<void | Response>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
}

/**
 * @openapi
 * /api/keys:
 *   post:
 *     summary: Generate API key
 *     description: |
 *       Create a new API key for the authenticated customer.
 *       The full key is returned ONLY ONCE in this response.
 *       Store it securely - it cannot be retrieved again.
 *     tags: [Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateApiKeyRequest'
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateApiKeyResponse'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 code:
 *                   type: string
 *             examples:
 *               missingName:
 *                 summary: Missing name
 *                 value:
 *                   error: "Name is required and must be a non-empty string"
 *                   code: "VALIDATION_ERROR"
 *               invalidRateLimit:
 *                 summary: Invalid rate limit
 *                 value:
 *                   error: "Rate limit must be an integer between 1 and 10000"
 *                   code: "VALIDATION_ERROR"
 *       401:
 *         description: Unauthorized - Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/",
  authenticateApiKey,
  checkScope,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

/**
 * @openapi
 * /api/keys:
 *   get:
 *     summary: List API keys
 *     description: List all API keys for the authenticated customer (excluding sensitive key hashes).
 *     tags: [Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ApiKey'
 *             example:
 *               - id: key_abc123
 *                 name: "Production API Key"
 *                 keyPrefix: "ek_live_"
 *                 rateLimit: 1000
 *                 lastUsedAt: "2024-01-15T09:30:00Z"
 *                 expiresAt: null
 *                 isRevoked: false
 *                 createdAt: "2024-01-10T00:00:00Z"
 *               - id: key_def456
 *                 name: "Development Key"
 *                 keyPrefix: "ek_dev_"
 *                 rateLimit: 100
 *                 lastUsedAt: null
 *                 expiresAt: null
 *                 isRevoked: false
 *                 createdAt: "2024-01-12T00:00:00Z"
 *       401:
 *         description: Unauthorized - Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/",
  authenticateApiKey,
  checkScope,
  paginationMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

/**
 * @openapi
 * /api/keys/{id}:
 *   delete:
 *     summary: Revoke API key
 *     description: |
 *       Revoke an API key by ID. The key must belong to the authenticated customer.
 *       Revoked keys cannot be used for authentication but remain in the list for audit purposes.
 *     tags: [Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       204:
 *         description: Key revoked successfully
 *       401:
 *         description: Unauthorized - Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: API key not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 code:
 *                   type: string
 *             example:
 *               error: "API key not found"
 *               code: "KEY_NOT_FOUND"
 *       409:
 *         description: API key is already revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 code:
 *                   type: string
 *             example:
 *               error: "API key is already revoked"
 *               code: "KEY_ALREADY_REVOKED"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete(
  "/:id",
  authenticateApiKey,
  checkScope,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

/**
 * @openapi
 * /api/keys/{id}:
 *   patch:
 *     summary: Update API key IP allowlist
 *     description: Update the IP allowlist for an API key. The key must belong to the authenticated customer.
 *     tags: [Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - allowedIps
 *             properties:
 *               allowedIps:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of CIDR notation strings
 *     responses:
 *       200:
 *         description: API key updated successfully
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: API key not found
 */
router.patch(
  "/:id",
  authenticateApiKey,
  checkScope,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  })
);

export default router;
