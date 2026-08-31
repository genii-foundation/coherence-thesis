import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";

import type {
  CoherenceReaderStateMigrationArtifact,
  CoherenceReaderStateMigrationSection,
} from "./reader-state-migration-schema";

export const MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_SECTIONS = 8;
export const MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_PARAGRAPHS = 64;
export const MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_MODEL_BYTES = 8_192;
export const MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_WORK_ROUTE_SECTIONS = 10;
export const MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_WORK_ROUTE_PARAGRAPHS = 64;
export const MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_WORK_MODEL_BYTES = 9_216;

const COHERENCE_PUBLISHER_PROGRESS_WORK_PATH = "/manuscripts/9/";

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

type ProgressRoute = Readonly<{
  maximumBytes: number;
  maximumParagraphs: number;
  maximumSections: number;
  sections: readonly PublisherSection[];
  workId: string;
}>;

function progressRoute(page: PublisherNextPage): ProgressRoute | null {
  if (page.kind === "section") {
    if (
      page.sections.length === 0 ||
      page.sections.length >
        MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_SECTIONS ||
      page.sections[0]?.id !== page.section.id ||
      new Set(page.sections.map(({ id }) => id)).size !== page.sections.length
    ) {
      return null;
    }
    return Object.freeze({
      maximumBytes: MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_MODEL_BYTES,
      maximumParagraphs:
        MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_PARAGRAPHS,
      maximumSections: MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_ROUTE_SECTIONS,
      sections: page.sections,
      workId: page.work.id,
    });
  }

  if (
    page.kind !== "work" ||
    page.path !== COHERENCE_PUBLISHER_PROGRESS_WORK_PATH ||
    page.work.route !== COHERENCE_PUBLISHER_PROGRESS_WORK_PATH ||
    page.work.sections.length !==
      MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_WORK_ROUTE_SECTIONS ||
    new Set(page.work.sections.map(({ id }) => id)).size !==
      page.work.sections.length
  ) {
    return null;
  }
  return Object.freeze({
    maximumBytes: MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_WORK_MODEL_BYTES,
    maximumParagraphs:
      MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_WORK_ROUTE_PARAGRAPHS,
    maximumSections:
      MAXIMUM_COHERENCE_PUBLISHER_PROGRESS_WORK_ROUTE_SECTIONS,
    sections: page.work.sections,
    workId: page.work.id,
  });
}

export function createCoherencePublisherLegacyProgressModel(
  page: PublisherNextPage,
  artifact: CoherenceReaderStateMigrationArtifact,
): CoherencePublisherLegacyProgressModel {
  const route = progressRoute(page);
  if (route === null || page.publication.id !== artifact.publicationId) {
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
  for (const section of route.sections) {
    const migration = migrationBySectionId.get(section.id);
    if (migration === undefined) return emptyProgressModel;
    paragraphCount += migration.paragraphs.length;
    if (paragraphCount > route.maximumParagraphs) {
      return emptyProgressModel;
    }
    const projected = progressSection(route.workId, section, migration);
    if (projected === null) return emptyProgressModel;
    sections.push(projected);
  }

  const model: CoherencePublisherLegacyProgressModel = Object.freeze({
    sections: Object.freeze(sections),
  });
  return sections.length <= route.maximumSections &&
      serializedBytes(model) <= route.maximumBytes
    ? model
    : emptyProgressModel;
}
