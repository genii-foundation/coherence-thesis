import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AudioClipManifest, AudioClipSection } from "../../src/lib/audio-manifest";
import type { CompiledCatalog, CompiledSection } from "../manuscripts/types";
import type { AudioPublicationCheckpoint } from "./audio-publication-checkpoints";
import {
  parseAudioVolumePromotionOptions,
  planAudioVolumePromotion,
  readPreviousTargetRenderedWordCount,
} from "./promote-audio-volume";

const version = "2026-08-01-nine-volume-revision-v1";
const base = "https://project.supabase.co/storage/v1/object/public/audio-clips";

function section(
  sectionId: string,
  volumeId: string,
  audioVersionId = `${sectionId}-current`,
): CompiledSection {
  return {
    sectionId,
    volumeId,
    audioVersionId,
  } as CompiledSection;
}

function catalog(): CompiledCatalog {
  return {
    sections: [
      section("v01-first", "humanitys-most-viable-future"),
      section("v01-second", "humanitys-most-viable-future"),
      section("v02-only", "wielding-intelligence"),
    ],
  } as CompiledCatalog;
}

function oldClip(sectionId: string): AudioClipSection {
  return {
    sectionId,
    audioVersionId: `${sectionId}-old`,
    href: `${base}/audiobook/old/high-quality-1/${sectionId}-old.opus`,
    format: "opus",
    byteSize: 100,
    durationSeconds: 10,
    timingsByteSize: 50,
  };
}

function manifest(): AudioClipManifest {
  return {
    version: 1,
    generatedAt: "2026-07-01T00:00:00.000Z",
    voices: [{
      id: "high-quality-1",
      label: "High Quality 1",
      provider: "fish-audio",
      model: "s2.1-pro-free",
      renderedWordCount: 31,
      sections: [oldClip("v01-first"), oldClip("v01-second"), oldClip("v02-only")],
    }],
  };
}

function checkpointFiles(): AudioPublicationCheckpoint["files"] {
  return ["v01-first", "v01-second"].map((sectionId, index) => {
    const audioVersionId = `${sectionId}-current`;
    return {
      sectionId,
      audioVersionId,
      durationSeconds: 12 + index,
      exactWordCount: 10 + index * 2,
      interpolatedWordCount: index === 0 ? 1 : 0,
      timingSource: "mlx-whisper" as const,
      audio: {
        objectKey: `audiobook/${version}/high-quality-1/${audioVersionId}.opus`,
        byteSize: 1_000 + index,
        sha256: "a".repeat(64),
      },
      timings: {
        objectKey: `audiobook/${version}/high-quality-1/${audioVersionId}.timings.json`,
        byteSize: 200 + index,
        sha256: "b".repeat(64),
      },
    };
  });
}

function checkpoint(): AudioPublicationCheckpoint {
  const files = checkpointFiles();
  return {
    schemaVersion: 1,
    editorialId: "volume-01",
    volumeId: "humanitys-most-viable-future",
    version,
    runId: version,
    sourceCommit: "c".repeat(40),
    catalogHash: "d".repeat(16),
    settingsHash: "e".repeat(12),
    provider: "fish-audio",
    model: "s2.1-pro-free",
    narrator: {
      id: "high-quality-1",
      label: "High Quality 1",
      referenceId: "reference-id",
    },
    recordedAt: "2026-08-01T12:00:00.000Z",
    remoteVerifiedAt: "2026-08-01T12:01:00.000Z",
    summary: {
      sectionCount: files.length,
      objectCount: files.length * 2,
      durationSeconds: files.reduce((total, file) => total + file.durationSeconds, 0),
      audioBytes: files.reduce((total, file) => total + file.audio.byteSize, 0),
      timingsBytes: files.reduce((total, file) => total + file.timings.byteSize, 0),
    },
    filesSha256: crypto.createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
}

describe("per-volume audio promotion", () => {
  it("is read only unless the caller explicitly asks to write", () => {
    expect(parseAudioVolumePromotionOptions([
      "--volume", "volume-01", "--version", version,
    ])).toEqual({ editorialId: "volume-01", version, write: false });
    expect(parseAudioVolumePromotionOptions([
      "--volume=volume-01", `--version=${version}`, "--write",
    ]).write).toBe(true);
  });

  it("replaces exactly one volume and preserves every other entry", () => {
    const current = manifest();
    const preserved = current.voices[0]!.sections[2]!;
    const result = planAudioVolumePromotion({
      manifest: current,
      checkpoint: checkpoint(),
      catalog: catalog(),
      editorialId: "volume-01",
      volumeId: "humanitys-most-viable-future",
      previousTargetRenderedWordCount: 20,
    });

    expect(result.manifest.generatedAt).toBe("2026-08-01T12:01:00.000Z");
    expect(result.manifest.voices[0]!.renderedWordCount).toBe(34);
    expect(result.manifest.voices[0]!.sections).toEqual([
      {
        sectionId: "v01-first",
        audioVersionId: "v01-first-current",
        href: `${base}/audiobook/${version}/high-quality-1/v01-first-current.opus`,
        format: "opus",
        byteSize: 1_000,
        durationSeconds: 12,
        timingsByteSize: 200,
      },
      {
        sectionId: "v01-second",
        audioVersionId: "v01-second-current",
        href: `${base}/audiobook/${version}/high-quality-1/v01-second-current.opus`,
        format: "opus",
        byteSize: 1_001,
        durationSeconds: 13,
        timingsByteSize: 201,
      },
      preserved,
    ]);
    expect(result.replacedSectionCount).toBe(2);
    expect(result.promotedRenderedWordCount).toBe(23);
  });

  it("fails closed on incomplete, stale, cross-volume, or changed checkpoint evidence", () => {
    const missing = checkpoint();
    missing.files = missing.files.slice(0, 1);
    missing.summary.sectionCount = 1;
    missing.summary.objectCount = 2;
    missing.summary.durationSeconds = missing.files[0]!.durationSeconds;
    missing.summary.audioBytes = missing.files[0]!.audio.byteSize;
    missing.summary.timingsBytes = missing.files[0]!.timings.byteSize;
    missing.filesSha256 = crypto.createHash("sha256").update(JSON.stringify(missing.files)).digest("hex");
    expect(() => planAudioVolumePromotion({
      manifest: manifest(), checkpoint: missing, catalog: catalog(),
      editorialId: "volume-01", volumeId: "humanitys-most-viable-future",
      previousTargetRenderedWordCount: 20,
    })).toThrow("section count");

    const stale = checkpoint();
    stale.files[0]!.audioVersionId = "v01-first-stale";
    stale.files[0]!.audio.objectKey = `audiobook/${version}/high-quality-1/v01-first-stale.opus`;
    stale.files[0]!.timings.objectKey = `audiobook/${version}/high-quality-1/v01-first-stale.timings.json`;
    stale.filesSha256 = crypto.createHash("sha256").update(JSON.stringify(stale.files)).digest("hex");
    expect(() => planAudioVolumePromotion({
      manifest: manifest(), checkpoint: stale, catalog: catalog(),
      editorialId: "volume-01", volumeId: "humanitys-most-viable-future",
      previousTargetRenderedWordCount: 20,
    })).toThrow("audioVersionId is stale");

    const crossVolume = checkpoint();
    crossVolume.files[1]!.sectionId = "v02-second";
    crossVolume.filesSha256 = crypto.createHash("sha256").update(JSON.stringify(crossVolume.files)).digest("hex");
    expect(() => planAudioVolumePromotion({
      manifest: manifest(), checkpoint: crossVolume, catalog: catalog(),
      editorialId: "volume-01", volumeId: "humanitys-most-viable-future",
      previousTargetRenderedWordCount: 20,
    })).toThrow("cross-volume");

    const changedHash = checkpoint();
    changedHash.filesSha256 = "f".repeat(64);
    expect(() => planAudioVolumePromotion({
      manifest: manifest(), checkpoint: changedHash, catalog: catalog(),
      editorialId: "volume-01", volumeId: "humanitys-most-viable-future",
      previousTargetRenderedWordCount: 20,
    })).toThrow("filesSha256 does not match");
  });

  it("derives the replaced volume word count from exact remote timing evidence", async () => {
    const voice = manifest().voices[0]!;
    const timingValues = new Map(voice.sections.slice(0, 2).map((clip, index) => {
      const value = JSON.stringify({
        version: 1,
        sectionId: clip.sectionId,
        audioVersionId: clip.audioVersionId,
        voiceId: voice.id,
        exactWordCount: 8 + index,
        interpolatedWordCount: 2,
      });
      clip.timingsByteSize = Buffer.byteLength(value);
      return [clip.sectionId, value] as const;
    }));
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const sectionId = [...timingValues.keys()].find((id) => String(url).includes(id));
      return new Response(timingValues.get(sectionId!)!, { status: 200 });
    }) as unknown as typeof fetch;

    await expect(readPreviousTargetRenderedWordCount({
      voice,
      editorialId: "volume-01",
      fetchImpl,
    })).resolves.toBe(21);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects remote timing evidence with the wrong identity or size", async () => {
    const voice = manifest().voices[0]!;
    const payload = JSON.stringify({
      version: 1,
      sectionId: "wrong",
      audioVersionId: voice.sections[0]!.audioVersionId,
      voiceId: voice.id,
      exactWordCount: 10,
      interpolatedWordCount: 0,
    });
    voice.sections[0]!.timingsByteSize = Buffer.byteLength(payload);
    const fetchImpl = vi.fn(async () => new Response(payload, { status: 200 })) as unknown as typeof fetch;
    await expect(readPreviousTargetRenderedWordCount({
      voice: { ...voice, sections: [voice.sections[0]!] },
      editorialId: "volume-01",
      fetchImpl,
    })).rejects.toThrow("identity does not match");
  });
});
