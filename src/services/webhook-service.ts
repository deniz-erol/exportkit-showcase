/**
 * Webhook delivery service.
 *
 * Handles webhook delivery with circuit breaker pattern, retry logic,
 * and comprehensive delivery tracking. Integrates with BullMQ for
 * reliable queue-based delivery.
 *
 * Features:
 * - Circuit breaker: Pauses delivery after 10 consecutive failures
 * - HMAC-SHA256 signature verification
 * - 30-second timeout with AbortController
 * - Delivery tracking via WebhookDelivery records
 * - Automatic retry on server errors (5xx, 429)
 * - Non-retryable errors on client errors (4xx except 429)
 */

import { prisma } from "../db/client.js";
import { signPayload } from "../lib/webhooks/signer.js";
import { WebhookDeliveryStatus } from "@prisma/client";
import type { WebhookJobData } from "../queue/queues.js";
import pinoLogger from "../lib/logger.js";

/**
 * Logger for webhook operations.
 */
const logger = pinoLogger.child({ component: "webhook" });

/**
 * Circuit breaker configuration.
 */
const CIRCUIT_BREAKER_THRESHOLD = 10;
const CIRCUIT_BREAKER_RESET_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Webhook delivery timeout in milliseconds.
 */
const WEBHOOK_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Error class for non-retryable webhook errors.
 * These errors will not trigger a retry in BullMQ.
 */
export class NonRetryableWebhookError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "NonRetryableWebhookError";
  }
}

/**
 * Error class for retryable webhook errors.
 * These errors will trigger a retry in BullMQ.
 */
export class RetryableWebhookError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "RetryableWebhookError";
  }
}

/**
 * Result of a webhook delivery attempt.
 */
export interface DeliveryResult {
  delivered: boolean;
  status?: number;
  error?: string;
}

/**
 * Create a new webhook delivery record.
 *
 * Creates a WebhookDelivery record in PENDING status before
 * enqueueing the delivery job. This provides an audit trail
 * and allows tracking delivery status.
 *
 * @param params - Delivery record parameters
 * @returns The created delivery record ID
 */
export async function createWebhookDelivery({
  jobId,
  customerId,
  event,
  payload,
}: {
  jobId: string;
  customerId: string;
  event: "export.completed" | "export.failed";
  payload: WebhookJobData["payload"];
}): Promise<string> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Check if the circuit breaker is open for a customer.
 *
 * The circuit breaker opens after 10 consecutive failures and
 * remains open for 30 minutes. This prevents hammering failing
 * endpoints and gives them time to recover.
 *
 * @param customerId - The customer ID to check
 * @returns true if circuit is open (delivery should be paused)
 */
async function isCircuitOpen(customerId: string): Promise<boolean> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      webhookFailCount: true,
      webhookLastSuccess: true,
    },
  });

  if (!customer) {
    logger.warn({ msg: "Customer not found for circuit check", customerId });
    return true; // Treat as open to prevent errors
  }

  // Check if we've hit the failure threshold
  if (customer.webhookFailCount >= CIRCUIT_BREAKER_THRESHOLD) {
    const lastSuccess = customer.webhookLastSuccess?.getTime() || 0;
    const timeSinceSuccess = Date.now() - lastSuccess;

    if (timeSinceSuccess < CIRCUIT_BREAKER_RESET_MS) {
      logger.warn({
        msg: "Circuit breaker open",
        customerId,
        failCount: customer.webhookFailCount,
        lastSuccess: customer.webhookLastSuccess,
        timeSinceSuccess,
      });
      return true; // Circuit is open
    }

    // Reset circuit after cooldown period
    logger.info({ msg: "Resetting circuit breaker", customerId });
    await prisma.customer.update({
      where: { id: customerId },
      data: { webhookFailCount: 0 },
    });
  }

  return false; // Circuit is closed
}

/**
 * Record a successful webhook delivery.
 *
 * Updates the WebhookDelivery record and resets the customer's
 * failure counter.
 *
 * @param deliveryId - The webhook delivery record ID
 * @param customerId - The customer ID
 * @param httpStatus - The HTTP status code from the response
 */
async function recordSuccess(
  deliveryId: string,
  customerId: string,
  httpStatus: number
): Promise<void> {
  await Promise.all([
    // Update delivery record
    prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: WebhookDeliveryStatus.DELIVERED,
        httpStatus,
        deliveredAt: new Date(),
        attempts: { increment: 1 },
      },
    }),

    // Reset customer failure counter
    prisma.customer.update({
      where: { id: customerId },
      data: {
        webhookFailCount: 0,
        webhookLastSuccess: new Date(),
      },
    }),
  ]);

  logger.info({
    msg: "Webhook delivery successful",
    deliveryId,
    customerId,
    httpStatus,
  });
}

/**
 * Record a failed webhook delivery.
 *
 * Updates the WebhookDelivery record and increments the customer's
 * failure counter for circuit breaker tracking.
 *
 * @param deliveryId - The webhook delivery record ID
 * @param customerId - The customer ID
 * @param httpStatus - The HTTP status code (if available)
 * @param errorMessage - The error message
 */
async function recordFailure(
  deliveryId: string,
  customerId: string,
  httpStatus: number | null,
  errorMessage: string
): Promise<void> {
  await Promise.all([
    // Update delivery record
    prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        httpStatus: httpStatus ?? undefined,
        errorMessage,
        attempts: { increment: 1 },
      },
    }),

    // Increment customer failure counter
    prisma.customer.update({
      where: { id: customerId },
      data: {
        webhookFailCount: { increment: 1 },
      },
    }),
  ]);

  logger.error({
    msg: "Webhook delivery failed",
    deliveryId,
    customerId,
    httpStatus,
    error: errorMessage,
  });
}

/**
 * Deliver a webhook notification.
 *
 * This is the main webhook delivery function called by the worker.
 * It handles:
 * - Circuit breaker checking
 * - HMAC signature generation
 * - HTTP POST with timeout
 * - Response handling and retry logic
 * - Delivery tracking
 *
 * @param jobData - The webhook job data from the queue
 * @returns DeliveryResult indicating success or failure
 * @throws NonRetryableWebhookError for client errors (4xx except 429)
 * @throws RetryableWebhookError for server errors (5xx, 429) and network errors
 */
export async function deliverWebhook(
  jobData: WebhookJobData
): Promise<DeliveryResult> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Get webhook delivery status for a job.
 *
 * @param jobId - The job ID
 * @returns Array of delivery records for the job
 */
export async function getWebhookDeliveries(jobId: string) {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Retry a failed webhook delivery.
 *
 * Creates a new delivery job for a failed webhook.
 *
 * @param deliveryId - The failed delivery record ID
 * @returns true if retry was initiated, false otherwise
 */
export async function retryWebhookDelivery(
  deliveryId: string
): Promise<boolean> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}
