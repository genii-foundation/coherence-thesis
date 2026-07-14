import { describe, expect, it } from "vitest";
import { paragraphFingerprints } from "./io";

describe("paragraph fingerprints", () => {
  it("keeps paragraph anchors stable when prose is reordered", () => {
    const first = paragraphFingerprints("Alpha remains.\n\nBeta remains.");
    const reordered = paragraphFingerprints("Beta remains.\n\nAlpha remains.");
    const firstByText = new Map(
      first.map((paragraph) => [paragraph.text, paragraph.anchor]),
    );
    const reorderedByText = new Map(
      reordered.map((paragraph) => [paragraph.text, paragraph.anchor]),
    );

    expect(reorderedByText.get("Alpha remains.")).toBe(
      firstByText.get("Alpha remains."),
    );
    expect(reorderedByText.get("Beta remains.")).toBe(
      firstByText.get("Beta remains."),
    );
  });

  it("gives repeated paragraphs unique deterministic anchors", () => {
    const paragraphs = paragraphFingerprints("Again.\n\nAgain.\n\nAgain.");
    expect(paragraphs.map((paragraph) => paragraph.anchor)).toEqual([
      expect.stringMatching(/^p-h[0-9a-f]{16}$/),
      expect.stringMatching(/^p-h[0-9a-f]{16}-2$/),
      expect.stringMatching(/^p-h[0-9a-f]{16}-3$/),
    ]);
    expect(new Set(paragraphs.map((paragraph) => paragraph.anchor)).size).toBe(3);
  });
});
