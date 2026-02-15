/**
 * MCP tool handlers for ExportKit operations.
 */

import type { ExportKitClient } from './client.js';
import {
  createExportSchema,
  getJobStatusSchema,
  listJobsSchema,
  downloadExportSchema,
} from './schemas.js';

/**
 * Create a new export job.
 */
export async function createExport(
  client: ExportKitClient,
  args: unknown
): Promise<string> {
  const parsed = createExportSchema.parse(args);
  const result = await client.createJob(parsed.type, parsed.payload);

  return JSON.stringify(
    {
      success: true,
      jobId: result.id,
      bullmqId: result.bullmqId,
      status: result.status,
      message: `Export job created successfully. Job ID: ${result.id}`,
    },
    null,
    2
  );
}

/**
 * Get the status of an export job.
 */
export async function getJobStatus(
  client: ExportKitClient,
  args: unknown
): Promise<string> {
  const parsed = getJobStatusSchema.parse(args);
  const job = await client.getJobStatus(parsed.jobId);

  return JSON.stringify(
    {
      success: true,
      job: {
        id: job.id,
        status: job.status,
        type: job.type,
        progress: job.progress,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        ...(job.result && { result: job.result }),
        ...(job.error && { error: job.error }),
      },
    },
    null,
    2
  );
}

/**
 * List export jobs with optional filtering.
 */
export async function listJobs(
  client: ExportKitClient,
  args: unknown
): Promise<string> {
  const parsed = listJobsSchema.parse(args);
  const result = await client.listJobs({
    status: parsed.status,
    limit: parsed.limit,
    offset: parsed.offset,
  });

  return JSON.stringify(
    {
      success: true,
      jobs: result.jobs,
      pagination: {
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        hasMore: result.offset + result.limit < result.total,
      },
    },
    null,
    2
  );
}

/**
 * Get a download URL for a completed export.
 */
export async function downloadExport(
  client: ExportKitClient,
  args: unknown
): Promise<string> {
  const parsed = downloadExportSchema.parse(args);
  const result = await client.getDownloadUrl(parsed.jobId);

  return JSON.stringify(
    {
      success: true,
      downloadUrl: result.downloadUrl,
      expiresAt: result.expiresAt,
      fileExpiresAt: result.fileExpiresAt,
      message: 'Download URL generated successfully. The URL expires in 1 hour.',
    },
    null,
    2
  );
}
