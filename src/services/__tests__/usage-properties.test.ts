import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

/**
 * Property-Based Test P1: Usage Tracking Idempotency
 *
 * For any job ID and row count, recording usage twice for the same job ID
 * produces the same total monthly usage as recording it once.
 * This ensures BullMQ retries don't cause double-counting.
 */

// Mock Prisma client
const mockCreate = vi.fn();
const mockAggregate = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: {
    usageRecord: {
      create: (...args: unknown[]) => mockCreate(...args),
      aggregate: (...args: unknown[]) => mockAggregate(...args),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    customer: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    usageAlert: {
      create: vi.fn(),
    },
  },
}));

// Mock email queue
vi.mock("../../queue/notification.js", () => ({
  emailQueue: {
    add: vi.fn(),
  },
}));

// Import after mocks
const { recordJobUsage, getMonthlyUsage } = await import("../usage-service.js");

describe("P1: Usage Tracking Idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recording the same job twice produces the same total as recording once", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 30 }), // customerId
        fc.string({ minLength: 10, maxLength: 30 }), // jobId
        fc.integer({ min: 1, max: 10_000_000 }),      // rowCount
        async (customerId, jobId, rowCount) => {
          // Fresh state per iteration
          const storedRecords = new Map<string, number>();

          mockCreate.mockReset();
          mockAggregate.mockReset();

          mockCreate.mockImplementation(async ({ data }: any) => {
            if (storedRecords.has(data.jobId)) {
              const error = new Error("Unique constraint failed");
              (error as any).code = "P2002";
              throw error;
            }
            storedRecords.set(data.jobId, data.rowCount);
            return { id: "rec-1", ...data };
          });

          mockAggregate.mockImplementation(async () => {
            let sum = 0;
            for (const rc of storedRecords.values()) sum += rc;
            return { _sum: { rowCount: sum } };
          });

          // Record once
          await recordJobUsage(customerId, jobId, rowCount);
          const totalAfterFirst = await getMonthlyUsage(customerId);

          // Record again (duplicate — should be silently ignored)
          await recordJobUsage(customerId, jobId, rowCount);
          const totalAfterSecond = await getMonthlyUsage(customerId);

          // Totals must be identical
          expect(totalAfterSecond).toBe(totalAfterFirst);
          expect(totalAfterSecond).toBe(rowCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("duplicate recording does not throw", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        async (customerId, jobId, rowCount) => {
          mockCreate.mockReset();
          mockAggregate.mockReset();

          let called = false;
          mockCreate.mockImplementation(async () => {
            if (called) {
              const error = new Error("Unique constraint failed");
              (error as any).code = "P2002";
              throw error;
            }
            called = true;
            return { id: "rec-1" };
          });

          // Neither call should throw
          await recordJobUsage(customerId, jobId, rowCount);
          await recordJobUsage(customerId, jobId, rowCount);
          // If we get here without throwing, the property holds
        }
      ),
      { numRuns: 100 }
    );
  });

  it("non-P2002 errors are re-thrown", async () => {
    mockCreate.mockReset();
    mockCreate.mockRejectedValue(new Error("Connection failed"));

    await expect(
      recordJobUsage("cust-1", "job-1", 100)
    ).rejects.toThrow("Connection failed");
  });
});
