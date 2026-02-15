import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

/**
 * **Validates: Requirements BILL-02 (4)**
 *
 * Property P1: Usage Tracking Idempotency
 * For any job ID and row count, recording usage twice for the same job ID
 * produces the same total monthly usage as recording it once.
 * This ensures BullMQ retries don't cause double-counting.
 */

// ── Prisma mock ──────────────────────────────────────────────────────────────
// In-memory store to simulate the UsageRecord table with unique jobId constraint
let usageStore: Map<string, { customerId: string; jobId: string; rowCount: number; billingPeriod: string }>;

const mockUsageRecordCreate = vi.fn();
const mockUsageRecordAggregate = vi.fn();
const mockSubscriptionFindUnique = vi.fn();
const mockCustomerFindUnique = vi.fn();
const mockUsageAlertCreate = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: {
    usageRecord: {
      create: (...args: unknown[]) => mockUsageRecordCreate(...args),
      aggregate: (...args: unknown[]) => mockUsageRecordAggregate(...args),
    },
    subscription: {
      findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args),
    },
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
    },
    usageAlert: {
      create: (...args: unknown[]) => mockUsageAlertCreate(...args),
    },
  },
}));

vi.mock("../../queue/notification.js", () => ({
  emailQueue: { add: vi.fn() },
}));

vi.mock("../../lib/logger.js", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { recordJobUsage, getMonthlyUsage } = await import(
  "../../services/usage-service.js"
);

describe("P1: Usage Tracking Idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usageStore = new Map();

    // Simulate Prisma create with unique jobId constraint
    mockUsageRecordCreate.mockImplementation(
      (args: { data: { customerId: string; jobId: string; rowCount: number; billingPeriod: string } }) => {
        const { jobId } = args.data;
        if (usageStore.has(jobId)) {
          // Simulate Prisma P2002 unique constraint violation
          const error = new Error("Unique constraint failed on the fields: (`jobId`)");
          (error as any).code = "P2002";
          return Promise.reject(error);
        }
        usageStore.set(jobId, args.data);
        return Promise.resolve(args.data);
      }
    );

    // Simulate aggregate by summing rows for matching customerId and billingPeriod
    mockUsageRecordAggregate.mockImplementation(
      (args: { where: { customerId: string; billingPeriod: string } }) => {
        let sum = 0;
        for (const record of usageStore.values()) {
          if (
            record.customerId === args.where.customerId &&
            record.billingPeriod === args.where.billingPeriod
          ) {
            sum += record.rowCount;
          }
        }
        return Promise.resolve({ _sum: { rowCount: sum || null } });
      }
    );

    // checkAndSendAlerts needs subscription lookup — return null to skip alerts
    mockSubscriptionFindUnique.mockResolvedValue(null);
  });

  it("recording usage twice for the same job produces the same total as recording once", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        fc.integer({ min: 1, max: 1_000_000 }),
        async (customerId, jobId, rowCount) => {
          // Reset store for each iteration
          usageStore = new Map();
          vi.clearAllMocks();

          // Re-wire mocks after clearAllMocks
          mockUsageRecordCreate.mockImplementation(
            (args: { data: { customerId: string; jobId: string; rowCount: number; billingPeriod: string } }) => {
              const { jobId: jid } = args.data;
              if (usageStore.has(jid)) {
                const error = new Error("Unique constraint failed on the fields: (`jobId`)");
                (error as any).code = "P2002";
                return Promise.reject(error);
              }
              usageStore.set(jid, args.data);
              return Promise.resolve(args.data);
            }
          );

          mockUsageRecordAggregate.mockImplementation(
            (args: { where: { customerId: string; billingPeriod: string } }) => {
              let sum = 0;
              for (const record of usageStore.values()) {
                if (
                  record.customerId === args.where.customerId &&
                  record.billingPeriod === args.where.billingPeriod
                ) {
                  sum += record.rowCount;
                }
              }
              return Promise.resolve({ _sum: { rowCount: sum || null } });
            }
          );

          mockSubscriptionFindUnique.mockResolvedValue(null);

          // Record once, measure
          await recordJobUsage(customerId, jobId, rowCount);
          const usageAfterOnce = await getMonthlyUsage(customerId);

          // Record again (duplicate), measure
          await recordJobUsage(customerId, jobId, rowCount);
          const usageAfterTwice = await getMonthlyUsage(customerId);

          // Idempotency: both should be equal
          expect(usageAfterTwice).toBe(usageAfterOnce);
          // And both should equal the single row count
          expect(usageAfterOnce).toBe(rowCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
