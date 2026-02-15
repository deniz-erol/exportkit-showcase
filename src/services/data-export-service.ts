/**
 * @module DataExportService
 *
 * Handles GDPR-compliant data portability (Article 20 — Right to Data Portability).
 * Assembles all personal data held about a customer into a JSON archive,
 * uploads it to R2, and returns a signed download URL (24h expiry).
 *
 * Sensitive security material is explicitly excluded:
 * - passwordHash, keyHash, webhookSecret
 * - OAuth tokens (refresh_token, access_token, id_token)
 * - inviteToken, passwordHash on team members
 */

import prisma from "../db/client.js";
import { generateDownloadUrl } from "./storage-service.js";
import { Readable } from "node:stream";
import { uploadStream } from "./storage-service.js";

/** Result returned after a successful data export generation. */
export interface DataExportResult {
  /** Signed download URL (24h expiry) */
  downloadUrl: string;
  /** URL expiry timestamp (ISO 8601) */
  expiresAt: string;
  /** Size of the archive in bytes */
  fileSize: number;
}

/** Shape of the full customer data archive JSON. */
export interface CustomerDataArchive {
  exportedAt: string;
  profile: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    emailNotifications: boolean;
    marketingEmails: boolean;
    brandColor: string | null;
    brandLogo: string | null;
    brandFooter: string | null;
    retentionDays: number;
    tosAcceptedAt: string | null;
    tosVersion: string | null;
  };
  subscription: {
    planName: string;
    status: string;
    currentPeriodEnd: string;
  } | null;
  apiKeys: Array<{
    name: string;
    keyPrefix: string;
    scope: string;
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
  }>;
  jobs: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  }>;
  usageRecords: Array<{
    jobId: string;
    rowCount: number;
    billingPeriod: string;
    recordedAt: string;
  }>;
  auditLogs: Array<{
    action: string;
    targetType: string;
    targetId: string;
    createdAt: string;
  }>;
  webhookDeliveries: Array<{
    event: string;
    status: string;
    createdAt: string;
    deliveredAt: string | null;
  }>;
  teamMembers: Array<{
    email: string;
    role: string;
    invitedAt: string;
    acceptedAt: string | null;
  }>;
  exportSchedules: Array<{
    name: string;
    cronExpr: string;
    exportType: string;
    isActive: boolean;
    createdAt: string;
  }>;
}

/** 24 hours in seconds for signed URL expiry. */
const EXPORT_URL_EXPIRY_SECONDS = 86400;

/**
 * Generate a GDPR data export archive for a customer.
 *
 * Assembles all personal data across every data category into a
 * `CustomerDataArchive` JSON object, uploads it to R2, and returns
 * a signed download URL valid for 24 hours.
 *
 * Excludes sensitive security material: passwordHash, keyHash,
 * webhookSecret, OAuth tokens, inviteToken.
 *
 * @param customerId - The customer whose data to export
 * @returns Signed download URL, expiry timestamp, and file size
 * @throws Error if customer not found, assembly fails, or upload fails
 */
export async function generateDataExport(
  customerId: string
): Promise<DataExportResult> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}
