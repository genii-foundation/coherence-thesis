import { describe, expect, it } from "vitest";

import {
  exemplarAnchorsFrom,
  findExemplarViolations,
} from "./voice-exemplars";

describe("voice exemplar validation", () => {
  it("extracts exact opening anchors", () => {
    expect(
      exemplarAnchorsFrom(
        '- Exemplar opening anchors: "First opening"; “Second opening”',
      ),
    ).toEqual(["First opening", "Second opening"]);
  });

  it("fails closed when a card has no anchors", () => {
    const result = findExemplarViolations(
      (file) => (file.endsWith("manuscript.md") ? "Any prose." : "# Card"),
      ["volume-01"],
    );

    expect(result).toEqual({
      checked: 0,
      violations: [{ editorialId: "volume-01", kind: "missing-field" }],
    });
  });

  it("reports an anchor that no longer identifies manuscript prose", () => {
    const result = findExemplarViolations(
      (file) =>
        file.endsWith("manuscript.md")
          ? "The living opening remains."
          : '- Exemplar opening anchors: "The living opening"; "The lost opening"',
      ["volume-01"],
    );

    expect(result).toEqual({
      checked: 2,
      violations: [
        {
          editorialId: "volume-01",
          anchor: "The lost opening",
          kind: "missing-anchor",
        },
      ],
    });
  });
});
