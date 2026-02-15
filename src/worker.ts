import dotenv from "dotenv";

// Load environment variables before anything else
dotenv.config();

import { initSentry } from "./lib/sentry.js";

// Initialize Sentry before workers start so it can capture startup errors
initSentry();

import { startWorker, stopWorker } from "./queue/workers.js";
import { setupQueueEvents } from "./queue/events.js";
import { closeQueues } from "./queue/queues.js";
import { startAlertMonitor, stopAlertMonitor } from "./services/alert-service.js";
import { createShutdownHandler } from "./lib/graceful-shutdown.js";
import logger from "./lib/logger.js";

/** Timeout in milliseconds for waiting on current jobs to finish. */
const SHUTDOWN_TIMEOUT_MS = 60_000;

logger.info("Starting background workers...");

try {
  startWorker();
  const cleanupEvents = setupQueueEvents();

  // Start periodic alert monitoring (OBS-04)
  startAlertMonitor();

  // Create the graceful shutdown handler with 60s timeout
  const shutdown = createShutdownHandler({
    processName: "Worker",
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
    cleanup: async () => {
      // Stop alert monitor first (lightweight, synchronous)
      stopAlertMonitor();

      // Stop all workers — BullMQ worker.close() waits for current jobs to finish
      logger.info("Stopping workers...");
      await stopWorker();

      // Clean up queue event listeners
      logger.info("Cleaning up queue events...");
      await cleanupEvents();

      // Close queue connections
      logger.info("Closing queue connections...");
      await closeQueues();
    },
  });

  // Handle graceful shutdown signals
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  logger.fatal({ err: error, msg: "Failed to start workers" });
  process.exit(1);
}
