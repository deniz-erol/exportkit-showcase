"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, ShieldCheck } from "lucide-react";

/** Current TOS version — bump this when terms change. */
export const CURRENT_TOS_VERSION = "1.0";

interface ReconsentModalProps {
  isOpen: boolean;
  currentTosVersion: string;
  onAccepted: () => void;
}

/**
 * Blocking re-consent modal for TOS updates (GDPR Requirement 4.1).
 * Shown when the customer's tosVersion doesn't match the app's current version.
 * No close button, no escape — must accept to continue.
 */
export default function ReconsentModal({
  isOpen,
  currentTosVersion,
  onAccepted,
}: ReconsentModalProps) {
  // Component implementation omitted for portfolio showcase
  return null;
}
