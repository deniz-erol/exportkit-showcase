/**
 * Schedule service for managing recurring export schedules.
 *
 * Provides CRUD operations for ExportSchedule records and cron expression
 * validation with a minimum 1-hour interval enforcement. Uses `cron-parser`
 * (available via BullMQ dependency) for cron expression parsing.
 */

import { prisma } from "../db/client.js";
import type { ExportSchedule } from "@prisma/client";
import cronParser from "cron-parser";

/**
 * Options for creating a new export schedule.
 */
export interface CreateScheduleOptions {
  customerId: string;
  name: string;
  cronExpr: string;
  exportType: "csv" | "json" | "xlsx";
  payload: Record<string, unknown>;
}

/**
 * Options for updating an existing export schedule.
 */
export interface UpdateScheduleOptions {
  name?: string;
  cronExpr?: string;
  exportType?: "csv" | "json" | "xlsx";
  payload?: Record<string, unknown>;
  isActive?: boolean;
}

/**
 * Options for listing schedules with pagination.
 */
export interface ListSchedulesOptions {
  limit?: number;
  offset?: number;
}

/**
 * Result of listing schedules with pagination metadata.
 */
export interface ListSchedulesResult {
  schedules: ExportSchedule[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Validate a cron expression and enforce the minimum 1-hour interval.
 *
 * Parses the cron expression using cron-parser, then checks that the
 * interval between the first two occurrences is at least 60 minutes.
 *
 * @param cronExpr - Cron expression string (5-field format)
 * @returns Object with `valid` flag, optional `error` message, and optional `nextRunAt`
 */
export function validateCronExpression(cronExpr: string): {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
} {
  try {
    const interval = cronParser.parseExpression(cronExpr);
    const first = interval.next().toDate();
    const second = interval.next().toDate();

    const diffMs = second.getTime() - first.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes < 60) {
      return {
        valid: false,
        error: `Cron interval must be at least 1 hour. Got ~${Math.round(diffMinutes)} minutes.`,
      };
    }

    // Reparse to get a fresh next run time from now
    const freshInterval = cronParser.parseExpression(cronExpr);
    const nextRunAt = freshInterval.next().toDate();

    return { valid: true, nextRunAt };
  } catch {
    return { valid: false, error: "Invalid cron expression" };
  }
}

/**
 * Calculate the next run time from a cron expression relative to a base date.
 *
 * @param cronExpr - Valid cron expression
 * @param from - Base date to calculate from (defaults to now)
 * @returns Next run date, or null if parsing fails
 */
export function getNextRunTime(cronExpr: string, from?: Date): Date | null {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}


/**
 * Create a new export schedule.
 *
 * Validates the cron expression and enforces the minimum 1-hour interval
 * before persisting. Calculates the initial `nextRunAt` from the cron expression.
 *
 * @param options - Schedule creation options
 * @returns The created ExportSchedule record
 * @throws Error if cron expression is invalid or interval is less than 1 hour
 */
export async function createSchedule(
  options: CreateScheduleOptions
): Promise<ExportSchedule> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * List export schedules for a customer with pagination.
 *
 * @param customerId - Customer ID to filter by
 * @param options - Pagination options
 * @returns Paginated list of schedules
 */
export async function getSchedules(
  customerId: string,
  options: ListSchedulesOptions = {}
): Promise<ListSchedulesResult> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Get a single export schedule by ID, scoped to a customer.
 *
 * @param scheduleId - Schedule ID
 * @param customerId - Customer ID for ownership verification
 * @returns The schedule, or null if not found
 */
export async function getScheduleById(
  scheduleId: string,
  customerId: string
): Promise<ExportSchedule | null> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Update an existing export schedule.
 *
 * If the cron expression is changed, re-validates it and recalculates `nextRunAt`.
 * If `isActive` is toggled on, recalculates `nextRunAt` from the current cron expression.
 *
 * @param scheduleId - Schedule ID to update
 * @param customerId - Customer ID for ownership verification
 * @param updates - Fields to update
 * @returns The updated schedule, or null if not found
 * @throws Error if new cron expression is invalid or interval is less than 1 hour
 */
export async function updateSchedule(
  scheduleId: string,
  customerId: string,
  updates: UpdateScheduleOptions
): Promise<ExportSchedule | null> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Delete an export schedule.
 *
 * @param scheduleId - Schedule ID to delete
 * @param customerId - Customer ID for ownership verification
 * @returns True if deleted, false if not found
 */
export async function deleteSchedule(
  scheduleId: string,
  customerId: string
): Promise<boolean> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Find all active schedules that are due to run (nextRunAt <= now).
 *
 * Used by the schedule worker to find schedules that need to trigger.
 *
 * @returns Array of due schedules
 */
export async function getDueSchedules(): Promise<ExportSchedule[]> {
  // Implementation details omitted for portfolio showcase
  throw new Error("See private repository for implementation");
}

/**
 * Mark a schedule as having run and calculate the next run time.
 *
 * @param scheduleId - Schedule ID
 * @param ranAt - When the schedule was executed
 * @returns The updated schedule
 */
export async function markScheduleRun(
  scheduleId: string,
  ranAt: Date = new Date()
): Promise<ExportSchedule> {
  const schedule = await prisma.exportSchedule.findUniqueOrThrow({
    where: { id: scheduleId },
  });

  const nextRunAt = getNextRunTime(schedule.cronExpr, ranAt);

  return prisma.exportSchedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: ranAt,
      nextRunAt,
    },
  });
}
