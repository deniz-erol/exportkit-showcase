import { prisma } from "../db/client.js";
import { emailQueue } from "../queue/notification.js";
import logger from "../lib/logger.js";

/**
 * Get the current billing period string in "YYYY-MM" format.
 */
export function getCurrentBillingPeriod(): string {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Record usage for a completed export job.
 * Uses the unique jobId constraint for idempotency — duplicate calls are silently ignored.
 */
export async function recordJobUsage(
  customerId: string,
  jobId: string,
  rowCount: number
): Promise<void> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Get total row count for a customer in the current billing period.
 */
export async function getMonthlyUsage(customerId: string): Promise<number> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Check whether a customer is allowed to create new exports based on their plan cap.
 * Free plan customers are hard-capped at 100%.
 */
export async function checkUsageCap(
  customerId: string
): Promise<{
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}> {
  const subscription = await prisma.subscription.findUnique({
    where: { customerId },
    include: { plan: true },
  });

  // No subscription = treat as free with default limits
  if (!subscription) {
    const usage = await getMonthlyUsage(customerId);
    const defaultFreeLimit = 10_000;
    const percentUsed = defaultFreeLimit > 0 ? (usage / defaultFreeLimit) * 100 : 0;
    return { allowed: usage < defaultFreeLimit, percentUsed };
  }

  const usage = await getMonthlyUsage(customerId);
  const limit = subscription.plan.monthlyRowLimit;
  const percentUsed = limit > 0 ? (usage / limit) * 100 : 0;

  // Free plan: hard cap at 100%
  if (subscription.plan.tier === "FREE") {
    return { allowed: usage < limit, percentUsed };
  }

  // Paid plans: allow overage (billed separately)
  return { allowed: true, percentUsed };
}

/**
 * Get full usage summary for a customer including overage info.
 */
export async function getUsageSummary(customerId: string) {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Check usage thresholds and send alerts if needed.
 * Uses UsageAlert unique constraint to ensure each alert is sent at most once per period.
 */
async function checkAndSendAlerts(customerId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { customerId },
    include: { plan: true },
  });

  if (!subscription) return;

  const billingPeriod = getCurrentBillingPeriod();
  const totalRows = await getMonthlyUsage(customerId);
  const limit = subscription.plan.monthlyRowLimit;
  if (limit <= 0) return;

  const percentUsed = (totalRows / limit) * 100;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, emailNotifications: true },
  });

  if (!customer?.emailNotifications) return;

  const thresholds = [80, 100].filter((t) => percentUsed >= t);

  for (const threshold of thresholds) {
    try {
      await prisma.usageAlert.create({
        data: { customerId, billingPeriod, threshold },
      });

      // Alert created (not a duplicate) — send email
      await emailQueue.add("send-email", {
        type: "usage_alert" as any,
        to: customer.email,
        customerId,
        payload: {
          threshold,
          totalRows,
          limit,
          percentUsed: Math.round(percentUsed),
          planName: subscription.plan.name,
          billingPeriod,
        },
      });
    } catch (error: unknown) {
      // P2002 = unique constraint — alert already sent for this threshold/period
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        continue;
      }
      // Log but don't throw — alerts are non-critical
      logger.error({ err: error, customerId, msg: "Failed to send usage alert" });
    }
  }
}

export const usageService = {
  recordJobUsage,
  getMonthlyUsage,
  checkUsageCap,
  getUsageSummary,
  getCurrentBillingPeriod,
};

export default usageService;
