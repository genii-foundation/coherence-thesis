import { describe, expect, it } from "vitest";
import {
  chunkEditorialLines,
  parseChangedLines,
} from "./editorial-pr-comments";

describe("parseChangedLines", () => {
  it("tracks removed and added line numbers across hunks", () => {
    const changed = parseChangedLines([
      "@@ -4,2 +4,3 @@",
      "-old four",
      "+new four",
      "+new five",
      " unchanged",
      "@@ -20 +21 @@",
      "-old twenty",
      "+new twenty one",
    ].join("\n"));

    expect(changed).toEqual({
      left: [4, 20],
      right: [4, 5, 21],
    });
  });
});

describe("chunkEditorialLines", () => {
  it("keeps the required external post prefix and every change record", () => {
    const bodies = chunkEditorialLines(
      "Editorial changes for Test",
      "Every changed sentence is accounted for.",
      ["sentence 1", "sentence 2"],
    );

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatch(/^\(AI Generated\)\./);
    expect(bodies[0]).toContain("- sentence 1");
    expect(bodies[0]).toContain("- sentence 2");
  });
});
