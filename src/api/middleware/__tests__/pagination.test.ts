import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { paginationMiddleware, formatPaginatedResponse, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../pagination.js";
import type { PaginationParams } from "../../../types/index.js";

/**
 * Creates a minimal mock Express request with the given query parameters.
 */
function createMockRequest(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

function createMockResponse(): Response {
  return {} as unknown as Response;
}

describe("paginationMiddleware", () => {
  const next: NextFunction = vi.fn();

  it("sets default page=1 and pageSize=20 when no query params", () => {
    const req = createMockRequest();
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
    expect(next).toHaveBeenCalled();
  });

  it("parses valid page and pageSize from query", () => {
    const req = createMockRequest({ page: "3", pageSize: "50" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination).toEqual({
      page: 3,
      pageSize: 50,
      skip: 100,
      take: 50,
    });
  });

  it("clamps pageSize to max 100", () => {
    const req = createMockRequest({ page: "1", pageSize: "200" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination!.pageSize).toBe(MAX_PAGE_SIZE);
    expect(req.pagination!.take).toBe(MAX_PAGE_SIZE);
  });

  it("defaults page to 1 when page is 0", () => {
    const req = createMockRequest({ page: "0" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination!.page).toBe(1);
    expect(req.pagination!.skip).toBe(0);
  });

  it("defaults page to 1 when page is negative", () => {
    const req = createMockRequest({ page: "-5" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination!.page).toBe(1);
  });

  it("defaults pageSize to 20 when pageSize is 0", () => {
    const req = createMockRequest({ pageSize: "0" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination!.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("defaults pageSize to 20 when pageSize is negative", () => {
    const req = createMockRequest({ pageSize: "-10" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination!.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("defaults page to 1 when page is not a number", () => {
    const req = createMockRequest({ page: "abc" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination!.page).toBe(1);
  });

  it("defaults pageSize to 20 when pageSize is not a number", () => {
    const req = createMockRequest({ pageSize: "xyz" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination!.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("floors fractional page values", () => {
    const req = createMockRequest({ page: "2.7" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination!.page).toBe(2);
    expect(req.pagination!.skip).toBe(20);
  });

  it("floors fractional pageSize values", () => {
    const req = createMockRequest({ pageSize: "15.9" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination!.pageSize).toBe(15);
    expect(req.pagination!.take).toBe(15);
  });

  it("calculates correct skip for page 5 with pageSize 10", () => {
    const req = createMockRequest({ page: "5", pageSize: "10" });
    paginationMiddleware(req, createMockResponse(), next);

    expect(req.pagination).toEqual({
      page: 5,
      pageSize: 10,
      skip: 40,
      take: 10,
    });
  });

  it("calls next() to continue the middleware chain", () => {
    const mockNext = vi.fn();
    const req = createMockRequest();
    paginationMiddleware(req, createMockResponse(), mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
  });
});

describe("formatPaginatedResponse", () => {
  function makePagination(page: number, pageSize: number): PaginationParams {
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
  }

  it("returns correct metadata for a first page with more pages available", () => {
    const data = ["a", "b", "c"];
    const result = formatPaginatedResponse(data, 10, makePagination(1, 3));

    expect(result).toEqual({
      data: ["a", "b", "c"],
      pagination: {
        total: 10,
        page: 1,
        pageSize: 3,
        totalPages: 4,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });
  });

  it("returns correct metadata for a last page", () => {
    const data = [{ id: 1 }];
    const result = formatPaginatedResponse(data, 11, makePagination(4, 3));

    expect(result.pagination).toEqual({
      total: 11,
      page: 4,
      pageSize: 3,
      totalPages: 4,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it("returns correct metadata for a middle page", () => {
    const data = [1, 2, 3];
    const result = formatPaginatedResponse(data, 30, makePagination(2, 3));

    expect(result.pagination.hasNextPage).toBe(true);
    expect(result.pagination.hasPreviousPage).toBe(true);
    expect(result.pagination.totalPages).toBe(10);
  });

  it("handles empty data with zero total", () => {
    const result = formatPaginatedResponse([], 0, makePagination(1, 20));

    expect(result).toEqual({
      data: [],
      pagination: {
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it("handles page beyond available pages (empty result set)", () => {
    const result = formatPaginatedResponse([], 5, makePagination(10, 5));

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(5);
    expect(result.pagination.totalPages).toBe(1);
    expect(result.pagination.hasNextPage).toBe(false);
    expect(result.pagination.hasPreviousPage).toBe(true);
  });

  it("handles single page exactly matching total", () => {
    const data = [1, 2, 3, 4, 5];
    const result = formatPaginatedResponse(data, 5, makePagination(1, 5));

    expect(result.pagination.totalPages).toBe(1);
    expect(result.pagination.hasNextPage).toBe(false);
    expect(result.pagination.hasPreviousPage).toBe(false);
  });

  it("rounds totalPages up when total is not evenly divisible", () => {
    const result = formatPaginatedResponse([1], 7, makePagination(1, 3));

    expect(result.pagination.totalPages).toBe(3);
  });

  it("preserves the generic data type", () => {
    interface Item { id: number; name: string }
    const items: Item[] = [{ id: 1, name: "test" }];
    const result = formatPaginatedResponse(items, 1, makePagination(1, 10));

    expect(result.data[0].name).toBe("test");
  });
});
