import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractStructureUnits,
  pendingStructureRouteOutcome,
  parseStructureLedger,
  validateStructureLedger,
  type StructureLedgerRecord,
} from "./editorial-structure-ledger";
import { repoRoot, sha256 } from "./shared";

const baseline = [
  "THE BOOK",
  "",
  "*A subtitle*",
  "",
  "# First Heading",
  "",
  "Body prose.",
  "",
  "## Second Heading",
].join("\n");

function records(): StructureLedgerRecord[] {
  const sourceFile = "sources/manuscripts/test.md";
  const sourceHash = sha256(baseline);
  return extractStructureUnits(baseline).map((unit) => ({
    sourceFile,
    sourceHash,
    unitType: unit.unitType,
    unitOrdinal: unit.unitOrdinal,
    originalHash: sha256(unit.text).slice(0, 16),
    originalText: unit.text,
    disposition: "keep",
    proposedText: [unit.text],
    resultLocations: [
      {
        sourceFile,
        unitType: unit.unitType,
        unitOrdinal: unit.unitOrdinal,
      },
    ],
    routeImpact: unit.unitType === "heading" ? "unchanged" : "not-public",
    routeOutcome: "No public route change.",
    reviewStatus: "approved",
  }));
}

describe("editorial structure ledger", () => {
  it("extracts title-page display copy and Markdown headings", () => {
    expect(extractStructureUnits(baseline)).toEqual([
      { unitType: "display-metadata", unitOrdinal: 1, text: "THE BOOK" },
      { unitType: "display-metadata", unitOrdinal: 2, text: "A subtitle" },
      { unitType: "heading", unitOrdinal: 3, text: "First Heading" },
      { unitType: "heading", unitOrdinal: 4, text: "Second Heading" },
    ]);
  });

  it("extracts quoted and attributed display lines", () => {
    const source = [
      "# Chapter",
      "",
      "> A displayed quotation.",
      ">",
      "> A second displayed line.",
      "",
      "\u2014 Joseph Tainter, The Collapse of Complex Societies",
      "",
      "*An italic display quotation.*",
      "",
      "*Adapted from The Coherence Thesis, Volume I*",
      "",
      "Ordinary body prose.",
    ].join("\n");
    expect(extractStructureUnits(source)).toEqual([
      { unitType: "heading", unitOrdinal: 1, text: "Chapter" },
      {
        unitType: "display-metadata",
        unitOrdinal: 2,
        text: "A displayed quotation.",
      },
      {
        unitType: "display-metadata",
        unitOrdinal: 3,
        text: "A second displayed line.",
      },
      {
        unitType: "display-metadata",
        unitOrdinal: 4,
        text: "Joseph Tainter, The Collapse of Complex Societies",
      },
      {
        unitType: "display-metadata",
        unitOrdinal: 5,
        text: "An italic display quotation.",
      },
      {
        unitType: "display-metadata",
        unitOrdinal: 6,
        text: "Adapted from The Coherence Thesis, Volume I",
      },
    ]);
  });

  it("accounts for display quotations and attributions in first-wave sources", () => {
    const sourceFiles = [
      "sources/manuscripts/coherence-thesis-vol2-wielding-intelligence.md",
      "sources/manuscripts/coherence-thesis-vol3-the-providence-imperative.md",
    ];
    let displayLineCount = 0;
    let adaptedAttributionCount = 0;
    for (const sourceFile of sourceFiles) {
      const source = fs.readFileSync(path.join(repoRoot, sourceFile), "utf8");
      const structureText = new Set(
        extractStructureUnits(source)
          .filter((unit) => unit.unitType === "display-metadata")
          .map((unit) => unit.text),
      );
      const expected = source
        .split(/\r?\n/)
        .filter((line) =>
          /^\s{0,3}>\s*\S|^\s*[\u2013\u2014]\s+\S|^\s*(?:\*\*[^*]+\*\*|\*[^*]+\*)\s*$/.test(
            line,
          ),
        )
        .map((line) =>
          line
            .replace(/^\s*(?:>\s*)+/, "")
            .replace(/^\s*[\u2013\u2014]\s+/, "")
            .replace(/^\s*(?:\*\*|__|\*)/, "")
            .replace(/(?:\*\*|__|\*)\s*$/, "")
            .replace(/[*_`]/g, "")
            .replace(/\s+/g, " ")
            .trim(),
        );
      displayLineCount += expected.length;
      adaptedAttributionCount += expected.filter((text) =>
        /^(?:After|Adapted from)\b/.test(text),
      ).length;
      for (const text of expected) expect(structureText).toContain(text);
    }
    expect(displayLineCount).toBeGreaterThan(20);
    expect(adaptedAttributionCount).toBeGreaterThan(10);
  });

  it("validates complete baseline and current reconstruction", () => {
    const serialized = records().map((record) => JSON.stringify(record)).join("\n");
    const parsed = parseStructureLedger(serialized);
    expect(() =>
      validateStructureLedger(
        parsed,
        "sources/manuscripts/test.md",
        baseline,
        baseline,
        { requireApproved: true },
      ),
    ).not.toThrow();
  });

  it("rejects a completely omitted heading", () => {
    expect(() =>
      validateStructureLedger(
        records().slice(0, -1),
        "sources/manuscripts/test.md",
        baseline,
        baseline,
      ),
    ).toThrow(/covers 3 of 4 baseline units/);
  });

  it("rejects proposed headings that differ from the current source", () => {
    const changed = records();
    changed[2] = {
      ...changed[2]!,
      disposition: "recast",
      proposedText: ["Invented Heading"],
    };
    expect(() =>
      validateStructureLedger(
        changed,
        "sources/manuscripts/test.md",
        baseline,
        baseline,
      ),
    ).toThrow(/proposed structure text differs/);
  });

  it("requires an adjudicated route outcome before approving a rename", () => {
    const changedSource = baseline.replace("# First Heading", "# Better Heading");
    const changed = records();
    changed[2] = {
      ...changed[2]!,
      disposition: "recast",
      proposedText: ["Better Heading"],
      routeImpact: "renamed",
      routeOutcome: pendingStructureRouteOutcome,
    };
    expect(() =>
      validateStructureLedger(
        changed,
        "sources/manuscripts/test.md",
        baseline,
        changedSource,
        { requireApproved: true },
      ),
    ).toThrow(/adjudicated route outcome/);
  });
});
