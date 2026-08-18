import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import type {
  AudioClipManifest,
  AudioClipSection,
} from "../../src/lib/audio-manifest";
import type { CompiledCatalog, CompiledSection } from "../manuscripts/types";
import type { AudioPublicationCheckpoint } from "./audio-publication-checkpoints";
import {
  parseAudioSectionPromotionOptions,
  planAudioSectionPromotion,
  readPreviousSectionsRenderedWordCount,
} from "./promote-audio-sections";

const version = "2026-08-17-pr-206-v1";
const base = "https://project.supabase.co/storage/v1/object/public/audio-clips";

function catalogSection(
  sectionId: string,
  volumeId: string,
): CompiledSection {
  return {
    sectionId,
    volumeId,
    audioVersionId: `${sectionId}-current`,
  } as CompiledSection;
}

function catalog(): CompiledCatalog {
  return {
    sections: [
      catalogSection("v01-first", "volume-one"),
      catalogSection("v01-unchanged", "volume-one"),
      catalogSection("v02-second", "volume-two"),
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
    generatedAt: "2026-08-01T00:00:00.000Z",
    voices: [{
      id: "high-quality-1",
      label: "High Quality 1",
      provider: "fish-audio",
      model: "s2.1-pro-free",
      renderedWordCount: 60,
      sections: [oldClip("v01-first"), oldClip("v01-unchanged"), oldClip("v02-second")],
    }],
  };
}

function checkpoint(
  editorialId: "volume-01" | "volume-02",
  volumeId: string,
  sectionId: string,
  exactWordCount: number,
): AudioPublicationCheckpoint {
  const audioVersionId = `${sectionId}-current`;
  const files: AudioPublicationCheckpoint["files"] = [{
    sectionId,
    audioVersionId,
    durationSeconds: 12,
    exactWordCount,
    interpolatedWordCount: 1,
    timingSource: "mlx-whisper",
    audio: {
      objectKey: `audiobook/${version}/high-quality-1/${audioVersionId}.opus`,
      byteSize: 1_000,
      sha256: "a".repeat(64),
    },
    timings: {
      objectKey: `audiobook/${version}/high-quality-1/${audioVersionId}.timings.json`,
      byteSize: 200,
      sha256: "b".repeat(64),
    },
  }];
  return {
    schemaVersion: 1,
    editorialId,
    volumeId,
    version,
    runId: "pr-206-delta",
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
    recordedAt: "2026-08-17T12:00:00.000Z",
    remoteVerifiedAt: "2026-08-17T12:01:00.000Z",
    summary: {
      sectionCount: 1,
      objectCount: 2,
      durationSeconds: 12,
      audioBytes: 1_000,
      timingsBytes: 200,
    },
    filesSha256: crypto.createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
}

describe("delta audio section promotion", () => {
  it("is read only by default and requires an exact section list", () => {
    expect(parseAudioSectionPromotionOptions([
      "--version", version,
      "--sections", "v01-first,v02-second",
    ])).toEqual({
      version,
      sectionIds: ["v01-first", "v02-second"],
      write: false,
    });
    expect(() => parseAudioSectionPromotionOptions([
      "--version", version,
    ])).toThrow("exact changed section ids");
  });

  it("patches selected sections across volumes and preserves every other clip", () => {
    const current = manifest();
    const unchanged = current.voices[0]!.sections[1]!;
    const result = planAudioSectionPromotion({
      manifest: current,
      checkpoints: [
        checkpoint("volume-01", "volume-one", "v01-first", 10),
        checkpoint("volume-02", "volume-two", "v02-second", 12),
      ],
      catalog: catalog(),
      version,
      sectionIds: ["v01-first", "v02-second"],
      previousRenderedWordCount: 30,
    });

    expect(result.promotedSectionIds).toEqual(["v01-first", "v02-second"]);
    expect(result.manifest.voices[0]!.sections[1]).toBe(unchanged);
    expect(result.manifest.voices[0]!.sections[0]).toMatchObject({
      sectionId: "v01-first",
      audioVersionId: "v01-first-current",
      href: `${base}/audiobook/${version}/high-quality-1/v01-first-current.opus`,
    });
    expect(result.manifest.voices[0]!.sections[2]).toMatchObject({
      sectionId: "v02-second",
      audioVersionId: "v02-second-current",
    });
    expect(result.promotedRenderedWordCount).toBe(24);
    expect(result.manifest.voices[0]!.renderedWordCount).toBe(54);
  });

  it("fails closed on missing, extra, stale, or cross-volume evidence", () => {
    const first = checkpoint("volume-01", "volume-one", "v01-first", 10);
    expect(() => planAudioSectionPromotion({
      manifest: manifest(), checkpoints: [first], catalog: catalog(), version,
      sectionIds: ["v01-first", "v02-second"], previousRenderedWordCount: 20,
    })).toThrow("Missing: v02-second");

    expect(() => planAudioSectionPromotion({
      manifest: manifest(), checkpoints: [first], catalog: catalog(), version,
      sectionIds: ["v02-second"], previousRenderedWordCount: 20,
    })).toThrow("Extra: v01-first");

    const stale = checkpoint("volume-01", "volume-one", "v01-first", 10);
    stale.files[0]!.audioVersionId = "v01-first-stale";
    stale.files[0]!.audio.objectKey = `audiobook/${version}/high-quality-1/v01-first-stale.opus`;
    stale.files[0]!.timings.objectKey = `audiobook/${version}/high-quality-1/v01-first-stale.timings.json`;
    stale.filesSha256 = crypto.createHash("sha256").update(JSON.stringify(stale.files)).digest("hex");
    expect(() => planAudioSectionPromotion({
      manifest: manifest(), checkpoints: [stale], catalog: catalog(), version,
      sectionIds: ["v01-first"], previousRenderedWordCount: 20,
    })).toThrow("audioVersionId is stale");

    const crossed = checkpoint("volume-01", "volume-two", "v01-first", 10);
    expect(() => planAudioSectionPromotion({
      manifest: manifest(), checkpoints: [crossed], catalog: catalog(), version,
      sectionIds: ["v01-first"], previousRenderedWordCount: 20,
    })).toThrow("cross-volume");
  });

  it("measures only selected prior timing sidecars", async () => {
    const voice = manifest().voices[0]!;
    const selected = ["v01-first", "v02-second"];
    const byId = new Map(selected.map((sectionId, index) => [sectionId, {
      exactWordCount: 7 + index,
      interpolatedWordCount: 1,
    }]));
    const fetched: string[] = [];
    const count = await readPreviousSectionsRenderedWordCount({
      voice,
      sectionIds: selected,
      fetchImpl: async (url) => {
        const section = voice.sections.find((candidate) =>
          String(url).includes(candidate.audioVersionId),
        )!;
        fetched.push(section.sectionId);
        const counts = byId.get(section.sectionId)!;
        const body = Buffer.from(JSON.stringify({
          version: 1,
          sectionId: section.sectionId,
          audioVersionId: section.audioVersionId,
          voiceId: voice.id,
          durationSeconds: 10,
          textCharacters: 1,
          words: [],
          ...counts,
        }));
        section.timingsByteSize = body.byteLength;
        return new Response(body, { status: 200 });
      },
    });
    expect(fetched.sort()).toEqual([...selected].sort());
    expect(count).toBe(17);
  });
});
