/**
 * Unit tests for Zod validation schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  createExportSchema,
  getJobStatusSchema,
  listJobsSchema,
  downloadExportSchema,
} from '../schemas.js';

describe('createExportSchema', () => {
  it('should validate valid CSV export request', () => {
    const input = { type: 'csv', payload: { table: 'users' } };
    const result = createExportSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('csv');
      expect(result.data.payload).toEqual({ table: 'users' });
    }
  });

  it('should validate valid JSON export request', () => {
    const input = { type: 'json' };
    const result = createExportSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('json');
      expect(result.data.payload).toEqual({});
    }
  });

  it('should validate valid Excel export request', () => {
    const input = { type: 'xlsx', payload: { filters: { status: 'active' } } };
    const result = createExportSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('xlsx');
    }
  });

  it('should default payload to empty object when not provided', () => {
    const input = { type: 'csv' };
    const result = createExportSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload).toEqual({});
    }
  });

  it('should reject invalid export type', () => {
    const input = { type: 'pdf' };
    const result = createExportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject missing type field', () => {
    const input = { payload: {} };
    const result = createExportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('getJobStatusSchema', () => {
  it('should validate valid job ID', () => {
    const input = { jobId: 'job_abc123' };
    const result = getJobStatusSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jobId).toBe('job_abc123');
    }
  });

  it('should reject missing jobId field', () => {
    const input = {};
    const result = getJobStatusSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject non-string jobId', () => {
    const input = { jobId: 123 };
    const result = getJobStatusSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('listJobsSchema', () => {
  it('should validate request with all parameters', () => {
    const input = { status: 'COMPLETED', limit: 50, offset: 10 };
    const result = listJobsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('COMPLETED');
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(10);
    }
  });

  it('should validate request with no parameters', () => {
    const input = {};
    const result = listJobsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBeUndefined();
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it('should validate request with only status filter', () => {
    const input = { status: 'FAILED' };
    const result = listJobsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('FAILED');
    }
  });

  it('should reject invalid status value', () => {
    const input = { status: 'INVALID' };
    const result = listJobsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject limit above maximum', () => {
    const input = { limit: 101 };
    const result = listJobsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject limit below minimum', () => {
    const input = { limit: 0 };
    const result = listJobsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject negative offset', () => {
    const input = { offset: -1 };
    const result = listJobsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('downloadExportSchema', () => {
  it('should validate valid job ID', () => {
    const input = { jobId: 'job_xyz789' };
    const result = downloadExportSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jobId).toBe('job_xyz789');
    }
  });

  it('should reject missing jobId field', () => {
    const input = {};
    const result = downloadExportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject non-string jobId', () => {
    const input = { jobId: null };
    const result = downloadExportSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
