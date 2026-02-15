/**
 * Schedule worker — checks for due export schedules and creates export jobs.
 *
 * Runs as a BullMQ repeatable job every 60 seconds. For each schedule where
 * `isActive=true` and `nextRunAt <= now`, it creates an export job via the
 * export queue and updates the schedule's `lastRunAt` and `nextRunAt`.
 *
 * Failures for individual schedules are logged but do not block other
 * schedules from running. The next scheduled run proceeds as normal.
 */

import { Queue, Worker } from "bullmq";
import { redisConnectionOptions } from "../connection.js";
import { exportQueue } from "../queues.js";
import type { ExportJobData } from "../queues.js";
import { getDueSchedules, markScheduleRun } from "../../services/schedule-service.js";
import { prisma } from "../../db/client.js";
import { getPriorityForPlan, DEFAULT_PRIORITY } from "../../lib/priority.js";
import pinoLogger from "../../lib/logger.js";

const logger = pinoLogger.child({ component: "schedule-worker" });

/** Queue name for the schedule checker. */
const SCHEDULE_QUEUE_NAME = "schedule-check";

/** How often to check for due schedules (in milliseconds). */
const CHECK_INTERVAL_MS = 60_000; // 1 minute

/**
 * Queue for the schedule checker repeatable job.
 */
export const scheduleQueue = new Queue(SCHEDULE_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  },
});

/**
 * Process a single due schedule: create an export job and update the schedule.
 *
 * @param schedule - The due ExportSchedule record
 */
async function processSchedule(
  schedule: Awaited<ReturnType<typeof getDueSchedules>>[number]
): Promise<void> {
  const scheduleLog = logger.child({
    scheduleId: schedule.id,
    customerId: schedule.customerId,
  });

  try {
    // Look up customer's plan tier for priority assignment
    const subscription = await prisma.subscription.findUnique({
      where: { customerId: schedule.customerId },
      include: { plan: true },
    });

    const priority = subscription?.plan
      ? getPriorityForPlan(subscription.plan.tier)
      : DEFAULT_PRIORITY;

    const jobData: ExportJobData = {
      customerId: schedule.customerId,
      type: schedule.exportType as "csv" | "json" | "xlsx",
      payload: (schedule.payload as Record<string, unknown>) ?? {},
    };

    // Add export job to the queue
    const bullmqJob = await exportQueue.add(
      `scheduled-${schedule.exportType}`,
      jobData,
      { priority }
    );

    // Create a database record for the job
    await prisma.job.create({
      data: {
        bullmqId: bullmqJob.id!,
        customerId: schedule.customerId,
        type: schedule.exportType,
        payload: jobData.payload,
        status: "QUEUED",
        progress: 0,
        attemptsMade: 0,
      },
    });

    // Update schedule timestamps
    await markScheduleRun(schedule.id);

    scheduleLog.info({
      msg: "Scheduled export job created",
      bullmqJobId: bullmqJob.id,
      exportType: schedule.exportType,
      scheduleName: schedule.name,
    });
  } catch (error) {
    // Log failure but don't rethrow — other schedules should still run
    scheduleLog.error({
      err: error,
      msg: "Failed to process scheduled export",
      scheduleName: schedule.name,
    });
  }
}

/**
 * Schedule worker instance.
 *
 * Processes the repeatable "check-due-schedules" job by querying for
 * all active schedules with nextRunAt <= now and creating export jobs.
 */
export const scheduleWorker = new Worker(
  SCHEDULE_QUEUE_NAME,
  async () => {
    const dueSchedules = await getDueSchedules();

    if (dueSchedules.length === 0) {
      return;
    }

    logger.info({
      msg: "Processing due schedules",
      count: dueSchedules.length,
    });

    for (const schedule of dueSchedules) {
      await processSchedule(schedule);
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: 1, // Only one check at a time
  }
);

scheduleWorker.on("error", (err) => {
  logger.error({ err, msg: "Schedule worker error" });
});

scheduleWorker.on("ready", () => {
  logger.info("Schedule worker is ready");
});

/**
 * Start the schedule checker by adding a repeatable job.
 *
 * Adds a repeatable job that fires every 60 seconds. BullMQ handles
 * deduplication — calling this multiple times won't create duplicate jobs.
 */
export async function startScheduleChecker(): Promise<void> {
  await scheduleQueue.add(
    "check-due-schedules",
    {},
    {
      repeat: { every: CHECK_INTERVAL_MS },
      jobId: "schedule-checker", // Stable ID prevents duplicates
    }
  );
  logger.info(`Schedule checker started (interval: ${CHECK_INTERVAL_MS}ms)`);
}

/**
 * Stop the schedule worker and close the queue.
 */
export async function stopScheduleWorker(): Promise<void> {
  await scheduleWorker.close();
  await scheduleQueue.close();
  logger.info("Schedule worker stopped");
}
