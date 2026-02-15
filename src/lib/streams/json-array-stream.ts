import { Transform, type TransformCallback } from "stream";

/**
 * Options for JSON array transform stream.
 */
export interface JsonArrayTransformOptions {
  /** Indentation for pretty printing (default: undefined = no indentation) */
  indentation?: string | number;
  /** Custom replacer function for JSON.stringify */
  replacer?: (key: string, value: unknown) => unknown;
}

/**
 * Creates a Transform stream that formats records as a JSON array.
 *
 * This transform takes JavaScript objects as input (objectMode: true)
 * and outputs a valid JSON array string that can be parsed by standard
 * JSON parsers.
 *
 * Output format:
 * ```
 * [
 *   {"id": 1, "name": "first"},
 *   {"id": 2, "name": "second"}
 * ]
 * ```
 *
 * Edge cases handled:
 * - Empty input produces "[]"
 * - Single record produces "[\n{...}\n]"
 * - Proper comma placement (no comma before first, comma between records)
 * - Proper array closing even on empty stream
 *
 * @example
 * ```typescript
 * const jsonTransform = createJsonArrayTransform();
 * const passThrough = new PassThrough();
 *
 * await pipeline(
 *   recordSource,
 *   jsonTransform,
 *   passThrough
 * );
 * ```
 *
 * @param options - Transform options
 * @returns Transform stream in objectMode
 */
export function createJsonArrayTransform(
  options: JsonArrayTransformOptions = {}
): Transform {
  const { indentation, replacer } = options;

  let isFirstChunk = true;
  let recordCount = 0;

  return new Transform({
    objectMode: true,

    transform(
      chunk: unknown,
      _encoding: BufferEncoding,
      callback: TransformCallback
    ): void {
      try {
        let output = "";

        if (isFirstChunk) {
          // First record: open the array
          output = "[\n";
          isFirstChunk = false;
        } else {
          // Subsequent records: add comma and newline
          output = ",\n";
        }

        // Serialize the record
        const jsonLine = JSON.stringify(chunk, replacer, indentation);
        output += jsonLine;

        recordCount++;
        callback(null, output);
      } catch (error) {
        callback(error as Error);
      }
    },

    flush(callback: TransformCallback): void {
      try {
        if (isFirstChunk) {
          // No records were written - output empty array
          this.push("[]");
        } else {
          // Close the array with proper newline
          this.push("\n]");
        }
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

/**
 * Creates a JSON array transform with progress tracking.
 *
 * This variant calls a progress callback every N records, useful for
 * export jobs that need to report progress.
 *
 * @example
 * ```typescript
 * const transform = createJsonArrayTransformWithProgress({
 *   onProgress: (count) => console.log(`Processed ${count} records`),
 *   progressInterval: 100
 * });
 * ```
 *
 * @param options - Transform options with progress callback
 * @returns Transform stream in objectMode
 */
export function createJsonArrayTransformWithProgress(options: {
  /** Callback called every progressInterval records */
  onProgress: (count: number) => void | Promise<void>;
  /** How often to call progress callback (default: 100) */
  progressInterval?: number;
  /** Indentation for pretty printing */
  indentation?: string | number;
  /** Custom replacer function */
  replacer?: (key: string, value: unknown) => unknown;
}): Transform {
  const {
    onProgress,
    progressInterval = 100,
    indentation,
    replacer,
  } = options;

  let isFirstChunk = true;
  let recordCount = 0;

  return new Transform({
    objectMode: true,

    transform(
      chunk: unknown,
      _encoding: BufferEncoding,
      callback: TransformCallback
    ): void {
      try {
        let output = "";

        if (isFirstChunk) {
          output = "[\n";
          isFirstChunk = false;
        } else {
          output = ",\n";
        }

        const jsonLine = JSON.stringify(chunk, replacer, indentation);
        output += jsonLine;

        recordCount++;

        // Call progress callback if interval reached
        if (recordCount % progressInterval === 0) {
          Promise.resolve(onProgress(recordCount)).then(() => {
            callback(null, output);
          }, callback);
        } else {
          callback(null, output);
        }
      } catch (error) {
        callback(error as Error);
      }
    },

    flush(callback: TransformCallback): void {
      try {
        if (isFirstChunk) {
          this.push("[]");
        } else {
          this.push("\n]");
        }

        // Final progress callback
        Promise.resolve(onProgress(recordCount)).then(
          () => callback(),
          callback
        );
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

export default createJsonArrayTransform;
