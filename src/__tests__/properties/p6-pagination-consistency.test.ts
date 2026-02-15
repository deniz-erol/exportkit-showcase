import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createCursorStream } from "../../lib/cursors/prisma-cursor.js";

/**
 * **Validates: Requirements DX-03 (36)**
 *
 * Property P6: Pagination Consistency
 * For any list of N items and valid page/pageSize parameters, the total number
 * of items across all pages equals N, and no item appears on more than one page.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pure offset-based pagination function.
 * Given a dataset, page number (1-indexed), and pageSize, returns the slice
 * for that page along with metadata.
 */
function paginate<T>(
  items: T[],
  page: number,
  pageSize: number
): { data: T[]; page: number; pageSize: number; total: number; hasNextPage: boolean } {
  const total = items.length;
  const start = (page - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  const hasNextPage = start + pageSize < total;
  return { data, page, pageSize, total, hasNextPage };
}

/**
 * Collects all items across all pages using offset-based pagination.
 */
function collectAllPages<T>(items: T[], pageSize: number): T[] {
  const collected: T[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = paginate(items, page, pageSize);
    collected.push(...result.data);
    hasMore = result.hasNextPage;
    page++;
  }

  return collected;
}

/**
 * Creates a mock Prisma model delegate backed by an in-memory array.
 * Supports cursor-based pagination as used by createCursorStream.
 */
function createMockModel<T extends { id: string }>(data: T[]) {
  // Sort by id ascending to match default cursor ordering
  const sorted = [...data].sort((a, b) => a.id.localeCompare(b.id));

  return {
    findMany: async (args: {
      take: number;
      skip?: number;
      cursor?: { id: string };
      where?: Record<string, unknown>;
      orderBy?: Record<string, "asc" | "desc">;
      select?: Record<string, boolean>;
      include?: Record<string, boolean>;
    }): Promise<T[]> => {
      let startIndex = 0;

      if (args.cursor) {
        const cursorIndex = sorted.findIndex((r) => r.id === args.cursor!.id);
        if (cursorIndex === -1) return [];
        startIndex = cursorIndex;
      }

      if (args.skip) {
        startIndex += args.skip;
      }

      return sorted.slice(startIndex, startIndex + args.take);
    },
  };
}

/**
 * Collects all items from an async generator into an array.
 */
async function collectAsyncGenerator<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a unique item with a string id and a numeric value. */
interface TestItem {
  id: string;
  value: number;
}

/**
 * Generates an array of N unique items with unique sequential IDs.
 */
const uniqueItemsArb = (minLen: number, maxLen: number): fc.Arbitrary<TestItem[]> =>
  fc.integer({ min: minLen, max: maxLen }).map((n) =>
    Array.from({ length: n }, (_, i) => ({
      id: String(i + 1).padStart(6, "0"),
      value: i,
    }))
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("P6: Pagination Consistency", () => {
  describe("offset-based pagination", () => {
    it("total items across all pages equals N with no duplicates", () => {
      fc.assert(
        fc.property(
          uniqueItemsArb(0, 200),
          fc.integer({ min: 1, max: 100 }),
          (items, pageSize) => {
            const collected = collectAllPages(items, pageSize);

            // Total collected equals original count
            expect(collected.length).toBe(items.length);

            // No duplicates — all IDs are unique
            const ids = collected.map((item) => item.id);
            expect(new Set(ids).size).toBe(ids.length);

            // All original items are present
            const originalIds = new Set(items.map((item) => item.id));
            const collectedIds = new Set(ids);
            expect(collectedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("pages are disjoint — no item appears on more than one page", () => {
      fc.assert(
        fc.property(
          uniqueItemsArb(1, 100),
          fc.integer({ min: 1, max: 50 }),
          (items, pageSize) => {
            const totalPages = Math.ceil(items.length / pageSize);
            const seenIds = new Set<string>();

            for (let page = 1; page <= totalPages; page++) {
              const result = paginate(items, page, pageSize);
              for (const item of result.data) {
                // Item must not have been seen on a previous page
                expect(seenIds.has(item.id)).toBe(false);
                seenIds.add(item.id);
              }
            }

            // All items accounted for
            expect(seenIds.size).toBe(items.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("hasNextPage is false only on the last page", () => {
      fc.assert(
        fc.property(
          uniqueItemsArb(1, 100),
          fc.integer({ min: 1, max: 50 }),
          (items, pageSize) => {
            const totalPages = Math.ceil(items.length / pageSize);

            for (let page = 1; page <= totalPages; page++) {
              const result = paginate(items, page, pageSize);
              if (page < totalPages) {
                expect(result.hasNextPage).toBe(true);
              } else {
                expect(result.hasNextPage).toBe(false);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("cursor-based pagination (createCursorStream)", () => {
    it("total items streamed equals N with no duplicates", async () => {
      await fc.assert(
        fc.asyncProperty(
          uniqueItemsArb(0, 150),
          fc.integer({ min: 1, max: 50 }),
          async (items, batchSize) => {
            const model = createMockModel(items);
            const stream = createCursorStream(model, { batchSize });
            const collected = await collectAsyncGenerator(stream);

            // Total collected equals original count
            expect(collected.length).toBe(items.length);

            // No duplicates
            const ids = collected.map((item) => item.id);
            expect(new Set(ids).size).toBe(ids.length);

            // All original items present
            const originalIds = new Set(items.map((item) => item.id));
            const collectedIds = new Set(ids);
            expect(collectedIds).toEqual(originalIds);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
