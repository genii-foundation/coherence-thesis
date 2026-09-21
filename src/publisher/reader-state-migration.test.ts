import { describe, expect, it } from "vitest";

import type { CoherenceReaderStateMigrationArtifact } from "./reader-state-migration-schema";
import {
  MAXIMUM_COHERENCE_LEGACY_STATE_BYTES,
  migrateCoherenceReaderState,
} from "./reader-state-migration";

const sha = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

const artifact: CoherenceReaderStateMigrationArtifact = Object.freeze({
  schemaVersion: "1.0",
  publicationId: "publication",
  readerBuildId: sha("a"),
  href: "/publisher/coherence-reader-state-migration.json",
  legacyProgressStorageKeys: Object.freeze([
    "coherence-reader-progress-v2",
    "coherence-reader-progress-v1",
  ] as const),
  legacyBookmarksStorageKeys: Object.freeze([
    "coherence-reader-bookmarks-v2",
    "coherence-reader-bookmarks-v1",
  ] as const),
  sections: Object.freeze([
    Object.freeze({
      workId: "work",
      sectionId: "section",
      sectionContinuityId: "continuity",
      acceptedLegacySectionIds: Object.freeze(["section", "old-section"]),
      acceptedLegacyContinuityIds: Object.freeze(["continuity", "old-continuity"]),
      href: "/work/section/",
      legacyContentHash: "0123456789abcdef",
      contentHash: sha("b"),
      paragraphs: Object.freeze([
        Object.freeze({
          legacyParagraphId: "p-hfedcba9876543210",
          legacyContentHash: "fedcba9876543210",
          legacyTextCodeUnits: 12,
          blockId: "block",
          blockContentHash: sha("c"),
          blockTextCodeUnits: 21,
          offsetSegments: Object.freeze([
            Object.freeze({ legacyStart: 0, targetStart: 0, length: 7 }),
            Object.freeze({ legacyStart: 7, targetStart: 16, length: 5 }),
          ]),
        }),
      ]),
    }),
  ]),
  buildId: sha("d"),
});

function progress(
  contentHash = "0123456789abcdef",
  audioSeconds = 4,
): string {
  return JSON.stringify({
    sections: {
      "old-continuity": {
        sectionId: "old-section",
        contentHash,
        continuityIds: ["old-continuity"],
        readAt: 500,
        percent: 100,
        firstOpenedAt: 100,
        lastOpenedAt: 400,
        lastReadAt: 500,
        openCount: 3,
        activeSeconds: 12,
        maxScrollPercent: 90,
        manualReadCount: 1,
        autoReadCount: 2,
        audioSeconds,
        lastSource: "next-section",
      },
    },
  });
}

function bookmark(startOffset: number, endOffset: number): string {
  return JSON.stringify({
    bookmarks: {
      bookmark: {
        id: "bookmark",
        progressKey: "old-continuity",
        sectionId: "old-section",
        sectionContentHash: "0123456789abcdef",
        range: {
          start: {
            paragraphAnchor: "p-hfedcba9876543210",
            paragraphContentHash: "fedcba9876543210",
            offset: startOffset,
          },
          end: {
            paragraphAnchor: "p-hfedcba9876543210",
            paragraphContentHash: "fedcba9876543210",
            offset: endOffset,
          },
        },
        quote: "before",
        prefix: "",
        suffix: "",
        note: "kept",
        createdAt: 100,
        updatedAt: 200,
      },
    },
  });
}

describe("Coherence Reader state translation", () => {
  it("translates authenticated current progress into Publisher state", () => {
    const result = migrateCoherenceReaderState({
      artifact,
      legacyProgress: progress(),
      legacyBookmarks: null,
      now: 1_000,
    });

    expect(result.report).toEqual({
      schemaVersion: 1,
      progressAccepted: 1,
      progressRefused: 0,
      audioSecondsNotMigrated: 1,
      bookmarksAccepted: 0,
      bookmarksRefused: 0,
    });
    expect(result.progress.entries.continuity).toMatchObject({
      continuityIds: ["continuity", "old-continuity"],
      contentHash: sha("b"),
      percent: 100,
      scrollPercent: 100,
      readingTimeMs: 12_000,
      audioPositionMs: 0,
      firstOpenedAt: 100,
      lastOpenedAt: 400,
      openCount: 3,
      navigationSource: "next",
      firstReadAt: 500,
      lastReadAt: 500,
      readCount: 3,
      readMethod: "manual",
      readContentHash: sha("b"),
      readContentHashes: [sha("b")],
      updatedAt: 500,
    });
  });

  it("does not infer a playback cursor from high cumulative listening time", () => {
    const result = migrateCoherenceReaderState({
      artifact,
      legacyProgress: progress("0123456789abcdef", 315_576_000),
      legacyBookmarks: null,
      now: 1_000,
    });

    expect(result.progress.entries.continuity).toMatchObject({
      percent: 100,
      scrollPercent: 100,
      readingTimeMs: 12_000,
      audioPositionMs: 0,
      readCount: 3,
    });
    expect(result.report).toMatchObject({
      progressAccepted: 1,
      progressRefused: 0,
      audioSecondsNotMigrated: 1,
    });
  });

  it("refuses stale section hashes and ambiguous inserted-text boundaries", () => {
    const result = migrateCoherenceReaderState({
      artifact,
      legacyProgress: progress("ffffffffffffffff"),
      legacyBookmarks: bookmark(1, 7),
      now: 1_000,
    });

    expect(result.report).toEqual({
      schemaVersion: 1,
      progressAccepted: 0,
      progressRefused: 1,
      audioSecondsNotMigrated: 0,
      bookmarksAccepted: 0,
      bookmarksRefused: 1,
    });
    expect(result.progress.entries).toEqual({});
    expect(result.bookmarks.bookmarks).toEqual({});
  });

  it("translates exact bookmark offsets without carrying legacy identities", () => {
    const result = migrateCoherenceReaderState({
      artifact,
      legacyProgress: null,
      legacyBookmarks: bookmark(8, 12),
      now: 1_000,
    });

    expect(result.report.bookmarksAccepted).toBe(1);
    expect(result.bookmarks.bookmarks.bookmark).toEqual({
      id: "bookmark",
      createdAt: 100,
      updatedAt: 200,
      workId: "work",
      sectionContinuityId: "continuity",
      href: "/work/section/",
      quote: "before",
      prefix: "",
      suffix: "",
      range: {
        start: {
          workId: "work",
          sectionContinuityId: "continuity",
          blockId: "block",
          blockContentHash: sha("c"),
          offset: 17,
        },
        end: {
          workId: "work",
          sectionContinuityId: "continuity",
          blockId: "block",
          blockContentHash: sha("c"),
          offset: 21,
        },
      },
      note: "kept",
    });
  });

  it("refuses malformed and oversized storage instead of parsing it", () => {
    const oversized = "x".repeat(MAXIMUM_COHERENCE_LEGACY_STATE_BYTES + 1);
    const result = migrateCoherenceReaderState({
      artifact,
      legacyProgress: oversized,
      legacyBookmarks: "{",
      now: 1_000,
    });

    expect(result.progress.entries).toEqual({});
    expect(result.bookmarks.bookmarks).toEqual({});
    expect(result.report).toEqual({
      schemaVersion: 1,
      progressAccepted: 0,
      progressRefused: 0,
      audioSecondsNotMigrated: 0,
      bookmarksAccepted: 0,
      bookmarksRefused: 0,
    });
  });
});
