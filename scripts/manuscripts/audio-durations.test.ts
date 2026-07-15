import { describe, expect, it } from "vitest";
import type { AudioClipManifest } from "../../src/lib/audio-manifest";
import { applyRecordedAudioDurations } from "./audio-durations";
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
  });
});
