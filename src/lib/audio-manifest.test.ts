import { describe, expect, it } from "vitest";
import {
  recordedAudioDurationSummary,
  type AudioClipManifest,
} from "./audio-manifest";

const manifest: AudioClipManifest = {
  version: 1,
  voices: [
    {
      id: "narrator",
      label: "Narrator",
      sections: [
        {
          sectionId: "one",
          audioVersionId: "one-current",
          href: "/one.opus",
          durationSeconds: 90.25,
        },
        {
          sectionId: "two",
          audioVersionId: "two-stale",
          href: "/two.opus",
          durationSeconds: 60,
        },
        {
          sectionId: "three",
          audioVersionId: "three-current",
          href: "/three.opus",
        },
      ],
    },
  ],
};

describe("recorded audio duration", () => {
  it("uses concrete durations only for current audio versions", () => {
    const summary = recordedAudioDurationSummary(manifest, [
      { sectionId: "one", audioVersionId: "one-current" },
      { sectionId: "two", audioVersionId: "two-current" },
      { sectionId: "three", audioVersionId: "three-current" },
    ]);

    expect(summary.durationSeconds).toBe(90.25);
    expect(summary.sectionCount).toBe(1);
    expect(summary.durationSecondsBySection).toEqual(
      new Map([["one", 90.25]]),
    );
  });

  it("returns no recorded duration when the selected voice is unavailable", () => {
    expect(
      recordedAudioDurationSummary(
        manifest,
        [{ sectionId: "one", audioVersionId: "one-current" }],
        "missing",
      ),
    ).toMatchObject({ durationSeconds: 0, sectionCount: 0 });
  });
});
