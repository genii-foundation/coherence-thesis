import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  adjudicateSentenceRecords,
  adjudicateStructureRecords,
  assertCompletedIndependentReviews,
  authorityKinds,
} from "./editorial-ledger-adjudicate";
import type { SentenceLedgerRecord } from "./editorial-ledger";
import {
  pendingStructureRouteOutcome,
  type StructureLedgerRecord,
} from "./editorial-structure-ledger";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function sentence(
  overrides: Partial<SentenceLedgerRecord> = {},
): SentenceLedgerRecord {
  return {
    sourceFile: "sources/manuscripts/test.md",
    sourceHash: "a".repeat(64),
    sectionId: "section",
    sentenceOrdinal: 1,
    originalHash: "b".repeat(16),
    originalText: "The river bends around the stone.",
    disposition: "keep",
    proposedText: ["The river bends around the stone."],
    resultLocations: [{ sectionId: "section", sentenceOrdinal: 1 }],
    reasonCodes: ["exact-text-match"],
    claimTypes: [],
    claimInvariants: ["The river bends around the stone."],
    citationAttachments: [],
    risk: "low",
    reviewStatus: "pending",
    ...overrides,
  };
}

function structure(
  overrides: Partial<StructureLedgerRecord> = {},
): StructureLedgerRecord {
  return {
    sourceFile: "sources/manuscripts/test.md",
    sourceHash: "a".repeat(64),
    unitType: "heading",
    unitOrdinal: 1,
    originalHash: "b".repeat(16),
    originalText: "A Clear Heading",
    disposition: "keep",
    proposedText: ["A Clear Heading"],
    resultLocations: [
      {
        sourceFile: "sources/manuscripts/test.md",
        unitType: "heading",
        unitOrdinal: 1,
      },
    ],
    routeImpact: "unchanged",
    routeOutcome: "Canonical wording and public route are unchanged.",
    reviewStatus: "pending",
    ...overrides,
  };
}

function reconstructionFields(record: SentenceLedgerRecord) {
  return {
    sourceFile: record.sourceFile,
    sourceHash: record.sourceHash,
    sectionId: record.sectionId,
    sentenceOrdinal: record.sentenceOrdinal,
    originalHash: record.originalHash,
    originalText: record.originalText,
    disposition: record.disposition,
    proposedText: record.proposedText,
    resultLocations: record.resultLocations,
    groupId: record.groupId,
    citationAttachments: record.citationAttachments,
  };
}

function completedReviewDirectory(): string {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "editorial-ledger-review-"),
  );
  temporaryDirectories.push(directory);
  fs.writeFileSync(
    path.join(directory, "review.md"),
    "# Review\n\n## Independent review\n\nCompleted for editorial integration. Not publication approved.\n",
  );
  fs.writeFileSync(
    path.join(directory, "semantic-review.md"),
    "# Semantic review\n\n## Verdict\n\nPASS for editorial integration.\n",
  );
  fs.writeFileSync(
    path.join(directory, "literary-review.md"),
    "# Literary review\n\n## Verdict\n\nPASS for literary integrity.\n",
  );
  fs.writeFileSync(
    path.join(directory, "slop-review.md"),
    `${Array.from({ length: 24 }, (_, index) => `## 4.${index + 1}\n\nNo finding.`).join("\n\n")}\n\n## Verdict\n\nPASS across all categories.\n`,
  );
  return directory;
}

describe("editorial ledger adjudication", () => {
  it("requires all completed independent review artifacts", () => {
    const directory = completedReviewDirectory();
    expect(assertCompletedIndependentReviews(directory).files).toHaveLength(4);
    fs.rmSync(path.join(directory, "literary-review.md"));
    expect(() => assertCompletedIndependentReviews(directory)).toThrow(
      /missing literary-review\.md/,
    );
  });

  it("requires all twenty-four slop review categories", () => {
    const directory = completedReviewDirectory();
    fs.writeFileSync(
      path.join(directory, "slop-review.md"),
      "# Slop review\n\n## 4.1\n\nNo finding.\n\nVerdict: PASS.\n",
    );
    expect(() => assertCompletedIndependentReviews(directory)).toThrow(
      /lacks categories 4\.2/,
    );
  });

  it("approves unchanged low risk prose and reviews changed prose", () => {
    const changed = sentence({
      sentenceOrdinal: 2,
      originalHash: "c".repeat(16),
      originalText: "The room was quiet.",
      disposition: "recast",
      proposedText: ["The room grew quiet."],
      resultLocations: [{ sectionId: "section", sentenceOrdinal: 2 }],
      reasonCodes: ["changed-text-review-required"],
      risk: "high",
    });
    const records = adjudicateSentenceRecords([sentence(), changed]);
    expect(records[0]).toMatchObject({
      reviewStatus: "approved",
      risk: "low",
      reasonCodes: expect.arrayContaining([
        "independent-reviews-support-final-wording",
      ]),
    });
    expect(records[1]).toMatchObject({
      reviewStatus: "reviewed",
      risk: "medium",
      disposition: "recast",
      reasonCodes: expect.arrayContaining([
        "independent-reviews-complete-residual-risk-recorded",
      ]),
    });
    expect(records.every((record) => record.claimTypes.length > 0)).toBe(true);
    expect(records.every((record) => record.claimInvariants.length > 0)).toBe(
      true,
    );
  });

  it("marks every authority-sensitive claim class as a query", () => {
    const claims = [
      "A study measured 200 people.",
      "Trauma changes the nervous system.",
      "The constitution guarantees equal rights.",
      "In 1948 the institution changed.",
      'The witness wrote "The water remembers."',
      "Providence is currently deployed as a pilot.",
      "The system must preserve an unconditional floor.",
    ];
    const records = claims.map((text, index) =>
      sentence({
        sentenceOrdinal: index + 1,
        originalHash: `${index + 1}`.repeat(16).slice(0, 16),
        originalText: text,
        proposedText: [text],
        resultLocations: [
          { sectionId: "section", sentenceOrdinal: index + 1 },
        ],
      }),
    );
    const adjudicated = adjudicateSentenceRecords(records);
    expect(adjudicated.every((record) => record.reviewStatus === "query")).toBe(
      true,
    );
    expect(adjudicated.every((record) => record.risk === "high")).toBe(true);
    const classified = new Set(
      adjudicated.flatMap((record) =>
        record.reasonCodes
          .filter((code) => code.endsWith("required") || code.includes("verification"))
          .map((code) => code),
      ),
    );
    expect(classified.size).toBeGreaterThanOrEqual(authorityKinds.length);
  });

  it("preserves every reconstruction and citation field", () => {
    const initialized = sentence({
      disposition: "split",
      proposedText: ["The first result.", "The second result."],
      resultLocations: [
        { sectionId: "new-section", sentenceOrdinal: 1 },
        { sectionId: "new-section", sentenceOrdinal: 2 },
      ],
      reasonCodes: ["inserted-content-review-required"],
      citationAttachments: ["https://example.com/source"],
      risk: "high",
    });
    const before = reconstructionFields(initialized);
    const [after] = adjudicateSentenceRecords([initialized]);
    expect(reconstructionFields(after!)).toEqual(before);
    expect(after?.reviewStatus).toBe("query");
  });

  it("preserves merge groups while marking authority queries", () => {
    const shared = {
      disposition: "merge" as const,
      groupId: "merge-1",
      proposedText: ["The constitution preserves the right."],
      resultLocations: [{ sectionId: "section", sentenceOrdinal: 1 }],
      reasonCodes: ["merged-text-review-required"],
    };
    const first = sentence({
      ...shared,
      originalText: "The constitution sets the boundary.",
    });
    const second = sentence({
      ...shared,
      sentenceOrdinal: 2,
      originalHash: "c".repeat(16),
      originalText: "The right remains intact.",
    });
    const records = adjudicateSentenceRecords([first, second]);
    expect(records.map((record) => record.reviewStatus)).toEqual([
      "query",
      "query",
    ]);
    expect(records.map((record) => record.disposition)).toEqual([
      "merge",
      "merge",
    ]);
    expect(records.map((record) => record.groupId)).toEqual([
      "merge-1",
      "merge-1",
    ]);
  });

  it("rejects an already adjudicated sentence ledger", () => {
    expect(() =>
      adjudicateSentenceRecords([
        sentence({ reviewStatus: "reviewed" }),
      ]),
    ).toThrow(/only freshly initialized pending records/);
  });

  it("fills route outcomes without inventing route continuity", () => {
    const renamed = structure({
      unitOrdinal: 2,
      originalHash: "c".repeat(16),
      originalText: "Old Heading",
      disposition: "recast",
      proposedText: ["Better Heading"],
      resultLocations: [
        {
          sourceFile: "sources/manuscripts/test.md",
          unitType: "heading",
          unitOrdinal: 2,
        },
      ],
      routeImpact: "renamed",
      routeOutcome: pendingStructureRouteOutcome,
    });
    const display = structure({
      unitType: "display-metadata",
      unitOrdinal: 3,
      originalHash: "d".repeat(16),
      originalText: "Old subtitle",
      disposition: "recast",
      proposedText: ["Clear subtitle"],
      resultLocations: [
        {
          sourceFile: "sources/manuscripts/test.md",
          unitType: "display-metadata",
          unitOrdinal: 3,
        },
      ],
      routeImpact: "not-public",
      routeOutcome: "No public route is attached to this display unit.",
    });
    const records = adjudicateStructureRecords([
      structure(),
      renamed,
      display,
    ]);
    expect(records[0]?.reviewStatus).toBe("approved");
    expect(records[1]).toMatchObject({
      disposition: "recast",
      routeImpact: "renamed",
      reviewStatus: "query",
      routeOutcome: expect.stringMatching(/explicit link preservation evidence/),
    });
    expect(records[2]).toMatchObject({
      reviewStatus: "reviewed",
      routeOutcome: expect.stringMatching(/No independent public route/),
    });
    expect(
      records.every(
        (record) => record.routeOutcome !== pendingStructureRouteOutcome,
      ),
    ).toBe(true);
  });
});
