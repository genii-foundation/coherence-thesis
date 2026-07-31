import type { ProgressParagraph, ProgressSection } from "./manuscript-data";
import { canonicalReaderDestination } from "./reader-fragments";
import {
  createReaderPassageRange,
  paragraphHashFromAnchor,
  parseReaderPassageRange,
  resolveReaderPassageRange,
  type ReaderPassageRange,
  type ReaderPassageRangeResolution,
} from "./reader-passage-range";
import { primaryProgressKey, progressKeys, type ProgressIdentity } from "./reader-state";
import { foldSearchText } from "./reader-text-search";

export const readerBookmarksStorageKey = "coherence-reader-bookmarks-v2";
export const readerBookmarksLegacyStorageKey = "coherence-reader-bookmarks-v1";
export const readerBookmarksUpdatedEvent = "coherence-reader-bookmarks-updated";

// The schema version this client writes to and understands from the remote
// `reader_bookmarks.schema_version` column. Deliberately independent of
// readerProgressSchemaVersion: the two collections version on their own
// schedules, and conflating them would let a bookmarks bump freeze progress
// sync (and the reverse).
export const readerBookmarksSchemaVersion = 2;

// Caps. The remote blob is bounded by a database CHECK constraint that fails
// the write outright rather than degrading, so the client bounds every field a
// reader controls and keeps the product of those bounds inside the budget.
//
// Worst case per bookmark, serialized: 2,000 quote + 280 note + 80 context
// + 36 uuid (twice, since the id is also the record key) + 16 section hash
// + two passage boundaries + the numeric fields and JSON key names. The remote
// budget also contains a temporary merge of two disjoint 1,000-record replicas
// plus tombstones.
export const maxBookmarkQuoteLength = 2_000;
export const maxBookmarkNoteLength = 280;
export const maxBookmarkContextLength = 40;
export const maxLiveBookmarks = 1_000;

// Must stay at or below the reader_bookmarks_size CHECK constraint in the
// migration. Checked before upload so an oversized blob surfaces as a message
// rather than a rejected write with no recovery path.
export const maxRemoteBookmarksBytes = 8 * 1024 * 1024;

// A removed bookmark is kept as a tombstone so other devices learn about the
// deletion instead of resurrecting the record. After this window every device
// has long since converged and the tombstone is dropped.
export const bookmarkTombstoneRetentionMs = 90 * 24 * 60 * 60 * 1000;

export const minimumBookmarkWords = 3;

export type ReaderBookmark = {
  id: string;
  // primaryProgressKey(section) = continuityId || sectionId. Keying on the raw
  // sectionId would orphan every bookmark on the next editorial re-slug, which
  // the continuity workflow guarantees will happen.
  progressKey: string;
  sectionId: string;
  // Contiguous start and end boundaries within this section. Version 1 records
  // are migrated into a same-paragraph range during sanitization.
  range: ReaderPassageRange;
  quote: string;
  quoteOrdinal: number;
  prefix: string;
  suffix: string;
  sectionContentHash: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  removedAt?: number;
};

export type ReaderBookmarksState = {
  bookmarks: Record<string, ReaderBookmark>;
};

export type BookmarkResolution = ReaderPassageRangeResolution;

// Null-prototype throughout. Ids are UUIDs in practice, but storage is
// hand-editable and remote rows are merged in, so an id of "toString" or
// "__proto__" is reachable. Against a normal object literal that turns an
// inherited member into a fake record: mergeBookmarkStates would read
// Object.prototype.toString as an existing remote bookmark, the tie branch
// would assign it over the reader's real one, and JSON.stringify would then
// drop the record entirely. A null prototype removes the whole class.
function emptyBookmarkMap(): ReaderBookmarksState["bookmarks"] {
  return Object.create(null) as ReaderBookmarksState["bookmarks"];
}

export function emptyBookmarks(): ReaderBookmarksState {
  return { bookmarks: emptyBookmarkMap() };
}

function cloneBookmarkMap(
  source: ReaderBookmarksState["bookmarks"],
): ReaderBookmarksState["bookmarks"] {
  return Object.assign(emptyBookmarkMap(), source);
}

function bookmarkAt(
  map: ReaderBookmarksState["bookmarks"],
  id: string,
): ReaderBookmark | undefined {
  return Object.hasOwn(map, id) ? map[id] : undefined;
}

function clamp(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(0, limit);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidBookmark(
  value: unknown,
): value is Record<string, unknown> & {
  id: string;
  progressKey: string;
  sectionId: string;
  quote: string;
  createdAt: number;
  updatedAt: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const bookmark = value as Record<string, unknown>;
  return (
    typeof bookmark.id === "string" &&
    bookmark.id.length > 0 &&
    typeof bookmark.progressKey === "string" &&
    typeof bookmark.sectionId === "string" &&
    typeof bookmark.quote === "string" &&
    isFiniteNumber(bookmark.createdAt) &&
    isFiniteNumber(bookmark.updatedAt)
  );
}

// Normalize one entry to the current shape and caps. Storage is hand-editable
// and, once sync is on, remote rows are merged in, so nothing enters local
// state without passing through here.
function normalizeBookmark(
  bookmark: Record<string, unknown> & {
    id: string;
    progressKey: string;
    sectionId: string;
    quote: string;
    createdAt: number;
    updatedAt: number;
  },
  now = Date.now(),
): ReaderBookmark | null {
  const range = parseReaderPassageRange(bookmark.range, {
    paragraphAnchor: bookmark.paragraphAnchor,
    paragraphContentHash: bookmark.paragraphContentHash,
    startOffset: bookmark.startOffset,
    endOffset: bookmark.endOffset,
  });
  if (!range) return null;
  const normalized: ReaderBookmark = {
    id: bookmark.id,
    progressKey: bookmark.progressKey,
    sectionId: bookmark.sectionId,
    range,
    quote: clamp(bookmark.quote, maxBookmarkQuoteLength),
    quoteOrdinal: isFiniteNumber(bookmark.quoteOrdinal)
      ? Math.max(0, Math.trunc(bookmark.quoteOrdinal))
      : 0,
    prefix: clamp(
      typeof bookmark.prefix === "string" ? bookmark.prefix : "",
      maxBookmarkContextLength,
    ),
    suffix: clamp(
      typeof bookmark.suffix === "string" ? bookmark.suffix : "",
      maxBookmarkContextLength,
    ),
    sectionContentHash:
      typeof bookmark.sectionContentHash === "string"
        ? bookmark.sectionContentHash
        : "",
    // Clamp to now. Every timestamp here is an unvalidated client Date.now()
    // from a device whose clock we do not control, and merge is last-write-wins
    // on these values. One write from a device that thinks it is 2100 would
    // otherwise win every future merge, making that bookmark permanently
    // undeletable. A bookmark cannot legitimately be created or updated in the
    // future, so a future stamp is always wrong and safe to pull back.
    createdAt: Math.min(bookmark.createdAt, now),
    updatedAt: Math.min(bookmark.updatedAt, now),
  };
  if (typeof bookmark.note === "string" && bookmark.note.length > 0) {
    normalized.note = clamp(bookmark.note, maxBookmarkNoteLength);
  }
  // A removedAt that is present but malformed still expresses a deletion.
  // Dropping the key would silently bring the bookmark back to life, so fall
  // back to updatedAt rather than treating the record as live.
  if (bookmark.removedAt !== undefined) {
    normalized.removedAt = isFiniteNumber(bookmark.removedAt)
      ? Math.min(bookmark.removedAt, now)
      : normalized.updatedAt;
  }
  return normalized;
}

export function sanitizeBookmarks(
  value: unknown,
  now = Date.now(),
): ReaderBookmarksState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyBookmarks();
  }
  const raw = (value as { bookmarks?: unknown }).bookmarks;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyBookmarks();
  }
  const bookmarks = emptyBookmarkMap();
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidBookmark(entry)) continue;
    // The record key is authoritative; an entry whose id disagrees with its key
    // would break every id-based merge and lookup below.
    if (entry.id !== key) continue;
    const normalized = normalizeBookmark(entry, now);
    if (normalized) bookmarks[key] = normalized;
  }
  return { bookmarks };
}

export function parseBookmarks(raw: string | null): ReaderBookmarksState {
  if (!raw) return emptyBookmarks();
  try {
    return sanitizeBookmarks(JSON.parse(raw));
  } catch {
    return emptyBookmarks();
  }
}

export function serializeBookmarks(state: ReaderBookmarksState): string {
  return JSON.stringify(state);
}

export { paragraphHashFromAnchor };

export function createBookmarkId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isLiveBookmark(bookmark: ReaderBookmark): boolean {
  return bookmark.removedAt === undefined;
}

export function liveBookmarks(state: ReaderBookmarksState): ReaderBookmark[] {
  return Object.values(state.bookmarks)
    .filter(isLiveBookmark)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function liveBookmarkCount(state: ReaderBookmarksState): number {
  return Object.values(state.bookmarks).filter(isLiveBookmark).length;
}

// A section plus every identity it has ever answered to. legacySectionIds is
// optional because progress-only callers do not carry it.
export type BookmarkSectionIdentity = ProgressIdentity &
  Partial<Pick<ProgressSection, "legacySectionIds">>;

// Every key a stored bookmark could legitimately hold for this section. This is
// deliberately wider than progressKeys: progressContinuityGroups exist to score
// reading progress and, once configured, they replace the legacy fallback
// entirely, so a continuity identity absent from them would silently drop a
// bookmark whose paragraph survives verbatim. Bookmarks have no scoring
// semantics; any identity in the section's lineage is a match.
export function bookmarkSectionKeys(
  section: BookmarkSectionIdentity,
): Set<string> {
  return new Set(
    [
      section.sectionId,
      section.continuityId,
      ...(section.legacyContinuityIds ?? []),
      ...(section.legacySectionIds ?? []),
      ...progressKeys(section),
    ].filter((id): id is string => Boolean(id)),
  );
}

export function bookmarksForSection(
  state: ReaderBookmarksState,
  section: BookmarkSectionIdentity,
): ReaderBookmark[] {
  const keys = bookmarkSectionKeys(section);
  return liveBookmarks(state).filter((bookmark) => keys.has(bookmark.progressKey));
}

// O(1) membership probe for the heatmap and the outline, which ask this
// question thousands of times per render pass.
export function bookmarkedProgressKeys(state: ReaderBookmarksState): Set<string> {
  const keys = new Set<string>();
  for (const bookmark of Object.values(state.bookmarks)) {
    if (isLiveBookmark(bookmark)) keys.add(bookmark.progressKey);
  }
  return keys;
}

export function sectionHasBookmarks(
  bookmarkedKeys: ReadonlySet<string>,
  section: BookmarkSectionIdentity,
): boolean {
  // Same identity set as bookmarksForSection, so the heatmap and outline dot
  // can never disagree with the panel about whether a section holds bookmarks.
  return [...bookmarkSectionKeys(section)].some((key) =>
    bookmarkedKeys.has(key),
  );
}

type NewBookmarkBaseInput = {
  section: ProgressIdentity & Pick<ProgressSection, "sectionId">;
  quote: string;
  quoteOrdinal?: number;
  prefix?: string;
  suffix?: string;
};

export type NewBookmarkInput =
  | (NewBookmarkBaseInput & {
      range: ReaderPassageRange;
    })
  | (NewBookmarkBaseInput & {
      // Version 1 call shape retained for fixtures and callers migrating one
      // step at a time. New reader interactions always provide range.
      paragraphAnchor: string;
      startOffset: number;
      endOffset: number;
    });

function rangeForInput(input: NewBookmarkInput): ReaderPassageRange {
  if ("range" in input) return input.range;
  return createReaderPassageRange(
    {
      paragraphAnchor: input.paragraphAnchor,
      offset: input.startOffset,
    },
    {
      paragraphAnchor: input.paragraphAnchor,
      offset: input.endOffset,
    },
  );
}

type StoredBookmarkInput = {
  id: string;
  progressKey: string;
  sectionId: string;
  range: ReaderPassageRange;
  quote: string;
  quoteOrdinal: number;
  prefix: string;
  suffix: string;
  sectionContentHash: string;
  createdAt: number;
  updatedAt: number;
};

function bookmarkFromInput(
  input: NewBookmarkInput,
  now: number,
  id: string,
): StoredBookmarkInput {
  return {
    id,
    progressKey: primaryProgressKey(input.section),
    sectionId: input.section.sectionId,
    range: rangeForInput(input),
    quote: input.quote,
    quoteOrdinal: input.quoteOrdinal ?? 0,
    prefix: input.prefix ?? "",
    suffix: input.suffix ?? "",
    sectionContentHash: input.section.contentHash,
    createdAt: now,
    updatedAt: now,
  };
}

// Returns the same state when the cap is reached, so the caller can tell the
// reader rather than silently dropping the oldest record. Losing saved work to
// make room for saved work is not a tradeoff worth making on the reader's
// behalf.
export function addBookmark(
  state: ReaderBookmarksState,
  input: NewBookmarkInput,
  now = Date.now(),
  id = createBookmarkId(),
): ReaderBookmarksState {
  if (liveBookmarkCount(state) >= maxLiveBookmarks) return state;

  const bookmark = normalizeBookmark(bookmarkFromInput(input, now, id), now);
  if (!bookmark) return state;

  const bookmarks = cloneBookmarkMap(state.bookmarks);
  bookmarks[bookmark.id] = bookmark;
  return { bookmarks };
}

// Did addBookmark actually store it? The cap makes addBookmark return its input
// unchanged, and a caller that re-reads storage to compare gets a fresh object
// every time, so a reference check against a re-read is always false. Callers
// ask this instead.
export function canAddBookmark(state: ReaderBookmarksState): boolean {
  return liveBookmarkCount(state) < maxLiveBookmarks;
}

// Tombstone, not deletion. The reader-facing text is cleared so a removed
// bookmark stops carrying quoted manuscript prose, while the id and timestamp
// survive to beat an older live copy on another device.
export function removeBookmark(
  state: ReaderBookmarksState,
  id: string,
  now = Date.now(),
): ReaderBookmarksState {
  const existing = bookmarkAt(state.bookmarks, id);
  if (!existing || !isLiveBookmark(existing)) return state;
  const tombstone: ReaderBookmark = {
    ...existing,
    quote: "",
    prefix: "",
    suffix: "",
    updatedAt: now,
    removedAt: now,
  };
  delete tombstone.note;
  const bookmarks = cloneBookmarkMap(state.bookmarks);
  bookmarks[id] = tombstone;
  return { bookmarks };
}

export function setBookmarkNote(
  state: ReaderBookmarksState,
  id: string,
  note: string,
  now = Date.now(),
): ReaderBookmarksState {
  const existing = bookmarkAt(state.bookmarks, id);
  if (!existing || !isLiveBookmark(existing)) return state;
  const trimmed = clamp(note.trim(), maxBookmarkNoteLength);
  if ((existing.note ?? "") === trimmed) return state;
  const next: ReaderBookmark = { ...existing, updatedAt: now };
  if (trimmed) next.note = trimmed;
  else delete next.note;
  const bookmarks = cloneBookmarkMap(state.bookmarks);
  bookmarks[id] = next;
  return { bookmarks };
}

export function pruneBookmarks(
  state: ReaderBookmarksState,
  now = Date.now(),
  retentionMs = bookmarkTombstoneRetentionMs,
): ReaderBookmarksState {
  const expired = Object.values(state.bookmarks).filter(
    (bookmark) =>
      bookmark.removedAt !== undefined && now - bookmark.removedAt > retentionMs,
  );
  if (expired.length === 0) return state;
  const bookmarks = cloneBookmarkMap(state.bookmarks);
  for (const bookmark of expired) delete bookmarks[bookmark.id];
  return { bookmarks };
}

// Per-bookmark last-write-wins on updatedAt, with a tombstone winning an exact
// tie. Progress merges as a union with per-field Math.max because nothing there
// is ever removed; bookmarks are removable, so a union would resurrect every
// deletion on the next pull. Deletion is therefore absorbing rather than merely
// winning ties: a wrongly kept deletion loses one bookmark, a wrongly
// resurrected one comes back on every device forever.
export function mergeBookmarkStates(
  local: ReaderBookmarksState,
  remote: ReaderBookmarksState,
): ReaderBookmarksState {
  const bookmarks = cloneBookmarkMap(remote.bookmarks);

  for (const [id, localBookmark] of Object.entries(local.bookmarks)) {
    const remoteBookmark = bookmarkAt(bookmarks, id);
    if (!remoteBookmark) {
      bookmarks[id] = localBookmark;
      continue;
    }

    // A tombstone is absorbing, not merely a tie-breaker. Timestamps are
    // unvalidated client clocks, so "newest wins" alone means a device ten
    // minutes fast can undo a deletion made on a correct one, and the reader
    // watches the bookmark they deleted reappear on every sync.
    //
    // This is safe precisely because every add mints a fresh UUID. No live
    // record can legitimately share an id with a tombstone, so preferring the
    // tombstone can never discard a genuine later re-bookmark; that arrives
    // under a different id and is untouched here.
    const localRemoved = !isLiveBookmark(localBookmark);
    const remoteRemoved = !isLiveBookmark(remoteBookmark);
    if (localRemoved !== remoteRemoved) {
      bookmarks[id] = localRemoved ? localBookmark : remoteBookmark;
      continue;
    }

    bookmarks[id] =
      localBookmark.updatedAt > remoteBookmark.updatedAt
        ? localBookmark
        : remoteBookmark;
  }

  return { bookmarks };
}

// Serialized size of the blob, for the sync path to check before uploading.
// The database CHECK constraint rejects an oversized write outright with no
// recovery path, so this turns that into a message the reader can act on.
export function bookmarksByteSize(state: ReaderBookmarksState): number {
  if (typeof TextEncoder === "undefined") {
    return serializeBookmarks(state).length;
  }
  return new TextEncoder().encode(serializeBookmarks(state)).length;
}

export function bookmarksFitRemoteBudget(state: ReaderBookmarksState): boolean {
  return bookmarksByteSize(state) <= maxRemoteBookmarksBytes;
}

// Refuse to merge a remote row written by a newer client: it may carry fields
// this build would drop, and the drop would then be uploaded over the richer
// remote copy. Mirrors reconcileRemoteProgress.
export function reconcileRemoteBookmarks(
  local: ReaderBookmarksState,
  remote: ReaderBookmarksState,
  remoteSchemaVersion: number,
): ReaderBookmarksState | null {
  if (remoteSchemaVersion > readerBookmarksSchemaVersion) return null;
  return mergeBookmarkStates(local, remote);
}

// Resolution rungs 1 and 2 of the ladder. Both answer from paragraph metadata
// alone. The bookmarks menu loads that book-wide index on demand so ordinary
// reading does not pay its network, parsing, or heap cost.
export function resolveBookmarkAnchor(
  bookmark: Pick<ReaderBookmark, "range">,
  paragraphs: readonly ProgressParagraph[],
): BookmarkResolution {
  return resolveReaderPassageRange(bookmark.range, paragraphs);
}

export function isBookmarkStale(
  bookmark: ReaderBookmark,
  paragraphs: readonly ProgressParagraph[],
): boolean {
  return resolveBookmarkAnchor(bookmark, paragraphs).status === "missing";
}

// Route-correct link to the bookmarked paragraph. canonicalReaderDestination
// owns the anchorPrefix rule: bare on a canonical section route, prefixed with
// the section id on a chapter route, where readerHref already carries a
// fragment.
export function bookmarkHref(
  bookmark: Pick<ReaderBookmark, "range">,
  section: Pick<ProgressSection, "readerHref">,
  resolvedAnchor = bookmark.range.start.paragraphAnchor,
): string {
  return canonicalReaderDestination(section.readerHref, `#${resolvedAnchor}`);
}

// The query must already be folded with foldSearchText. Titles are folded the
// same way here rather than with foldTitleText, because a query that has had its
// punctuation stripped cannot match a title that has kept its own.
export function bookmarkMatchesQuery(
  bookmark: ReaderBookmark,
  foldedQuery: string,
  sectionTitle = "",
): boolean {
  if (!foldedQuery) return true;
  return (
    foldSearchText(bookmark.quote).includes(foldedQuery) ||
    foldSearchText(bookmark.note ?? "").includes(foldedQuery) ||
    foldSearchText(sectionTitle).includes(foldedQuery)
  );
}

export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function hasEnoughWords(value: string): boolean {
  return countWords(value) >= minimumBookmarkWords;
}
