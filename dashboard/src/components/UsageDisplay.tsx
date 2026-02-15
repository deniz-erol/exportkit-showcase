"use client";

import Link from "next/link";
import {
  computeThresholdState,
  formatRowCount,
  formatUsageFraction,
  formatPercent,
} from "@/lib/usage-utils";
import type { ThresholdState } from "@/lib/usage-utils";

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

const BAR_COLORS: Record<ThresholdState, string> = {
  normal: "bg-blue-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

const BG_COLORS: Record<ThresholdState, string> = {
  normal: "bg-blue-50",
  warning: "bg-amber-50",
  critical: "bg-red-50",
};

const TEXT_COLORS: Record<ThresholdState, string> = {
  normal: "text-blue-700",
  warning: "text-amber-700",
  critical: "text-red-700",
};

const BORDER_COLORS: Record<ThresholdState, string> = {
  normal: "border-blue-200",
  warning: "border-amber-200",
  critical: "border-red-200",
};

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function UsageDisplay({
  plan,
  planTier,
  totalRows,
  limit,
  percentUsed,
  overageRows,
  estimatedOverageChargeCents,
  billingPeriod,
}: UsageDisplayProps) {
  // Component implementation omitted for portfolio showcase
  return null;
}
