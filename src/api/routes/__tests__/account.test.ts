import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Mock Prisma client
const mockCustomerFindUnique = vi.fn();
const mockApiKeyFindMany = vi.fn();
const mockJobFindMany = vi.fn();
const mockUsageRecordFindMany = vi.fn();
const mockAuditLogFindMany = vi.fn();
const mockSubscriptionFindUnique = vi.fn();

vi.mock("../../../db/client.js", () => ({
  prisma: {
    customer: { findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args) },
    apiKey: { findMany: (...args: unknown[]) => mockApiKeyFindMany(...args) },
    job: { findMany: (...args: unknown[]) => mockJobFindMany(...args) },
    usageRecord: { findMany: (...args: unknown[]) => mockUsageRecordFindMany(...args) },
    auditLog: {
      findMany: (...args: unknown[]) => mockAuditLogFindMany(...args),
      create: vi.fn(),
    },
    subscription: { findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args) },
    $use: vi.fn(),
  },
}));

// Mock audit service
const mockAuditLog = vi.fn().mockResolvedValue({});
vi.mock("../../../services/audit-service.js", () => ({
  auditService: {
    log: (...args: unknown[]) => mockAuditLog(...args),
  },
}));

// Mock account deletion service
const mockDeleteAccount = vi.fn();
vi.mock("../../../services/account-deletion-service.js", () => ({
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
}));

// Mock data export service
const mockGenerateDataExport = vi.fn();
vi.mock("../../../services/data-export-service.js", () => ({
  generateDataExport: (...args: unknown[]) => mockGenerateDataExport(...args),
}));

// Mock consent service
const mockUpdateConsent = vi.fn();
const mockAcceptTos = vi.fn();
vi.mock("../../../services/consent-service.js", () => ({
  updateConsent: (...args: unknown[]) => mockUpdateConsent(...args),
  acceptTos: (...args: unknown[]) => mockAcceptTos(...args),
}));

// Mock auth middleware — inject fake authenticated request
vi.mock("../../middleware/auth.js", () => ({
  authenticateApiKey: (req: any, _res: any, next: any) => {
    req.apiKey = {
      id: "key-1",
      customerId: "cust-1",
      name: "Test Key",
      keyHash: "hash",
      keyPrefix: "ek_test",
      scope: "ADMIN",
      allowedIps: [],
      rateLimit: 100,
      lastUsedAt: null,
      expiresAt: null,
      isRevoked: false,
      createdAt: new Date(),
      customer: { id: "cust-1", name: "Test Co", email: "test@example.com" },
    };
    next();
  },
}));

import express from "express";
import type { Request, Response, NextFunction } from "express";
import accountRoutes from "../account.js";

const app = express();
app.use(express.json());
app.use("/api/account", accountRoutes);

// Error handler for tests
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((_err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
});

let server: http.Server;
let baseUrl: string;

beforeEach(() => {
  return new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterEach(() => {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

/** Fetch helper for requests with JSON body */
async function request(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      `${baseUrl}${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload).toString() } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── DELETE /api/account ───────────────────────────────────────────────

describe("DELETE /api/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteAccount.mockResolvedValue({
      success: true,
      r2ObjectsDeleted: 3,
      auditLogsAnonymized: 5,
      r2Errors: [],
    });
  });

  it("returns 200 with deletion details on success", async () => {
    const { status, body } = await request("DELETE", "/api/account", {
      confirmEmail: "test@example.com",
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.r2ObjectsDeleted).toBe(3);
    expect(body.auditLogsAnonymized).toBe(5);
    expect(body.r2Errors).toEqual([]);
  });

  it("calls deleteAccount with the authenticated customerId", async () => {
    await request("DELETE", "/api/account", {
      confirmEmail: "test@example.com",
    });

    expect(mockDeleteAccount).toHaveBeenCalledWith("cust-1");
  });

  it("returns 400 when confirmEmail does not match customer email", async () => {
    const { status, body } = await request("DELETE", "/api/account", {
      confirmEmail: "wrong@example.com",
    });

    expect(status).toBe(400);
    expect(body.code).toBe("EMAIL_MISMATCH");
    expect(body.error).toBe("Email confirmation does not match");
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("returns 400 when confirmEmail is missing", async () => {
    const { status, body } = await request("DELETE", "/api/account", {});

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("returns 400 when confirmEmail is not a valid email", async () => {
    const { status, body } = await request("DELETE", "/api/account", {
      confirmEmail: "not-an-email",
    });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("returns 404 when customer is not found", async () => {
    mockDeleteAccount.mockRejectedValue(new Error("CUSTOMER_NOT_FOUND"));

    const { status, body } = await request("DELETE", "/api/account", {
      confirmEmail: "test@example.com",
    });

    expect(status).toBe(404);
    expect(body.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("returns 500 with DELETION_FAILED for unexpected errors", async () => {
    mockDeleteAccount.mockRejectedValue(new Error("Database connection lost"));

    const { status, body } = await request("DELETE", "/api/account", {
      confirmEmail: "test@example.com",
    });

    expect(status).toBe(500);
    expect(body.code).toBe("DELETION_FAILED");
  });
});

// ─── GET /api/account/data-export ──────────────────────────────────────

describe("GET /api/account/data-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns downloadUrl, expiresAt, and fileSize on success", async () => {
    mockGenerateDataExport.mockResolvedValue({
      downloadUrl: "https://r2.example.com/data-exports/cust-1/export.json?sig=abc",
      expiresAt: "2025-07-02T00:00:00.000Z",
      fileSize: 12345,
    });

    const { status, body } = await request("GET", "/api/account/data-export");

    expect(status).toBe(200);
    expect(body.downloadUrl).toBe("https://r2.example.com/data-exports/cust-1/export.json?sig=abc");
    expect(body.expiresAt).toBe("2025-07-02T00:00:00.000Z");
    expect(body.fileSize).toBe(12345);
  });

  it("calls generateDataExport with the authenticated customerId", async () => {
    mockGenerateDataExport.mockResolvedValue({
      downloadUrl: "https://example.com",
      expiresAt: "2025-07-02T00:00:00.000Z",
      fileSize: 100,
    });

    await request("GET", "/api/account/data-export");

    expect(mockGenerateDataExport).toHaveBeenCalledWith("cust-1");
  });

  it("returns 500 with EXPORT_FAILED when service throws", async () => {
    mockGenerateDataExport.mockRejectedValue(new Error("R2 upload failed"));

    const { status, body } = await request("GET", "/api/account/data-export");

    expect(status).toBe(500);
    expect(body.error).toBe("Data export generation failed.");
    expect(body.code).toBe("EXPORT_FAILED");
  });
});

// ─── PATCH /api/account/consent ────────────────────────────────────────

describe("PATCH /api/account/consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateConsent.mockResolvedValue({
      previous: { emailNotifications: true, marketingEmails: false },
      current: { emailNotifications: true, marketingEmails: true },
    });
    mockAcceptTos.mockResolvedValue(undefined);
  });

  it("updates consent preferences and returns previous/current state", async () => {
    const { status, body } = await request("PATCH", "/api/account/consent", {
      marketingEmails: true,
    });

    expect(status).toBe(200);
    expect(body.previous).toEqual({ emailNotifications: true, marketingEmails: false });
    expect(body.current).toEqual({ emailNotifications: true, marketingEmails: true });
    expect(mockUpdateConsent).toHaveBeenCalledWith("cust-1", { marketingEmails: true });
  });

  it("accepts TOS version when provided", async () => {
    const { status, body } = await request("PATCH", "/api/account/consent", {
      tosVersion: "2.0",
    });

    expect(status).toBe(200);
    expect(body.tosVersion).toBe("2.0");
    expect(mockAcceptTos).toHaveBeenCalledWith("cust-1", "2.0");
    expect(mockUpdateConsent).not.toHaveBeenCalled();
  });

  it("handles both consent update and TOS acceptance together", async () => {
    const { status, body } = await request("PATCH", "/api/account/consent", {
      emailNotifications: false,
      tosVersion: "2.0",
    });

    expect(status).toBe(200);
    expect(mockAcceptTos).toHaveBeenCalledWith("cust-1", "2.0");
    expect(mockUpdateConsent).toHaveBeenCalledWith("cust-1", { emailNotifications: false });
    expect(body.tosVersion).toBe("2.0");
  });

  it("returns 400 for invalid body types", async () => {
    const { status, body } = await request("PATCH", "/api/account/consent", {
      emailNotifications: "yes",
    });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("handles empty body (no-op)", async () => {
    const { status } = await request("PATCH", "/api/account/consent", {});

    expect(status).toBe(200);
    expect(mockUpdateConsent).not.toHaveBeenCalled();
    expect(mockAcceptTos).not.toHaveBeenCalled();
  });
});
