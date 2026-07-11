import { describe, expect, it } from "vitest";
import { chapterHeadingHref, sectionHeadingHref } from "./reader-heading-links";

describe("reader heading links", () => {
  it("replaces any existing fragment with the section identity", () => {
    expect(
      sectionHeadingHref(
        "/manuscripts/2/the-diagnosis/the-architecture-of-extraction/#old",
        "v02-toward-humane-technology-2",
      ),
    ).toBe(
      "/manuscripts/2/the-diagnosis/the-architecture-of-extraction/#v02-toward-humane-technology-2",
    );
  });

  it("anchors structural chapter headings by chapter identity", () => {
    expect(
      chapterHeadingHref(
        "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/",
        "the-sprout",
      ),
    ).toBe(
      "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/#the-sprout",
    );
  });
});
