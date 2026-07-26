import { describe, expect, it } from "vitest";
import type { ProgressParagraph } from "./manuscript-data";
import {
  addBookmark,
  bookmarkedProgressKeys,
  bookmarkHref,
  bookmarkMatchesQuery,
  bookmarksByteSize,
  bookmarksFitRemoteBudget,
  bookmarksForSection,
  bookmarkTombstoneRetentionMs,
  canAddBookmark,
  countWords,
  createBookmarkId,
  emptyBookmarks,
  hasEnoughWords,
  isBookmarkStale,
  isLiveBookmark,
  liveBookmarkCount,
  liveBookmarks,
  maxBookmarkContextLength,
  maxBookmarkNoteLength,
  maxBookmarkQuoteLength,
  maxLiveBookmarks,
  mergeBookmarkStates,
  minimumBookmarkWords,
  paragraphHashFromAnchor,
  parseBookmarks,
  pruneBookmarks,
  readerBookmarksSchemaVersion,
  reconcileRemoteBookmarks,
  removeBookmark,
  resolveBookmarkAnchor,
  sanitizeBookmarks,
  sectionHasBookmarks,
  serializeBookmarks,
  setBookmarkNote,
  type ReaderBookmark,
  type ReaderBookmarksState,
} from "./reader-bookmarks";

const hashA = "0123456789abcdef";
const hashB = "fedcba9876543210";

function makeBookmark(overrides: Partial<ReaderBookmark> = {}): ReaderBookmark {
  return {
    id: "b1",
    progressKey: "cont-1",
    sectionId: "section-one",
    paragraphAnchor: `p-h${hashA}`,
    paragraphContentHash: hashA,
    quote: "a quoted line",
    quoteOrdinal: 0,
    prefix: "before ",
    suffix: " after",
    startOffset: 4,
    endOffset: 17,
    sectionContentHash: "section-hash",
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

function stateOf(...bookmarks: ReaderBookmark[]): ReaderBookmarksState {
  const record: ReaderBookmarksState["bookmarks"] = {};
  for (const bookmark of bookmarks) record[bookmark.id] = bookmark;
  return { bookmarks: record };
}

const section = {
  sectionId: "section-one",
  contentHash: "section-hash",
  continuityId: "cont-1",
};

const newBookmarkInput = {
  section,
  paragraphAnchor: `p-h${hashA}`,
  quote: "three words here",
  startOffset: 0,
  endOffset: 16,
};

describe("bookmark sanitization", () => {
  it("drops structurally invalid entries and keeps valid ones intact", () => {
    const sanitized = sanitizeBookmarks({
      bookmarks: {
        good: makeBookmark({ id: "good", note: "kept" }),
        missingQuote: {
          id: "missingQuote",
          progressKey: "cont-1",
          sectionId: "section-one",
          paragraphAnchor: `p-h${hashA}`,
          createdAt: 1,
          updatedAt: 1,
        },
        badTimestamps: makeBookmark({
          id: "badTimestamps",
          createdAt: Number.NaN,
        }),
        emptyId: makeBookmark({ id: "" }),
        notAnObject: 42,
        arrayEntry: [],
        nullEntry: null,
      },
    });

    expect(Object.keys(sanitized.bookmarks)).toEqual(["good"]);
    expect(sanitized.bookmarks.good).toMatchObject({
      id: "good",
      progressKey: "cont-1",
      quote: "a quoted line",
      note: "kept",
    });
  });

  it("drops an entry whose id disagrees with its record key", () => {
    const sanitized = sanitizeBookmarks({
      bookmarks: {
        "key-a": makeBookmark({ id: "key-a" }),
        "key-b": makeBookmark({ id: "some-other-id" }),
      },
    });

    // The record key is what every merge and lookup uses, so a mismatched id
    // cannot be trusted on either side.
    expect(Object.keys(sanitized.bookmarks)).toEqual(["key-a"]);
  });

  it("returns empty bookmarks for non-object, array, or malformed shapes", () => {
    expect(sanitizeBookmarks(null).bookmarks).toEqual({});
    expect(sanitizeBookmarks(undefined).bookmarks).toEqual({});
    expect(sanitizeBookmarks("nope").bookmarks).toEqual({});
    expect(sanitizeBookmarks(42).bookmarks).toEqual({});
    expect(sanitizeBookmarks([]).bookmarks).toEqual({});
    expect(sanitizeBookmarks({}).bookmarks).toEqual({});
    expect(sanitizeBookmarks({ bookmarks: [] }).bookmarks).toEqual({});
    expect(sanitizeBookmarks({ bookmarks: null }).bookmarks).toEqual({});
    expect(sanitizeBookmarks({ bookmarks: "nope" }).bookmarks).toEqual({});
  });

  it("clamps quote, note, prefix, and suffix to their storage caps", () => {
    const sanitized = sanitizeBookmarks({
      bookmarks: {
        long: makeBookmark({
          id: "long",
          quote: "q".repeat(maxBookmarkQuoteLength + 120),
          note: "n".repeat(maxBookmarkNoteLength + 90),
          prefix: "p".repeat(maxBookmarkContextLength + 25),
          suffix: "s".repeat(maxBookmarkContextLength + 25),
        }),
      },
    });

    const bookmark = sanitized.bookmarks.long!;
    expect(bookmark.quote).toHaveLength(maxBookmarkQuoteLength);
    expect(bookmark.note).toHaveLength(maxBookmarkNoteLength);
    expect(bookmark.prefix).toHaveLength(maxBookmarkContextLength);
    expect(bookmark.suffix).toHaveLength(maxBookmarkContextLength);
    expect(maxBookmarkQuoteLength).toBe(400);
    expect(maxBookmarkNoteLength).toBe(280);
    expect(maxBookmarkContextLength).toBe(40);
  });

  it("repairs missing optional fields without dropping the entry", () => {
    const sanitized = sanitizeBookmarks({
      bookmarks: {
        sparse: {
          id: "sparse",
          progressKey: "cont-1",
          sectionId: "section-one",
          paragraphAnchor: `p-h${hashA}-2`,
          quote: "kept",
          createdAt: 5,
          updatedAt: 6,
        },
      },
    });

    expect(sanitized.bookmarks.sparse).toMatchObject({
      // The bare hash is recovered from the anchor when it is absent.
      paragraphContentHash: hashA,
      quoteOrdinal: 0,
      prefix: "",
      suffix: "",
      startOffset: 0,
      endOffset: 0,
      sectionContentHash: "",
    });
    expect(sanitized.bookmarks.sparse?.note).toBeUndefined();
  });

  it("keeps a tombstone through sanitization", () => {
    const sanitized = sanitizeBookmarks({
      bookmarks: {
        gone: makeBookmark({ id: "gone", quote: "", removedAt: 9_000 }),
      },
    });

    expect(sanitized.bookmarks.gone?.removedAt).toBe(9_000);
    expect(isLiveBookmark(sanitized.bookmarks.gone!)).toBe(false);
  });
});

describe("bookmark parsing", () => {
  it("returns empty bookmarks for null, malformed JSON, and the wrong shape", () => {
    expect(parseBookmarks(null).bookmarks).toEqual({});
    expect(parseBookmarks("").bookmarks).toEqual({});
    expect(parseBookmarks("{not json").bookmarks).toEqual({});
    expect(parseBookmarks("[1,2,3]").bookmarks).toEqual({});
    expect(parseBookmarks('"a string"').bookmarks).toEqual({});
    expect(parseBookmarks('{"sections":{}}').bookmarks).toEqual({});
  });

  it("round-trips a serialized state", () => {
    const state = stateOf(makeBookmark({ note: "a note" }));
    expect(parseBookmarks(serializeBookmarks(state))).toEqual(state);
  });
});

describe("adding bookmarks", () => {
  it("stores the primary progress key and the derived paragraph hash", () => {
    const state = addBookmark(emptyBookmarks(), newBookmarkInput, 2_000, "new-1");

    expect(state.bookmarks["new-1"]).toMatchObject({
      id: "new-1",
      progressKey: "cont-1",
      sectionId: "section-one",
      paragraphContentHash: hashA,
      sectionContentHash: "section-hash",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    expect(liveBookmarkCount(state)).toBe(1);
  });

  it("returns the same state once the live cap is reached", () => {
    const full = stateOf(
      ...Array.from({ length: maxLiveBookmarks }, (_unused, index) =>
        makeBookmark({ id: `b${index}` }),
      ),
    );
    // Deliberately not pinning the constant's value. The cap is sized against
    // the remote blob budget and will move again if those caps move; what must
    // hold is the refusal behavior below.
    expect(liveBookmarkCount(full)).toBe(maxLiveBookmarks);

    // Same reference, so the caller can say "you are at the limit" instead of
    // silently evicting saved work.
    expect(addBookmark(full, newBookmarkInput, 3_000, "overflow")).toBe(full);
  });

  it("does not count tombstones toward the live cap", () => {
    const nearlyFull = stateOf(
      ...Array.from({ length: maxLiveBookmarks - 1 }, (_unused, index) =>
        makeBookmark({ id: `b${index}` }),
      ),
      ...Array.from({ length: 40 }, (_unused, index) =>
        makeBookmark({ id: `t${index}`, removedAt: 500 }),
      ),
    );
    expect(liveBookmarkCount(nearlyFull)).toBe(maxLiveBookmarks - 1);

    const added = addBookmark(nearlyFull, newBookmarkInput, 3_000, "fits");
    expect(added).not.toBe(nearlyFull);
    expect(added.bookmarks.fits).toBeDefined();
    expect(liveBookmarkCount(added)).toBe(maxLiveBookmarks);
  });

  it("clamps reader-supplied text on the way in", () => {
    const state = addBookmark(
      emptyBookmarks(),
      {
        ...newBookmarkInput,
        quote: "q".repeat(maxBookmarkQuoteLength + 10),
        prefix: "p".repeat(maxBookmarkContextLength + 10),
        suffix: "s".repeat(maxBookmarkContextLength + 10),
        quoteOrdinal: 2.9,
        startOffset: -5,
      },
      4_000,
      "clamped",
    );

    const bookmark = state.bookmarks.clamped!;
    expect(bookmark.quote).toHaveLength(maxBookmarkQuoteLength);
    expect(bookmark.prefix).toHaveLength(maxBookmarkContextLength);
    expect(bookmark.suffix).toHaveLength(maxBookmarkContextLength);
    expect(bookmark.quoteOrdinal).toBe(2);
    expect(bookmark.startOffset).toBe(0);
  });

  it("mints unique ids", () => {
    const first = createBookmarkId();
    const second = createBookmarkId();
    expect(first.length).toBeGreaterThan(0);
    expect(first).not.toBe(second);
  });
});

describe("removing bookmarks", () => {
  it("writes a tombstone that keeps the id and drops the reader-facing text", () => {
    const state = stateOf(makeBookmark({ note: "a private note" }));
    const removed = removeBookmark(state, "b1", 7_000);
    const tombstone = removed.bookmarks.b1!;

    expect(tombstone).toMatchObject({
      id: "b1",
      progressKey: "cont-1",
      quote: "",
      prefix: "",
      suffix: "",
      updatedAt: 7_000,
      removedAt: 7_000,
    });
    expect(tombstone.note).toBeUndefined();
    // A tombstone must not carry quoted prose or a note into the remote blob.
    expect(JSON.parse(serializeBookmarks(removed)).bookmarks.b1).not.toHaveProperty(
      "note",
    );
    expect(isLiveBookmark(tombstone)).toBe(false);
    expect(liveBookmarkCount(removed)).toBe(0);
  });

  it("returns the same state for an unknown id and for an already-removed id", () => {
    const state = stateOf(makeBookmark());
    expect(removeBookmark(state, "not-here", 7_000)).toBe(state);

    const removed = removeBookmark(state, "b1", 7_000);
    expect(removeBookmark(removed, "b1", 8_000)).toBe(removed);
  });
});

describe("bookmark notes", () => {
  it("trims, stores, and clamps a note", () => {
    const state = stateOf(makeBookmark());
    const noted = setBookmarkNote(state, "b1", "  worth revisiting  ", 2_000);

    expect(noted.bookmarks.b1).toMatchObject({
      note: "worth revisiting",
      updatedAt: 2_000,
    });

    const clamped = setBookmarkNote(
      state,
      "b1",
      "n".repeat(maxBookmarkNoteLength + 50),
      2_000,
    );
    expect(clamped.bookmarks.b1?.note).toHaveLength(maxBookmarkNoteLength);
  });

  it("returns the same state when the note is unchanged", () => {
    const state = stateOf(makeBookmark({ note: "unchanged" }));
    expect(setBookmarkNote(state, "b1", "unchanged", 5_000)).toBe(state);
    expect(setBookmarkNote(state, "b1", "  unchanged  ", 5_000)).toBe(state);

    const blank = stateOf(makeBookmark());
    expect(setBookmarkNote(blank, "b1", "", 5_000)).toBe(blank);
    expect(setBookmarkNote(blank, "b1", "   ", 5_000)).toBe(blank);
  });

  it("removes the note key entirely when cleared", () => {
    const state = stateOf(makeBookmark({ note: "temporary" }));
    const cleared = setBookmarkNote(state, "b1", "", 6_000);

    expect(Object.hasOwn(cleared.bookmarks.b1!, "note")).toBe(false);
    expect(cleared.bookmarks.b1?.updatedAt).toBe(6_000);
  });

  it("refuses to note an unknown or removed bookmark", () => {
    const state = stateOf(makeBookmark());
    expect(setBookmarkNote(state, "missing", "hello", 5_000)).toBe(state);

    const removed = removeBookmark(state, "b1", 5_000);
    expect(setBookmarkNote(removed, "b1", "hello", 6_000)).toBe(removed);
  });
});

describe("merging bookmark states", () => {
  it("takes the union of ids from both sides", () => {
    const local = stateOf(makeBookmark({ id: "only-local" }));
    const remote = stateOf(makeBookmark({ id: "only-remote" }));

    const merged = mergeBookmarkStates(local, remote);
    expect(Object.keys(merged.bookmarks).sort()).toEqual([
      "only-local",
      "only-remote",
    ]);
  });

  it("lets the higher updatedAt win in both directions", () => {
    const newerLocal = mergeBookmarkStates(
      stateOf(makeBookmark({ note: "local", updatedAt: 3_000 })),
      stateOf(makeBookmark({ note: "remote", updatedAt: 2_000 })),
    );
    expect(newerLocal.bookmarks.b1?.note).toBe("local");

    const newerRemote = mergeBookmarkStates(
      stateOf(makeBookmark({ note: "local", updatedAt: 2_000 })),
      stateOf(makeBookmark({ note: "remote", updatedAt: 3_000 })),
    );
    expect(newerRemote.bookmarks.b1?.note).toBe("remote");
  });

  it("lets a tombstone win an exact updatedAt tie from either side", () => {
    const live = makeBookmark({ updatedAt: 5_000 });
    const tombstone = makeBookmark({
      updatedAt: 5_000,
      removedAt: 5_000,
      quote: "",
    });

    // Deletion is sticky. A wrongly kept deletion loses one bookmark; a wrongly
    // resurrected one comes back on every device forever.
    const localTombstone = mergeBookmarkStates(
      stateOf(tombstone),
      stateOf(live),
    );
    expect(localTombstone.bookmarks.b1?.removedAt).toBe(5_000);

    const remoteTombstone = mergeBookmarkStates(
      stateOf(live),
      stateOf(tombstone),
    );
    expect(remoteTombstone.bookmarks.b1?.removedAt).toBe(5_000);
  });

  it("does not resurrect a locally deleted bookmark from a live remote copy", () => {
    const created = addBookmark(emptyBookmarks(), newBookmarkInput, 1_000, "b1");
    const remote = created;
    const local = removeBookmark(created, "b1", 4_000);

    const merged = mergeBookmarkStates(local, remote);
    expect(merged.bookmarks.b1?.removedAt).toBe(4_000);
    expect(liveBookmarkCount(merged)).toBe(0);

    // The same must hold when this device pulls again after uploading.
    const pulledAgain = mergeBookmarkStates(merged, remote);
    expect(liveBookmarkCount(pulledAgain)).toBe(0);
  });

  it("is idempotent when merging a state with its own uploaded copy", () => {
    const remote = stateOf(
      makeBookmark({ id: "shared", note: "remote", updatedAt: 5_000 }),
      makeBookmark({ id: "tied-live", updatedAt: 5_000 }),
      makeBookmark({ id: "remote-only", updatedAt: 1_000 }),
      makeBookmark({
        id: "tied-remote-tombstone",
        updatedAt: 5_000,
        removedAt: 5_000,
        quote: "",
      }),
    );
    const local = stateOf(
      makeBookmark({ id: "shared", note: "local", updatedAt: 6_000 }),
      makeBookmark({
        id: "tied-live",
        updatedAt: 5_000,
        removedAt: 5_000,
        quote: "",
      }),
      makeBookmark({ id: "local-only", updatedAt: 2_000 }),
      makeBookmark({ id: "tied-remote-tombstone", updatedAt: 5_000 }),
    );

    const once = mergeBookmarkStates(local, remote);
    const twice = mergeBookmarkStates(once, remote);
    const thrice = mergeBookmarkStates(twice, remote);

    // Re-pulling the same remote blob must never change the converged result.
    expect(twice).toStrictEqual(once);
    expect(thrice).toStrictEqual(once);
    expect(once.bookmarks.shared?.note).toBe("local");
    expect(once.bookmarks["tied-live"]?.removedAt).toBe(5_000);
    expect(once.bookmarks["tied-remote-tombstone"]?.removedAt).toBe(5_000);
    expect(Object.keys(once.bookmarks).sort()).toEqual([
      "local-only",
      "remote-only",
      "shared",
      "tied-live",
      "tied-remote-tombstone",
    ]);
  });

  it("merges an empty side without loss", () => {
    const local = stateOf(makeBookmark());
    expect(mergeBookmarkStates(local, emptyBookmarks())).toEqual(local);
    expect(mergeBookmarkStates(emptyBookmarks(), local)).toEqual(local);
  });
});

describe("reconciling a remote bookmarks row", () => {
  it("refuses a row written by a newer schema", () => {
    const local = stateOf(makeBookmark());
    expect(
      reconcileRemoteBookmarks(
        local,
        emptyBookmarks(),
        readerBookmarksSchemaVersion + 1,
      ),
    ).toBeNull();
  });

  it("merges a row at or below the known schema", () => {
    const local = stateOf(makeBookmark({ note: "local", updatedAt: 3_000 }));
    const remote = stateOf(
      makeBookmark({ id: "remote-only", note: "remote", updatedAt: 1_000 }),
    );

    for (const version of [1, readerBookmarksSchemaVersion]) {
      const reconciled = reconcileRemoteBookmarks(local, remote, version);
      expect(reconciled).not.toBeNull();
      expect(Object.keys(reconciled!.bookmarks).sort()).toEqual([
        "b1",
        "remote-only",
      ]);
    }
  });
});

describe("pruning tombstones", () => {
  const now = 1_000_000_000;

  it("drops tombstones past the retention window and keeps everything else", () => {
    const state = stateOf(
      makeBookmark({ id: "live-and-ancient", createdAt: 1, updatedAt: 1 }),
      makeBookmark({
        id: "expired",
        removedAt: now - bookmarkTombstoneRetentionMs - 1,
      }),
      makeBookmark({
        id: "at-the-edge",
        removedAt: now - bookmarkTombstoneRetentionMs,
      }),
      makeBookmark({ id: "recent-tombstone", removedAt: now - 1_000 }),
    );

    const pruned = pruneBookmarks(state, now);
    expect(Object.keys(pruned.bookmarks).sort()).toEqual([
      "at-the-edge",
      "live-and-ancient",
      "recent-tombstone",
    ]);
  });

  it("returns the same state when nothing has expired", () => {
    const state = stateOf(
      makeBookmark({ id: "live", createdAt: 1, updatedAt: 1 }),
      makeBookmark({ id: "fresh", removedAt: now - 5 }),
    );
    expect(pruneBookmarks(state, now)).toBe(state);
    expect(pruneBookmarks(emptyBookmarks(), now).bookmarks).toEqual({});
  });

  it("honors an explicit retention window", () => {
    const state = stateOf(makeBookmark({ id: "gone", removedAt: now - 5_000 }));
    expect(Object.keys(pruneBookmarks(state, now, 1_000).bookmarks)).toEqual([]);
    expect(pruneBookmarks(state, now, 10_000)).toBe(state);
  });
});

describe("resolving a bookmark anchor", () => {
  const paragraphs: ProgressParagraph[] = [
    { paragraphId: "p-1", anchor: `p-h${hashB}`, contentHash: hashB },
    { paragraphId: "p-2", anchor: `p-h${hashA}-3`, contentHash: hashA },
  ];

  it("reports an exact match when the anchor is still present", () => {
    expect(
      resolveBookmarkAnchor(
        { paragraphAnchor: `p-h${hashB}`, paragraphContentHash: hashB },
        paragraphs,
      ),
    ).toEqual({ status: "exact", anchor: `p-h${hashB}` });
  });

  it("recovers the new anchor when a duplicate block shifted the occurrence suffix", () => {
    // Same paragraph text, new occurrence suffix, because an identical block
    // was inserted above it.
    expect(
      resolveBookmarkAnchor(
        { paragraphAnchor: `p-h${hashA}-2`, paragraphContentHash: hashA },
        paragraphs,
      ),
    ).toEqual({ status: "renamed", anchor: `p-h${hashA}-3` });
  });

  it("reports missing when neither the anchor nor the hash survives", () => {
    expect(
      resolveBookmarkAnchor(
        {
          paragraphAnchor: "p-h00000000000000ff",
          paragraphContentHash: "00000000000000ff",
        },
        paragraphs,
      ),
    ).toEqual({ status: "missing", anchor: null });
    expect(
      resolveBookmarkAnchor(
        { paragraphAnchor: `p-h${hashA}`, paragraphContentHash: hashA },
        [],
      ),
    ).toEqual({ status: "missing", anchor: null });
  });

  it("does not let a legacy ordinal anchor match on an empty hash", () => {
    // "p-<n>" carries no content identity, so its stored hash is "". An empty
    // hash must not match a paragraph that also has no hash.
    const withEmptyHash: ProgressParagraph[] = [
      ...paragraphs,
      { paragraphId: "p-3", anchor: "p-3", contentHash: "" },
    ];

    expect(
      resolveBookmarkAnchor(
        { paragraphAnchor: "p-9", paragraphContentHash: "" },
        withEmptyHash,
      ),
    ).toEqual({ status: "missing", anchor: null });
    expect(
      resolveBookmarkAnchor(
        { paragraphAnchor: "p-3", paragraphContentHash: "" },
        withEmptyHash,
      ),
    ).toEqual({ status: "exact", anchor: "p-3" });
  });

  it("reports staleness only for an unresolvable bookmark", () => {
    expect(
      isBookmarkStale(makeBookmark({ paragraphAnchor: `p-h${hashA}-2` }), paragraphs),
    ).toBe(false);
    expect(
      isBookmarkStale(
        makeBookmark({
          paragraphAnchor: "p-h00000000000000ff",
          paragraphContentHash: "00000000000000ff",
        }),
        paragraphs,
      ),
    ).toBe(true);
  });
});

describe("paragraph hash extraction", () => {
  it("parses the content anchor with and without an occurrence suffix", () => {
    expect(paragraphHashFromAnchor(`p-h${hashA}`)).toBe(hashA);
    expect(paragraphHashFromAnchor(`p-h${hashA}-1`)).toBe(hashA);
    expect(paragraphHashFromAnchor(`p-h${hashA}-12`)).toBe(hashA);
  });

  it("returns an empty hash for legacy ordinals and junk", () => {
    expect(paragraphHashFromAnchor("p-3")).toBe("");
    expect(paragraphHashFromAnchor("")).toBe("");
    expect(paragraphHashFromAnchor("section-one-p-h0123456789abcdef")).toBe("");
    expect(paragraphHashFromAnchor(`p-h${hashA.toUpperCase()}`)).toBe("");
    expect(paragraphHashFromAnchor("p-h0123456789abcde")).toBe("");
    expect(paragraphHashFromAnchor("p-h0123456789abcdefa")).toBe("");
    expect(paragraphHashFromAnchor(`p-h${hashA}-`)).toBe("");
    expect(paragraphHashFromAnchor("p-hzzzzzzzzzzzzzzzz")).toBe("");
  });
});

describe("selection word counting", () => {
  it("counts words across collapsed and surrounding whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords("  one  two  ")).toBe(2);
    expect(countWords("one   two\n\tthree")).toBe(3);
  });

  it("enforces the three-word minimum", () => {
    expect(minimumBookmarkWords).toBe(3);
    expect(hasEnoughWords("one two")).toBe(false);
    expect(hasEnoughWords("  one two  ")).toBe(false);
    expect(hasEnoughWords("one two three")).toBe(true);
    expect(hasEnoughWords("\n one \t two   three \n")).toBe(true);
    expect(hasEnoughWords("")).toBe(false);
  });
});

describe("bookmark lookup by section lineage", () => {
  const renamed = {
    sectionId: "section-one-renamed",
    contentHash: "section-hash",
    continuityId: "cont-1",
  };
  const merged = {
    sectionId: "section-two",
    contentHash: "other-hash",
    continuityId: "cont-2",
    legacyContinuityIds: ["cont-legacy"],
  };

  it("finds a bookmark stored under the continuity key after a re-slug", () => {
    const state = addBookmark(emptyBookmarks(), newBookmarkInput, 1_000, "b1");
    expect(state.bookmarks.b1?.progressKey).toBe("cont-1");
    expect(state.bookmarks.b1?.sectionId).not.toBe(renamed.sectionId);

    const keys = bookmarkedProgressKeys(state);
    expect(keys.has("cont-1")).toBe(true);
    expect(sectionHasBookmarks(keys, renamed)).toBe(true);
    expect(bookmarksForSection(state, renamed).map((entry) => entry.id)).toEqual([
      "b1",
    ]);
  });

  it("finds a bookmark stored under a legacy continuity key", () => {
    const state = stateOf(makeBookmark({ id: "old", progressKey: "cont-legacy" }));
    const keys = bookmarkedProgressKeys(state);

    expect(sectionHasBookmarks(keys, merged)).toBe(true);
    expect(bookmarksForSection(state, merged).map((entry) => entry.id)).toEqual([
      "old",
    ]);
  });

  it("ignores unrelated keys and tombstoned bookmarks", () => {
    const state = stateOf(
      makeBookmark({ id: "elsewhere", progressKey: "cont-other" }),
      makeBookmark({ id: "gone", progressKey: "cont-1", removedAt: 9_000 }),
    );
    const keys = bookmarkedProgressKeys(state);

    expect(keys.has("cont-1")).toBe(false);
    expect(sectionHasBookmarks(keys, renamed)).toBe(false);
    expect(bookmarksForSection(state, renamed)).toEqual([]);
  });

  it("lists live bookmarks newest first", () => {
    const state = stateOf(
      makeBookmark({ id: "old", createdAt: 1_000 }),
      makeBookmark({ id: "new", createdAt: 3_000 }),
      makeBookmark({ id: "middle", createdAt: 2_000 }),
      makeBookmark({ id: "removed", createdAt: 4_000, removedAt: 5_000 }),
    );

    expect(liveBookmarks(state).map((entry) => entry.id)).toEqual([
      "new",
      "middle",
      "old",
    ]);
  });
});

describe("bookmark links", () => {
  const anchor = `p-h${hashA}-2`;

  it("uses a bare paragraph fragment on a canonical section route", () => {
    expect(
      bookmarkHref({ paragraphAnchor: anchor }, { readerHref: "/manuscripts/1/section-one/" }),
    ).toBe(`/manuscripts/1/section-one/#${anchor}`);
  });

  it("prefixes the section id on a chapter route", () => {
    expect(
      bookmarkHref(
        { paragraphAnchor: anchor },
        { readerHref: "/manuscripts/1/chapter-one/#section-one" },
      ),
    ).toBe(`/manuscripts/1/chapter-one/#section-one-${anchor}`);
  });

  it("links to a resolved anchor when the stored one moved", () => {
    expect(
      bookmarkHref(
        { paragraphAnchor: anchor },
        { readerHref: "/manuscripts/1/chapter-one/#section-one" },
        `p-h${hashA}-3`,
      ),
    ).toBe(`/manuscripts/1/chapter-one/#section-one-p-h${hashA}-3`);
  });
});

describe("bookmark search matching", () => {
  const bookmark = makeBookmark({ quote: "The Central Wound", note: "Re-read this" });

  it("matches an empty query, the quote, the note, and the section title", () => {
    expect(bookmarkMatchesQuery(bookmark, "")).toBe(true);
    expect(bookmarkMatchesQuery(bookmark, "central wound")).toBe(true);
    expect(bookmarkMatchesQuery(bookmark, "re read this")).toBe(true);
    expect(bookmarkMatchesQuery(bookmark, "coordination", "On Coordination")).toBe(
      true,
    );
    expect(bookmarkMatchesQuery(bookmark, "nowhere")).toBe(false);
  });

  it("tolerates a bookmark with no note", () => {
    expect(bookmarkMatchesQuery(makeBookmark(), "quoted line")).toBe(true);
    expect(bookmarkMatchesQuery(makeBookmark(), "missing")).toBe(false);
  });
});

// Regression coverage for the eight defects an adversarial review found in the
// first draft of this module. Each block names the failure it prevents.
describe("hardening against untrusted timestamps and keys", () => {
  it("clamps a future createdAt and updatedAt to now", () => {
    const year2100 = 4_102_444_800_000;
    const now = 1_770_000_000_000;
    const state = sanitizeBookmarks(
      { bookmarks: { b1: makeBookmark({ createdAt: year2100, updatedAt: year2100 }) } },
      now,
    );
    expect(state.bookmarks.b1?.createdAt).toBe(now);
    expect(state.bookmarks.b1?.updatedAt).toBe(now);
  });

  it("leaves a past timestamp alone", () => {
    const now = 1_770_000_000_000;
    const state = sanitizeBookmarks({ bookmarks: { b1: makeBookmark() } }, now);
    expect(state.bookmarks.b1?.createdAt).toBe(1_000);
  });

  it("keeps a deletion that a fast clock would otherwise undo", () => {
    // Device A is correct and deletes at t=1000. Device B is ten minutes fast
    // and its live copy carries t=601000. Newest-wins alone resurrects it.
    const deleted = stateOf(
      makeBookmark({ id: "b1", quote: "", updatedAt: 1_000, removedAt: 1_000 }),
    );
    const staleLive = stateOf(
      makeBookmark({ id: "b1", quote: "still here", updatedAt: 601_000 }),
    );
    expect(liveBookmarkCount(mergeBookmarkStates(deleted, staleLive))).toBe(0);
    expect(liveBookmarkCount(mergeBookmarkStates(staleLive, deleted))).toBe(0);
  });

  it("keeps a deletion when a replica edits the same bookmark later", () => {
    const removed = stateOf(
      makeBookmark({ id: "b9", quote: "", updatedAt: 200, removedAt: 200 }),
    );
    const noteAdded = stateOf(
      makeBookmark({ id: "b9", note: "later thought", updatedAt: 300 }),
    );
    const merged = mergeBookmarkStates(removed, noteAdded);
    expect(liveBookmarkCount(merged)).toBe(0);
    expect(merged.bookmarks.b9?.removedAt).toBe(200);
  });

  it("treats a present but malformed removedAt as a deletion", () => {
    for (const removedAt of ["2026-01-01", null, "5000", true, Number.NaN]) {
      const state = sanitizeBookmarks({
        bookmarks: {
          b1: { ...makeBookmark({ quote: "" }), removedAt },
        },
      });
      expect(liveBookmarkCount(state)).toBe(0);
    }
  });

  it("survives an id that collides with an Object.prototype member", () => {
    for (const id of ["toString", "valueOf", "constructor", "hasOwnProperty"]) {
      const state = stateOf(makeBookmark({ id, quote: "irreplaceable" }));
      const merged = mergeBookmarkStates(state, emptyBookmarks());
      expect(liveBookmarkCount(merged)).toBe(1);
      expect(merged.bookmarks[id]?.quote).toBe("irreplaceable");
      expect(JSON.parse(serializeBookmarks(merged)).bookmarks[id].quote).toBe(
        "irreplaceable",
      );
    }
  });

  it("does not let a __proto__ record key hijack the map", () => {
    const state = parseBookmarks(
      JSON.stringify({
        bookmarks: {
          __proto__: { ...makeBookmark({ id: "__proto__" }), quote: "PWNED" },
        },
      }),
    );
    expect(state.bookmarks.quote).toBeUndefined();
    expect(liveBookmarkCount(state)).toBe(0);
    expect(removeBookmark(state, "quote", 9)).toBe(state);
  });

  it("reports whether the blob fits the remote budget", () => {
    expect(bookmarksFitRemoteBudget(emptyBookmarks())).toBe(true);
    expect(bookmarksByteSize(emptyBookmarks())).toBeGreaterThan(0);
  });

  it("keeps a full set of max-size bookmarks inside the remote budget", () => {
    // The cap exists to keep the blob under the database CHECK constraint,
    // which fails the write outright. An earlier draft claimed 500 fit and it
    // was over by 2.3x, so the arithmetic is asserted rather than commented.
    const full = stateOf(
      ...Array.from({ length: maxLiveBookmarks }, (_unused, index) =>
        makeBookmark({
          id: `bookmark-${index}-${"x".repeat(20)}`,
          quote: "q".repeat(maxBookmarkQuoteLength),
          note: "n".repeat(maxBookmarkNoteLength),
          prefix: "p".repeat(maxBookmarkContextLength),
          suffix: "s".repeat(maxBookmarkContextLength),
        }),
      ),
    );
    expect(liveBookmarkCount(full)).toBe(maxLiveBookmarks);
    expect(bookmarksFitRemoteBudget(full)).toBe(true);
  });

  it("canAddBookmark reports the refusal that addBookmark expresses by identity", () => {
    const full = stateOf(
      ...Array.from({ length: maxLiveBookmarks }, (_unused, index) =>
        makeBookmark({ id: `b${index}` }),
      ),
    );
    expect(canAddBookmark(full)).toBe(false);
    expect(addBookmark(full, newBookmarkInput, 3_000, "overflow")).toBe(full);
    expect(canAddBookmark(emptyBookmarks())).toBe(true);
  });
});
