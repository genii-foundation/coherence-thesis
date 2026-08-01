import { describe, expect, it } from "vitest";
import type { ProgressParagraph } from "./manuscript-data";
import {
  createReaderPassageRange,
  isSingleParagraphRange,
  paragraphHashFromAnchor,
  parseReaderPassageRange,
  passageRangeParagraphCount,
  resolveReaderPassageRange,
} from "./reader-passage-range";

const hashA = "0123456789abcdef";
const hashB = "fedcba9876543210";
const hashC = "0011223344556677";

const paragraphs: ProgressParagraph[] = [
  {
    paragraphId: "p-1",
    anchor: `p-h${hashA}`,
    contentHash: hashA,
  },
  {
    paragraphId: "p-2",
    anchor: `p-h${hashB}`,
    contentHash: hashB,
  },
  {
    paragraphId: "p-3",
    anchor: `p-h${hashC}`,
    contentHash: hashC,
  },
];

describe("reader passage ranges", () => {
  it("creates a contiguous multi-paragraph range", () => {
    const range = createReaderPassageRange(
      { paragraphAnchor: paragraphs[0]!.anchor, offset: 4 },
      { paragraphAnchor: paragraphs[2]!.anchor, offset: 19 },
    );

    expect(range).toEqual({
      start: {
        paragraphAnchor: paragraphs[0]!.anchor,
        paragraphContentHash: hashA,
        offset: 4,
      },
      end: {
        paragraphAnchor: paragraphs[2]!.anchor,
        paragraphContentHash: hashC,
        offset: 19,
      },
    });
    expect(isSingleParagraphRange(range)).toBe(false);
    expect(passageRangeParagraphCount(range, paragraphs)).toBe(3);
  });

  it("migrates a version 1 bookmark into a same-paragraph range", () => {
    const range = parseReaderPassageRange(undefined, {
      paragraphAnchor: `p-h${hashA}-2`,
      paragraphContentHash: hashA,
      startOffset: 7,
      endOffset: 29,
    });

    expect(range).toEqual({
      start: {
        paragraphAnchor: `p-h${hashA}-2`,
        paragraphContentHash: hashA,
        offset: 7,
      },
      end: {
        paragraphAnchor: `p-h${hashA}-2`,
        paragraphContentHash: hashA,
        offset: 29,
      },
    });
    expect(isSingleParagraphRange(range!)).toBe(true);
  });

  it("repairs occurrence suffix changes at both boundaries", () => {
    const range = createReaderPassageRange(
      {
        paragraphAnchor: `p-h${hashA}-2`,
        paragraphContentHash: hashA,
        offset: 0,
      },
      {
        paragraphAnchor: `p-h${hashC}-2`,
        paragraphContentHash: hashC,
        offset: 5,
      },
    );

    expect(resolveReaderPassageRange(range, paragraphs)).toEqual({
      status: "renamed",
      startAnchor: `p-h${hashA}`,
      endAnchor: `p-h${hashC}`,
    });
  });

  it("rejects a missing or reversed endpoint", () => {
    const missing = createReaderPassageRange(
      { paragraphAnchor: `p-h${hashA}`, offset: 0 },
      { paragraphAnchor: "p-h9999999999999999", offset: 5 },
    );
    const reversed = createReaderPassageRange(
      { paragraphAnchor: `p-h${hashC}`, offset: 0 },
      { paragraphAnchor: `p-h${hashA}`, offset: 5 },
    );

    expect(resolveReaderPassageRange(missing, paragraphs).status).toBe(
      "missing",
    );
    expect(resolveReaderPassageRange(reversed, paragraphs).status).toBe(
      "missing",
    );
  });

  it("extracts only content-addressed paragraph hashes", () => {
    expect(paragraphHashFromAnchor(`p-h${hashA}-3`)).toBe(hashA);
    expect(paragraphHashFromAnchor("p-3")).toBe("");
  });
});
