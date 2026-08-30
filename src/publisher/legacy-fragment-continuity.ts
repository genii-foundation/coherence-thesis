import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";

import type {
  CoherenceReaderStateMigrationArtifact,
  CoherenceReaderStateMigrationSection,
} from "./reader-state-migration-schema";

export type CoherencePublisherLegacyFragmentParagraph = Readonly<{
  blockId: string;
  legacyParagraphId: string;
}>;

export type CoherencePublisherLegacyFragmentSection = Readonly<{
  href: string;
  legacySectionIds: readonly string[];
  paragraphs: readonly CoherencePublisherLegacyFragmentParagraph[];
  sectionId: string;
}>;

export type CoherencePublisherLegacyFragmentModel = Readonly<{
  sections: readonly CoherencePublisherLegacyFragmentSection[];
}>;

export type CoherencePublisherLegacyFragmentTarget = Readonly<{
  blockId?: string;
  href: string;
  sectionId: string;
}>;

const emptyFragmentModel: CoherencePublisherLegacyFragmentModel =
  Object.freeze({ sections: Object.freeze([]) });

type PublisherSection = Extract<
  PublisherNextPage,
  { readonly kind: "section" }
>["section"];

function fragmentSection(
  workId: string,
  section: PublisherSection,
  migration: CoherenceReaderStateMigrationSection,
): CoherencePublisherLegacyFragmentSection | null {
  if (
    migration.workId !== workId ||
    migration.sectionId !== section.id ||
    migration.sectionContinuityId !== section.continuity.id ||
    migration.contentHash !== section.contentHash ||
    section.readerAddress?.path !== migration.href
  ) {
    return null;
  }

  const blockById = new Map(section.blocks.map((block) => [block.id, block]));
  const paragraphs = migration.paragraphs.flatMap((paragraph) => {
    const block = blockById.get(paragraph.blockId);
    if (
      block === undefined ||
      block.contentHash !== paragraph.blockContentHash ||
      block.text.length !== paragraph.blockTextCodeUnits
    ) {
      return [];
    }
    return [
      Object.freeze({
        blockId: paragraph.blockId,
        legacyParagraphId: paragraph.legacyParagraphId,
      }),
    ];
  });

  return Object.freeze({
    href: migration.href,
    legacySectionIds: Object.freeze([
      ...new Set([section.id, ...migration.acceptedLegacySectionIds]),
    ]),
    paragraphs: Object.freeze(paragraphs),
    sectionId: section.id,
  });
}

export function createCoherencePublisherLegacyFragmentModel(
  page: PublisherNextPage,
  artifact: CoherenceReaderStateMigrationArtifact,
): CoherencePublisherLegacyFragmentModel {
  let sections: readonly PublisherSection[];
  let workId: string;
  if (page.kind === "work") {
    sections = page.work.sections;
    workId = page.work.id;
  } else if (page.kind === "section") {
    sections = page.sections;
    workId = page.work.id;
  } else {
    return emptyFragmentModel;
  }
  if (page.publication.id !== artifact.publicationId) {
    return emptyFragmentModel;
  }

  const migrationBySectionId = new Map(
    artifact.sections.map((section) => [section.sectionId, section]),
  );
  const fragmentSections = sections.flatMap((section) => {
    const migration = migrationBySectionId.get(section.id);
    if (migration === undefined) return [];
    const resolved = fragmentSection(workId, section, migration);
    return resolved === null ? [] : [resolved];
  });

  if (
    page.kind === "section" &&
    (
      sections.length === 0 ||
      sections[0]?.id !== page.section.id ||
      new Set(sections.map(({ id }) => id)).size !== sections.length ||
      fragmentSections.length !== sections.length
    )
  ) {
    return emptyFragmentModel;
  }

  return Object.freeze({ sections: Object.freeze(fragmentSections) });
}

function sameTarget(
  left: CoherencePublisherLegacyFragmentTarget,
  right: CoherencePublisherLegacyFragmentTarget,
): boolean {
  return left.href === right.href &&
    left.sectionId === right.sectionId &&
    left.blockId === right.blockId;
}

function uniqueTarget(
  candidates: readonly CoherencePublisherLegacyFragmentTarget[],
): CoherencePublisherLegacyFragmentTarget | null {
  const first = candidates[0];
  if (first === undefined) return null;
  return candidates.every((candidate) => sameTarget(candidate, first))
    ? first
    : null;
}

export function resolveCoherencePublisherLegacyFragment(
  fragment: string,
  model: CoherencePublisherLegacyFragmentModel,
): CoherencePublisherLegacyFragmentTarget | null {
  if (fragment.length === 0) return null;
  const candidates: CoherencePublisherLegacyFragmentTarget[] = [];

  for (const section of model.sections) {
    for (const legacySectionId of section.legacySectionIds) {
      if (fragment === legacySectionId) {
        candidates.push(Object.freeze({
          href: section.href,
          sectionId: section.sectionId,
        }));
      }
      for (const paragraph of section.paragraphs) {
        if (fragment === `${legacySectionId}-${paragraph.legacyParagraphId}`) {
          candidates.push(Object.freeze({
            blockId: paragraph.blockId,
            href: section.href,
            sectionId: section.sectionId,
          }));
        }
      }
    }
    for (const paragraph of section.paragraphs) {
      if (fragment === paragraph.legacyParagraphId) {
        candidates.push(Object.freeze({
          blockId: paragraph.blockId,
          href: section.href,
          sectionId: section.sectionId,
        }));
      }
    }
  }

  return uniqueTarget(candidates);
}
