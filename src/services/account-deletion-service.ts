/**
 * @module AccountDeletionService
 *
 * Handles GDPR-compliant account deletion (Article 17 — Right to Erasure).
 * Implements transactional deletion of all customer data:
 * - Single Prisma $transaction for all DB deletions (atomicity guarantee)
 * - Audit log anonymization (preserves non-PII fields for audit trail)
 * - R2 export file cleanup (best-effort, after DB commit)
 * - Confirmation email (fire-and-forget after deletion)
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import type { PrismaClient, TeamMember } from "@prisma/client";
import { r2Client } from "../lib/r2/client.js";
import { prisma } from "../db/client.js";
import { emailQueue } from "../queue/notification.js";

/** Prisma interactive transaction client type. */
type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Result of a full account deletion operation.
 */
export interface AccountDeletionResult {
  /** Whether the deletion completed successfully */
  success: boolean;
  /** Number of R2 objects deleted */
  r2ObjectsDeleted: number;
  /** Number of audit logs anonymized */
  auditLogsAnonymized: number;
  /** Errors encountered during R2 cleanup (non-fatal) */
  r2Errors: string[];
}

/**
 * Compute a SHA-256 hash of a value, prefixed with `sha256:`.
 */
function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/**
 * Anonymize audit log entries for a customer within a transaction.
 * Replaces customerId/actorId with SHA-256 hash, clears ipAddress and metadata.
 * Preserves action, targetType, targetId, and createdAt for audit trail.
 *
 * @param tx - Prisma transaction client
 * @param customerId - The customer whose audit logs to anonymize
 * @returns Number of audit log entries anonymized
 */
async function anonymizeAuditLogs(
  tx: TxClient,
  customerId: string
): Promise<number> {
  const hashedId = sha256(customerId);

  // Use $executeRaw to bypass the audit log insert-only policy.
  // This is the one legitimate case where we modify audit logs: GDPR erasure anonymization.
  const count = await (tx as unknown as PrismaClient).$executeRaw`
    UPDATE audit_logs
    SET "customerId" = ${hashedId},
        "actorId" = ${hashedId},
        "ipAddress" = '',
        "metadata" = NULL
    WHERE "customerId" = ${customerId}
  `;

  return count;
}

/**
 * Delete local files for a customer (dev mode).
 *
 * @param prefix - The file prefix to delete under local-uploads/
 * @returns Number of files deleted
 */
async function deleteLocalFiles(prefix: string): Promise<number> {
  const localDir = path.join(process.cwd(), "local-uploads", prefix);
  try {
    const files = await fs.promises.readdir(localDir);
    for (const file of files) {
      await fs.promises.unlink(path.join(localDir, file));
    }
    await fs.promises.rmdir(localDir).catch(() => {});
    return files.length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

/**
 * Delete all R2 objects with a given customer prefix.
 * Objects are stored under `exports/{customerId}/`.
 *
 * @param customerId - The customer whose files to delete
 * @returns Number of objects deleted
 */
export async function deleteCustomerFiles(customerId: string): Promise<number> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Delete all R2 objects under a customer's export prefix with error collection.
 * Best-effort: individual object deletion failures are collected, not thrown.
 *
 * @param customerId - The customer whose R2 objects to delete
 * @returns Object with count of deleted objects and any errors encountered
 */
async function deleteCustomerR2Objects(customerId: string): Promise<{
  deleted: number;
  errors: string[];
}> {
  const prefix = `exports/${customerId}/`;

  if (process.env.STORAGE_DRIVER === "local") {
    try {
      const count = await deleteLocalFiles(prefix);
      return { deleted: count, errors: [] };
    } catch (err) {
      return { deleted: 0, errors: [err instanceof Error ? err.message : String(err)] };
    }
  }

  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    console.error("R2_BUCKET_NAME not set, skipping R2 file cleanup");
    return { deleted: 0, errors: ["R2_BUCKET_NAME not set"] };
  }

  let totalDeleted = 0;
  const errors: string[] = [];
  let continuationToken: string | undefined;

  do {
    let listResponse;
    try {
      listResponse = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
    } catch (err) {
      const msg = `Failed to list R2 objects for ${prefix}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(msg);
      errors.push(msg);
      break;
    }

    const objects = listResponse.Contents;
    if (!objects || objects.length === 0) break;

    for (const obj of objects) {
      if (!obj.Key) continue;
      try {
        await r2Client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: [{ Key: obj.Key }],
              Quiet: true,
            },
          })
        );
        totalDeleted++;
      } catch (err) {
        const msg = `Failed to delete R2 object ${obj.Key}: ${err instanceof Error ? err.message : String(err)}`;
        console.error(msg);
        errors.push(msg);
      }
    }

    continuationToken = listResponse.IsTruncated
      ? listResponse.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return { deleted: totalDeleted, errors };
}

/**
 * Execute full GDPR-compliant account deletion for a customer.
 *
 * Order of operations:
 * 1. Verify customer exists, capture email for confirmation
 * 2. Collect R2 object keys BEFORE the transaction (jobs will be deleted inside)
 * 3. Run single DB transaction:
 *    a. Delete all related records in dependency order
 *    b. Create anonymized audit log entry for the deletion event
 *    c. Anonymize all existing audit logs
 *    d. Delete customer record
 * 4. Delete R2 objects (best-effort, after DB commit)
 * 5. Enqueue deletion confirmation email
 *
 * @param customerId - The customer to delete
 * @returns Deletion result with R2 and audit log counts
 * @throws Error with message "CUSTOMER_NOT_FOUND" if customer does not exist
 */
export async function deleteAccount(
  customerId: string
): Promise<AccountDeletionResult> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}


/**
 * Remove a team member by anonymizing their personal data.
 * Replaces email with a placeholder, clears passwordHash and inviteToken,
 * and sets a removedAt timestamp. The row is preserved for referential
 * integrity and will be hard-deleted by the retention cleanup worker
 * after 30 days.
 *
 * @param teamMemberId - The team member ID to remove
 * @returns The updated team member record
 */
export async function removeTeamMember(teamMemberId: string): Promise<TeamMember> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}
