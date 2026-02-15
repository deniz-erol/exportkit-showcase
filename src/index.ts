import "dotenv/config";
import { initSentry } from "./lib/sentry.js";

// Initialize Sentry before anything else so it can capture startup errors
initSentry();

import type { Socket } from "node:net";
import { initServer } from "./api/server.js";
import { closeQueues } from "./queue/queues.js";
import { stopWorker } from "./queue/workers.js";
import { createShutdownHandler } from "./lib/graceful-shutdown.js";
import logger from "./lib/logger.js";

/**
 * ExportKit API Server Entry Point
 *
 * This is the main entry point for the ExportKit API server.
 * It initializes the Express app, sets up queue events, and starts
 * the HTTP server with graceful shutdown handling.
 *
 * Environment variables:
 * - PORT: Server port (default: 3000)
 * - NODE_ENV: Environment (development/production)
 * - DATABASE_URL: Neon database connection string
 * - REDIS_URL: Redis connection string
 */

/** Server port from environment or default. */
const PORT = parseInt(process.env.PORT || "3000", 10);

/** Timeout in milliseconds for draining in-flight HTTP requests. */
const SHUTDOWN_TIMEOUT_MS = 30_000;

/** Set of active TCP connections for force-close on timeout. */
const activeConnections = new Set<Socket>();

/**
 * Main application entry point.
 */
async function main(): Promise<void> {
  logger.info({
    msg: "ExportKit API Server starting",
    environment: process.env.NODE_ENV || "development",
    port: PORT,
  });

  // Initialize server (sets up queue events, etc.)
  const { app, cleanup } = await initServer();

  // Start HTTP server
  const server = app.listen(PORT, () => {
    logger.info({
      msg: "Server is running",
      url: `http://localhost:${PORT}`,
      healthCheck: `http://localhost:${PORT}/health`,
    });
  });

  // Track active connections so we can destroy them on force-close
  server.on("connection", (socket: Socket) => {
    activeConnections.add(socket);
    socket.once("close", () => {
      activeConnections.delete(socket);
    });
  });

  // Create the graceful shutdown handler with 30s timeout
  const shutdown = createShutdownHandler({
    processName: "API server",
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
    onForceClose: () => {
      logger.warn({
        msg: "Destroying remaining connections",
        remainingConnections: activeConnections.size,
      });
      for (const socket of activeConnections) {
        socket.destroy();
      }
    },
    cleanup: () =>
      new Promise<void>((resolve, reject) => {
        // Stop accepting new connections and wait for in-flight requests to drain
        server.close(async (err) => {
          if (err) {
            reject(err);
            return;
          }

          logger.info("HTTP server closed — all in-flight requests drained");

          try {
            logger.info("Cleaning up queue events...");
            await cleanup();

            logger.info("Stopping worker...");
            await stopWorker();

            logger.info("Closing queue connections...");
            await closeQueues();

            resolve();
          } catch (cleanupErr) {
            reject(cleanupErr);
          }
        });
      }),
  });

  // Handle shutdown signals
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error, msg: "Uncaught exception" });
    shutdown("uncaughtException").catch(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason, msg: "Unhandled rejection" });
    shutdown("unhandledRejection").catch(() => process.exit(1));
  });
}

// Start the application
main().catch((error) => {
  logger.fatal({ err: error, msg: "Failed to start server" });
  process.exit(1);
});

export default main;
