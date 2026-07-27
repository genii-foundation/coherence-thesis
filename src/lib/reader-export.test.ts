import { describe, expect, it } from "vitest";
import type { ProgressSection } from "./manuscript-data";
import { buildReaderExport, formatDuration } from "./reader-export";
import type { ReaderBookmark, ReaderBookmarksState } from "./reader-bookmarks";
import { defaultReaderPreferences } from "./reader-preferences";
import { emptyProgress, type ReaderProgressState } from "./reader-state";

const hash = "0123456789abcdef";
const generatedAt = Date.parse("2026-07-26T12:00:00.000Z");

function section(overrides: Partial<ProgressSection> = {}): ProgressSection {
  return {
    sectionId: "s1",
    continuityId: "cont-1",
    legacyContinuityIds: [],
    progressContinuityGroups: [],
    legacySectionIds: [],
    contentHash: "section-hash",
    title: "Orientation",
    href: "/manuscripts/1/opening/orientation/",
    chapterHref: "/manuscripts/1/opening/",
    readerHref: "/manuscripts/1/opening/orientation/",
    paragraphs: [
      { paragraphId: `p-h${hash}`, anchor: `p-h${hash}`, contentHash: hash },
    ],
    ...overrides,
  } as ProgressSection;
}

function bookmark(overrides: Partial<ReaderBookmark> = {}): ReaderBookmark {
  return {
    id: "b1",
    progressKey: "cont-1",
    sectionId: "s1",
    paragraphAnchor: `p-h${hash}`,
    paragraphContentHash: hash,
    quote: "a passage worth keeping",
    quoteOrdinal: 0,
    prefix: "",
    suffix: "",
    startOffset: 0,
    endOffset: 23,
    sectionContentHash: "section-hash",
    createdAt: Date.parse("2026-07-01T09:00:00.000Z"),
    updatedAt: Date.parse("2026-07-01T09:00:00.000Z"),
    ...overrides,
  };
}

function stateWith(bookmarks: ReaderBookmark[]): ReaderBookmarksState {
  const record: ReaderBookmarksState["bookmarks"] = Object.create(null);
  for (const entry of bookmarks) record[entry.id] = entry;
  return { bookmarks: record };
}

function progressWith(
  overrides: Partial<ReaderProgressState["sections"][string]> = {},
): ReaderProgressState {
  return {
    sections: {
      "cont-1": {
        sectionId: "s1",
        contentHash: "section-hash",
        readAt: Date.parse("2026-07-02T09:00:00.000Z"),
        percent: 100,
        openCount: 3,
        activeSeconds: 3_720,
        audioSeconds: 65,
        ...overrides,
      },
    },
  };
}

const base = {
  events: [],
  consent: null,
  preferences: null,
  sections: [section()],
  signedIn: false,
  lastSyncedAt: null,
  generatedAt,
};

describe("reader data export", () => {
  it("summarizes progress, bookmarks, and where the data lives", () => {
    const markdown = buildReaderExport({
      ...base,
      progress: progressWith(),
      bookmarks: stateWith([bookmark()]),
    });

    expect(markdown).toContain("# Your Coherence Thesis reader data");
    expect(markdown).toContain("Sections opened: 1 of 1");
    expect(markdown).toContain("Sections finished: 1");
    expect(markdown).toContain("Bookmarks saved: 1");
    // Durations read as whole units, not raw seconds.
    expect(markdown).toContain("Time reading: 1 hour 2 minutes");
    expect(markdown).toContain("Time listening: 1 minute");
    // The quote itself travels, not just a link to it.
    expect(markdown).toContain("> a passage worth keeping");
    expect(markdown).toContain("### Orientation");
    expect(markdown).toContain(
      "/manuscripts/1/opening/orientation/#p-h0123456789abcdef",
    );
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("states plainly that nothing left the device when signed out", () => {
    const markdown = buildReaderExport({
      ...base,
      progress: emptyProgress(),
      bookmarks: stateWith([]),
    });

    expect(markdown).toContain("has never left this device");
    expect(markdown).toContain("No bookmarks saved.");
    expect(markdown).toContain("No reading activity recorded yet.");
  });

  it("reports syncing when the reader is signed in and consented", () => {
    const markdown = buildReaderExport({
      ...base,
      progress: progressWith(),
      bookmarks: stateWith([]),
      signedIn: true,
      consent: {
        version: 1,
        copyVersion: "cv",
        granted: true,
        grantedAt: generatedAt,
      },
      lastSyncedAt: Date.parse("2026-07-25T08:00:00.000Z"),
    });

    expect(markdown).toContain("syncing turned on");
    expect(markdown).toContain("Last synced");
  });

  it("omits tombstoned bookmarks", () => {
    const markdown = buildReaderExport({
      ...base,
      progress: progressWith(),
      bookmarks: stateWith([
        bookmark({ id: "gone", quote: "", removedAt: generatedAt }),
      ]),
    });

    expect(markdown).toContain("Bookmarks saved: 0");
    expect(markdown).toContain("No bookmarks saved.");
  });

  it("leaves untouched sections out of the activity table", () => {
    const markdown = buildReaderExport({
      ...base,
      progress: emptyProgress(),
      bookmarks: stateWith([]),
      sections: [section(), section({ sectionId: "s2", title: "Second" })],
    });

    expect(markdown).not.toContain("| Second |");
    expect(markdown).toContain("Sections opened: 0 of 2");
  });

  it("escapes a pipe in a section title so the table survives", () => {
    const markdown = buildReaderExport({
      ...base,
      progress: progressWith(),
      bookmarks: stateWith([]),
      sections: [section({ title: "Before | After" })],
    });

    expect(markdown).toContain("Before \\| After");
  });

  it("counts activity records by type rather than dumping the log", () => {
    const markdown = buildReaderExport({
      ...base,
      progress: progressWith(),
      bookmarks: stateWith([]),
      events: [
        {
          clientEventId: "e1",
          eventType: "section_opened",
          eventAt: Date.parse("2026-07-01T09:00:00.000Z"),
        },
        {
          clientEventId: "e2",
          eventType: "section_opened",
          eventAt: Date.parse("2026-07-03T09:00:00.000Z"),
        },
        {
          clientEventId: "e3",
          eventType: "bookmark_added",
          eventAt: Date.parse("2026-07-02T09:00:00.000Z"),
        },
      ],
    });

    expect(markdown).toContain("| section opened | 2 |");
    expect(markdown).toContain("| bookmark added | 1 |");
    expect(markdown).toContain("Activity records kept on this device: 3");
  });

  it("includes the reader's own settings when they are known", () => {
    const markdown = buildReaderExport({
      ...base,
      progress: emptyProgress(),
      bookmarks: stateWith([]),
      preferences: { ...defaultReaderPreferences, theme: "dark" },
    });

    expect(markdown).toContain("## Your settings");
    expect(markdown).toContain("- Theme: dark");
  });
});

describe("formatDuration", () => {
  it("uses whole units and plural agreement", () => {
    expect(formatDuration(0)).toBe("0 seconds");
    expect(formatDuration(1)).toBe("1 second");
    expect(formatDuration(59)).toBe("59 seconds");
    expect(formatDuration(60)).toBe("1 minute");
    expect(formatDuration(120)).toBe("2 minutes");
    expect(formatDuration(3_600)).toBe("1 hour");
    expect(formatDuration(3_660)).toBe("1 hour 1 minute");
    expect(formatDuration(7_320)).toBe("2 hours 2 minutes");
  });

  it("never reports a negative duration", () => {
    expect(formatDuration(-5)).toBe("0 seconds");
  });
});
