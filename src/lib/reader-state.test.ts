import { describe, expect, it } from "vitest";
import { allSections } from "./manuscript-data";
import {
  emptyProgress,
  isSectionRead,
  markRead,
  markSectionOpened,
  mergeProgressStates,
  parseProgress,
  readPercent,
  recentlyReadSections,
  recommendNextSections,
  recordReadingTime,
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
      lastReadAt: 1_700_000_000,
      percent: 100,
      autoReadCount: 1,
    });
    expect(updatedSinceRead(progress, section)).toBe(false);
  });

  it("keeps legacy v1 progress readable", () => {
    const section = allSections()[0];
    const progress = parseProgress(
      JSON.stringify({
        sections: {
          [section.sectionId]: {
            sectionId: section.sectionId,
            contentHash: section.contentHash,
            readAt: 1_700,
            percent: 100,
          },
        },
      }),
    );

    expect(progress.sections[section.sectionId]).toMatchObject({
      contentHash: section.contentHash,
      readAt: 1_700,
      percent: 100,
    });
    expect(updatedSinceRead(progress, section)).toBe(false);
  });

  it("tracks opens, returns, and conservative reading time", () => {
    const section = allSections()[0];
    const opened = markSectionOpened(emptyProgress(), section, 1_000, "direct");
    const returned = markSectionOpened(opened, section, 2_000, "search");
    const timed = recordReadingTime(returned, section, {
      activeSeconds: 20,
      idleSeconds: 5,
      totalVisibleSeconds: 25,
    });

    expect(timed.sections[section.sectionId]).toMatchObject({
      firstOpenedAt: 1_000,
      lastOpenedAt: 2_000,
      openCount: 2,
      returnCount: 1,
      activeSeconds: 20,
      idleSeconds: 5,
      totalVisibleSeconds: 25,
      lastSource: "search",
    });
  });

  it("merges synced summaries while preserving the newest read hash", () => {
    const section = allSections()[0];
    const local = markRead(
      markSectionOpened(emptyProgress(), section, 1_000),
      section,
      100,
      3_000,
      "manual",
    );
    const remote = {
      sections: {
        [section.sectionId]: {
          sectionId: section.sectionId,
          contentHash: "older",
          readAt: 2_000,
          percent: 100,
          openCount: 2,
          activeSeconds: 40,
        },
      },
    };

    const merged = mergeProgressStates(local, remote);

    // Counters take the max across sides, never the sum. Remote is this
    // device's own prior upload, so summing would double every metric.
    expect(merged.sections[section.sectionId]).toMatchObject({
      contentHash: section.contentHash,
      readAt: 3_000,
      openCount: 2,
      activeSeconds: 40,
      manualReadCount: 1,
    });
  });

  it("is idempotent when merging a state with its own uploaded copy", () => {
    const section = allSections()[0];
    const opened = markSectionOpened(emptyProgress(), section, 1_000);
    const timed = recordReadingTime(opened, section, {
      activeSeconds: 30,
      idleSeconds: 4,
      totalVisibleSeconds: 34,
    });
    const state = markRead(timed, section, 100, 5_000, "manual");

    const once = mergeProgressStates(state, state);
    const twice = mergeProgressStates(once, once);

    // Merging a device's state with its own remote mirror must not inflate any
    // counter, on the first sync or any repeat.
    for (const merged of [once, twice]) {
      expect(merged.sections[section.sectionId]).toMatchObject({
        openCount: state.sections[section.sectionId].openCount,
        activeSeconds: state.sections[section.sectionId].activeSeconds,
        idleSeconds: state.sections[section.sectionId].idleSeconds,
        totalVisibleSeconds:
          state.sections[section.sectionId].totalVisibleSeconds,
        manualReadCount: state.sections[section.sectionId].manualReadCount,
      });
    }
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

  it("reports read state by content hash", () => {
    const section = allSections()[0];
    const read = markRead(emptyProgress(), section);
    expect(isSectionRead(read, section)).toBe(true);
    expect(isSectionRead(emptyProgress(), section)).toBe(false);
    expect(isSectionRead(read, { ...section, contentHash: "changed" })).toBe(
      false,
    );
  });

  it("excludes opened-but-unread sections from recently read", () => {
    const sections = allSections().slice(0, 3);
    const opened = markSectionOpened(emptyProgress(), sections[0], 1_000);
    const withRead = markRead(opened, sections[1], 100, 2_000);

    const recent = recentlyReadSections(withRead, sections, 4);
    expect(recent.map((entry) => entry.sectionId)).toEqual([
      sections[1].sectionId,
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
