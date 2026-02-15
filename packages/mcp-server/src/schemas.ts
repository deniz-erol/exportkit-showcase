/**
 * Zod validation schemas for ExportKit MCP server tools.
 * These schemas match the REST API contracts.
 */

import { z } from 'zod';

/**
 * Schema for create_export tool input.
 */
export const createExportSchema = z.object({
  type: z.enum(['csv', 'json', 'xlsx'], {
    description: 'Export format type',
  }),
  payload: z.record(z.unknown()).optional().default({}),
});

/**
 * Schema for get_job_status tool input.
 */
export const getJobStatusSchema = z.object({
  jobId: z.string({
    description: 'Job ID to retrieve status for',
  }),
});

/**
 * Schema for list_jobs tool input.
 */
export const listJobsSchema = z.object({
  status: z.enum(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

/**
 * Schema for download_export tool input.
 */
export const downloadExportSchema = z.object({
  jobId: z.string({
    description: 'Job ID to generate download URL for',
  }),
});
