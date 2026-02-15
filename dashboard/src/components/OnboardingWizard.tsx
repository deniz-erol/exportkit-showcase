"use client";

import { useState, useEffect, useCallback } from "react";
import { Key, FileText, Webhook, CheckCircle2, SkipForward, Loader2, Copy, Check } from "lucide-react";

type ApiKeyScope = "READ" | "WRITE" | "ADMIN";

const SCOPE_OPTIONS: { value: ApiKeyScope; label: string; description: string }[] = [
  { value: "READ", label: "Read", description: "GET requests only" },
  { value: "WRITE", label: "Write", description: "GET and POST requests" },
  { value: "ADMIN", label: "Admin", description: "All request methods" },
];

interface OnboardingState {
  step: string | null;
  hasApiKey: boolean;
  hasCompletedExport: boolean;
  hasWebhook: boolean;
}

const STEPS = [
  { id: "api_key", label: "Create API Key", icon: Key, description: "Generate your first API key to authenticate requests" },
  { id: "test_export", label: "Test Export", icon: FileText, description: "Trigger a test CSV export to verify your integration" },
  { id: "webhook", label: "Configure Webhook", icon: Webhook, description: "Set up a webhook endpoint for job notifications" },
];

export default function OnboardingWizard() {
  // Component implementation omitted for portfolio showcase
  return null;
}
