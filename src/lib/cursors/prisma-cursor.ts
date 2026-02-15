/**
 * Options for cursor-based pagination streaming.
 */
export interface CursorStreamOptions {
  /** Batch size for each query (default: 1000) */
  batchSize?: number;
  /** Where clause for filtering records */
  where?: Record<string, unknown>;
  /** Order by clause for consistent ordering */
  orderBy?: Record<string, "asc" | "desc">;
  /** Select specific fields */
  select?: Record<string, boolean>;
  /** Include related models */
  include?: Record<string, boolean>;
}

/**
 * Creates an async generator that streams records from a Prisma model
 * using cursor-based pagination for memory-safe processing.
 *
 * This approach uses take + cursor instead of OFFSET, which provides
 * O(1) performance regardless of dataset size.
 *
 * @example
 * ```typescript
 * const stream = createCursorStream(prisma.customer, {
 *   where: { isActive: true },
 *   batchSize: 500
 * });
 *
 * for await (const customer of stream) {
 *   console.log(customer.email);
 * }
 * ```
 *
 * @param model - Prisma model delegate (e.g., prisma.customer)
 * @param options - Streaming options (batchSize, where, orderBy, etc.)
 * @returns AsyncGenerator yielding records one at a time
 */
export async function* createCursorStream<T extends { id: string }>(
  model: {
    findMany: (args: {
      take: number;
      skip?: number;
      cursor?: { id: string };
      where?: Record<string, unknown>;
      orderBy?: Record<string, "asc" | "desc">;
      select?: Record<string, boolean>;
      include?: Record<string, boolean>;
    }) => Promise<T[]>;
  },
  options: CursorStreamOptions = {}
): AsyncGenerator<T, void, unknown> {
  const {
    batchSize = 1000,
    where,
    orderBy = { id: "asc" },
    select,
    include,
  } = options;

  let cursor: { id: string } | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    // Fetch batch using cursor-based pagination
    const batch = await model.findMany({
      take: batchSize,
      skip: cursor ? 1 : 0, // Skip the cursor itself on subsequent pages
      cursor: cursor ? { id: cursor.id } : undefined,
      where,
      orderBy,
      select,
      include,
    });

    // Yield each record from the batch
    for (const record of batch) {
      yield record;
    }

    // Check if there are more records
    hasMore = batch.length === batchSize;

    // Update cursor to last record for next iteration
    if (hasMore && batch.length > 0) {
      cursor = { id: batch[batch.length - 1].id };
    }
  }
}

/**
 * Creates an async generator that streams records with a progress callback.
 *
 * This variant is useful for export jobs that need to report progress
 * during streaming.
 *
 * @example
 * ```typescript
 * const stream = createCursorStreamWithProgress(
 *   prisma.customer,
 *   { where: { customerId } },
 *   (count) => console.log(`Processed ${count} records`)
 * );
 *
 * for await (const record of stream) {
 *   // Process record
 * }
 * ```
 *
 * @param model - Prisma model delegate
 * @param options - Streaming options
 * @param onProgress - Callback with current record count
 * @returns AsyncGenerator yielding records one at a time
 */
export async function* createCursorStreamWithProgress<T extends { id: string }>(
  model: {
    findMany: (args: {
      take: number;
      skip?: number;
      cursor?: { id: string };
      where?: Record<string, unknown>;
      orderBy?: Record<string, "asc" | "desc">;
      select?: Record<string, boolean>;
      include?: Record<string, boolean>;
    }) => Promise<T[]>;
    count?: (args: { where?: Record<string, unknown> }) => Promise<number>;
  },
  options: CursorStreamOptions = {},
  onProgress?: (count: number, total?: number) => void | Promise<void>
): AsyncGenerator<T, void, unknown> {
  const {
    batchSize = 1000,
    where,
    orderBy = { id: "asc" },
    select,
    include,
  } = options;

  // Get total count for progress calculation if possible
  let total: number | undefined;
  if (model.count) {
    total = await model.count({ where });
  }

  let cursor: { id: string } | undefined = undefined;
  let hasMore = true;
  let processedCount = 0;

  while (hasMore) {
    // Fetch batch using cursor-based pagination
    const batch = await model.findMany({
      take: batchSize,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor.id } : undefined,
      where,
      orderBy,
      select,
      include,
    });

    // Yield each record and track progress
    for (const record of batch) {
      yield record;
      processedCount++;

      // Call progress callback every 100 records or on last record
      if (onProgress && (processedCount % 100 === 0 || batch.length < batchSize)) {
        await onProgress(processedCount, total);
      }
    }

    // Check if there are more records
    hasMore = batch.length === batchSize;

    // Update cursor to last record for next iteration
    if (hasMore && batch.length > 0) {
      cursor = { id: batch[batch.length - 1].id };
    }
  }

  // Final progress callback
  if (onProgress) {
    await onProgress(processedCount, total);
  }
}

export default createCursorStream;
