import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";
import type { ReaderSection } from "@genii-foundation/publisher-schema/reader";

import type {
  CoherenceReaderStateMigrationArtifact,
  CoherenceReaderStateMigrationSection,
} from "./reader-state-migration-schema";

export const MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_SECTIONS = 8;
export const MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_PARAGRAPHS = 64;
export const MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_ALIASES = 256;
export const MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_MODEL_BYTES = 65_536;
export const MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_SECTION_IDENTITIES = 5;
export const MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_ROUTE_SECTIONS = 10;
export const MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_ROUTE_PARAGRAPHS = 64;
export const MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_ROUTE_ALIASES = 128;
export const MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_MODEL_BYTES = 32_768;

export type CoherencePublisherLegacyFragmentAlias = Readonly<{
  fragment: string;
  href: string;
}>;

export type CoherencePublisherLegacyFragmentSection = Readonly<{
  aliases: readonly CoherencePublisherLegacyFragmentAlias[];
  bareParagraphAliases: readonly CoherencePublisherLegacyFragmentAlias[];
  sectionId: string;
}>;

// The optional discriminator is emitted only by the trusted server projection.
// Validation detects retained-model truncation and drift, but does not
// authenticate an arbitrary hostile rewrite that removes the discriminator.
export type CoherencePublisherLegacyFragmentModel = Readonly<{
  routeKind?: "work";
  sections: readonly CoherencePublisherLegacyFragmentSection[];
}>;

export type CoherencePublisherLegacyFragmentTarget = Readonly<{
  href: string;
}>;

const emptyFragmentModel: CoherencePublisherLegacyFragmentModel =
  Object.freeze({ sections: Object.freeze([]) });
const LEGACY_CONTENT_HASH = /^[0-9a-f]{16}$/u;
const LEGACY_PARAGRAPH_ID = /^p-h[0-9a-f]{16}(?:-[1-9][0-9]*)?$/u;
const COHERENCE_PUBLISHER_FRAGMENT_WORK_PATH = "/manuscripts/9/";
const COHERENCE_PUBLISHER_FRAGMENT_WORK_SECTION_IDS = Object.freeze([
  "v09-a-note-on-the-register",
  "v09-the-ninth-turn-where-the-eight-have-brought-us",
  "v09-what-a-scale-is",
  "v09-providence-the-device-that-coordinates-the-many",
  "v09-what-the-design-holds-and-what-remains-open",
  "v09-what-the-design-commits-to",
  "v09-what-remains-open",
  "v09-the-invitation-to-test-the-design",
  "v09-closing",
  "v09-providence",
]);

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

function uniqueIndex<Item>(
  items: readonly Item[],
  identity: (item: Item) => string,
): ReadonlyMap<string, Item> | null {
  const result = new Map<string, Item>();
  for (const item of items) {
    const id = identity(item);
    if (result.has(id)) return null;
    result.set(id, item);
  }
  return result;
}

function serializedBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function sectionDestination(section: ReaderSection): string | null {
  const address = section.readerAddress;
  if (address === null) return null;
  if (address.anchor === undefined) {
    return section.domId === null ? address.path : null;
  }
  return section.domId === address.anchor
    ? `${address.path}#${address.anchor}`
    : null;
}

function blockDestination(
  block: ReaderSection["blocks"][number],
  sectionPath: string,
): string | null {
  const address = block.readerAddress;
  return address !== null &&
      address.path === sectionPath &&
      block.domId === address.anchor
    ? `${address.path}#${address.anchor}`
    : null;
}

function projectSection(
  workId: string,
  section: ReaderSection,
  migration: CoherenceReaderStateMigrationSection,
  allowBareParagraphs: boolean,
): CoherencePublisherLegacyFragmentSection | null {
  const destination = sectionDestination(section);
  const expectedSectionIds = uniqueSorted([
    section.id,
    ...section.continuity.historicalSectionIds,
  ]);
  const expectedContinuityIds = uniqueSorted([
    section.continuity.id,
    ...section.continuity.legacyIds,
    ...section.continuity.progressGroups.flat(),
  ]);
  if (
    migration.workId !== workId ||
    migration.sectionId !== section.id ||
    migration.sectionContinuityId !== section.continuity.id ||
    migration.contentHash !== section.contentHash ||
    section.readerAddress?.path !== migration.href ||
    destination === null ||
    !LEGACY_CONTENT_HASH.test(migration.legacyContentHash) ||
    migration.acceptedLegacySectionIds.length >
      MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_SECTION_IDENTITIES ||
    !exactStrings(migration.acceptedLegacySectionIds, expectedSectionIds) ||
    !exactStrings(
      migration.acceptedLegacyContinuityIds,
      expectedContinuityIds,
    )
  ) {
    return null;
  }

  const blockById = uniqueIndex(section.blocks, (block) => block.id);
  if (blockById === null) return null;
  const blockIndexById = new Map(
    section.blocks.map((block, index) => [block.id, index]),
  );
  const paragraphIds = new Set<string>();
  const paragraphTargets: CoherencePublisherLegacyFragmentAlias[] = [];
  let previousBlockIndex = -1;
  for (const paragraph of migration.paragraphs) {
    const block = blockById.get(paragraph.blockId);
    const blockIndex = blockIndexById.get(paragraph.blockId);
    const paragraphDestination = block === undefined
      ? null
      : blockDestination(block, migration.href);
    if (
      block === undefined ||
      blockIndex === undefined ||
      blockIndex < previousBlockIndex ||
      paragraphDestination === null ||
      paragraphIds.has(paragraph.legacyParagraphId) ||
      !LEGACY_PARAGRAPH_ID.test(paragraph.legacyParagraphId) ||
      !LEGACY_CONTENT_HASH.test(paragraph.legacyContentHash) ||
      !paragraph.legacyParagraphId.startsWith(
        `p-h${paragraph.legacyContentHash}`,
      ) ||
      !Number.isSafeInteger(paragraph.legacyTextCodeUnits) ||
      paragraph.legacyTextCodeUnits < 0 ||
      block.contentHash !== paragraph.blockContentHash ||
      block.text.length !== paragraph.blockTextCodeUnits
    ) {
      return null;
    }
    paragraphIds.add(paragraph.legacyParagraphId);
    previousBlockIndex = blockIndex;
    paragraphTargets.push(Object.freeze({
      fragment: paragraph.legacyParagraphId,
      href: paragraphDestination,
    }));
  }

  const aliases: CoherencePublisherLegacyFragmentAlias[] = [];
  for (const legacySectionId of migration.acceptedLegacySectionIds) {
    aliases.push(Object.freeze({
      fragment: legacySectionId,
      href: destination,
    }));
    for (const paragraph of paragraphTargets) {
      aliases.push(Object.freeze({
        fragment: `${legacySectionId}-${paragraph.fragment}`,
        href: paragraph.href,
      }));
    }
  }
  const bareParagraphAliases = allowBareParagraphs
    ? paragraphTargets.map((paragraph) => Object.freeze({ ...paragraph }))
    : [];
  return Object.freeze({
    aliases: Object.freeze(aliases),
    bareParagraphAliases: Object.freeze(bareParagraphAliases),
    sectionId: section.id,
  });
}

function validFragment(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= 1_024 && !value.includes("#");
}

function validDestination(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4_096 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?")
  ) {
    return false;
  }
  const hashIndex = value.indexOf("#");
  return hashIndex < 0 ||
    (hashIndex > 0 &&
      hashIndex === value.lastIndexOf("#") &&
      hashIndex < value.length - 1);
}

function exactAlias(value: unknown): value is CoherencePublisherLegacyFragmentAlias {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  return keys.length === 2 && keys[0] === "fragment" && keys[1] === "href" &&
    validFragment(item.fragment) && validDestination(item.href);
}

export function isCoherencePublisherLegacyFragmentModel(
  value: unknown,
): value is CoherencePublisherLegacyFragmentModel {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const model = value as Record<string, unknown>;
    const modelKeys = Object.keys(model).sort();
    const workModel = model.routeKind === "work";
    if (
      !(workModel
        ? exactStrings(modelKeys, ["routeKind", "sections"])
        : exactStrings(modelKeys, ["sections"])) ||
      !Array.isArray(model.sections) ||
      model.sections.length === 0 ||
      (workModel
        ? model.sections.length !==
          MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_ROUTE_SECTIONS
        : model.sections.length >
          MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_SECTIONS) ||
      serializedBytes(value) > (workModel
        ? MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_MODEL_BYTES
        : MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_MODEL_BYTES)
    ) {
      return false;
    }
    const sectionIds = new Set<string>();
    const fragments = new Map<string, string>();
    let aliasCount = 0;
    for (const [sectionIndex, sectionValue] of model.sections.entries()) {
      if (
        sectionValue === null ||
        typeof sectionValue !== "object" ||
        Array.isArray(sectionValue)
      ) {
        return false;
      }
      const section = sectionValue as Record<string, unknown>;
      const keys = Object.keys(section).sort();
      if (
        keys.length !== 3 ||
        keys[0] !== "aliases" ||
        keys[1] !== "bareParagraphAliases" ||
        keys[2] !== "sectionId" ||
        !validFragment(section.sectionId) ||
        (workModel && section.sectionId !==
          COHERENCE_PUBLISHER_FRAGMENT_WORK_SECTION_IDS[sectionIndex]) ||
        sectionIds.has(section.sectionId) ||
        !Array.isArray(section.aliases) ||
        (workModel && section.aliases.length === 0) ||
        !Array.isArray(section.bareParagraphAliases) ||
        ((workModel || model.sections.length !== 1) &&
          section.bareParagraphAliases.length !== 0)
      ) {
        return false;
      }
      sectionIds.add(section.sectionId);
      const accepted = model.sections.length === 1
        ? [...section.aliases, ...section.bareParagraphAliases]
        : section.aliases;
      aliasCount += accepted.length;
      if (
        aliasCount > (workModel
          ? MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_ROUTE_ALIASES
          : MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_ALIASES) ||
        !accepted.every(exactAlias)
      ) {
        return false;
      }
      for (const alias of accepted) {
        const existingHref = fragments.get(alias.fragment);
        if (existingHref !== undefined && existingHref !== alias.href) {
          return false;
        }
        fragments.set(alias.fragment, alias.href);
      }
    }
    return aliasCount > 0;
  } catch {
    return false;
  }
}

export function createCoherencePublisherLegacyFragmentModel(
  page: PublisherNextPage,
  artifact: CoherenceReaderStateMigrationArtifact,
): CoherencePublisherLegacyFragmentModel {
  if (page.publication.id !== artifact.publicationId) {
    return emptyFragmentModel;
  }

  let allowBareParagraphs: boolean;
  let maximumAliases: number;
  let maximumBytes: number;
  let maximumParagraphs: number;
  let routeSections: readonly ReaderSection[];
  let workRoute = false;
  if (page.kind === "section") {
    if (
      page.sections.length === 0 ||
      page.sections.length >
        MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_SECTIONS ||
      page.sections[0] !== page.section
    ) {
      return emptyFragmentModel;
    }
    allowBareParagraphs = page.sections.length === 1;
    maximumAliases = MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_ALIASES;
    maximumBytes = MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_MODEL_BYTES;
    maximumParagraphs =
      MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_PARAGRAPHS;
    routeSections = page.sections;
  } else if (
    page.kind === "work" &&
    page.path === COHERENCE_PUBLISHER_FRAGMENT_WORK_PATH &&
    page.work.route === COHERENCE_PUBLISHER_FRAGMENT_WORK_PATH &&
    page.work.sections.length ===
      MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_ROUTE_SECTIONS
  ) {
    const workSectionIds = page.work.sections.map((section) => section.id);
    const migrationSectionIds = artifact.sections.flatMap((section) =>
      section.workId === page.work.id ? [section.sectionId] : []
    );
    if (
      !exactStrings(
        workSectionIds,
        COHERENCE_PUBLISHER_FRAGMENT_WORK_SECTION_IDS,
      ) ||
      !exactStrings(workSectionIds, migrationSectionIds)
    ) {
      return emptyFragmentModel;
    }
    allowBareParagraphs = false;
    maximumAliases =
      MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_ROUTE_ALIASES;
    maximumBytes = MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_MODEL_BYTES;
    maximumParagraphs =
      MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_WORK_ROUTE_PARAGRAPHS;
    routeSections = page.work.sections;
    workRoute = true;
  } else {
    return emptyFragmentModel;
  }

  const routeById = uniqueIndex(routeSections, (section) => section.id);
  const readerById = uniqueIndex(page.work.sections, (section) => section.id);
  const migrationById = uniqueIndex(
    artifact.sections,
    (section) => section.sectionId,
  );
  if (routeById === null || readerById === null || migrationById === null) {
    return emptyFragmentModel;
  }

  let paragraphCount = 0;
  let previousSectionIndex = -1;
  const sectionIndexById = new Map(
    page.work.sections.map((section, index) => [section.id, index]),
  );
  const sections: CoherencePublisherLegacyFragmentSection[] = [];
  let aliasCount = 0;
  for (const section of routeSections) {
    const sectionIndex = sectionIndexById.get(section.id);
    const migration = migrationById.get(section.id);
    if (
      sectionIndex === undefined ||
      sectionIndex <= previousSectionIndex ||
      readerById.get(section.id) !== section ||
      migration === undefined
    ) {
      return emptyFragmentModel;
    }
    paragraphCount += migration.paragraphs.length;
    if (
      paragraphCount > maximumParagraphs
    ) {
      return emptyFragmentModel;
    }
    const projected = projectSection(
      page.work.id,
      section,
      migration,
      allowBareParagraphs,
    );
    if (projected === null) return emptyFragmentModel;
    aliasCount += projected.aliases.length +
      projected.bareParagraphAliases.length;
    if (aliasCount > maximumAliases) return emptyFragmentModel;
    sections.push(projected);
    previousSectionIndex = sectionIndex;
  }

  const model: CoherencePublisherLegacyFragmentModel = Object.freeze({
    ...(workRoute ? { routeKind: "work" as const } : {}),
    sections: Object.freeze(sections),
  });
  return serializedBytes(model) <= maximumBytes &&
      isCoherencePublisherLegacyFragmentModel(model)
    ? model
    : emptyFragmentModel;
}

export function resolveCoherencePublisherLegacyFragment(
  fragment: string,
  model: CoherencePublisherLegacyFragmentModel,
): CoherencePublisherLegacyFragmentTarget | null {
  if (!validFragment(fragment)) return null;
  const candidates: string[] = [];
  for (const section of model.sections) {
    for (const alias of section.aliases) {
      if (alias.fragment === fragment) candidates.push(alias.href);
    }
    if (model.sections.length === 1) {
      for (const alias of section.bareParagraphAliases) {
        if (alias.fragment === fragment) candidates.push(alias.href);
      }
    }
  }
  const first = candidates[0];
  return first !== undefined && candidates.every((href) => href === first)
    ? Object.freeze({ href: first })
    : null;
}
