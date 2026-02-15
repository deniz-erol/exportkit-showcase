import { format, type FormatterOptionsArgs } from "@fast-csv/format";
import type { CsvFormatterStream } from "@fast-csv/format/build/src/CsvFormatterStream.js";
import type { RowMap } from "@fast-csv/format/build/src/types.js";

/**
 * Options for CSV formatter.
 */
export interface CsvOptions {
  /** Include headers in output (default: true) */
  headers?: boolean | string[];
  /** Column delimiter (default: comma) */
  delimiter?: string;
  /** Row delimiter/newline character (default: \n) */
  rowDelimiter?: string;
  /** Quote character (default: double quote) */
  quote?: string | boolean;
  /** Escape character (default: double quote) */
  escape?: string;
  /** Whether to include row delimiter at end */
  includeEndRowDelimiter?: boolean;
  /** Write BOM marker for Excel UTF-8 support */
  writeBOM?: boolean;
}

/**
 * CSV injection prevention prefixes.
 * These characters at the start of a cell can trigger formula execution
 * in spreadsheet applications, which is a security risk.
 */
const CSV_INJECTION_CHARS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Sanitizes a field value to prevent CSV injection attacks.
 *
 * Cells starting with =, +, -, @, tab, or carriage return can be
 * interpreted as formulas by spreadsheet applications. This function
 * prefixes such cells with a single quote to force text interpretation.
 *
 * @param value - The field value to sanitize
 * @returns Sanitized value safe for CSV output
 */
function sanitizeField(value: unknown): unknown {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  // Check if value starts with any injection character
  if (
    stringValue.length > 0 &&
    CSV_INJECTION_CHARS.some((char) => stringValue.startsWith(char))
  ) {
    // Prefix with single quote to force text interpretation
    return `'${stringValue}`;
  }

  return value;
}

/**
 * Sanitizes a record object to prevent CSV injection.
 *
 * @param record - Record with string keys and unknown values
 * @returns Sanitized record
 */
function sanitizeRecord(record: RowMap): RowMap {
  const sanitized: RowMap = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeRecord(value as RowMap);
    } else {
      sanitized[key] = sanitizeField(value);
    }
  }

  return sanitized;
}

/**
 * Creates a CSV formatter stream using @fast-csv/format.
 *
 * This formatter provides:
 * - RFC 4180 compliant CSV formatting
 * - Streaming support for memory-efficient processing
 * - CSV injection prevention (prefixes formulas with single quote)
 * - Configurable delimiters, quotes, and headers
 *
 * @example
 * ```typescript
 * const csvFormatter = createCsvFormatter({ headers: true });
 * const passThrough = new PassThrough();
 *
 * csvFormatter.pipe(passThrough);
 *
 * for (const record of records) {
 *   csvFormatter.write(record);
 * }
 *
 * csvFormatter.end();
 * ```
 *
 * @param options - CSV formatting options
 * @returns Formatter stream for writing records
 */
export function createCsvFormatter(
  options: CsvOptions = {}
): CsvFormatterStream<RowMap, RowMap> {
  const {
    headers = true,
    delimiter = ",",
    rowDelimiter = "\n",
    quote = '"',
    escape = '"',
    includeEndRowDelimiter = false,
    writeBOM = false,
  } = options;

  // Build fast-csv format options
  const formatOptions: FormatterOptionsArgs<RowMap, RowMap> = {
    headers,
    delimiter,
    rowDelimiter,
    quote,
    escape,
    includeEndRowDelimiter,
    writeBOM,
    // Transform each row to sanitize for CSV injection
    transform: (row: RowMap): RowMap => {
      return sanitizeRecord(row);
    },
  };

  return format(formatOptions);
}

/**
 * Creates a CSV formatter with custom headers mapping.
 *
 * Useful when you need to rename columns or select specific fields
 * from the source records.
 *
 * @example
 * ```typescript
 * const formatter = createCsvFormatterWithHeaders({
 *   headers: ["ID", "Email", "Name"],
 *   columns: ["id", "email", "name"]
 * });
 *
 * // Records will be mapped to the specified column order
 * formatter.write({ id: 1, email: "test@example.com", name: "Test" });
 * ```
 *
 * @param options - CSV options with column mapping
 * @returns Formatter stream
 */
export function createCsvFormatterWithHeaders(options: {
  headers: string[];
  columns?: string[];
} & CsvOptions): CsvFormatterStream<RowMap, RowMap> {
  const { headers, columns, ...csvOptions } = options;

  // If columns are specified, we need to transform records to match
  const columnMap = columns || headers;

  const formatOptions: FormatterOptionsArgs<RowMap, RowMap> = {
    headers,
    delimiter: csvOptions.delimiter || ",",
    rowDelimiter: csvOptions.rowDelimiter || "\n",
    quote: csvOptions.quote || '"',
    escape: csvOptions.escape || '"',
    includeEndRowDelimiter: csvOptions.includeEndRowDelimiter || false,
    writeBOM: csvOptions.writeBOM || false,
    transform: (row: RowMap): RowMap => {
      // Map record to column order and sanitize
      const mapped: RowMap = {};
      for (let i = 0; i < columnMap.length; i++) {
        const sourceKey = columnMap[i];
        const targetKey = headers[i];
        mapped[targetKey] = sanitizeField(row[sourceKey]);
      }

      return mapped;
    },
  };

  return format(formatOptions);
}

export default createCsvFormatter;
