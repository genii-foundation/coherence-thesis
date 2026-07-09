import { describe, expect, it } from "vitest";
import {
  audioWordId,
  audioWordIdForCharIndex,
} from "@/lib/audio-word-anchors";

describe("audio word anchors", () => {
  it("builds stable word ids from section and word index", () => {
    expect(audioWordId("v01-purposeful", 12)).toBe(
      "audio-word-v01-purposeful-12",
    );
  });

  it("maps playback character positions to word anchors", () => {
    const text = "First word. Second word.";

    expect(
      audioWordIdForCharIndex({
        sectionId: "v01-purposeful",
        text,
        charIndex: 0,
      }),
    ).toBe("audio-word-v01-purposeful-0");
    expect(
      audioWordIdForCharIndex({
        sectionId: "v01-purposeful",
        text,
        charIndex: 12,
      }),
    ).toBe("audio-word-v01-purposeful-2");
    expect(
      audioWordIdForCharIndex({
        sectionId: "v01-purposeful",
        text,
        charIndex: text.length + 10,
      }),
    ).toBe("audio-word-v01-purposeful-3");
  });
});
