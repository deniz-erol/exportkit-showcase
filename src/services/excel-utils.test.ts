import { describe, it, expect } from "vitest";
import { getSafeSheetName } from "./excel-utils.js";

describe("getSafeSheetName", () => {
  it("should return valid names as is", () => {
    const existing = new Set<string>();
    expect(getSafeSheetName("Sheet1", existing)).toBe("Sheet1");
    expect(existing.has("sheet1")).toBe(true);
  });

  it("should sanitize invalid characters", () => {
    const existing = new Set<string>();
    // Invalid chars: : \ / ? * [ ]
    expect(getSafeSheetName("Sheet/1:2", existing)).toBe("Sheet 1 2");
  });

  it("should truncate long names", () => {
    const existing = new Set<string>();
    const longName = "ThisIsAVeryLongSheetNameThatExceedsTheThirtyOneCharacterLimit";
    const result = getSafeSheetName(longName, existing);
    expect(result.length).toBe(31);
    expect(result).toBe("ThisIsAVeryLongSheetNameThatExc");
  });

  it("should handle duplicates by appending counter", () => {
    const existing = new Set<string>(["my sheet"]);
    const result = getSafeSheetName("My Sheet", existing);
    expect(result).toBe("My Sheet 1");
    expect(existing.has("my sheet 1")).toBe(true);
  });

  it("should handle duplicates with truncation", () => {
    // "A" * 31
    const name31 = "A".repeat(31);
    const existing = new Set<string>([name31.toLowerCase()]);

    const result = getSafeSheetName(name31, existing);
    // Should be truncated to accommodate " 1" (length 2)
    // So base becomes 29 chars + " 1" = 31 chars
    expect(result.length).toBe(31);
    expect(result).toBe("A".repeat(29) + " 1");
  });

  it("should handle multiple collisions", () => {
    const existing = new Set<string>(["sheet", "sheet 1"]);
    const result = getSafeSheetName("Sheet", existing);
    expect(result).toBe("Sheet 2");
  });

  it("should default to 'Sheet' if name is empty after sanitization", () => {
    const existing = new Set<string>();
    expect(getSafeSheetName(":::////", existing)).toBe("Sheet");
  });
});
