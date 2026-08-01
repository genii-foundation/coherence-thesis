import { describe, expect, it } from "vitest";

import {
  findViolations,
  normalizeProtectedText,
  protectedLinesFrom,
} from "./protected-lines";

describe("protected line validation", () => {
  it("extracts straight and curly quoted declarations", () => {
    expect(
      protectedLinesFrom(
        '- Protected lines or passages: "First line."; “Second line.”',
      ),
    ).toEqual(["First line.", "Second line."]);
  });

  it("compares visible prose across Markdown emphasis and line breaks", () => {
    expect(normalizeProtectedText("*Love may direct the course.*\n\n*Freedom must walk beside it.*"))
      .toBe("Love may direct the course. Freedom must walk beside it.");
  });

  it("reports only declared prose that is absent from the manuscript", () => {
    const files = new Map([
      [
        "voice-card.md",
        '- Protected lines or passages: "Kept exactly."; "Missing exactly."',
      ],
      ["manuscript.md", "Opening.\n\n*Kept exactly.*"],
    ]);

    const result = findViolations(
      (file) => files.get(file.split("/").at(-1) ?? "") ?? "",
      ["volume-01"],
    );

    expect(result).toEqual({
      checked: 2,
      violations: [
        { editorialId: "volume-01", line: "Missing exactly." },
      ],
    });
  });
});
