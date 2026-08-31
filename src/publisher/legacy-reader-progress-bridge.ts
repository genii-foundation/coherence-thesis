import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";

import type {
  CoherenceReaderStateMigrationArtifact,
  CoherenceReaderStateMigrationSection,
} from "./reader-state-migration-schema";

export const MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_SECTIONS = 8;
export const MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_PARAGRAPHS = 64;
export const MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_MODEL_BYTES = 8_192;

export type CoherencePublisherLegacyProgressParagraph = Readonly<{
  anchor: string;
  contentHash: string;
  paragraphId: string;
}>;

export type CoherencePublisherLegacyProgressSection = Readonly<{
  sectionId: string;
  continuityId: string;
  legacyContinuityIds: string[];
  progressContinuityGroups: string[][];
  legacySectionIds: string[];
  contentHash: string;
  paragraphs: CoherencePublisherLegacyProgressParagraph[];
}>;

export type CoherencePublisherLegacyProgressModel = Readonly<{
  sections: readonly CoherencePublisherLegacyProgressSection[];
}>;

const LEGACY_CONTENT_HASH = /^[0-9a-f]{16}$/u;
const emptyProgressModel: CoherencePublisherLegacyProgressModel =
  Object.freeze({ sections: Object.freeze([]) });

type PublisherSection = Extract<
  PublisherNextPage,
  { readonly kind: "section" }
>["section"];

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

function progressSection(
  workId: string,
  section: PublisherSection,
  migration: CoherenceReaderStateMigrationSection,
): CoherencePublisherLegacyProgressSection | null {
  if (
    migration.workId !== workId ||
    migration.sectionId !== section.id ||
    migration.sectionContinuityId !== section.continuity.id ||
    migration.contentHash !== section.contentHash ||
    section.readerAddress?.path !== migration.href ||
    !LEGACY_CONTENT_HASH.test(migration.legacyContentHash) ||
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
    )
  ) {
    return null;
  }

  const blockById = new Map(section.blocks.map((block) => [block.id, block]));
  const paragraphIds = new Set<string>();
  const paragraphs: CoherencePublisherLegacyProgressParagraph[] = [];
  for (const paragraph of migration.paragraphs) {
    const block = blockById.get(paragraph.blockId);
    if (
      paragraphIds.has(paragraph.legacyParagraphId) ||
      !LEGACY_CONTENT_HASH.test(paragraph.legacyContentHash) ||
      block === undefined ||
      block.contentHash !== paragraph.blockContentHash ||
      block.text.length !== paragraph.blockTextCodeUnits
    ) {
      return null;
    }
    paragraphIds.add(paragraph.legacyParagraphId);
    paragraphs.push(Object.freeze({
      anchor: paragraph.legacyParagraphId,
      contentHash: paragraph.legacyContentHash,
      paragraphId: paragraph.legacyParagraphId,
    }));
  }

  return Object.freeze({
    sectionId: section.id,
    continuityId: section.continuity.id,
    legacyContinuityIds: [...section.continuity.legacyIds],
    progressContinuityGroups: section.continuity.progressGroups.map((group) => [
      ...group,
    ]),
    legacySectionIds: [...section.continuity.historicalSectionIds],
    contentHash: migration.legacyContentHash,
    paragraphs,
  });
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function createCoherencePublisherLegacyProgressModel(
  page: PublisherNextPage,
  artifact: CoherenceReaderStateMigrationArtifact,
): CoherencePublisherLegacyProgressModel {
  if (
    page.kind !== "section" ||
    page.publication.id !== artifact.publicationId ||
    page.sections.length === 0 ||
    page.sections.length >
      MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_SECTIONS ||
    page.sections[0]?.id !== page.section.id ||
    new Set(page.sections.map(({ id }) => id)).size !== page.sections.length
  ) {
    return emptyProgressModel;
  }

  const migrationBySectionId = new Map<
    string,
    CoherenceReaderStateMigrationSection
  >();
  for (const migration of artifact.sections) {
    if (migrationBySectionId.has(migration.sectionId)) {
      return emptyProgressModel;
    }
    migrationBySectionId.set(migration.sectionId, migration);
  }

  const sections: CoherencePublisherLegacyProgressSection[] = [];
  let paragraphCount = 0;
  for (const section of page.sections) {
    const migration = migrationBySectionId.get(section.id);
    if (migration === undefined) return emptyProgressModel;
    paragraphCount += migration.paragraphs.length;
    if (
      paragraphCount >
        MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_PARAGRAPHS
    ) {
      return emptyProgressModel;
    }
    const projected = progressSection(page.work.id, section, migration);
    if (projected === null) return emptyProgressModel;
    sections.push(projected);
  }

  const model: CoherencePublisherLegacyProgressModel = Object.freeze({
    sections: Object.freeze(sections),
  });
  return serializedBytes(model) <=
      MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_MODEL_BYTES
    ? model
    : emptyProgressModel;
}
