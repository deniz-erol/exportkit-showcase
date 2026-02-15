import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Mock next-auth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

// Mock auth options
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getServerSession } from "next-auth";
import { GET } from "../route";

const mockedGetServerSession = vi.mocked(getServerSession);

describe("GET /api/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when session is missing", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when session has no user", async () => {
    mockedGetServerSession.mockResolvedValue({ expires: "" });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("proxies usage data from Express API on success", async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: "cust_123", email: "test@example.com" },
      expires: "",
    });

    const usageData = {
      plan: "Free",
      totalRows: 3200,
      limit: 10000,
      percentUsed: 32,
      overageRows: 0,
      estimatedOverageChargeCents: 0,
      billingPeriod: "2024-01",
      currentPeriodStart: "2024-01-01T00:00:00Z",
      currentPeriodEnd: "2024-02-01T00:00:00Z",
    };

    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => usageData,
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(usageData);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/usage",
      {
        headers: {
          "x-dashboard-request": "true",
          "x-customer-id": "cust_123",
        },
      }
    );
  });

  it("forwards non-200 status from Express API", async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: "cust_456", email: "test@example.com" },
      expires: "",
    });

    mockFetch.mockResolvedValue({
      status: 404,
      json: async () => ({ error: "Customer not found" }),
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Customer not found" });
  });

  it("returns 500 when fetch throws", async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: "cust_789", email: "test@example.com" },
      expires: "",
    });

    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Failed to fetch usage data" });
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
