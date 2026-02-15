import { Redis } from "ioredis";

/**
 * Redis connection for BullMQ queues and workers.
 *
 * BullMQ uses Redis as both a message broker and state store for jobs.
 * This connection is shared across queues, workers, and queue events.
 *
 * Connection settings:
 * - maxRetriesPerRequest: null (required by BullMQ for proper operation)
 * - enableReadyCheck: false (required by BullMQ)
 *
 * Why IORedis?
 * - BullMQ requires IORedis specifically for its Redis operations
 * - Supports Redis Cluster, Sentinel, and standalone configurations
 */

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Redis connection instance for BullMQ.
 * Shared across all queues and workers for connection pooling efficiency.
 */
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/**
 * Redis connection options for BullMQ Queue/Worker constructors.
 * BullMQ expects a connection object with specific settings.
 */
export const redisConnectionOptions = {
  host: new URL(redisUrl).hostname,
  port: parseInt(new URL(redisUrl).port || "6379", 10),
  password: new URL(redisUrl).password || undefined,
  username: new URL(redisUrl).username || undefined,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

export default redis;
