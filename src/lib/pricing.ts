/**
 * Shared pricing configuration — single source of truth for plan tiers.
 * Used by the marketing site, dashboard, and billing service.
 */

/** Feature flags available per plan tier. */
export interface PlanFeatures {
  priorityQueue: boolean;
  customRetention: boolean;
  scheduling: boolean;
  teamManagement: boolean;
  ipAllowlisting: boolean;
}

/** Configuration for a single plan tier. */
export interface PlanConfig {
  /** Internal tier identifier. */
  tier: "free" | "pro" | "scale";
  /** Display name shown to users. */
  name: string;
  /** Monthly row export limit. */
  monthlyRowLimit: number;
  /** Monthly price in cents (0 for free). */
  monthlyPriceCents: number;
  /** Overage cost per 1,000 rows in cents. */
  overagePer1000Cents: number;
  /** Feature flags for this tier. */
  features: PlanFeatures;
  /** Whether this plan is visually highlighted as recommended. */
  recommended: boolean;
}

/**
 * All plan tiers in display order.
 * Keep in sync with `prisma/seed-plans.ts`.
 */
export const pricingPlans: readonly PlanConfig[] = [
  {
    tier: "free",
    name: "Free",
    monthlyRowLimit: 100_000,
    monthlyPriceCents: 0,
    overagePer1000Cents: 0,
    features: {
      priorityQueue: false,
      customRetention: false,
      scheduling: false,
      teamManagement: false,
      ipAllowlisting: false,
    },
    recommended: false,
  },
  {
    tier: "pro",
    name: "Pro",
    monthlyRowLimit: 1_000_000,
    monthlyPriceCents: 4900,
    overagePer1000Cents: 10,
    features: {
      priorityQueue: true,
      customRetention: true,
      scheduling: true,
      teamManagement: false,
      ipAllowlisting: true,
    },
    recommended: true,
  },
  {
    tier: "scale",
    name: "Scale",
    monthlyRowLimit: 10_000_000,
    monthlyPriceCents: 19900,
    overagePer1000Cents: 5,
    features: {
      priorityQueue: true,
      customRetention: true,
      scheduling: true,
      teamManagement: true,
      ipAllowlisting: true,
    },
    recommended: false,
  },
] as const;

/**
 * Format cents as a dollar string (e.g. 4900 → "$49").
 * @param cents - Price in cents
 * @returns Formatted dollar string
 */
export function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

/**
 * Format a row count for display (e.g. 500000 → "500K", 5000000 → "5M").
 * @param rows - Number of rows
 * @returns Human-readable row count string
 */
export function formatRowLimit(rows: number): string {
  if (rows >= 1_000_000) return `${rows / 1_000_000}M`;
  if (rows >= 1_000) return `${rows / 1_000}K`;
  return rows.toString();
}
