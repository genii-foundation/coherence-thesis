import { describe, expect, it } from "vitest";
import { splitSections } from "./damage";

/**
 * Every defect this tool has shipped was found by an agent reading its output rather
 * than by a test. These cover the section boundary rules, which is where all of them
 * originated: a wrong boundary moves words between sections and reports the loss in
 * the wrong place, or as growth.
 */
describe("splitSections", () => {
  it("reads four heading levels, because #### generates a public route", () => {
    const sections = splitSections(
      ["## Part", "parent prose", "#### 1 · Deliberate Perception", "tenet prose"].join(
        "\n\n",
      ),
    );

    expect(sections.map((section) => section.heading)).toEqual([
      "Part",
      "1 · Deliberate Perception",
    ]);
    // The tenet's words belong to the tenet. Absorbing them into the parent reported
    // the parent as growth and the tenet as deleted, from a single missing level.
    expect(sections[1]?.body).toContain("tenet prose");
    expect(sections[0]?.body).not.toContain("tenet prose");
  });

  it("joins a part label to its title when the baseline sets them as two display lines", () => {
    const sections = splitSections(
      ["**Part I**", "**The Argument, Arrived**", "argument prose"].join("\n\n"),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.heading).toBe("Part I: The Argument, Arrived");
    expect(sections[0]?.body).toContain("argument prose");
  });

  it("leaves a part label alone when it carries prose of its own", () => {
    const sections = splitSections(
      ["**Part I**", "a part introduction", "**The Argument, Arrived**", "argument prose"].join(
        "\n\n",
      ),
    );

    expect(sections.map((section) => section.heading)).toEqual([
      "Part I",
      "The Argument, Arrived",
    ]);
  });

  it("falls back to bold display lines only when no markdown heading exists", () => {
    const withHeadings = splitSections(
      ["# Real Heading", "prose", "**An inline lead**", "more prose"].join("\n\n"),
    );

    // A bold line is a section boundary only in a document that marks sections that
    // way. In a document with headings it is an inline lead and must not split.
    expect(withHeadings.map((section) => section.heading)).toEqual(["Real Heading"]);
  });
});
