import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJson } from "../manuscripts/shared";
import {
  audioPublicationCheckpointsRoot,
  editorialVolumeIds,
} from "../repository/paths";
import type { FishRunManifest } from "./fish-generator";

export type CheckpointAudioFile = {
  source: {
    sectionId: string;
    audioVersionId: string;
    volumeId: string;
    voiceId: string;
    format: string;
    durationSeconds?: number;
    byteSize?: number;
    audioSha256?: string;
    timingsByteSize?: number;
    timingsSha256?: string;
    exactWordCount?: number;
    interpolatedWordCount?: number;
    timingSource?: "fish" | "mlx-whisper";
  };
  objectKey: string;
  timingsObjectKey?: string;
};

export type AudioPublicationCheckpointFile = {
  sectionId: string;
  audioVersionId: string;
  durationSeconds: number;
  exactWordCount: number;
  interpolatedWordCount: number;
  timingSource: "fish" | "mlx-whisper";
  audio: {
    objectKey: string;
    byteSize: number;
    sha256: string;
  };
  timings: {
    objectKey: string;
    byteSize: number;
    sha256: string;
  };
};

export type AudioPublicationCheckpoint = {
  schemaVersion: 1;
  editorialId: string;
  volumeId: string;
  version: string;
  runId: string;
  sourceCommit: string;
  catalogHash: string;
  settingsHash: string;
  provider: "fish-audio";
  model: string;
  narrator: {
    id: string;
    label: string;
    referenceId: string;
  };
  recordedAt: string;
  remoteVerifiedAt: string;
  summary: {
    sectionCount: number;
    objectCount: number;
    durationSeconds: number;
    audioBytes: number;
    timingsBytes: number;
  };
  filesSha256: string;
  files: AudioPublicationCheckpointFile[];
};

const safeSegment = /^[a-z0-9][a-z0-9._-]*$/i;
const sha256Pattern = /^[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const catalogHashPattern = /^[0-9a-f]{16}$/;
const settingsHashPattern = /^[0-9a-f]{12}$/;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function filesFingerprint(files: AudioPublicationCheckpointFile[]): string {
  return sha256(JSON.stringify(files));
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a nonempty string.`);
  }
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function assertNonnegativeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer.`);
  }
}

function assertIsoTimestamp(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
}

function parsePublishedObject(
  value: unknown,
  label: string,
  expectedPrefix: string,
): AudioPublicationCheckpointFile["audio"] {
  assertObject(value, label);
  assertString(value.objectKey, `${label}.objectKey`);
  assertPositive(value.byteSize, `${label}.byteSize`);
  assertString(value.sha256, `${label}.sha256`);
  if (!value.objectKey.startsWith(expectedPrefix)) {
    throw new Error(`${label}.objectKey must use the checkpoint version and narrator path.`);
  }
  if (!sha256Pattern.test(value.sha256)) {
    throw new Error(`${label}.sha256 must be a lowercase SHA-256 hash.`);
  }
  return {
    objectKey: value.objectKey,
    byteSize: value.byteSize,
    sha256: value.sha256,
  };
}

export function validateAudioPublicationCheckpoint(
  value: unknown,
  source = "audio publication checkpoint",
): AudioPublicationCheckpoint {
  assertObject(value, source);
  if (value.schemaVersion !== 1) {
    throw new Error(`${source}: schemaVersion must be 1.`);
  }
  assertString(value.editorialId, `${source}.editorialId`);
  if (!editorialVolumeIds.includes(value.editorialId)) {
    throw new Error(`${source}.editorialId must name a canonical volume.`);
  }
  assertString(value.volumeId, `${source}.volumeId`);
  assertString(value.version, `${source}.version`);
  assertString(value.runId, `${source}.runId`);
  if (!safeSegment.test(value.version) || !safeSegment.test(value.runId)) {
    throw new Error(`${source}: version and runId must be safe path segments.`);
  }
  assertString(value.sourceCommit, `${source}.sourceCommit`);
  assertString(value.catalogHash, `${source}.catalogHash`);
  assertString(value.settingsHash, `${source}.settingsHash`);
  if (!commitPattern.test(value.sourceCommit)) {
    throw new Error(`${source}.sourceCommit must be a full commit SHA.`);
  }
  if (!catalogHashPattern.test(value.catalogHash)) {
    throw new Error(`${source}.catalogHash must be a 16 character hash.`);
  }
  if (!settingsHashPattern.test(value.settingsHash)) {
    throw new Error(`${source}.settingsHash must be a 12 character hash.`);
  }
  if (value.provider !== "fish-audio") {
    throw new Error(`${source}.provider must be fish-audio.`);
  }
  assertString(value.model, `${source}.model`);
  assertObject(value.narrator, `${source}.narrator`);
  assertString(value.narrator.id, `${source}.narrator.id`);
  assertString(value.narrator.label, `${source}.narrator.label`);
  assertString(value.narrator.referenceId, `${source}.narrator.referenceId`);
  assertIsoTimestamp(value.recordedAt, `${source}.recordedAt`);
  assertIsoTimestamp(value.remoteVerifiedAt, `${source}.remoteVerifiedAt`);
  if (value.remoteVerifiedAt < value.recordedAt) {
    throw new Error(`${source}: remote verification cannot precede recording.`);
  }
  assertObject(value.summary, `${source}.summary`);
  assertNonnegativeInteger(value.summary.sectionCount, `${source}.summary.sectionCount`);
  assertNonnegativeInteger(value.summary.objectCount, `${source}.summary.objectCount`);
  assertPositive(value.summary.durationSeconds, `${source}.summary.durationSeconds`);
  assertPositive(value.summary.audioBytes, `${source}.summary.audioBytes`);
  assertPositive(value.summary.timingsBytes, `${source}.summary.timingsBytes`);
  assertString(value.filesSha256, `${source}.filesSha256`);
  if (!sha256Pattern.test(value.filesSha256)) {
    throw new Error(`${source}.filesSha256 must be a lowercase SHA-256 hash.`);
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw new Error(`${source}.files must contain at least one section.`);
  }

  const expectedPrefix = `audiobook/${value.version}/${value.narrator.id}/`;
  const seenSections = new Set<string>();
  const files = value.files.map((entry, index): AudioPublicationCheckpointFile => {
    const label = `${source}.files[${index}]`;
    assertObject(entry, label);
    assertString(entry.sectionId, `${label}.sectionId`);
    assertString(entry.audioVersionId, `${label}.audioVersionId`);
    if (seenSections.has(entry.sectionId)) {
      throw new Error(`${source}: duplicate section ${entry.sectionId}.`);
    }
    seenSections.add(entry.sectionId);
    assertPositive(entry.durationSeconds, `${label}.durationSeconds`);
    assertNonnegativeInteger(entry.exactWordCount, `${label}.exactWordCount`);
    assertNonnegativeInteger(entry.interpolatedWordCount, `${label}.interpolatedWordCount`);
    if (entry.timingSource !== "fish" && entry.timingSource !== "mlx-whisper") {
      throw new Error(`${label}.timingSource must be fish or mlx-whisper.`);
    }
    return {
      sectionId: entry.sectionId,
      audioVersionId: entry.audioVersionId,
      durationSeconds: entry.durationSeconds,
      exactWordCount: entry.exactWordCount,
      interpolatedWordCount: entry.interpolatedWordCount,
      timingSource: entry.timingSource,
      audio: parsePublishedObject(entry.audio, `${label}.audio`, expectedPrefix),
      timings: parsePublishedObject(entry.timings, `${label}.timings`, expectedPrefix),
    };
  });

  const sorted = [...files].sort((left, right) => left.sectionId.localeCompare(right.sectionId));
  if (JSON.stringify(files) !== JSON.stringify(sorted)) {
    throw new Error(`${source}.files must be sorted by sectionId.`);
  }
  const durationSeconds = files.reduce((total, file) => total + file.durationSeconds, 0);
  const audioBytes = files.reduce((total, file) => total + file.audio.byteSize, 0);
  const timingsBytes = files.reduce((total, file) => total + file.timings.byteSize, 0);
  if (
    value.summary.sectionCount !== files.length ||
    value.summary.objectCount !== files.length * 2 ||
    Math.abs(value.summary.durationSeconds - durationSeconds) > 0.000001 ||
    value.summary.audioBytes !== audioBytes ||
    value.summary.timingsBytes !== timingsBytes
  ) {
    throw new Error(`${source}.summary does not match its files.`);
  }
  if (value.filesSha256 !== filesFingerprint(files)) {
    throw new Error(`${source}.filesSha256 does not match its files.`);
  }

  return value as unknown as AudioPublicationCheckpoint;
}

export function recordAudioPublicationCheckpoint(input: {
  editorialId: string;
  volumeId: string;
  version: string;
  sourceCommit: string;
  recordedAt?: string;
  run: FishRunManifest;
  files: CheckpointAudioFile[];
  root?: string;
}): { checkpoint: AudioPublicationCheckpoint; filePath: string } {
  if (!editorialVolumeIds.includes(input.editorialId)) {
    throw new Error(`${input.editorialId}: unknown editorial volume.`);
  }
  if (!safeSegment.test(input.version)) {
    throw new Error(`${input.version}: audio version must be a safe path segment.`);
  }
  if (!commitPattern.test(input.sourceCommit)) {
    throw new Error("Audio checkpoint sourceCommit must be a full commit SHA.");
  }
  if (!input.run.catalogHash || !catalogHashPattern.test(input.run.catalogHash)) {
    throw new Error("Audio run must carry a valid catalog hash.");
  }
  if (!input.run.settingsHash || !settingsHashPattern.test(input.run.settingsHash)) {
    throw new Error("Audio run must carry a valid settings hash.");
  }
  const narrator = input.run.voices[0];
  if (input.run.voices.length !== 1 || !narrator?.referenceId) {
    throw new Error("Audio checkpoint requires one pinned narrator.");
  }
  if (input.files.length === 0 || input.files.some((file) => file.source.volumeId !== input.volumeId)) {
    throw new Error(`${input.editorialId}: checkpoint files must belong to one volume.`);
  }

  const files = input.files.map((file): AudioPublicationCheckpointFile => {
    const source = file.source;
    if (
      !source.durationSeconds ||
      !source.byteSize ||
      !source.audioSha256 ||
      !source.timingsByteSize ||
      !source.timingsSha256 ||
      source.exactWordCount === undefined ||
      source.interpolatedWordCount === undefined ||
      !source.timingSource ||
      !file.timingsObjectKey
    ) {
      throw new Error(`${source.sectionId}: incomplete generated publication evidence.`);
    }
    return {
      sectionId: source.sectionId,
      audioVersionId: source.audioVersionId,
      durationSeconds: source.durationSeconds,
      exactWordCount: source.exactWordCount,
      interpolatedWordCount: source.interpolatedWordCount,
      timingSource: source.timingSource,
      audio: {
        objectKey: file.objectKey,
        byteSize: source.byteSize,
        sha256: source.audioSha256,
      },
      timings: {
        objectKey: file.timingsObjectKey,
        byteSize: source.timingsByteSize,
        sha256: source.timingsSha256,
      },
    };
  }).sort((left, right) => left.sectionId.localeCompare(right.sectionId));

  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const checkpoint: AudioPublicationCheckpoint = {
    schemaVersion: 1,
    editorialId: input.editorialId,
    volumeId: input.volumeId,
    version: input.version,
    runId: input.run.runId,
    sourceCommit: input.sourceCommit,
    catalogHash: input.run.catalogHash,
    settingsHash: input.run.settingsHash,
    provider: input.run.provider,
    model: input.run.model,
    narrator: {
      id: narrator.id,
      label: narrator.label,
      referenceId: narrator.referenceId,
    },
    recordedAt,
    remoteVerifiedAt: recordedAt,
    summary: {
      sectionCount: files.length,
      objectCount: files.length * 2,
      durationSeconds: files.reduce((total, file) => total + file.durationSeconds, 0),
      audioBytes: files.reduce((total, file) => total + file.audio.byteSize, 0),
      timingsBytes: files.reduce((total, file) => total + file.timings.byteSize, 0),
    },
    filesSha256: filesFingerprint(files),
    files,
  };
  validateAudioPublicationCheckpoint(checkpoint);

  const root = input.root ?? audioPublicationCheckpointsRoot;
  const filePath = path.join(root, input.version, `${input.editorialId}.json`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Audio publication checkpoint already exists: ${filePath}`);
  }
  ensureDir(path.dirname(filePath));
  writeJson(filePath, checkpoint);
  return { checkpoint, filePath };
}

export function validateAudioPublicationCheckpoints(
  root = audioPublicationCheckpointsRoot,
): AudioPublicationCheckpoint[] {
  if (!fs.existsSync(root)) return [];
  const checkpoints: AudioPublicationCheckpoint[] = [];
  for (const version of fs.readdirSync(root).sort()) {
    const versionRoot = path.join(root, version);
    if (!fs.statSync(versionRoot).isDirectory() || !safeSegment.test(version)) {
      throw new Error(`Invalid audio checkpoint version directory: ${versionRoot}`);
    }
    for (const fileName of fs.readdirSync(versionRoot).sort()) {
      const filePath = path.join(versionRoot, fileName);
      if (!fileName.endsWith(".json") || !fs.statSync(filePath).isFile()) {
        throw new Error(`Invalid audio checkpoint file: ${filePath}`);
      }
      const checkpoint = validateAudioPublicationCheckpoint(
        JSON.parse(fs.readFileSync(filePath, "utf8")),
        filePath,
      );
      if (checkpoint.version !== version || fileName !== `${checkpoint.editorialId}.json`) {
        throw new Error(`${filePath}: checkpoint identity does not match its path.`);
      }
      checkpoints.push(checkpoint);
    }
  }
  return checkpoints;
}

function main(): void {
  const checkpoints = validateAudioPublicationCheckpoints();
  process.stdout.write(
    `Validated ${checkpoints.length.toLocaleString()} immutable audio publication checkpoint${checkpoints.length === 1 ? "" : "s"}.\n`,
  );
}

if (process.argv[1]?.endsWith("audio-publication-checkpoints.ts")) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `audio:checkpoints: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
