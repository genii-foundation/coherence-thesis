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
