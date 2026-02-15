"use client";

import { Activity } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function RealtimeIndicator({ isConnected }: { isConnected: boolean }) {
  // Component implementation omitted for portfolio showcase
  return null;
}
