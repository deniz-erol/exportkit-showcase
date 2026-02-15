/**
 * Priority mapping for BullMQ job queues based on plan tier.
 *
 * BullMQ uses numeric priorities where LOWER numbers = HIGHER priority.
 * This module maps PlanTier enum values to BullMQ priority numbers so
 * paid customers get their exports processed before free-tier customers.
 *
 * Priority values:
 * - Scale (highest): 1
 * - Pro (medium): 5
 * - Free (lowest): 10
 */

import type { PlanTier } from "@prisma/client";

/** BullMQ priority values per plan tier (lower = higher priority). */
export const PLAN_PRIORITY_MAP: Record<PlanTier, number> = {
  SCALE: 1,
  PRO: 5,
  FREE: 10,
} as const;

/** Default priority used when no subscription is found. */
export const DEFAULT_PRIORITY = PLAN_PRIORITY_MAP.FREE;

/**
 * Get the BullMQ job priority for a given plan tier.
 *
 * @param tier - The customer's plan tier
 * @returns Numeric priority for BullMQ (lower = higher priority)
 */
export function getPriorityForPlan(tier: PlanTier): number {
  return PLAN_PRIORITY_MAP[tier] ?? DEFAULT_PRIORITY;
}
