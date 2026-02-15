import { createHash } from "node:crypto";

/**
 * Recursively sorts all keys in an object (and nested objects/arrays).
 * Arrays are traversed but not reordered — only object keys are sorted.
 *
 * @param value - Any JSON-serializable value
 * @returns A new value with all object keys sorted alphabetically
 */
export function deepSortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Recursively sorts object keys at all nesting levels, then JSON-stringifies
 * the result and returns a SHA-256 hex digest.
 *
 * @param payload - The request body object to hash
 * @returns SHA-256 hex string of the deterministically serialized payload
 */
export function computePayloadHash(payload: Record<string, unknown>): string {
  const sorted = deepSortKeys(payload);
  const serialized = JSON.stringify(sorted);
  return createHash("sha256").update(serialized).digest("hex");
}
