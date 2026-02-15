import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateConsent, acceptTos, needsReConsent } from "../consent-service.js";

// Mock Prisma
vi.mock("../../db/client.js", () => ({
  prisma: {
    customer: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../../db/client.js";

const mockPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateConsent", () => {
  it("merges partial preferences with existing state", async () => {
    mockPrisma.customer.findUniqueOrThrow.mockResolvedValue({
      emailNotifications: true,
      marketingEmails: false,
    } as any);
    mockPrisma.customer.update.mockResolvedValue({} as any);
    mockPrisma.auditLog.create.mockResolvedValue({} as any);

    const result = await updateConsent("cust-1", { marketingEmails: true });

    expect(result.previous).toEqual({ emailNotifications: true, marketingEmails: false });
    expect(result.current).toEqual({ emailNotifications: true, marketingEmails: true });
  });

  it("persists merged state via prisma update", async () => {
    mockPrisma.customer.findUniqueOrThrow.mockResolvedValue({
      emailNotifications: true,
      marketingEmails: true,
    } as any);
    mockPrisma.customer.update.mockResolvedValue({} as any);
    mockPrisma.auditLog.create.mockResolvedValue({} as any);

    await updateConsent("cust-2", { emailNotifications: false });

    expect(mockPrisma.customer.update).toHaveBeenCalledWith({
      where: { id: "cust-2" },
      data: { emailNotifications: false, marketingEmails: true },
    });
  });

  it("creates audit log with previous and current values", async () => {
    mockPrisma.customer.findUniqueOrThrow.mockResolvedValue({
      emailNotifications: false,
      marketingEmails: false,
    } as any);
    mockPrisma.customer.update.mockResolvedValue({} as any);
    mockPrisma.auditLog.create.mockResolvedValue({} as any);

    await updateConsent("cust-3", { emailNotifications: true, marketingEmails: true });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        customerId: "cust-3",
        actorId: "cust-3",
        action: "consent.updated",
        targetType: "customer",
        targetId: "cust-3",
        ipAddress: "",
        metadata: {
          previous: { emailNotifications: false, marketingEmails: false },
          current: { emailNotifications: true, marketingEmails: true },
        },
      },
    });
  });

  it("handles empty preferences (no-op merge)", async () => {
    mockPrisma.customer.findUniqueOrThrow.mockResolvedValue({
      emailNotifications: true,
      marketingEmails: false,
    } as any);
    mockPrisma.customer.update.mockResolvedValue({} as any);
    mockPrisma.auditLog.create.mockResolvedValue({} as any);

    const result = await updateConsent("cust-4", {});

    expect(result.previous).toEqual(result.current);
  });
});

describe("acceptTos", () => {
  it("updates tosAcceptedAt and tosVersion on customer", async () => {
    mockPrisma.customer.update.mockResolvedValue({} as any);
    mockPrisma.auditLog.create.mockResolvedValue({} as any);

    const before = Date.now();
    await acceptTos("cust-5", "2.0");
    const after = Date.now();

    const call = mockPrisma.customer.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "cust-5" });
    expect(call.data.tosVersion).toBe("2.0");
    const ts = (call.data.tosAcceptedAt as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("creates audit log for TOS acceptance", async () => {
    mockPrisma.customer.update.mockResolvedValue({} as any);
    mockPrisma.auditLog.create.mockResolvedValue({} as any);

    await acceptTos("cust-6", "3.1");

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        customerId: "cust-6",
        actorId: "cust-6",
        action: "tos.accepted",
        targetType: "customer",
        targetId: "cust-6",
        ipAddress: "",
        metadata: { tosVersion: "3.1" },
      },
    });
  });
});

describe("needsReConsent", () => {
  it("returns true when customerTosVersion is null", () => {
    expect(needsReConsent(null, "1.0")).toBe(true);
  });

  it("returns true when versions differ", () => {
    expect(needsReConsent("1.0", "2.0")).toBe(true);
  });

  it("returns false when versions match", () => {
    expect(needsReConsent("1.0", "1.0")).toBe(false);
  });

  it("returns true for empty string vs non-empty", () => {
    expect(needsReConsent("", "1.0")).toBe(true);
  });

  it("returns false for matching empty strings", () => {
    expect(needsReConsent("", "")).toBe(false);
  });
});
