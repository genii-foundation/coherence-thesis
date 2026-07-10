import { describe, expect, it } from "vitest";
import {
  canonicalReaderDestination,
  readerFragmentTarget,
  sectionHeadingHref,
} from "./reader-fragments";

const sections = [
  {
    sectionId: "current-section",
    legacySectionIds: ["old-section"],
    paragraphs: [{ anchor: "p-h0123456789abcdef" }],
  },
];

describe("reader fragment fallback", () => {
  it("builds a full section heading fragment for every reader route", () => {
    expect(
      sectionHeadingHref(
        "/manuscripts/2/the-diagnosis/the-architecture-of-extraction/#old",
        "v02-toward-humane-technology-2",
      ),
    ).toBe(
      "/manuscripts/2/the-diagnosis/the-architecture-of-extraction/#v02-toward-humane-technology-2",
    );
    expect(
      sectionHeadingHref(
        "/manuscripts/3/the-reckoning/the-central-wound/",
        "v03-the-central-wound",
      ),
    ).toBe(
      "/manuscripts/3/the-reckoning/the-central-wound/#v03-the-central-wound",
    );
  });

  it("keeps a historical fragment while canonicalizing an alias", () => {
    expect(
      canonicalReaderDestination(
        "/manuscripts/1/new-chapter/#current-section",
        "#old-section-p-3",
      ),
    ).toBe("/manuscripts/1/new-chapter/#old-section-p-3");
    expect(
      canonicalReaderDestination(
        "/manuscripts/1/new-chapter/#current-section",
        "",
      ),
    ).toBe("/manuscripts/1/new-chapter/#current-section");
  });

  it("qualifies a bare paragraph when the canonical reader is a chapter", () => {
    expect(
      canonicalReaderDestination(
        "/manuscripts/1/new-chapter/#current-section",
        "#p-3",
        sections[0],
      ),
    ).toBe("/manuscripts/1/new-chapter/#current-section-p-3");
    expect(
      canonicalReaderDestination(
        "/manuscripts/1/new-chapter/#current-section",
        "#p-h0123456789abcdef",
        sections[0],
      ),
    ).toBe(
      "/manuscripts/1/new-chapter/#current-section-p-h0123456789abcdef",
    );
  });

  it("translates an exact historical paragraph anchor to the current section", () => {
    expect(
      canonicalReaderDestination(
        "/manuscripts/1/new-chapter/#current-section",
        "#old-section-p-h0123456789abcdef",
        sections[0],
      ),
    ).toBe(
      "/manuscripts/1/new-chapter/#current-section-p-h0123456789abcdef",
    );
    expect(
      canonicalReaderDestination(
        "/manuscripts/1/new-standalone/",
        "#old-section-p-h0123456789abcdef",
        sections[0],
      ),
    ).toBe("/manuscripts/1/new-standalone/#p-h0123456789abcdef");
  });

  it("does not translate a historical content anchor absent from the section", () => {
    expect(
      canonicalReaderDestination(
        "/manuscripts/1/new-chapter/#current-section",
        "#old-section-p-hfedcba9876543210",
        sections[0],
      ),
    ).toBe("/manuscripts/1/new-chapter/#old-section-p-hfedcba9876543210");
  });

  it("falls back from an old standalone ordinal paragraph", () => {
    expect(readerFragmentTarget("#p-3", sections)).toEqual({
      sectionId: "current-section",
      anchorId: "current-section",
    });
  });

  it("falls back from a missing current qualified paragraph", () => {
    expect(readerFragmentTarget("#current-section-p-3", sections)).toEqual({
      sectionId: "current-section",
      anchorId: "current-section",
    });
  });

  it("falls back through a historical section anchor", () => {
    expect(readerFragmentTarget("#old-section-p-3", sections)).toEqual({
      sectionId: "current-section",
      anchorId: "old-section",
    });
  });

  it("recognizes content-derived paragraph fragments", () => {
    expect(
      readerFragmentTarget("#current-section-p-h0123456789abcdef", sections),
    ).toEqual({
      sectionId: "current-section",
      anchorId: "current-section",
    });
  });

  it("does not guess a bare fragment on a multi-section page", () => {
    expect(
      readerFragmentTarget("#p-3", [
        ...sections,
        { sectionId: "another", legacySectionIds: [] },
      ]),
    ).toBeNull();
  });

  it("prefers the longest matching section identity", () => {
    expect(
      readerFragmentTarget("#old-section-long-p-3", [
        { sectionId: "short", legacySectionIds: ["old-section"] },
        { sectionId: "long", legacySectionIds: ["old-section-long"] },
      ]),
    ).toEqual({ sectionId: "long", anchorId: "old-section-long" });
  });
});
