import { describe, it, expect } from "vitest";
import { validateCronExpression, getNextRunTime } from "../schedule-service.js";

describe("schedule-service", () => {
  describe("validateCronExpression", () => {
    it("accepts hourly cron (0 * * * *)", () => {
      const result = validateCronExpression("0 * * * *");
      expect(result.valid).toBe(true);
      expect(result.nextRunAt).toBeInstanceOf(Date);
    });

    it("accepts daily cron (0 0 * * *)", () => {
      const result = validateCronExpression("0 0 * * *");
      expect(result.valid).toBe(true);
    });

    it("accepts weekly cron (0 0 * * 1)", () => {
      const result = validateCronExpression("0 0 * * 1");
      expect(result.valid).toBe(true);
    });

    it("accepts every 2 hours (0 */2 * * *)", () => {
      const result = validateCronExpression("0 */2 * * *");
      expect(result.valid).toBe(true);
    });

    it("rejects every minute (* * * * *)", () => {
      const result = validateCronExpression("* * * * *");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 1 hour");
    });

    it("rejects every 30 minutes (*/30 * * * *)", () => {
      const result = validateCronExpression("*/30 * * * *");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 1 hour");
    });

    it("rejects every 5 minutes (*/5 * * * *)", () => {
      const result = validateCronExpression("*/5 * * * *");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 1 hour");
    });

    it("rejects every 45 minutes (*/45 * * * *)", () => {
      const result = validateCronExpression("*/45 * * * *");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 1 hour");
    });

    it("rejects invalid cron syntax", () => {
      const result = validateCronExpression("not a cron");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid cron expression");
    });

    it("rejects empty string", () => {
      const result = validateCronExpression("");
      expect(result.valid).toBe(false);
    });
  });

  describe("getNextRunTime", () => {
    it("returns a future date for a valid cron", () => {
      const next = getNextRunTime("0 * * * *");
      expect(next).toBeInstanceOf(Date);
      expect(next!.getTime()).toBeGreaterThan(Date.now());
    });

    it("returns a date after the provided base date", () => {
      const base = new Date("2026-06-15T10:00:00Z");
      const next = getNextRunTime("0 * * * *", base);
      expect(next).toBeInstanceOf(Date);
      expect(next!.getTime()).toBeGreaterThan(base.getTime());
    });

    it("returns null for invalid cron", () => {
      const next = getNextRunTime("invalid");
      expect(next).toBeNull();
    });
  });
});
