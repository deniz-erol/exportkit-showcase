import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock logger
vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Prisma client
const mockFindMany = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: {
    customer: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

// Mock notification queue
const mockQueueAdd = vi.fn();

vi.mock("../../queue/notification.js", () => ({
  notificationQueue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
  },
}));

const { notifySubProcessorChange } = await import("../sub-processor-service.js");

describe("Sub-Processor Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("notifySubProcessorChange", () => {
    it("should queue notifications for opted-in customers", async () => {
      // Arrange
      const mockCustomers = [
        {
          id: "cust1",
          name: "Customer One",
          email: "customer1@example.com",
          brandColor: "#0070f3",
          brandLogo: "https://example.com/logo.png",
          brandFooter: "Custom footer",
        },
        {
          id: "cust2",
          name: "Customer Two",
          email: "customer2@example.com",
          brandColor: null,
          brandLogo: null,
          brandFooter: null,
        },
      ];

      mockFindMany.mockResolvedValue(mockCustomers);
      mockQueueAdd.mockResolvedValue({});

      const changeDescription = "We are adding Acme Corp as a new sub-processor for analytics";
      const effectiveDate = "2026-03-15";

      // Act
      const result = await notifySubProcessorChange(changeDescription, effectiveDate);

      // Assert
      expect(result).toBe(2);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          subProcessorOptIn: true,
          emailVerified: { not: null },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          brandColor: true,
          brandLogo: true,
          brandFooter: true,
        },
      });

      expect(mockQueueAdd).toHaveBeenCalledTimes(2);
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "send-email",
        expect.objectContaining({
          type: "sub-processor-change",
          to: "customer1@example.com",
          customerName: "Customer One",
          changeDescription,
          effectiveDate,
          branding: {
            color: "#0070f3",
            logo: "https://example.com/logo.png",
            footer: "Custom footer",
          },
        }),
        expect.any(Object)
      );
    });

    it("should return 0 when no customers are opted in", async () => {
      // Arrange
      mockFindMany.mockResolvedValue([]);

      // Act
      const result = await notifySubProcessorChange(
        "Test change",
        "2026-03-15"
      );

      // Assert
      expect(result).toBe(0);
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it("should handle queue errors gracefully", async () => {
      // Arrange
      const mockCustomers = [
        {
          id: "cust1",
          name: "Customer One",
          email: "customer1@example.com",
          brandColor: null,
          brandLogo: null,
          brandFooter: null,
        },
      ];

      mockFindMany.mockResolvedValue(mockCustomers);
      mockQueueAdd.mockRejectedValue(new Error("Queue error"));

      // Act
      const result = await notifySubProcessorChange(
        "Test change",
        "2026-03-15"
      );

      // Assert
      expect(result).toBe(0); // Should return 0 when all queue operations fail
    });
  });
});
