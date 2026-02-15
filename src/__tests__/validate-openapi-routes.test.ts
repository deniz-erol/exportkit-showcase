/**
 * Tests for the OpenAPI route validation logic.
 *
 * Verifies that the OpenAPI spec documents all expected route groups
 * and has valid structure.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

interface OpenApiSpec {
  paths: Record<string, Record<string, unknown>>;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

function loadSpec(): OpenApiSpec {
  const raw = readFileSync(resolve(ROOT, "docs/api-reference/openapi.json"), "utf-8");
  return JSON.parse(raw) as OpenApiSpec;
}

describe("OpenAPI route validation", () => {
  it("should parse the OpenAPI spec without errors", () => {
    const spec = loadSpec();
    expect(spec).toBeDefined();
    expect(spec.paths).toBeDefined();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it("should have valid HTTP methods on all paths", () => {
    const spec = loadSpec();
    for (const [path, operations] of Object.entries(spec.paths)) {
      const methods = Object.keys(operations).filter((k) => HTTP_METHODS.includes(k));
      expect(methods.length, `Path ${path} has no valid HTTP methods`).toBeGreaterThan(0);
    }
  });

  it("should document all expected route groups", () => {
    const spec = loadSpec();
    const paths = Object.keys(spec.paths);

    const expectedPrefixes = [
      "/api/jobs",
      "/api/keys",
      "/api/billing",
      "/api/usage",
      "/api/auth",
      "/api/audit-logs",
      "/api/team",
      "/api/schedules",
      "/api/account",
      "/api/branding",
      "/api/webhooks",
    ];

    for (const prefix of expectedPrefixes) {
      const hasPrefix = paths.some((p) => p.startsWith(prefix));
      expect(hasPrefix, `Missing route group: ${prefix}`).toBe(true);
    }
  });

  it("should have at least 20 documented paths", () => {
    const spec = loadSpec();
    expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(20);
  });
});
