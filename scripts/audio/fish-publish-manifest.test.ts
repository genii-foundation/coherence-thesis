import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAudioClipManifest,
  parseAudioPublishOptions,
  validateAudioRunForPublish,
  type PublishCatalogSection,
} from "./fish-publish-manifest";
import type { FishAudioFile, FishRunManifest } from "./fish-generator";

const generatedAt = "2026-07-08T00:00:00.000Z";

function audioFile(overrides: Partial<FishAudioFile> = {}): FishAudioFile {
  return {
    sectionId: "section-a",
    title: "Section A",
    contentHash: "hash",
    audioVersionId: "section-a-hash",
    volumeId: "volume-one",
    voiceId: "default",
    voiceLabel: "Default",
    provider: "fish-audio",
    model: "s2.1-pro-free",
    format: "mp3",
    inputBytes: 10,
    inputCharacters: 10,
    outputPath: "/tmp/file.mp3",
    relativeOutputPath: "voices/default/file.mp3",
    publicCacheKey: "key",
    generatedAt,
    durationSeconds: 12,
    byteSize: 123,
    ...overrides,
  };
}

function runWith(files: FishAudioFile[]): FishRunManifest {
  return {
    provider: "fish-audio",
    model: "s2.1-pro-free",
    mode: "full",
    runId: "fish-run",
    generatedAt,
    corpus: {
      sections: 1,
      voices: 1,
      inputBytes: 10,
      inputCharacters: 10,
      estimatedPaidCostUsd: 0,
    },
    voices: [{ id: "default", label: "Default" }],
    files,
  };
}

describe("Fish Supabase audio manifest publishing", () => {
  let runRoot: string;

  const catalogSections: PublishCatalogSection[] = [
    {
      sectionId: "section-a",
      title: "Section A",
      audioVersionId: "section-a-hash",
    },
  ];

  beforeEach(() => {
    runRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fish-publish-"));
    fs.mkdirSync(path.join(runRoot, "voices/default"), { recursive: true });
    fs.writeFileSync(path.join(runRoot, "voices/default/file.mp3"), "audio");
  });

  it("keeps validation read only unless writing or uploading is explicit", () => {
    const baseArgs = ["--run-id", "fish-run", "--version", "version-one"];

    expect(parseAudioPublishOptions(baseArgs)).toMatchObject({
      upload: false,
      write: false,
    });
    expect(parseAudioPublishOptions([...baseArgs, "--write"])).toMatchObject({
      upload: false,
      write: true,
    });
    expect(parseAudioPublishOptions([...baseArgs, "--upload"])).toMatchObject({
      upload: true,
      write: true,
    });
  });

  afterEach(() => {
    fs.rmSync(runRoot, { recursive: true, force: true });
  });

  it("maps generated Fish files to versioned Supabase public clip hrefs", () => {
    const run = runWith([audioFile()]);
    const files = validateAudioRunForPublish({
      run,
      runRoot,
      catalogSections,
      version: "2026-07-audiobook-v1",
      publicBase:
        "https://project.supabase.co/storage/v1/object/public/audio-clips",
    });

    expect(createAudioClipManifest({ run, catalogSections, files })).toEqual({
      version: 1,
      generatedAt,
      voices: [
        {
          id: "default",
          label: "Default",
          provider: "fish-audio",
          model: "s2.1-pro-free",
          sections: [
            {
              sectionId: "section-a",
              audioVersionId: "section-a-hash",
              href: "https://project.supabase.co/storage/v1/object/public/audio-clips/audiobook/2026-07-audiobook-v1/default/section-a-hash.mp3",
              byteSize: 123,
              durationSeconds: 12,
            },
          ],
        },
      ],
    });
  });

  it("rejects unknown sections", () => {
    const run = runWith([audioFile({ sectionId: "missing-section" })]);

    expect(() =>
      validateAudioRunForPublish({
        run,
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase:
          "https://project.supabase.co/storage/v1/object/public/audio-clips",
      }),
    ).toThrow("Unknown sectionId");
  });

  it("rejects stale audioVersionIds", () => {
    const run = runWith([audioFile({ audioVersionId: "old-hash" })]);

    expect(() =>
      validateAudioRunForPublish({
        run,
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase:
          "https://project.supabase.co/storage/v1/object/public/audio-clips",
      }),
    ).toThrow("Stale audioVersionId");
  });

  it("rejects duplicate mappings", () => {
    const run = runWith([audioFile(), audioFile()]);

    expect(() =>
      validateAudioRunForPublish({
        run,
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase:
          "https://project.supabase.co/storage/v1/object/public/audio-clips",
      }),
    ).toThrow("Duplicate audio mapping");
  });

  it("rejects missing source files", () => {
    const run = runWith([
      audioFile({ relativeOutputPath: "voices/default/missing.mp3" }),
    ]);

    expect(() =>
      validateAudioRunForPublish({
        run,
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase:
          "https://project.supabase.co/storage/v1/object/public/audio-clips",
      }),
    ).toThrow("Missing audio file");
  });
});
