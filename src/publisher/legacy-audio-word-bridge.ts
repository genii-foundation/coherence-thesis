import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import {
  canonicalizeJson,
  hashCanonicalJson,
} from "@genii-foundation/publisher-content";
import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";
import {
  createReaderNarrationSectionTextProfile,
  createReaderNarrationWordRanges,
} from "@genii-foundation/publisher-reader/narration";
import type {
  JSONValue,
  PublicationReaderEnvelope,
  ReaderSection,
} from "@genii-foundation/publisher-schema";

import { textForAudio } from "@/lib/audio-text";
import {
  COHERENCE_PUBLISHER_AUDIO_WORD_AUTHORITY_SCHEMA_VERSION,
  COHERENCE_PUBLISHER_AUDIO_WORD_ROUTE_MODEL_SCHEMA_VERSION,
  coherencePublisherAudioWordRouteLimits,
  emptyCoherencePublisherAudioWordRouteModel,
  type CoherencePublisherAudioWordRouteModel,
  type CoherencePublisherAudioWordRouteSection,
} from "@/publisher/legacy-audio-word-bridge-contract";
import type {
  CoherenceReaderStateMigrationArtifact,
  CoherenceReaderStateMigrationParagraph,
} from "@/publisher/reader-state-migration-schema";

const EXPECTED_PUBLICATION_ID = "coherence-thesis";
const EXPECTED_READER_SECTION_COUNT = 525;
const EXPECTED_SAFE_SECTION_COUNT = 122;
const EXPECTED_SAFE_TITLE_WORD_COUNT = 493;
const EXPECTED_SAFE_BODY_WORD_COUNT = 30_975;
const EXPECTED_SAFE_TIMING_WORD_COUNT = 31_468;
const EXPECTED_BINDING_RECORD_BYTES = 1_696_419;
const EXPECTED_SAFE_SECTION_IDS_SHA256 =
  "sha256:4aa80d0705d8bc974c6d78347a15c1796a2d527e752eb97aeee35ec29eeb40be";
export const COHERENCE_PUBLISHER_NARRATION_WORD_BINDING_RECORD_V1_SHA256 =
  "sha256:1aa0a411af0cbd24706107050d64ee453c287fd3b7a36839939d45c6e7acdbeb";
export const COHERENCE_PUBLISHER_NARRATION_WORD_TEXT_MAPPING_AUTHORITY_V1_BUILD_ID =
  "sha256:442c85bb5ddb33c68450a1ca2d03721ac69ec6ec8e7696987289d0be0d805326";

export type CoherencePublisherNarrationWordBindingRecordEntryV1 = readonly [
  sectionId: string,
  bodyWordIndex: number,
  legacyBodyCharStart: number,
  legacyBodyCharEnd: number,
  wordText: string,
];

export type CoherencePublisherNarrationWordBindingRecordV1 =
  readonly CoherencePublisherNarrationWordBindingRecordEntryV1[];

export type CoherencePublisherAudioWordAuthorityRange = Readonly<{
  legacyCharEnd: number;
  legacyCharStart: number;
  publisherCharEnd: number;
  publisherCharStart: number;
}>;

export type CoherencePublisherAudioWordAuthoritySection = Readonly<{
  audioVersionId: string;
  bodyStartCharacter: number;
  bodyWordCount: number;
  legacyContentHash: string;
  profileText: string;
  publisherContentHash: string;
  sectionId: string;
  titleWordCount: number;
  workId: string;
}>;

export type CoherencePublisherAudioWordAuthority = Readonly<{
  bindingRecordSha256: string;
  buildId: string;
  kind: "coherence-publisher-narration-word-text-mapping-authority";
  migrationBuildId: string;
  publicationId: string;
  readerBuildId: string;
  safeSectionIdsSha256: string;
  schemaVersion: typeof COHERENCE_PUBLISHER_AUDIO_WORD_AUTHORITY_SCHEMA_VERSION;
  sections: readonly CoherencePublisherAudioWordAuthoritySection[];
  statistics: Readonly<{
    bodyWordCount: number;
    narrationWordCount: number;
    sectionCount: number;
    titleWordCount: number;
  }>;
}>;

type LegacyNarrationParagraph = Readonly<{
  anchor: string;
  contentHash: string;
  order: number;
  paragraphId: string;
  text: string;
}>;

type LegacyNarrationSection = Readonly<{
  audioVersionId: string;
  contentHash: string;
  paragraphs: readonly LegacyNarrationParagraph[];
  sectionId: string;
  text: string;
  title: string;
}>;

type LegacyNarrationCatalog = Readonly<{
  sections: readonly LegacyNarrationSection[];
}>;

type LegacyNarrationClip = Readonly<{
  audioVersionId: string;
  sectionId: string;
}>;

type LegacyNarrationAudioManifest = Readonly<{
  clips: readonly LegacyNarrationClip[];
}>;

type JsonRecord = Record<string, unknown>;
const verifiedTextMappingAuthorities = new WeakSet<object>();

function fail(message: string): never {
  throw new TypeError(`Coherence Publisher audio word authority: ${message}`);
}

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function requiredString(
  value: unknown,
  label: string,
  maximum = 8_192,
): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    fail(`${label} must be a bounded nonempty string.`);
  }
  return value;
}

function boundedString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.length > maximum) {
    fail(`${label} must be a bounded string.`);
  }
  return value;
}

function requiredInteger(
  value: unknown,
  label: string,
  maximum = 16_777_216,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    fail(`${label} must be a bounded nonnegative integer.`);
  }
  return value;
}

function parseLegacyParagraph(
  value: unknown,
  sectionId: string,
  index: number,
): LegacyNarrationParagraph {
  const item = record(value);
  if (item === null) fail(`${sectionId} paragraph ${index} is not an object.`);
  return Object.freeze({
    anchor: requiredString(item.anchor, `${sectionId} paragraph anchor`, 512),
    contentHash: requiredString(
      item.contentHash,
      `${sectionId} paragraph content hash`,
      128,
    ),
    order: requiredInteger(item.order, `${sectionId} paragraph order`, 100_000),
    paragraphId: requiredString(
      item.paragraphId,
      `${sectionId} paragraph ID`,
      512,
    ),
    text: boundedString(item.text, `${sectionId} paragraph text`, 1_000_000),
  });
}

export function parseCoherencePublisherLegacyNarrationCatalog(
  value: unknown,
): LegacyNarrationCatalog {
  const catalog = record(value);
  if (catalog === null || !Array.isArray(catalog.sections)) {
    fail("legacy catalog sections are missing.");
  }
  if (catalog.sections.length !== EXPECTED_READER_SECTION_COUNT) {
    fail("legacy catalog section count drifted.");
  }
  const sectionIds = new Set<string>();
  const sections = catalog.sections.map((candidate, sectionIndex) => {
    const item = record(candidate);
    if (item === null) fail(`legacy section ${sectionIndex} is not an object.`);
    const sectionId = requiredString(
      item.sectionId,
      `legacy section ${sectionIndex} ID`,
      512,
    );
    if (sectionIds.has(sectionId)) fail(`legacy section ${sectionId} is duplicated.`);
    sectionIds.add(sectionId);
    if (!Array.isArray(item.paragraphs) || item.paragraphs.length > 20_000) {
      fail(`${sectionId} paragraphs are invalid.`);
    }
    const paragraphs = Object.freeze(
      item.paragraphs.map((paragraph, index) =>
        parseLegacyParagraph(paragraph, sectionId, index)
      ),
    );
    const paragraphIds = new Set<string>();
    let priorOrder = 0;
    for (const paragraph of paragraphs) {
      if (
        paragraphIds.has(paragraph.paragraphId) ||
        paragraphIds.has(paragraph.anchor)
      ) {
        fail(`${sectionId} paragraph identity is duplicated.`);
      }
      if (paragraph.order <= priorOrder) {
        fail(`${sectionId} paragraph order is not strictly increasing.`);
      }
      paragraphIds.add(paragraph.paragraphId);
      paragraphIds.add(paragraph.anchor);
      priorOrder = paragraph.order;
    }
    const text = requiredString(item.text, `${sectionId} text`, 16_777_216);
    if (
      paragraphs
          .map(({ text: paragraphText }) => paragraphText)
          .filter((paragraphText) => paragraphText.length > 0)
          .join(" ") !== text
    ) {
      fail(`${sectionId} paragraph text does not reconstruct section text.`);
    }
    return Object.freeze({
      audioVersionId: requiredString(
        item.audioVersionId,
        `${sectionId} audio version`,
        512,
      ),
      contentHash: requiredString(
        item.contentHash,
        `${sectionId} content hash`,
        128,
      ),
      paragraphs,
      sectionId,
      text,
      title: requiredString(item.title, `${sectionId} title`, 4_096),
    });
  });
  return Object.freeze({ sections: Object.freeze(sections) });
}

export function parseCoherencePublisherLegacyNarrationAudioManifest(
  value: unknown,
): LegacyNarrationAudioManifest {
  const manifest = record(value);
  if (
    manifest === null ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.voices) ||
    manifest.voices.length !== 1
  ) {
    fail("legacy audio manifest must contain one version 1 voice.");
  }
  const voice = record(manifest.voices[0]);
  if (voice === null || !Array.isArray(voice.sections)) {
    fail("legacy audio voice sections are missing.");
  }
  if (voice.sections.length !== EXPECTED_READER_SECTION_COUNT) {
    fail("legacy audio clip count drifted.");
  }
  const sectionIds = new Set<string>();
  const clips = voice.sections.map((candidate, index) => {
    const clip = record(candidate);
    if (clip === null) fail(`legacy audio clip ${index} is not an object.`);
    const sectionId = requiredString(
      clip.sectionId,
      `legacy audio clip ${index} section ID`,
      512,
    );
    if (sectionIds.has(sectionId)) fail(`legacy audio clip ${sectionId} is duplicated.`);
    sectionIds.add(sectionId);
    return Object.freeze({
      audioVersionId: requiredString(
        clip.audioVersionId,
        `${sectionId} audio version`,
        512,
      ),
      sectionId,
    });
  });
  return Object.freeze({ clips: Object.freeze(clips) });
}

function legacyParagraphOffsets(
  section: LegacyNarrationSection,
): ReadonlyMap<string, Readonly<{ paragraph: LegacyNarrationParagraph; start: number }>> {
  const offsets = new Map<
    string,
    Readonly<{ paragraph: LegacyNarrationParagraph; start: number }>
  >();
  let start = 0;
  let hasPriorText = false;
  for (const paragraph of section.paragraphs) {
    if (paragraph.text.length > 0 && hasPriorText) start += 1;
    const value = Object.freeze({ paragraph, start });
    for (const key of new Set([paragraph.paragraphId, paragraph.anchor])) {
      if (offsets.has(key)) fail(`${section.sectionId} paragraph key is ambiguous.`);
      offsets.set(key, value);
    }
    start += paragraph.text.length;
    if (paragraph.text.length > 0) hasPriorText = true;
  }
  if (start !== section.text.length) {
    fail(`${section.sectionId} paragraph offsets do not close.`);
  }
  return offsets;
}

function migrationParagraphsByBlock(
  sectionId: string,
  paragraphs: readonly CoherenceReaderStateMigrationParagraph[],
): ReadonlyMap<string, CoherenceReaderStateMigrationParagraph> {
  const byBlock = new Map<string, CoherenceReaderStateMigrationParagraph>();
  for (const paragraph of paragraphs) {
    if (byBlock.has(paragraph.blockId)) {
      fail(`${sectionId} migration block is duplicated.`);
    }
    byBlock.set(paragraph.blockId, paragraph);
  }
  return byBlock;
}

function narrationBodyBlocks(section: ReaderSection): readonly ReaderSection["blocks"][number][] {
  const first = section.blocks[0];
  return first?.kind === "heading" && first.text === section.title
    ? section.blocks.slice(1)
    : section.blocks;
}

function legacyParagraphWholeWordIndex(
  section: LegacyNarrationSection,
): ReadonlyMap<string, number> {
  const words = new Map<string, number>();
  for (const paragraph of section.paragraphs) {
    for (const range of createReaderNarrationWordRanges(paragraph.text)) {
      const key = `${paragraph.paragraphId}:${range.charStart}:${range.charEnd}`;
      words.set(key, (words.get(key) ?? 0) + 1);
    }
  }
  return words;
}

function createAuthoritySection(input: Readonly<{
  audioVersionId: string;
  legacy: LegacyNarrationSection;
  migration: CoherenceReaderStateMigrationArtifact["sections"][number];
  publisher: ReaderSection;
  workId: string;
}>): Readonly<{
  bindingRecord: CoherencePublisherNarrationWordBindingRecordV1;
  section: CoherencePublisherAudioWordAuthoritySection;
}> {
  const { legacy, migration, publisher } = input;
  if (
    migration.sectionId !== publisher.id ||
    migration.workId !== input.workId ||
    migration.sectionContinuityId !== publisher.continuity.id ||
    migration.contentHash !== publisher.contentHash ||
    migration.legacyContentHash !== legacy.contentHash ||
    publisher.readerAddress?.path !== migration.href ||
    input.audioVersionId !== legacy.audioVersionId
  ) {
    fail(`${publisher.id} section identity drifted.`);
  }

  const profile = createReaderNarrationSectionTextProfile(publisher);
  if (profile.text !== textForAudio({ title: legacy.title, text: legacy.text })) {
    fail(`${publisher.id} narration profile is not byte exact.`);
  }
  const profileRanges = createReaderNarrationWordRanges(profile.text);
  const bodyRanges = profileRanges.slice(profile.titleWordCount);
  if (
    profileRanges.length !== profile.titleWordCount + profile.bodyWordCount ||
    bodyRanges.length !== profile.bodyWordCount
  ) {
    fail(`${publisher.id} narration range census drifted.`);
  }

  const blockWords = narrationBodyBlocks(publisher).flatMap((block) =>
    createReaderNarrationWordRanges(block.text).map((range) =>
      Object.freeze({
        block,
        range,
        text: block.text.slice(range.charStart, range.charEnd),
      })
    )
  );
  if (blockWords.length !== bodyRanges.length) {
    fail(`${publisher.id} rendered body word count drifted.`);
  }

  const paragraphOffsets = legacyParagraphOffsets(legacy);
  const legacyWholeWords = legacyParagraphWholeWordIndex(legacy);
  const migrationByBlock = migrationParagraphsByBlock(
    publisher.id,
    migration.paragraphs,
  );
  const words = bodyRanges.map((publisherRange, index) => {
    const blockWord = blockWords[index]!;
    const expectedText = profile.text.slice(
      publisherRange.charStart,
      publisherRange.charEnd,
    );
    if (blockWord.text !== expectedText) {
      fail(`${publisher.id} rendered body word ${index} drifted.`);
    }
    const migrationParagraph = migrationByBlock.get(blockWord.block.id);
    if (
      migrationParagraph === undefined ||
      migrationParagraph.blockContentHash !== blockWord.block.contentHash ||
      migrationParagraph.blockTextCodeUnits !== blockWord.block.text.length
    ) {
      fail(`${publisher.id} body word ${index} has no exact migration block.`);
    }
    const legacyParagraph = paragraphOffsets.get(
      migrationParagraph.legacyParagraphId,
    );
    if (
      legacyParagraph === undefined ||
      migrationParagraph.legacyParagraphId !==
        legacyParagraph.paragraph.paragraphId ||
      migrationParagraph.legacyContentHash !==
        legacyParagraph.paragraph.contentHash ||
      migrationParagraph.legacyTextCodeUnits !==
        legacyParagraph.paragraph.text.length
    ) {
      fail(`${publisher.id} body word ${index} has no exact legacy paragraph.`);
    }
    const candidates = migrationParagraph.offsetSegments.filter((segment) =>
      blockWord.range.charStart >= segment.targetStart &&
      blockWord.range.charEnd <= segment.targetStart + segment.length
    );
    if (candidates.length !== 1) {
      fail(`${publisher.id} body word ${index} is not uniquely reversible.`);
    }
    const segment = candidates[0]!;
    const localStart =
      segment.legacyStart + blockWord.range.charStart - segment.targetStart;
    const localEnd = localStart + expectedText.length;
    const legacyCharStart = legacyParagraph.start + localStart;
    const legacyCharEnd = legacyParagraph.start + localEnd;
    if (
      legacyWholeWords.get(
        `${legacyParagraph.paragraph.paragraphId}:${localStart}:${localEnd}`,
      ) !== 1
    ) {
      fail(`${publisher.id} body word ${index} misses a whole-word boundary.`);
    }
    if (
      localEnd > legacyParagraph.paragraph.text.length ||
      legacy.text.slice(legacyCharStart, legacyCharEnd) !== expectedText
    ) {
      fail(`${publisher.id} body word ${index} reverse mapping drifted.`);
    }
    return Object.freeze({
      legacyCharEnd,
      legacyCharStart,
      publisherCharEnd: publisherRange.charEnd,
      publisherCharStart: publisherRange.charStart,
    });
  });
  const bodyStartCharacter = profile.text.length - legacy.text.length;
  if (
    bodyStartCharacter < 0 ||
    profile.text.slice(bodyStartCharacter) !== legacy.text ||
    words.some((word) =>
      word.publisherCharStart - bodyStartCharacter !== word.legacyCharStart ||
      word.publisherCharEnd - bodyStartCharacter !== word.legacyCharEnd
    )
  ) {
    fail(`${publisher.id} compact body offset translation drifted.`);
  }

  return Object.freeze({
    bindingRecord: Object.freeze(words.map((word, bodyWordIndex) =>
      Object.freeze([
        publisher.id,
        bodyWordIndex,
        word.legacyCharStart,
        word.legacyCharEnd,
        legacy.text.slice(word.legacyCharStart, word.legacyCharEnd),
      ] as const)
    )),
    section: Object.freeze({
      audioVersionId: input.audioVersionId,
      bodyStartCharacter,
      bodyWordCount: profile.bodyWordCount,
      legacyContentHash: legacy.contentHash,
      profileText: profile.text,
      publisherContentHash: publisher.contentHash,
      sectionId: publisher.id,
      titleWordCount: profile.titleWordCount,
      workId: input.workId,
    }),
  });
}

type AuthorityWithoutBuildId = Omit<
  CoherencePublisherAudioWordAuthority,
  "buildId"
>;

export function createCoherencePublisherAudioWordAuthority(input: Readonly<{
  audioManifest: unknown;
  legacyCatalog: unknown;
  migrationArtifact: CoherenceReaderStateMigrationArtifact;
  reader: PublicationReaderEnvelope;
}>): CoherencePublisherAudioWordAuthority {
  if (
    input.reader.publicationId !== EXPECTED_PUBLICATION_ID ||
    input.migrationArtifact.publicationId !== input.reader.publicationId ||
    input.migrationArtifact.readerBuildId !== input.reader.buildId
  ) {
    fail("publication, Reader, and migration identities do not match.");
  }
  const legacyCatalog = parseCoherencePublisherLegacyNarrationCatalog(
    input.legacyCatalog,
  );
  const audio = parseCoherencePublisherLegacyNarrationAudioManifest(
    input.audioManifest,
  );
  const legacyBySectionId = new Map(
    legacyCatalog.sections.map((section) => [section.sectionId, section]),
  );
  const publisherBySectionId = new Map<
    string,
    Readonly<{ section: ReaderSection; workId: string }>
  >();
  for (const work of input.reader.works) {
    for (const section of work.sections) {
      if (publisherBySectionId.has(section.id)) {
        fail(`${section.id} Publisher section is duplicated.`);
      }
      publisherBySectionId.set(
        section.id,
        Object.freeze({ section, workId: work.id }),
      );
    }
  }
  if (publisherBySectionId.size !== EXPECTED_READER_SECTION_COUNT) {
    fail("Publisher Reader section count drifted.");
  }
  const migrationBySectionId = new Map(
    input.migrationArtifact.sections.map((section) => [section.sectionId, section]),
  );
  if (migrationBySectionId.size !== EXPECTED_READER_SECTION_COUNT) {
    fail("migration section count drifted.");
  }

  const safeSections: CoherencePublisherAudioWordAuthoritySection[] = [];
  const safeSectionIds: string[] = [];
  const bindingRecord: CoherencePublisherNarrationWordBindingRecordEntryV1[] = [];
  for (const clip of audio.clips) {
    const legacy = legacyBySectionId.get(clip.sectionId);
    const publisher = publisherBySectionId.get(clip.sectionId);
    if (legacy === undefined || publisher === undefined) {
      fail(`${clip.sectionId} is absent from a narration authority.`);
    }
    if (clip.audioVersionId !== legacy.audioVersionId) {
      fail(`${clip.sectionId} current audio version drifted.`);
    }
    const profile = createReaderNarrationSectionTextProfile(publisher.section);
    if (profile.text !== textForAudio({ title: legacy.title, text: legacy.text })) {
      continue;
    }
    const migration = migrationBySectionId.get(clip.sectionId);
    if (migration === undefined) {
      fail(`${clip.sectionId} is absent from the migration artifact.`);
    }
    safeSectionIds.push(clip.sectionId);
    const createdSection = createAuthoritySection({
      audioVersionId: clip.audioVersionId,
      legacy,
      migration,
      publisher: publisher.section,
      workId: publisher.workId,
    });
    safeSections.push(createdSection.section);
    bindingRecord.push(...createdSection.bindingRecord);
  }

  const titleWordCount = safeSections.reduce(
    (total, section) => total + section.titleWordCount,
    0,
  );
  const bodyWordCount = safeSections.reduce(
    (total, section) => total + section.bodyWordCount,
    0,
  );
  const safeSectionIdsSha256 = hashCanonicalJson(
    safeSectionIds as unknown as JSONValue,
  );
  const bindingRecordText = JSON.stringify(bindingRecord);
  const bindingRecordSha256 = `sha256:${createHash("sha256")
    .update(bindingRecordText, "utf8")
    .digest("hex")}`;
  if (
    safeSections.length !== EXPECTED_SAFE_SECTION_COUNT ||
    safeSectionIdsSha256 !== EXPECTED_SAFE_SECTION_IDS_SHA256 ||
    titleWordCount !== EXPECTED_SAFE_TITLE_WORD_COUNT ||
    bodyWordCount !== EXPECTED_SAFE_BODY_WORD_COUNT ||
    titleWordCount + bodyWordCount !== EXPECTED_SAFE_TIMING_WORD_COUNT ||
    bindingRecord.length !== EXPECTED_SAFE_BODY_WORD_COUNT ||
    Buffer.byteLength(bindingRecordText, "utf8") !==
      EXPECTED_BINDING_RECORD_BYTES ||
    canonicalizeJson(bindingRecord as unknown as JSONValue) !==
      bindingRecordText ||
    bindingRecordSha256 !==
      COHERENCE_PUBLISHER_NARRATION_WORD_BINDING_RECORD_V1_SHA256
  ) {
    fail("safe narration census drifted from the reviewed audio proof.");
  }

  const authorityWithoutBuildId: AuthorityWithoutBuildId = Object.freeze({
    bindingRecordSha256,
    kind: "coherence-publisher-narration-word-text-mapping-authority" as const,
    migrationBuildId: input.migrationArtifact.buildId,
    publicationId: input.reader.publicationId,
    readerBuildId: input.reader.buildId,
    safeSectionIdsSha256,
    schemaVersion: COHERENCE_PUBLISHER_AUDIO_WORD_AUTHORITY_SCHEMA_VERSION,
    sections: Object.freeze(safeSections),
    statistics: Object.freeze({
      bodyWordCount,
      narrationWordCount: titleWordCount + bodyWordCount,
      sectionCount: safeSections.length,
      titleWordCount,
    }),
  });
  const buildId = hashCanonicalJson(
    authorityWithoutBuildId as unknown as JSONValue,
  );
  if (
    buildId !==
      COHERENCE_PUBLISHER_NARRATION_WORD_TEXT_MAPPING_AUTHORITY_V1_BUILD_ID
  ) {
    fail("current text-mapping authority build identity drifted.");
  }
  const authority = Object.freeze({
    ...authorityWithoutBuildId,
    buildId,
  });
  verifiedTextMappingAuthorities.add(authority);
  return authority;
}

export function serializeCoherencePublisherAudioWordAuthority(
  authority: CoherencePublisherAudioWordAuthority,
): string {
  const { buildId, ...withoutBuildId } = authority;
  if (
    hashCanonicalJson(withoutBuildId as unknown as JSONValue) !== buildId
  ) {
    fail("authority build identity drifted before serialization.");
  }
  return `${canonicalizeJson(authority as unknown as JSONValue)}\n`;
}

function projectRouteSection(
  page: Extract<PublisherNextPage, { readonly kind: "section" }>,
  section: ReaderSection,
  authority: CoherencePublisherAudioWordAuthoritySection,
): CoherencePublisherAudioWordRouteSection | null {
  if (
    authority.workId !== page.work.id ||
    authority.publisherContentHash !== section.contentHash
  ) {
    return null;
  }
  const profile = createReaderNarrationSectionTextProfile(section);
  if (
    profile.text !== authority.profileText ||
    profile.titleWordCount !== authority.titleWordCount ||
    profile.bodyWordCount !== authority.bodyWordCount ||
    profile.text.slice(authority.bodyStartCharacter).length === 0
  ) {
    return null;
  }
  return Object.freeze({
    bodyStartCharacter: authority.bodyStartCharacter,
    bodyWordCount: authority.bodyWordCount,
    profileText: authority.profileText,
    queueIdentity: Object.freeze({
      audioVersionId: authority.audioVersionId,
      contentHash: authority.legacyContentHash,
    }),
    sectionId: authority.sectionId,
    titleWordCount: authority.titleWordCount,
  });
}

export function createCoherencePublisherAudioWordRouteModel(
  page: PublisherNextPage,
  authority: CoherencePublisherAudioWordAuthority | null,
): CoherencePublisherAudioWordRouteModel {
  if (
    authority === null ||
    !verifiedTextMappingAuthorities.has(authority) ||
    page.kind !== "section" ||
    page.publication.id !== authority.publicationId ||
    page.sections.length === 0 ||
    page.sections[0]?.id !== page.section.id ||
    new Set(page.sections.map(({ id }) => id)).size !== page.sections.length
  ) {
    return emptyCoherencePublisherAudioWordRouteModel;
  }
  const authorityBySectionId = new Map(
    authority.sections.map((section) => [section.sectionId, section]),
  );
  const sections: CoherencePublisherAudioWordRouteSection[] = [];
  for (const section of page.sections) {
    const bound = authorityBySectionId.get(section.id);
    if (bound === undefined) continue;
    const projected = projectRouteSection(page, section, bound);
    if (projected === null) return emptyCoherencePublisherAudioWordRouteModel;
    sections.push(projected);
  }
  const wordCount = sections.reduce(
    (total, section) => total + section.bodyWordCount,
    0,
  );
  if (
    sections.length === 0 ||
    sections.length > coherencePublisherAudioWordRouteLimits.maximumSections ||
    wordCount > coherencePublisherAudioWordRouteLimits.maximumWords
  ) {
    return emptyCoherencePublisherAudioWordRouteModel;
  }
  const model: CoherencePublisherAudioWordRouteModel = Object.freeze({
    authorityBuildId: authority.buildId,
    schemaVersion: COHERENCE_PUBLISHER_AUDIO_WORD_ROUTE_MODEL_SCHEMA_VERSION,
    sections: Object.freeze(sections),
  });
  if (
    Buffer.byteLength(JSON.stringify(model), "utf8") >
      coherencePublisherAudioWordRouteLimits.maximumBytes
  ) {
    return emptyCoherencePublisherAudioWordRouteModel;
  }
  return model;
}
