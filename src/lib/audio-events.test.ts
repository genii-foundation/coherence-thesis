import { describe, expect, it } from "vitest";

import {
  audioStartFromWordMatchesSection,
  type AudioStartFromWordEventDetail,
} from "./audio-events";

const section = Object.freeze({
  audioVersionId: "section-audio-version",
  contentHash: "0123456789abcdef",
});

function detail(
  queueIdentity?: AudioStartFromWordEventDetail["queueIdentity"],
): AudioStartFromWordEventDetail {
  return Object.freeze({
    charIndex: 12,
    ...(queueIdentity === undefined ? {} : { queueIdentity }),
    sectionId: "section",
    wordId: "audio-word-section-2",
  });
}

describe("audio word start events", () => {
  it("preserves legacy events without a playback identity", () => {
    expect(audioStartFromWordMatchesSection(detail(), section)).toBe(true);
  });

  it("requires both bound identities to match the current section", () => {
    expect(
      audioStartFromWordMatchesSection(
        detail(Object.freeze({
          audioVersionId: section.audioVersionId,
          contentHash: section.contentHash,
        })),
        section,
      ),
    ).toBe(true);

    for (const queueIdentity of [
      {
        audioVersionId: "stale-audio-version",
        contentHash: section.contentHash,
      },
      {
        audioVersionId: section.audioVersionId,
        contentHash: "stale-content",
      },
    ]) {
      expect(
        audioStartFromWordMatchesSection(
          detail(Object.freeze(queueIdentity)),
          section,
        ),
      ).toBe(false);
    }
  });

  it("rejects malformed identity presence instead of treating it as legacy", () => {
    for (const queueIdentity of [
      undefined,
      null,
      { audioVersionId: section.audioVersionId },
      { contentHash: section.contentHash },
      {
        audioVersionId: section.audioVersionId,
        contentHash: section.contentHash,
        extra: true,
      },
    ]) {
      expect(
        audioStartFromWordMatchesSection(
          {
            charIndex: 12,
            queueIdentity,
            sectionId: "section",
            wordId: "audio-word-section-2",
          } as AudioStartFromWordEventDetail,
          section,
        ),
      ).toBe(false);
    }
  });

  it("requires exact bound word coordinates before playback admission", () => {
    const queueIdentity = Object.freeze({
      audioVersionId: section.audioVersionId,
      contentHash: section.contentHash,
    });
    for (const charIndex of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        audioStartFromWordMatchesSection(
          {
            charIndex,
            queueIdentity,
            sectionId: "section",
            wordId: "audio-word-section-2",
          },
          section,
        ),
      ).toBe(false);
    }
    for (const wordId of ["", 12, null]) {
      expect(
        audioStartFromWordMatchesSection(
          {
            charIndex: 12,
            queueIdentity,
            sectionId: "section",
            wordId,
          } as AudioStartFromWordEventDetail,
          section,
        ),
      ).toBe(false);
    }
  });
});
