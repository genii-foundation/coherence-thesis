import { describe, expect, it } from "vitest";
import type { AudioClipManifest } from "../../src/lib/audio-manifest";
import { textForAudio } from "../../src/lib/audio-text";
import { applyRecordedAudioDurations } from "./audio-durations";
import { wordCount } from "./io";
import { buildCatalog } from "./shared";

describe("applyRecordedAudioDurations", () => {
  it("keeps compiled catalog durations aligned with the current audio manifest", () => {
    const catalog = buildCatalog();
    const [currentSection, staleSection] = catalog.sections;

    expect(currentSection).toBeDefined();
    expect(staleSection).toBeDefined();

    currentSection!.audioDurationSeconds = 999;
    staleSection!.audioDurationSeconds = 999;

    const manifest: AudioClipManifest = {
      version: 1,
      voices: [
        {
          id: "narrator",
          label: "Narrator",
          renderedWordCount: 10,
          sections: [
            {
              sectionId: currentSection!.sectionId,
              audioVersionId: currentSection!.audioVersionId,
              href: "/current.opus",
              durationSeconds: 12.5,
            },
            {
              sectionId: staleSection!.sectionId,
              audioVersionId: "stale-version",
              href: "/stale.opus",
              durationSeconds: 50,
            },
          ],
        },
      ],
    };

    applyRecordedAudioDurations(catalog, manifest);

    expect(currentSection!.audioDurationSeconds).toBe(12.5);
    expect(staleSection!.audioDurationSeconds).toBeUndefined();
    expect(catalog.stats.audioDurationSeconds).toBe(12.5);
    expect(catalog.stats.recordedAudioSectionCount).toBe(1);
    const currentAudioWordCount = catalog.sections.reduce(
      (total, section) => total + wordCount(textForAudio(section)),
      0,
    );
    expect(catalog.stats.estimatedAudioDurationSeconds).toBe(
      currentAudioWordCount * 6.25,
    );
  });
});
