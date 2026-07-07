import { describe, expect, it } from "vitest";
import { splitMarkdownBlocks } from "./markdown-blocks";

describe("splitMarkdownBlocks", () => {
  it("splits on blank lines and trims, dropping empties", () => {
    const markdown = "First block.\n\nSecond block.\n\n\n   Third.  \n";
    expect(splitMarkdownBlocks(markdown)).toEqual([
      "First block.",
      "Second block.",
      "Third.",
    ]);
  });

  it("keeps single newlines inside a block intact", () => {
    const markdown = "| a | b |\n| - | - |\n| 1 | 2 |";
    expect(splitMarkdownBlocks(markdown)).toEqual([
      "| a | b |\n| - | - |\n| 1 | 2 |",
    ]);
  });

  it("returns an empty list for blank input so anchors and rendering agree", () => {
    expect(splitMarkdownBlocks("\n\n   \n")).toEqual([]);
  });
});
