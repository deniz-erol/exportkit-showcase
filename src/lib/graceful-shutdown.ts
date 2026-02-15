/**
 * Graceful Shutdown Utilities
 *
 * Provides reusable shutdown orchestration for both the API server
 * and BullMQ worker processes. Handles timeout-based force-close,
 * double-shutdown prevention, and clean exit code management.
 *
 * Used by:
 * - `src/index.ts` (API server, 30s timeout)
 * - `src/worker.ts` (BullMQ worker, 60s timeout)
 */

import logger from "./logger.js";

/** Options for creating a graceful shutdown handler. */
export interface ShutdownOptions {
  /** Human-readable name for log messages (e.g. "API server", "Worker") */
  processName: string;
  /** Maximum time in ms to wait before force-exiting */
  timeoutMs: number;
  /** Async cleanup steps to run during shutdown */
  cleanup: () => Promise<void>;
  /** Optional callback to force-close resources (e.g. destroy sockets) on timeout */
  onForceClose?: () => void;
  /** Override for process.exit — used in tests to avoid actually exiting */
  exit?: (code: number) => void;
}

/**
 * Creates a graceful shutdown handler with timeout and double-shutdown protection.
 *
 * @param options - Shutdown configuration
 * @returns A function that can be called with a signal name to initiate shutdown
 */
export function createShutdownHandler(options: ShutdownOptions): (signal: string) => Promise<void> {
  const {
    processName,
    timeoutMs,
    cleanup,
    onForceClose,
    exit = (code: number) => process.exit(code),
  } = options;

  let isShuttingDown = false;

  return async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
      logger.warn({ msg: `${processName} shutdown already in progress, ignoring`, signal });
      return;
    }
    isShuttingDown = true;

    logger.info({ msg: `${processName} graceful shutdown initiated`, signal, timeoutMs });

    // Force-exit timeout. unref() so it doesn't keep the event loop alive.
    const forceTimer = setTimeout(() => {
      logger.warn({
        msg: `${processName} shutdown timeout expired, force-closing`,
        timeoutMs,
      });

      if (onForceClose) {
        onForceClose();
      }

      exit(1);
    }, timeoutMs);
    forceTimer.unref();

    try {
      await cleanup();

      logger.info({ msg: `${processName} graceful shutdown complete` });
      clearTimeout(forceTimer);
      exit(0);
    } catch (error) {
      logger.error({ err: error, msg: `Error during ${processName} shutdown` });
      clearTimeout(forceTimer);
      exit(1);
    }
  };
}
