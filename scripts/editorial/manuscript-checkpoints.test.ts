import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  latestCheckpointForVolume,
  parseManuscriptCheckpointManifest,
  validateManuscriptCheckpoints,
  type ManuscriptCheckpointManifest,
} from "./manuscript-checkpoints";

const roots: string[] = [];

function fixture(): {
  manifest: ManuscriptCheckpointManifest;
  root: string;
} {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "manuscript-checkpoints-"),
  );
  roots.push(root);
  const volumes = Array.from({ length: 9 }, (_, index) => {
    const editorialId = `volume-${String(index + 1).padStart(2, "0")}`;
    const snapshotPath = `editorial/evidence/checkpoints/${editorialId}/original/manuscript.md`;
    const source = `# ${editorialId}\n`;
    fs.mkdirSync(path.dirname(path.join(root, snapshotPath)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(root, snapshotPath), source);
    return {
      editorialId,
      originalCheckpointId: `${editorialId}/original`,
      checkpoints: [
        {
          checkpointId: `${editorialId}/original`,
          kind: "original" as const,
          parentCheckpointId: null,
          commit: "a".repeat(40),
          sourcePath: `sources/${editorialId}.md`,
          snapshotPath,
          sha256: createHash("sha256").update(source).digest("hex"),
          approvalRecordPath: null,
          approvedAt: null,
          publishedAt: null,
        },
      ],
      approvedCandidate: null,
    };
  });
  return { root, manifest: { schemaVersion: 2, volumes } };
}

function addApprovedCandidate(
  manifest: ManuscriptCheckpointManifest,
  root: string,
): void {
  const volume = manifest.volumes[0]!;
  const source = "# approved\n";
  const snapshotPath =
    "editorial/evidence/checkpoints/volume-01/revision-one/manuscript.md";
  const approvalRecordPath =
    "editorial/evidence/publication-approvals/volume-01/revision-one.json";
  const sha256 = createHash("sha256").update(source).digest("hex");
  fs.mkdirSync(path.dirname(path.join(root, snapshotPath)), {
    recursive: true,
  });
  fs.writeFileSync(path.join(root, snapshotPath), source);
  fs.mkdirSync(path.dirname(path.join(root, approvalRecordPath)), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, approvalRecordPath),
    `${JSON.stringify({
      schemaVersion: 1,
      approvalId: "volume-01/revision-one",
      editorialId: "volume-01",
      checkpointId: "volume-01/revision-one",
      parentCheckpointId: "volume-01/original",
      sourcePath: "editorial/sources/volumes/volume-01/manuscript.md",
      sha256,
      approvedBy: "author",
      approvedAt: "2026-07-30",
      evidencePaths: [],
    })}\n`,
  );
  volume.approvedCandidate = {
    checkpointId: "volume-01/revision-one",
    parentCheckpointId: "volume-01/original",
    commit: "b".repeat(40),
    sourcePath: "editorial/sources/volumes/volume-01/manuscript.md",
    snapshotPath,
    sha256,
    approvalRecordPath,
    approvedAt: "2026-07-30",
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("manuscript checkpoints", () => {
  it("accepts one immutable original per volume", () => {
    const { manifest, root } = fixture();
    expect(() => validateManuscriptCheckpoints(manifest, root)).not.toThrow();
    expect(parseManuscriptCheckpointManifest(manifest)).toEqual(manifest);
  });

  it("requires published checkpoints to descend from an earlier checkpoint", () => {
    const { manifest, root } = fixture();
    manifest.volumes[0]?.checkpoints.push({
      checkpointId: "volume-01/published-2026-07-30",
      kind: "published",
      parentCheckpointId: "volume-01/missing",
      commit: "b".repeat(40),
      sourcePath: "editorial/sources/volumes/volume-01/manuscript.md",
      snapshotPath: "volume-01.md",
      sha256: manifest.volumes[0]?.checkpoints[0]?.sha256 ?? "",
      approvalRecordPath:
        "editorial/evidence/publication-approvals/volume-01/missing.json",
      approvedAt: "2026-07-30",
      publishedAt: "2026-07-30",
    });
    expect(() => validateManuscriptCheckpoints(manifest, root)).toThrow(
      "published parent must be the preceding checkpoint",
    );
  });

  it("keeps an approved candidate out of the published base chain", () => {
    const { manifest, root } = fixture();
    addApprovedCandidate(manifest, root);
    expect(() => validateManuscriptCheckpoints(manifest, root)).not.toThrow();
    expect(latestCheckpointForVolume("volume-01", manifest).checkpointId).toBe(
      "volume-01/original",
    );
  });

  it("requires explicit author approval evidence for a candidate", () => {
    const { manifest, root } = fixture();
    addApprovedCandidate(manifest, root);
    const approvalPath = path.join(
      root,
      manifest.volumes[0]!.approvedCandidate!.approvalRecordPath,
    );
    const approval = JSON.parse(fs.readFileSync(approvalPath, "utf8")) as {
      approvedBy: string;
    };
    approval.approvedBy = "editorial-agent";
    fs.writeFileSync(approvalPath, `${JSON.stringify(approval)}\n`);
    expect(() => validateManuscriptCheckpoints(manifest, root)).toThrow(
      "approval does not match",
    );
  });

  it("fails when a permanent snapshot changes", () => {
    const { manifest, root } = fixture();
    fs.writeFileSync(
      path.join(
        root,
        "editorial/evidence/checkpoints/volume-01/original/manuscript.md",
      ),
      "# changed\n",
    );
    expect(() => validateManuscriptCheckpoints(manifest, root)).toThrow(
      "snapshot hash",
    );
  });
});
