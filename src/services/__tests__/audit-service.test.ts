import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuditLog } from "@prisma/client";
import type { AuditEntry } from "../audit-service.js";

// Mock Prisma client
const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../db/client.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../db/client.js")>();
  return {
    ...original,
    prisma: {
      auditLog: {
        create: (...args: unknown[]) => mockCreate(...args),
        findMany: (...args: unknown[]) => mockFindMany(...args),
        count: (...args: unknown[]) => mockCount(...args),
        update: (...args: unknown[]) => mockUpdate(...args),
        delete: (...args: unknown[]) => mockDelete(...args),
      },
    },
  };
});

// Import after mocks
const { log, query, auditService } = await import("../audit-service.js");

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: "audit-1",
    customerId: "cust-1",
    actorId: "actor-1",
    action: "api_key.create",
    targetType: "api_key",
    targetId: "key-1",
    metadata: null,
    ipAddress: "192.168.1.1",
    createdAt: new Date("2025-01-15T10:00:00Z"),
    ...overrides,
  };
}

describe("AuditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("log", () => {
    it("creates an audit log entry with all fields", async () => {
      const entry: AuditEntry = {
        customerId: "cust-1",
        actorId: "actor-1",
        action: "api_key.create",
        targetType: "api_key",
        targetId: "key-1",
        metadata: { keyName: "Production Key" },
        ipAddress: "10.0.0.1",
      };

      const created = makeAuditLog({
        metadata: { keyName: "Production Key" },
        ipAddress: "10.0.0.1",
      });
      mockCreate.mockResolvedValue(created);

      const result = await log(entry);

      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          customerId: "cust-1",
          actorId: "actor-1",
          action: "api_key.create",
          targetType: "api_key",
          targetId: "key-1",
          metadata: { keyName: "Production Key" },
          ipAddress: "10.0.0.1",
        },
      });
      expect(result).toEqual(created);
    });

    it("creates an entry without metadata when not provided", async () => {
      const entry: AuditEntry = {
        customerId: "cust-1",
        actorId: "actor-1",
        action: "login",
        targetType: "session",
        targetId: "sess-1",
        ipAddress: "::1",
      };

      const created = makeAuditLog({ action: "login", ipAddress: "::1" });
      mockCreate.mockResolvedValue(created);

      await log(entry);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: undefined,
        }),
      });
    });

    it("passes custom timestamp when provided", async () => {
      const timestamp = new Date("2025-06-01T12:00:00Z");
      const entry: AuditEntry = {
        customerId: "cust-1",
        actorId: "actor-1",
        action: "account.delete",
        targetType: "customer",
        targetId: "cust-1",
        ipAddress: "10.0.0.1",
        timestamp,
      };

      mockCreate.mockResolvedValue(makeAuditLog());

      await log(entry);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          createdAt: timestamp,
        }),
      });
    });

    it("propagates database errors", async () => {
      mockCreate.mockRejectedValue(new Error("Connection failed"));

      const entry: AuditEntry = {
        customerId: "cust-1",
        actorId: "actor-1",
        action: "login",
        targetType: "session",
        targetId: "sess-1",
        ipAddress: "10.0.0.1",
      };

      await expect(log(entry)).rejects.toThrow("Connection failed");
    });
  });

  describe("query", () => {
    it("returns paginated results with defaults (page 1, pageSize 20)", async () => {
      const logs = [makeAuditLog()];
      mockFindMany.mockResolvedValue(logs);
      mockCount.mockResolvedValue(1);

      const result = await query("cust-1");

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { customerId: "cust-1" },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: logs,
        total: 1,
        page: 1,
        pageSize: 20,
        hasNextPage: false,
      });
    });

    it("filters by action type", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await query("cust-1", { action: "api_key.create" });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: "cust-1", action: "api_key.create" },
        })
      );
    });

    it("filters by date range", async () => {
      const startDate = new Date("2025-01-01T00:00:00Z");
      const endDate = new Date("2025-01-31T23:59:59Z");
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await query("cust-1", { startDate, endDate });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            customerId: "cust-1",
            createdAt: { gte: startDate, lte: endDate },
          },
        })
      );
    });

    it("filters by start date only", async () => {
      const startDate = new Date("2025-01-01T00:00:00Z");
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await query("cust-1", { startDate });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            customerId: "cust-1",
            createdAt: { gte: startDate },
          },
        })
      );
    });

    it("respects custom page and pageSize", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(50);

      const result = await query("cust-1", { page: 3, pageSize: 10 });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      );
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
    });

    it("clamps pageSize to max 100", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await query("cust-1", { pageSize: 500 });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });

    it("clamps page to minimum 1", async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await query("cust-1", { page: -5 });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 })
      );
    });

    it("correctly computes hasNextPage when more results exist", async () => {
      const logs = Array.from({ length: 20 }, (_, i) =>
        makeAuditLog({ id: `audit-${i}` })
      );
      mockFindMany.mockResolvedValue(logs);
      mockCount.mockResolvedValue(50);

      const result = await query("cust-1", { page: 1, pageSize: 20 });

      expect(result.hasNextPage).toBe(true);
    });

    it("hasNextPage is false on last page", async () => {
      const logs = [makeAuditLog()];
      mockFindMany.mockResolvedValue(logs);
      mockCount.mockResolvedValue(41);

      const result = await query("cust-1", { page: 3, pageSize: 20 });

      // skip=40, data.length=1, 40+1=41 === total → no next page
      expect(result.hasNextPage).toBe(false);
    });

    it("combines action and date filters", async () => {
      const startDate = new Date("2025-01-01T00:00:00Z");
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await query("cust-1", { action: "login", startDate });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            customerId: "cust-1",
            action: "login",
            createdAt: { gte: startDate },
          },
        })
      );
    });
  });

  describe("insert-only policy", () => {
    it("only exposes log and query methods on the auditService export", () => {
      const exportedKeys = Object.keys(auditService).sort();
      expect(exportedKeys).toEqual(["log", "query"]);
    });

    it("does not expose update, delete, or upsert methods", () => {
      const forbidden = ["update", "delete", "upsert", "remove", "destroy"];
      for (const method of forbidden) {
        expect(auditService).not.toHaveProperty(method);
      }
    });

    describe("Prisma extension blocks mutating operations on AuditLog", () => {
      it("rejects update on AuditLog model", async () => {
        mockUpdate.mockRejectedValue(new Error("AuditLog is insert-only: update operations are not permitted"));

        const { prisma } = await import("../../db/client.js");
        await expect(
          prisma.auditLog.update({ where: { id: "audit-1" }, data: { action: "modified" } })
        ).rejects.toThrow(/insert-only/i);
      });

      it("rejects delete on AuditLog model", async () => {
        mockDelete.mockRejectedValue(new Error("AuditLog is insert-only: delete operations are not permitted"));

        const { prisma } = await import("../../db/client.js");
        await expect(
          prisma.auditLog.delete({ where: { id: "audit-1" } })
        ).rejects.toThrow(/insert-only/i);
      });

      it("allows create on AuditLog model", async () => {
        const created = makeAuditLog();
        mockCreate.mockResolvedValue(created);

        const result = await log({
          customerId: "cust-1",
          actorId: "actor-1",
          action: "test",
          targetType: "test",
          targetId: "test-1",
          ipAddress: "10.0.0.1",
        });

        expect(mockCreate).toHaveBeenCalled();
        expect(result).toEqual(created);
      });

      it("allows findMany on AuditLog model", async () => {
        const logs = [makeAuditLog()];
        mockFindMany.mockResolvedValue(logs);
        mockCount.mockResolvedValue(1);

        const result = await query("cust-1");

        expect(mockFindMany).toHaveBeenCalled();
        expect(result.data).toEqual(logs);
      });
    });
  });
});
