/**
 * Unit tests for MCP tool handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExport, getJobStatus, listJobs, downloadExport } from '../tools.js';
import type { ExportKitClient } from '../client.js';

// Mock client
const createMockClient = (): ExportKitClient => {
  return {
    createJob: vi.fn(),
    getJobStatus: vi.fn(),
    listJobs: vi.fn(),
    getDownloadUrl: vi.fn(),
  } as unknown as ExportKitClient;
};

describe('createExport', () => {
  let mockClient: ExportKitClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('should create CSV export successfully', async () => {
    const mockResponse = {
      id: 'job_abc123',
      bullmqId: 'bull:123',
      status: 'QUEUED' as const,
    };
    vi.mocked(mockClient.createJob).mockResolvedValue(mockResponse);

    const result = await createExport(mockClient, {
      type: 'csv',
      payload: { table: 'users' },
    });

    expect(mockClient.createJob).toHaveBeenCalledWith('csv', { table: 'users' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.jobId).toBe('job_abc123');
    expect(parsed.status).toBe('QUEUED');
  });

  it('should create JSON export with empty payload', async () => {
    const mockResponse = {
      id: 'job_xyz789',
      bullmqId: 'bull:456',
      status: 'QUEUED' as const,
    };
    vi.mocked(mockClient.createJob).mockResolvedValue(mockResponse);

    const result = await createExport(mockClient, { type: 'json' });

    expect(mockClient.createJob).toHaveBeenCalledWith('json', {});
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.jobId).toBe('job_xyz789');
  });

  it('should create Excel export successfully', async () => {
    const mockResponse = {
      id: 'job_excel',
      bullmqId: 'bull:789',
      status: 'QUEUED' as const,
    };
    vi.mocked(mockClient.createJob).mockResolvedValue(mockResponse);

    const result = await createExport(mockClient, {
      type: 'xlsx',
      payload: { filters: { status: 'active' } },
    });

    expect(mockClient.createJob).toHaveBeenCalledWith('xlsx', {
      filters: { status: 'active' },
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
  });

  it('should throw error for invalid input', async () => {
    await expect(
      createExport(mockClient, { type: 'invalid' })
    ).rejects.toThrow();
  });

  it('should throw error when API call fails', async () => {
    vi.mocked(mockClient.createJob).mockRejectedValue(
      new Error('API error')
    );

    await expect(
      createExport(mockClient, { type: 'csv' })
    ).rejects.toThrow('API error');
  });
});

describe('getJobStatus', () => {
  let mockClient: ExportKitClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('should get status for queued job', async () => {
    const mockJob = {
      id: 'job_abc123',
      status: 'QUEUED' as const,
      type: 'csv' as const,
      progress: 0,
      createdAt: '2024-01-15T09:00:00Z',
      updatedAt: '2024-01-15T09:00:00Z',
    };
    vi.mocked(mockClient.getJobStatus).mockResolvedValue(mockJob);

    const result = await getJobStatus(mockClient, { jobId: 'job_abc123' });

    expect(mockClient.getJobStatus).toHaveBeenCalledWith('job_abc123');
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.job.id).toBe('job_abc123');
    expect(parsed.job.status).toBe('QUEUED');
    expect(parsed.job.progress).toBe(0);
  });

  it('should get status for completed job with result', async () => {
    const mockJob = {
      id: 'job_completed',
      status: 'COMPLETED' as const,
      type: 'json' as const,
      progress: 100,
      createdAt: '2024-01-15T09:00:00Z',
      updatedAt: '2024-01-15T09:05:00Z',
      result: {
        downloadUrl: 'https://r2.exportkit.dev/exports/job_completed.json',
        expiresAt: '2024-01-15T10:00:00Z',
        recordCount: 1500,
        fileSize: 45000,
        format: 'json',
        key: 'exports/job_completed.json',
      },
    };
    vi.mocked(mockClient.getJobStatus).mockResolvedValue(mockJob);

    const result = await getJobStatus(mockClient, { jobId: 'job_completed' });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.job.status).toBe('COMPLETED');
    expect(parsed.job.result).toBeDefined();
    expect(parsed.job.result.recordCount).toBe(1500);
  });

  it('should get status for failed job with error', async () => {
    const mockJob = {
      id: 'job_failed',
      status: 'FAILED' as const,
      type: 'csv' as const,
      progress: 45,
      createdAt: '2024-01-15T09:00:00Z',
      updatedAt: '2024-01-15T09:02:00Z',
      error: {
        message: 'Database connection timeout',
        code: 'DB_TIMEOUT',
      },
    };
    vi.mocked(mockClient.getJobStatus).mockResolvedValue(mockJob);

    const result = await getJobStatus(mockClient, { jobId: 'job_failed' });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.job.status).toBe('FAILED');
    expect(parsed.job.error).toBeDefined();
    expect(parsed.job.error.code).toBe('DB_TIMEOUT');
  });

  it('should throw error for invalid input', async () => {
    await expect(getJobStatus(mockClient, {})).rejects.toThrow();
  });
});

describe('listJobs', () => {
  let mockClient: ExportKitClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('should list all jobs with default pagination', async () => {
    const mockResponse = {
      jobs: [
        {
          id: 'job_1',
          status: 'COMPLETED' as const,
          type: 'csv' as const,
          progress: 100,
          createdAt: '2024-01-15T09:00:00Z',
          updatedAt: '2024-01-15T09:05:00Z',
        },
      ],
      total: 45,
      offset: 0,
      limit: 20,
    };
    vi.mocked(mockClient.listJobs).mockResolvedValue(mockResponse);

    const result = await listJobs(mockClient, {});

    expect(mockClient.listJobs).toHaveBeenCalledWith({
      status: undefined,
      limit: 20,
      offset: 0,
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.pagination.total).toBe(45);
    expect(parsed.pagination.hasMore).toBe(true);
  });

  it('should list jobs with status filter', async () => {
    const mockResponse = {
      jobs: [],
      total: 0,
      offset: 0,
      limit: 20,
    };
    vi.mocked(mockClient.listJobs).mockResolvedValue(mockResponse);

    const result = await listJobs(mockClient, { status: 'FAILED' });

    expect(mockClient.listJobs).toHaveBeenCalledWith({
      status: 'FAILED',
      limit: 20,
      offset: 0,
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.pagination.hasMore).toBe(false);
  });

  it('should list jobs with custom pagination', async () => {
    const mockResponse = {
      jobs: [],
      total: 100,
      offset: 50,
      limit: 25,
    };
    vi.mocked(mockClient.listJobs).mockResolvedValue(mockResponse);

    const result = await listJobs(mockClient, { limit: 25, offset: 50 });

    expect(mockClient.listJobs).toHaveBeenCalledWith({
      status: undefined,
      limit: 25,
      offset: 50,
    });
    const parsed = JSON.parse(result);
    expect(parsed.pagination.hasMore).toBe(true);
  });

  it('should calculate hasMore correctly when on last page', async () => {
    const mockResponse = {
      jobs: [],
      total: 100,
      offset: 90,
      limit: 20,
    };
    vi.mocked(mockClient.listJobs).mockResolvedValue(mockResponse);

    const result = await listJobs(mockClient, { offset: 90 });

    const parsed = JSON.parse(result);
    expect(parsed.pagination.hasMore).toBe(false);
  });
});

describe('downloadExport', () => {
  let mockClient: ExportKitClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('should generate download URL successfully', async () => {
    const mockResponse = {
      downloadUrl: 'https://r2.exportkit.dev/exports/job_abc123.csv?X-Amz-Algorithm=...',
      expiresAt: '2024-01-15T10:30:00Z',
      fileExpiresAt: '2024-01-22T10:00:00Z',
    };
    vi.mocked(mockClient.getDownloadUrl).mockResolvedValue(mockResponse);

    const result = await downloadExport(mockClient, { jobId: 'job_abc123' });

    expect(mockClient.getDownloadUrl).toHaveBeenCalledWith('job_abc123');
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.downloadUrl).toBe(mockResponse.downloadUrl);
    expect(parsed.expiresAt).toBe(mockResponse.expiresAt);
    expect(parsed.fileExpiresAt).toBe(mockResponse.fileExpiresAt);
  });

  it('should throw error for invalid input', async () => {
    await expect(downloadExport(mockClient, {})).rejects.toThrow();
  });

  it('should throw error when API call fails', async () => {
    vi.mocked(mockClient.getDownloadUrl).mockRejectedValue(
      new Error('Export not yet complete')
    );

    await expect(
      downloadExport(mockClient, { jobId: 'job_pending' })
    ).rejects.toThrow('Export not yet complete');
  });
});
