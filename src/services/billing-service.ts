import Stripe from "stripe";
import { prisma } from "../db/client.js";
import { PlanTier } from "@prisma/client";
import { auditService } from "./audit-service.js";
import logger from "../lib/logger.js";

/**
 * Stripe client instance.
 * Initialized lazily to allow env vars to load.
 */
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY environment variable is required");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/**
 * Map plan tiers to Stripe Price IDs (configured via env vars).
 */
function getStripePriceId(tier: PlanTier): string | null {
  const map: Record<string, string | undefined> = {
    FREE: undefined,
    PRO: process.env.STRIPE_PRO_PRICE_ID,
    SCALE: process.env.STRIPE_SCALE_PRICE_ID,
  };
  return map[tier] ?? null;
}

/**
 * Create a Stripe Checkout session for upgrading to a paid plan.
 * Returns the checkout URL.
 */
export async function createCheckoutSession(
  customerId: string,
  planTier: PlanTier
): Promise<string> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Create a Stripe Customer Portal session for managing billing.
 * Returns the portal URL.
 */
export async function createPortalSession(customerId: string): Promise<string> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}


/**
 * Handle Stripe webhook events for subscription lifecycle.
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Handle successful checkout — create or update subscription.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const customerId = session.metadata?.exportkitCustomerId;
  const planTier = session.metadata?.planTier as PlanTier | undefined;

  if (!customerId || !planTier) {
    logger.error({ sessionId: session.id, msg: "Checkout session missing metadata" });
    return;
  }

  const plan = await prisma.plan.findUnique({ where: { tier: planTier } });
  if (!plan) {
    logger.error({ planTier, msg: "Plan not found for tier" });
    return;
  }

  const stripeSubscriptionId = session.subscription as string;
  const stripeCustomerId = session.customer as string;

  // Calculate billing period from now (Stripe v20 removed current_period fields)
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.subscription.upsert({
    where: { customerId },
    update: {
      planId: plan.id,
      stripeCustomerId,
      stripeSubscriptionId,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    create: {
      customerId,
      planId: plan.id,
      stripeCustomerId,
      stripeSubscriptionId,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  // Audit log: plan change via checkout (fire-and-forget)
  auditService
    .log({
      customerId,
      actorId: customerId,
      action: "plan.change",
      targetType: "subscription",
      targetId: customerId,
      metadata: { newPlan: planTier, stripeSessionId: session.id },
      ipAddress: "stripe-webhook",
    })
    .catch((err: unknown) => {
      logger.error({ err, msg: "Failed to log plan.change audit event" });
    });
}

/**
 * Handle subscription updates (plan changes, renewals).
 */
async function handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: sub.id },
  });

  if (!subscription) return;

  // Derive period from start_date and billing_cycle_anchor
  const periodStart = new Date(sub.start_date * 1000);
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : sub.status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}

/**
 * Handle subscription deletion — downgrade to Free plan.
 */
async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: sub.id },
  });

  if (!subscription) return;

  const freePlan = await prisma.plan.findUnique({ where: { tier: PlanTier.FREE } });
  if (!freePlan) {
    logger.error("Free plan not found in database");
    return;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      planId: freePlan.id,
      status: "canceled",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
    },
  });

  // Audit log: plan downgrade to Free (fire-and-forget)
  auditService
    .log({
      customerId: subscription.customerId,
      actorId: subscription.customerId,
      action: "plan.change",
      targetType: "subscription",
      targetId: subscription.customerId,
      metadata: { newPlan: "FREE", reason: "subscription_deleted", stripeSubscriptionId: sub.id },
      ipAddress: "stripe-webhook",
    })
    .catch((err: unknown) => {
      logger.error({ err, msg: "Failed to log plan.change audit event" });
    });
}

/**
 * Report overage usage to Stripe for metered billing.
 * Calculates overages in 1000-row increments, rounding up.
 * Uses Stripe Billing Meter Events API (v2/v20+).
 */
export async function reportOverageToStripe(customerId: string): Promise<void> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Calculate overage for a given row count and plan limit.
 * Exported for testing.
 */
export function calculateOverage(
  totalRows: number,
  planLimit: number,
  overagePer1000Cents: number
): {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
} {
  const overageRows = Math.max(0, totalRows - planLimit);
  const overageIncrements = overageRows > 0 ? Math.ceil(overageRows / 1000) : 0;
  const overageChargeCents = overageIncrements * overagePer1000Cents;
  return { overageRows, overageIncrements, overageChargeCents };
}

/**
 * Construct the raw body needed for Stripe webhook signature verification.
 */
export function constructStripeEvent(
  rawBody: Buffer,
  signature: string
): Stripe.Event {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

export const billingService = {
  createCheckoutSession,
  createPortalSession,
  handleStripeWebhook,
  reportOverageToStripe,
  calculateOverage,
  constructStripeEvent,
};

export default billingService;
