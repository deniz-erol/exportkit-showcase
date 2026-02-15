/**
 * Health Service Module
 *
 * Provides deep health checks for all system dependencies:
 * - Postgres (via Prisma `$queryRaw` with `SELECT 1`)
 * - Redis (via ioredis `PING`)
 * - Cloudflare R2 (via S3 `ListObjectsV2` with maxKeys=1)
 *
 * Each dependency check enforces a 3-second timeout. The overall
 * `checkHealth` call enforces a 5-second total timeout. Results
 * include per-dependency status, latency, and error details.
 *
 * Used by the `/health` endpoint (OBS-03) for load balancer and
 * monitoring system integration.
 */

import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { prisma } from "../db/client.js";
import { redis } from "../queue/connection.js";
import { r2Client } from "../lib/r2/client.js";
import logger from "../lib/logger.js";

/** Timeout per individual dependency check (ms). */
const PER_CHECK_TIMEOUT_MS = 3_000;

/** Timeout for the entire health check (ms). */
const TOTAL_TIMEOUT_MS = 5_000;

/** Status of a single dependency. */
export type DependencyStatus = "healthy" | "unhealthy";

/** Result of a single dependency health check. */
export interface DependencyCheckResult {
  status: DependencyStatus;
  latencyMs: number;
  error?: string;
}

/** Overall health check response. */
export interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  uptime: number;
  timestamp: number;
  version: string;
  dependencies: {
    postgres: DependencyCheckResult;
    redis: DependencyCheckResult;
    r2: DependencyCheckResult;
  };
}

/**
 * Wraps a promise with a timeout. Rejects with a descriptive error
 * if the promise does not settle within `ms` milliseconds.
 *
 * @param promise - The promise to race against the timeout
 * @param ms - Timeout duration in milliseconds
 * @param label - Human-readable label for error messages
 * @returns The resolved value of the original promise
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} health check timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Checks Postgres connectivity by executing `SELECT 1` via Prisma.
 *
 * @returns Dependency check result with status and latency
 */
async function checkPostgres(): Promise<DependencyCheckResult> {
  const start = performance.now();
  try {
    await withTimeout(
      prisma.$queryRaw`SELECT 1`,
      PER_CHECK_TIMEOUT_MS,
      "Postgres",
    );
    return { status: "healthy", latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, msg: "Postgres health check failed" });
    return { status: "unhealthy", latencyMs: Math.round(performance.now() - start), error: message };
  }
}

/**
 * Checks Redis connectivity by sending a PING command.
 *
 * @returns Dependency check result with status and latency
 */
async function checkRedis(): Promise<DependencyCheckResult> {
  const start = performance.now();
  try {
    const result = await withTimeout(
      redis.ping(),
      PER_CHECK_TIMEOUT_MS,
      "Redis",
    );
    if (result !== "PONG") {
      throw new Error(`Unexpected PING response: ${result}`);
    }
    return { status: "healthy", latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, msg: "Redis health check failed" });
    return { status: "unhealthy", latencyMs: Math.round(performance.now() - start), error: message };
  }
}

/**
 * Checks R2 connectivity by listing objects with maxKeys=1.
 *
 * @returns Dependency check result with status and latency
 */
async function checkR2(): Promise<DependencyCheckResult> {
  const start = performance.now();
  try {
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
      throw new Error("R2_BUCKET_NAME environment variable is not set");
    }

    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 1,
    });

    await withTimeout(
      r2Client.send(command),
      PER_CHECK_TIMEOUT_MS,
      "R2",
    );
    return { status: "healthy", latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, msg: "R2 health check failed" });
    return { status: "unhealthy", latencyMs: Math.round(performance.now() - start), error: message };
  }
}

/**
 * Runs deep health checks against all dependencies (Postgres, Redis, R2)
 * in parallel. Each individual check has a 3-second timeout; the overall
 * call has a 5-second total timeout.
 *
 * @returns Health check result with per-dependency status and overall status
 */
export async function checkHealth(): Promise<HealthCheckResult> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}
