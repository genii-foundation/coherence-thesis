import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { extractEditorialSentences } from "./editorial-lint";
import {
  loadSentenceSections,
  parseSentenceLedger,
  resolveImmutableEditorialBase,
  runSentenceLedgerCli,
  validateSentenceLedger,
  validateSentenceLedgerCoverage,
  validateSentenceLedgerCurrent,
  type BaselineSentenceSection,
  type SentenceLedgerRecord,
} from "./editorial-ledger";
import { repoRoot, sha256 } from "./shared";

function record(
  overrides: Partial<SentenceLedgerRecord> = {},
): SentenceLedgerRecord {
  return {
    sourceFile: "sources/manuscripts/test.md",
    sourceHash: "a".repeat(64),
    sectionId: "section",
    sentenceOrdinal: 1,
    originalHash: "b".repeat(16),
    originalText: "The sentence remains.",
    disposition: "keep",
    proposedText: ["The sentence remains."],
    resultLocations: [{ sectionId: "section", sentenceOrdinal: 1 }],
    reasonCodes: ["unchanged"],
    claimTypes: ["factual"],
    claimInvariants: ["Preserve the stated fact."],
    citationAttachments: [],
    risk: "low",
    reviewStatus: "approved",
    ...overrides,
  };
}

describe("editorial sentence ledger", () => {
  const baseline: BaselineSentenceSection[] = [
    {
      sourceFile: "sources/manuscripts/test.md",
      sourceHash: "a".repeat(64),
      sectionId: "section",
      sentences: ["The sentence remains.", "The second sentence."],
    },
  ];

  it("parses and validates a complete record", () => {
    const records = parseSentenceLedger(JSON.stringify(record()));
    expect(() => validateSentenceLedger(records, "ledger.jsonl")).not.toThrow();
  });

  it("requires exact text for a kept sentence", () => {
    expect(() =>
      parseSentenceLedger(
        JSON.stringify(record({ proposedText: ["A changed sentence."] })),
      ),
    ).toThrow(/preserve the exact original text/);
  });

  it("rejects empty proposed text for every nonremoved disposition", () => {
    expect(() =>
      parseSentenceLedger(
        JSON.stringify(record({ disposition: "recast", proposedText: [] })),
      ),
    ).toThrow(/nonremoved sentence.*nonempty proposed text/);
  });

  it("validates shared results for merged inputs", () => {
    const first = record({
      disposition: "merge",
      groupId: "merge-1",
      proposedText: ["The sentences become one."],
    });
    const second = record({
      sentenceOrdinal: 2,
      originalHash: "c".repeat(16),
      originalText: "The second sentence.",
      disposition: "merge",
      groupId: "merge-1",
      proposedText: ["The sentences become one."],
      resultLocations: [{ sectionId: "section", sentenceOrdinal: 1 }],
    });
    expect(() => validateSentenceLedger([first, second])).not.toThrow();
  });

  it("can require every sentence to be approved", () => {
    expect(() =>
      validateSentenceLedger([record({ reviewStatus: "reviewed" })], "ledger", {
        requireApproved: true,
      }),
    ).toThrow(/not approved/);
  });

  it("requires approval evidence for each sentence", () => {
    expect(() =>
      validateSentenceLedger(
        [record({ claimTypes: [] })],
        "ledger",
        { requireApproved: true },
      ),
    ).toThrow(/explicit claim type/);
  });

  it("keeps unresolved queries visibly unresolved", () => {
    expect(() =>
      parseSentenceLedger(
        JSON.stringify(
          record({ disposition: "query", reviewStatus: "approved" }),
        ),
      ),
    ).toThrow(/query disposition requires query reviewStatus/);
  });

  it("preserves a known disposition while authority remains a query", () => {
    expect(() =>
      parseSentenceLedger(
        JSON.stringify(
          record({
            disposition: "recast",
            proposedText: ["The reviewed wording remains unverified."],
            reviewStatus: "query",
          }),
        ),
      ),
    ).not.toThrow();
  });

  it("proves complete ordered coverage against the baseline", () => {
    const first = record({ originalHash: "a0ba06a91bc67af4" });
    const second = record({
      sentenceOrdinal: 2,
      originalText: "The second sentence.",
      originalHash: "f7b0310288be9fad",
      proposedText: ["The second sentence."],
      resultLocations: [{ sectionId: "section", sentenceOrdinal: 2 }],
    });

    expect(() =>
      validateSentenceLedgerCoverage([first, second], baseline),
    ).not.toThrow();
  });

  it("rejects a ledger that covers only a sample of a section", () => {
    expect(() =>
      validateSentenceLedgerCoverage(
        [record({ originalHash: "a0ba06a91bc67af4" })],
        baseline,
      ),
    ).toThrow(/covers 1 of 2 baseline sentence/);
  });

  it("rejects a declared section that has no records", () => {
    const expanded = [
      ...baseline,
      {
        sourceFile: "sources/manuscripts/test.md",
        sourceHash: "a".repeat(64),
        sectionId: "omitted",
        sentences: ["This section was omitted."],
      },
    ];

    expect(() =>
      validateSentenceLedgerCoverage(
        [
          record({ originalHash: "a0ba06a91bc67af4" }),
          record({
            sentenceOrdinal: 2,
            originalText: "The second sentence.",
            originalHash: "f7b0310288be9fad",
            proposedText: ["The second sentence."],
            resultLocations: [{ sectionId: "section", sentenceOrdinal: 2 }],
          }),
        ],
        expanded,
        "ledger",
        { requiredSectionIds: ["section", "omitted"] },
      ),
    ).toThrow(/declared section 'omitted' has no records/);
  });

  it("proves that proposed sentences reconstruct the current scope", () => {
    const records = [
      record({ originalHash: "a0ba06a91bc67af4" }),
      record({
        sentenceOrdinal: 2,
        originalText: "The second sentence.",
        originalHash: "f7b0310288be9fad",
        proposedText: ["A clearer second sentence."],
        resultLocations: [{ sectionId: "section", sentenceOrdinal: 2 }],
        disposition: "recast",
      }),
    ];
    const current = [
      {
        ...baseline[0]!,
        sentences: ["The sentence remains.", "A clearer second sentence."],
      },
    ];

    expect(() =>
      validateSentenceLedgerCurrent(records, current, ["section"]),
    ).not.toThrow();
  });

  it("rejects proposed text that differs from the current manuscript", () => {
    const current = [
      {
        ...baseline[0]!,
        sentences: ["The sentence remains.", "The second sentence."],
      },
    ];
    const records = [
      record({ originalHash: "a0ba06a91bc67af4" }),
      record({
        sentenceOrdinal: 2,
        originalText: "The second sentence.",
        originalHash: "f7b0310288be9fad",
        proposedText: ["An invented revision."],
        resultLocations: [{ sectionId: "section", sentenceOrdinal: 2 }],
        disposition: "recast",
      }),
    ];

    expect(() =>
      validateSentenceLedgerCurrent(records, current, ["section"]),
    ).toThrow(/proposed text does not match current result/);
  });

  it("rejects baseline text drift", () => {
    const records = [
      record({ originalHash: "a0ba06a91bc67af4" }),
      record({
        sentenceOrdinal: 2,
        originalText: "A substituted sentence.",
        originalHash: "f7b0310288be9fad",
        proposedText: ["A substituted sentence."],
      }),
    ];

    expect(() =>
      validateSentenceLedgerCoverage(records, baseline),
    ).toThrow(/does not match the baseline text/);
  });

  it("accounts for source sentences omitted from generated reader sections", () => {
    const sourceFiles = [
      "sources/manuscripts/coherence-thesis-vol1-humanitys-most-viable-future.md",
      "sources/manuscripts/coherence-thesis-vol2-wielding-intelligence.md",
      "sources/manuscripts/coherence-thesis-vol3-the-providence-imperative.md",
      "sources/manuscripts/coherence-thesis-master-ledger.md",
    ];
    const sections = loadSentenceSections("WORKTREE", sourceFiles);

    for (const sourceFile of sourceFiles) {
      const sourceSentences = extractEditorialSentences(
        fs.readFileSync(path.join(repoRoot, sourceFile), "utf8"),
      );
      const loadedSentences = sections
        .filter((section) => section.sourceFile === sourceFile)
        .flatMap((section) => section.sentences);
      expect(
        new Set(
          sections
            .filter((section) => section.sourceFile === sourceFile)
            .map((section) => section.sourceHash),
        ),
        `${sourceFile}: every sentence section must use the same source hash`,
      ).toEqual(new Set([sha256(fs.readFileSync(path.join(repoRoot, sourceFile)))]));
      const remaining = new Map<string, number>();
      for (const sentence of sourceSentences) {
        remaining.set(sentence, (remaining.get(sentence) ?? 0) + 1);
      }
      for (const sentence of loadedSentences) {
        const count = remaining.get(sentence) ?? 0;
        expect(count, `${sourceFile}: unexpected loaded sentence '${sentence}'`).toBeGreaterThan(0);
        remaining.set(sentence, count - 1);
      }
      expect(
        [...remaining.values()].reduce((total, count) => total + count, 0),
        `${sourceFile}: source sentences missing from ledger scope`,
      ).toBe(0);
    }

    const master = sections.filter(
      (section) =>
        section.sourceFile ===
        "sources/manuscripts/coherence-thesis-master-ledger.md",
    );
    expect(master).toHaveLength(1);
    expect(master[0]?.sectionId).toMatch(/:unpublished$/);
    expect(master[0]?.sentences.length).toBeGreaterThan(0);
  }, 20_000);

  it("requires immutable and current scope before approval validation", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(
        runSentenceLedgerCli(["--require-approved", "ledger.jsonl"]),
      ).toBe(1);
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(/requires --base .* --current/),
      );

      error.mockClear();
      expect(
        runSentenceLedgerCli([
          "--base",
          "HEAD",
          "--current",
          "WORKTREE",
          "--require-approved",
          "ledger.jsonl",
        ]),
      ).toBe(1);
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(/requires a declared baseline scope/),
      );

      error.mockClear();
      expect(
        runSentenceLedgerCli([
          "--base",
          "WORKTREE",
          "--current",
          "WORKTREE",
          "--source",
          "sources/manuscripts/coherence-thesis-vol1-humanitys-most-viable-future.md",
          "ledger.jsonl",
        ]),
      ).toBe(1);
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(/immutable commit, not WORKTREE/),
      );
    } finally {
      error.mockRestore();
    }
  });

  it("resolves a symbolic baseline once to an immutable commit", () => {
    expect(resolveImmutableEditorialBase("HEAD")).toMatch(/^[0-9a-f]{40}$/);
  });
});
