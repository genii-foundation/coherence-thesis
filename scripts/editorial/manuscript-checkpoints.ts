#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  editorialVolumeIds,
  manuscriptCheckpointsPath,
  normalizeRepoPath,
  repoRoot,
} from "../repository/paths";

export type ManuscriptCheckpoint = {
  checkpointId: string;
  kind: "original" | "published";
  parentCheckpointId: string | null;
  commit: string;
  sourcePath: string;
  snapshotPath: string;
  sha256: string;
};

export type ManuscriptCheckpointVolume = {
  editorialId: string;
  originalCheckpointId: string;
  checkpoints: ManuscriptCheckpoint[];
};

export type ManuscriptCheckpointManifest = {
  schemaVersion: 1;
  volumes: ManuscriptCheckpointVolume[];
};

function hash(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  label: string,
  source: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${source}: ${label} must be a nonempty string.`);
  }
  return value.trim();
}

function parseCheckpoint(
  value: unknown,
  index: number,
  source: string,
): ManuscriptCheckpoint {
  if (!isObject(value)) {
    throw new Error(`${source}: checkpoints[${index}] must be an object.`);
  }
  const kind = requiredString(value.kind, `checkpoints[${index}].kind`, source);
  if (kind !== "original" && kind !== "published") {
    throw new Error(
      `${source}: checkpoints[${index}].kind must be original or published.`,
    );
  }
  const parent =
    value.parentCheckpointId === null
      ? null
      : requiredString(
          value.parentCheckpointId,
          `checkpoints[${index}].parentCheckpointId`,
          source,
        );
  return {
    checkpointId: requiredString(
      value.checkpointId,
      `checkpoints[${index}].checkpointId`,
      source,
    ),
    kind,
    parentCheckpointId: parent,
    commit: requiredString(
      value.commit,
      `checkpoints[${index}].commit`,
      source,
    ),
    sourcePath: normalizeRepoPath(
      requiredString(
        value.sourcePath,
        `checkpoints[${index}].sourcePath`,
        source,
      ),
    ),
    snapshotPath: normalizeRepoPath(
      requiredString(
        value.snapshotPath,
        `checkpoints[${index}].snapshotPath`,
        source,
      ),
    ),
    sha256: requiredString(
      value.sha256,
      `checkpoints[${index}].sha256`,
      source,
    ),
  };
}

export function parseManuscriptCheckpointManifest(
  value: unknown,
  source = "manuscript checkpoint manifest",
): ManuscriptCheckpointManifest {
  if (!isObject(value)) throw new Error(`${source}: document must be an object.`);
  if (value.schemaVersion !== 1) {
    throw new Error(`${source}: schemaVersion must be 1.`);
  }
  if (!Array.isArray(value.volumes)) {
    throw new Error(`${source}: volumes must be an array.`);
  }
  return {
    schemaVersion: 1,
    volumes: value.volumes.map((item, volumeIndex) => {
      if (!isObject(item)) {
        throw new Error(`${source}: volumes[${volumeIndex}] must be an object.`);
      }
      if (!Array.isArray(item.checkpoints)) {
        throw new Error(
          `${source}: volumes[${volumeIndex}].checkpoints must be an array.`,
        );
      }
      return {
        editorialId: requiredString(
          item.editorialId,
          `volumes[${volumeIndex}].editorialId`,
          source,
        ),
        originalCheckpointId: requiredString(
          item.originalCheckpointId,
          `volumes[${volumeIndex}].originalCheckpointId`,
          source,
        ),
        checkpoints: item.checkpoints.map((checkpoint, checkpointIndex) =>
          parseCheckpoint(checkpoint, checkpointIndex, source),
        ),
      };
    }),
  };
}

export function readManuscriptCheckpointManifest(
  filePath = manuscriptCheckpointsPath,
): ManuscriptCheckpointManifest {
  return parseManuscriptCheckpointManifest(
    JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown,
    normalizeRepoPath(path.relative(repoRoot, filePath)),
  );
}

export function validateManuscriptCheckpoints(
  manifest = readManuscriptCheckpointManifest(),
  root = repoRoot,
): void {
  const expectedVolumes = [...editorialVolumeIds];
  const actualVolumes = manifest.volumes.map((volume) => volume.editorialId);
  if (JSON.stringify(actualVolumes) !== JSON.stringify(expectedVolumes)) {
    throw new Error(
      `Checkpoint volumes must be ${expectedVolumes.join(", ")} in canonical order.`,
    );
  }

  const globalIds = new Set<string>();
  for (const volume of manifest.volumes) {
    if (volume.checkpoints.length === 0) {
      throw new Error(`${volume.editorialId}: at least one checkpoint is required.`);
    }
    const localIds = new Set<string>();
    const originals = volume.checkpoints.filter(
      (checkpoint) => checkpoint.kind === "original",
    );
    if (
      originals.length !== 1 ||
      originals[0]?.checkpointId !== volume.originalCheckpointId
    ) {
      throw new Error(
        `${volume.editorialId}: originalCheckpointId must identify exactly one original checkpoint.`,
      );
    }

    for (const [index, checkpoint] of volume.checkpoints.entries()) {
      if (
        !new RegExp(
          `^${volume.editorialId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-z0-9][a-z0-9-]*$`,
        ).test(checkpoint.checkpointId)
      ) {
        throw new Error(
          `${checkpoint.checkpointId}: checkpoint ID must begin with ${volume.editorialId}/.`,
        );
      }
      if (globalIds.has(checkpoint.checkpointId)) {
        throw new Error(`${checkpoint.checkpointId}: duplicate checkpoint ID.`);
      }
      globalIds.add(checkpoint.checkpointId);

      if (!/^[0-9a-f]{40}$/.test(checkpoint.commit)) {
        throw new Error(`${checkpoint.checkpointId}: commit must be a full SHA.`);
      }
      if (!/^[0-9a-f]{64}$/.test(checkpoint.sha256)) {
        throw new Error(
          `${checkpoint.checkpointId}: sha256 must be a lowercase SHA-256 hash.`,
        );
      }

      if (checkpoint.kind === "original") {
        if (checkpoint.parentCheckpointId !== null || index !== 0) {
          throw new Error(
            `${checkpoint.checkpointId}: the original must be first and have no parent.`,
          );
        }
      } else if (
        !checkpoint.parentCheckpointId ||
        !localIds.has(checkpoint.parentCheckpointId)
      ) {
        throw new Error(
          `${checkpoint.checkpointId}: published parent must be an earlier checkpoint in the same volume.`,
        );
      }

      const snapshot = path.resolve(root, checkpoint.snapshotPath);
      if (
        !snapshot.startsWith(`${path.resolve(root)}${path.sep}`) ||
        !fs.existsSync(snapshot) ||
        !fs.statSync(snapshot).isFile()
      ) {
        throw new Error(
          `${checkpoint.checkpointId}: snapshotPath must resolve to a repository file.`,
        );
      }
      const actualHash = hash(fs.readFileSync(snapshot));
      if (actualHash !== checkpoint.sha256) {
        throw new Error(
          `${checkpoint.checkpointId}: snapshot hash ${actualHash} does not match ${checkpoint.sha256}.`,
        );
      }
      localIds.add(checkpoint.checkpointId);
    }
  }
}

export function originalCheckpointForVolume(
  editorialId: string,
  manifest = readManuscriptCheckpointManifest(),
): ManuscriptCheckpoint {
  const volume = manifest.volumes.find(
    (candidate) => candidate.editorialId === editorialId,
  );
  const checkpoint = volume?.checkpoints.find(
    (candidate) => candidate.checkpointId === volume.originalCheckpointId,
  );
  if (!checkpoint) {
    throw new Error(`${editorialId}: original manuscript checkpoint is missing.`);
  }
  return checkpoint;
}

export function latestCheckpointForVolume(
  editorialId: string,
  manifest = readManuscriptCheckpointManifest(),
): ManuscriptCheckpoint {
  const volume = manifest.volumes.find(
    (candidate) => candidate.editorialId === editorialId,
  );
  const checkpoint = volume?.checkpoints.at(-1);
  if (!checkpoint) {
    throw new Error(`${editorialId}: manuscript checkpoint is missing.`);
  }
  return checkpoint;
}

type RecordArgs = {
  editorialId: string;
  checkpointId: string;
  parentCheckpointId: string;
  commit: string;
};

function gitShow(commit: string, filePath: string): Buffer {
  return execFileSync("git", ["show", `${commit}:${filePath}`], {
    cwd: repoRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseRecordArgs(argv: string[]): RecordArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] ?? "";
    const value = argv[index + 1] ?? "";
    if (!flag.startsWith("--") || !value) {
      throw new Error(
        "record requires --editorial-id, --checkpoint-id, --parent, and --commit.",
      );
    }
    values.set(flag, value);
  }
  return {
    editorialId: values.get("--editorial-id") ?? "",
    checkpointId: values.get("--checkpoint-id") ?? "",
    parentCheckpointId: values.get("--parent") ?? "",
    commit: values.get("--commit") ?? "",
  };
}

export function recordPublishedCheckpoint(args: RecordArgs): void {
  const manifest = readManuscriptCheckpointManifest();
  validateManuscriptCheckpoints(manifest);
  const volume = manifest.volumes.find(
    (candidate) => candidate.editorialId === args.editorialId,
  );
  if (!volume) throw new Error(`${args.editorialId}: unknown editorial ID.`);
  if (volume.checkpoints.some((item) => item.checkpointId === args.checkpointId)) {
    throw new Error(`${args.checkpointId}: checkpoint already exists.`);
  }
  if (
    volume.checkpoints.at(-1)?.checkpointId !== args.parentCheckpointId
  ) {
    throw new Error(
      `${args.checkpointId}: parent must be the latest checkpoint ${volume.checkpoints.at(-1)?.checkpointId}.`,
    );
  }
  if (!/^[0-9a-f]{40}$/.test(args.commit)) {
    throw new Error("record requires a full immutable commit SHA.");
  }

  const manifestPath =
    `editorial/sources/volumes/${args.editorialId}/volume.json`;
  const volumeManifest = JSON.parse(
    gitShow(args.commit, manifestPath).toString("utf8"),
  ) as { sourcePath?: unknown };
  const sourcePath = normalizeRepoPath(
    requiredString(
      volumeManifest.sourcePath,
      "volume sourcePath",
      `${args.commit}:${manifestPath}`,
    ),
  );
  const source = gitShow(args.commit, sourcePath);
  const slug = args.checkpointId.slice(`${args.editorialId}/`.length);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(
      `${args.checkpointId}: checkpoint suffix must use lowercase letters, numbers, and hyphens.`,
    );
  }
  const snapshotPath = normalizeRepoPath(
    `editorial/evidence/checkpoints/${args.editorialId}/${slug}/manuscript.md`,
  );
  const absoluteSnapshot = path.join(repoRoot, snapshotPath);
  if (fs.existsSync(absoluteSnapshot)) {
    throw new Error(`${snapshotPath}: snapshot already exists.`);
  }

  const checkpoint: ManuscriptCheckpoint = {
    checkpointId: args.checkpointId,
    kind: "published",
    parentCheckpointId: args.parentCheckpointId,
    commit: args.commit,
    sourcePath,
    snapshotPath,
    sha256: hash(source),
  };
  volume.checkpoints.push(checkpoint);
  fs.mkdirSync(path.dirname(absoluteSnapshot), { recursive: true });
  fs.writeFileSync(absoluteSnapshot, source);
  fs.writeFileSync(
    manuscriptCheckpointsPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  validateManuscriptCheckpoints(manifest);
  process.stdout.write(
    `Recorded ${args.checkpointId} from ${args.commit} at ${snapshotPath}.\n`,
  );
}

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "validate") {
    const manifest = readManuscriptCheckpointManifest();
    validateManuscriptCheckpoints(manifest);
    const count = manifest.volumes.reduce(
      (total, volume) => total + volume.checkpoints.length,
      0,
    );
    process.stdout.write(
      `Validated ${count.toLocaleString()} immutable manuscript checkpoints across ${manifest.volumes.length.toLocaleString()} volumes.\n`,
    );
    return;
  }
  if (command === "record") {
    recordPublishedCheckpoint(parseRecordArgs(args));
    return;
  }
  throw new Error("Usage: editorial:checkpoints [validate | record ...]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `editorial:checkpoints: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
