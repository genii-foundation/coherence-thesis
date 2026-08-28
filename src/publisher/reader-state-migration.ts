import {
  createEmptyReaderBookmarksState,
  sanitizeReaderBookmarksState,
  type ReaderBookmark,
  type ReaderBookmarksState,
} from "@genii-foundation/publisher-reader/bookmarks";
import {
  createEmptyReaderProgressState,
  sanitizeReaderProgressState,
  type ReaderNavigationSource,
  type ReaderProgressState,
  type ReaderSectionProgress,
} from "@genii-foundation/publisher-reader/progress";
import type { ReaderPassagePoint } from "@genii-foundation/publisher-reader/passage-range";

import type {
  CoherenceReaderStateMigrationArtifact,
  CoherenceReaderStateMigrationParagraph,
  CoherenceReaderStateMigrationSection,
} from "./reader-state-migration-schema";

export const MAXIMUM_COHERENCE_LEGACY_STATE_BYTES = 8_388_608;
export const MAXIMUM_COHERENCE_LEGACY_PROGRESS_ENTRIES = 20_000;
export const MAXIMUM_COHERENCE_LEGACY_BOOKMARK_ENTRIES = 4_000;

type JsonRecord = Record<string, unknown>;

type LegacyProgressEntry = Readonly<{
  key: string;
  sectionId: string;
  contentHash: string;
  continuityIds: readonly string[];
  percent: number;
  readAt: number;
  firstOpenedAt: number | null;
  lastOpenedAt: number | null;
  lastReadAt: number | null;
  openCount: number;
  activeSeconds: number;
  maxScrollPercent: number;
  manualReadCount: number;
  autoReadCount: number;
  audioSeconds: number;
  lastSource: string | null;
}>;

type LegacyPassagePoint = Readonly<{
  paragraphAnchor: string;
  paragraphContentHash: string;
  offset: number;
}>;

type LegacyBookmark = Readonly<{
  id: string;
  progressKey: string;
  sectionId: string;
  sectionContentHash: string;
  start: LegacyPassagePoint;
  end: LegacyPassagePoint;
  quote: string;
  prefix: string;
  suffix: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  removedAt?: number;
}>;

export type CoherenceReaderStateMigrationReport = Readonly<{
  schemaVersion: 1;
  progressAccepted: number;
  progressRefused: number;
  bookmarksAccepted: number;
  bookmarksRefused: number;
}>;

export type CoherenceReaderStateMigrationResult = Readonly<{
  progress: ReaderProgressState;
  bookmarks: ReaderBookmarksState;
  report: CoherenceReaderStateMigrationReport;
}>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function own(record: JsonRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonnegativeInteger(value: unknown, maximum: number): number {
  const number = finite(value);
  return number === null
    ? 0
    : Math.min(maximum, Math.max(0, Math.trunc(number)));
}

function timestamp(value: unknown, now: number): number | null {
  const number = finite(value);
  return number === null
    ? null
    : Math.min(now, Math.max(0, Math.trunc(number)));
}

function stringArray(value: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) return Object.freeze([]);
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || item.length > 512) {
      return Object.freeze([]);
    }
    result.push(item);
  }
  return Object.freeze(result);
}

function parseJson(serialized: string | null | undefined): unknown {
  if (
    serialized === null ||
    serialized === undefined ||
    serialized.length === 0 ||
    serialized.length > MAXIMUM_COHERENCE_LEGACY_STATE_BYTES ||
    new TextEncoder().encode(serialized).byteLength >
      MAXIMUM_COHERENCE_LEGACY_STATE_BYTES
  ) {
    return null;
  }
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
}

function legacyProgressEntries(
  serialized: string | null | undefined,
  now: number,
): readonly LegacyProgressEntry[] {
  const parsed = parseJson(serialized);
  if (!isRecord(parsed) || !isRecord(own(parsed, "sections"))) {
    return Object.freeze([]);
  }
  const sections = own(parsed, "sections") as JsonRecord;
  const entries = Object.entries(sections);
  if (entries.length > MAXIMUM_COHERENCE_LEGACY_PROGRESS_ENTRIES) {
    return Object.freeze([]);
  }
  const result: LegacyProgressEntry[] = [];
  for (const [key, value] of entries) {
    if (!isRecord(value)) continue;
    const sectionId = own(value, "sectionId");
    const contentHash = own(value, "contentHash");
    const percent = finite(own(value, "percent"));
    const readAt = timestamp(own(value, "readAt"), now);
    if (
      key.length === 0 ||
      key.length > 512 ||
      typeof sectionId !== "string" ||
      sectionId.length === 0 ||
      sectionId.length > 512 ||
      typeof contentHash !== "string" ||
      contentHash.length > 128 ||
      percent === null ||
      readAt === null
    ) continue;
    result.push(Object.freeze({
      key,
      sectionId,
      contentHash,
      continuityIds: stringArray(own(value, "continuityIds"), 4_096),
      percent: Math.min(100, Math.max(0, Math.round(percent))),
      readAt,
      firstOpenedAt: timestamp(own(value, "firstOpenedAt"), now),
      lastOpenedAt: timestamp(own(value, "lastOpenedAt"), now),
      lastReadAt: timestamp(own(value, "lastReadAt"), now),
      openCount: nonnegativeInteger(own(value, "openCount"), 1_000_000),
      activeSeconds: nonnegativeInteger(own(value, "activeSeconds"), 315_576_000),
      maxScrollPercent: Math.min(
        100,
        nonnegativeInteger(own(value, "maxScrollPercent"), 100),
      ),
      manualReadCount: nonnegativeInteger(own(value, "manualReadCount"), 1_000_000),
      autoReadCount: nonnegativeInteger(own(value, "autoReadCount"), 1_000_000),
      audioSeconds: nonnegativeInteger(own(value, "audioSeconds"), 315_576_000),
      lastSource:
        typeof own(value, "lastSource") === "string"
          ? own(value, "lastSource") as string
          : null,
    }));
  }
  return Object.freeze(result);
}

function passagePoint(value: unknown): LegacyPassagePoint | null {
  if (!isRecord(value)) return null;
  const paragraphAnchor = own(value, "paragraphAnchor");
  const paragraphContentHash = own(value, "paragraphContentHash");
  const offset = finite(own(value, "offset"));
  if (
    typeof paragraphAnchor !== "string" ||
    paragraphAnchor.length === 0 ||
    paragraphAnchor.length > 512 ||
    !(paragraphContentHash === undefined ||
      (typeof paragraphContentHash === "string" && paragraphContentHash.length <= 128)) ||
    offset === null ||
    offset < 0
  ) return null;
  return Object.freeze({
    paragraphAnchor,
    paragraphContentHash:
      typeof paragraphContentHash === "string" ? paragraphContentHash : "",
    offset: Math.trunc(offset),
  });
}

function legacyRange(value: JsonRecord): Readonly<{
  start: LegacyPassagePoint;
  end: LegacyPassagePoint;
}> | null {
  const range = own(value, "range");
  if (isRecord(range)) {
    const start = passagePoint(own(range, "start"));
    const end = passagePoint(own(range, "end"));
    if (start !== null && end !== null) return Object.freeze({ start, end });
  }
  const paragraphAnchor = own(value, "paragraphAnchor");
  const paragraphContentHash = own(value, "paragraphContentHash");
  const startOffset = finite(own(value, "startOffset"));
  const endOffset = finite(own(value, "endOffset"));
  if (
    typeof paragraphAnchor !== "string" ||
    paragraphAnchor.length === 0 ||
    paragraphAnchor.length > 512 ||
    !(paragraphContentHash === undefined ||
      (typeof paragraphContentHash === "string" && paragraphContentHash.length <= 128)) ||
    startOffset === null ||
    endOffset === null ||
    startOffset < 0 ||
    endOffset < startOffset
  ) return null;
  const pointBase = {
    paragraphAnchor,
    paragraphContentHash:
      typeof paragraphContentHash === "string" ? paragraphContentHash : "",
  };
  return Object.freeze({
    start: Object.freeze({ ...pointBase, offset: Math.trunc(startOffset) }),
    end: Object.freeze({ ...pointBase, offset: Math.trunc(endOffset) }),
  });
}

function legacyBookmarks(
  serialized: string | null | undefined,
  now: number,
): readonly LegacyBookmark[] {
  const parsed = parseJson(serialized);
  if (!isRecord(parsed) || !isRecord(own(parsed, "bookmarks"))) {
    return Object.freeze([]);
  }
  const entries = Object.entries(own(parsed, "bookmarks") as JsonRecord);
  if (entries.length > MAXIMUM_COHERENCE_LEGACY_BOOKMARK_ENTRIES) {
    return Object.freeze([]);
  }
  const result: LegacyBookmark[] = [];
  for (const [key, value] of entries) {
    if (!isRecord(value)) continue;
    const id = own(value, "id");
    const progressKey = own(value, "progressKey");
    const sectionId = own(value, "sectionId");
    const sectionContentHash = own(value, "sectionContentHash");
    const quote = own(value, "quote");
    const createdAt = timestamp(own(value, "createdAt"), now);
    const updatedAt = timestamp(own(value, "updatedAt"), now);
    const range = legacyRange(value);
    if (
      typeof id !== "string" ||
      id !== key ||
      id.length === 0 ||
      id.length > 512 ||
      typeof progressKey !== "string" ||
      progressKey.length === 0 ||
      progressKey.length > 512 ||
      typeof sectionId !== "string" ||
      sectionId.length === 0 ||
      sectionId.length > 512 ||
      typeof sectionContentHash !== "string" ||
      sectionContentHash.length > 128 ||
      typeof quote !== "string" ||
      createdAt === null ||
      updatedAt === null ||
      range === null
    ) continue;
    const removedAt = own(value, "removedAt");
    result.push(Object.freeze({
      id,
      progressKey,
      sectionId,
      sectionContentHash,
      start: range.start,
      end: range.end,
      quote,
      prefix: typeof own(value, "prefix") === "string" ? own(value, "prefix") as string : "",
      suffix: typeof own(value, "suffix") === "string" ? own(value, "suffix") as string : "",
      ...(typeof own(value, "note") === "string" ? { note: own(value, "note") as string } : {}),
      createdAt,
      updatedAt,
      ...(removedAt === undefined
        ? {}
        : { removedAt: timestamp(removedAt, now) ?? updatedAt }),
    }));
  }
  return Object.freeze(result);
}

function sectionAliases(
  artifact: CoherenceReaderStateMigrationArtifact,
): ReadonlyMap<string, CoherenceReaderStateMigrationSection | null> {
  const aliases = new Map<string, CoherenceReaderStateMigrationSection | null>();
  for (const section of artifact.sections) {
    for (const alias of [
      section.sectionId,
      section.sectionContinuityId,
      ...section.acceptedLegacySectionIds,
      ...section.acceptedLegacyContinuityIds,
    ]) {
      const existing = aliases.get(alias);
      aliases.set(alias, existing === undefined || existing === section ? section : null);
    }
  }
  return aliases;
}

function resolveSection(
  aliases: ReadonlyMap<string, CoherenceReaderStateMigrationSection | null>,
  values: readonly string[],
): CoherenceReaderStateMigrationSection | null {
  const sections = new Set<CoherenceReaderStateMigrationSection>();
  for (const value of values) {
    const section = aliases.get(value);
    if (section === null) return null;
    if (section !== undefined) sections.add(section);
  }
  return sections.size === 1 ? [...sections][0] ?? null : null;
}

function navigationSource(value: string | null): ReaderNavigationSource {
  switch (value) {
    case "direct":
    case "outline":
    case "search":
    case "recommendation":
    case "chapter":
    case "audio":
    case "unknown":
      return value;
    case "next-section":
      return "next";
    case "previous-section":
      return "previous";
    case "updated-notice":
      return "updated";
    default:
      return "restored";
  }
}

function targetProgress(
  artifact: CoherenceReaderStateMigrationArtifact,
  serialized: string | null | undefined,
  now: number,
): Readonly<{ state: ReaderProgressState; accepted: number; refused: number }> {
  const aliases = sectionAliases(artifact);
  const output: Record<string, ReaderSectionProgress> = Object.create(null) as Record<string, ReaderSectionProgress>;
  let accepted = 0;
  let refused = 0;
  for (const entry of legacyProgressEntries(serialized, now)) {
    const section = resolveSection(
      aliases,
      [entry.key, entry.sectionId, ...entry.continuityIds],
    );
    if (section === null || entry.contentHash !== section.legacyContentHash) {
      refused += 1;
      continue;
    }
    const readCount = Math.min(
      1_000_000,
      entry.manualReadCount + entry.autoReadCount,
    );
    const read = entry.percent >= 100 || readCount > 0;
    const firstOpenedAt = entry.firstOpenedAt ?? entry.readAt;
    const lastOpenedAt = entry.lastOpenedAt ?? entry.readAt;
    const firstReadAt = read ? entry.readAt : null;
    const lastReadAt = read ? entry.lastReadAt ?? entry.readAt : null;
    const updatedAt = Math.max(
      entry.readAt,
      firstOpenedAt,
      lastOpenedAt,
      lastReadAt ?? 0,
    );
    const next = Object.freeze({
      continuityIds: section.acceptedLegacyContinuityIds,
      contentHash: section.contentHash,
      percent: entry.percent,
      scrollPercent: Math.max(entry.percent, entry.maxScrollPercent),
      readingTimeMs: entry.activeSeconds * 1_000,
      audioPositionMs: entry.audioSeconds * 1_000,
      firstOpenedAt,
      lastOpenedAt,
      openCount: entry.openCount,
      navigationSource: navigationSource(entry.lastSource),
      firstReadAt,
      lastReadAt,
      readCount: read ? Math.max(1, readCount) : 0,
      readMethod: read
        ? entry.manualReadCount > 0
          ? "manual" as const
          : "automatic" as const
        : null,
      readContentHash: read ? section.contentHash : null,
      readContentHashes: read ? Object.freeze([section.contentHash]) : Object.freeze([]),
      updatedAt,
    });
    const existing = output[section.sectionContinuityId];
    if (existing === undefined || next.updatedAt > existing.updatedAt) {
      output[section.sectionContinuityId] = next;
    }
    accepted += 1;
  }
  const state = sanitizeReaderProgressState(
    {
      schemaVersion: 1,
      publicationId: artifact.publicationId,
      entries: output,
    },
    { publicationId: artifact.publicationId, now },
  );
  return Object.freeze({ state, accepted, refused });
}

function paragraphForPoint(
  section: CoherenceReaderStateMigrationSection,
  point: LegacyPassagePoint,
): CoherenceReaderStateMigrationParagraph | null {
  const exact = section.paragraphs.filter(
    ({ legacyParagraphId }) => legacyParagraphId === point.paragraphAnchor,
  );
  if (exact.length === 1) {
    const paragraph = exact[0];
    return paragraph !== undefined &&
        (point.paragraphContentHash.length === 0 ||
          point.paragraphContentHash === paragraph.legacyContentHash)
      ? paragraph
      : null;
  }
  if (point.paragraphContentHash.length === 0) return null;
  const byHash = section.paragraphs.filter(
    ({ legacyContentHash }) => legacyContentHash === point.paragraphContentHash,
  );
  return byHash.length === 1 ? byHash[0] ?? null : null;
}

function translateOffset(
  paragraph: CoherenceReaderStateMigrationParagraph,
  offset: number,
): number | null {
  if (offset > paragraph.legacyTextCodeUnits) return null;
  const candidates = new Set<number>();
  for (const segment of paragraph.offsetSegments) {
    const end = segment.legacyStart + segment.length;
    if (offset < segment.legacyStart || offset > end) continue;
    candidates.add(segment.targetStart + offset - segment.legacyStart);
  }
  return candidates.size === 1 ? [...candidates][0] ?? null : null;
}

function translatePoint(
  section: CoherenceReaderStateMigrationSection,
  point: LegacyPassagePoint,
): ReaderPassagePoint | null {
  const paragraph = paragraphForPoint(section, point);
  if (paragraph === null) return null;
  const offset = translateOffset(paragraph, point.offset);
  return offset === null
    ? null
    : Object.freeze({
        workId: section.workId,
        sectionContinuityId: section.sectionContinuityId,
        blockId: paragraph.blockId,
        blockContentHash: paragraph.blockContentHash as `sha256:${string}`,
        offset,
      });
}

function targetBookmarks(
  artifact: CoherenceReaderStateMigrationArtifact,
  serialized: string | null | undefined,
  now: number,
): Readonly<{ state: ReaderBookmarksState; accepted: number; refused: number }> {
  const aliases = sectionAliases(artifact);
  const output: Record<string, ReaderBookmark> = Object.create(null) as Record<string, ReaderBookmark>;
  let accepted = 0;
  let refused = 0;
  for (const bookmark of legacyBookmarks(serialized, now)) {
    const section = resolveSection(
      aliases,
      [bookmark.progressKey, bookmark.sectionId],
    );
    const start = section === null ? null : translatePoint(section, bookmark.start);
    const end = section === null ? null : translatePoint(section, bookmark.end);
    if (
      section === null ||
      bookmark.sectionContentHash !== section.legacyContentHash ||
      start === null ||
      end === null ||
      (start.blockId === end.blockId && start.offset > end.offset)
    ) {
      refused += 1;
      continue;
    }
    output[bookmark.id] = Object.freeze({
      id: bookmark.id,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
      ...(bookmark.removedAt === undefined ? {} : { deletedAt: bookmark.removedAt }),
      workId: section.workId,
      sectionContinuityId: section.sectionContinuityId,
      href: section.href,
      quote: bookmark.quote,
      prefix: bookmark.prefix,
      suffix: bookmark.suffix,
      range: Object.freeze({ start, end }),
      ...(bookmark.note === undefined ? {} : { note: bookmark.note }),
    });
    accepted += 1;
  }
  const state = sanitizeReaderBookmarksState(
    {
      schemaVersion: 1,
      publicationId: artifact.publicationId,
      bookmarks: output,
    },
    { publicationId: artifact.publicationId, now },
  );
  return Object.freeze({ state, accepted, refused });
}

export function migrateCoherenceReaderState(input: Readonly<{
  artifact: CoherenceReaderStateMigrationArtifact;
  legacyProgress: string | null | undefined;
  legacyBookmarks: string | null | undefined;
  now: number;
}>): CoherenceReaderStateMigrationResult {
  const now = nonnegativeInteger(input.now, Number.MAX_SAFE_INTEGER);
  const progress = targetProgress(
    input.artifact,
    input.legacyProgress,
    now,
  );
  const bookmarks = targetBookmarks(
    input.artifact,
    input.legacyBookmarks,
    now,
  );
  return Object.freeze({
    progress: progress.state,
    bookmarks: bookmarks.state,
    report: Object.freeze({
      schemaVersion: 1 as const,
      progressAccepted: progress.accepted,
      progressRefused: progress.refused,
      bookmarksAccepted: bookmarks.accepted,
      bookmarksRefused: bookmarks.refused,
    }),
  });
}

export function emptyCoherenceReaderStateMigrationResult(
  publicationId: string,
): CoherenceReaderStateMigrationResult {
  return Object.freeze({
    progress: createEmptyReaderProgressState(publicationId),
    bookmarks: createEmptyReaderBookmarksState(publicationId),
    report: Object.freeze({
      schemaVersion: 1 as const,
      progressAccepted: 0,
      progressRefused: 0,
      bookmarksAccepted: 0,
      bookmarksRefused: 0,
    }),
  });
}
