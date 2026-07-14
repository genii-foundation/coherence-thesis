import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditRepositoryLayout,
  validateRepositoryLayout,
  type RepositoryLayoutPaths,
} from "./layout";

function fixturePaths(root: string): RepositoryLayoutPaths {
  const editorialRoot = path.join(root, "editorial");
  const editorialSourcesRoot = path.join(editorialRoot, "sources");
  const publishingRoot = path.join(root, "publishing");
  const continuityRoot = path.join(publishingRoot, "continuity");

  return {
    repoRoot: root,
    editorialRoot,
    editorialSourcesRoot,
    editorialCorpusRoot: path.join(editorialSourcesRoot, "corpus"),
    editorialOverviewRoot: path.join(editorialSourcesRoot, "overview"),
    editorialVolumesRoot: path.join(editorialSourcesRoot, "volumes"),
    masterLedgerPath: path.join(
      editorialSourcesRoot,
      "corpus/master-ledger.md",
    ),
    overviewPath: path.join(
      editorialSourcesRoot,
      "overview/coherence-thesis.json",
    ),
    publishingFiles: [
      path.join(continuityRoot, "aliases.json"),
      path.join(continuityRoot, "historical-section-mappings.json"),
      path.join(continuityRoot, "route-aliases.json"),
      path.join(continuityRoot, "route-ledger.json"),
      path.join(continuityRoot, "section-ledger.json"),
      path.join(continuityRoot, "section-lineage.json"),
      path.join(continuityRoot, "version-provenance.json"),
      path.join(publishingRoot, "audio/manifest.json"),
      path.join(publishingRoot, "updates/snapshot.json"),
    ],
    retiredCanonicalRoots: [
      path.join(root, "sources/manuscripts"),
      path.join(root, "content/series"),
      path.join(root, "content/overview"),
      path.join(editorialRoot, "voice-cards"),
    ],
  };
}

function writeFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function createValidFixture(paths: RepositoryLayoutPaths): void {
  writeFile(paths.masterLedgerPath, "# Master ledger\n");
  writeFile(paths.overviewPath, "{}\n");

  for (let order = 1; order <= 9; order += 1) {
    const editorialId = `volume-${String(order).padStart(2, "0")}`;
    const packagePath = path.join(paths.editorialVolumesRoot, editorialId);
    const sourcePath = `editorial/sources/volumes/${editorialId}/manuscript.md`;
    const voiceCardPath = `editorial/sources/volumes/${editorialId}/voice-card.md`;
    writeFile(path.join(packagePath, "manuscript.md"), `# Volume ${order}\n`);
    writeFile(path.join(packagePath, "voice-card.md"), `# Voice ${order}\n`);
    writeFile(
      path.join(packagePath, "volume.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          editorialId,
          volumeId: `volume-id-${order}`,
          order,
          sourcePath,
          voiceCardPath,
          historicalSourcePaths: [`sources/manuscripts/volume-${order}.md`],
        },
        null,
        2,
      )}\n`,
    );
  }

  for (const publishingPath of paths.publishingFiles) {
    writeFile(publishingPath, "{}\n");
  }
}

describe("repository layout validation", () => {
  let root: string;
  let paths: RepositoryLayoutPaths;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "coherence-layout-"));
    paths = fixturePaths(root);
    createValidFixture(paths);
  });

  afterEach(() => {
    fs.rmSync(root, { force: true, recursive: true });
  });

  it("accepts the complete nine volume layout", () => {
    const audit = validateRepositoryLayout(paths);

    expect(audit.issues).toEqual([]);
    expect(audit.volumePackages).toEqual(
      Array.from(
        { length: 9 },
        (_, index) => `volume-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(audit.sourceFiles).toHaveLength(29);
    expect(audit.publishingFiles).toHaveLength(9);
  });

  it("reports missing package and publishing files", () => {
    fs.rmSync(
      path.join(paths.editorialVolumesRoot, "volume-04/voice-card.md"),
    );
    fs.rmSync(paths.publishingFiles[2]!);

    const audit = auditRepositoryLayout(paths);

    expect(audit.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-source-file",
          path: "editorial/sources/volumes/volume-04/voice-card.md",
        }),
        expect.objectContaining({
          code: "missing-publishing-file",
          path: "publishing/continuity/route-aliases.json",
        }),
      ]),
    );
  });

  it("rejects extra packages and duplicate manifest references", () => {
    fs.mkdirSync(path.join(paths.editorialVolumesRoot, "volume-10"));
    const volumeTwoManifest = path.join(
      paths.editorialVolumesRoot,
      "volume-02/volume.json",
    );
    const manifest = JSON.parse(
      fs.readFileSync(volumeTwoManifest, "utf8"),
    ) as Record<string, unknown>;
    manifest.sourcePath =
      "editorial/sources/volumes/volume-01/manuscript.md";
    fs.writeFileSync(
      volumeTwoManifest,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const audit = auditRepositoryLayout(paths);

    expect(audit.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "volume-count" }),
        expect.objectContaining({
          code: "unexpected-volume-entry",
          path: "editorial/sources/volumes/volume-10",
        }),
        expect.objectContaining({
          code: "duplicate-source",
          path: "editorial/sources/volumes/volume-02/volume.json",
        }),
      ]),
    );
  });

  it("rejects retired canonical roots", () => {
    fs.mkdirSync(paths.retiredCanonicalRoots[0]!, { recursive: true });
    fs.mkdirSync(paths.retiredCanonicalRoots[3]!, { recursive: true });

    const audit = auditRepositoryLayout(paths);

    expect(
      audit.issues.filter(
        (issue) => issue.code === "retired-canonical-root",
      ),
    ).toEqual([
      expect.objectContaining({ path: "editorial/voice-cards" }),
      expect.objectContaining({ path: "sources/manuscripts" }),
    ]);
  });

  it("rejects symbolic links in the source tree", () => {
    const volumeOneSource = path.join(
      paths.editorialVolumesRoot,
      "volume-01/manuscript.md",
    );
    const volumeTwoSource = path.join(
      paths.editorialVolumesRoot,
      "volume-02/manuscript.md",
    );
    fs.rmSync(volumeOneSource);
    fs.symlinkSync(volumeTwoSource, volumeOneSource);

    const audit = auditRepositoryLayout(paths);

    expect(audit.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "source-symlink",
          path: "editorial/sources/volumes/volume-01/manuscript.md",
        }),
      ]),
    );
  });

  it("rejects hard linked canonical source files", () => {
    const volumeOneSource = path.join(
      paths.editorialVolumesRoot,
      "volume-01/manuscript.md",
    );
    const volumeTwoSource = path.join(
      paths.editorialVolumesRoot,
      "volume-02/manuscript.md",
    );
    fs.rmSync(volumeTwoSource);
    fs.linkSync(volumeOneSource, volumeTwoSource);

    const audit = auditRepositoryLayout(paths);

    expect(audit.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate-source",
          path: "editorial/sources/volumes/volume-02/manuscript.md",
        }),
      ]),
    );
  });
});
