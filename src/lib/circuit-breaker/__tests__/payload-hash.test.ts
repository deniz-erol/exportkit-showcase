import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computePayloadHash, deepSortKeys } from "../payload-hash.js";

/**
 * Recursively shuffles all object keys at every nesting level.
 * Arrays are traversed (elements may be shuffled internally) but array order is preserved.
 */
function shuffleKeys(value: unknown, rng: () => number): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => shuffleKeys(v, rng));
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  // Fisher-Yates shuffle
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  const shuffled: Record<string, unknown> = {};
  for (const key of keys) {
    shuffled[key] = shuffleKeys(obj[key], rng);
  }
  return shuffled;
}

/**
 * fast-check arbitrary that generates JSON-serializable nested objects.
 * Constrains depth and breadth to keep generation tractable.
 */
const jsonObject = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.string(),
    fc.integer(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.boolean(),
    fc.constant(null),
    tie("array"),
    tie("object"),
  ),
  array: fc.array(tie("value"), { maxLength: 5 }),
  object: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10 }),
    tie("value"),
    { maxKeys: 6 },
  ),
}));

const arbitraryPayload = jsonObject.object.map(
  (obj) => obj as Record<string, unknown>,
);


describe("Feature: runaway-agent-protection — Payload Hash Properties", () => {
  /**
   * **Validates: Requirements 5.1, 5.3**
   *
   * Property 1: Hash determinism under key reordering
   *
   * For any JSON-serializable object (including nested objects and arrays),
   * computing the Payload_Hash of the object and computing the Payload_Hash
   * of a version with all object keys shuffled at every nesting level
   * SHALL produce identical hash values.
   */
  it("Property 1: Hash determinism under key reordering", () => {
    fc.assert(
      fc.property(
        arbitraryPayload,
        fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })),
        (payload, rngStream) => {
          const rng = () => rngStream.next().value;
          const shuffled = shuffleKeys(payload, rng) as Record<string, unknown>;

          const hashOriginal = computePayloadHash(payload);
          const hashShuffled = computePayloadHash(shuffled);

          expect(hashOriginal).toBe(hashShuffled);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Property 2: Hash uniqueness for distinct payloads
   *
   * For any two JSON-serializable objects that differ in at least one key or value,
   * computing the Payload_Hash of each SHALL produce different hash values.
   */
  it("Property 2: Hash uniqueness for distinct payloads", () => {
    fc.assert(
      fc.property(
        arbitraryPayload,
        arbitraryPayload,
        (a, b) => {
          // Only test when the payloads are structurally different
          const sortedA = JSON.stringify(deepSortKeys(a));
          const sortedB = JSON.stringify(deepSortKeys(b));
          fc.pre(sortedA !== sortedB);

          const hashA = computePayloadHash(a);
          const hashB = computePayloadHash(b);

          expect(hashA).not.toBe(hashB);
        },
      ),
      { numRuns: 100 },
    );
  });
});


describe("Payload Hash — Unit Tests (Edge Cases)", () => {
  describe("deepSortKeys", () => {
    it("returns an empty object unchanged", () => {
      expect(deepSortKeys({})).toEqual({});
    });

    it("returns null as-is", () => {
      expect(deepSortKeys(null)).toBeNull();
    });

    it("returns primitive string as-is", () => {
      expect(deepSortKeys("hello")).toBe("hello");
    });

    it("returns primitive number as-is", () => {
      expect(deepSortKeys(42)).toBe(42);
    });

    it("returns boolean as-is", () => {
      expect(deepSortKeys(true)).toBe(true);
    });

    it("sorts top-level keys alphabetically", () => {
      const input = { z: 1, a: 2, m: 3 };
      const result = deepSortKeys(input) as Record<string, unknown>;
      expect(Object.keys(result)).toEqual(["a", "m", "z"]);
    });

    it("recursively sorts keys in nested objects", () => {
      const input = { b: { z: 1, a: 2 }, a: { y: 3, x: 4 } };
      const result = deepSortKeys(input) as Record<string, unknown>;
      expect(Object.keys(result)).toEqual(["a", "b"]);
      expect(Object.keys(result.a as Record<string, unknown>)).toEqual(["x", "y"]);
      expect(Object.keys(result.b as Record<string, unknown>)).toEqual(["a", "z"]);
    });

    it("traverses arrays without reordering elements", () => {
      const input = [3, 1, 2];
      expect(deepSortKeys(input)).toEqual([3, 1, 2]);
    });

    it("sorts keys inside objects within arrays", () => {
      const input = [{ z: 1, a: 2 }, { m: 3, b: 4 }];
      const result = deepSortKeys(input) as Record<string, unknown>[];
      expect(Object.keys(result[0])).toEqual(["a", "z"]);
      expect(Object.keys(result[1])).toEqual(["b", "m"]);
    });

    it("handles deeply nested structures (3+ levels)", () => {
      const input = {
        c: {
          b: {
            a: {
              z: "deep",
              a: "value",
            },
          },
        },
      };
      const result = deepSortKeys(input) as any;
      expect(Object.keys(result.c.b.a)).toEqual(["a", "z"]);
    });
  });

  describe("computePayloadHash", () => {
    it("returns a 64-character hex string", () => {
      const hash = computePayloadHash({ foo: "bar" });
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces identical hashes for objects with different key order", () => {
      const hash1 = computePayloadHash({ a: 1, b: 2 });
      const hash2 = computePayloadHash({ b: 2, a: 1 });
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different values", () => {
      const hash1 = computePayloadHash({ a: 1 });
      const hash2 = computePayloadHash({ a: 2 });
      expect(hash1).not.toBe(hash2);
    });

    it("produces a valid hash for an empty object", () => {
      const hash = computePayloadHash({});
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
