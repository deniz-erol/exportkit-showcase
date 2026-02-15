import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import fc from "fast-check";
import UsageDisplay from "../UsageDisplay.js";
import { computeThresholdState } from "@/lib/usage-utils";

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

interface UsageDisplayProps {
  plan: string;
  planTier: string;
  totalRows: number;
  limit: number;
  percentUsed: number;
  overageRows: number;
  estimatedOverageChargeCents: number;
  billingPeriod: string;
}

function makeProps(overrides?: Partial<UsageDisplayProps>): UsageDisplayProps {
  return {
    plan: "Free",
    planTier: "FREE",
    totalRows: 3200,
    limit: 10000,
    percentUsed: 32,
    overageRows: 0,
    estimatedOverageChargeCents: 0,
    billingPeriod: "January 2024",
    ...overrides,
  };
}

describe("UsageDisplay", () => {
  describe("Rendering — threshold states", () => {
    it("renders plan name and billing period", () => {
      render(<UsageDisplay {...makeProps()} />);
      expect(screen.getByText("Free")).toBeDefined();
      expect(screen.getByText("January 2024")).toBeDefined();
    });

    it("renders usage fraction text", () => {
      render(<UsageDisplay {...makeProps()} />);
      expect(screen.getByTestId("usage-fraction").textContent).toBe("3,200 / 10,000 rows used");
    });

    it("renders percent label", () => {
      render(<UsageDisplay {...makeProps({ percentUsed: 32 })} />);
      expect(screen.getByTestId("percent-label").textContent).toBe("32%");
    });
  });

  describe("Normal state — Requirement 4.4", () => {
    it("shows no threshold message, no CTA, no overage notice", () => {
      render(<UsageDisplay {...makeProps({ percentUsed: 50, planTier: "FREE" })} />);
      expect(screen.queryByTestId("threshold-message")).toBeNull();
      expect(screen.queryByTestId("upgrade-cta")).toBeNull();
      expect(screen.queryByTestId("overage-notice")).toBeNull();
    });
  });

  describe("Warning state — Requirements 4.1, 4.3", () => {
    it("shows warning message for FREE tier", () => {
      render(<UsageDisplay {...makeProps({ percentUsed: 85, planTier: "FREE" })} />);
      const msg = screen.getByTestId("threshold-message");
      expect(msg.textContent).toContain("approaching your usage limit");
    });

    it("shows Upgrade CTA for FREE tier at warning", () => {
      render(<UsageDisplay {...makeProps({ percentUsed: 85, planTier: "FREE" })} />);
      const cta = screen.getByTestId("upgrade-cta");
      expect(cta).toBeDefined();
      expect(cta.getAttribute("href")).toBe("/dashboard/settings/billing");
    });

    it("shows warning message but no CTA for PRO tier", () => {
      render(<UsageDisplay {...makeProps({ percentUsed: 90, planTier: "PRO" })} />);
      expect(screen.getByTestId("threshold-message").textContent).toContain("approaching");
      expect(screen.queryByTestId("upgrade-cta")).toBeNull();
    });

    it("shows warning message but no CTA for SCALE tier", () => {
      render(<UsageDisplay {...makeProps({ percentUsed: 95, planTier: "SCALE" })} />);
      expect(screen.getByTestId("threshold-message").textContent).toContain("approaching");
      expect(screen.queryByTestId("upgrade-cta")).toBeNull();
    });
  });

  describe("Critical state — Requirements 4.2, 4.3, 4.5", () => {
    it("shows critical message for FREE tier", () => {
      render(<UsageDisplay {...makeProps({ percentUsed: 100, planTier: "FREE", totalRows: 10000, limit: 10000 })} />);
      const msg = screen.getByTestId("threshold-message");
      expect(msg.textContent).toContain("reached your usage limit");
    });

    it("shows Upgrade CTA for FREE tier at critical", () => {
      render(<UsageDisplay {...makeProps({ percentUsed: 100, planTier: "FREE" })} />);
      expect(screen.getByTestId("upgrade-cta")).toBeDefined();
    });

    it("shows critical message and overage notice for PRO tier", () => {
      render(
        <UsageDisplay
          {...makeProps({
            percentUsed: 120,
            planTier: "PRO",
            totalRows: 12000,
            limit: 10000,
            overageRows: 2000,
            estimatedOverageChargeCents: 500,
          })}
        />
      );
      expect(screen.getByTestId("threshold-message").textContent).toContain("reached your usage limit");
      const overage = screen.getByTestId("overage-notice");
      expect(overage.textContent).toContain("2,000 overage rows");
      expect(overage.textContent).toContain("5.00");
      expect(screen.queryByTestId("upgrade-cta")).toBeNull();
    });

    it("shows critical message and overage notice for SCALE tier", () => {
      render(
        <UsageDisplay
          {...makeProps({
            percentUsed: 150,
            planTier: "SCALE",
            totalRows: 150000,
            limit: 100000,
            overageRows: 50000,
            estimatedOverageChargeCents: 2500,
          })}
        />
      );
      expect(screen.getByTestId("threshold-message")).toBeDefined();
      expect(screen.getByTestId("overage-notice")).toBeDefined();
      expect(screen.queryByTestId("upgrade-cta")).toBeNull();
    });

    it("does not show overage notice for paid tier when overageRows is 0", () => {
      render(
        <UsageDisplay
          {...makeProps({
            percentUsed: 100,
            planTier: "PRO",
            totalRows: 10000,
            limit: 10000,
            overageRows: 0,
          })}
        />
      );
      expect(screen.getByTestId("threshold-message")).toBeDefined();
      expect(screen.queryByTestId("overage-notice")).toBeNull();
    });
  });

  describe("Property 5: Threshold-based messaging correctness", () => {
    /**
     * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
     *
     * For any UsageDisplayProps with a valid planTier and percentUsed:
     * - normal: no threshold message, no CTA, no overage notice
     * - warning + FREE: warning message visible, Upgrade CTA visible
     * - warning + PRO/SCALE: warning message visible, no Upgrade CTA
     * - critical + FREE: critical message visible, Upgrade CTA visible
     * - critical + PRO/SCALE: critical message visible, overage notice visible, no Upgrade CTA
     */
    const tierArb = fc.constantFrom("FREE", "PRO", "SCALE");
    const percentArb = fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true });
    const rowArb = fc.integer({ min: 0, max: 10_000_000 });
    const centsArb = fc.integer({ min: 0, max: 1_000_000 });

    const propsArb = fc.record({
      planTier: tierArb,
      percentUsed: percentArb,
      totalRows: rowArb,
      limit: rowArb,
      overageRows: rowArb,
      estimatedOverageChargeCents: centsArb,
    });

    it("renders correct messaging for any tier/percentage combination", () => {
      fc.assert(
        fc.property(propsArb, ({ planTier, percentUsed, totalRows, limit, overageRows, estimatedOverageChargeCents }) => {
          const props = makeProps({
            planTier,
            percentUsed,
            totalRows,
            limit,
            overageRows,
            estimatedOverageChargeCents,
          });

          const { unmount } = render(<UsageDisplay {...props} />);
          const state = computeThresholdState(percentUsed);

          const thresholdMsg = screen.queryByTestId("threshold-message");
          const upgradeCta = screen.queryByTestId("upgrade-cta");
          const overageNotice = screen.queryByTestId("overage-notice");

          if (state === "normal") {
            expect(thresholdMsg).toBeNull();
            expect(upgradeCta).toBeNull();
            expect(overageNotice).toBeNull();
          } else if (state === "warning") {
            expect(thresholdMsg).not.toBeNull();
            expect(thresholdMsg!.textContent).toContain("approaching");
            if (planTier === "FREE") {
              expect(upgradeCta).not.toBeNull();
            } else {
              expect(upgradeCta).toBeNull();
            }
            // No overage notice at warning
            expect(overageNotice).toBeNull();
          } else {
            // critical
            expect(thresholdMsg).not.toBeNull();
            expect(thresholdMsg!.textContent).toContain("reached");
            if (planTier === "FREE") {
              expect(upgradeCta).not.toBeNull();
              expect(overageNotice).toBeNull();
            } else {
              // PRO or SCALE
              expect(upgradeCta).toBeNull();
              if (overageRows > 0) {
                expect(overageNotice).not.toBeNull();
              } else {
                expect(overageNotice).toBeNull();
              }
            }
          }

          unmount();
        }),
        { numRuns: 150 }
      );
    });
  });

  describe("Property 6: Progress bar width is capped at 100%", () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * For any non-negative percentUsed, the progress bar fill width
     * SHALL equal min(percentUsed, 100) percent.
     */
    it("progress bar width equals min(percentUsed, 100)%", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
          (percentUsed) => {
            const props = makeProps({ percentUsed });
            const { unmount } = render(<UsageDisplay {...props} />);

            const bar = screen.getByTestId("progress-bar");
            const expectedWidth = `${Math.min(percentUsed, 100)}%`;
            expect(bar.style.width).toBe(expectedWidth);

            unmount();
          }
        ),
        { numRuns: 150 }
      );
    });
  });
});
