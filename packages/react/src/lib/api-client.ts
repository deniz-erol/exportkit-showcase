import type { ExportConfig, Job, ExportResult } from '../types';

const DEFAULT_BASE_URL = 'https://api.exportkit.dev';

/**
 * API error with additional context
 */
export class ExportKitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'ExportKitError';
  }
}

/**
 * Create a new export job
 */
export async function createJob(
  baseUrl: string,
  apiKey: string,
  config: ExportConfig,
  signal?: AbortSignal
): Promise<{ id: string }> {
  const url = `${baseUrl}/api/jobs`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(config),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ExportKitError(
      errorData.message || `Failed to create job: ${response.statusText}`,
      errorData.code || 'CREATE_JOB_FAILED',
      response.status
    );
  }

  return response.json();
}

/**
 * Get the current status of a job
 */
export async function getJobStatus(
  baseUrl: string,
  apiKey: string,
  jobId: string,
  signal?: AbortSignal
): Promise<Job> {
  const url = `${baseUrl}/api/jobs/${jobId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
    },
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ExportKitError(
      errorData.message || `Failed to get job status: ${response.statusText}`,
      errorData.code || 'GET_JOB_FAILED',
      response.status
    );
  }

  return response.json();
}

/**
 * Get the download URL for a completed job
 */
export async function getDownloadUrl(
  baseUrl: string,
  apiKey: string,
  jobId: string,
  signal?: AbortSignal
): Promise<ExportResult> {
  const url = `${baseUrl}/api/jobs/${jobId}/download`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
    },
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ExportKitError(
      errorData.message || `Failed to get download URL: ${response.statusText}`,
      errorData.code || 'GET_DOWNLOAD_FAILED',
      response.status
    );
  }

  return response.json();
}
