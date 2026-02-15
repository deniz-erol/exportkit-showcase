/**
 * Unit tests for job creation with priority queue assignment (ENT-02).
 *
 * Verifies that createJob looks up the customer's plan tier and passes
 * the correct BullMQ priority when adding jobs to the export queue.
 *
 * **Validates: Requirements ENT-02 (1, 2, 3, 4)**
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PlanTier } from "@prisma/client";

// ─── Mock: Prisma ────────────────────────────────────────────────────────────

vi.mock("../../db/client.js", () => ({
  prisma: {
    subscription: { findUnique: vi.fn() },
    job: { create: vi.fn() },
  },
}));

// ─── Mock: BullMQ export queue ───────────────────────────────────────────────

vi.mock("../../queue/queues.js", () => ({
  exportQueue: { add: vi.fn() },
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { createJob } from "../job-service.js";
import { PLAN_PRIORITY_MAP, DEFAULT_PRIORITY } from "../../lib/priority.js";
import { prisma } from "../../db/client.js";
import { exportQueue } from "../../queue/queues.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockedPrisma = vi.mocked(prisma);
const mockedQueue = vi.mocked(exportQueue);

function mockSubscriptionWithTier(tier: PlanTier) {
  return {
    id: "sub-1",
    customerId: "cust-1",
    planId: `plan-${tier.toLowerCase()}`,
    status: "active",
    plan: { id: `plan-${tier.toLowerCase()}`, tier },
  };
}

const baseJobOptions = {
  customerId: "cust-1",
  apiKeyId: "key-1",
  type: "csv" as const,
  payload: {},
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default: queue.add returns a job with an id
  mockedQueue.add.mockResolvedValue({ id: "bullmq-123" } as never);

  // Default: job.create returns a valid job record
  mockedPrisma.job.create.mockResolvedValue({
    id: "job-1",
    bullmqId: "bullmq-123",
    status: "QUEUED",
  } as never);
});

describe("createJob priority assignment", () => {
  it("assigns high priority (1) for Scale plan customers", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(
      mockSubscriptionWithTier("SCALE" as PlanTier) as never,
    );

    await createJob(baseJobOptions);

    expect(mockedQueue.add).toHaveBeenCalledWith(
      "csv",
      expect.any(Object),
      expect.objectContaining({ priority: PLAN_PRIORITY_MAP.SCALE }),
    );
  });

  it("assigns medium priority (5) for Pro plan customers", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(
      mockSubscriptionWithTier("PRO" as PlanTier) as never,
    );

    await createJob(baseJobOptions);

    expect(mockedQueue.add).toHaveBeenCalledWith(
      "csv",
      expect.any(Object),
      expect.objectContaining({ priority: PLAN_PRIORITY_MAP.PRO }),
    );
  });

  it("assigns low priority (10) for Free plan customers", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(
      mockSubscriptionWithTier("FREE" as PlanTier) as never,
    );

    await createJob(baseJobOptions);

    expect(mockedQueue.add).toHaveBeenCalledWith(
      "csv",
      expect.any(Object),
      expect.objectContaining({ priority: PLAN_PRIORITY_MAP.FREE }),
    );
  });

  it("defaults to Free priority when customer has no subscription", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(null);

    await createJob(baseJobOptions);

    expect(mockedQueue.add).toHaveBeenCalledWith(
      "csv",
      expect.any(Object),
      expect.objectContaining({ priority: DEFAULT_PRIORITY }),
    );
  });

  it("looks up subscription by customerId with plan included", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(null);

    await createJob(baseJobOptions);

    expect(mockedPrisma.subscription.findUnique).toHaveBeenCalledWith({
      where: { customerId: "cust-1" },
      include: { plan: true },
    });
  });

  it("Scale jobs get higher priority than Pro jobs", () => {
    expect(PLAN_PRIORITY_MAP.SCALE).toBeLessThan(PLAN_PRIORITY_MAP.PRO);
  });

  it("Pro jobs get higher priority than Free jobs", () => {
    expect(PLAN_PRIORITY_MAP.PRO).toBeLessThan(PLAN_PRIORITY_MAP.FREE);
  });
});
