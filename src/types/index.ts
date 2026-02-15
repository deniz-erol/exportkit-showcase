import type { Request } from "express";
import type { ApiKey, ApiKeyScope, Customer } from "@prisma/client";
import type { Logger } from "pino";

// Re-export Prisma types for convenience
export type { ApiKey, Customer } from "@prisma/client";

/**
 * ApiKeyWithCustomer extends ApiKey to include the customer relation.
 * Used when fetching API keys with their associated customer data.
 */
export interface ApiKeyWithCustomer extends ApiKey {
  customer: Customer;
}

/**
 * AuthenticatedRequest extends Express Request to include the authenticated
 * API key information after passing through the authentication middleware.
 */
export interface AuthenticatedRequest extends Request {
  apiKey?: ApiKeyWithCustomer;
}

/**
 * API Key creation result returned to the client.
 * The full key is only shown once at creation time.
 */
export interface ApiKeyCreationResult {
  id: string;
  name: string;
  keyPrefix: string;
  rateLimit: number;
  createdAt: Date;
  key: string; // Full key - ONLY returned at creation time
  scope: ApiKeyScope;
}

/**
 * API Key listing item (without sensitive keyHash).
 * Used when listing keys to prevent exposure of hashed keys.
 */
export interface ApiKeyListItem {
  id: string;
  name: string;
  keyPrefix: string;
  rateLimit: number;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isRevoked: boolean;
  createdAt: Date;
}

/**
 * Standard error response format for API errors.
 */
export interface ApiErrorResponse {
  error: string;
  code: string;
}

/**
 * Parsed pagination parameters attached to the request by the pagination middleware.
 */
export interface PaginationParams {
  /** Current page number (1-indexed) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Number of items to skip (for Prisma queries) */
  skip: number;
  /** Number of items to take (for Prisma queries) */
  take: number;
}

/**
 * Paginated API response wrapper with metadata.
 * Used by list endpoints to return items with pagination info.
 */
export interface PaginatedResponse<T> {
  /** Items for the current page */
  data: T[];
  /** Pagination metadata */
  pagination: {
    /** Total number of items across all pages */
    total: number;
    /** Current page number (1-indexed) */
    page: number;
    /** Number of items per page */
    pageSize: number;
    /** Total number of pages */
    totalPages: number;
    /** Whether there is a next page */
    hasNextPage: boolean;
    /** Whether there is a previous page */
    hasPreviousPage: boolean;
  };
}

/**
 * Declaration merging for Express namespace to support
 * TypeScript type checking in route handlers.
 */
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyWithCustomer;
      log: Logger;
      correlationId: string;
      apiVersion?: string;
      pagination?: PaginationParams;
    }
  }
}
