import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "stream";
import { pipeline } from "stream/promises";
import { Readable } from "node:stream";

// ─── Mock external dependencies ───────────────────────────────────────────────

// Mock Prisma client
const mockCount = vi.fn();
const mockFindMany = vi.fn();

vi.mock("../../db/client.js", () => ({
  prisma: {
    customer: {
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    apiKey: {
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    job: {
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    webhookDelivery: {
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

// Mock storage service — capture uploaded data
let uploadedChunks: Buffer[] = [];
vi.mock("../storage-service.js", () => ({
  uploadStream: vi.fn(({ stream }: { stream: Readable }) => {
    return new Promise<{ key: string; size: number; etag: string }>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        uploadedChunks = chunks;
        const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
        resolve({ key: "test-key", size: totalSize, etag: "test-etag" });
      });
      stream.on("error", reject);
    });
  }),
}));

// Import modules under test (after mocks are set up)
const { exportCsvToR2 } = await import("../csv-export-service.js");
const { createJsonArrayTransform } = await import(
  "../../lib/streams/json-array-stream.js"
);
const {
  transformRecordForExcel,
  calculateColumnWidths,
} = await import("../excel-utils.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collect all output from a JSON array transform stream */
async function collectJsonStream(records: unknown[]): Promise<string> {
  const transform = createJsonArrayTransform();
  const output: Buffer[] = [];
  const passThrough = new PassThrough();

  passThrough.on("data", (chunk: Buffer) => output.push(chunk));

  const source = Readable.from(records);
  await pipeline(source, transform, passThrough);

  return Buffer.concat(output).toString("utf-8");
}


// ═══════════════════════════════════════════════════════════════════════════════
// CSV Export Service Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("CSV Export Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadedChunks = [];
  });

  describe("exportCsvToR2 (push model with data)", () => {
    it("exports flat records to CSV with headers", async () => {
      const data = [
        { id: "1", name: "Alice", email: "alice@example.com" },
        { id: "2", name: "Bob", email: "bob@example.com" },
      ];
      const progressValues: number[] = [];

      const result = await exportCsvToR2({
        customerId: "cust-1",
        jobId: "job-1",
        onProgress: (p) => { progressValues.push(p); },
        data,
      });

      expect(result.recordCount).toBe(2);
      expect(result.key).toBe("exports/cust-1/job-1.csv");
      expect(result.fileSize).toBeGreaterThan(0);

      // Verify CSV content
      const csvContent = Buffer.concat(uploadedChunks).toString("utf-8");
      const lines = csvContent.trim().split("\n");
      // First line is header (may have BOM prefix)
      expect(lines[0].replace(/^\uFEFF/, "")).toBe("id,name,email");
      expect(lines.length).toBe(3); // header + 2 data rows
    });

    it("transforms Date values to ISO strings", async () => {
      const date = new Date("2025-06-15T12:00:00.000Z");
      const data = [{ id: "1", createdAt: date }];

      await exportCsvToR2({
        customerId: "cust-1",
        jobId: "job-1",
        onProgress: () => {},
        data,
      });

      const csvContent = Buffer.concat(uploadedChunks).toString("utf-8");
      expect(csvContent).toContain("2025-06-15T12:00:00.000Z");
    });

    it("converts null and undefined values to empty strings", async () => {
      const data = [{ id: "1", name: null, email: undefined }];

      await exportCsvToR2({
        customerId: "cust-1",
        jobId: "job-1",
        onProgress: () => {},
        data: data as unknown[],
      });

      const csvContent = Buffer.concat(uploadedChunks).toString("utf-8");
      const lines = csvContent.trim().split("\n");
      // Data row should have empty values for null/undefined
      expect(lines[1]).toBe("1,,");
    });

    it("serializes nested objects as JSON strings", async () => {
      const data = [{ id: "1", meta: { foo: "bar" } }];

      await exportCsvToR2({
        customerId: "cust-1",
        jobId: "job-1",
        onProgress: () => {},
        data,
      });

      const csvContent = Buffer.concat(uploadedChunks).toString("utf-8");
      expect(csvContent).toContain('"{""foo"":""bar""}"');
    });

    it("skips fields starting with underscore", async () => {
      const data = [{ id: "1", _internal: "secret", name: "Alice" }];

      await exportCsvToR2({
        customerId: "cust-1",
        jobId: "job-1",
        onProgress: () => {},
        data,
      });

      const csvContent = Buffer.concat(uploadedChunks).toString("utf-8");
      expect(csvContent).not.toContain("_internal");
      expect(csvContent).not.toContain("secret");
    });

    it("sanitizes CSV injection characters by prefixing with single quote", async () => {
      const data = [
        { id: "1", formula: "=SUM(A1:A10)" },
        { id: "2", formula: "+cmd|'/C calc'!A0" },
        { id: "3", formula: "-1+1" },
        { id: "4", formula: "@import('malicious')" },
      ];

      await exportCsvToR2({
        customerId: "cust-1",
        jobId: "job-1",
        onProgress: () => {},
        data,
      });

      const csvContent = Buffer.concat(uploadedChunks).toString("utf-8");
      // Injection chars should be prefixed with single quote
      expect(csvContent).toContain("'=SUM(A1:A10)");
      expect(csvContent).toContain("'+cmd|'/C calc'!A0");
      expect(csvContent).toContain("'-1+1");
      expect(csvContent).toContain("'@import('malicious')");
    });

    it("reports progress ending at 100%", async () => {
      const data = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const progressValues: number[] = [];

      await exportCsvToR2({
        customerId: "cust-1",
        jobId: "job-1",
        onProgress: (p) => { progressValues.push(p); },
        data,
      });

      // Final progress should be 100
      expect(progressValues[progressValues.length - 1]).toBe(100);
    });

    it("handles empty data array by falling through to pull model", async () => {
      // Empty array falls through to pull model, which uses prisma
      // The push model only activates when data.length > 0
      mockCount.mockResolvedValue(0);
      mockFindMany.mockResolvedValue([]);

      const result = await exportCsvToR2({
        customerId: "cust-1",
        jobId: "job-1",
        onProgress: () => {},
        data: [],
      });

      expect(result.recordCount).toBe(0);
      expect(result.key).toBe("exports/cust-1/job-1.csv");
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// JSON Array Stream Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("JSON Array Stream (createJsonArrayTransform)", () => {
  it("produces valid JSON array from multiple records", async () => {
    const records = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
      { id: "3", name: "Charlie" },
    ];

    const output = await collectJsonStream(records);
    const parsed = JSON.parse(output);

    expect(parsed).toEqual(records);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
  });

  it("produces empty array '[]' for zero records", async () => {
    const output = await collectJsonStream([]);
    expect(JSON.parse(output)).toEqual([]);
  });

  it("produces valid JSON for a single record", async () => {
    const records = [{ id: "1", name: "Solo" }];
    const output = await collectJsonStream(records);
    const parsed = JSON.parse(output);

    expect(parsed).toEqual(records);
    expect(parsed).toHaveLength(1);
  });

  it("handles records with nested objects", async () => {
    const records = [
      { id: "1", meta: { tags: ["a", "b"], count: 42 } },
    ];

    const output = await collectJsonStream(records);
    const parsed = JSON.parse(output);

    expect(parsed[0].meta.tags).toEqual(["a", "b"]);
    expect(parsed[0].meta.count).toBe(42);
  });

  it("handles records with special characters", async () => {
    const records = [
      { id: "1", text: 'He said "hello" & goodbye' },
      { id: "2", text: "Line1\nLine2\tTabbed" },
    ];

    const output = await collectJsonStream(records);
    const parsed = JSON.parse(output);

    expect(parsed[0].text).toBe('He said "hello" & goodbye');
    expect(parsed[1].text).toBe("Line1\nLine2\tTabbed");
  });

  it("handles records with null values", async () => {
    const records = [{ id: "1", name: null, value: 0, empty: "" }];

    const output = await collectJsonStream(records);
    const parsed = JSON.parse(output);

    expect(parsed[0].name).toBeNull();
    expect(parsed[0].value).toBe(0);
    expect(parsed[0].empty).toBe("");
  });

  it("output starts with '[' and ends with ']'", async () => {
    const records = [{ id: "1" }, { id: "2" }];
    const output = await collectJsonStream(records);

    expect(output.trimStart().startsWith("[")).toBe(true);
    expect(output.trimEnd().endsWith("]")).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// Excel Utility Tests (transformRecordForExcel, calculateColumnWidths)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Excel Utilities", () => {
  describe("transformRecordForExcel", () => {
    it("converts Date values to ISO strings", () => {
      const date = new Date("2025-06-15T12:00:00.000Z");
      const result = transformRecordForExcel({ createdAt: date });
      expect(result.createdAt).toBe("2025-06-15T12:00:00.000Z");
    });

    it("converts booleans to Yes/No", () => {
      const result = transformRecordForExcel({ active: true, deleted: false });
      expect(result.active).toBe("Yes");
      expect(result.deleted).toBe("No");
    });

    it("converts null and undefined to empty strings", () => {
      const result = transformRecordForExcel({ a: null, b: undefined });
      expect(result.a).toBe("");
      expect(result.b).toBe("");
    });

    it("serializes objects as JSON strings", () => {
      const result = transformRecordForExcel({ meta: { foo: "bar" } });
      expect(result.meta).toBe('{"foo":"bar"}');
    });

    it("serializes arrays as JSON strings", () => {
      const result = transformRecordForExcel({ tags: ["a", "b", "c"] });
      expect(result.tags).toBe('["a","b","c"]');
    });

    it("passes through string and number values unchanged", () => {
      const result = transformRecordForExcel({ name: "Alice", count: 42 });
      expect(result.name).toBe("Alice");
      expect(result.count).toBe(42);
    });

    it("skips fields starting with underscore", () => {
      const result = transformRecordForExcel({
        id: "1",
        _internal: "hidden",
        _count: 5,
      });
      expect(result).toHaveProperty("id");
      expect(result).not.toHaveProperty("_internal");
      expect(result).not.toHaveProperty("_count");
    });

    it("handles empty record", () => {
      const result = transformRecordForExcel({});
      expect(result).toEqual({});
    });
  });

  describe("calculateColumnWidths", () => {
    it("returns empty array for empty data", () => {
      const result = calculateColumnWidths([]);
      expect(result).toEqual([]);
    });

    it("creates columns from first record keys", () => {
      const data = [{ id: "1", name: "Alice", email: "alice@example.com" }];
      const columns = calculateColumnWidths(data);

      expect(columns).toHaveLength(3);
      expect(columns.map((c) => c.key)).toEqual(["id", "name", "email"]);
    });

    it("capitalizes header labels", () => {
      const data = [{ firstName: "Alice" }];
      const columns = calculateColumnWidths(data);

      expect(columns[0].header).toBe("FirstName");
    });

    it("sets width based on longest value plus padding", () => {
      const data = [
        { name: "Al" },
        { name: "Alexander" },
        { name: "Bob" },
      ];
      const columns = calculateColumnWidths(data);

      // "Alexander" is 9 chars, + 2 padding = 11
      // Header "Name" is 4 chars, so max is 9 (from value)
      expect(columns[0].width).toBe(11); // 9 + 2
    });

    it("caps column width at 50", () => {
      const longValue = "x".repeat(100);
      const data = [{ description: longValue }];
      const columns = calculateColumnWidths(data);

      expect(columns[0].width).toBe(50);
    });

    it("uses header length as minimum width", () => {
      const data = [{ longHeaderName: "a" }];
      const columns = calculateColumnWidths(data);

      // "longHeaderName" is 14 chars, "a" is 1 char
      // Width = max(14, 1) + 2 = 16
      expect(columns[0].width).toBe(16);
    });
  });
});
