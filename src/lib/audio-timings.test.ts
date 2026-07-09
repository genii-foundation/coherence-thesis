import { describe, expect, it } from "vitest";
import {
  createAudioTimingDocument,
  isAudioTimingDocument,
  timingForCharIndex,
  timingForSeconds,
} from "@/lib/audio-timings";

describe("audio timing documents", () => {
  it("maps Fish word segments to canonical text character ranges", () => {
    const text = "A Voice\n\nI've heard the quiet answer.";
    const timings = createAudioTimingDocument({
      sectionId: "section-a",
      audioVersionId: "section-a-hash",
      voiceId: "narrator",
      text,
      chunks: [
        {
          chunkSeq: 0,
          content: text,
          offsetSeconds: 0,
          audioDurationSeconds: 3.2,
          segments: [
            { text: "A", start: 0, end: 0.2 },
            { text: "Voice", start: 0.2, end: 0.7 },
            { text: "Ive", start: 0.8, end: 1.1 },
            { text: "heard", start: 1.1, end: 1.6 },
            { text: "the", start: 1.6, end: 1.9 },
            { text: "quiet", start: 1.9, end: 2.5 },
            { text: "answer", start: 2.5, end: 3.2 },
          ],
        },
      ],
    });

    expect(timings.exactWordCount).toBe(7);
    expect(timings.interpolatedWordCount).toBe(0);
    expect(timings.words[2]).toMatchObject({
      charStart: text.indexOf("I've"),
      startSeconds: 0.8,
      match: "exact",
    });
    expect(timingForSeconds(timings, 2.1)?.charStart).toBe(text.indexOf("quiet"));
    expect(timingForCharIndex(timings, text.indexOf("answer"))?.startSeconds).toBe(2.5);
    expect(isAudioTimingDocument(timings)).toBe(true);
  });

  it("interpolates isolated normalized words while retaining full coverage", () => {
    const text = "One two three four five 2026 seven eight nine ten";
    const spoken = ["One", "two", "three", "four", "five", "seven", "eight", "nine", "ten"];
    const timings = createAudioTimingDocument({
      sectionId: "section-a",
      audioVersionId: "section-a-hash",
      voiceId: "narrator",
      text,
      chunks: [
        {
          chunkSeq: 0,
          content: text,
          offsetSeconds: 0,
          audioDurationSeconds: 5,
          segments: spoken.map((word, index) => ({
            text: word,
            start: index * 0.5,
            end: (index + 1) * 0.5,
          })),
        },
      ],
    });

    expect(timings.words).toHaveLength(10);
    expect(timings.interpolatedWordCount).toBe(1);
    expect(timings.words[5]?.match).toBe("interpolated");
  });
});
