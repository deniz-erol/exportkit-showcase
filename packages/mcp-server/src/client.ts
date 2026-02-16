/**
 * HTTP client for ExportKit API.
 */

import type {
  CreateJobResponse,
  Job,
  DownloadUrlResponse,
  ListJobsResponse,
  ExportType,
  JobStatus,
} from './types.js';

/**
 * ExportKit API client.
 */
export class ExportKitClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.exportkit.dev') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Make an authenticated request to the ExportKit API.
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(
        `ExportKit API error (${response.status}): ${
          errorData.error || response.statusText
        }`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create a new export job.
   *
   * @param type - Export format (csv, json, xlsx)
   * @param payload - Custom payload for the export
   * @returns Created job details
   */
  async createJob(
    type: ExportType,
    payload: Record<string, unknown> = {}
  ): Promise<CreateJobResponse> {
    return this.request<CreateJobResponse>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ type, payload }),
    });
  }

  /**
   * Get job status by ID.
   *
   * @param jobId - Job ID
   * @returns Job details with status
   */
  async getJobStatus(jobId: string): Promise<Job> {
    return this.request<Job>(`/api/jobs/${jobId}`);
  }

  /**
   * List jobs with optional filtering.
   *
   * @param options - Filter and pagination options
   * @returns List of jobs with pagination metadata
   */
  async listJobs(options: {
    status?: JobStatus;
    limit?: number;
    offset?: number;
  } = {}): Promise<ListJobsResponse> {
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());

    const query = params.toString();
    const path = query ? `/api/jobs?${query}` : '/api/jobs';

    return this.request<ListJobsResponse>(path);
  }

  /**
   * Get download URL for a completed export.
   *
   * @param jobId - Job ID
   * @returns Signed download URL with expiration times
   */
  async getDownloadUrl(jobId: string): Promise<DownloadUrlResponse> {
    return this.request<DownloadUrlResponse>(`/api/jobs/${jobId}/download`);
  }
}
