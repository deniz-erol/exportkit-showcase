import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

/**
 * Global PrismaClient singleton for serverless environments.
 *
 * Why Neon adapter?
 * - Neon uses WebSockets for connections, which works seamlessly in edge/serverless
 *   environments like Cloudflare Workers, Vercel Edge Functions, etc.
 * - The adapter handles connection pooling efficiently without traditional TCP
 *   connection overhead.
 *
 * Why singleton pattern?
 * - In serverless environments, each request may create a new module instance.
 * - Without caching, we'd exhaust database connections quickly.
 * - The globalThis cache ensures connection reuse across invocations.
 */

// Extend globalThis type for Prisma client caching
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Creates a Prisma client with Neon adapter.
 * Uses DATABASE_URL environment variable for connection.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is required. " +
        "Please set it to your Neon pooled connection string."
    );
  }

  // Create Prisma adapter with Neon connection string (v7+ API)
  const adapter = new PrismaNeon({ connectionString });

  // Create Prisma client with the adapter
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "info", "warn", "error"]
        : ["error"],
  });
}

/**
 * Prisma client singleton instance.
 *
 * In production, we use globalThis to cache the client across hot reloads
 * and serverless invocations. In development, we create a new client each
 * time to ensure fresh connections during debugging.
 *
 * Note: Audit log insert-only policy enforced at service layer (audit-service.ts)
 * instead of Prisma extension due to Node v22 compatibility issues.
 */
export const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

// Cache the client in non-production environments for HMR compatibility
if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export default prisma;