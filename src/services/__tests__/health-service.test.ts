import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks ---

const mockQueryRaw = vi.fn();
vi.mock("../../db/client.js", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $use: vi.fn(),
  },
}));

const mockPing = vi.fn();
vi.mock("../../queue/connection.js", () => ({
  redis: {
    ping: () => mockPing(),
  },
}));

const mockSend = vi.fn();
vi.mock("../../lib/r2/client.js", () => ({
  r2Client: {
    send: (...args: unknown[]) => mockSend(...args),
  },
}));

vi.mock("../../lib/logger.js", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// Import after mocks
const { checkHealth } = await import("../health-service.js");

describe("HealthService", () => {
  const originalEnv = process.env.R2_BUCKET_NAME;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_BUCKET_NAME = "test-bucket";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.R2_BUCKET_NAME = originalEnv;
    } else {
      delete process.env.R2_BUCKET_NAME;
    }
  });

  describe("all dependencies healthy", () => {
    it("returns status healthy with 200-compatible result when all checks pass", async () => {
      mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
      mockPing.mockResolvedValue("PONG");
      mockSend.mockResolvedValue({ Contents: [] });

      const result = await checkHealth();

      expect(result.status).toBe("healthy");
      expect(result.dependencies.postgres.status).toBe("healthy");
      expect(result.dependencies.redis.status).toBe("healthy");
      expect(result.dependencies.r2.status).toBe("healthy");
    });

    it("includes uptime, timestamp, and version", async () => {
      mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
      mockPing.mockResolvedValue("PONG");
      mockSend.mockResolvedValue({ Contents: [] });

      const result = await checkHealth();

      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeGreaterThan(0);
      expect(typeof result.version).toBe("string");
    });

    it("includes latency for each dependency", async () => {
      mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
      mockPing.mockResolvedValue("PONG");
      mockSend.mockResolvedValue({ Contents: [] });

      const result = await checkHealth();

      expect(result.dependencies.postgres.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.dependencies.redis.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.dependencies.r2.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("does not include error fields when healthy", async () => {
      mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
      mockPing.mockResolvedValue("PONG");
      mockSend.mockResolvedValue({ Contents: [] });

      const result = await checkHealth();

      expect(result.dependencies.postgres.error).toBeUndefined();
      expect(result.dependencies.redis.error).toBeUndefined();
      expect(result.dependencies.r2.error).toBeUndefined();
    });
  });

  describe("unhealthy dependencies", () => {
    it("returns unhealthy when Postgres fails", async () => {
      mockQueryRaw.mockRejectedValue(new Error("Connection refused"));
      mockPing.mockResolvedValue("PONG");
      mockSend.mockResolvedValue({ Contents: [] });

      const result = await checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.dependencies.postgres.status).toBe("unhealthy");
      expect(result.dependencies.postgres.error).toBe("Connection refused");
      expect(result.dependencies.redis.status).toBe("healthy");
      expect(result.dependencies.r2.status).toBe("healthy");
    });

    it("returns unhealthy when Redis fails", async () => {
      mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
      mockPing.mockRejectedValue(new Error("ECONNREFUSED"));
      mockSend.mockResolvedValue({ Contents: [] });

      const result = await checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.dependencies.redis.status).toBe("unhealthy");
      expect(result.dependencies.redis.error).toBe("ECONNREFUSED");
      expect(result.dependencies.postgres.status).toBe("healthy");
    });

    it("returns unhealthy when Redis returns unexpected PING response", async () => {
      mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
      mockPing.mockResolvedValue("NOT_PONG");
      mockSend.mockResolvedValue({ Contents: [] });

      const result = await checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.dependencies.redis.status).toBe("unhealthy");
      expect(result.dependencies.redis.error).toContain("Unexpected PING response");
    });

    it("returns unhealthy when R2 fails", async () => {
      mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
      mockPing.mockResolvedValue("PONG");
      mockSend.mockRejectedValue(new Error("Access Denied"));

      const result = await checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.dependencies.r2.status).toBe("unhealthy");
      expect(result.dependencies.r2.error).toBe("Access Denied");
      expect(result.dependencies.postgres.status).toBe("healthy");
    });

    it("returns unhealthy when R2_BUCKET_NAME is not set", async () => {
      delete process.env.R2_BUCKET_NAME;
      mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
      mockPing.mockResolvedValue("PONG");

      const result = await checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.dependencies.r2.status).toBe("unhealthy");
      expect(result.dependencies.r2.error).toContain("R2_BUCKET_NAME");
    });

    it("returns unhealthy when multiple dependencies fail", async () => {
      mockQueryRaw.mockRejectedValue(new Error("DB down"));
      mockPing.mockRejectedValue(new Error("Redis down"));
      mockSend.mockRejectedValue(new Error("R2 down"));

      const result = await checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.dependencies.postgres.status).toBe("unhealthy");
      expect(result.dependencies.redis.status).toBe("unhealthy");
      expect(result.dependencies.r2.status).toBe("unhealthy");
    });
  });

  describe("timeouts", () => {
    it("marks a dependency as unhealthy when it exceeds 3-second timeout", async () => {
      // Postgres hangs for 4 seconds
      mockQueryRaw.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ "?column?": 1 }]), 4_000)),
      );
      mockPing.mockResolvedValue("PONG");
      mockSend.mockResolvedValue({ Contents: [] });

      const result = await checkHealth();

      expect(result.dependencies.postgres.status).toBe("unhealthy");
      expect(result.dependencies.postgres.error).toContain("timed out");
      expect(result.dependencies.redis.status).toBe("healthy");
    }, 10_000);
  });
});
