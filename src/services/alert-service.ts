/**
 * Alert Service Module (OBS-04)
 *
 * Monitors critical system conditions and sends alert notifications
 * when thresholds are exceeded. Runs as a periodic check in the worker process.
 *
 * Monitored conditions:
 * - BullMQ failed job count exceeding 10 in a 5-minute window
 * - BullMQ queue depth exceeding 1000 pending jobs
 * - API error rate exceeding 5% of requests in a 5-minute window
 *
 * Alert channels:
 * - Email via Resend (default)
 * - Webhook to a Slack-compatible endpoint
 *
 * Environment variables:
 * - `ALERT_CHANNEL`: "email" or "webhook" (default: "email")
 * - `ALERT_EMAIL`: Recipient email for email alerts
 * - `ALERT_WEBHOOK_URL`: Slack-compatible webhook URL
 */

import { exportQueue, webhookQueue } from "../queue/queues.js";
import { resend } from "../lib/email.js";
import logger from "../lib/logger.js";
import type { Queue } from "bullmq";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported alert channel types */
export type AlertChannel = "email" | "webhook";

/** Alert severity levels */
export type AlertSeverity = "warning" | "critical";

/** Unique alert condition identifiers */
export type AlertCondition =
  | "FAILED_JOBS_THRESHOLD"
  | "QUEUE_DEPTH_THRESHOLD"
  | "ERROR_RATE_THRESHOLD";

/** A single API request entry for the sliding window */
export interface ApiRequestEntry {
  timestamp: number;
  isError: boolean;
}

/** Alert payload sent via the configured channel */
export interface AlertPayload {
  condition: AlertCondition;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Thresholds for alert conditions */
export const ALERT_THRESHOLDS = {
  /** Max failed jobs in the sliding window before alerting */
  FAILED_JOBS_MAX: 10,
  /** Max pending (waiting) jobs before alerting */
  QUEUE_DEPTH_MAX: 1000,
  /** Max error rate percentage before alerting */
  ERROR_RATE_PERCENT: 5,
  /** Sliding window duration in milliseconds (5 minutes) */
  WINDOW_MS: 5 * 60 * 1000,
  /** Cooldown period to prevent re-alerting the same condition (15 minutes) */
  COOLDOWN_MS: 15 * 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/** Sliding window of API request entries for error rate tracking */
let apiRequestWindow: ApiRequestEntry[] = [];

/** Timestamps of the last alert sent per condition (for cooldown) */
const lastAlertTimes: Map<AlertCondition, number> = new Map();

/** Handle for the periodic alert monitor interval */
let monitorInterval: ReturnType<typeof setInterval> | null = null;

/** Sliding window of failed job timestamps for BullMQ failed job tracking */
let failedJobTimestamps: number[] = [];

// ---------------------------------------------------------------------------
// API Error Rate Tracking
// ---------------------------------------------------------------------------

/**
 * Records an API request for error rate tracking.
 *
 * Called from Express middleware on every response to build
 * a sliding window of request outcomes.
 *
 * @param statusCode - HTTP status code of the response
 */
export function recordApiRequest(statusCode: number): void {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Prunes entries older than the sliding window from the API request window.
 */
function pruneApiRequestWindow(): void {
  const cutoff = Date.now() - ALERT_THRESHOLDS.WINDOW_MS;
  apiRequestWindow = apiRequestWindow.filter((e) => e.timestamp >= cutoff);
}

/**
 * Calculates the current API error rate as a percentage.
 *
 * @returns Error rate percentage (0–100), or 0 if no requests recorded
 */
export function getErrorRate(): number {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

// ---------------------------------------------------------------------------
// Failed Job Tracking
// ---------------------------------------------------------------------------

/**
 * Records a failed job timestamp for the sliding window counter.
 *
 * Called from BullMQ event listeners when a job fails.
 */
export function recordFailedJob(): void {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Prunes failed job timestamps older than the sliding window.
 */
function pruneFailedJobTimestamps(): void {
  const cutoff = Date.now() - ALERT_THRESHOLDS.WINDOW_MS;
  failedJobTimestamps = failedJobTimestamps.filter((t) => t >= cutoff);
}

/**
 * Returns the number of failed jobs within the current sliding window.
 *
 * @returns Count of failed jobs in the last 5 minutes
 */
export function getRecentFailedJobCount(): number {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

// ---------------------------------------------------------------------------
// Cooldown Logic
// ---------------------------------------------------------------------------

/**
 * Checks whether an alert for the given condition is within cooldown.
 *
 * @param condition - The alert condition to check
 * @returns true if the condition is still in cooldown
 */
function isInCooldown(condition: AlertCondition): boolean {
  const lastTime = lastAlertTimes.get(condition);
  if (!lastTime) return false;
  return Date.now() - lastTime < ALERT_THRESHOLDS.COOLDOWN_MS;
}

/**
 * Marks the given condition as having just been alerted.
 *
 * @param condition - The alert condition to mark
 */
function markAlerted(condition: AlertCondition): void {
  lastAlertTimes.set(condition, Date.now());
}

// ---------------------------------------------------------------------------
// Alert Sending
// ---------------------------------------------------------------------------

/**
 * Sends an alert via the configured channel (email or webhook).
 *
 * @param payload - The alert payload to send
 */
export async function sendAlert(payload: AlertPayload): Promise<void> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Sends an alert email via Resend.
 *
 * @param payload - The alert payload
 */
async function sendEmailAlert(payload: AlertPayload): Promise<void> {
  const to = process.env.ALERT_EMAIL;
  if (!to) {
    logger.warn({ msg: "ALERT_EMAIL not configured, skipping email alert", condition: payload.condition });
    return;
  }

  try {
    await resend.emails.send({
      from: "ExportKit Alerts <alerts@exportkit.com>",
      to,
      subject: `[${payload.severity.toUpperCase()}] ExportKit Alert: ${payload.condition}`,
      text: formatAlertText(payload),
    });
    logger.info({ msg: "Alert email sent", condition: payload.condition, to });
  } catch (err) {
    logger.error({ err, msg: "Failed to send alert email", condition: payload.condition });
  }
}

/**
 * Sends an alert to a Slack-compatible webhook endpoint.
 *
 * @param payload - The alert payload
 */
async function sendWebhookAlert(payload: AlertPayload): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    logger.warn({ msg: "ALERT_WEBHOOK_URL not configured, skipping webhook alert", condition: payload.condition });
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: formatAlertText(payload),
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*[${payload.severity.toUpperCase()}] ${payload.condition}*\n${payload.message}`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: Object.entries(payload.details)
                  .map(([k, v]) => `*${k}:* ${v}`)
                  .join(" | "),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      logger.error({
        msg: "Webhook alert returned non-OK status",
        condition: payload.condition,
        status: response.status,
      });
    } else {
      logger.info({ msg: "Webhook alert sent", condition: payload.condition });
    }
  } catch (err) {
    logger.error({ err, msg: "Failed to send webhook alert", condition: payload.condition });
  }
}

/**
 * Formats an alert payload into a plain-text message.
 *
 * @param payload - The alert payload
 * @returns Formatted text string
 */
function formatAlertText(payload: AlertPayload): string {
  const detailLines = Object.entries(payload.details)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  return `[${payload.severity.toUpperCase()}] ${payload.condition}\n\n${payload.message}\n\nDetails:\n${detailLines}\n\nTimestamp: ${payload.timestamp}`;
}

// ---------------------------------------------------------------------------
// Queue Monitoring Checks
// ---------------------------------------------------------------------------

/**
 * Gets the total pending (waiting) job count across all queues.
 *
 * @param queues - Array of BullMQ Queue instances to check
 * @returns Total waiting job count
 */
export async function getTotalQueueDepth(queues: Queue[]): Promise<number> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

// ---------------------------------------------------------------------------
// Main Alert Check
// ---------------------------------------------------------------------------

/**
 * Checks all alert conditions and sends notifications for any that are triggered.
 *
 * This is the main function called periodically by the alert monitor.
 * It checks:
 * 1. Failed job count in the sliding window (>10 in 5 min)
 * 2. Queue depth across all queues (>1000 pending)
 * 3. API error rate (>5% in 5 min)
 *
 * Each condition has a 15-minute cooldown to prevent alert spam.
 */
export async function checkAlerts(): Promise<void> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

// ---------------------------------------------------------------------------
// Monitor Lifecycle
// ---------------------------------------------------------------------------

/**
 * Starts the periodic alert monitor.
 *
 * Runs `checkAlerts()` at the specified interval (default: 60 seconds).
 * Safe to call multiple times — subsequent calls are no-ops if already running.
 *
 * @param intervalMs - Check interval in milliseconds (default: 60000)
 */
export function startAlertMonitor(intervalMs: number = 60_000): void {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Stops the periodic alert monitor.
 */
export function stopAlertMonitor(): void {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Resets all in-memory state. Used for testing only.
 */
export function _resetState(): void {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}
