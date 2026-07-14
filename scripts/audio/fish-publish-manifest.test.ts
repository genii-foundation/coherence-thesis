import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAudioClipManifest,
  parseAudioPublishOptions,
  remoteObjectMatches,
  uploadObject,
  validateAudioRunForPublish,
  type PublishCatalogSection,
} from "./fish-publish-manifest";
import {
  generatedFileFingerprint,
  type FishAudioFile,
  type FishRunManifest,
} from "./fish-generator";

const generatedAt = "2026-07-08T00:00:00.000Z";
const canonicalAudioText = "Section A\n\nBody";
const audioBytes = Buffer.from("opus-audio");
const timingBytes = Buffer.from(JSON.stringify({
  version: 1,
  sectionId: "section-a",
  audioVersionId: "section-a-hash",
  voiceId: "default",
  textCharacters: canonicalAudioText.length,
  durationSeconds: 1,
  exactWordCount: 1,
  interpolatedWordCount: 0,
  words: [{
    charStart: 0,
    charEnd: 7,
    startSeconds: 0,
    endSeconds: 0.7,
    match: "exact",
  }],
}));

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
    format: "opus",
    inputBytes: Buffer.byteLength(canonicalAudioText, "utf8"),
    inputCharacters: canonicalAudioText.length,
    outputPath: "/tmp/legacy-worktree/file.opus",
    relativeOutputPath: "voices/default/file.opus",
    timingsOutputPath: "/tmp/legacy-worktree/file.timings.json",
    timingsRelativeOutputPath: "voices/default/file.timings.json",
    publicCacheKey: "key",
    generatedAt,
    durationSeconds: 1,
    byteSize: audioBytes.byteLength,
    audioSha256: generatedFileFingerprint(audioBytes),
    timingsByteSize: timingBytes.byteLength,
    timingsSha256: generatedFileFingerprint(timingBytes),
    exactWordCount: 1,
    interpolatedWordCount: 0,
    ...overrides,
  };
}

function runWith(files: FishAudioFile[]): FishRunManifest {
  return {
    schemaVersion: 2,
    provider: "fish-audio",
    endpoint: "stream-with-timestamp",
    model: "s2.1-pro-free",
    mode: "full",
    runId: "fish-run",
    generatedAt,
    corpus: {
      sections: 1,
      voices: 1,
      inputBytes: Buffer.byteLength(canonicalAudioText, "utf8"),
      inputCharacters: canonicalAudioText.length,
      estimatedPaidCostUsd: 0,
    },
    voices: [{ id: "default", label: "Default", referenceId: "fish-voice-id" }],
    files,
  };
}

describe("Fish Supabase audio manifest publishing", () => {
  let runRoot: string;

  const catalogSections: PublishCatalogSection[] = [
    {
      sectionId: "section-a",
      title: "Section A",
      text: "Body",
      audioVersionId: "section-a-hash",
    },
  ];

  beforeEach(() => {
    runRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fish-publish-"));
    fs.mkdirSync(path.join(runRoot, "voices/default"), { recursive: true });
    fs.writeFileSync(path.join(runRoot, "voices/default/file.opus"), audioBytes);
    fs.writeFileSync(
      path.join(runRoot, "voices/default/file.timings.json"),
      timingBytes,
    );
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
    expect(() =>
      parseAudioPublishOptions(["--run-id", "../escape", "--version", "one"]),
    ).toThrow("one safe path segment");
    expect(() =>
      parseAudioPublishOptions(["--run-id", "run", "--version", "../escape"]),
    ).toThrow("one safe path segment");
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
              href: "https://project.supabase.co/storage/v1/object/public/audio-clips/audiobook/2026-07-audiobook-v1/default/section-a-hash.opus",
              format: "opus",
              timingsHref:
                "https://project.supabase.co/storage/v1/object/public/audio-clips/audiobook/2026-07-audiobook-v1/default/section-a-hash.timings.json",
              byteSize: audioBytes.byteLength,
              timingsByteSize: timingBytes.byteLength,
              durationSeconds: 1,
            },
          ],
        },
      ],
    });
  });

  it("publishes timestamped Opus audio and timing sidecars together", () => {
    const run = runWith([audioFile()]);
    const files = validateAudioRunForPublish({
      run,
      runRoot,
      catalogSections,
      version: "2026-07-audiobook-v2",
      publicBase: "https://project.supabase.co/storage/v1/object/public/audio-clips",
    });

    expect(files[0]).toMatchObject({
      objectKey: "audiobook/2026-07-audiobook-v2/default/section-a-hash.opus",
      contentType: "audio/ogg",
      timingsObjectKey:
        "audiobook/2026-07-audiobook-v2/default/section-a-hash.timings.json",
    });
    expect(createAudioClipManifest({ run, catalogSections, files }).voices[0]!.sections[0])
      .toMatchObject({
        format: "opus",
        timingsHref:
          "https://project.supabase.co/storage/v1/object/public/audio-clips/audiobook/2026-07-audiobook-v2/default/section-a-hash.timings.json",
      });
  });

  it("rejects a timestamped run without its timing sidecar", () => {
    const run = runWith([audioFile({
      timingsOutputPath: undefined,
      timingsRelativeOutputPath: undefined,
      timingsByteSize: undefined,
      timingsSha256: undefined,
    })]);

    expect(() =>
      validateAudioRunForPublish({
        run,
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v2",
        publicBase: "https://project.supabase.co/storage/v1/object/public/audio-clips",
      }),
    ).toThrow("Missing timestamp sidecar mapping");
  });

  it("rejects legacy and MP3 runs as new durable publications", () => {
    const current = runWith([audioFile()]);
    expect(() =>
      validateAudioRunForPublish({
        run: { ...current, schemaVersion: undefined, endpoint: undefined },
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v2",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("schema version 2 timestamped run");
    expect(() =>
      validateAudioRunForPublish({
        run: runWith([audioFile({ format: "mp3" })]),
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v2",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("Unsupported audio format");
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

  it("rejects sample runs, stale titles, and mismatched spoken input", () => {
    expect(() =>
      validateAudioRunForPublish({
        run: { ...runWith([audioFile()]), mode: "sample" },
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("full corpus");
    expect(() =>
      validateAudioRunForPublish({
        run: runWith([audioFile({ title: "Old title" })]),
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("Stale title");
    expect(() =>
      validateAudioRunForPublish({
        run: runWith([audioFile({ inputCharacters: 1 })]),
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("input length");
  });

  it("rejects empty, swapped, and zero-duration audio", () => {
    const audioPath = path.join(runRoot, "voices/default/file.opus");
    fs.writeFileSync(audioPath, "");
    expect(() =>
      validateAudioRunForPublish({
        run: runWith([audioFile({
          byteSize: 0,
          audioSha256: generatedFileFingerprint(Buffer.alloc(0)),
        })]),
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("byte size");

    fs.writeFileSync(audioPath, "other-data");
    expect(() =>
      validateAudioRunForPublish({
        run: runWith([audioFile()]),
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("digest");

    fs.writeFileSync(audioPath, audioBytes);
    expect(() =>
      validateAudioRunForPublish({
        run: runWith([audioFile({ durationSeconds: 0 })]),
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("duration");
  });

  it("rejects file provenance that differs from the declared run", () => {
    expect(() =>
      validateAudioRunForPublish({
        run: runWith([audioFile({ model: "different-model" })]),
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("provenance");
    expect(() =>
      validateAudioRunForPublish({
        run: runWith([audioFile({ voiceId: "undeclared" })]),
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("undeclared voice");
    const duplicateVoices = runWith([audioFile()]);
    duplicateVoices.voices.push({ id: "default", label: "Default" });
    duplicateVoices.corpus.voices = 2;
    expect(() =>
      validateAudioRunForPublish({
        run: duplicateVoices,
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("exactly one narrator");
  });

  it("requires exactly one pinned narrator for durable publication", () => {
    const unpinned = runWith([audioFile()]);
    unpinned.voices[0]!.referenceId = undefined;
    expect(() =>
      validateAudioRunForPublish({
        run: unpinned,
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("exactly one narrator");

    const multiple = runWith([audioFile()]);
    multiple.voices.push({
      id: "second",
      label: "Second",
      referenceId: "second-fish-voice-id",
    });
    multiple.corpus.voices = 2;
    expect(() =>
      validateAudioRunForPublish({
        run: multiple,
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("exactly one narrator");
  });

  it("rejects timing sidecars whose duration differs from the audio", () => {
    expect(() =>
      validateAudioRunForPublish({
        run: runWith([audioFile({ durationSeconds: 60 })]),
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("durations differ");
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
      audioFile({ relativeOutputPath: "voices/default/missing.opus" }),
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

  it("uses contained relative paths instead of stale absolute paths", () => {
    const run = runWith([
      audioFile({ outputPath: "/tmp/legacy-worktree/audio.mp3" }),
    ]);

    const files = validateAudioRunForPublish({
      run,
      runRoot,
      catalogSections,
      version: "2026-07-audiobook-v1",
      publicBase: "https://example.test/audio",
    });

    expect(files[0]!.filePath).toBe(path.join(runRoot, "voices/default/file.opus"));
    expect(() =>
      validateAudioRunForPublish({
        run: runWith([audioFile({ relativeOutputPath: "../escape.opus" })]),
        runRoot,
        catalogSections,
        version: "2026-07-audiobook-v1",
        publicBase: "https://example.test/audio",
      }),
    ).toThrow("escapes");
  });

  it("requires matching remote digest metadata before reusing an object", () => {
    const local = { byteSize: 5, sha256: "abc", contentType: "audio/ogg" };
    const matchingRemote = {
      byteSize: 5,
      sha256: "abc",
      contentType: "audio/ogg",
      cacheControl: "public, max-age=31536000, immutable",
    };
    expect(
      remoteObjectMatches(local, matchingRemote),
    ).toBe(true);
    expect(
      remoteObjectMatches(local, { ...matchingRemote, byteSize: null }),
    ).toBe(true);
    expect(
      remoteObjectMatches(
        local,
        { ...matchingRemote, sha256: null },
      ),
    ).toBe(false);
    expect(
      remoteObjectMatches(
        local,
        { ...matchingRemote, byteSize: 4 },
      ),
    ).toBe(false);
    expect(remoteObjectMatches(local, {
      ...matchingRemote,
      contentType: "application/octet-stream",
    })).toBe(false);
    expect(remoteObjectMatches(local, {
      ...matchingRemote,
      cacheControl: null,
    })).toBe(false);
  });

  it("uses a conditional PUT and resolves a creation race without overwriting", async () => {
    const filePath = path.join(runRoot, "voices/default/file.opus");
    const sha256 = generatedFileFingerprint(audioBytes);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: {
          "content-length": String(audioBytes.byteLength),
          "content-type": "audio/ogg",
          "cache-control": "public, max-age=31536000, immutable",
          "x-amz-meta-sha256": sha256,
        },
      }));

    await expect(uploadObject({
      endpoint: "https://example.test/storage/v1/s3",
      bucket: "audio-clips",
      file: {
        filePath,
        objectKey: "audiobook/version/narrator/file.opus",
        contentType: "audio/ogg",
        byteSize: audioBytes.byteLength,
        sha256,
      },
      credentials: {
        accessKeyId: "access",
        secretAccessKey: "secret",
        region: "us-east-2",
      },
    })).resolves.toBe("skipped");

    const putHeaders = fetchMock.mock.calls[1]![1]!.headers as Record<string, string>;
    expect(putHeaders["if-none-match"]).toBe("*");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("validates completed files during a partial watched run", () => {
    const partialCatalog = [
      ...catalogSections,
      {
        sectionId: "section-b",
        title: "Section B",
        text: "Second body",
        audioVersionId: "section-b-hash",
      },
    ];

    const files = validateAudioRunForPublish({
      run: runWith([audioFile()]),
      runRoot,
      catalogSections: partialCatalog,
      version: "2026-07-audiobook-v1",
      publicBase: "https://project.supabase.co/storage/v1/object/public/audio-clips",
      requireComplete: false,
    });

    expect(files).toHaveLength(1);
    expect(files[0]!.source.sectionId).toBe("section-a");
  });
});
