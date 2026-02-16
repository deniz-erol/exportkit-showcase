import { Router } from "express";
import { z } from "zod";
import { authenticateApiKey } from "../middleware/auth.js";
import { createCircuitBreaker } from "../middleware/circuit-breaker.js";
import { paginationMiddleware, formatPaginatedResponse } from "../middleware/pagination.js";
import {
  exportCreationLimiter,
  exportCreationBurstLimiter,
  downloadLimiter,
  downloadBurstLimiter,
  generalLimiter,
  generalBurstLimiter,
} from "../middleware/rate-limit.js";
import { jobService } from "../../services/job-service.js";
import { getJobDownloadStatus } from "../../services/retention-service.js";
import { checkUsageCap } from "../../services/usage-service.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import type { Response } from "express";
import { JobStatus } from "@prisma/client";
import logger from "../../lib/logger.js";

/**
 * @openapi
 * components:
 *   schemas:
 *     Job:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique job identifier
 *         status:
 *           type: string
 *           enum: [QUEUED, PROCESSING, COMPLETED, FAILED]
 *         type:
 *           type: string
 *           enum: [csv, json]
 *         progress:
 *           type: integer
 *           description: Progress percentage (0-100)
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         result:
 *           type: object
 *           properties:
 *             downloadUrl:
 *               type: string
 *             expiresAt:
 *               type: string
 *               format: date-time
 *             recordCount:
 *               type: integer
 *             fileSize:
 *               type: integer
 *             format:
 *               type: string
 *             key:
 *               type: string
 *         error:
 *           type: object
 *           properties:
 *             message:
 *               type: string
 *             code:
 *               type: string
 *     CreateJobRequest:
 *       type: object
 *       required:
 *         - type
 *       properties:
 *         type:
 *           type: string
 *           enum: [csv, json]
 *           description: Export format type
 *         payload:
 *           type: object
 *           description: Custom payload for the export job
 *           default: {}
 *       example:
 *         type: csv
 *         payload:
 *           table: users
 *           filters:
 *             status: active
 *     CreateJobResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         bullmqId:
 *           type: string
 *         status:
 *           type: string
 *           enum: [QUEUED, PROCESSING, COMPLETED, FAILED]
 *       example:
 *         id: job_abc123
 *         bullmqId: bull:123
 *         status: QUEUED
 *     JobListResponse:
 *       type: object
 *       properties:
 *         jobs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Job'
 *         total:
 *           type: integer
 *         offset:
 *           type: integer
 *         limit:
 *           type: integer
 *     DownloadUrlResponse:
 *       type: object
 *       properties:
 *         downloadUrl:
 *           type: string
 *           description: Signed URL for downloading the export file
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: When the signed URL expires
 *         fileExpiresAt:
 *           type: string
 *           format: date-time
 *           description: When the file will be permanently deleted
 *       example:
 *         downloadUrl: https://r2.exportkit.dev/exports/job_abc123.csv?X-Amz-Algorithm=...
 *         expiresAt: "2024-01-15T10:30:00Z"
 *         fileExpiresAt: "2024-01-22T10:00:00Z"
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *         code:
 *           type: string
 *         details:
 *           type: array
 *           items:
 *             type: object
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: X-API-Key
 */

/**
 * Zod schema for job creation request body.
 */
const createJobSchema = z.object({
  type: z.enum(["csv", "json"]),
  payload: z.record(z.unknown()).default({}),
});

/**
 * Zod schema for job list query parameters.
 */
const listJobsSchema = z.object({
  status: z.enum(["QUEUED", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
});

/**
 * Job routes router.
 *
 * Routes:
 * - POST /api/jobs - Create a new export job
 * - GET /api/jobs - List jobs for the authenticated customer
 * - GET /api/jobs/:id - Get job status by ID
 */
const router = Router();

/**
 * @openapi
 * /api/jobs:
 *   post:
 *     summary: Create export job
 *     description: Create a new data export job (CSV or JSON format). The job will be queued and processed asynchronously.
 *     tags: [Jobs]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateJobRequest'
 *     responses:
 *       201:
 *         description: Job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateJobResponse'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Invalid request body"
 *               code: "VALIDATION_ERROR"
 *               details: [{"path": ["type"], "message": "Required"}]
 *       401:
 *         description: Unauthorized - Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Unauthorized"
 *               code: "UNAUTHORIZED"
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Too many requests"
 *               code: "RATE_LIMIT_EXCEEDED"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/",
  exportCreationLimiter,
  exportCreationBurstLimiter,
  authenticateApiKey,
  createCircuitBreaker(),
  async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  }
);

/**
 * @openapi
 * /api/jobs:
 *   get:
 *     summary: List export jobs
 *     description: List all export jobs for the authenticated customer with optional filtering and pagination.
 *     tags: [Jobs]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [QUEUED, PROCESSING, COMPLETED, FAILED]
 *         description: Filter by job status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of jobs to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of jobs to skip
 *     responses:
 *       200:
 *         description: List of jobs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JobListResponse'
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Rate limit exceeded
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
  generalLimiter,
  generalBurstLimiter,
  authenticateApiKey,
  paginationMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  }
);

/**
 * @openapi
 * /api/jobs/{id}:
 *   get:
 *     summary: Get job status
 *     description: Get detailed status of a specific export job by ID.
 *     tags: [Jobs]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Job'
 *             examples:
 *               queued:
 *                 summary: Job is queued
 *                 value:
 *                   id: job_abc123
 *                   status: QUEUED
 *                   type: csv
 *                   progress: 0
 *                   createdAt: "2024-01-15T09:00:00Z"
 *                   updatedAt: "2024-01-15T09:00:00Z"
 *               completed:
 *                 summary: Job completed
 *                 value:
 *                   id: job_abc123
 *                   status: COMPLETED
 *                   type: csv
 *                   progress: 100
 *                   createdAt: "2024-01-15T09:00:00Z"
 *                   updatedAt: "2024-01-15T09:05:00Z"
 *                   result:
 *                     downloadUrl: https://r2.exportkit.dev/exports/job_abc123.csv
 *                     expiresAt: "2024-01-15T10:00:00Z"
 *                     recordCount: 1500
 *                     fileSize: 45000
 *                     format: csv
 *                     key: exports/job_abc123.csv
 *               failed:
 *                 summary: Job failed
 *                 value:
 *                   id: job_abc123
 *                   status: FAILED
 *                   type: csv
 *                   progress: 45
 *                   createdAt: "2024-01-15T09:00:00Z"
 *                   updatedAt: "2024-01-15T09:02:00Z"
 *                   error:
 *                     message: "Database connection timeout"
 *                     code: "DB_TIMEOUT"
 *       401:
 *         description: Unauthorized - Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Job not found"
 *               code: "JOB_NOT_FOUND"
 *       429:
 *         description: Rate limit exceeded
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
  "/:id",
  generalLimiter,
  generalBurstLimiter,
  authenticateApiKey,
  async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  }
);

/**
 * @openapi
 * /api/jobs/{id}/download:
 *   get:
 *     summary: Get download URL
 *     description: |
 *       Generate a fresh signed download URL for a completed export job.
 *       The URL expires after 1 hour. Returns 410 Gone if the file has expired
 *       and been deleted per the retention policy.
 *     tags: [Jobs]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Download URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadUrlResponse'
 *       400:
 *         description: Export not yet complete
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Export not yet complete"
 *               code: "EXPORT_NOT_READY"
 *       401:
 *         description: Unauthorized - Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Job not found"
 *               code: "JOB_NOT_FOUND"
 *       410:
 *         description: Export file has expired and been deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 message:
 *                   type: string
 *                 expiredAt:
 *                   type: string
 *                   format: date-time
 *             example:
 *               error: "Gone"
 *               message: "Export file has expired and been deleted"
 *               expiredAt: "2024-01-22T09:00:00Z"
 *       429:
 *         description: Rate limit exceeded
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
  "/:id/download",
  downloadLimiter,
  downloadBurstLimiter,
  authenticateApiKey,
  async (req: AuthenticatedRequest, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  }
);

export default router;
