import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validateEditorialRepository,
  type EditorialValidationOptions,
  type ReviewManifest,
  type SentenceSectionsLoader,
} from "./validate";

const temporaryRoots: string[] = [];
const baselineCommit = "a".repeat(40);
const batchId = "2026-07-09-test";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function voiceCard(approval = "pending author review"): string {
  return `# Voice Card

## Identity

Identity guidance.

## Register

Register guidance.

## Cadence

Cadence guidance.

## Language

Language guidance.

## Images and structure

Image guidance.

## Controls

Control guidance.

## Approval

- Author approved: ${approval}
`;
}

type Fixture = {
  root: string;
  volumesRoot: string;
  reviewsRoot: string;
  options: EditorialValidationOptions;
  loadSections: ReturnType<typeof vi.fn<SentenceSectionsLoader>>;
  packageDirectory: (index: number) => string;
  batchDirectory: (index: number) => string;
  refreshEvidence: (index: number) => void;
  setBatchApproval: (index: number, approvalState: "pending" | "approved") => void;
};

function buildFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coherence-editorial-validate-"));
  temporaryRoots.push(root);
  const volumesRoot = path.join(root, "editorial/sources/volumes");
  const reviewsRoot = path.join(root, "editorial/reviews");
  const baselineSources = new Map<string, string>();
  const sourceDetails = new Map<
    string,
    { canonical: string; historical: string; hash: string; sectionId: string }
  >();

  const packageDirectory = (index: number) =>
    path.join(volumesRoot, `volume-${String(index).padStart(2, "0")}`);
  const batchDirectory = (index: number) =>
    path.join(
      reviewsRoot,
      "volumes",
      `volume-${String(index).padStart(2, "0")}`,
      batchId,
    );

  for (let index = 1; index <= 9; index += 1) {
    const number = String(index).padStart(2, "0");
    const editorialId = `volume-${number}`;
    const directory = packageDirectory(index);
    const canonical = `editorial/sources/volumes/${editorialId}/manuscript.md`;
    const voiceCardPath = `editorial/sources/volumes/${editorialId}/voice-card.md`;
    const historical = `sources/manuscripts/volume-${number}.md`;
    const source = `# Volume ${number}\n\nA sentence.\n`;
    const hash = sha256(source);
    const sectionId = `v${number}-example`;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "manuscript.md"), source);
    fs.writeFileSync(path.join(directory, "voice-card.md"), voiceCard());
    writeJson(path.join(directory, "volume.json"), {
      schemaVersion: 1,
      editorialId,
      volumeId: `volume-${number}-title`,
      title: `Volume ${number}`,
      subtitle: `Subtitle ${number}`,
      order: index,
      numberLabel: number,
      planet: `Planet ${number}`,
      coverImage: `/art/volume-${number}.png`,
      coverAlt: `Cover for volume ${number}.`,
      sourcePath: canonical,
      voiceCardPath,
      historicalSourcePaths: [historical],
      import: { startMarkers: [`Volume ${number}`] },
    });
    baselineSources.set(historical, source);
    sourceDetails.set(canonical, { canonical, historical, hash, sectionId });
    sourceDetails.set(historical, { canonical, historical, hash, sectionId });

    const batch = batchDirectory(index);
    fs.mkdirSync(batch, { recursive: true });
    fs.writeFileSync(path.join(batch, "review.md"), `# Review ${number}\n`);
    fs.writeFileSync(
      path.join(batch, "sentence-ledger.jsonl"),
      `${JSON.stringify({
        sourceFile: historical,
        sourceHash: hash,
        sectionId,
        sentenceOrdinal: 1,
        originalHash: sha256("A sentence.").slice(0, 16),
        originalText: "A sentence.",
        disposition: "keep",
        proposedText: ["A sentence."],
        resultLocations: [{ sectionId, sentenceOrdinal: 1 }],
        reasonCodes: ["reviewed-keep"],
        claimTypes: ["descriptive"],
        claimInvariants: ["Preserve the sentence."],
        citationAttachments: [],
        risk: "low",
        reviewStatus: "reviewed",
      })}\n`,
    );
    fs.writeFileSync(
      path.join(batch, "structure-ledger.jsonl"),
      `${JSON.stringify({
        sourceFile: historical,
        sourceHash: hash,
        unitType: "heading",
        unitOrdinal: 1,
        originalHash: sha256(`Volume ${number}`).slice(0, 16),
        originalText: `Volume ${number}`,
        disposition: "keep",
        proposedText: [`Volume ${number}`],
        resultLocations: [
          { sourceFile: historical, unitType: "heading", unitOrdinal: 1 },
        ],
        routeImpact: "unchanged",
        routeOutcome: "The public route is unchanged.",
        reviewStatus: "reviewed",
      })}\n`,
    );
    const evidence = [
      "review.md",
      "sentence-ledger.jsonl",
      "structure-ledger.jsonl",
    ].map((evidencePath) => ({
      path: evidencePath,
      sha256: sha256(fs.readFileSync(path.join(batch, evidencePath))),
    }));
    writeJson(path.join(batch, "review.json"), {
      schemaVersion: 1,
      batchId,
      editorialId,
      approvalState: "pending",
      standing: "current",
      scope: {
        coverage: "complete-volume",
        sentenceRecords: 1,
        structureRecords: 1,
      },
      validationState: "validated",
      openQueryCount: 0,
      residualRisk: "low",
      publicationState: "unpublished",
      baseline: { commit: baselineCommit, path: historical, sha256: hash },
      reviewed: { commit: null, path: canonical, sha256: hash },
      canonicalSourcePath: canonical,
      evidence,
    } satisfies ReviewManifest);
  }

  const loadSections = vi.fn<SentenceSectionsLoader>((ref, sourceFiles) => {
    const requested = sourceDetails.get(sourceFiles[0]!);
    if (!requested) throw new Error(`Unknown fixture source ${sourceFiles[0]}.`);
    return [
      {
        sourceFile: ref === "WORKTREE" ? requested.canonical : requested.historical,
        sourceHash: requested.hash,
        sectionId: requested.sectionId,
        sentences: ["A sentence."],
        citationAttachments: [[]],
      },
    ];
  });

  const refreshEvidence = (index: number) => {
    const batch = batchDirectory(index);
    const manifestPath = path.join(batch, "review.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ReviewManifest;
    manifest.evidence = manifest.evidence.map((evidence) => ({
      path: evidence.path,
      sha256: sha256(fs.readFileSync(path.join(batch, evidence.path))),
    }));
    writeJson(manifestPath, manifest);
  };

  const setBatchApproval = (
    index: number,
    approvalState: "pending" | "approved",
  ) => {
    const batch = batchDirectory(index);
    for (const ledger of ["sentence-ledger.jsonl", "structure-ledger.jsonl"]) {
      const ledgerPath = path.join(batch, ledger);
      const record = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
      record.reviewStatus = approvalState === "approved" ? "approved" : "reviewed";
      fs.writeFileSync(ledgerPath, `${JSON.stringify(record)}\n`);
    }
    const manifestPath = path.join(batch, "review.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ReviewManifest;
    manifest.approvalState = approvalState;
    writeJson(manifestPath, manifest);
    refreshEvidence(index);
  };

  return {
    root,
    volumesRoot,
    reviewsRoot,
    packageDirectory,
    batchDirectory,
    refreshEvidence,
    setBatchApproval,
    loadSections,
    options: {
      root,
      volumesRoot,
      reviewsRoot,
      expectedLedgerRecordCount: 18,
      readRevisionFile: (_commit, sourcePath) => {
        const source = baselineSources.get(sourcePath);
        if (!source) throw new Error(`Unknown baseline source ${sourcePath}.`);
        return Buffer.from(source);
      },
      loadSections,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("editorial repository validation", () => {
  it("validates nine stable packages and complete pending review evidence", () => {
    const fixture = buildFixture();

    expect(validateEditorialRepository(fixture.options)).toEqual({
      volumePackageCount: 9,
      reviewBatchCount: 9,
      pendingVoiceCardCount: 9,
      approvedVoiceCardCount: 0,
      pendingReviewBatchCount: 9,
      approvedReviewBatchCount: 0,
      sentenceRecordCount: 9,
      structureRecordCount: 9,
      totalLedgerRecordCount: 18,
    });
  });

  it("rejects source path lineage shared by two volume manifests", () => {
    const fixture = buildFixture();
    const first = JSON.parse(
      fs.readFileSync(path.join(fixture.packageDirectory(1), "volume.json"), "utf8"),
    );
    const secondPath = path.join(fixture.packageDirectory(2), "volume.json");
    const second = JSON.parse(fs.readFileSync(secondPath, "utf8"));
    second.historicalSourcePaths = first.historicalSourcePaths;
    writeJson(secondPath, second);

    expect(() => validateEditorialRepository(fixture.options)).toThrow(
      "source path lineage is shared",
    );
  });

  it("rejects stale review evidence hashes", () => {
    const fixture = buildFixture();
    const manifestPath = path.join(fixture.batchDirectory(1), "review.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ReviewManifest;
    manifest.evidence[0]!.sha256 = "0".repeat(64);
    writeJson(manifestPath, manifest);

    expect(() => validateEditorialRepository(fixture.options)).toThrow(
      "SHA-256 mismatch",
    );
  });

  it("rejects immutable ledger paths that have no manifest lineage", () => {
    const fixture = buildFixture();
    const ledgerPath = path.join(
      fixture.batchDirectory(1),
      "sentence-ledger.jsonl",
    );
    const record = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    record.sourceFile = "sources/manuscripts/orphan.md";
    fs.writeFileSync(ledgerPath, `${JSON.stringify(record)}\n`);
    fixture.refreshEvidence(1);

    expect(() => validateEditorialRepository(fixture.options)).toThrow(
      "has no volume manifest lineage",
    );
  });

  it("validates baseline hashes at pending state", () => {
    const fixture = buildFixture();
    const manifestPath = path.join(fixture.batchDirectory(1), "review.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ReviewManifest;
    manifest.baseline.sha256 = "0".repeat(64);
    writeJson(manifestPath, manifest);

    expect(() => validateEditorialRepository(fixture.options)).toThrow(
      "at aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: SHA-256 mismatch",
    );
  });

  it("defers reviewed source availability and hashes until approval", () => {
    const fixture = buildFixture();
    const manifestPath = path.join(fixture.batchDirectory(1), "review.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ReviewManifest;
    manifest.reviewed.sha256 = "0".repeat(64);
    writeJson(manifestPath, manifest);

    expect(validateEditorialRepository(fixture.options).pendingReviewBatchCount).toBe(9);

    fixture.setBatchApproval(1, "approved");
    expect(() => validateEditorialRepository(fixture.options)).toThrow(
      "SHA-256 mismatch",
    );
  });

  it("skips current reconstruction until a batch is approved", () => {
    const fixture = buildFixture();

    validateEditorialRepository(fixture.options);
    expect(fixture.loadSections.mock.calls.some(([ref]) => ref === "WORKTREE")).toBe(
      false,
    );

    fixture.loadSections.mockClear();
    fixture.setBatchApproval(1, "approved");
    const report = validateEditorialRepository(fixture.options);
    expect(report.approvedReviewBatchCount).toBe(1);
    expect(fixture.loadSections.mock.calls.some(([ref]) => ref === "WORKTREE")).toBe(
      true,
    );
  });

  it("requires an explicit voice card approval state", () => {
    const fixture = buildFixture();
    fs.writeFileSync(
      path.join(fixture.packageDirectory(1), "voice-card.md"),
      voiceCard("undecided"),
    );

    expect(() => validateEditorialRepository(fixture.options)).toThrow(
      "Author approved must begin with pending or approved",
    );
  });
});
