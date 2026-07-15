import { describe, expect, it } from "vitest";
import type { FishAudioFile, FishRunManifest } from "./fish-generator";
import {
  mergeCompatibleRunManifest,
  selectRunWorkFiles,
} from "./fish-run-resume";

function file(sectionId: string, overrides: Partial<FishAudioFile> = {}): FishAudioFile {
  return {
    sectionId,
    title: sectionId,
    contentHash: `${sectionId}-content`,
    audioVersionId: `${sectionId}-audio`,
    volumeId: "volume-one",
    voiceId: "narrator",
    voiceLabel: "Narrator",
    provider: "fish-audio",
    model: "s2.1-pro-free",
    format: "opus",
    inputBytes: 10,
    inputCharacters: 10,
    outputPath: `/new/${sectionId}.opus`,
    relativeOutputPath: `voices/narrator/${sectionId}.opus`,
    timingsOutputPath: `/new/${sectionId}.timings.json`,
    timingsRelativeOutputPath: `voices/narrator/${sectionId}.timings.json`,
    publicCacheKey: `fish/${sectionId}`,
    ...overrides,
  };
}

function manifest(files: FishAudioFile[]): FishRunManifest {
  return {
    schemaVersion: 2,
    provider: "fish-audio",
    endpoint: "stream-with-timestamp",
    model: "s2.1-pro-free",
    mode: "full",
    runId: "run-one",
    generatedAt: "2026-07-13T00:00:00.000Z",
    settingsHash: "settings-one",
    catalogHash: "catalog-one",
    corpus: {
      sections: files.length,
      voices: 1,
      inputBytes: files.length * 10,
      inputCharacters: files.length * 10,
      estimatedPaidCostUsd: 0,
    },
    voices: [{ id: "narrator", label: "Narrator", referenceId: "voice-ref" }],
    files,
  };
}

describe("Fish audio run resume", () => {
  it("retains the complete inventory while copying completed state", () => {
    const desired = manifest([file("one"), file("two")]);
    const existing = manifest([
      file("one", {
        outputPath: "/old/one.opus",
        timingsOutputPath: "/old/one.timings.json",
        generatedAt: "2026-07-13T01:00:00.000Z",
        byteSize: 42,
        publicCacheKey: "fish/one/fingerprint",
        timingSource: "mlx-whisper",
        providerTimingError: "Fish alignment was incomplete.",
      }),
      file("two"),
    ]);

    const merged = mergeCompatibleRunManifest(existing, desired);

    expect(merged.files).toHaveLength(2);
    expect(merged.files[0]).toMatchObject({
      outputPath: "/new/one.opus",
      generatedAt: "2026-07-13T01:00:00.000Z",
      byteSize: 42,
      publicCacheKey: "fish/one/fingerprint",
      timingSource: "mlx-whisper",
      providerTimingError: "Fish alignment was incomplete.",
    });
  });

  it("rejects settings, catalog, and file inventory drift", () => {
    const desired = manifest([file("one")]);
    expect(() =>
      mergeCompatibleRunManifest(
        { ...manifest([file("one")]), settingsHash: "other" },
        desired,
      ),
    ).toThrow("generation settings");
    expect(() =>
      mergeCompatibleRunManifest(
        { ...manifest([file("one")]), catalogHash: "other" },
        desired,
      ),
    ).toThrow("manuscript catalog");
    expect(() =>
      mergeCompatibleRunManifest(manifest([file("different")]), desired),
    ).toThrow("differs");
  });

  it("allows Markdown-only changes when the spoken audio identity is unchanged", () => {
    const desired = manifest([file("one", { contentHash: "new-markdown" })]);
    const existing = manifest([file("one", { contentHash: "old-markdown" })]);

    expect(mergeCompatibleRunManifest(existing, desired).files[0]!.contentHash)
      .toBe("new-markdown");
  });

  it("selects a retry queue without shrinking the run", () => {
    const run = manifest([file("one"), file("two"), file("three")]);

    expect(selectRunWorkFiles(run, ["two"], null).map((entry) => entry.sectionId))
      .toEqual(["two"]);
    expect(run.files).toHaveLength(3);
    expect(selectRunWorkFiles(run, [], 2)).toHaveLength(2);
  });

  it("applies limits to sections rather than individual narrator files", () => {
    const run = manifest([
      file("one"),
      file("two"),
      file("one", { voiceId: "second", voiceLabel: "Second" }),
      file("two", { voiceId: "second", voiceLabel: "Second" }),
    ]);

    expect(selectRunWorkFiles(run, [], 1).map((entry) => entry.sectionId))
      .toEqual(["one", "one"]);
  });
});
