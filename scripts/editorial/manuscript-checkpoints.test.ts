import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  parseManuscriptCheckpointManifest,
  validateManuscriptCheckpoints,
  type ManuscriptCheckpointManifest,
} from "./manuscript-checkpoints";

const roots: string[] = [];

function fixture(): {
  manifest: ManuscriptCheckpointManifest;
  root: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "manuscript-checkpoints-"));
  roots.push(root);
  const volumes = Array.from({ length: 9 }, (_, index) => {
    const editorialId = `volume-${String(index + 1).padStart(2, "0")}`;
    const snapshotPath = `${editorialId}.md`;
    const source = `# ${editorialId}\n`;
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
        },
      ],
    };
  });
  return { root, manifest: { schemaVersion: 1, volumes } };
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
    });
    expect(() => validateManuscriptCheckpoints(manifest, root)).toThrow(
      "published parent must be an earlier checkpoint",
    );
  });

  it("fails when a permanent snapshot changes", () => {
    const { manifest, root } = fixture();
    fs.writeFileSync(path.join(root, "volume-01.md"), "# changed\n");
    expect(() => validateManuscriptCheckpoints(manifest, root)).toThrow(
      "snapshot hash",
    );
  });
});
