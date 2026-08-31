import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";
import type { ReaderSection } from "@genii-foundation/publisher-schema/reader";

import type {
  ProgressSection,
  Section as LegacySection,
} from "@/lib/manuscript-data";
import type {
  CoherenceReaderStateMigrationArtifact,
  CoherenceReaderStateMigrationSection,
} from "@/publisher/reader-state-migration-schema";

export const MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_ROUTE_SECTIONS = 4;
export const MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_MODEL_BYTES = 32_768;

export type CoherencePublisherBookmarkOffsetSegment = Readonly<{
  legacyStart: number;
  targetStart: number;
  length: number;
}>;

export type CoherencePublisherBookmarkParagraphMapping = Readonly<{
  legacyParagraphId: string;
  legacyContentHash: string;
  blockId: string;
  blockContentHash: string;
  offsetSegment: CoherencePublisherBookmarkOffsetSegment;
}>;

export type CoherencePublisherBookmarkRouteSection = Readonly<{
  fallbackPath: string;
  legacySection: ProgressSection;
  paragraphs: readonly CoherencePublisherBookmarkParagraphMapping[];
  publisherSection: ReaderSection;
  workId: string;
}>;

export type CoherencePublisherBookmarkRouteModel = Readonly<{
  sections: readonly CoherencePublisherBookmarkRouteSection[];
}>;

const emptyBookmarkModel: CoherencePublisherBookmarkRouteModel = Object.freeze({
  sections: Object.freeze([]),
});

type PublisherSectionPage = Extract<
  PublisherNextPage,
  { readonly kind: "section" }
>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function exactStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function exactStringGroups(
  actual: readonly (readonly string[])[],
  expected: readonly (readonly string[])[],
): boolean {
  return actual.length === expected.length &&
    actual.every((group, index) =>
      exactStrings(group, expected[index] ?? [])
    );
}

function uniqueIndex<Item>(
  items: readonly Item[],
  identity: (item: Item) => string,
): ReadonlyMap<string, Item> | null {
  const index = new Map<string, Item>();
  for (const item of items) {
    const id = identity(item);
    if (index.has(id)) return null;
    index.set(id, item);
  }
  return index;
}

function projectProgressSection(
  section: ReaderSection,
  legacy: LegacySection,
): ProgressSection {
  const legacyContinuityIds = [...section.continuity.legacyIds];
  const progressContinuityGroups = section.continuity.progressGroups.map(
    (group) => [...group],
  );
  const legacySectionIds = [...section.continuity.historicalSectionIds];
  const paragraphs = legacy.paragraphs.map((paragraph) => ({
    paragraphId: paragraph.paragraphId,
    anchor: paragraph.anchor,
    contentHash: paragraph.contentHash,
  }));
  Object.freeze(legacyContinuityIds);
  for (const group of progressContinuityGroups) Object.freeze(group);
  Object.freeze(progressContinuityGroups);
  Object.freeze(legacySectionIds);
  for (const paragraph of paragraphs) Object.freeze(paragraph);
  Object.freeze(paragraphs);
  return Object.freeze({
    sectionId: section.id,
    continuityId: section.continuity.id,
    legacyContinuityIds,
    progressContinuityGroups,
    legacySectionIds,
    contentHash: legacy.contentHash,
    title: legacy.title,
    href: legacy.href,
    chapterHref: legacy.chapterHref,
    readerHref: legacy.readerHref,
    wordCount: legacy.wordCount,
    paragraphs,
  });
}

function projectSection(
  page: PublisherSectionPage,
  section: ReaderSection,
  migration: CoherenceReaderStateMigrationSection,
  legacy: LegacySection,
): CoherencePublisherBookmarkRouteSection | null {
  if (
    migration.workId !== page.work.id ||
    migration.sectionId !== section.id ||
    migration.sectionContinuityId !== section.continuity.id ||
    migration.contentHash !== section.contentHash ||
    section.readerAddress?.path !== migration.href ||
    legacy.sectionId !== section.id ||
    legacy.continuityId !== section.continuity.id ||
    legacy.contentHash !== migration.legacyContentHash ||
    legacy.readerHref !== migration.href ||
    !exactStrings(
      legacy.legacyContinuityIds,
      section.continuity.legacyIds,
    ) ||
    !exactStringGroups(
      legacy.progressContinuityGroups,
      section.continuity.progressGroups,
    ) ||
    !exactStrings(
      legacy.legacySectionIds,
      section.continuity.historicalSectionIds,
    ) ||
    !exactStrings(
      migration.acceptedLegacySectionIds,
      uniqueSorted([
        section.id,
        ...section.continuity.historicalSectionIds,
      ]),
    ) ||
    !exactStrings(
      migration.acceptedLegacyContinuityIds,
      uniqueSorted([
        section.continuity.id,
        ...section.continuity.legacyIds,
        ...section.continuity.progressGroups.flat(),
      ]),
    ) ||
    migration.paragraphs.length !== legacy.paragraphs.length
  ) {
    return null;
  }

  const blockById = uniqueIndex(section.blocks, (block) => block.id);
  if (blockById === null) return null;
  const blockIndexById = new Map(
    section.blocks.map((block, index) => [block.id, index]),
  );

  const claimedBlocks = new Set<string>();
  const claimedLegacyParagraphs = new Set<string>();
  const paragraphs: CoherencePublisherBookmarkParagraphMapping[] = [];
  let previousBlockIndex = -1;
  for (let index = 0; index < migration.paragraphs.length; index += 1) {
    const paragraph = migration.paragraphs[index];
    const legacyParagraph = legacy.paragraphs[index];
    if (paragraph === undefined || legacyParagraph === undefined) return null;
    const block = blockById.get(paragraph.blockId);
    const blockIndex = blockIndexById.get(paragraph.blockId);
    const segment = paragraph.offsetSegments[0];
    if (
      block === undefined ||
      blockIndex === undefined ||
      blockIndex <= previousBlockIndex ||
      segment === undefined ||
      paragraph.offsetSegments.length !== 1 ||
      claimedBlocks.has(paragraph.blockId) ||
      claimedLegacyParagraphs.has(paragraph.legacyParagraphId) ||
      legacyParagraph.paragraphId !== paragraph.legacyParagraphId ||
      legacyParagraph.anchor !== paragraph.legacyParagraphId ||
      legacyParagraph.contentHash !== paragraph.legacyContentHash ||
      block.contentHash !== paragraph.blockContentHash ||
      legacyParagraph.text !== block.text ||
      legacyParagraph.text.length !== paragraph.legacyTextCodeUnits ||
      block.text.length !== paragraph.blockTextCodeUnits ||
      paragraph.legacyTextCodeUnits !== paragraph.blockTextCodeUnits ||
      segment.legacyStart !== 0 ||
      segment.targetStart !== 0 ||
      segment.length !== paragraph.legacyTextCodeUnits ||
      segment.length !== paragraph.blockTextCodeUnits
    ) {
      return null;
    }
    claimedBlocks.add(paragraph.blockId);
    claimedLegacyParagraphs.add(paragraph.legacyParagraphId);
    previousBlockIndex = blockIndex;
    paragraphs.push(Object.freeze({
      legacyParagraphId: paragraph.legacyParagraphId,
      legacyContentHash: paragraph.legacyContentHash,
      blockId: paragraph.blockId,
      blockContentHash: paragraph.blockContentHash,
      offsetSegment: Object.freeze({
        legacyStart: segment.legacyStart,
        targetStart: segment.targetStart,
        length: segment.length,
      }),
    }));
  }

  return Object.freeze({
    fallbackPath: page.path,
    legacySection: projectProgressSection(section, legacy),
    paragraphs: Object.freeze(paragraphs),
    publisherSection: section,
    workId: page.work.id,
  });
}

function serializedBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function createCoherencePublisherBookmarkRouteModel(
  page: PublisherNextPage,
  artifact: CoherenceReaderStateMigrationArtifact,
  legacySections: readonly LegacySection[],
): CoherencePublisherBookmarkRouteModel {
  if (
    page.kind !== "section" ||
    page.publication.id !== artifact.publicationId ||
    page.sections.length === 0 ||
    page.sections.length >
      MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_ROUTE_SECTIONS ||
    page.sections[0] !== page.section
  ) {
    return emptyBookmarkModel;
  }

  const routeById = uniqueIndex(page.sections, (section) => section.id);
  const readerById = uniqueIndex(page.work.sections, (section) => section.id);
  const migrationById = uniqueIndex(
    artifact.sections,
    (section) => section.sectionId,
  );
  const legacyById = uniqueIndex(
    legacySections,
    (section) => section.sectionId,
  );
  if (
    routeById === null ||
    readerById === null ||
    migrationById === null ||
    legacyById === null
  ) {
    return emptyBookmarkModel;
  }

  const sections: CoherencePublisherBookmarkRouteSection[] = [];
  const claimedRouteBlockIds = new Set<string>();
  for (const section of page.sections) {
    if (readerById.get(section.id) !== section) return emptyBookmarkModel;
    for (const block of section.blocks) {
      if (claimedRouteBlockIds.has(block.id)) return emptyBookmarkModel;
      claimedRouteBlockIds.add(block.id);
    }
    const migration = migrationById.get(section.id);
    const legacy = legacyById.get(section.id);
    if (migration === undefined || legacy === undefined) {
      return emptyBookmarkModel;
    }
    const projected = projectSection(page, section, migration, legacy);
    if (projected === null) return emptyBookmarkModel;
    sections.push(projected);
  }

  const model: CoherencePublisherBookmarkRouteModel = Object.freeze({
    sections: Object.freeze(sections),
  });
  return serializedBytes(model) <=
      MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_MODEL_BYTES
    ? model
    : emptyBookmarkModel;
}
