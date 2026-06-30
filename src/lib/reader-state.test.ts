import { describe, expect, it } from "vitest";
import { allSections } from "./manuscript-data";
import {
  emptyProgress,
  markRead,
  readPercent,
  recentlyReadSections,
  recommendNextSections,
  updatedSinceRead,
} from "./reader-state";

describe("reader progress", () => {
  it("marks a section read with its current hash", () => {
    const section = allSections()[0];
    const progress = markRead(emptyProgress(), section, 100, 1_700_000_000);

    expect(progress.sections[section.sectionId]).toMatchObject({
      sectionId: section.sectionId,
      contentHash: section.contentHash,
      paragraphs: section.paragraphs.map((paragraph) => ({
        paragraphId: paragraph.paragraphId,
        contentHash: paragraph.contentHash,
      })),
      readAt: 1_700_000_000,
      percent: 100,
    });
    expect(updatedSinceRead(progress, section)).toBe(false);
  });

  it("detects content updates after a section was read", () => {
    const section = allSections()[0];
    const progress = markRead(emptyProgress(), section);

    expect(
      updatedSinceRead(progress, {
        ...section,
        contentHash: "changed",
      }),
    ).toBe(true);
  });

  it("computes progress and recommends unread sections", () => {
    const sections = allSections().slice(0, 3);
    const progress = markRead(emptyProgress(), sections[0]);

    expect(readPercent(progress, sections)).toBe(33);
    expect(recommendNextSections(progress, sections, 2)).toMatchObject([
      {
        sectionId: sections[1].sectionId,
        href: sections[1].href,
        isUpdated: false,
      },
      {
        sectionId: sections[2].sectionId,
        href: sections[2].href,
        isUpdated: false,
      },
    ]);
  });

  it("prioritizes revised sections with changed paragraph anchors", () => {
    const sections = allSections().slice(0, 3);
    const progress = markRead(emptyProgress(), sections[0]);
    const changed = {
      ...sections[0],
      contentHash: "changed",
      paragraphs: sections[0].paragraphs.map((paragraph, index) => ({
        ...paragraph,
        contentHash: index === 1 ? "changed-paragraph" : paragraph.contentHash,
      })),
    };

    expect(recommendNextSections(progress, [changed, sections[1], sections[2]], 2)).toMatchObject([
      {
        sectionId: sections[0].sectionId,
        href: `${sections[0].href}#${sections[0].paragraphs[1].anchor}`,
        isUpdated: true,
      },
      {
        sectionId: sections[1].sectionId,
        href: sections[1].href,
        isUpdated: false,
      },
    ]);
  });

  it("lists recently read sections by newest read time", () => {
    const sections = allSections().slice(0, 3);
    const firstProgress = markRead(emptyProgress(), sections[0], 100, 1_700);
    const secondProgress = markRead(firstProgress, sections[2], 100, 1_900);
    const thirdProgress = markRead(secondProgress, sections[1], 100, 1_800);

    expect(recentlyReadSections(thirdProgress, sections, 2)).toMatchObject([
      {
        sectionId: sections[2].sectionId,
        href: sections[2].href,
        readAt: 1_900,
      },
      {
        sectionId: sections[1].sectionId,
        href: sections[1].href,
        readAt: 1_800,
      },
    ]);
  });
});
