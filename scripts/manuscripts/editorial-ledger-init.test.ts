import { describe, expect, it } from "vitest";
import {
  alignEditorialItems,
  initializeSentenceLedger,
  initializeStructureLedger,
} from "./editorial-ledger-init";
import type { BaselineSentenceSection } from "./editorial-ledger";

describe("editorial ledger initializer", () => {
  it("aligns keeps, recasts, splits, merges, and removals", () => {
    expect(alignEditorialItems(["A."], ["A."], String)).toMatchObject([
      { disposition: "keep", outputs: ["A."] },
    ]);
    expect(alignEditorialItems(["A."], ["B."], String)).toMatchObject([
      { disposition: "recast", outputs: ["B."] },
    ]);
    expect(
      alignEditorialItems(["A."], ["A first.", "A second."], String),
    ).toMatchObject([
      { disposition: "split", outputs: ["A first.", "A second."] },
    ]);
    expect(
      alignEditorialItems(["A.", "B."], ["Together."], String),
    ).toMatchObject([
      { disposition: "merge", outputs: ["Together."] },
      { disposition: "merge", outputs: ["Together."] },
    ]);
    expect(alignEditorialItems(["A."], [], String)).toMatchObject([
      { disposition: "remove", outputs: [] },
    ]);
  });

  it("attaches a pure insertion to an adjacent baseline record for review", () => {
    expect(
      alignEditorialItems(["A.", "B."], ["A.", "Inserted.", "B."], String),
    ).toMatchObject([
      {
        disposition: "split",
        outputs: ["A.", "Inserted."],
        reasonCode: "inserted-content-review-required",
      },
      { disposition: "keep", outputs: ["B."] },
    ]);
  });

  it("creates pending sentence records with exact current locations", () => {
    const baseline: BaselineSentenceSection[] = [
      {
        sourceFile: "sources/manuscripts/test.md",
        sourceHash: "a".repeat(64),
        sectionId: "old",
        sentences: ["Keep me.", "Change me."],
      },
    ];
    const current: BaselineSentenceSection[] = [
      {
        sourceFile: "sources/manuscripts/test.md",
        sourceHash: "b".repeat(64),
        sectionId: "new",
        sentences: ["Keep me.", "Change me clearly."],
      },
    ];
    const records = initializeSentenceLedger(
      baseline,
      ["old"],
      current,
      ["new"],
    );
    expect(records).toMatchObject([
      {
        disposition: "keep",
        proposedText: ["Keep me."],
        resultLocations: [{ sectionId: "new", sentenceOrdinal: 1 }],
        reviewStatus: "pending",
      },
      {
        disposition: "recast",
        proposedText: ["Change me clearly."],
        resultLocations: [{ sectionId: "new", sentenceOrdinal: 2 }],
        reviewStatus: "pending",
      },
    ]);
  });

  it("creates exhaustive pending structure records", () => {
    const records = initializeStructureLedger(
      "sources/manuscripts/test.md",
      "# Old heading\n\nBody.",
      "# Better heading\n\nBody.",
    );
    expect(records).toMatchObject([
      {
        originalText: "Old heading",
        disposition: "recast",
        proposedText: ["Better heading"],
        routeImpact: "renamed",
        reviewStatus: "pending",
      },
    ]);
  });
});
