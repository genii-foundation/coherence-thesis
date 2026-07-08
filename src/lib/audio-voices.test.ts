import { describe, expect, it } from "vitest";
import { clipVoicePreferenceId } from "@/lib/audio-manifest";
import {
  audioVoiceMenuGroups,
  elegantSystemVoices,
  selectableVoiceIds,
} from "@/lib/audio-voices";

describe("audio voice menu", () => {
  it("limits system voices to five narrator-style choices", () => {
    const voices = [
      { id: "albert", label: "Albert" },
      { id: "zarvox", label: "Zarvox" },
      { id: "samantha", label: "Samantha" },
      { id: "daniel", label: "Daniel" },
      { id: "karen", label: "Karen" },
      { id: "moira", label: "Moira" },
      { id: "tessa", label: "Tessa" },
      { id: "ava", label: "Ava" },
    ];

    expect(elegantSystemVoices(voices).map((voice) => voice.label)).toEqual([
      "Samantha",
      "Daniel",
      "Karen",
      "Moira",
      "Tessa",
    ]);
  });

  it("places hosted clip voices above system voices", () => {
    const groups = audioVoiceMenuGroups({
      manifest: {
        version: 1,
        voices: [
          {
            id: "default",
            label: "High Quality 1",
            sections: [],
          },
        ],
      },
      voices: [
        {
          id: clipVoicePreferenceId("default"),
          label: "High Quality 1",
        },
        { id: "samantha", label: "Samantha" },
        { id: "albert", label: "Albert" },
      ],
    });

    expect(groups.highQuality).toEqual([
      {
        id: "clip:default",
        label: "High Quality 1",
      },
    ]);
    expect(groups.system).toEqual([{ id: "samantha", label: "Samantha" }]);
  });

  it("shows Fish as pending when hosted clips are not available yet", () => {
    const groups = audioVoiceMenuGroups({
      manifest: { version: 1, voices: [] },
      voices: [{ id: "samantha", label: "Samantha" }],
    });

    expect(groups.highQuality).toEqual([
      {
        id: "clip:default",
        label: "High Quality 1 (clips pending)",
        disabled: true,
      },
    ]);
    expect(selectableVoiceIds(groups).has("clip:default")).toBe(false);
  });
});
