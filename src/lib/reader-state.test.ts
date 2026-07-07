import { describe, expect, it } from "vitest";
import { allSections } from "./manuscript-data";
import {
  emptyProgress,
  isSectionRead,
  markRead,
  markSectionOpened,
  mergeProgressStates,
  parseProgress,
  readerProgressSchemaVersion,
  readPercent,
  reconcileRemoteProgress,
  recentlyReadSections,
  recommendNextSections,
  recordReadingTime,
  recordScrollProgress,
  sanitizeProgress,
  updatedSinceRead,
} from "./reader-state";

describe("progress sanitization", () => {
  it("drops structurally invalid section entries and keeps valid ones intact", () => {
    const sanitized = sanitizeProgress({
      sections: {
        good: {
          sectionId: "good",
          contentHash: "h",
          readAt: 5,
          percent: 80,
          audioSeconds: 12,
        },
        missingHash: { sectionId: "missingHash", readAt: 1, percent: 1 },
        wrongTypes: {
          sectionId: "wrongTypes",
          contentHash: "h",
          readAt: "nope",
          percent: 1,
        },
        notAnObject: 42,
      },
    });

    expect(Object.keys(sanitized.sections)).toEqual(["good"]);
    expect(sanitized.sections.good).toMatchObject({ percent: 80, audioSeconds: 12 });
  });

  it("returns empty progress for non-object or array-shaped input", () => {
    expect(sanitizeProgress(null).sections).toEqual({});
    expect(sanitizeProgress({ sections: [] }).sections).toEqual({});
    expect(sanitizeProgress("nope").sections).toEqual({});
  });
});

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

  it("reconciles a remote row at or below the known schema by merging it", () => {
    const section = allSections()[0];
    const local = markRead(emptyProgress(), section, 100, 3_000, "manual");
    const remote = {
      sections: {
        [section.sectionId]: {
          sectionId: section.sectionId,
          contentHash: section.contentHash,
          readAt: 1_000,
          percent: 40,
          audioSeconds: 25,
        },
      },
    };

    // v1 rows differ only by additive optional fields, so an older row merges.
    const reconciled = reconcileRemoteProgress(local, remote, 1);
    expect(reconciled).not.toBeNull();
    expect(reconciled?.sections[section.sectionId]).toMatchObject({
      readAt: 3_000,
      audioSeconds: 25,
    });

    const current = reconcileRemoteProgress(
      local,
      remote,
      readerProgressSchemaVersion,
    );
    expect(current).not.toBeNull();
  });

  it("refuses to merge a remote row written by a newer schema", () => {
    const section = allSections()[0];
    const local = markRead(emptyProgress(), section, 100, 3_000, "manual");
    const remote = { sections: {} };

    // A newer row may carry fields this client would drop, then overwrite the
    // richer remote copy. reconcileRemoteProgress signals "do not merge".
    expect(
      reconcileRemoteProgress(local, remote, readerProgressSchemaVersion + 1),
    ).toBeNull();
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

  it("keeps partial progress graduated without treating the section as read", () => {
    const sections = allSections().slice(0, 3);
    const progress = recordScrollProgress(emptyProgress(), sections[0], 50);

    expect(readPercent(progress, sections)).toBe(17);
    expect(isSectionRead(progress, sections[0])).toBe(false);
    expect(recommendNextSections(progress, sections, 1)).toMatchObject([
      {
        sectionId: sections[0].sectionId,
        href: sections[0].href,
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

  it("does not treat an opened or scrolled section as read or updated", () => {
    const section = allSections()[0];
    // Opening and scrolling store the section's contentHash for revision
    // tracking, but only an actual read event may flip the read state or arm
    // the updated-since-read notice.
    const visited = recordScrollProgress(
      markSectionOpened(emptyProgress(), section, 1_000),
      section,
      50,
    );

    expect(isSectionRead(visited, section)).toBe(false);
    expect(
      updatedSinceRead(visited, { ...section, contentHash: "changed" }),
    ).toBe(false);
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
