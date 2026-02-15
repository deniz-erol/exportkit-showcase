/**
 * Unit tests for ExportKit API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExportKitClient } from '../client.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ExportKitClient', () => {
  let client: ExportKitClient;

  beforeEach(() => {
    client = new ExportKitClient('test_api_key', 'https://api.test.com');
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with custom base URL', () => {
      const customClient = new ExportKitClient('key', 'https://custom.api.com');
      expect(customClient).toBeInstanceOf(ExportKitClient);
    });

    it('should create client with default base URL', () => {
      const defaultClient = new ExportKitClient('key');
      expect(defaultClient).toBeInstanceOf(ExportKitClient);
    });

    it('should remove trailing slash from base URL', () => {
      const clientWithSlash = new ExportKitClient('key', 'https://api.test.com/');
      expect(clientWithSlash).toBeInstanceOf(ExportKitClient);
    });
  });

  describe('createJob', () => {
    it('should create CSV job successfully', async () => {
      const mockResponse = {
        id: 'job_abc123',
        bullmqId: 'bull:123',
        status: 'QUEUED',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createJob('csv', { table: 'users' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/jobs',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-API-Key': 'test_api_key',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ type: 'csv', payload: { table: 'users' } }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should create job with empty payload', async () => {
      const mockResponse = {
        id: 'job_xyz',
        bullmqId: 'bull:456',
        status: 'QUEUED',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await client.createJob('json');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/jobs',
        expect.objectContaining({
          body: JSON.stringify({ type: 'json', payload: {} }),
        })
      );
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid API key' }),
      });

      await expect(client.createJob('csv')).rejects.toThrow(
        'ExportKit API error (401): Invalid API key'
      );
    });

    it('should handle JSON parse error in error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(client.createJob('csv')).rejects.toThrow(
        'ExportKit API error (500): Internal Server Error'
      );
    });
  });

  describe('getJobStatus', () => {
    it('should get job status successfully', async () => {
      const mockJob = {
        id: 'job_abc123',
        status: 'COMPLETED',
        type: 'csv',
        progress: 100,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T09:05:00Z',
        result: {
          downloadUrl: 'https://r2.test.com/file.csv',
          expiresAt: '2024-01-15T10:00:00Z',
          recordCount: 1500,
          fileSize: 45000,
          format: 'csv',
          key: 'exports/job_abc123.csv',
        },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockJob,
      });

      const result = await client.getJobStatus('job_abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/jobs/job_abc123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test_api_key',
          }),
        })
      );
      expect(result).toEqual(mockJob);
    });

    it('should throw error for non-existent job', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Job not found', code: 'JOB_NOT_FOUND' }),
      });

      await expect(client.getJobStatus('invalid_job')).rejects.toThrow(
        'ExportKit API error (404): Job not found'
      );
    });
  });

  describe('listJobs', () => {
    it('should list jobs with no filters', async () => {
      const mockResponse = {
        jobs: [
          {
            id: 'job_1',
            status: 'COMPLETED',
            type: 'csv',
            progress: 100,
            createdAt: '2024-01-15T09:00:00Z',
            updatedAt: '2024-01-15T09:05:00Z',
          },
        ],
        total: 45,
        offset: 0,
        limit: 20,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listJobs();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/jobs',
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });

    it('should list jobs with status filter', async () => {
      const mockResponse = {
        jobs: [],
        total: 0,
        offset: 0,
        limit: 20,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await client.listJobs({ status: 'FAILED' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/jobs?status=FAILED',
        expect.any(Object)
      );
    });

    it('should list jobs with pagination', async () => {
      const mockResponse = {
        jobs: [],
        total: 100,
        offset: 20,
        limit: 10,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await client.listJobs({ limit: 10, offset: 20 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/jobs?limit=10&offset=20',
        expect.any(Object)
      );
    });

    it('should list jobs with all filters', async () => {
      const mockResponse = {
        jobs: [],
        total: 5,
        offset: 10,
        limit: 50,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await client.listJobs({ status: 'COMPLETED', limit: 50, offset: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/jobs?status=COMPLETED&limit=50&offset=10',
        expect.any(Object)
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('should get download URL successfully', async () => {
      const mockResponse = {
        downloadUrl: 'https://r2.test.com/exports/job_abc123.csv?signature=...',
        expiresAt: '2024-01-15T10:30:00Z',
        fileExpiresAt: '2024-01-22T10:00:00Z',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getDownloadUrl('job_abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/jobs/job_abc123/download',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test_api_key',
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw error for incomplete export', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: 'Export not yet complete',
          code: 'EXPORT_NOT_READY',
        }),
      });

      await expect(client.getDownloadUrl('job_pending')).rejects.toThrow(
        'ExportKit API error (400): Export not yet complete'
      );
    });

    it('should throw error for expired file', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 410,
        statusText: 'Gone',
        json: async () => ({
          error: 'Gone',
          message: 'Export file has expired and been deleted',
        }),
      });

      await expect(client.getDownloadUrl('job_expired')).rejects.toThrow(
        'ExportKit API error (410): Gone'
      );
    });
  });
});
