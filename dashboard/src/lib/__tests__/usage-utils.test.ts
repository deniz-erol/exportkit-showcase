import { describe, it, expect } from "vitest";
import {
  computeThresholdState,
  formatRowCount,
  formatUsageFraction,
  formatPercent,
} from "../usage-utils.js";

/**
 * Unit tests for usage utility edge cases.
 * Validates: Requirements 6.1, 6.2, 6.3, 7.1, 7.2, 7.3
 */

describe("computeThresholdState", () => {
  it('returns "normal" for 0', () => {
    expect(computeThresholdState(0)).toBe("normal");
  });

  it('returns "normal" for 79', () => {
    expect(computeThresholdState(79)).toBe("normal");
  });

  it('returns "normal" for 79.99', () => {
    expect(computeThresholdState(79.99)).toBe("normal");
  });

  it('returns "warning" for 80', () => {
    expect(computeThresholdState(80)).toBe("warning");
  });

  it('returns "warning" for 99', () => {
    expect(computeThresholdState(99)).toBe("warning");
  });

  it('returns "warning" for 99.99', () => {
    expect(computeThresholdState(99.99)).toBe("warning");
  });

  it('returns "critical" for 100', () => {
    expect(computeThresholdState(100)).toBe("critical");
  });

  it('returns "critical" for 101', () => {
    expect(computeThresholdState(101)).toBe("critical");
  });

  it('returns "critical" for very large numbers', () => {
    expect(computeThresholdState(999_999)).toBe("critical");
  });

  it('returns "normal" for negative values (defensive)', () => {
    expect(computeThresholdState(-1)).toBe("normal");
  });
});

describe("formatRowCount", () => {
  it('formats 0 as "0"', () => {
    expect(formatRowCount(0)).toBe("0");
  });

  it('formats 1000 as "1,000"', () => {
    expect(formatRowCount(1000)).toBe("1,000");
  });

  it('formats 1000000 as "1,000,000"', () => {
    expect(formatRowCount(1_000_000)).toBe("1,000,000");
  });

  it("formats very large numbers with commas", () => {
    expect(formatRowCount(1_000_000_000)).toBe("1,000,000,000");
  });

  it("formats small numbers without commas", () => {
    expect(formatRowCount(999)).toBe("999");
  });
});

describe("formatUsageFraction", () => {
  it("formats zero usage", () => {
    expect(formatUsageFraction(0, 10_000)).toBe("0 / 10,000 rows used");
  });

  it("formats typical usage", () => {
    expect(formatUsageFraction(3_200, 10_000)).toBe(
      "3,200 / 10,000 rows used"
    );
  });

  it("formats usage at limit", () => {
    expect(formatUsageFraction(10_000, 10_000)).toBe(
      "10,000 / 10,000 rows used"
    );
  });

  it("formats usage over limit", () => {
    expect(formatUsageFraction(12_000, 10_000)).toBe(
      "12,000 / 10,000 rows used"
    );
  });
});

describe("formatPercent", () => {
  it('formats 0 as "0%"', () => {
    expect(formatPercent(0)).toBe("0%");
  });

  it('rounds 99.4 down to "99%"', () => {
    expect(formatPercent(99.4)).toBe("99%");
  });

  it('rounds 99.5 up to "100%"', () => {
    expect(formatPercent(99.5)).toBe("100%");
  });

  it('formats 100 as "100%"', () => {
    expect(formatPercent(100)).toBe("100%");
  });

  it('formats 150 as "150%"', () => {
    expect(formatPercent(150)).toBe("150%");
  });
});
