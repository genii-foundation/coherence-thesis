export const COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION = "1.0";
export const COHERENCE_READER_STATE_MIGRATION_HREF =
  "/publisher/coherence-reader-state-migration.json";
export const MAXIMUM_COHERENCE_STATE_MIGRATION_BYTES = 8_388_608;
export const MAXIMUM_COHERENCE_STATE_MIGRATION_SECTIONS = 10_000;
export const MAXIMUM_COHERENCE_STATE_MIGRATION_PARAGRAPHS = 20_000;

export type CoherenceReaderStateMigrationOffsetSegment = Readonly<{
  legacyStart: number;
  targetStart: number;
  length: number;
}>;

export type CoherenceReaderStateMigrationParagraph = Readonly<{
  legacyParagraphId: string;
  legacyContentHash: string;
  legacyTextCodeUnits: number;
  blockId: string;
  blockContentHash: string;
  blockTextCodeUnits: number;
  offsetSegments: readonly CoherenceReaderStateMigrationOffsetSegment[];
}>;

export type CoherenceReaderStateMigrationSection = Readonly<{
  workId: string;
  sectionId: string;
  sectionContinuityId: string;
  acceptedLegacySectionIds: readonly string[];
  acceptedLegacyContinuityIds: readonly string[];
  href: string;
  legacyContentHash: string;
  contentHash: string;
  paragraphs: readonly CoherenceReaderStateMigrationParagraph[];
}>;

export type CoherenceReaderStateMigrationArtifact = Readonly<{
  schemaVersion: typeof COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION;
  publicationId: string;
  readerBuildId: string;
  href: typeof COHERENCE_READER_STATE_MIGRATION_HREF;
  legacyProgressStorageKeys: readonly [
    "coherence-reader-progress-v2",
    "coherence-reader-progress-v1",
  ];
  legacyBookmarksStorageKeys: readonly [
    "coherence-reader-bookmarks-v2",
    "coherence-reader-bookmarks-v1",
  ];
  sections: readonly CoherenceReaderStateMigrationSection[];
  buildId: string;
}>;

type JsonRecord = Record<string, unknown>;

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const LEGACY_HASH = /^[0-9a-f]{16}$/u;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index]);
}

function boundedString(
  value: unknown,
  maximum: number,
  pattern?: RegExp,
): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= maximum && (pattern === undefined || pattern.test(value));
}

function stringArray(
  value: unknown,
  maximumItems: number,
): value is readonly string[] {
  return Array.isArray(value) && value.length <= maximumItems &&
    value.every((item) => boundedString(item, 512));
}

function offsetSegment(
  value: unknown,
): value is CoherenceReaderStateMigrationOffsetSegment {
  const item = record(value);
  return item !== null &&
    exactKeys(item, ["legacyStart", "length", "targetStart"]) &&
    [item.legacyStart, item.targetStart, item.length].every(
      (number) => Number.isSafeInteger(number) && (number as number) >= 0,
    ) && item.length !== 0;
}

function paragraph(
  value: unknown,
): value is CoherenceReaderStateMigrationParagraph {
  const item = record(value);
  if (item === null || !exactKeys(item, [
    "blockContentHash",
    "blockId",
    "blockTextCodeUnits",
    "legacyContentHash",
    "legacyParagraphId",
    "legacyTextCodeUnits",
    "offsetSegments",
  ])) return false;
  if (
    !boundedString(item.legacyParagraphId, 512) ||
    !boundedString(item.legacyContentHash, 16, LEGACY_HASH) ||
    !boundedString(item.blockId, 512) ||
    !boundedString(item.blockContentHash, 71, SHA256) ||
    !Number.isSafeInteger(item.legacyTextCodeUnits) ||
    (item.legacyTextCodeUnits as number) < 0 ||
    !Number.isSafeInteger(item.blockTextCodeUnits) ||
    (item.blockTextCodeUnits as number) < 0 ||
    !Array.isArray(item.offsetSegments) ||
    item.offsetSegments.length > 4_096 ||
    !item.offsetSegments.every(offsetSegment)
  ) return false;
  const legacyTextCodeUnits = item.legacyTextCodeUnits as number;
  const blockTextCodeUnits = item.blockTextCodeUnits as number;
  let priorLegacyEnd = 0;
  let priorTargetEnd = 0;
  for (const segment of item.offsetSegments) {
    if (
      segment.legacyStart < priorLegacyEnd ||
      segment.targetStart < priorTargetEnd ||
      segment.legacyStart + segment.length > legacyTextCodeUnits ||
      segment.targetStart + segment.length > blockTextCodeUnits
    ) return false;
    priorLegacyEnd = segment.legacyStart + segment.length;
    priorTargetEnd = segment.targetStart + segment.length;
  }
  return true;
}

function section(
  value: unknown,
): value is CoherenceReaderStateMigrationSection {
  const item = record(value);
  return item !== null && exactKeys(item, [
    "acceptedLegacyContinuityIds",
    "acceptedLegacySectionIds",
    "contentHash",
    "href",
    "legacyContentHash",
    "paragraphs",
    "sectionContinuityId",
    "sectionId",
    "workId",
  ]) &&
    boundedString(item.workId, 512) &&
    boundedString(item.sectionId, 512) &&
    boundedString(item.sectionContinuityId, 512) &&
    stringArray(item.acceptedLegacySectionIds, 4_096) &&
    stringArray(item.acceptedLegacyContinuityIds, 4_096) &&
    boundedString(item.href, 2_048) && item.href.startsWith("/") &&
    !item.href.startsWith("//") && !item.href.includes("\\") &&
    boundedString(item.legacyContentHash, 16, LEGACY_HASH) &&
    boundedString(item.contentHash, 71, SHA256) &&
    Array.isArray(item.paragraphs) &&
    item.paragraphs.length <= MAXIMUM_COHERENCE_STATE_MIGRATION_PARAGRAPHS &&
    item.paragraphs.every(paragraph);
}

export function parseCoherenceReaderStateMigrationArtifact(
  value: unknown,
): CoherenceReaderStateMigrationArtifact | null {
  const artifact = record(value);
  if (artifact === null || !exactKeys(artifact, [
    "buildId",
    "href",
    "legacyBookmarksStorageKeys",
    "legacyProgressStorageKeys",
    "publicationId",
    "readerBuildId",
    "schemaVersion",
    "sections",
  ])) return null;
  if (
    artifact.schemaVersion !== COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION ||
    !boundedString(artifact.publicationId, 512) ||
    !boundedString(artifact.readerBuildId, 71, SHA256) ||
    artifact.href !== COHERENCE_READER_STATE_MIGRATION_HREF ||
    !Array.isArray(artifact.legacyProgressStorageKeys) ||
    artifact.legacyProgressStorageKeys.length !== 2 ||
    artifact.legacyProgressStorageKeys[0] !== "coherence-reader-progress-v2" ||
    artifact.legacyProgressStorageKeys[1] !== "coherence-reader-progress-v1" ||
    !Array.isArray(artifact.legacyBookmarksStorageKeys) ||
    artifact.legacyBookmarksStorageKeys.length !== 2 ||
    artifact.legacyBookmarksStorageKeys[0] !== "coherence-reader-bookmarks-v2" ||
    artifact.legacyBookmarksStorageKeys[1] !== "coherence-reader-bookmarks-v1" ||
    !Array.isArray(artifact.sections) ||
    artifact.sections.length > MAXIMUM_COHERENCE_STATE_MIGRATION_SECTIONS ||
    !artifact.sections.every(section) ||
    !boundedString(artifact.buildId, 71, SHA256)
  ) return null;
  const sectionIds = new Set<string>();
  let paragraphCount = 0;
  for (const item of artifact.sections) {
    if (sectionIds.has(item.sectionId)) return null;
    sectionIds.add(item.sectionId);
    paragraphCount += item.paragraphs.length;
    if (paragraphCount > MAXIMUM_COHERENCE_STATE_MIGRATION_PARAGRAPHS) {
      return null;
    }
  }
  return artifact as unknown as CoherenceReaderStateMigrationArtifact;
}
