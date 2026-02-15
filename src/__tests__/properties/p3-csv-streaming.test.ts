import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PassThrough } from "stream";
import { createCsvFormatter } from "../../lib/streams/csv-formatter.js";

/**
 * **Validates: Requirements TEST-03 (28.3)**
 *
 * Property P3: CSV Streaming Validity
 * For any array of flat JSON objects, the CSV export service produces output
 * where the number of data lines equals the number of input records, and the
 * header line contains all unique keys from the input.
 */

/**
 * Helper: pipe records through the CSV formatter and collect the output string.
 */
async function formatRecordsToCsv(
  records: Record<string, unknown>[]
): Promise<string> {
  const csvFormatter = createCsvFormatter({
    headers: true,
    includeEndRowDelimiter: false,
  });
  const passThrough = new PassThrough();
  csvFormatter.pipe(passThrough);

  const chunks: Buffer[] = [];
  passThrough.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<string>((resolve, reject) => {
    passThrough.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    passThrough.on("error", reject);
    csvFormatter.on("error", reject);
  });

  for (const record of records) {
    csvFormatter.write(record);
  }
  csvFormatter.end();

  return done;
}

/**
 * Parse a CSV header line into individual column names.
 * Handles quoted fields that may contain commas.
 */
function parseCsvHeaderLine(line: string): string[] {
  const headers: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      headers.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  headers.push(current);
  return headers;
}

/**
 * Arbitrary for generating a safe key name (alphanumeric, no special chars).
 * Avoids characters that would complicate CSV parsing in the test.
 */
const safeKeyArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/)
  .filter((s) => s.length >= 1);

/**
 * Arbitrary for generating a safe scalar value (string without newlines/quotes/commas
 * to keep CSV parsing straightforward in the test).
 */
const safeValueArb = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9 ]{0,30}$/),
  fc.integer({ min: -10000, max: 10000 }).map(String),
  fc.boolean().map(String),
  fc.constant("")
);

/**
 * Arbitrary for generating a flat JSON record with safe keys and values.
 */
const flatRecordArb = (keys: string[]): fc.Arbitrary<Record<string, unknown>> =>
  fc.tuple(...keys.map(() => safeValueArb)).map((values) => {
    const record: Record<string, unknown> = {};
    keys.forEach((key, i) => {
      record[key] = values[i];
    });
    return record;
  });

describe("P3: CSV Streaming Validity", () => {
  it("line count equals record count + 1 (header) and header contains all unique keys", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-10 unique keys
        fc
          .uniqueArray(safeKeyArb, { minLength: 1, maxLength: 10 })
          .filter((keys) => keys.length >= 1),
        // Number of records
        fc.integer({ min: 1, max: 50 }),
        async (keys, numRecords) => {
          // Generate records with the given keys
          const records = await fc.sample(flatRecordArb(keys), numRecords);

          const csvOutput = await formatRecordsToCsv(records);

          // The CSV formatter uses \n as row delimiter with
          // includeEndRowDelimiter: false, so there's no trailing \n.
          // The number of lines is simply the split count.
          const lineCount = csvOutput.split("\n").length;

          // Property 1: line count = record count + 1 (header line)
          expect(lineCount).toBe(numRecords + 1);

          // Property 2: header line contains all unique keys from input
          const headerLine = csvOutput.split("\n")[0];
          const headerColumns = parseCsvHeaderLine(headerLine);

          for (const key of keys) {
            expect(headerColumns).toContain(key);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("produces empty output (no lines) for zero records", async () => {
    // Edge case: no records means no output at all (no header either,
    // since fast-csv only emits headers when the first row is written)
    const csvOutput = await formatRecordsToCsv([]);
    const lines = csvOutput.split("\n").filter((line) => line.length > 0);
    expect(lines.length).toBe(0);
  });
});
