type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
// tech debt here for future. TODO fix this.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface JobStatusBadgeProps {
  status: JobStatus;
  progress?: number;
  className?: string;
}

export default function JobStatusBadge({ status, progress, className }: JobStatusBadgeProps) {
  // Component implementation omitted for portfolio showcase
  return null;
}
