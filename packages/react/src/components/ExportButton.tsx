import React, { useState, forwardRef, useCallback } from 'react';
import { useExport } from '../hooks/useExport';
import type { ExportConfig, ExportResult } from '../types';
import styles from './ExportButton.module.css';

/**
 * Props for the ExportButton component
 */
export interface ExportButtonProps {
  /** Your ExportKit API key */
  apiKey: string;
  /** Export configuration (type and optional payload) */
  config: ExportConfig;
  /** Optional base URL for the API (defaults to production) */
  baseUrl?: string;
  /** Callback when export completes successfully */
  onComplete?: (downloadUrl: string, result: ExportResult) => void;
  /** Callback when export fails */
  onError?: (error: Error) => void;
  /** Button content (default: "Export Data") */
  children?: React.ReactNode;
  /** Whether to disable the button while exporting (default: true) */
  disableWhileExporting?: boolean;
  /** Whether to show the download link when complete (default: true) */
  showDownloadLink?: boolean;
  /** Whether to show a progress bar (default: true) */
  showProgress?: boolean;
  /** Additional CSS class for the container */
  className?: string;
  /** Additional CSS class for the button */
  buttonClassName?: string;
  /** HTML button type attribute (default: "button") */
  type?: 'button' | 'submit' | 'reset';
  /** Accessible label for screen readers */
  'aria-label'?: string;
}

/**
 * Drop-in export button component with built-in progress tracking
 *
 * @example
 * ```tsx
 * <ExportButton
 *   apiKey="your-api-key"
 *   config={{ type: 'csv', payload: { table: 'users' } }}
 *   onComplete={(url) => console.log('Download:', url)}
 * >
 *   Export Users
 * </ExportButton>
 * ```
 */
export const ExportButton = forwardRef<HTMLButtonElement, ExportButtonProps>(
  function ExportButton(props, ref) {
    const {
      apiKey,
      config,
      baseUrl,
      onComplete,
      onError,
      children = 'Export Data',
      disableWhileExporting = true,
      showDownloadLink = true,
      showProgress = true,
      className,
      buttonClassName,
      type = 'button',
      'aria-label': ariaLabel,
    } = props;

    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const { exportData, isExporting, progress, error, status } = useExport({
      apiKey,
      baseUrl,
    });

    const handleClick = useCallback(async () => {
      // Reset state for new export
      setDownloadUrl(null);

      try {
        const result = await exportData(config);
        setDownloadUrl(result.downloadUrl);
        onComplete?.(result.downloadUrl, result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
      }
    }, [config, exportData, onComplete, onError]);

    const isDisabled = disableWhileExporting && isExporting;

    return (
      <div className={`${styles.container} ${className || ''}`.trim()}>
        <button
          ref={ref}
          type={type}
          onClick={handleClick}
          disabled={isDisabled}
          data-exporting={isExporting}
          aria-label={ariaLabel}
          aria-busy={isExporting}
          className={`${styles.button} ${buttonClassName || ''}`.trim()}
        >
          {isExporting && <span className={styles.spinner} aria-hidden="true" />}
          {isExporting ? `Exporting... ${progress}%` : children}
        </button>

        {showProgress && isExporting && progress > 0 && (
          <div className={styles.progressBar} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {error && (
          <div className={styles.error} role="alert">
            {error.message}
          </div>
        )}

        {showDownloadLink && downloadUrl && status === 'COMPLETED' && (
          <a
            href={downloadUrl}
            download
            className={styles.downloadLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download File
          </a>
        )}
      </div>
    );
  }
);
