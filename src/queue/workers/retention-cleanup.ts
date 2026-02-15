/**
 * Retention cleanup worker — purges expired data according to GDPR retention policies.
 *
 * Runs as a daily BullMQ repeatable job at 3 AM UTC. Each table cleanup runs
 * independently so errors in one don't block others. Purged counts are logged
 * per table.
 *
 * Retention periods:
 * - Revoked API keys: 30 days from `revokedAt` (skips keys with in-progress jobs)
 * - Audit logs: 365 days from `createdAt`
 * - Webhook deliveries: 90 days from `createdAt`
 * - Completed/failed jobs: 90 days from `completedAt` (only if R2 files expired)
 * - Expired sessions: past `expires` timestamp
 * - Removed team members: 30 days from `removedAt`
 */

import { Queue, Worker } from "bullmq";
import { redisConnectionOptions } from "../connection.js";
import prisma from "../../db/client.js";
import pinoLogger from "../../lib/logger.js";

const logger = pinoLogger.child({ component: "retention-cleanup-worker" });

/** Queue name for retention cleanup jobs. */
const RETENTION_QUEUE_NAME = "retention-cleanup";

/** Cron expression: daily at 3 AM UTC. */
const RETENTION_CRON = "0 3 * * *";

/**
 * Result of a retention cleanup run.
 */
export interface RetentionCleanupResult {
  revokedApiKeys: number;
  auditLogs: number;
  webhookDeliveries: number;
  jobMetadata: number;
  expiredSessions: number;
  removedTeamMembers: number;
  errors: string[];
}

/**
 * Purge all expired data according to retention policies.
 *
 * Processes each table independently — errors in one don't block others.
 * Collects errors in the result's `errors` array.
 *
 * @returns RetentionCleanupResult with purged counts and any errors
 */
export async function runRetentionCleanup(): Promise<RetentionCleanupResult> {
  const result: RetentionCleanupResult = {
    revokedApiKeys: 0,
    auditLogs: 0,
    webhookDeliveries: 0,
    jobMetadata: 0,
    expiredSessions: 0,
    removedTeamMembers: 0,
    errors: [],
  };

  const now = new Date();

  // 1. Purge revoked API keys older than 30 days (skip keys with in-progress jobs)
  try {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Find revoked keys older than 30 days that have NO in-progress jobs
    const keysToDelete = await prisma.apiKey.findMany({
      where: {
        isRevoked: true,
        revokedAt: { lt: thirtyDaysAgo },
        jobs: {
          none: {
            status: { in: ["QUEUED", "PROCESSING"] },
          },
        },
      },
      select: { id: true },
    });

    if (keysToDelete.length > 0) {
      const deleted = await prisma.apiKey.deleteMany({
        where: { id: { in: keysToDelete.map((k) => k.id) } },
      });
      result.revokedApiKeys = deleted.count;
    }

    logger.info({ msg: "Purged revoked API keys", count: result.revokedApiKeys });
  } catch (error) {
    const msg = `Failed to purge revoked API keys: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(msg);
    logger.error({ err: error, msg });
  }

  // 2. Purge audit logs older than 365 days
  try {
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const deleted = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: oneYearAgo } },
    });
    result.auditLogs = deleted.count;

    logger.info({ msg: "Purged audit logs", count: result.auditLogs });
  } catch (error) {
    const msg = `Failed to purge audit logs: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(msg);
    logger.error({ err: error, msg });
  }

  // 3. Purge webhook deliveries older than 90 days
  try {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const deleted = await prisma.webhookDelivery.deleteMany({
      where: { createdAt: { lt: ninetyDaysAgo } },
    });
    result.webhookDeliveries = deleted.count;

    logger.info({ msg: "Purged webhook deliveries", count: result.webhookDeliveries });
  } catch (error) {
    const msg = `Failed to purge webhook deliveries: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(msg);
    logger.error({ err: error, msg });
  }

  // 4. Purge completed/failed job metadata older than 90 days (only if R2 files expired)
  try {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const deleted = await prisma.job.deleteMany({
      where: {
        status: { in: ["COMPLETED", "FAILED"] },
        completedAt: { lt: ninetyDaysAgo },
        fileExpiresAt: { lt: now },
      },
    });
    result.jobMetadata = deleted.count;

    logger.info({ msg: "Purged expired job metadata", count: result.jobMetadata });
  } catch (error) {
    const msg = `Failed to purge job metadata: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(msg);
    logger.error({ err: error, msg });
  }

  // 5. Purge expired sessions
  try {
    const deleted = await prisma.session.deleteMany({
      where: { expires: { lt: now } },
    });
    result.expiredSessions = deleted.count;

    logger.info({ msg: "Purged expired sessions", count: result.expiredSessions });
  } catch (error) {
    const msg = `Failed to purge expired sessions: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(msg);
    logger.error({ err: error, msg });
  }

  // 6. Hard-delete team members where removedAt is older than 30 days
  try {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const deleted = await prisma.teamMember.deleteMany({
      where: {
        removedAt: { not: null, lt: thirtyDaysAgo },
      },
    });
    result.removedTeamMembers = deleted.count;

    logger.info({ msg: "Purged removed team members", count: result.removedTeamMembers });
  } catch (error) {
    const msg = `Failed to purge removed team members: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(msg);
    logger.error({ err: error, msg });
  }

  logger.info({
    msg: "Retention cleanup completed",
    ...result,
    errorCount: result.errors.length,
  });

  return result;
}

/**
 * Queue for the retention cleanup repeatable job.
 */
export const retentionQueue = new Queue(RETENTION_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  },
});

/**
 * Retention cleanup worker instance.
 *
 * Processes the daily retention cleanup job. Concurrency is 1 since
 * only one cleanup should run at a time.
 */
export const retentionWorker = new Worker(
  RETENTION_QUEUE_NAME,
  async () => {
    logger.info("Starting retention cleanup job");
    return await runRetentionCleanup();
  },
  {
    connection: redisConnectionOptions,
    concurrency: 1,
  },
);

retentionWorker.on("completed", (job) => {
  logger.info({ msg: "Retention cleanup job completed", jobId: job.id });
});

retentionWorker.on("failed", (job, err) => {
  logger.error({ err, msg: "Retention cleanup job failed", jobId: job?.id });
});

retentionWorker.on("error", (err) => {
  logger.error({ err, msg: "Retention cleanup worker error" });
});

retentionWorker.on("ready", () => {
  logger.info("Retention cleanup worker is ready");
});

/**
 * Start the retention cleanup by adding a repeatable cron job.
 *
 * Schedules the cleanup to run daily at 3 AM UTC. BullMQ handles
 * deduplication — calling this multiple times won't create duplicate jobs.
 */
export async function startRetentionCleanup(): Promise<void> {
  await retentionQueue.add(
    "retention-cleanup",
    {},
    {
      repeat: { pattern: RETENTION_CRON },
      jobId: "retention-cleanup-daily",
    },
  );
  logger.info(`Retention cleanup scheduled (cron: ${RETENTION_CRON})`);
}

/**
 * Stop the retention cleanup worker and close the queue.
 */
export async function stopRetentionCleanup(): Promise<void> {
  await retentionWorker.close();
  await retentionQueue.close();
  logger.info("Retention cleanup worker stopped");
}
