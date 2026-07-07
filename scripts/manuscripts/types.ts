// Shared build-pipeline types for the manuscript compiler.
// Split out of shared.ts (MAINT-05). Re-exported from ./shared for stable imports.

export type ManuscriptFrontmatter = {
  volumeId: string;
  volumeTitle: string;
  volumeOrder: number;
  partId: string;
  partTitle: string;
  partOrder: number;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  sectionId: string;
  title: string;
  sectionOrder: number;
  sourceDoc?: string;
  sourceHash?: string;
  sourceParagraphStart?: number;
  sourceParagraphEnd?: number;
  aliases?: string[];
};

export type MarkdownDocument = {
  filePath: string;
  relativePath: string;
  frontmatter: ManuscriptFrontmatter;
  body: string;
};

export type CompiledSection = ManuscriptFrontmatter & {
  path: string;
  href: string;
  body: string;
  text: string;
  paragraphs: CompiledParagraph[];
  wordCount: number;
  readingMinutes: number;
  contentHash: string;
  versionHash: string;
  versionDate: string;
  versionUrl: string;
  audioVersionId: string;
  previousSectionId: string | null;
  nextSectionId: string | null;
};

export type VolumeConfig = {
  volumeId: string;
  title: string;
  subtitle: string;
  order: number;
  numberLabel: string;
  planet: string;
  coverImage: string;
  coverAlt: string;
  sourcePath: string;
};

export type CompiledParagraph = {
  paragraphId: string;
  anchor: string;
  order: number;
  contentHash: string;
  text: string;
};

export type CompiledChapter = {
  chapterId: string;
  title: string;
  order: number;
  href: string;
  sectionIds: string[];
  wordCount: number;
};

export type CompiledPart = {
  partId: string;
  title: string;
  order: number;
  href: string;
  chapters: CompiledChapter[];
  sectionIds: string[];
  wordCount: number;
};

export type CompiledVolume = {
  volumeId: string;
  title: string;
  subtitle: string;
  order: number;
  numberLabel: string;
  planet: string;
  coverImage: string;
  coverAlt: string;
  href: string;
  parts: CompiledPart[];
  sectionIds: string[];
  wordCount: number;
};

export type OverviewReference = {
  sectionId: string;
  label?: string;
};

export type OverviewNode = {
  id: string;
  title: string;
  summary: string;
  references: OverviewReference[];
  children?: OverviewNode[];
};

export type OverviewDocument = {
  title: string;
  subtitle: string;
  readingMinutes: number;
  nodes: OverviewNode[];
};

export type SectionAliasInput = {
  sourceHref: string;
  targetSectionId: string;
  note?: string;
};

export type SectionAliasConfig = {
  version: number;
  aliases: SectionAliasInput[];
};

export type SectionAlias = SectionAliasInput & {
  targetHref: string;
  sourceRoute: {
    volumeId: string;
    partId: string;
    chapterId: string;
    sectionId: string;
  };
};

// One published section route. Section IDs are the localStorage key for read
// progress and the anchor for deep links, audio queues, and aliases, so the
// ledger records every route that has ever been published. It only grows: a
// removed or renamed section stays here so the drift gate can insist its old
// route still resolves through an alias.
export type SectionLedgerEntry = {
  sectionId: string;
  href: string;
};

export type SectionLedger = {
  version: number;
  routes: SectionLedgerEntry[];
};

export type VersionProvenanceEntry = {
  contentHash: string;
  versionDate: string;
  commitSha: string;
  commitUrl: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
};

export type VersionProvenanceManifest = {
  version: number;
  generatedAt: string;
  entries: VersionProvenanceEntry[];
};

export type CompiledCatalog = {
  siteTitle: string;
  generatedFrom: string;
  gitRevision: string;
  stats: {
    volumeCount: number;
    partCount: number;
    chapterCount: number;
    sectionCount: number;
    wordCount: number;
    readingMinutes: number;
  };
  volumes: CompiledVolume[];
  sections: CompiledSection[];
  aliases: SectionAlias[];
  overview: OverviewDocument;
};

export type SearchIndexEntry = {
  sectionId: string;
  href: string;
  title: string;
  volumeTitle: string;
  partTitle: string;
  chapterTitle: string;
  wordCount: number;
  contentHash: string;
  text: string;
};
