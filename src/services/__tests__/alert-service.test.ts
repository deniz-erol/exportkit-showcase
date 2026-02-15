/**
 * AlertService Unit Tests (OBS-04)
 *
 * Tests the alert service's monitoring logic for:
 * - BullMQ failed job count threshold (>10 in 5 min)
 * - Queue depth threshold (>1000 pending jobs)
 * - API error rate threshold (>5% in 5 min)
 * - Alert delivery via email (Resend) and webhook (Slack-compatible)
 * - Cooldown logic to prevent alert spam
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the queue module before importing alert-service
vi.mock("../../queue/queues.js", () => ({
  exportQueue: {
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
  },
  webhookQueue: {
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
  },
}));

// Mock the email module
vi.mock("../../lib/email.js", () => ({
  resend: {
    emails: {
      send: vi.fn().mockResolvedValue({ id: "mock-email-id" }),
    },
  },
}));

// Mock the logger
vi.mock("../../lib/logger.js", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

import {
  recordApiRequest,
  getErrorRate,
  recordFailedJob,
  getRecentFailedJobCount,
  checkAlerts,
  sendAlert,
  getTotalQueueDepth,
  startAlertMonitor,
  stopAlertMonitor,
  _resetState,
  ALERT_THRESHOLDS,
} from "../alert-service.js";
import type { AlertPayload } from "../alert-service.js";
import { exportQueue, webhookQueue } from "../../queue/queues.js";
import { resend } from "../../lib/email.js";

describe("AlertService", () => {
  beforeEach(() => {
    _resetState();
    vi.clearAllMocks();
    delete process.env.ALERT_CHANNEL;
    delete process.env.ALERT_EMAIL;
    delete process.env.ALERT_WEBHOOK_URL;
  });

  afterEach(() => {
    _resetState();
    delete process.env.ALERT_CHANNEL;
    delete process.env.ALERT_EMAIL;
    delete process.env.ALERT_WEBHOOK_URL;
  });

  describe("recordApiRequest / getErrorRate", () => {
    it("returns 0 when no requests recorded", () => {
      expect(getErrorRate()).toBe(0);
    });

    it("returns 0% when all requests are successful", () => {
      for (let i = 0; i < 100; i++) {
        recordApiRequest(200);
      }
      expect(getErrorRate()).toBe(0);
    });

    it("returns 100% when all requests are 5xx errors", () => {
      for (let i = 0; i < 10; i++) {
        recordApiRequest(500);
      }
      expect(getErrorRate()).toBe(100);
    });

    it("calculates correct error rate for mixed responses", () => {
      // 5 errors out of 100 = 5%
      for (let i = 0; i < 95; i++) {
        recordApiRequest(200);
      }
      for (let i = 0; i < 5; i++) {
        recordApiRequest(500);
      }
      expect(getErrorRate()).toBe(5);
    });

    it("treats 4xx as non-errors (only 5xx counts)", () => {
      for (let i = 0; i < 50; i++) {
        recordApiRequest(404);
      }
      for (let i = 0; i < 50; i++) {
        recordApiRequest(200);
      }
      expect(getErrorRate()).toBe(0);
    });

    it("treats 503 as an error", () => {
      recordApiRequest(503);
      recordApiRequest(200);
      expect(getErrorRate()).toBe(50);
    });
  });

  describe("recordFailedJob / getRecentFailedJobCount", () => {
    it("returns 0 when no failed jobs recorded", () => {
      expect(getRecentFailedJobCount()).toBe(0);
    });

    it("counts recorded failed jobs", () => {
      recordFailedJob();
      recordFailedJob();
      recordFailedJob();
      expect(getRecentFailedJobCount()).toBe(3);
    });

    it("increments count with each call", () => {
      for (let i = 0; i < 15; i++) {
        recordFailedJob();
      }
      expect(getRecentFailedJobCount()).toBe(15);
    });
  });

  describe("getTotalQueueDepth", () => {
    it("returns sum of waiting counts across queues", async () => {
      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(500);
      vi.mocked(webhookQueue.getWaitingCount).mockResolvedValue(600);

      const depth = await getTotalQueueDepth([exportQueue, webhookQueue]);
      expect(depth).toBe(1100);
    });

    it("returns 0 when all queues are empty", async () => {
      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(0);
      vi.mocked(webhookQueue.getWaitingCount).mockResolvedValue(0);

      const depth = await getTotalQueueDepth([exportQueue, webhookQueue]);
      expect(depth).toBe(0);
    });

    it("handles single queue", async () => {
      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(42);

      const depth = await getTotalQueueDepth([exportQueue]);
      expect(depth).toBe(42);
    });
  });

  describe("sendAlert — email channel", () => {
    const payload: AlertPayload = {
      condition: "FAILED_JOBS_THRESHOLD",
      severity: "critical",
      message: "Too many failed jobs",
      details: { failedCount: 15 },
      timestamp: "2025-01-01T00:00:00.000Z",
    };

    it("sends email when ALERT_CHANNEL is email", async () => {
      process.env.ALERT_CHANNEL = "email";
      process.env.ALERT_EMAIL = "ops@example.com";

      await sendAlert(payload);

      expect(resend.emails.send).toHaveBeenCalledOnce();
      expect(resend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "ops@example.com",
          subject: expect.stringContaining("CRITICAL"),
        }),
      );
    });

    it("defaults to email channel when ALERT_CHANNEL is not set", async () => {
      process.env.ALERT_EMAIL = "ops@example.com";

      await sendAlert(payload);

      expect(resend.emails.send).toHaveBeenCalledOnce();
    });

    it("skips email when ALERT_EMAIL is not configured", async () => {
      process.env.ALERT_CHANNEL = "email";
      // No ALERT_EMAIL set

      await sendAlert(payload);

      expect(resend.emails.send).not.toHaveBeenCalled();
    });
  });

  describe("sendAlert — webhook channel", () => {
    const payload: AlertPayload = {
      condition: "QUEUE_DEPTH_THRESHOLD",
      severity: "warning",
      message: "Queue depth too high",
      details: { depth: 1500 },
      timestamp: "2025-01-01T00:00:00.000Z",
    };

    it("sends webhook when ALERT_CHANNEL is webhook", async () => {
      process.env.ALERT_CHANNEL = "webhook";
      process.env.ALERT_WEBHOOK_URL = "https://hooks.slack.com/test";

      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      await sendAlert(payload);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/test",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      // Verify Slack block format
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.blocks).toBeDefined();
      expect(body.blocks[0].type).toBe("section");
      expect(body.text).toContain("Queue depth too high");

      vi.unstubAllGlobals();
    });

    it("skips webhook when ALERT_WEBHOOK_URL is not configured", async () => {
      process.env.ALERT_CHANNEL = "webhook";
      // No ALERT_WEBHOOK_URL set

      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      await sendAlert(payload);

      expect(mockFetch).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });

  describe("checkAlerts", () => {
    it("sends alert when failed job count exceeds threshold", async () => {
      process.env.ALERT_EMAIL = "ops@example.com";

      // Record more than 10 failed jobs
      for (let i = 0; i < 12; i++) {
        recordFailedJob();
      }

      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(0);
      vi.mocked(webhookQueue.getWaitingCount).mockResolvedValue(0);

      await checkAlerts();

      expect(resend.emails.send).toHaveBeenCalledOnce();
      expect(resend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("FAILED_JOBS_THRESHOLD"),
        }),
      );
    });

    it("does not alert when failed job count is at threshold (not exceeded)", async () => {
      process.env.ALERT_EMAIL = "ops@example.com";

      // Record exactly 10 failed jobs (threshold is >10)
      for (let i = 0; i < 10; i++) {
        recordFailedJob();
      }

      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(0);
      vi.mocked(webhookQueue.getWaitingCount).mockResolvedValue(0);

      await checkAlerts();

      expect(resend.emails.send).not.toHaveBeenCalled();
    });

    it("sends alert when queue depth exceeds threshold", async () => {
      process.env.ALERT_EMAIL = "ops@example.com";

      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(800);
      vi.mocked(webhookQueue.getWaitingCount).mockResolvedValue(300);

      await checkAlerts();

      expect(resend.emails.send).toHaveBeenCalledOnce();
      expect(resend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("QUEUE_DEPTH_THRESHOLD"),
        }),
      );
    });

    it("does not alert when queue depth is at threshold (not exceeded)", async () => {
      process.env.ALERT_EMAIL = "ops@example.com";

      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(500);
      vi.mocked(webhookQueue.getWaitingCount).mockResolvedValue(500);

      await checkAlerts();

      expect(resend.emails.send).not.toHaveBeenCalled();
    });

    it("sends alert when error rate exceeds threshold", async () => {
      process.env.ALERT_EMAIL = "ops@example.com";

      // 6 errors out of 100 = 6% (above 5% threshold)
      for (let i = 0; i < 94; i++) {
        recordApiRequest(200);
      }
      for (let i = 0; i < 6; i++) {
        recordApiRequest(500);
      }

      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(0);
      vi.mocked(webhookQueue.getWaitingCount).mockResolvedValue(0);

      await checkAlerts();

      expect(resend.emails.send).toHaveBeenCalledOnce();
      expect(resend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("ERROR_RATE_THRESHOLD"),
        }),
      );
    });

    it("does not alert when error rate is at threshold (not exceeded)", async () => {
      process.env.ALERT_EMAIL = "ops@example.com";

      // 5 errors out of 100 = exactly 5% (threshold is >5%)
      for (let i = 0; i < 95; i++) {
        recordApiRequest(200);
      }
      for (let i = 0; i < 5; i++) {
        recordApiRequest(500);
      }

      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(0);
      vi.mocked(webhookQueue.getWaitingCount).mockResolvedValue(0);

      await checkAlerts();

      expect(resend.emails.send).not.toHaveBeenCalled();
    });

    it("respects cooldown — does not re-alert same condition within 15 minutes", async () => {
      process.env.ALERT_EMAIL = "ops@example.com";

      for (let i = 0; i < 12; i++) {
        recordFailedJob();
      }

      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(0);
      vi.mocked(webhookQueue.getWaitingCount).mockResolvedValue(0);

      // First check triggers alert
      await checkAlerts();
      expect(resend.emails.send).toHaveBeenCalledOnce();

      vi.mocked(resend.emails.send).mockClear();

      // Second check within cooldown should NOT trigger
      await checkAlerts();
      expect(resend.emails.send).not.toHaveBeenCalled();
    });

    it("can trigger multiple different alerts in one check", async () => {
      process.env.ALERT_EMAIL = "ops@example.com";

      // Trigger failed jobs alert
      for (let i = 0; i < 12; i++) {
        recordFailedJob();
      }

      // Trigger queue depth alert
      vi.mocked(exportQueue.getWaitingCount).mockResolvedValue(600);
      vi.mocked(webhookQueue.getWaitingCount).mockResolvedValue(500);

      // Trigger error rate alert
      for (let i = 0; i < 90; i++) {
        recordApiRequest(200);
      }
      for (let i = 0; i < 10; i++) {
        recordApiRequest(500);
      }

      await checkAlerts();

      // All three alerts should fire
      expect(resend.emails.send).toHaveBeenCalledTimes(3);
    });
  });

  describe("startAlertMonitor / stopAlertMonitor", () => {
    it("starts and stops without error", () => {
      startAlertMonitor(60000);
      stopAlertMonitor();
    });

    it("is idempotent — calling start twice does not create duplicate intervals", () => {
      startAlertMonitor(60000);
      startAlertMonitor(60000); // should be a no-op
      stopAlertMonitor();
    });

    it("stop is safe to call when not running", () => {
      stopAlertMonitor(); // should not throw
    });
  });

  describe("ALERT_THRESHOLDS", () => {
    it("has correct threshold values", () => {
      expect(ALERT_THRESHOLDS.FAILED_JOBS_MAX).toBe(10);
      expect(ALERT_THRESHOLDS.QUEUE_DEPTH_MAX).toBe(1000);
      expect(ALERT_THRESHOLDS.ERROR_RATE_PERCENT).toBe(5);
      expect(ALERT_THRESHOLDS.WINDOW_MS).toBe(5 * 60 * 1000);
      expect(ALERT_THRESHOLDS.COOLDOWN_MS).toBe(15 * 60 * 1000);
    });
  });
});
