import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock R2 client
const mockSend = vi.fn();
vi.mock("../../lib/r2/client.js", () => ({
  r2Client: { send: (...args: unknown[]) => mockSend(...args) },
}));

// Mock Prisma — transaction-based deletion
const mockDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const mockCustomerFindUnique = vi.fn();
const mockCustomerDelete = vi.fn();
const mockExecuteRaw = vi.fn().mockResolvedValue(0);

const txClient = {
  usageAlert: { deleteMany: mockDeleteMany },
  usageRecord: { deleteMany: mockDeleteMany },
  webhookDelivery: { deleteMany: mockDeleteMany },
  exportSchedule: { deleteMany: mockDeleteMany },
  job: { deleteMany: mockDeleteMany },
  apiKey: { deleteMany: mockDeleteMany },
  teamMember: { deleteMany: mockDeleteMany },
  session: { deleteMany: mockDeleteMany },
  account: { deleteMany: mockDeleteMany },
  subscription: { deleteMany: mockDeleteMany },
  customer: { delete: mockCustomerDelete },
  $executeRaw: mockExecuteRaw,
};

const mockTransaction = vi.fn().mockImplementation(async (fn: (tx: typeof txClient) => Promise<unknown>) => {
  return fn(txClient);
});

const mockTeamMemberUpdate = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: {
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
    },
    teamMember: {
      update: (...args: unknown[]) => mockTeamMemberUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// Mock email queue
const mockEmailQueueAdd = vi.fn().mockResolvedValue({ id: "email-job-1" });
vi.mock("../../queue/notification.js", () => ({
  emailQueue: {
    add: (...args: unknown[]) => mockEmailQueueAdd(...args),
  },
}));

import { deleteAccount, deleteCustomerFiles, removeTeamMember } from "../account-deletion-service.js";

const mockCustomer = {
  id: "cust-1",
  email: "test@example.com",
  name: "Test Co",
};

describe("deleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFindUnique.mockResolvedValue(mockCustomer);
    mockCustomerDelete.mockResolvedValue(mockCustomer);
    mockExecuteRaw.mockResolvedValue(5);
    // Default: no R2 files
    mockSend.mockResolvedValue({ Contents: [], IsTruncated: false });
    process.env.R2_BUCKET_NAME = "test-bucket";
  });

  it("runs all deletions inside a single $transaction", async () => {
    await deleteAccount("cust-1");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it("deletes related records in correct dependency order", async () => {
    const callOrder: string[] = [];
    const trackingDeleteMany = (table: string) =>
      vi.fn().mockImplementation(async () => {
        callOrder.push(table);
        return { count: 0 };
      });

    txClient.usageAlert.deleteMany = trackingDeleteMany("usageAlert");
    txClient.usageRecord.deleteMany = trackingDeleteMany("usageRecord");
    txClient.webhookDelivery.deleteMany = trackingDeleteMany("webhookDelivery");
    txClient.exportSchedule.deleteMany = trackingDeleteMany("exportSchedule");
    txClient.job.deleteMany = trackingDeleteMany("job");
    txClient.apiKey.deleteMany = trackingDeleteMany("apiKey");
    txClient.teamMember.deleteMany = trackingDeleteMany("teamMember");
    txClient.session.deleteMany = trackingDeleteMany("session");
    txClient.account.deleteMany = trackingDeleteMany("account");
    txClient.subscription.deleteMany = trackingDeleteMany("subscription");
    txClient.customer.delete = vi.fn().mockImplementation(async () => {
      callOrder.push("customer");
      return mockCustomer;
    });

    await deleteAccount("cust-1");

    expect(callOrder).toEqual([
      "usageAlert",
      "usageRecord",
      "webhookDelivery",
      "exportSchedule",
      "job",
      "apiKey",
      "teamMember",
      "session",
      "account",
      "subscription",
      "customer",
    ]);
  });

  it("anonymizes audit logs with SHA-256 hash within the transaction", async () => {
    mockExecuteRaw.mockResolvedValue(3);

    const result = await deleteAccount("cust-1");

    expect(result.auditLogsAnonymized).toBe(3);
    // $executeRaw is called twice: once for INSERT (deletion event), once for UPDATE (anonymization)
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
  });

  it("creates anonymized audit log entry for the deletion event", async () => {
    // Track $executeRaw calls to verify the INSERT happens before the UPDATE
    const rawCalls: unknown[][] = [];
    mockExecuteRaw.mockImplementation(async (...args: unknown[]) => {
      rawCalls.push(args);
      return 0;
    });

    await deleteAccount("cust-1");

    // First $executeRaw call should be the INSERT for the deletion event
    expect(rawCalls.length).toBe(2);
    // The raw calls use tagged template literals, so we check the template strings
    const firstCallStrings = rawCalls[0][0] as { strings: string[] };
    const insertStrings = Array.isArray(firstCallStrings) ? firstCallStrings : firstCallStrings.strings;
    const joinedFirst = insertStrings.join("");
    expect(joinedFirst).toContain("INSERT INTO audit_logs");
    expect(joinedFirst).toContain("account.deleted");
  });

  it("returns AccountDeletionResult with success and counts", async () => {
    mockExecuteRaw.mockResolvedValue(7);

    const result = await deleteAccount("cust-1");

    expect(result.success).toBe(true);
    expect(result.r2ObjectsDeleted).toBe(0);
    expect(result.auditLogsAnonymized).toBe(7);
    expect(result.r2Errors).toEqual([]);
  });

  it("throws CUSTOMER_NOT_FOUND when customer does not exist", async () => {
    mockCustomerFindUnique.mockResolvedValue(null);

    await expect(deleteAccount("nonexistent")).rejects.toThrow("CUSTOMER_NOT_FOUND");
  });

  it("enqueues a deletion confirmation email after successful deletion", async () => {
    await deleteAccount("cust-1");

    // Allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(mockEmailQueueAdd).toHaveBeenCalledWith(
      "deletion-confirmation",
      expect.objectContaining({
        type: "deletion_confirmation",
        to: "test@example.com",
        payload: expect.objectContaining({
          customerName: "Test Co",
        }),
      })
    );
  });

  it("performs R2 cleanup after DB transaction commits", async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "exports/cust-1/job-1.csv" }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({}); // DeleteObjects

    const result = await deleteAccount("cust-1");

    expect(result.r2ObjectsDeleted).toBe(1);
    expect(result.r2Errors).toEqual([]);
  });

  it("collects R2 errors without failing the overall deletion", async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: "exports/cust-1/job-1.csv" },
          { Key: "exports/cust-1/job-2.json" },
        ],
        IsTruncated: false,
      })
      .mockRejectedValueOnce(new Error("R2 timeout"))
      .mockResolvedValueOnce({}); // second object succeeds

    const result = await deleteAccount("cust-1");

    expect(result.success).toBe(true);
    expect(result.r2ObjectsDeleted).toBe(1);
    expect(result.r2Errors).toHaveLength(1);
    expect(result.r2Errors[0]).toContain("R2 timeout");
  });
});

describe("deleteCustomerFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_BUCKET_NAME = "test-bucket";
    delete process.env.STORAGE_DRIVER;
  });

  it("lists and deletes objects with customer prefix", async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "exports/cust-1/job-1.csv" }, { Key: "exports/cust-1/job-2.json" }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({}); // DeleteObjects response

    const count = await deleteCustomerFiles("cust-1");

    expect(count).toBe(2);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("handles pagination when listing many objects", async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "exports/cust-1/file1.csv" }],
        IsTruncated: true,
        NextContinuationToken: "token-1",
      })
      .mockResolvedValueOnce({}) // DeleteObjects for first batch
      .mockResolvedValueOnce({
        Contents: [{ Key: "exports/cust-1/file2.csv" }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({}); // DeleteObjects for second batch

    const count = await deleteCustomerFiles("cust-1");

    expect(count).toBe(2);
  });

  it("returns 0 when no files exist", async () => {
    mockSend.mockResolvedValueOnce({ Contents: [], IsTruncated: false });

    const count = await deleteCustomerFiles("cust-1");

    expect(count).toBe(0);
  });

  it("returns 0 when R2_BUCKET_NAME is not set", async () => {
    delete process.env.R2_BUCKET_NAME;

    const count = await deleteCustomerFiles("cust-1");

    expect(count).toBe(0);
  });
});


describe("removeTeamMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("anonymizes email, clears passwordHash and inviteToken, sets removedAt", async () => {
    const memberId = "tm-123";
    const updatedMember = {
      id: memberId,
      customerId: "cust-1",
      email: `removed-${memberId}@deleted`,
      passwordHash: null,
      inviteToken: null,
      role: "MEMBER",
      invitedAt: new Date(),
      acceptedAt: null,
      removedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockTeamMemberUpdate.mockResolvedValue(updatedMember);

    const result = await removeTeamMember(memberId);

    expect(mockTeamMemberUpdate).toHaveBeenCalledWith({
      where: { id: memberId },
      data: {
        email: `removed-${memberId}@deleted`,
        passwordHash: null,
        inviteToken: null,
        removedAt: expect.any(Date),
      },
    });
    expect(result.email).toBe(`removed-${memberId}@deleted`);
    expect(result.passwordHash).toBeNull();
    expect(result.inviteToken).toBeNull();
    expect(result.removedAt).toBeInstanceOf(Date);
  });

  it("propagates errors when team member not found", async () => {
    mockTeamMemberUpdate.mockRejectedValue(new Error("Record not found"));

    await expect(removeTeamMember("nonexistent")).rejects.toThrow("Record not found");
  });
});
