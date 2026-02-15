/**
 * @module AuditService
 *
 * INSERT-ONLY POLICY: The audit_logs table is strictly append-only.
 * This service intentionally exposes only `log` (create) and `query` (read)
 * methods. No update, upsert, or delete operations are permitted on audit
 * log records at the application level.
 *
 * This policy is enforced at three layers:
 * 1. Service API — only `log` and `query` are exported (no update/delete methods)
 * 2. Prisma middleware — rejects update, updateMany, upsert, delete, deleteMany
 *    operations on the AuditLog model at runtime (see src/db/client.ts)
 * 3. Schema documentation — the Prisma schema marks the model as insert-only
 *
 * Rationale: Audit logs must be immutable to satisfy compliance requirements
 * (SEC-01) and support incident investigation. Tampering with audit records
 * would undermine the integrity of the entire audit trail.
 */

import { prisma } from "../db/client.js";
import type { AuditLog } from "@prisma/client";

/**
 * Audit actions representing security-relevant events in the system.
 */
export type AuditAction =
  | "api_key.create"
  | "api_key.revoke"
  | "login"
  | "password.change"
  | "plan.change"
  | "webhook.update"
  | "branding.update"
  | "account.delete"
  | "account.delete_scheduled"
  | "account.export_data";

/**
 * Input for creating an audit log entry.
 */
export interface AuditEntry {
  customerId: string;
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  ipAddress: string;
  timestamp?: Date;
}

/**
 * Filters for querying audit log entries.
 */
export interface AuditFilters {
  startDate?: Date;
  endDate?: Date;
  action?: AuditAction;
  page?: number;
  pageSize?: number;
}

/**
 * Paginated result wrapper for audit log queries.
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

/**
 * Create an immutable audit log entry for a security-relevant action.
 * Audit logs are insert-only — no updates or deletes are permitted.
 *
 * @param entry - The audit entry to record
 * @returns The created audit log record
 */
export async function log(entry: AuditEntry): Promise<AuditLog> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Query audit log entries for a customer with pagination and optional filters.
 * Results are ordered by creation date descending (newest first).
 *
 * @param customerId - The customer whose audit logs to query
 * @param filters - Optional filters for date range, action type, and pagination
 * @returns Paginated audit log entries
 */
export async function query(
  customerId: string,
  filters: AuditFilters = {}
): Promise<PaginatedResult<AuditLog>> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

export const auditService = {
  log,
  query,
};

export default auditService;
