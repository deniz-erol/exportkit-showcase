/**
 * Type definitions for ExportKit MCP server.
 */

/**
 * Configuration for the MCP server.
 */
export interface ExportKitConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Job status enum matching the API.
 */
export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Export type enum matching the API.
 */
export type ExportType = 'csv' | 'json' | 'xlsx';

/**
 * Job response from the API.
 */
export interface Job {
  id: string;
  status: JobStatus;
  type: ExportType;
  progress: number;
  createdAt: string;
  updatedAt: string;
  result?: {
    downloadUrl: string;
    expiresAt: string;
    recordCount: number;
    fileSize: number;
    format: string;
    key: string;
  };
  error?: {
    message: string;
    code: string;
  };
}

/**
 * Create job response from the API.
 */
export interface CreateJobResponse {
  id: string;
  bullmqId: string;
  status: JobStatus;
}

/**
 * Download URL response from the API.
 */
export interface DownloadUrlResponse {
  downloadUrl: string;
  expiresAt: string;
  fileExpiresAt: string;
}

/**
 * List jobs response from the API.
 */
export interface ListJobsResponse {
  jobs: Job[];
  total: number;
  offset: number;
  limit: number;
}
