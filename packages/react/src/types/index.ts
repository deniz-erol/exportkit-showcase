/**
 * Export configuration options
 */
export interface ExportConfig {
  /** Export format type */
  type: 'csv' | 'json';
  /** Optional payload to pass to the export job */
  payload?: Record<string, unknown>;
}

/**
 * Result of a successful export
 */
export interface ExportResult {
  /** Unique job identifier */
  jobId: string;
  /** URL to download the exported file */
  downloadUrl: string;
  /** ISO 8601 timestamp when the download URL expires */
  expiresAt: string;
}

/**
 * Job status values
 */
export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Job information returned from the API
 */
export interface Job {
  /** Unique job identifier */
  id: string;
  /** Current status of the job */
  status: JobStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Export type */
  type: 'csv' | 'json';
  /** Error message if job failed */
  error?: string;
  /** ISO 8601 timestamp when the job was created */
  createdAt: string;
  /** ISO 8601 timestamp when the job was last updated */
  updatedAt: string;
  /** ISO 8601 timestamp when the file expires (if completed) */
  fileExpiresAt?: string;
}
