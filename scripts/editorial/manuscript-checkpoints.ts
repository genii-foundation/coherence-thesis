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
  approvalRecordPath: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
};

export type ApprovedManuscriptCandidate = {
  checkpointId: string;
  parentCheckpointId: string;
  commit: string;
  sourcePath: string;
  snapshotPath: string;
  sha256: string;
  approvalRecordPath: string;
  approvedAt: string;
};

export type ManuscriptCheckpointVolume = {
  editorialId: string;
  originalCheckpointId: string;
  checkpoints: ManuscriptCheckpoint[];
  approvedCandidate: ApprovedManuscriptCandidate | null;
};

export type ManuscriptCheckpointManifest = {
  schemaVersion: 2;
  volumes: ManuscriptCheckpointVolume[];
};

type PublicationApprovalRecord = {
  schemaVersion: 1;
  approvalId: string;
  editorialId: string;
  checkpointId: string;
  parentCheckpointId: string;
  sourcePath: string;
  sha256: string;
  approvedBy: "author";
  approvedAt: string;
  evidencePaths: string[];
};

function hash(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, label: string, source: string): string {
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
    approvalRecordPath:
      value.approvalRecordPath === null
        ? null
        : normalizeRepoPath(
            requiredString(
              value.approvalRecordPath,
              `checkpoints[${index}].approvalRecordPath`,
              source,
            ),
          ),
    approvedAt:
      value.approvedAt === null
        ? null
        : requiredString(
            value.approvedAt,
            `checkpoints[${index}].approvedAt`,
            source,
          ),
    publishedAt:
      value.publishedAt === null
        ? null
        : requiredString(
            value.publishedAt,
            `checkpoints[${index}].publishedAt`,
            source,
          ),
  };
}

function parseApprovedCandidate(
  value: unknown,
  source: string,
): ApprovedManuscriptCandidate | null {
  if (value === null) return null;
  if (!isObject(value)) {
    throw new Error(`${source}: approvedCandidate must be an object or null.`);
  }
  return {
    checkpointId: requiredString(
      value.checkpointId,
      "approvedCandidate.checkpointId",
      source,
    ),
    parentCheckpointId: requiredString(
      value.parentCheckpointId,
      "approvedCandidate.parentCheckpointId",
      source,
    ),
    commit: requiredString(value.commit, "approvedCandidate.commit", source),
    sourcePath: normalizeRepoPath(
      requiredString(value.sourcePath, "approvedCandidate.sourcePath", source),
    ),
    snapshotPath: normalizeRepoPath(
      requiredString(
        value.snapshotPath,
        "approvedCandidate.snapshotPath",
        source,
      ),
    ),
    sha256: requiredString(value.sha256, "approvedCandidate.sha256", source),
    approvalRecordPath: normalizeRepoPath(
      requiredString(
        value.approvalRecordPath,
        "approvedCandidate.approvalRecordPath",
        source,
      ),
    ),
    approvedAt: requiredString(
      value.approvedAt,
      "approvedCandidate.approvedAt",
      source,
    ),
  };
}

export function parseManuscriptCheckpointManifest(
  value: unknown,
  source = "manuscript checkpoint manifest",
): ManuscriptCheckpointManifest {
  if (!isObject(value))
    throw new Error(`${source}: document must be an object.`);
  if (value.schemaVersion !== 2) {
    throw new Error(`${source}: schemaVersion must be 2.`);
  }
  if (!Array.isArray(value.volumes)) {
    throw new Error(`${source}: volumes must be an array.`);
  }
  return {
    schemaVersion: 2,
    volumes: value.volumes.map((item, volumeIndex) => {
      if (!isObject(item)) {
        throw new Error(
          `${source}: volumes[${volumeIndex}] must be an object.`,
        );
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
        approvedCandidate: parseApprovedCandidate(
          item.approvedCandidate,
          source,
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

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolveRepositoryFile(
  root: string,
  repoPath: string,
  label: string,
): string {
  const absolutePath = path.resolve(root, repoPath);
  if (
    !absolutePath.startsWith(`${path.resolve(root)}${path.sep}`) ||
    !fs.existsSync(absolutePath) ||
    !fs.statSync(absolutePath).isFile()
  ) {
    throw new Error(`${label}: path must resolve to a repository file.`);
  }
  return absolutePath;
}

function validateApprovalRecord(
  root: string,
  candidate: ApprovedManuscriptCandidate,
  editorialId: string,
): void {
  if (
    !candidate.approvalRecordPath.startsWith(
      `editorial/evidence/publication-approvals/${editorialId}/`,
    ) ||
    !candidate.approvalRecordPath.endsWith(".json")
  ) {
    throw new Error(
      `${candidate.checkpointId}: approval record must live under editorial/evidence/publication-approvals/${editorialId}/.`,
    );
  }
  const approvalPath = resolveRepositoryFile(
    root,
    candidate.approvalRecordPath,
    candidate.checkpointId,
  );
  const value = JSON.parse(fs.readFileSync(approvalPath, "utf8")) as unknown;
  if (!isObject(value) || value.schemaVersion !== 1) {
    throw new Error(
      `${candidate.approvalRecordPath}: publication approval must use schemaVersion 1.`,
    );
  }
  const evidencePaths = Array.isArray(value.evidencePaths)
    ? value.evidencePaths.map((item, index) =>
        normalizeRepoPath(
          requiredString(
            item,
            `evidencePaths[${index}]`,
            candidate.approvalRecordPath,
          ),
        ),
      )
    : [];
  const record: PublicationApprovalRecord = {
    schemaVersion: 1,
    approvalId: requiredString(
      value.approvalId,
      "approvalId",
      candidate.approvalRecordPath,
    ),
    editorialId: requiredString(
      value.editorialId,
      "editorialId",
      candidate.approvalRecordPath,
    ),
    checkpointId: requiredString(
      value.checkpointId,
      "checkpointId",
      candidate.approvalRecordPath,
    ),
    parentCheckpointId: requiredString(
      value.parentCheckpointId,
      "parentCheckpointId",
      candidate.approvalRecordPath,
    ),
    sourcePath: normalizeRepoPath(
      requiredString(
        value.sourcePath,
        "sourcePath",
        candidate.approvalRecordPath,
      ),
    ),
    sha256: requiredString(
      value.sha256,
      "sha256",
      candidate.approvalRecordPath,
    ),
    approvedBy: requiredString(
      value.approvedBy,
      "approvedBy",
      candidate.approvalRecordPath,
    ) as "author",
    approvedAt: requiredString(
      value.approvedAt,
      "approvedAt",
      candidate.approvalRecordPath,
    ),
    evidencePaths,
  };
  if (
    record.approvedBy !== "author" ||
    record.editorialId !== editorialId ||
    record.checkpointId !== candidate.checkpointId ||
    record.parentCheckpointId !== candidate.parentCheckpointId ||
    record.sourcePath !== candidate.sourcePath ||
    record.sha256 !== candidate.sha256 ||
    record.approvedAt !== candidate.approvedAt ||
    !isIsoDate(record.approvedAt)
  ) {
    throw new Error(
      `${candidate.approvalRecordPath}: approval does not match ${candidate.checkpointId}.`,
    );
  }
  for (const evidencePath of record.evidencePaths) {
    if (!evidencePath.startsWith("editorial/evidence/")) {
      throw new Error(
        `${candidate.approvalRecordPath}: evidence paths must stay under editorial/evidence/.`,
      );
    }
    resolveRepositoryFile(root, evidencePath, candidate.approvalRecordPath);
  }
}

function validateSnapshot(
  root: string,
  record: Pick<
    ManuscriptCheckpoint,
    "checkpointId" | "snapshotPath" | "sha256"
  >,
): void {
  const snapshot = resolveRepositoryFile(
    root,
    record.snapshotPath,
    record.checkpointId,
  );
  if (
    !record.snapshotPath.startsWith("editorial/evidence/checkpoints/") ||
    path.basename(record.snapshotPath) !== "manuscript.md"
  ) {
    throw new Error(
      `${record.checkpointId}: snapshot must live under editorial/evidence/checkpoints/.`,
    );
  }
  const actualHash = hash(fs.readFileSync(snapshot));
  if (actualHash !== record.sha256) {
    throw new Error(
      `${record.checkpointId}: snapshot hash ${actualHash} does not match ${record.sha256}.`,
    );
  }
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
      throw new Error(
        `${volume.editorialId}: at least one checkpoint is required.`,
      );
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
        throw new Error(
          `${checkpoint.checkpointId}: commit must be a full SHA.`,
        );
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
        if (
          checkpoint.approvalRecordPath !== null ||
          checkpoint.approvedAt !== null ||
          checkpoint.publishedAt !== null
        ) {
          throw new Error(
            `${checkpoint.checkpointId}: the original cannot carry revision approval or publication dates.`,
          );
        }
      } else if (
        !checkpoint.parentCheckpointId ||
        checkpoint.parentCheckpointId !==
          volume.checkpoints[index - 1]?.checkpointId
      ) {
        throw new Error(
          `${checkpoint.checkpointId}: published parent must be the preceding checkpoint in the same volume.`,
        );
      } else {
        if (
          !checkpoint.approvalRecordPath ||
          !checkpoint.approvedAt ||
          !checkpoint.publishedAt ||
          !isIsoDate(checkpoint.approvedAt) ||
          !isIsoDate(checkpoint.publishedAt)
        ) {
          throw new Error(
            `${checkpoint.checkpointId}: published checkpoints require approval evidence and ISO approval and publication dates.`,
          );
        }
        if (checkpoint.publishedAt < checkpoint.approvedAt) {
          throw new Error(
            `${checkpoint.checkpointId}: publication date cannot precede approval.`,
          );
        }
        validateApprovalRecord(
          root,
          {
            checkpointId: checkpoint.checkpointId,
            parentCheckpointId: checkpoint.parentCheckpointId,
            commit: checkpoint.commit,
            sourcePath: checkpoint.sourcePath,
            snapshotPath: checkpoint.snapshotPath,
            sha256: checkpoint.sha256,
            approvalRecordPath: checkpoint.approvalRecordPath,
            approvedAt: checkpoint.approvedAt,
          },
          volume.editorialId,
        );
      }

      validateSnapshot(root, checkpoint);
      localIds.add(checkpoint.checkpointId);
    }

    const candidate = volume.approvedCandidate;
    if (candidate) {
      if (globalIds.has(candidate.checkpointId)) {
        throw new Error(`${candidate.checkpointId}: duplicate checkpoint ID.`);
      }
      if (
        !new RegExp(
          `^${volume.editorialId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-z0-9][a-z0-9-]*$`,
        ).test(candidate.checkpointId)
      ) {
        throw new Error(
          `${candidate.checkpointId}: checkpoint ID must begin with ${volume.editorialId}/.`,
        );
      }
      if (
        candidate.parentCheckpointId !== volume.checkpoints.at(-1)?.checkpointId
      ) {
        throw new Error(
          `${candidate.checkpointId}: approved candidate must descend from the latest published checkpoint.`,
        );
      }
      if (
        !/^[0-9a-f]{40}$/.test(candidate.commit) ||
        !/^[0-9a-f]{64}$/.test(candidate.sha256) ||
        !isIsoDate(candidate.approvedAt)
      ) {
        throw new Error(
          `${candidate.checkpointId}: approved candidate identity is malformed.`,
        );
      }
      validateSnapshot(root, candidate);
      validateApprovalRecord(root, candidate, volume.editorialId);
      globalIds.add(candidate.checkpointId);
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
    throw new Error(
      `${editorialId}: original manuscript checkpoint is missing.`,
    );
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

type StageArgs = {
  editorialId: string;
  checkpointId: string;
  parentCheckpointId: string;
  commit: string;
  approvalRecordPath: string;
};

type PublishArgs = {
  editorialId: string;
  checkpointId: string;
  publicationCommit: string;
  publishedAt: string;
};

function gitShow(commit: string, filePath: string): Buffer {
  return execFileSync("git", ["show", `${commit}:${filePath}`], {
    cwd: repoRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseFlags(argv: string[], usage: string): Map<string, string> {
  const values = new Map<string, string>();
  if (argv.length % 2 !== 0) throw new Error(usage);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] ?? "";
    const value = argv[index + 1] ?? "";
    if (!flag.startsWith("--") || !value) {
      throw new Error(usage);
    }
    values.set(flag, value);
  }
  return values;
}

function parseStageArgs(argv: string[]): StageArgs {
  const usage =
    "stage requires --editorial-id, --checkpoint-id, --parent, --commit, and --approval-record.";
  const values = parseFlags(argv, usage);
  return {
    editorialId: values.get("--editorial-id") ?? "",
    checkpointId: values.get("--checkpoint-id") ?? "",
    parentCheckpointId: values.get("--parent") ?? "",
    commit: values.get("--commit") ?? "",
    approvalRecordPath: normalizeRepoPath(
      values.get("--approval-record") ?? "",
    ),
  };
}

function parsePublishArgs(argv: string[]): PublishArgs {
  const usage =
    "publish requires --editorial-id, --checkpoint-id, --publication-commit, and --published-at.";
  const values = parseFlags(argv, usage);
  return {
    editorialId: values.get("--editorial-id") ?? "",
    checkpointId: values.get("--checkpoint-id") ?? "",
    publicationCommit: values.get("--publication-commit") ?? "",
    publishedAt: values.get("--published-at") ?? "",
  };
}

function volumeSourceAtCommit(
  editorialId: string,
  commit: string,
): { source: Buffer; sourcePath: string } {
  const manifestPath = `editorial/sources/volumes/${editorialId}/volume.json`;
  const volumeManifest = JSON.parse(
    gitShow(commit, manifestPath).toString("utf8"),
  ) as { sourcePath?: unknown };
  const sourcePath = normalizeRepoPath(
    requiredString(
      volumeManifest.sourcePath,
      "volume sourcePath",
      `${commit}:${manifestPath}`,
    ),
  );
  return { source: gitShow(commit, sourcePath), sourcePath };
}

function writeManifest(manifest: ManuscriptCheckpointManifest): void {
  fs.writeFileSync(
    manuscriptCheckpointsPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

export function adoptRepositoryOriginals(commit: string): void {
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error("adopt-originals requires --commit with a full SHA.");
  }
  const current = JSON.parse(
    fs.readFileSync(manuscriptCheckpointsPath, "utf8"),
  ) as unknown;
  if (
    !isObject(current) ||
    !Array.isArray(current.volumes) ||
    current.volumes.some(
      (volume) =>
        !isObject(volume) ||
        !Array.isArray(volume.checkpoints) ||
        volume.checkpoints.length !== 1 ||
        !isObject(volume.checkpoints[0]) ||
        volume.checkpoints[0].kind !== "original",
    )
  ) {
    throw new Error(
      "adopt-originals is allowed only before any revision checkpoint exists.",
    );
  }

  const prepared = editorialVolumeIds.map((editorialId) => {
    const { source, sourcePath } = volumeSourceAtCommit(editorialId, commit);
    const workingSource = fs.readFileSync(path.join(repoRoot, sourcePath));
    if (!workingSource.equals(source)) {
      throw new Error(
        `${editorialId}: ${commit} does not contain the current canonical manuscript.`,
      );
    }
    const snapshotPath = normalizeRepoPath(
      `editorial/evidence/checkpoints/${editorialId}/original/manuscript.md`,
    );
    if (fs.existsSync(path.join(repoRoot, snapshotPath))) {
      throw new Error(`${snapshotPath}: original snapshot already exists.`);
    }
    return { editorialId, snapshotPath, source, sourcePath };
  });

  const manifest: ManuscriptCheckpointManifest = {
    schemaVersion: 2,
    volumes: prepared.map(
      ({ editorialId, snapshotPath, source, sourcePath }) => ({
        editorialId,
        originalCheckpointId: `${editorialId}/original`,
        approvedCandidate: null,
        checkpoints: [
          {
            checkpointId: `${editorialId}/original`,
            kind: "original",
            parentCheckpointId: null,
            commit,
            sourcePath,
            snapshotPath,
            sha256: hash(source),
            approvalRecordPath: null,
            approvedAt: null,
            publishedAt: null,
          },
        ],
      }),
    ),
  };

  for (const item of prepared) {
    const absoluteSnapshot = path.join(repoRoot, item.snapshotPath);
    fs.mkdirSync(path.dirname(absoluteSnapshot), { recursive: true });
    fs.writeFileSync(absoluteSnapshot, item.source);
  }
  validateManuscriptCheckpoints(manifest);
  writeManifest(manifest);
  process.stdout.write(
    `Adopted ${prepared.length.toLocaleString()} repository originals from ${commit}.\n`,
  );
}

export function stageApprovedCandidate(args: StageArgs): void {
  const manifest = readManuscriptCheckpointManifest();
  validateManuscriptCheckpoints(manifest);
  const volume = manifest.volumes.find(
    (candidate) => candidate.editorialId === args.editorialId,
  );
  if (!volume) throw new Error(`${args.editorialId}: unknown editorial ID.`);
  if (volume.approvedCandidate) {
    throw new Error(
      `${args.editorialId}: publish or explicitly remove the existing approved candidate before staging another.`,
    );
  }
  if (
    volume.checkpoints.some((item) => item.checkpointId === args.checkpointId)
  ) {
    throw new Error(`${args.checkpointId}: checkpoint already exists.`);
  }
  if (volume.checkpoints.at(-1)?.checkpointId !== args.parentCheckpointId) {
    throw new Error(
      `${args.checkpointId}: parent must be the latest checkpoint ${volume.checkpoints.at(-1)?.checkpointId}.`,
    );
  }
  if (!/^[0-9a-f]{40}$/.test(args.commit)) {
    throw new Error("stage requires a full immutable commit SHA.");
  }

  const { source, sourcePath } = volumeSourceAtCommit(
    args.editorialId,
    args.commit,
  );
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

  const approvalValue = JSON.parse(
    fs.readFileSync(
      resolveRepositoryFile(
        repoRoot,
        args.approvalRecordPath,
        args.checkpointId,
      ),
      "utf8",
    ),
  ) as { approvedAt?: unknown };
  const candidate: ApprovedManuscriptCandidate = {
    checkpointId: args.checkpointId,
    parentCheckpointId: args.parentCheckpointId,
    commit: args.commit,
    sourcePath,
    snapshotPath,
    sha256: hash(source),
    approvalRecordPath: args.approvalRecordPath,
    approvedAt: requiredString(
      approvalValue.approvedAt,
      "approvedAt",
      args.approvalRecordPath,
    ),
  };
  validateApprovalRecord(repoRoot, candidate, args.editorialId);
  fs.mkdirSync(path.dirname(absoluteSnapshot), { recursive: true });
  fs.writeFileSync(absoluteSnapshot, source);
  volume.approvedCandidate = candidate;
  validateManuscriptCheckpoints(manifest);
  writeManifest(manifest);
  process.stdout.write(
    `Staged approved candidate ${args.checkpointId} from ${args.commit}.\n`,
  );
}

export function publishApprovedCandidate(args: PublishArgs): void {
  const manifest = readManuscriptCheckpointManifest();
  validateManuscriptCheckpoints(manifest);
  const volume = manifest.volumes.find(
    (candidate) => candidate.editorialId === args.editorialId,
  );
  if (!volume) throw new Error(`${args.editorialId}: unknown editorial ID.`);
  const candidate = volume.approvedCandidate;
  if (!candidate || candidate.checkpointId !== args.checkpointId) {
    throw new Error(
      `${args.checkpointId}: no matching approved candidate is staged.`,
    );
  }
  if (
    !/^[0-9a-f]{40}$/.test(args.publicationCommit) ||
    !isIsoDate(args.publishedAt)
  ) {
    throw new Error(
      "publish requires a full publication commit SHA and YYYY-MM-DD publication date.",
    );
  }
  if (args.publishedAt < candidate.approvedAt) {
    throw new Error("publication date cannot precede approval.");
  }
  const { source, sourcePath } = volumeSourceAtCommit(
    args.editorialId,
    args.publicationCommit,
  );
  if (
    sourcePath !== candidate.sourcePath ||
    hash(source) !== candidate.sha256
  ) {
    throw new Error(
      `${args.publicationCommit}: published manuscript does not match the approved candidate.`,
    );
  }

  volume.checkpoints.push({
    checkpointId: candidate.checkpointId,
    kind: "published",
    parentCheckpointId: candidate.parentCheckpointId,
    commit: args.publicationCommit,
    sourcePath: candidate.sourcePath,
    snapshotPath: candidate.snapshotPath,
    sha256: candidate.sha256,
    approvalRecordPath: candidate.approvalRecordPath,
    approvedAt: candidate.approvedAt,
    publishedAt: args.publishedAt,
  });
  volume.approvedCandidate = null;
  validateManuscriptCheckpoints(manifest);
  writeManifest(manifest);
  process.stdout.write(
    `Published checkpoint ${args.checkpointId} from ${args.publicationCommit}.\n`,
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
  if (command === "adopt-originals") {
    const values = parseFlags(
      args,
      "adopt-originals requires --commit with a full SHA.",
    );
    adoptRepositoryOriginals(values.get("--commit") ?? "");
    return;
  }
  if (command === "stage") {
    stageApprovedCandidate(parseStageArgs(args));
    return;
  }
  if (command === "publish") {
    publishApprovedCandidate(parsePublishArgs(args));
    return;
  }
  throw new Error(
    "Usage: editorial:checkpoints [validate | adopt-originals ... | stage ... | publish ...]",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `editorial:checkpoints: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
