import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  recordAudioPublicationCheckpoint,
  validateAudioPublicationCheckpoint,
  validateAudioPublicationCheckpoints,
} from "./audio-publication-checkpoints";
import type { FishRunManifest } from "./fish-generator";

const version = "2026-08-01-nine-volume-revision-v1";
const audioSha256 = "a".repeat(64);
const timingsSha256 = "b".repeat(64);

function run(): FishRunManifest {
  return {
    schemaVersion: 2,
    provider: "fish-audio",
    endpoint: "stream-with-timestamp",
    model: "s2.1-pro-free",
    settingsHash: "c".repeat(12),
    catalogHash: "d".repeat(16),
    mode: "full",
    runId: "current-audiobook",
    generatedAt: "2026-08-01T10:00:00.000Z",
    corpus: {
      sections: 1,
      voices: 1,
      inputBytes: 10,
      inputCharacters: 10,
      estimatedPaidCostUsd: 0,
    },
    voices: [{
      id: "high-quality-1",
      label: "High Quality 1",
      referenceId: "narrator-reference",
    }],
    files: [],
  };
}

describe("audio publication checkpoints", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "audio-checkpoints-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("records remotely verified immutable evidence for one volume", () => {
    const recorded = recordAudioPublicationCheckpoint({
      editorialId: "volume-01",
      volumeId: "humanitys-most-viable-future",
      version,
      sourceCommit: "e".repeat(40),
      recordedAt: "2026-08-01T12:00:00.000Z",
      run: run(),
      root,
      files: [{
        source: {
          sectionId: "v01-orientation",
          audioVersionId: "v01-orientation-hash",
          volumeId: "humanitys-most-viable-future",
          voiceId: "high-quality-1",
          format: "opus",
          durationSeconds: 12.5,
          byteSize: 1_000,
          audioSha256,
          timingsByteSize: 250,
          timingsSha256,
          exactWordCount: 20,
          interpolatedWordCount: 1,
          timingSource: "mlx-whisper",
        },
        objectKey: `audiobook/${version}/high-quality-1/v01-orientation-hash.opus`,
        timingsObjectKey:
          `audiobook/${version}/high-quality-1/v01-orientation-hash.timings.json`,
      }],
    });

    expect(recorded.filePath).toBe(
      path.join(root, version, "volume-01.json"),
    );
    expect(recorded.checkpoint.summary).toEqual({
      sectionCount: 1,
      objectCount: 2,
      durationSeconds: 12.5,
      audioBytes: 1_000,
      timingsBytes: 250,
    });
    expect(validateAudioPublicationCheckpoints(root)).toHaveLength(1);
    expect(() => recordAudioPublicationCheckpoint({
      editorialId: "volume-01",
      volumeId: "humanitys-most-viable-future",
      version,
      sourceCommit: "e".repeat(40),
      recordedAt: "2026-08-01T12:00:00.000Z",
      run: run(),
      root,
      files: [],
    })).toThrow("must belong to one volume");
  });

  it("rejects changed evidence and unsafe object paths", () => {
    const base = {
      schemaVersion: 1,
      editorialId: "volume-01",
      volumeId: "humanitys-most-viable-future",
      version,
      runId: "current-audiobook",
      sourceCommit: "e".repeat(40),
      catalogHash: "d".repeat(16),
      settingsHash: "c".repeat(12),
      provider: "fish-audio",
      model: "s2.1-pro-free",
      narrator: {
        id: "high-quality-1",
        label: "High Quality 1",
        referenceId: "narrator-reference",
      },
      recordedAt: "2026-08-01T12:00:00.000Z",
      remoteVerifiedAt: "2026-08-01T12:00:00.000Z",
      summary: {
        sectionCount: 1,
        objectCount: 2,
        durationSeconds: 12.5,
        audioBytes: 1_000,
        timingsBytes: 250,
      },
      filesSha256: "f".repeat(64),
      files: [{
        sectionId: "v01-orientation",
        audioVersionId: "v01-orientation-hash",
        durationSeconds: 12.5,
        exactWordCount: 20,
        interpolatedWordCount: 1,
        timingSource: "mlx-whisper",
        audio: {
          objectKey: "audiobook/wrong/high-quality-1/clip.opus",
          byteSize: 1_000,
          sha256: audioSha256,
        },
        timings: {
          objectKey: "audiobook/wrong/high-quality-1/clip.timings.json",
          byteSize: 250,
          sha256: timingsSha256,
        },
      }],
    };

    expect(() => validateAudioPublicationCheckpoint(base)).toThrow(
      "checkpoint version and narrator path",
    );
  });
});
