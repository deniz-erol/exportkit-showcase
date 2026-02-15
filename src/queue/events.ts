import { QueueEvents } from "bullmq";
import { redisConnectionOptions } from "./connection.js";
import { prisma } from "../db/client.js";
import { JobStatus } from "@prisma/client";
import {
  setJobExpiration,
  schedulePreDeletionNotification,
} from "../services/retention-service.js";
import { webhookQueue } from "./queues.js";
import { emailQueue } from "./notification.js";
import { createWebhookDelivery } from "../services/webhook-service.js";
import { generateDownloadUrl } from "../services/storage-service.js";
import { recordJobUsage } from "../services/usage-service.js";
import pinoLogger, { createJobLogger } from "../lib/logger.js";
import { recordFailedJob } from "../services/alert-service.js";

/** 24 hours in seconds — used for email download link expiry per CLOSE-02 AC3 */
const EMAIL_LINK_EXPIRY_SECONDS = 86400;

/**
 * Queue events logger instance.
 */
const logger = pinoLogger.child({ component: "queue-events" });

/**
 * Queue events instance for the exports queue.
 *
 * QueueEvents listens to Redis pub/sub channels that BullMQ uses
 * to broadcast job state changes. This provides event-driven
 * synchronization between BullMQ and our Postgres database.
 */
let queueEvents: QueueEvents | null = null;

/**
 * Set up queue event handlers for status tracking.
 *
 * This function creates a QueueEvents instance and attaches handlers
 * for job lifecycle events. It provides event-driven synchronization
 * between BullMQ (Redis) and our database (Postgres).
 *
 * Events handled:
 * - completed: Job finished successfully
 * - failed: Job failed (may retry or be final)
 * - progress: Job progress updated
 *
 * @returns Cleanup function to gracefully close event listeners
 */
export function setupQueueEvents(): () => Promise<void> {
  if (queueEvents) {
    logger.warn("Queue events already set up, returning existing cleanup");
    return async () => {
      await queueEvents?.close();
      queueEvents = null;
    };
  }

  queueEvents = new QueueEvents("export-queue", {
    connection: redisConnectionOptions,
  });

  /**
   * Handle job completion event.
   *
   * Updates the job record in Postgres with:
   * - status: COMPLETED
   * - result: The return value from the job processor
   * - completedAt: Current timestamp
   * - fileExpiresAt: Calculated expiration date (7 days from completion)
   *
   * Also schedules pre-deletion notification if customer has enabled it.
   */
  queueEvents.on(
    "completed",
    async ({
      jobId,
      returnvalue,
      prev,
    }: {
      jobId: string;
      returnvalue: unknown;
      prev?: string;
    }) => {
      try {
        const jobLog = createJobLogger(jobId, "");

        jobLog.info({
          msg: "Job completed event received",
          prev,
        });

        // Serialize result to JSON-compatible format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultData: any = returnvalue
          ? JSON.parse(JSON.stringify(returnvalue))
          : null;

        const completedAt = new Date();

        const updatedJob = await prisma.job.update({
          where: { bullmqId: jobId },
          data: {
            status: JobStatus.COMPLETED,
            result: resultData,
            completedAt,
          },
        });

        // Get customer to check notification preferences and retention settings
        const customer = await prisma.customer.findUnique({
          where: { id: updatedJob.customerId },
          select: {
            notifyBeforeDeletion: true,
            emailNotifications: true,
            email: true,
            retentionDays: true,
          },
        });

        // Set file expiration date based on customer's retention setting (ENT-01)
        // Falls back to default 7 days if customer has no custom setting
        try {
          const retentionDays = customer?.retentionDays ?? 7;
          const fileExpiresAt = await setJobExpiration(updatedJob.id, completedAt, retentionDays);
          jobLog.info({
            msg: "File expiration set",
            dbJobId: updatedJob.id,
            fileExpiresAt: fileExpiresAt.toISOString(),
            retentionDays,
          });

          // Schedule pre-deletion notification if customer enabled it
          if (customer?.notifyBeforeDeletion) {
            const scheduled = await schedulePreDeletionNotification(
              updatedJob.id,
              updatedJob.customerId,
              fileExpiresAt
            );

            if (scheduled) {
              jobLog.info({
                msg: "Pre-deletion notification scheduled",
                dbJobId: updatedJob.id,
                fileExpiresAt: fileExpiresAt.toISOString(),
              });
            }
          }
        } catch (retentionError) {
          // Retention tracking failures should not affect job completion
          // Log the error but don't fail the completion event
          jobLog.warn({
            msg: "Failed to set retention",
            dbJobId: updatedJob.id,
            error: retentionError instanceof Error ? retentionError.message : String(retentionError),
          });
        }

        jobLog.info({
          msg: "Job updated to COMPLETED in database",
          dbJobId: updatedJob.id,
          bullmqId: jobId,
        });

        // Record usage for billing (idempotent via unique jobId constraint)
        try {
          const recordCount =
            resultData?.recordCount && typeof resultData.recordCount === "number"
              ? resultData.recordCount
              : 0;
          if (recordCount > 0) {
            await recordJobUsage(updatedJob.customerId, updatedJob.id, recordCount);
            jobLog.info({
              msg: "Usage recorded",
              dbJobId: updatedJob.id,
              recordCount,
            });
          }
        } catch (usageError) {
          jobLog.warn({
            msg: "Failed to record usage",
            dbJobId: updatedJob.id,
            error: usageError instanceof Error ? usageError.message : String(usageError),
          });
        }

        // Trigger email notification
        if (customer?.emailNotifications && customer.email) {
          try {
            // Generate a fresh signed URL with 24-hour expiry for email links
            // (CLOSE-02 AC3: email download links must expire after 24 hours)
            let emailDownloadUrl = resultData?.downloadUrl;
            let emailExpiresAt = resultData?.expiresAt;
            if (resultData?.key) {
              try {
                emailDownloadUrl = await generateDownloadUrl(
                  resultData.key as string,
                  EMAIL_LINK_EXPIRY_SECONDS
                );
                emailExpiresAt = new Date(
                  Date.now() + EMAIL_LINK_EXPIRY_SECONDS * 1000
                ).toISOString();
              } catch (urlError) {
                // Fall back to the original 1-hour URL if generation fails
                jobLog.warn({
                  msg: "Failed to generate 24h email URL, using default",
                  error: urlError instanceof Error ? urlError.message : String(urlError),
                });
              }
            }

            await emailQueue.add("send-email", {
              type: "export_completed",
              to: customer.email,
              customerId: updatedJob.customerId,
              payload: {
                downloadUrl: emailDownloadUrl,
                expiresAt: emailExpiresAt,
                recordCount: resultData?.recordCount,
                fileSize: resultData?.fileSize,
                format: resultData?.format,
              },
            });
            jobLog.info("Email notification queued");
          } catch (error) {
            jobLog.error({
              msg: "Failed to queue email notification",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Trigger webhook notification if customer has webhook configured
        try {
          const jobWithCustomer = await prisma.job.findUnique({
            where: { bullmqId: jobId },
            include: { customer: true },
          });

          if (
            jobWithCustomer?.customer?.webhookUrl &&
            jobWithCustomer?.customer?.webhookActive
          ) {
            const payload = {
              jobId: jobWithCustomer.id,
              status: "COMPLETED" as const,
              downloadUrl: resultData?.downloadUrl,
              expiresAt: resultData?.expiresAt,
              recordCount: resultData?.recordCount,
              fileSize: resultData?.fileSize,
              format: resultData?.format,
              completedAt: completedAt.toISOString(),
            };

            // Create delivery record for tracking
            const deliveryId = await createWebhookDelivery({
              jobId: jobWithCustomer.id,
              customerId: jobWithCustomer.customerId,
              event: "export.completed",
              payload,
            });

            // Enqueue webhook delivery job
            await webhookQueue.add(
              "deliver",
              {
                url: jobWithCustomer.customer.webhookUrl,
                event: "export.completed",
                jobId: jobWithCustomer.id,
                customerId: jobWithCustomer.customerId,
                payload,
                deliveryId,
              },
              {
                jobId: `webhook-${deliveryId}`,
              }
            );

            jobLog.info({
              msg: "Webhook queued for completed job",
              dbJobId: jobWithCustomer.id,
              deliveryId,
              customerId: jobWithCustomer.customerId,
              event: "export.completed",
            });
          }
        } catch (webhookError) {
          // Webhook failures should not affect job completion
          jobLog.warn({
            msg: "Failed to queue webhook",
            error: webhookError instanceof Error ? webhookError.message : String(webhookError),
          });
        }
      } catch (error) {
        logger.error({
          msg: "Failed to update job as completed",
          jobId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Handle job failure event.
   *
   * Checks if this is the final failure (all retries exhausted) or
   * if the job will be retried. Updates the database accordingly.
   */
  queueEvents.on(
    "failed",
    async ({
      jobId,
      failedReason,
      prev,
    }: {
      jobId: string;
      failedReason: string;
      prev?: string;
    }) => {
      // Track failed job for alerting (OBS-04)
      recordFailedJob();

      try {
        const jobLog = createJobLogger(jobId, "");

        jobLog.info({
          msg: "Job failed event received",
          failedReason,
          prev,
        });

        // Get the job from BullMQ to check retry status
        // We need to check if this is the final failure
        const job = await prisma.job.findUnique({
          where: { bullmqId: jobId },
          select: {
            id: true,
            attemptsMade: true,
            status: true,
          },
        });

        if (!job) {
          jobLog.warn("Job not found in database for failed update");
          return;
        }

        // For now, we update attemptsMade and error details
        // The final status (FAILED) is set when retries are exhausted
        // This is handled by checking the job's final state
        await prisma.job.update({
          where: { bullmqId: jobId },
          data: {
            attemptsMade: { increment: 1 },
            error: {
              message: failedReason,
              timestamp: new Date().toISOString(),
            },
            // Only mark as FAILED if we've exhausted retries
            // For now, we keep it as QUEUED since BullMQ will retry
          },
        });

        jobLog.info({
          msg: "Job failure recorded in database",
          attemptsMade: job.attemptsMade + 1,
        });

        // Trigger webhook notification for final failures
        // Only send if this appears to be the final attempt (3 attempts for exports)
        const isFinalFailure = job.attemptsMade + 1 >= 3;

        if (isFinalFailure) {
          try {
            const jobWithCustomer = await prisma.job.findUnique({
              where: { bullmqId: jobId },
              include: { customer: true },
            });

            // Trigger email notification for failure
            if (
              jobWithCustomer?.customer?.emailNotifications &&
              jobWithCustomer?.customer?.email
            ) {
              try {
                await emailQueue.add("send-email", {
                  type: "export_failed",
                  to: jobWithCustomer.customer.email,
                  customerId: jobWithCustomer.customerId,
                  payload: {
                    error: failedReason,
                    jobId: jobWithCustomer.id,
                  },
                });
                jobLog.info("Email failure notification queued");
              } catch (error) {
                jobLog.error({
                  msg: "Failed to queue email failure notification",
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }

            if (
              jobWithCustomer?.customer?.webhookUrl &&
              jobWithCustomer?.customer?.webhookActive
            ) {
              const failedAt = new Date().toISOString();
              const payload = {
                jobId: jobWithCustomer.id,
                status: "FAILED" as const,
                error: failedReason,
                failedAt,
              };

              // Create delivery record for tracking
              const deliveryId = await createWebhookDelivery({
                jobId: jobWithCustomer.id,
                customerId: jobWithCustomer.customerId,
                event: "export.failed",
                payload,
              });

              // Enqueue webhook delivery job
              await webhookQueue.add(
                "deliver",
                {
                  url: jobWithCustomer.customer.webhookUrl,
                  event: "export.failed",
                  jobId: jobWithCustomer.id,
                  customerId: jobWithCustomer.customerId,
                  payload,
                  deliveryId,
                },
                {
                  jobId: `webhook-${deliveryId}`,
                }
              );

              jobLog.info({
                msg: "Webhook queued for failed job",
                dbJobId: jobWithCustomer.id,
                deliveryId,
                customerId: jobWithCustomer.customerId,
                event: "export.failed",
              });
            }
          } catch (webhookError) {
            // Webhook failures should not affect job failure recording
            jobLog.warn({
              msg: "Failed to queue webhook for failed job",
              error: webhookError instanceof Error ? webhookError.message : String(webhookError),
            });
          }
        }
      } catch (error) {
        logger.error({
          msg: "Failed to update job as failed",
          jobId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  /**
   * Handle job progress event.
   *
   * Updates the progress field in the database for real-time
   * status polling by clients.
   */
  queueEvents.on(
    "progress",
    async ({
      jobId,
      data,
    }: {
      jobId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any;
    }) => {
      try {
        // Progress can be either a number or an object with progress property
        const progressValue =
          typeof data === "number" ? data : data?.progress ?? 0;

        // Only log at 25%, 50%, 75%, 100% to reduce noise
        if (progressValue % 25 === 0) {
          logger.info({ msg: "Job progress", jobId, progress: progressValue });
        }

        await prisma.job.update({
          where: { bullmqId: jobId },
          data: {
            progress: progressValue,
          },
        });
      } catch (error) {
        // Progress updates are non-critical, just log the error
        logger.warn({
          msg: "Failed to update progress",
          jobId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // QueueEvents error handler
  queueEvents.on("error", (error: Error) => {
    logger.error({ err: error, msg: "Queue events error" });
  });

  logger.info("Queue events setup complete");

  // Return cleanup function for graceful shutdown
  return async () => {
    logger.info("Cleaning up queue events");
    await queueEvents?.close();
    queueEvents = null;
    logger.info("Queue events cleanup complete");
  };
}

/**
 * Get the current queue events instance (if set up).
 *
 * @returns QueueEvents instance or null
 */
export function getQueueEvents(): QueueEvents | null {
  return queueEvents;
}

export default setupQueueEvents;
