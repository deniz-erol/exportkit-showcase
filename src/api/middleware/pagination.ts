import type { Request, Response, NextFunction } from "express";
import type { PaginationParams, PaginatedResponse } from "../../types/index.js";

/** Default number of items per page when pageSize is not specified. */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum allowed page size to prevent excessive queries. */
export const MAX_PAGE_SIZE = 100;

/**
 * Express middleware that parses `page` and `pageSize` query parameters
 * and attaches a `pagination` object to the request.
 *
 * - `page` defaults to 1, clamped to a minimum of 1
 * - `pageSize` defaults to 20, clamped to a maximum of 100 and minimum of 1
 * - Calculates `skip` and `take` values for use with Prisma queries
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function paginationMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const rawPage = Number(req.query.page);
  const rawPageSize = Number(req.query.pageSize);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize >= 1
    ? Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  req.pagination = {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };

  next();
}

/**
 * Formats a paginated API response with metadata.
 *
 * @param data - Array of items for the current page
 * @param total - Total count of all items across all pages
 * @param pagination - Parsed pagination parameters from the request
 * @returns Paginated response object with data and pagination metadata
 */
export function formatPaginatedResponse<T>(
  data: T[],
  total: number,
  pagination: PaginationParams
): PaginatedResponse<T> {
  const totalPages = pagination.pageSize > 0 ? Math.ceil(total / pagination.pageSize) : 0;

  return {
    data,
    pagination: {
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages,
      hasNextPage: pagination.page < totalPages,
      hasPreviousPage: pagination.page > 1,
    },
  };
}
