import { describe, expect, it } from "vitest";
import { allSections } from "./manuscript-data";
import { queueFromSection, queueFromSections } from "./audio-queue";

describe("audio queue", () => {
  it("builds a queue item from a section", () => {
    const section = allSections()[0];
    const queue = queueFromSection(section);

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      sectionId: section.sectionId,
      title: section.title,
      text: section.text,
      audioVersionId: section.audioVersionId,
    });
  });

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
