import { describe, expect, it } from "vitest";
import { allSections } from "./manuscript-data";
import { queueFromSections } from "./audio-queue";

describe("audio queue", () => {
  it("preserves section order for chapter playback", () => {
    const sections = allSections().slice(0, 4);
    const queue = queueFromSections(sections);

    expect(queue.map((item) => item.sectionId)).toEqual(
      sections.map((section) => section.sectionId),
    );
    expect(queue.map((item) => item.audioVersionId)).toEqual(
      sections.map((section) => section.audioVersionId),
    );
  });
});
