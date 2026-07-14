import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseFishGenerateOptions,
  reuseExistingGeneratedFile,
} from "./fish-generate";
import {
  generatedFileFingerprint,
  type FishAudioFile,
} from "./fish-generator";

describe("Fish generation safeguards", () => {
  it("requires integer paid-run limits and sample character caps", () => {
    expect(() => parseFishGenerateOptions(["--limit", "1.5"])).toThrow(
      "positive integer",
    );
    expect(() =>
      parseFishGenerateOptions(["--mode", "sample", "--max-chars", "-1"]),
    ).toThrow("positive integer");
    expect(() =>
      parseFishGenerateOptions(["--mode", "sample", "--max-chars", "20.5"]),
    ).toThrow("positive integer");
  });

  it("reuses local output only when bytes and timing identity match", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fish-resume-"));
    const audioPath = path.join(root, "section.opus");
    const timingsPath = path.join(root, "section.timings.json");
    const text = "Section\n\nBody";
    const audio = Buffer.from("audio bytes");
    const timings = Buffer.from(`${JSON.stringify({
      version: 1,
      sectionId: "section-a",
      audioVersionId: "section-a-version",
      voiceId: "narrator",
      textCharacters: text.length,
      durationSeconds: 1,
      exactWordCount: 1,
      interpolatedWordCount: 0,
      words: [{
        charStart: 0,
        charEnd: 7,
        startSeconds: 0,
        endSeconds: 1,
        match: "exact",
      }],
    }, null, 2)}\n`);
    fs.writeFileSync(audioPath, audio);
    fs.writeFileSync(timingsPath, timings);
    const file: FishAudioFile = {
      sectionId: "section-a",
      title: "Section",
      contentHash: "content",
      audioVersionId: "section-a-version",
      volumeId: "volume-one",
      voiceId: "narrator",
      voiceLabel: "Narrator",
      provider: "fish-audio",
      model: "s2.1-pro-free",
      format: "opus",
      inputBytes: Buffer.byteLength(text, "utf8"),
      inputCharacters: text.length,
      outputPath: audioPath,
      relativeOutputPath: "section.opus",
      timingsOutputPath: timingsPath,
      timingsRelativeOutputPath: "section.timings.json",
      publicCacheKey: "fish/cache/opus",
      generatedAt: "2026-07-13T00:00:00.000Z",
      durationSeconds: 1,
      byteSize: audio.byteLength,
      audioSha256: generatedFileFingerprint(audio),
      timingsByteSize: timings.byteLength,
      timingsSha256: generatedFileFingerprint(timings),
      exactWordCount: 1,
      interpolatedWordCount: 0,
    };

    expect(reuseExistingGeneratedFile(file, text)).toBe(true);
    expect(file.skipped).toBe(true);
    expect(file.publicCacheKey).toMatch(/\/[a-f0-9]{12}$/);

    fs.writeFileSync(audioPath, "swapped bytes");
    expect(reuseExistingGeneratedFile(file, text)).toBe(false);
  });

  it("rejects malformed timing files even when their digest is recorded", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fish-resume-"));
    const audioPath = path.join(root, "section.opus");
    const timingsPath = path.join(root, "section.timings.json");
    const audio = Buffer.from("audio bytes");
    const timings = Buffer.from("{}\n");
    fs.writeFileSync(audioPath, audio);
    fs.writeFileSync(timingsPath, timings);

    expect(reuseExistingGeneratedFile({
      sectionId: "section-a",
      title: "Section",
      contentHash: "content",
      audioVersionId: "section-a-version",
      volumeId: "volume-one",
      voiceId: "narrator",
      voiceLabel: "Narrator",
      provider: "fish-audio",
      model: "s2.1-pro-free",
      format: "opus",
      inputBytes: 1,
      inputCharacters: 1,
      outputPath: audioPath,
      relativeOutputPath: "section.opus",
      timingsOutputPath: timingsPath,
      timingsRelativeOutputPath: "section.timings.json",
      publicCacheKey: "fish/cache/opus",
      durationSeconds: 1,
      byteSize: audio.byteLength,
      audioSha256: generatedFileFingerprint(audio),
      timingsByteSize: timings.byteLength,
      timingsSha256: generatedFileFingerprint(timings),
      exactWordCount: 1,
      interpolatedWordCount: 0,
    }, "x")).toBe(false);
  });
});
