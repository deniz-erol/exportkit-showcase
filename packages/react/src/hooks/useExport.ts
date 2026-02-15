import { useState, useCallback, useRef, useEffect } from 'react';
import type { ExportConfig, ExportResult, JobStatus } from '../types';
import { createJob, getJobStatus, getDownloadUrl, ExportKitError } from '../lib/api-client';

const DEFAULT_BASE_URL = 'https://api.exportkit.io';
const POLL_INTERVAL_MS = 1000;

/**
 * Options for the useExport hook
 */
export interface UseExportOptions {
  /** Your ExportKit API key */
  apiKey: string;
  /** Optional base URL for the API (defaults to production) */
  baseUrl?: string;
}

/**
 * Return value from the useExport hook
 */
export interface UseExportReturn {
  /** Function to start an export */
  exportData: (config: ExportConfig) => Promise<ExportResult>;
  /** Whether an export is currently in progress */
  isExporting: boolean;
  /** Current progress percentage (0-100) */
  progress: number;
  /** Function to cancel the current export */
  cancel: () => void;
  /** Error if the export failed */
  error: Error | null;
  /** Current job status */
  status: JobStatus | null;
}

/**
 * Hook for managing export lifecycle with polling
 */
export function useExport(options: UseExportOptions): UseExportReturn {
  const { apiKey, baseUrl = DEFAULT_BASE_URL } = options;

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    if (isMountedRef.current) {
      setIsExporting(false);
      setStatus('FAILED');
    }
  }, []);

  const pollJobStatus = useCallback(
    async (jobId: string, signal: AbortSignal): Promise<ExportResult> => {
      return new Promise((resolve, reject) => {
        const poll = async () => {
          if (signal.aborted) {
            reject(new ExportKitError('Export cancelled', 'CANCELLED'));
            return;
          }

          try {
            const job = await getJobStatus(baseUrl, apiKey, jobId, signal);

            if (!isMountedRef.current) {
              reject(new ExportKitError('Component unmounted', 'UNMOUNTED'));
              return;
            }

            setStatus(job.status);
            setProgress(job.progress);

            if (job.status === 'COMPLETED') {
              const result = await getDownloadUrl(baseUrl, apiKey, jobId, signal);
              resolve(result);
            } else if (job.status === 'FAILED') {
              reject(new ExportKitError(job.error || 'Export failed', 'EXPORT_FAILED'));
            } else {
              // Continue polling
              pollingTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
            }
          } catch (err) {
            if (signal.aborted) {
              reject(new ExportKitError('Export cancelled', 'CANCELLED'));
            } else {
              reject(err);
            }
          }
        };

        poll();
      });
    },
    [apiKey, baseUrl]
  );

  const exportData = useCallback(
    async (config: ExportConfig): Promise<ExportResult> => {
      // Cancel any existing export
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsExporting(true);
      setProgress(0);
      setError(null);
      setStatus('QUEUED');

      try {
        const { id: jobId } = await createJob(baseUrl, apiKey, config, abortController.signal);
        setStatus('PROCESSING');

        const result = await pollJobStatus(jobId, abortController.signal);

        if (isMountedRef.current) {
          setIsExporting(false);
          setProgress(100);
          setStatus('COMPLETED');
        }

        return result;
      } catch (err) {
        if (isMountedRef.current) {
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
          setIsExporting(false);
          if (status !== 'FAILED') {
            setStatus('FAILED');
          }
        }
        throw err;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [apiKey, baseUrl, pollJobStatus, status]
  );

  return {
    exportData,
    isExporting,
    progress,
    cancel,
    error,
    status,
  };
}
