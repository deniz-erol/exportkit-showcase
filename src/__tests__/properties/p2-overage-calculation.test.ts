import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { calculateOverage } from "../../services/billing-service.js";

/**
 * **Validates: Requirements BILL-04 (7.2)**
 *
 * Property P2: Overage Calculation Correctness
 * For any valid row count and plan configuration, the overage amount equals
 * max(0, totalRows - planLimit) rounded up to the nearest 1000,
 * multiplied by the per-1000 overage price.
 */
describe("P2: Overage Calculation Correctness", () => {
  it("overage equals max(0, totalRows - planLimit) rounded up to nearest 1000, times per-1000 price", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),       // totalRows
        fc.integer({ min: 1, max: 10_000_000 }),       // planLimit (at least 1)
        fc.integer({ min: 0, max: 10_000 }),            // overagePer1000Cents
        (totalRows, planLimit, overagePer1000Cents) => {
          const result = calculateOverage(totalRows, planLimit, overagePer1000Cents);

          // Expected overage rows
          const expectedOverageRows = Math.max(0, totalRows - planLimit);
          expect(result.overageRows).toBe(expectedOverageRows);

          // Expected increments: ceil(overageRows / 1000), or 0 if no overage
          const expectedIncrements =
            expectedOverageRows > 0 ? Math.ceil(expectedOverageRows / 1000) : 0;
          expect(result.overageIncrements).toBe(expectedIncrements);

          // Expected charge
          const expectedCharge = expectedIncrements * overagePer1000Cents;
          expect(result.overageChargeCents).toBe(expectedCharge);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("no overage when totalRows is at or below planLimit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),       // planLimit
        fc.integer({ min: 0, max: 10_000 }),            // overagePer1000Cents
        (planLimit, overagePer1000Cents) => {
          // totalRows <= planLimit
          const totalRows = fc.sample(fc.integer({ min: 0, max: planLimit }), 1)[0];
          const result = calculateOverage(totalRows, planLimit, overagePer1000Cents);

          expect(result.overageRows).toBe(0);
          expect(result.overageIncrements).toBe(0);
          expect(result.overageChargeCents).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("overage increments are always a positive integer when totalRows exceeds planLimit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),       // planLimit
        fc.integer({ min: 1, max: 5_000_000 }),         // excess rows (at least 1)
        fc.integer({ min: 0, max: 10_000 }),            // overagePer1000Cents
        (planLimit, excessRows, overagePer1000Cents) => {
          const totalRows = planLimit + excessRows;
          const result = calculateOverage(totalRows, planLimit, overagePer1000Cents);

          expect(result.overageRows).toBe(excessRows);
          expect(result.overageIncrements).toBeGreaterThan(0);
          expect(Number.isInteger(result.overageIncrements)).toBe(true);
          // Increments * 1000 should always be >= overageRows (rounding up)
          expect(result.overageIncrements * 1000).toBeGreaterThanOrEqual(result.overageRows);
        }
      ),
      { numRuns: 100 }
    );
  });
});
