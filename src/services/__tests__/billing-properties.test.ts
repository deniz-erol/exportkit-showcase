import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { calculateOverage } from "../billing-service.js";

/**
 * Property-Based Test P2: Overage Calculation Correctness
 *
 * For any valid row count and plan configuration, the overage amount equals
 * max(0, totalRows - planLimit) rounded up to the nearest 1000,
 * multiplied by the per-1000 overage price.
 */
describe("P2: Overage Calculation", () => {
  it("overage is zero when usage is at or below the plan limit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }), // planLimit
        fc.integer({ min: 1, max: 100 }),          // overagePer1000Cents
        (planLimit, overagePer1000Cents) => {
          // totalRows <= planLimit
          const totalRows = fc.sample(fc.integer({ min: 0, max: planLimit }), 1)[0];
          const result = calculateOverage(totalRows, planLimit, overagePer1000Cents);

          expect(result.overageRows).toBe(0);
          expect(result.overageIncrements).toBe(0);
          expect(result.overageChargeCents).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("overage rows equals totalRows - planLimit when over limit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),   // planLimit
        fc.integer({ min: 1, max: 5_000_000 }),    // excess rows
        fc.integer({ min: 1, max: 100 }),           // overagePer1000Cents
        (planLimit, excess, overagePer1000Cents) => {
          const totalRows = planLimit + excess;
          const result = calculateOverage(totalRows, planLimit, overagePer1000Cents);

          expect(result.overageRows).toBe(excess);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("overage increments round up to nearest 1000", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),   // planLimit
        fc.integer({ min: 1, max: 5_000_000 }),    // excess rows
        fc.integer({ min: 1, max: 100 }),           // overagePer1000Cents
        (planLimit, excess, overagePer1000Cents) => {
          const totalRows = planLimit + excess;
          const result = calculateOverage(totalRows, planLimit, overagePer1000Cents);

          const expectedIncrements = Math.ceil(excess / 1000);
          expect(result.overageIncrements).toBe(expectedIncrements);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("overage charge equals increments * per-1000 price", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.integer({ min: 1, max: 100 }),
        (planLimit, excess, overagePer1000Cents) => {
          const totalRows = planLimit + excess;
          const result = calculateOverage(totalRows, planLimit, overagePer1000Cents);

          const expectedCharge = Math.ceil(excess / 1000) * overagePer1000Cents;
          expect(result.overageChargeCents).toBe(expectedCharge);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("overage is always non-negative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 100 }),
        (totalRows, planLimit, overagePer1000Cents) => {
          const result = calculateOverage(totalRows, planLimit, overagePer1000Cents);

          expect(result.overageRows).toBeGreaterThanOrEqual(0);
          expect(result.overageIncrements).toBeGreaterThanOrEqual(0);
          expect(result.overageChargeCents).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Specific edge cases
  it("handles exactly 1 row over limit", () => {
    const result = calculateOverage(10_001, 10_000, 10);
    expect(result.overageRows).toBe(1);
    expect(result.overageIncrements).toBe(1); // rounds up to 1 increment
    expect(result.overageChargeCents).toBe(10);
  });

  it("handles exactly 1000 rows over limit", () => {
    const result = calculateOverage(11_000, 10_000, 10);
    expect(result.overageRows).toBe(1000);
    expect(result.overageIncrements).toBe(1);
    expect(result.overageChargeCents).toBe(10);
  });

  it("handles exactly 1001 rows over limit", () => {
    const result = calculateOverage(11_001, 10_000, 10);
    expect(result.overageRows).toBe(1001);
    expect(result.overageIncrements).toBe(2); // rounds up
    expect(result.overageChargeCents).toBe(20);
  });

  it("handles zero total rows", () => {
    const result = calculateOverage(0, 10_000, 10);
    expect(result.overageRows).toBe(0);
    expect(result.overageIncrements).toBe(0);
    expect(result.overageChargeCents).toBe(0);
  });

  it("handles zero plan limit (everything is overage)", () => {
    const result = calculateOverage(500, 0, 10);
    expect(result.overageRows).toBe(500);
    expect(result.overageIncrements).toBe(1);
    expect(result.overageChargeCents).toBe(10);
  });
});
