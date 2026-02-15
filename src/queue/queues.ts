import { Queue } from "bullmq";
import { redisConnectionOptions } from "./connection.js";
import { scheduleQueue } from "./workers/schedule.js";
import { retentionQueue } from "./workers/retention-cleanup.js";

/**
 * Export job data structure.
 * Passed to BullMQ when creating export jobs.
 */
export interface ExportJobData {
  /** Customer ID who owns this job */
  customerId: string;
  /** Export type: csv, json or xlsx */
  type: "csv" | "json" | "xlsx";
  /** Job-specific payload (query params, filters, etc.) */
  payload: Record<string, unknown>;
}

/**
 * Webhook job data structure.
 * Passed to BullMQ when creating webhook notification jobs.
 */
export interface WebhookJobData {
  /** Webhook endpoint URL */
  url: string;
  /** Event type */
  event: "export.completed" | "export.failed";
  /** Internal job ID */
  jobId: string;
  /** Customer ID who owns this job */
  customerId: string;
  /** Payload to deliver */
  payload: {
    jobId: string;
    status: "COMPLETED" | "FAILED";
    downloadUrl?: string;
    expiresAt?: string;
    recordCount?: number;
    fileSize?: number;
    format?: string;
    completedAt?: string;
    error?: string;
    failedAt?: string;
  };
  /** WebhookDelivery record ID */
  deliveryId: string;
}

/**
 * Export job result structure.
 * Returned by successful job completion.
 */
export interface ExportJobResult {
  /** Signed download URL for the exported file */
  downloadUrl: string;
  /** URL expiry timestamp (ISO 8601) */
  expiresAt: string;
  /** Number of records exported */
  recordCount: number;
  /** File size in bytes */
  fileSize: number;
  /** Export format used */
  format: string;
  /** R2 object key */
  key: string;
}

/**
 * Default job options for all export queues.
 *
 * Retry configuration:
 * - attempts: 3 (initial + 2 retries)
 * - backoff: exponential starting at 1s (1s, 2s, 4s)
 *
 * Cleanup configuration:
 * - removeOnComplete: keep last 100 completed jobs in Redis
 * - removeOnFail: keep last 50 failed jobs in Redis
 *
 * Why keep jobs in Redis?
 * - Allows querying recent job status without database lookup
 * - BullMQ dashboard can show recent job history
 * - Automatic cleanup prevents unbounded Redis memory growth
 */
export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 1000, // 1 second base delay
  },
  removeOnComplete: {
    count: 100,
  },
  removeOnFail: {
    count: 50,
  },
};

/**
 * Export queue for processing data export requests.
 *
 * Job lifecycle:
 * 1. Job added to queue via exportQueue.add()
 * 2. Worker picks up job and starts processing
 * 3. Job status updated in database (PROCESSING)
 * 4. Worker completes job, returns result
 * 5. Event handler updates database (COMPLETED/FAILED)
 */
export const exportQueue = new Queue<ExportJobData, ExportJobResult>("export-queue", {
  connection: redisConnectionOptions,
  defaultJobOptions,
});

/**
 * Queue metrics for health checks and monitoring.
 */
export interface QueueStatus {
  /** Jobs waiting to be processed */
  waiting: number;
  /** Jobs currently being processed */
  active: number;
  /** Jobs completed (kept in Redis per removeOnComplete) */
  completed: number;
  /** Jobs failed (kept in Redis per removeOnFail) */
  failed: number;
  /** Jobs delayed for future processing */
  delayed: number;
  /** Jobs waiting for children to complete */
  waitingChildren: number;
  /** Jobs currently paused */
  paused: number;
}

/**
 * Get current queue metrics.
 *
 * @returns QueueStatus with counts of jobs in each state
 */
export async function getQueueStatus(): Promise<QueueStatus> {
  const [
    waiting,
    active,
    completed,
    failed,
    delayed,
    waitingChildren,
  ] = await Promise.all([
    exportQueue.getWaitingCount(),
    exportQueue.getActiveCount(),
    exportQueue.getCompletedCount(),
    exportQueue.getFailedCount(),
    exportQueue.getDelayedCount(),
    exportQueue.getWaitingChildrenCount(),
  ]);

  // Get paused count from job counts by state
  const jobCounts = await exportQueue.getJobCounts("paused");

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    waitingChildren,
    paused: jobCounts.paused || 0,
  };
}

/**
 * Gracefully close queue connections.
 * Call this during application shutdown.
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([exportQueue.close(), webhookQueue.close(), scheduleQueue.close(), retentionQueue.close()]);
}

/**
 * Webhook notification queue for processing webhook delivery jobs.
 *
 * Job lifecycle:
 * 1. Job added to queue via webhookQueue.add() (triggered by QueueEvents)
 * 2. Webhook worker picks up job and attempts delivery
 * 3. On success: WebhookDelivery record updated to DELIVERED
 * 4. On failure: Retried with exponential backoff up to 10 attempts
 *
 * Retry configuration:
 * - attempts: 10 (initial + 9 retries)
 * - backoff: exponential starting at 5s
 *   (5s, 10s, 20s, 40s, 80s, 160s, 320s, 640s, 1280s, 2560s)
 *   ~24 hour total retry window
 *
 * This queue is separate from the export queue to isolate webhook delivery
 * failures from export processing.
 */
export const webhookQueue = new Queue<WebhookJobData>("webhook-notifications", {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential" as const,
      delay: 5000, // 5 second base delay
    },
    removeOnComplete: {
      count: 100,
    },
    removeOnFail: {
      count: 50,
    },
  },
});

export default exportQueue;
