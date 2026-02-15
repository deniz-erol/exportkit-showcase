import { Queue } from "bullmq";
import { redisConnectionOptions } from "./connection.js";

/**
 * Email notification job data structure.
 */
export interface EmailJobData {
  /** Email type/template to use */
  type: "welcome" | "export_completed" | "export_failed" | "usage_alert" | "email_verification" | "deletion_confirmation" | "team_invitation" | "sub-processor-change";
  /** Recipient email address */
  to: string;
  /** Data to pass to the email template */
  payload?: Record<string, unknown>;
  /** Customer ID for logging/tracking */
  customerId?: string;
  /** Verification token (for email_verification type) */
  token?: string;
}

/**
 * Email notification queue.
 * Handles sending transactional emails via Resend.
 */
export const notificationQueue = new Queue<EmailJobData>("email-notifications", {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000, // 1s, 2s, 4s
    },
    removeOnComplete: {
      count: 100, // Keep last 100
    },
    removeOnFail: {
      count: 50, // Keep last 50
    },
  },
});

// Legacy export for backwards compatibility
export const emailQueue = notificationQueue;

export default notificationQueue;
