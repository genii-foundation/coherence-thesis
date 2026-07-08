import { describe, expect, it } from "vitest";
import { createAudioClipManifest } from "./fish-publish-manifest";
import type { FishRunManifest } from "./fish-generator";

describe("Fish site audio manifest", () => {
  it("maps generated Fish files to public clip hrefs", () => {
    const run: FishRunManifest = {
      provider: "fish-audio",
      model: "s2.1-pro-free",
      mode: "full",
      runId: "fish-run",
      generatedAt: "2026-07-08T00:00:00.000Z",
      corpus: {
        sections: 1,
        voices: 1,
        inputBytes: 10,
        inputCharacters: 10,
        estimatedPaidCostUsd: 0,
      },
      voices: [{ id: "default", label: "Default" }],
      files: [
        {
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
          generatedAt: "2026-07-08T00:00:00.000Z",
          durationSeconds: 12,
          byteSize: 123,
        },
      ],
    };

    expect(
      createAudioClipManifest({
        run,
        publicBase: "/audio/fish-run",
      }),
    ).toEqual({
      version: 1,
      generatedAt: "2026-07-08T00:00:00.000Z",
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
              href: "/audio/fish-run/voices/default/file.mp3",
              byteSize: 123,
              durationSeconds: 12,
            },
          ],
        },
      ],
    });
  });
});
