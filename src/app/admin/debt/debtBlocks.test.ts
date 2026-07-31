import { describe, expect, it } from "vitest";

import { splitDebtBlocks } from "./debtBlocks";

describe("splitDebtBlocks", () => {
  it("keeps a fenced block whole even when it contains a blank line", () => {
    const blocks = splitDebtBlocks(
      [
        "The fallback fires here:",
        "",
        "```ts",
        "if (!match) {",
        "",
        "  return { commitSha, versionDate };",
        "}",
        "```",
        "",
        "Two failure modes follow.",
      ].join("\n"),
    );

    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "code",
      "paragraph",
    ]);
    expect(blocks[1]).toEqual({
      type: "code",
      language: "ts",
      text: "if (!match) {\n\n  return { commitSha, versionDate };\n}",
    });
  });

  it("reads a table into header and body cells", () => {
    const blocks = splitDebtBlocks(
      [
        "| commit | entries |",
        "| --- | --- |",
        "| `c4723b7a2` | 324 |",
        "| `1523af320` | 137 |",
      ].join("\n"),
    );

    expect(blocks).toEqual([
      {
        type: "table",
        head: ["commit", "entries"],
        rows: [
          ["`c4723b7a2`", "324"],
          ["`1523af320`", "137"],
        ],
      },
    ]);
  });

  it("joins a wrapped list item rather than splitting it into a paragraph", () => {
    const blocks = splitDebtBlocks(
      ["- C1. Does an entry mean the commit", "  that introduced the content?"].join(
        "\n",
      ),
    );

    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: ["C1. Does an entry mean the commit that introduced the content?"],
      },
    ]);
  });

  it("separates headings, quotes, and numbered lists", () => {
    const blocks = splitDebtBlocks(
      [
        "### Mechanism",
        "",
        "> The record becomes false rather than absent.",
        "",
        "1. Verify the ticket.",
        "2. Obtain every decision.",
      ].join("\n"),
    );

    expect(blocks).toEqual([
      { type: "heading", level: 3, text: "Mechanism" },
      { type: "quote", text: "The record becomes false rather than absent." },
      {
        type: "list",
        ordered: true,
        items: ["Verify the ticket.", "Obtain every decision."],
      },
    ]);
  });

  it("treats a pipe line with no divider as prose", () => {
    const blocks = splitDebtBlocks("| not | a | table |");
    expect(blocks).toEqual([
      { type: "paragraph", text: "| not | a | table |" },
    ]);
  });
});
