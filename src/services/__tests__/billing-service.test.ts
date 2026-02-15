import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Plan, Subscription, PlanTier } from "@prisma/client";

// ── Prisma mock ──────────────────────────────────────────────────────────────
const mockSubscriptionFindUnique = vi.fn();
const mockSubscriptionFindFirst = vi.fn();
const mockSubscriptionUpsert = vi.fn();
const mockSubscriptionUpdate = vi.fn();
const mockPlanFindUnique = vi.fn();
const mockUsageRecordAggregate = vi.fn();
const mockUsageRecordCreate = vi.fn();
const mockCustomerFindUnique = vi.fn();
const mockUsageAlertCreate = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: {
    subscription: {
      findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args),
      findFirst: (...args: unknown[]) => mockSubscriptionFindFirst(...args),
      upsert: (...args: unknown[]) => mockSubscriptionUpsert(...args),
      update: (...args: unknown[]) => mockSubscriptionUpdate(...args),
    },
    plan: {
      findUnique: (...args: unknown[]) => mockPlanFindUnique(...args),
    },
    usageRecord: {
      aggregate: (...args: unknown[]) => mockUsageRecordAggregate(...args),
      create: (...args: unknown[]) => mockUsageRecordCreate(...args),
    },
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
    },
    usageAlert: {
      create: (...args: unknown[]) => mockUsageAlertCreate(...args),
    },
  },
}));

// ── Email queue mock ─────────────────────────────────────────────────────────
vi.mock("../../queue/notification.js", () => ({
  emailQueue: { add: vi.fn() },
}));

// ── Logger mock ──────────────────────────────────────────────────────────────
vi.mock("../../lib/logger.js", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ── Audit service mock ───────────────────────────────────────────────────────
vi.mock("../audit-service.js", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

// ── Dynamic imports (after mocks) ────────────────────────────────────────────
const { calculateOverage } = await import("../billing-service.js");
const {
  recordJobUsage,
  getMonthlyUsage,
  checkUsageCap,
  getUsageSummary,
  getCurrentBillingPeriod,
} = await import("../usage-service.js");

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-free",
    tier: "FREE" as PlanTier,
    name: "Free",
    monthlyRowLimit: 10_000,
    monthlyPriceCents: 0,
    overagePer1000Cents: 0,
    features: {},
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeSubscription(
  overrides: Partial<Subscription> = {},
  planOverrides: Partial<Plan> = {}
): Subscription & { plan: Plan } {
  const plan = makePlan(planOverrides);
  return {
    id: "sub-1",
    customerId: "cust-1",
    planId: plan.id,
    stripeCustomerId: "stripe_cust_1",
    stripeSubscriptionId: "stripe_sub_1",
    status: "active",
    currentPeriodStart: new Date("2025-06-01T00:00:00Z"),
    currentPeriodEnd: new Date("2025-07-01T00:00:00Z"),
    cancelAtPeriodEnd: false,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    plan,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("BillingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no alerts sent (suppress unique constraint errors)
    mockUsageAlertCreate.mockRejectedValue({ code: "P2002" });
    // Default: customer with notifications off (skip alert emails)
    mockCustomerFindUnique.mockResolvedValue({ email: "test@example.com", emailNotifications: false });
  });

  // ── calculateOverage (pure function) ─────────────────────────────────────

  describe("calculateOverage", () => {
    it("returns zero overage when usage is under the plan limit", () => {
      const result = calculateOverage(5_000, 10_000, 500);
      expect(result).toEqual({
        overageRows: 0,
        overageIncrements: 0,
        overageChargeCents: 0,
      });
    });

    it("returns zero overage when usage exactly equals the plan limit", () => {
      const result = calculateOverage(10_000, 10_000, 500);
      expect(result).toEqual({
        overageRows: 0,
        overageIncrements: 0,
        overageChargeCents: 0,
      });
    });

    it("calculates overage in 1000-row increments, rounding up", () => {
      // 10,001 rows over a 10,000 limit = 1 overage row → rounds up to 1 increment
      const result = calculateOverage(10_001, 10_000, 500);
      expect(result).toEqual({
        overageRows: 1,
        overageIncrements: 1,
        overageChargeCents: 500,
      });
    });

    it("rounds up partial increments to the next 1000", () => {
      // 12,500 rows over 10,000 limit = 2,500 overage → 3 increments
      const result = calculateOverage(12_500, 10_000, 200);
      expect(result).toEqual({
        overageRows: 2_500,
        overageIncrements: 3,
        overageChargeCents: 600,
      });
    });

    it("handles exact 1000-row overage boundaries", () => {
      // 13,000 rows over 10,000 limit = 3,000 overage → exactly 3 increments
      const result = calculateOverage(13_000, 10_000, 100);
      expect(result).toEqual({
        overageRows: 3_000,
        overageIncrements: 3,
        overageChargeCents: 300,
      });
    });

    it("handles zero total rows", () => {
      const result = calculateOverage(0, 10_000, 500);
      expect(result).toEqual({
        overageRows: 0,
        overageIncrements: 0,
        overageChargeCents: 0,
      });
    });

    it("handles zero plan limit (all rows are overage)", () => {
      const result = calculateOverage(500, 0, 100);
      expect(result).toEqual({
        overageRows: 500,
        overageIncrements: 1,
        overageChargeCents: 100,
      });
    });
  });

  // ── Usage tracking (usage-service) ───────────────────────────────────────

  describe("recordJobUsage", () => {
    it("creates a usage record with the correct billing period", async () => {
      mockUsageRecordCreate.mockResolvedValue({ id: "ur-1" });
      mockSubscriptionFindUnique.mockResolvedValue(null);

      await recordJobUsage("cust-1", "job-1", 5_000);

      expect(mockUsageRecordCreate).toHaveBeenCalledWith({
        data: {
          customerId: "cust-1",
          jobId: "job-1",
          rowCount: 5_000,
          billingPeriod: getCurrentBillingPeriod(),
        },
      });
    });

    it("silently ignores duplicate job IDs (idempotency via P2002)", async () => {
      mockUsageRecordCreate.mockRejectedValue({ code: "P2002" });

      // Should not throw
      await expect(recordJobUsage("cust-1", "job-1", 5_000)).resolves.toBeUndefined();
    });

    it("propagates non-duplicate database errors", async () => {
      mockUsageRecordCreate.mockRejectedValue(new Error("Connection lost"));

      await expect(recordJobUsage("cust-1", "job-1", 5_000)).rejects.toThrow("Connection lost");
    });
  });

  describe("getMonthlyUsage", () => {
    it("returns the sum of row counts for the current billing period", async () => {
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 7_500 } });

      const usage = await getMonthlyUsage("cust-1");

      expect(usage).toBe(7_500);
      expect(mockUsageRecordAggregate).toHaveBeenCalledWith({
        where: { customerId: "cust-1", billingPeriod: getCurrentBillingPeriod() },
        _sum: { rowCount: true },
      });
    });

    it("returns 0 when no usage records exist", async () => {
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: null } });

      const usage = await getMonthlyUsage("cust-1");

      expect(usage).toBe(0);
    });
  });

  // ── Plan limit enforcement ───────────────────────────────────────────────

  describe("checkUsageCap", () => {
    it("allows usage under the Free plan limit", async () => {
      const sub = makeSubscription({}, { tier: "FREE" as PlanTier, monthlyRowLimit: 10_000 });
      mockSubscriptionFindUnique.mockResolvedValue(sub);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 5_000 } });

      const result = await checkUsageCap("cust-1");

      expect(result.allowed).toBe(true);
      expect(result.percentUsed).toBe(50);
    });

    it("blocks Free plan customers at 100% usage", async () => {
      const sub = makeSubscription({}, { tier: "FREE" as PlanTier, monthlyRowLimit: 10_000 });
      mockSubscriptionFindUnique.mockResolvedValue(sub);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 10_000 } });

      const result = await checkUsageCap("cust-1");

      expect(result.allowed).toBe(false);
      expect(result.percentUsed).toBe(100);
    });

    it("blocks Free plan customers when over the limit", async () => {
      const sub = makeSubscription({}, { tier: "FREE" as PlanTier, monthlyRowLimit: 10_000 });
      mockSubscriptionFindUnique.mockResolvedValue(sub);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 12_000 } });

      const result = await checkUsageCap("cust-1");

      expect(result.allowed).toBe(false);
      expect(result.percentUsed).toBe(120);
    });

    it("allows paid plan customers to exceed their limit (overage billing)", async () => {
      const sub = makeSubscription(
        {},
        { tier: "PRO" as PlanTier, id: "plan-pro", name: "Pro", monthlyRowLimit: 50_000 }
      );
      mockSubscriptionFindUnique.mockResolvedValue(sub);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 60_000 } });

      const result = await checkUsageCap("cust-1");

      expect(result.allowed).toBe(true);
      expect(result.percentUsed).toBe(120);
    });

    it("uses default 10,000 limit when customer has no subscription", async () => {
      mockSubscriptionFindUnique.mockResolvedValue(null);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 9_000 } });

      const result = await checkUsageCap("cust-1");

      expect(result.allowed).toBe(true);
      expect(result.percentUsed).toBe(90);
    });

    it("blocks unsubscribed customers at the default limit", async () => {
      mockSubscriptionFindUnique.mockResolvedValue(null);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 10_000 } });

      const result = await checkUsageCap("cust-1");

      expect(result.allowed).toBe(false);
      expect(result.percentUsed).toBe(100);
    });
  });

  // ── Usage summary with overage info ──────────────────────────────────────

  describe("getUsageSummary", () => {
    it("returns correct summary for a customer under their limit", async () => {
      const sub = makeSubscription(
        {},
        { tier: "PRO" as PlanTier, id: "plan-pro", name: "Pro", monthlyRowLimit: 50_000, overagePer1000Cents: 200 }
      );
      mockSubscriptionFindUnique.mockResolvedValue(sub);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 20_000 } });

      const summary = await getUsageSummary("cust-1");

      expect(summary.plan).toBe("Pro");
      expect(summary.totalRows).toBe(20_000);
      expect(summary.limit).toBe(50_000);
      expect(summary.percentUsed).toBe(40);
      expect(summary.overageRows).toBe(0);
      expect(summary.estimatedOverageChargeCents).toBe(0);
    });

    it("calculates overage rows and charges when over the limit", async () => {
      const sub = makeSubscription(
        {},
        { tier: "PRO" as PlanTier, id: "plan-pro", name: "Pro", monthlyRowLimit: 50_000, overagePer1000Cents: 200 }
      );
      mockSubscriptionFindUnique.mockResolvedValue(sub);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 52_500 } });

      const summary = await getUsageSummary("cust-1");

      expect(summary.overageRows).toBe(2_500);
      // 2,500 rows → ceil(2500/1000) = 3 increments × 200 cents = 600 cents
      expect(summary.estimatedOverageChargeCents).toBe(600);
    });

    it("returns defaults when customer has no subscription", async () => {
      mockSubscriptionFindUnique.mockResolvedValue(null);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 3_000 } });

      const summary = await getUsageSummary("cust-1");

      expect(summary.plan).toBe("Free");
      expect(summary.limit).toBe(10_000);
      expect(summary.totalRows).toBe(3_000);
      expect(summary.percentUsed).toBe(30);
      expect(summary.overageRows).toBe(0);
      expect(summary.currentPeriodStart).toBeNull();
      expect(summary.currentPeriodEnd).toBeNull();
    });

    it("includes billing period dates from subscription", async () => {
      const periodStart = new Date("2025-06-01T00:00:00Z");
      const periodEnd = new Date("2025-07-01T00:00:00Z");
      const sub = makeSubscription(
        { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
        { tier: "SCALE" as PlanTier, id: "plan-scale", name: "Scale", monthlyRowLimit: 500_000, overagePer1000Cents: 100 }
      );
      mockSubscriptionFindUnique.mockResolvedValue(sub);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 0 } });

      const summary = await getUsageSummary("cust-1");

      expect(summary.currentPeriodStart).toEqual(periodStart);
      expect(summary.currentPeriodEnd).toEqual(periodEnd);
    });

    it("returns zero overage charge when overage price is zero (Free plan)", async () => {
      const sub = makeSubscription(
        {},
        { tier: "FREE" as PlanTier, monthlyRowLimit: 10_000, overagePer1000Cents: 0 }
      );
      mockSubscriptionFindUnique.mockResolvedValue(sub);
      mockUsageRecordAggregate.mockResolvedValue({ _sum: { rowCount: 12_000 } });

      const summary = await getUsageSummary("cust-1");

      expect(summary.overageRows).toBe(2_000);
      expect(summary.estimatedOverageChargeCents).toBe(0);
    });
  });

  // ── getCurrentBillingPeriod ──────────────────────────────────────────────

  describe("getCurrentBillingPeriod", () => {
    it("returns a string in YYYY-MM format", () => {
      const period = getCurrentBillingPeriod();
      expect(period).toMatch(/^\d{4}-\d{2}$/);
    });

    it("matches the current UTC year and month", () => {
      const now = new Date();
      const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      expect(getCurrentBillingPeriod()).toBe(expected);
    });
  });
});
