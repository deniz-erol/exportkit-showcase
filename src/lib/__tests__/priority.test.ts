/**
 * Unit tests for priority queue mapping (ENT-02).
 *
 * Verifies that plan tiers map to correct BullMQ priority values
 * and that the priority utility handles all tier values correctly.
 *
 * **Validates: Requirements ENT-02 (1, 2, 3)**
 */

import { describe, it, expect } from "vitest";
import { getPriorityForPlan, PLAN_PRIORITY_MAP, DEFAULT_PRIORITY } from "../priority.js";

describe("getPriorityForPlan", () => {
  it("maps Scale tier to highest priority (1)", () => {
    expect(getPriorityForPlan("SCALE")).toBe(1);
  });

  it("maps Pro tier to medium priority (5)", () => {
    expect(getPriorityForPlan("PRO")).toBe(5);
  });

  it("maps Free tier to lowest priority (10)", () => {
    expect(getPriorityForPlan("FREE")).toBe(10);
  });

  it("Scale priority is lower number (higher priority) than Pro", () => {
    expect(getPriorityForPlan("SCALE")).toBeLessThan(getPriorityForPlan("PRO"));
  });

  it("Pro priority is lower number (higher priority) than Free", () => {
    expect(getPriorityForPlan("PRO")).toBeLessThan(getPriorityForPlan("FREE"));
  });
});

describe("PLAN_PRIORITY_MAP", () => {
  it("contains entries for all three plan tiers", () => {
    expect(PLAN_PRIORITY_MAP).toHaveProperty("FREE");
    expect(PLAN_PRIORITY_MAP).toHaveProperty("PRO");
    expect(PLAN_PRIORITY_MAP).toHaveProperty("SCALE");
  });

  it("all priority values are positive integers", () => {
    for (const value of Object.values(PLAN_PRIORITY_MAP)) {
      expect(value).toBeGreaterThan(0);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("DEFAULT_PRIORITY", () => {
  it("equals the Free tier priority", () => {
    expect(DEFAULT_PRIORITY).toBe(PLAN_PRIORITY_MAP.FREE);
  });
});
