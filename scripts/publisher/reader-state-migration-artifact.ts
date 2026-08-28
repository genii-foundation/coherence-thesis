import {
  canonicalizeJson,
  hashCanonicalJson,
  type WorkContentInput,
} from "@genii-foundation/publisher-content";
import type {
  JSONValue,
  PublicationReaderEnvelope,
} from "@genii-foundation/publisher-schema";
import type {
  CompiledCatalog,
  CompiledParagraph,
} from "../manuscripts/types";
import { stripMarkdown } from "../manuscripts/io";

export const COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION = "1.0";
export const COHERENCE_READER_STATE_MIGRATION_HREF =
  "/publisher/coherence-reader-state-migration.json";
export const MAXIMUM_COHERENCE_STATE_MIGRATION_BYTES = 8_388_608;
export const MAXIMUM_COHERENCE_STATE_MIGRATION_SECTIONS = 10_000;
export const MAXIMUM_COHERENCE_STATE_MIGRATION_PARAGRAPHS = 20_000;

const LEGACY_HASH = /^[0-9a-f]{16}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const ALIGNMENT_LOOKAHEAD = 256;
const ALIGNMENT_ANCHOR_CODE_UNITS = 8;

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

type MutableOffsetSegment = {
  legacyStart: number;
  targetStart: number;
  length: number;
};

function fail(message: string): never {
  throw new TypeError(`Coherence Reader state migration: ${message}`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compareText));
}

function nextAlignment(
  legacyText: string,
  targetText: string,
  legacyStart: number,
  targetStart: number,
): Readonly<{ legacy: number; target: number }> | null {
  let best: { legacy: number; target: number; cost: number } | null = null;
  const legacyLimit = Math.min(
    legacyText.length - ALIGNMENT_ANCHOR_CODE_UNITS,
    legacyStart + ALIGNMENT_LOOKAHEAD,
  );
  const targetLimit = Math.min(
    targetText.length - ALIGNMENT_ANCHOR_CODE_UNITS,
    targetStart + ALIGNMENT_LOOKAHEAD,
  );
  for (let legacy = legacyStart; legacy <= legacyLimit; legacy += 1) {
    const anchor = legacyText.slice(
      legacy,
      legacy + ALIGNMENT_ANCHOR_CODE_UNITS,
    );
    let target = targetText.indexOf(anchor, targetStart);
    while (target >= 0 && target <= targetLimit) {
      const cost = legacy - legacyStart + target - targetStart;
      if (
        best === null ||
        cost < best.cost ||
        (cost === best.cost &&
          (legacy < best.legacy ||
            (legacy === best.legacy && target < best.target)))
      ) {
        best = { legacy, target, cost };
      }
      target = targetText.indexOf(anchor, target + 1);
    }
  }
  return best === null
    ? null
    : Object.freeze({ legacy: best.legacy, target: best.target });
}

function trailingAlignment(
  legacyText: string,
  targetText: string,
  legacyStart: number,
  targetStart: number,
): Readonly<{ legacy: number; target: number }> | null {
  let length = 0;
  while (
    legacyText.length - length - 1 >= legacyStart &&
    targetText.length - length - 1 >= targetStart &&
    legacyText[legacyText.length - length - 1] ===
      targetText[targetText.length - length - 1]
  ) {
    length += 1;
  }
  return length === 0
    ? null
    : Object.freeze({
        legacy: legacyText.length - length,
        target: targetText.length - length,
      });
}

export function createCoherenceReaderStateOffsetSegments(
  legacyText: string,
  targetText: string,
): readonly CoherenceReaderStateMigrationOffsetSegment[] {
  const segments: MutableOffsetSegment[] = [];
  let legacy = 0;
  let target = 0;
  while (legacy < legacyText.length && target < targetText.length) {
    if (legacyText[legacy] !== targetText[target]) {
      const next = nextAlignment(
        legacyText,
        targetText,
        legacy,
        target,
      ) ?? trailingAlignment(legacyText, targetText, legacy, target);
      if (next === null) break;
      legacy = next.legacy;
      target = next.target;
    }
    const legacyStart = legacy;
    const targetStart = target;
    while (
      legacy < legacyText.length &&
      target < targetText.length &&
      legacyText[legacy] === targetText[target]
    ) {
      legacy += 1;
      target += 1;
    }
    if (legacy > legacyStart) {
      segments.push({
        legacyStart,
        targetStart,
        length: legacy - legacyStart,
      });
    }
  }
  return Object.freeze(
    segments.map((segment) => Object.freeze({ ...segment })),
  );
}

function paragraphSegments(
  paragraphStart: number,
  paragraphLength: number,
  blockSegments: readonly CoherenceReaderStateMigrationOffsetSegment[],
): readonly CoherenceReaderStateMigrationOffsetSegment[] {
  const paragraphEnd = paragraphStart + paragraphLength;
  const result: CoherenceReaderStateMigrationOffsetSegment[] = [];
  for (const segment of blockSegments) {
    const segmentEnd = segment.legacyStart + segment.length;
    const start = Math.max(paragraphStart, segment.legacyStart);
    const end = Math.min(paragraphEnd, segmentEnd);
    if (end <= start) continue;
    result.push(Object.freeze({
      legacyStart: start - paragraphStart,
      targetStart: segment.targetStart + start - segment.legacyStart,
      length: end - start,
    }));
  }
  return Object.freeze(result);
}

function indexUnique<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  label: string,
): ReadonlyMap<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    if (result.has(key)) fail(`${label} '${key}' is duplicated.`);
    result.set(key, value);
  }
  return result;
}

function mapParagraphs(
  catalogParagraphs: readonly CompiledParagraph[],
  sourceBlocks: WorkContentInput["sections"][number]["blocks"],
  readerBlocks: PublicationReaderEnvelope["works"][number]["sections"][number]["blocks"],
  sectionId: string,
): readonly CoherenceReaderStateMigrationParagraph[] {
  const readerById = indexUnique(readerBlocks, ({ id }) => id, "Reader block");
  const blockAlignments = new Map<
    string,
    Readonly<{
      legacyText: string;
      targetText: string;
      segments: readonly CoherenceReaderStateMigrationOffsetSegment[];
    }>
  >();
  const result: CoherenceReaderStateMigrationParagraph[] = [];
  let sourceIndex = 0;
  let sourceOffset = 0;
  for (const paragraph of catalogParagraphs) {
    if (!LEGACY_HASH.test(paragraph.contentHash)) {
      fail(`section '${sectionId}' has an invalid legacy paragraph hash.`);
    }
    let matched:
      | Readonly<{
          sourceBlock: (typeof sourceBlocks)[number];
          legacyText: string;
          paragraphStart: number;
        }>
      | undefined;
    for (let index = sourceIndex; index < sourceBlocks.length; index += 1) {
      const sourceBlock = sourceBlocks[index];
      if (sourceBlock === undefined) continue;
      const legacyText = stripMarkdown(sourceBlock.markdown);
      const start = legacyText.indexOf(
        paragraph.text,
        index === sourceIndex ? sourceOffset : 0,
      );
      if (start < 0 && !(paragraph.text.length === 0 && legacyText.length === 0)) {
        continue;
      }
      matched = Object.freeze({
        sourceBlock,
        legacyText,
        paragraphStart: Math.max(0, start),
      });
      sourceIndex = index;
      sourceOffset = Math.max(0, start) + paragraph.text.length;
      if (sourceOffset >= legacyText.length || paragraph.text.length === 0) {
        sourceIndex += 1;
        sourceOffset = 0;
      }
      break;
    }
    if (matched === undefined) {
      fail(`section '${sectionId}' paragraph '${paragraph.paragraphId}' did not map to one source block.`);
    }
    const readerBlock = readerById.get(matched.sourceBlock.id);
    if (readerBlock === undefined || !SHA256.test(readerBlock.contentHash)) {
      fail(`section '${sectionId}' paragraph '${paragraph.paragraphId}' did not map to one Reader block.`);
    }
    let alignment = blockAlignments.get(readerBlock.id);
    if (alignment === undefined) {
      alignment = Object.freeze({
        legacyText: matched.legacyText,
        targetText: readerBlock.text,
        segments: createCoherenceReaderStateOffsetSegments(
          matched.legacyText,
          readerBlock.text,
        ),
      });
      blockAlignments.set(readerBlock.id, alignment);
    } else if (alignment.legacyText !== matched.legacyText) {
      fail(`Reader block '${readerBlock.id}' received inconsistent legacy text.`);
    }
    result.push(Object.freeze({
      legacyParagraphId: paragraph.paragraphId,
      legacyContentHash: paragraph.contentHash,
      legacyTextCodeUnits: paragraph.text.length,
      blockId: readerBlock.id,
      blockContentHash: readerBlock.contentHash,
      blockTextCodeUnits: readerBlock.text.length,
      offsetSegments: paragraphSegments(
        matched.paragraphStart,
        paragraph.text.length,
        alignment.segments,
      ),
    }));
  }
  return Object.freeze(result);
}

export function createCoherenceReaderStateMigrationArtifact(input: Readonly<{
  catalog: CompiledCatalog;
  workInputs: readonly WorkContentInput[];
  reader: PublicationReaderEnvelope;
}>): CoherenceReaderStateMigrationArtifact {
  if (
    input.catalog.sections.length > MAXIMUM_COHERENCE_STATE_MIGRATION_SECTIONS
  ) {
    fail("section count exceeds the artifact limit.");
  }
  const sourceSections = indexUnique(
    input.workInputs.flatMap((work) =>
      work.sections.map((section) => Object.freeze({ workId: work.workId, section })),
    ),
    ({ section }) => section.id,
    "source section",
  );
  const readerSections = indexUnique(
    input.reader.works.flatMap((work) =>
      work.sections.map((section) => Object.freeze({ workId: work.id, section })),
    ),
    ({ section }) => section.id,
    "Reader section",
  );
  if (
    sourceSections.size !== input.catalog.sections.length ||
    readerSections.size !== input.catalog.sections.length
  ) {
    fail("catalog, source, and Reader section censuses differ.");
  }
  let paragraphCount = 0;
  const sections = input.catalog.sections.map((catalogSection) => {
    paragraphCount += catalogSection.paragraphs.length;
    if (paragraphCount > MAXIMUM_COHERENCE_STATE_MIGRATION_PARAGRAPHS) {
      fail("paragraph count exceeds the artifact limit.");
    }
    if (!LEGACY_HASH.test(catalogSection.contentHash)) {
      fail(`section '${catalogSection.sectionId}' has an invalid legacy content hash.`);
    }
    const source = sourceSections.get(catalogSection.sectionId);
    const target = readerSections.get(catalogSection.sectionId);
    if (
      source === undefined ||
      target === undefined ||
      source.workId !== target.workId ||
      target.section.readerAddress === null ||
      target.section.contentHash === undefined ||
      !SHA256.test(target.section.contentHash)
    ) {
      fail(`section '${catalogSection.sectionId}' has no exact current Reader owner.`);
    }
    const continuity = target.section.continuity;
    return Object.freeze({
      workId: target.workId,
      sectionId: target.section.id,
      sectionContinuityId: continuity.id,
      acceptedLegacySectionIds: uniqueSorted([
        target.section.id,
        ...continuity.historicalSectionIds,
        ...catalogSection.legacySectionIds,
      ]),
      acceptedLegacyContinuityIds: uniqueSorted([
        continuity.id,
        ...continuity.legacyIds,
        ...continuity.progressGroups.flat(),
        catalogSection.continuityId,
        ...catalogSection.legacyContinuityIds,
        ...catalogSection.progressContinuityGroups.flat(),
      ]),
      href: target.section.readerAddress.path,
      legacyContentHash: catalogSection.contentHash,
      contentHash: target.section.contentHash,
      paragraphs: mapParagraphs(
        catalogSection.paragraphs,
        source.section.blocks,
        target.section.blocks,
        catalogSection.sectionId,
      ),
    });
  });
  const basis = Object.freeze({
    schemaVersion: COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION,
    publicationId: input.reader.publicationId,
    readerBuildId: input.reader.buildId,
    href: COHERENCE_READER_STATE_MIGRATION_HREF,
    legacyProgressStorageKeys: Object.freeze([
      "coherence-reader-progress-v2",
      "coherence-reader-progress-v1",
    ] as const),
    legacyBookmarksStorageKeys: Object.freeze([
      "coherence-reader-bookmarks-v2",
      "coherence-reader-bookmarks-v1",
    ] as const),
    sections: Object.freeze(sections),
  });
  const artifact = Object.freeze({
    ...basis,
    buildId: hashCanonicalJson(basis as unknown as JSONValue),
  });
  const bytes = Buffer.byteLength(
    canonicalizeJson(artifact as unknown as JSONValue),
    "utf8",
  );
  if (bytes > MAXIMUM_COHERENCE_STATE_MIGRATION_BYTES) {
    fail("serialized artifact exceeds the byte limit.");
  }
  return artifact;
}
