import { Worker, Job } from "bullmq";
import { redisConnectionOptions } from "./connection.js";
import { prisma } from "../db/client.js";
import type { ExportJobData, ExportJobResult, WebhookJobData } from "./queues.js";
import { JobStatus } from "@prisma/client";
import { exportCsvToR2 } from "../services/csv-export-service.js";
import { exportJsonToR2 } from "../services/json-export-service.js";
import { exportExcelToR2 } from "../services/ExcelService.js";
import { generateDownloadUrl } from "../services/storage-service.js";
import { deliverWebhook } from "../services/webhook-service.js";
import { notificationWorker } from "./workers/notification.js";
import { scheduleWorker, startScheduleChecker, stopScheduleWorker } from "./workers/schedule.js";
import { retentionWorker, startRetentionCleanup, stopRetentionCleanup } from "./workers/retention-cleanup.js";
import pinoLogger, { createJobLogger } from "../lib/logger.js";
import { captureJobFailure } from "../lib/sentry.js";

/**
 * Worker-level logger instance.
 * Job-specific logging uses child loggers via createJobLogger.
 */
const logger = pinoLogger.child({ component: "worker" });

/**
 * Export job processor function.
 *
 * Processes export requests with the following flow:
 * 1. Update job status to PROCESSING in database
 * 2. Call appropriate export service based on type (csv/json)
 * 3. Generate signed download URL for the exported file
 * 4. Return complete result with download URL
 *
 * @param job - BullMQ job containing ExportJobData
 * @returns ExportJobResult with download URL and export metadata
 */
async function processExportJob(
  job: Job<ExportJobData>
): Promise<ExportJobResult> {
  const { customerId, type, payload } = job.data;
  const bullmqId = job.id ?? "unknown";
  const jobLog = createJobLogger(bullmqId, customerId);

  jobLog.info({
    msg: "Starting export job",
    type,
    hasPayload: !!payload?.data,
  });

  // Update job status to PROCESSING in database
  await prisma.job.update({
    where: { bullmqId },
    data: {
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
      attemptsMade: job.attemptsMade || 1,
    },
  });

  jobLog.info("Job status updated to PROCESSING");

  try {
    // Call appropriate export service based on type
    let exportResult: { recordCount: number; fileSize: number; key: string };

    if (type === "csv") {
      exportResult = await exportCsvToR2({
        customerId,
        jobId: bullmqId,
        onProgress: async (progress) => {
          await job.updateProgress(progress);
          jobLog.debug({ msg: "Job progress", progress });
        },
        data: Array.isArray(payload?.data) ? payload.data : undefined,
      });
    } else if (type === "json") {
      exportResult = await exportJsonToR2({
        customerId,
        jobId: bullmqId,
        onProgress: async (progress) => {
          await job.updateProgress(progress);
          jobLog.debug({ msg: "Job progress", progress });
        },
        data: Array.isArray(payload?.data) ? payload.data : undefined,
      });
    } else if (type === "xlsx") {
      exportResult = await exportExcelToR2({
        customerId,
        jobId: bullmqId,
        onProgress: async (progress) => {
          await job.updateProgress(progress);
          jobLog.debug({ msg: "Job progress", progress });
        },
        data: Array.isArray(payload?.data) ? payload.data : undefined,
      });
    } else {
      throw new Error(`Unsupported export type: ${type}`);
    }

    // Generate signed download URL (1 hour expiry)
    const downloadUrl = await generateDownloadUrl(exportResult.key, 3600);
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    jobLog.info({
      msg: "Job completed successfully",
      recordCount: exportResult.recordCount,
      fileSize: exportResult.fileSize,
      format: type,
      key: exportResult.key,
    });

    return {
      downloadUrl,
      expiresAt,
      recordCount: exportResult.recordCount,
      fileSize: exportResult.fileSize,
      format: type,
      key: exportResult.key,
    };
  } catch (error) {
    jobLog.error({
      err: error,
      msg: "Export job failed",
      type,
    });
    throw error;
  }
}

/**
 * Export worker instance.
 *
 * Configuration:
 * - concurrency: 5 (process up to 5 jobs simultaneously)
 * - connection: shared Redis connection
 *
 * The worker continuously polls Redis for new jobs and processes them
 * using the processExportJob function.
 */
export const exportWorker = new Worker<ExportJobData, ExportJobResult>(
  "export-queue",
  processExportJob,
  {
    connection: redisConnectionOptions,
    concurrency: 5,
  }
);

/**
 * Worker event handlers for monitoring and logging.
 *
 * IMPORTANT: These handlers are required for proper worker operation.
 * Without error handlers, uncaught errors will crash the worker process.
 */

// Job completed successfully
exportWorker.on("completed", (job, result) => {
  const jobLog = createJobLogger(job.id ?? "unknown", job.data.customerId);
  jobLog.info({
    msg: "Job completed",
    result,
    duration: job.finishedOn
      ? job.finishedOn - (job.processedOn || job.finishedOn)
      : 0,
  });
});

// Job failed (exhausted all retries)
exportWorker.on("failed", (job, err) => {
  if (job) {
    const jobLog = createJobLogger(job.id ?? "unknown", job.data.customerId);
    jobLog.error({
      err,
      msg: "Job failed permanently",
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    });

    // Report job failure to Sentry with job context
    captureJobFailure(err, {
      jobId: job.id ?? "unknown",
      customerId: job.data.customerId,
      exportType: job.data.type,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    });
  } else {
    logger.error({ err, msg: "Job failed (job data unavailable)" });
  }
});

// Worker-level error (not job-specific)
exportWorker.on("error", (err) => {
  logger.error({ err, msg: "Export worker error" });
});

// Worker is ready to process jobs
exportWorker.on("ready", () => {
  logger.info("Export worker is ready and waiting for jobs");
});

// Worker is closing
exportWorker.on("closing", () => {
  logger.info("Export worker is closing");
});

// Worker is closed
exportWorker.on("closed", () => {
  logger.info("Export worker is closed");
});

/**
 * Gracefully stop the export worker.
 *
 * @param timeout - Maximum time to wait for active jobs to complete (ms)
 * @returns Promise that resolves when worker is closed
 */
export async function stopWorker(timeout = 30000): Promise<void> {
  logger.info({ msg: "Stopping workers", timeout });
  await Promise.all([
    exportWorker.close(),
    webhookWorker.close(),
    notificationWorker.close(),
    stopScheduleWorker(),
    stopRetentionCleanup(),
  ]);
  logger.info("All workers stopped");
}

/**
 * Webhook delivery worker instance.
 *
 * Configuration:
 * - concurrency: 10 (higher than export worker since webhook delivery is I/O bound)
 * - connection: shared Redis connection
 *
 * The webhook worker runs independently from the export worker with higher
 * concurrency because webhook delivery is network I/O bound rather than
 * CPU/memory bound like export processing.
 */
export const webhookWorker = new Worker<WebhookJobData>(
  "webhook-notifications",
  async (job) => {
    const startTime = Date.now();
    const jobLog = createJobLogger(job.id ?? "unknown", job.data.customerId);
    jobLog.info({
      msg: "Starting webhook delivery",
      deliveryId: job.data.deliveryId,
      event: job.data.event,
    });

    await deliverWebhook(job.data);

    const duration = Date.now() - startTime;
    jobLog.info({
      msg: "Webhook delivery completed",
      deliveryId: job.data.deliveryId,
      duration,
    });
  },
  {
    connection: redisConnectionOptions,
    concurrency: 10,
  }
);

/**
 * Webhook worker event handlers for monitoring and logging.
 */

// Job completed successfully
webhookWorker.on("completed", (job, result) => {
  const jobLog = createJobLogger(job.id ?? "unknown", job.data.customerId);
  jobLog.info({
    msg: "Webhook job completed",
    deliveryId: job.data.deliveryId,
    result,
    duration: job.finishedOn
      ? job.finishedOn - (job.processedOn || job.finishedOn)
      : 0,
    attempts: job.attemptsMade,
  });
});

// Job failed (exhausted all retries)
webhookWorker.on("failed", (job, err) => {
  if (job) {
    const jobLog = createJobLogger(job.id ?? "unknown", job.data.customerId);
    jobLog.error({
      err,
      msg: "Webhook job failed permanently",
      deliveryId: job.data.deliveryId,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    });

    // Report webhook delivery failure to Sentry with job context
    captureJobFailure(err, {
      jobId: job.id ?? "unknown",
      customerId: job.data.customerId,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts,
    });
  } else {
    logger.error({ err, msg: "Webhook job failed (job data unavailable)" });
  }
});

// Worker-level error (not job-specific)
webhookWorker.on("error", (err) => {
  logger.error({ err, msg: "Webhook worker error" });
});

// Worker is ready to process jobs
webhookWorker.on("ready", () => {
  logger.info("Webhook worker is ready and waiting for jobs");
});

// Worker is closing
webhookWorker.on("closing", () => {
  logger.info("Webhook worker is closing");
});

// Worker is closed
webhookWorker.on("closed", () => {
  logger.info("Webhook worker is closed");
});

/**
 * Start both export and webhook workers.
 *
 * This function logs startup information for both workers.
 * Workers start automatically when imported, but this provides
 * explicit control and logging.
 */
export function startWorker(): void {
  logger.info("Export worker started (concurrency: 5)");
  logger.info("Webhook worker started (concurrency: 10)");
  logger.info("Notification worker started (concurrency: 5)");

  // Start the schedule checker repeatable job
  startScheduleChecker().catch((err) => {
    logger.error({ err, msg: "Failed to start schedule checker" });
  });
  logger.info("Schedule worker started (concurrency: 1)");

  // Start the retention cleanup repeatable job (daily at 3 AM UTC)
  startRetentionCleanup().catch((err) => {
    logger.error({ err, msg: "Failed to start retention cleanup" });
  });
  logger.info("Retention cleanup worker started (concurrency: 1)");
}

export default exportWorker;
