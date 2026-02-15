import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  computeThresholdState,
  formatRowCount,
  formatUsageFraction,
  formatPercent,
} from "../usage-utils.js";

describe("Usage utility property tests", () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.3**
   *
   * Property 1: Threshold state computation is correct for all percentages
   * For any non-negative number percentUsed, computeThresholdState returns
   * "normal" when < 80, "warning" when 80–99, "critical" when >= 100.
   */
  describe("Property 1: Threshold state computation is correct for all percentages", () => {
    it("returns 'normal' for percentUsed below 80", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 79.999999, noNaN: true }),
          (percentUsed) => {
            expect(computeThresholdState(percentUsed)).toBe("normal");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("returns 'warning' for percentUsed between 80 and 99 inclusive", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 80, max: 99.999999, noNaN: true }),
          (percentUsed) => {
            expect(computeThresholdState(percentUsed)).toBe("warning");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("returns 'critical' for percentUsed at 100 or above", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 100, max: 1e9, noNaN: true }),
          (percentUsed) => {
            expect(computeThresholdState(percentUsed)).toBe("critical");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 7.1**
   *
   * Property 2: Row count formatting round-trip
   * For any non-negative integer n, parsing the comma-separated string
   * produced by formatRowCount(n) (by removing commas) yields the original n.
   */
  describe("Property 2: Row count formatting round-trip", () => {
    it("round-trips through formatRowCount for any non-negative integer", () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 1_000_000_000 }),
          (n) => {
            const formatted = formatRowCount(n);
            const parsed = Number(formatted.replace(/,/g, ""));
            expect(parsed).toBe(n);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 7.2, 2.1**
   *
   * Property 3: Usage fraction formatting contains both values
   * For any pair of non-negative integers (used, limit), formatUsageFraction
   * produces a string containing formatRowCount(used), formatRowCount(limit),
   * and ending with "rows used".
   */
  describe("Property 3: Usage fraction formatting contains both values", () => {
    it("contains both formatted values and ends with 'rows used'", () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 1_000_000_000 }),
          fc.nat({ max: 1_000_000_000 }),
          (used, limit) => {
            const result = formatUsageFraction(used, limit);
            expect(result).toContain(formatRowCount(used));
            expect(result).toContain(formatRowCount(limit));
            expect(result).toMatch(/rows used$/);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 7.3, 3.5**
   *
   * Property 4: Percentage formatting is correct
   * For any number p, formatPercent(p) produces Math.round(p) + "%".
   */
  describe("Property 4: Percentage formatting is correct", () => {
    it("produces Math.round(p) followed by '%' for any number", () => {
      fc.assert(
        fc.property(
          fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          (p) => {
            expect(formatPercent(p)).toBe(`${Math.round(p)}%`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
