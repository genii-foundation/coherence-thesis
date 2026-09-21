"use client";

import {
  publisherReaderTextContent,
  publisherReaderTextPointForOffset,
  publisherReaderTextRange,
  publisherReaderTextVerticalBounds,
  readPublisherReaderSelection,
  type PublisherReaderSelection,
} from "@genii-foundation/publisher-next/client";
import * as Popover from "@radix-ui/react-popover";
import { Bookmark, Check, Trash2, TriangleAlert } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  addBookmark,
  bookmarksForSection,
  canAddBookmark,
  hasEnoughWords,
  maxBookmarkContextLength,
  maxBookmarkNoteLength,
  maxLiveBookmarks,
  removeBookmark,
  resolveBookmarkPassage,
  setBookmarkNote,
  type BookmarkPassageParagraph,
  type ReaderBookmark,
  type ReaderBookmarksState,
} from "@/lib/reader-bookmarks";
import {
  announceBookmarkOffered,
  announceBookmarkSaved,
} from "@/lib/reader-bookmark-events";
import { createEngagementEvent } from "@/lib/reader-engagement";
import { createReaderPassageRange } from "@/lib/reader-passage-range";
import {
  appendStoredEvent,
  updateStoredBookmarks,
  useReaderBookmarks,
} from "@/lib/reader-progress-store";
import {
  coherencePublisherBookmarkReaderDestination,
  MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_MODEL_BYTES,
  MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_OFFSET_SEGMENTS,
  MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_ROUTE_SECTIONS,
  type CoherencePublisherBookmarkParagraphMapping,
  type CoherencePublisherBookmarkRouteModel,
  type CoherencePublisherBookmarkRouteSection,
} from "@/publisher/legacy-reader-bookmark-bridge";

const transitionRootSelector =
  "[data-coherence-publisher-transition-root='true']";
const publisherSectionSelector = "[data-publisher-section]";
const publisherBlockSelector = "[data-publisher-block]";
const bridgeUiSelector = "[data-coherence-publisher-bookmark-ui='true']";
const selectionSettleMs = 250;

type BoundBookmarkSection = Readonly<{
  blockElements: ReadonlyMap<string, HTMLElement>;
  model: CoherencePublisherBookmarkRouteSection;
  sectionRoot: HTMLElement;
}>;

type BoundBookmarkRoute = Readonly<{
  root: HTMLElement;
  sections: readonly BoundBookmarkSection[];
}>;

export type CoherencePublisherBookmarkSelection = Readonly<{
  section: CoherencePublisherBookmarkRouteSection;
  range: ReturnType<typeof createReaderPassageRange>;
  quote: string;
  quoteOrdinal: number;
  prefix: string;
  suffix: string;
  top: number;
  left: number;
  width: number;
  height: number;
}>;

export type CoherencePublisherBookmarkMarker = Readonly<{
  bookmark: ReaderBookmark;
  endParagraphAnchor: string;
  endOffset: number;
  height: number;
  left: number;
  paragraphCount: number;
  startParagraphAnchor: string;
  startOffset: number;
  top: number;
}>;

type BrowserEnvironment = Readonly<{
  document: Document;
  window: Window;
}>;

function currentEnvironment(): BrowserEnvironment {
  return { document, window };
}

function noOp(): void {}

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

function serializedBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isUtf16Boundary(text: string, offset: number): boolean {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
    return false;
  }
  if (offset === 0 || offset === text.length) return true;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return !(
    before >= 0xd800 &&
    before <= 0xdbff &&
    after >= 0xdc00 &&
    after <= 0xdfff
  );
}

function validBookmarkModel(
  model: CoherencePublisherBookmarkRouteModel,
): boolean {
  try {
    if (
      !Array.isArray(model.sections) ||
      model.sections.length === 0 ||
      model.sections.length >
        MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_ROUTE_SECTIONS ||
      serializedBytes(model) >
        MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_MODEL_BYTES
    ) {
      return false;
    }
    const sectionIds = new Set<string>();
    const routeBlockIds = new Set<string>();
    for (const section of model.sections) {
      const publisher = section.publisherSection;
      const legacy = section.legacySection;
      const readerAddress = publisher.readerAddress;
      const readerDestination = readerAddress === null
        ? null
        : coherencePublisherBookmarkReaderDestination(
            readerAddress,
            publisher.id,
          );
      if (
        typeof section.workId !== "string" ||
        section.workId.length === 0 ||
        typeof section.fallbackPath !== "string" ||
        !section.fallbackPath.startsWith("/") ||
        section.fallbackPath.startsWith("//") ||
        sectionIds.has(publisher.id) ||
        publisher.id !== legacy.sectionId ||
        publisher.continuity.id !== legacy.continuityId ||
        readerDestination === null ||
        readerDestination !== legacy.readerHref ||
        !exactStrings(
          publisher.continuity.legacyIds,
          legacy.legacyContinuityIds,
        ) ||
        !exactStringGroups(
          publisher.continuity.progressGroups,
          legacy.progressContinuityGroups,
        ) ||
        !exactStrings(
          publisher.continuity.historicalSectionIds,
          legacy.legacySectionIds,
        ) ||
        section.paragraphs.length !== legacy.paragraphs.length
      ) {
        return false;
      }
      sectionIds.add(publisher.id);

      const blockById = new Map<string, (typeof publisher.blocks)[number]>();
      const blockIndexById = new Map<string, number>();
      for (let index = 0; index < publisher.blocks.length; index += 1) {
        const block = publisher.blocks[index];
        if (block === undefined || routeBlockIds.has(block.id)) return false;
        routeBlockIds.add(block.id);
        blockById.set(block.id, block);
        blockIndexById.set(block.id, index);
      }
      const blockIds = new Set<string>();
      const paragraphIds = new Set<string>();
      let previousBlockIndex = -1;
      for (let index = 0; index < section.paragraphs.length; index += 1) {
        const mapping = section.paragraphs[index];
        const paragraph = legacy.paragraphs[index];
        if (mapping === undefined || paragraph === undefined) return false;
        const block = blockById.get(mapping.blockId);
        const blockIndex = blockIndexById.get(mapping.blockId);
        if (
          block === undefined ||
          blockIndex === undefined ||
          blockIndex <= previousBlockIndex ||
          blockIds.has(mapping.blockId) ||
          paragraphIds.has(mapping.legacyParagraphId) ||
          paragraph.paragraphId !== mapping.legacyParagraphId ||
          paragraph.anchor !== mapping.legacyParagraphId ||
          paragraph.contentHash !== mapping.legacyContentHash ||
          block.contentHash !== mapping.blockContentHash ||
          !Number.isSafeInteger(mapping.legacyTextCodeUnits) ||
          mapping.legacyTextCodeUnits < 0 ||
          !Array.isArray(mapping.offsetSegments) ||
          mapping.offsetSegments.length === 0 ||
          mapping.offsetSegments.length >
            MAXIMUM_COHERENCE_PUBLISHER_BOOKMARK_OFFSET_SEGMENTS
        ) {
          return false;
        }
        let previousLegacyEnd = 0;
        let previousTargetEnd = 0;
        for (let segmentIndex = 0;
          segmentIndex < mapping.offsetSegments.length;
          segmentIndex += 1) {
          const segment = mapping.offsetSegments[segmentIndex];
          if (segment === undefined) return false;
          const legacyEnd = segment.legacyStart + segment.length;
          const targetEnd = segment.targetStart + segment.length;
          if (
            !Number.isSafeInteger(segment.legacyStart) ||
            !Number.isSafeInteger(segment.targetStart) ||
            !Number.isSafeInteger(segment.length) ||
            segment.legacyStart < 0 ||
            segment.targetStart < 0 ||
            segment.length <= 0 ||
            !Number.isSafeInteger(legacyEnd) ||
            !Number.isSafeInteger(targetEnd) ||
            segment.legacyStart < previousLegacyEnd ||
            segment.targetStart < previousTargetEnd ||
            legacyEnd > mapping.legacyTextCodeUnits ||
            targetEnd > block.text.length ||
            !isUtf16Boundary(block.text, segment.targetStart) ||
            !isUtf16Boundary(block.text, targetEnd) ||
            (segmentIndex > 0 &&
              segment.legacyStart === previousLegacyEnd &&
              segment.targetStart === previousTargetEnd)
          ) {
            return false;
          }
          previousLegacyEnd = legacyEnd;
          previousTargetEnd = targetEnd;
        }
        blockIds.add(mapping.blockId);
        paragraphIds.add(mapping.legacyParagraphId);
        previousBlockIndex = blockIndex;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function closestElement(
  element: HTMLElement,
  selector: string,
): Element | null {
  try {
    return element.closest(selector);
  } catch {
    return null;
  }
}

function owningPublisherHeading(
  section: CoherencePublisherBookmarkRouteSection["publisherSection"],
): (typeof section.blocks)[number] | null {
  const first = section.blocks[0];
  return first?.kind === "heading" && first.text === section.title
    ? first
    : null;
}

export function inspectCoherencePublisherBookmarkDom(
  model: CoherencePublisherBookmarkRouteModel,
  sourceDocument: Document = document,
): BoundBookmarkRoute | null {
  if (!validBookmarkModel(model)) return null;
  const roots = Array.from(
    sourceDocument.querySelectorAll<HTMLElement>(transitionRootSelector),
  );
  if (roots.length !== 1) return null;
  const root = roots[0]!;
  const sectionElements = Array.from(
    root.querySelectorAll<HTMLElement>(publisherSectionSelector),
  ).filter((element) => closestElement(element, transitionRootSelector) === root);
  if (sectionElements.length !== model.sections.length) return null;

  const sectionById = new Map<string, HTMLElement>();
  for (let index = 0; index < sectionElements.length; index += 1) {
    const element = sectionElements[index];
    const expected = model.sections[index];
    if (element === undefined || expected === undefined) return null;
    const id = element.dataset.publisherSection;
    if (
      id === undefined ||
      id !== expected.publisherSection.id ||
      sectionById.has(id)
    ) {
      return null;
    }
    sectionById.set(id, element);
  }

  const expectedBlocks = model.sections.flatMap((section, sectionIndex) =>
    section.publisherSection.blocks.map((block, blockIndex) => ({
      block,
      outsideSection:
        sectionIndex === 0 &&
        blockIndex === 0 &&
        owningPublisherHeading(section.publisherSection) === block,
      section,
    }))
  );
  const renderedBlocks = Array.from(
    root.querySelectorAll<HTMLElement>(publisherBlockSelector),
  ).filter((element) => closestElement(element, transitionRootSelector) === root);
  if (renderedBlocks.length !== expectedBlocks.length) return null;

  const renderedBlockById = new Map<string, HTMLElement>();
  for (let index = 0; index < expectedBlocks.length; index += 1) {
    const expected = expectedBlocks[index];
    const element = renderedBlocks[index];
    if (expected === undefined || element === undefined) return null;
    const id = element.dataset.publisherBlock;
    const sectionRoot = sectionById.get(expected.section.publisherSection.id);
    if (
      id !== expected.block.id ||
      sectionRoot === undefined ||
      renderedBlockById.has(expected.block.id) ||
      publisherReaderTextContent(element) !== expected.block.text
    ) {
      return null;
    }
    const renderedSectionRoot = closestElement(
      element,
      publisherSectionSelector,
    );
    if (
      expected.outsideSection
        ? renderedSectionRoot !== null
        : renderedSectionRoot !== sectionRoot
    ) {
      return null;
    }
    renderedBlockById.set(expected.block.id, element);
  }

  const sections: BoundBookmarkSection[] = [];
  for (let sectionIndex = 0; sectionIndex < model.sections.length; sectionIndex += 1) {
    const section = model.sections[sectionIndex];
    if (section === undefined) return null;
    const sectionRoot = sectionById.get(section.publisherSection.id);
    if (sectionRoot === undefined) return null;
    const heading = owningPublisherHeading(section.publisherSection);
    const blocksInsideSection = section.publisherSection.blocks.filter(
      (block, blockIndex) =>
        !(sectionIndex === 0 && blockIndex === 0 && block === heading),
    );
    const syntheticHeading = sectionIndex > 0 && heading === null
      ? section.publisherSection.title
      : "";
    if (
      publisherReaderTextContent(sectionRoot) !==
        `${syntheticHeading}${blocksInsideSection.map((block) => block.text).join("")}`
    ) {
      return null;
    }
    const blockElements = new Map<string, HTMLElement>();
    for (const mapping of section.paragraphs) {
      const element = renderedBlockById.get(mapping.blockId);
      if (
        element === undefined ||
        closestElement(element, publisherSectionSelector) !== sectionRoot
      ) {
        return null;
      }
      blockElements.set(mapping.blockId, element);
    }
    if (blockElements.size !== section.paragraphs.length) return null;
    sections.push(Object.freeze({
      blockElements,
      model: section,
      sectionRoot,
    }));
  }

  return Object.freeze({ root, sections: Object.freeze(sections) });
}

function mappingByBlock(
  section: CoherencePublisherBookmarkRouteSection,
): ReadonlyMap<string, CoherencePublisherBookmarkParagraphMapping> {
  return new Map(section.paragraphs.map((mapping) => [mapping.blockId, mapping]));
}

function mappingByParagraph(
  section: CoherencePublisherBookmarkRouteSection,
): ReadonlyMap<string, CoherencePublisherBookmarkParagraphMapping> {
  return new Map(
    section.paragraphs.map((mapping) => [mapping.legacyParagraphId, mapping]),
  );
}

function bookmarkPassageParagraphs(
  section: CoherencePublisherBookmarkRouteSection,
): readonly BookmarkPassageParagraph[] | null {
  const blockById = new Map(
    section.publisherSection.blocks.map((block) => [block.id, block]),
  );
  const paragraphs: BookmarkPassageParagraph[] = [];
  for (let index = 0; index < section.paragraphs.length; index += 1) {
    const mapping = section.paragraphs[index];
    const paragraph = section.legacySection.paragraphs[index];
    const block = mapping === undefined
      ? undefined
      : blockById.get(mapping.blockId);
    if (
      mapping === undefined ||
      paragraph === undefined ||
      block === undefined ||
      paragraph.paragraphId !== mapping.legacyParagraphId ||
      paragraph.anchor !== mapping.legacyParagraphId ||
      paragraph.contentHash !== mapping.legacyContentHash ||
      block.contentHash !== mapping.blockContentHash ||
      !Number.isSafeInteger(mapping.legacyTextCodeUnits) ||
      mapping.legacyTextCodeUnits < 0 ||
      mapping.offsetSegments.length === 0
    ) {
      return null;
    }
    paragraphs.push(Object.freeze({
      paragraphId: paragraph.paragraphId,
      anchor: paragraph.anchor,
      contentHash: paragraph.contentHash,
      text: block.text,
    }));
  }
  return Object.freeze(paragraphs);
}

type OffsetSpace = "legacy" | "target";

type TranslatedOffsetInterval = Readonly<{
  start: number;
  end: number;
}>;

function segmentStart(
  segment: CoherencePublisherBookmarkParagraphMapping["offsetSegments"][number],
  space: OffsetSpace,
): number {
  return space === "legacy" ? segment.legacyStart : segment.targetStart;
}

function coordinateLength(
  mapping: CoherencePublisherBookmarkParagraphMapping,
  targetText: string,
  space: OffsetSpace,
): number {
  return space === "legacy" ? mapping.legacyTextCodeUnits : targetText.length;
}

function oppositeSpace(space: OffsetSpace): OffsetSpace {
  return space === "legacy" ? "target" : "legacy";
}

function mapOffsetCandidate(
  mapping: CoherencePublisherBookmarkParagraphMapping,
  targetText: string,
  offset: number,
  source: OffsetSpace,
): number | null {
  const sourceLength = coordinateLength(mapping, targetText, source);
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > sourceLength ||
    (source === "target" && !isUtf16Boundary(targetText, offset))
  ) {
    return null;
  }
  const candidates = new Set<number>();
  for (const segment of mapping.offsetSegments) {
    const start = segmentStart(segment, source);
    const end = start + segment.length;
    if (offset < start || offset > end) continue;
    candidates.add(
      segmentStart(segment, oppositeSpace(source)) + offset - start,
    );
  }
  if (candidates.size !== 1) return null;
  const translated = candidates.values().next().value as number | undefined;
  if (
    translated === undefined ||
    (source === "legacy" && !isUtf16Boundary(targetText, translated))
  ) {
    return null;
  }
  return translated;
}

function translateOffset(
  mapping: CoherencePublisherBookmarkParagraphMapping,
  targetText: string,
  offset: number,
  source: OffsetSpace,
): number | null {
  const translated = mapOffsetCandidate(mapping, targetText, offset, source);
  if (translated === null) return null;
  const roundTrip = mapOffsetCandidate(
    mapping,
    targetText,
    translated,
    oppositeSpace(source),
  );
  return roundTrip === offset ? translated : null;
}

function translateCoveredOffsetInterval(
  mapping: CoherencePublisherBookmarkParagraphMapping,
  targetText: string,
  start: number,
  end: number,
  source: OffsetSpace,
): TranslatedOffsetInterval | null {
  const sourceLength = coordinateLength(mapping, targetText, source);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end > sourceLength
  ) {
    return null;
  }
  const translatedStart = translateOffset(
    mapping,
    targetText,
    start,
    source,
  );
  const translatedEnd = translateOffset(
    mapping,
    targetText,
    end,
    source,
  );
  if (translatedStart === null || translatedEnd === null) return null;
  if (start === end) {
    return translatedStart === translatedEnd
      ? Object.freeze({ start: translatedStart, end: translatedEnd })
      : null;
  }

  let sourceCursor = start;
  let targetCursor = translatedStart;
  for (const segment of mapping.offsetSegments) {
    const sourceStart = segmentStart(segment, source);
    const sourceEnd = sourceStart + segment.length;
    if (sourceEnd <= sourceCursor) continue;
    if (sourceStart > sourceCursor) return null;
    const targetAtCursor =
      segmentStart(segment, oppositeSpace(source)) +
      sourceCursor - sourceStart;
    if (targetAtCursor !== targetCursor) return null;
    const consumedEnd = Math.min(end, sourceEnd);
    const consumed = consumedEnd - sourceCursor;
    sourceCursor = consumedEnd;
    targetCursor += consumed;
    if (sourceCursor === end) break;
  }
  return sourceCursor === end && targetCursor === translatedEnd
    ? Object.freeze({ start: translatedStart, end: translatedEnd })
    : null;
}

function occurrenceOrdinal(
  text: string,
  quote: string,
  startOffset: number,
): number {
  if (quote.length === 0) return 0;
  let ordinal = 0;
  let index = text.indexOf(quote);
  while (index >= 0 && index < startOffset) {
    ordinal += 1;
    index = text.indexOf(quote, index + 1);
  }
  return ordinal;
}

function targetExactIslandAtOffset(
  mapping: CoherencePublisherBookmarkParagraphMapping,
  targetText: string,
  offset: number,
): TranslatedOffsetInterval | null {
  const legacyOffset = translateOffset(mapping, targetText, offset, "target");
  if (legacyOffset === null) return null;
  const candidates = mapping.offsetSegments.filter((segment) => {
    const end = segment.targetStart + segment.length;
    return offset >= segment.targetStart &&
      offset <= end &&
      segment.legacyStart + offset - segment.targetStart === legacyOffset;
  });
  if (candidates.length === 0) return null;
  return Object.freeze({
    start: Math.min(...candidates.map(({ targetStart }) => targetStart)),
    end: Math.max(
      ...candidates.map(({ targetStart, length }) => targetStart + length),
    ),
  });
}

function safeContextSlice(
  text: string,
  start: number,
  end: number,
): string {
  let safeStart = start;
  let safeEnd = end;
  if (!isUtf16Boundary(text, safeStart)) safeStart += 1;
  if (!isUtf16Boundary(text, safeEnd)) safeEnd -= 1;
  return safeEnd <= safeStart ? "" : text.slice(safeStart, safeEnd);
}

function finiteGeometry(selection: PublisherReaderSelection): boolean {
  return [
    selection.top,
    selection.left,
    selection.width,
    selection.height,
  ].every((value) => Number.isFinite(value));
}

function selectedBlockSpan(
  section: CoherencePublisherBookmarkRouteSection,
  startBlockId: string,
  endBlockId: string,
): readonly (typeof section.publisherSection.blocks)[number][] | null {
  const blocks = section.publisherSection.blocks;
  const start = blocks.findIndex((block) => block.id === startBlockId);
  const end = blocks.findIndex((block) => block.id === endBlockId);
  if (start < 0 || end < start) return null;
  const mapped = mappingByBlock(section);
  const span = blocks.slice(start, end + 1);
  if (span.some((block) => !mapped.has(block.id))) {
    return null;
  }
  return span;
}

type CoveredSectionBlock = Readonly<{
  block: CoherencePublisherBookmarkRouteSection["publisherSection"]["blocks"][number];
  mapping: CoherencePublisherBookmarkParagraphMapping;
  targetStart: number;
  targetEnd: number;
}>;

type CoveredSectionSpan = Readonly<{
  blocks: readonly CoveredSectionBlock[];
  translatedStart: number;
  translatedEnd: number;
}>;

function translateCoveredSectionSpan(
  section: CoherencePublisherBookmarkRouteSection,
  startMapping: CoherencePublisherBookmarkParagraphMapping,
  startOffset: number,
  endMapping: CoherencePublisherBookmarkParagraphMapping,
  endOffset: number,
  source: OffsetSpace,
): CoveredSectionSpan | null {
  const span = selectedBlockSpan(
    section,
    startMapping.blockId,
    endMapping.blockId,
  );
  if (span === null) return null;
  const byBlock = mappingByBlock(section);
  const covered: CoveredSectionBlock[] = [];
  let translatedStart: number | null = null;
  let translatedEnd: number | null = null;
  for (let index = 0; index < span.length; index += 1) {
    const block = span[index];
    if (block === undefined) return null;
    const mapping = byBlock.get(block.id);
    if (mapping === undefined) return null;
    const sourceLength = coordinateLength(mapping, block.text, source);
    const intervalStart = index === 0 ? startOffset : 0;
    const intervalEnd = index === span.length - 1 ? endOffset : sourceLength;
    if (
      intervalStart > intervalEnd ||
      (span.length === 1 && intervalStart === intervalEnd)
    ) {
      return null;
    }
    const translated = translateCoveredOffsetInterval(
      mapping,
      block.text,
      intervalStart,
      intervalEnd,
      source,
    );
    if (translated === null) return null;
    const targetStart = source === "target"
      ? intervalStart
      : translated.start;
    const targetEnd = source === "target" ? intervalEnd : translated.end;
    const destinationLength = coordinateLength(
      mapping,
      block.text,
      oppositeSpace(source),
    );
    if (
      (index > 0 && translated.start !== 0) ||
      (index < span.length - 1 && translated.end !== destinationLength) ||
      !isUtf16Boundary(block.text, targetStart) ||
      !isUtf16Boundary(block.text, targetEnd)
    ) {
      return null;
    }
    translatedStart ??= translated.start;
    translatedEnd = translated.end;
    covered.push(Object.freeze({
      block,
      mapping,
      targetStart,
      targetEnd,
    }));
  }
  return translatedStart === null || translatedEnd === null
    ? null
    : Object.freeze({
        blocks: Object.freeze(covered),
        translatedStart,
        translatedEnd,
      });
}

function translatePublisherSelection(
  section: CoherencePublisherBookmarkRouteSection,
  selection: PublisherReaderSelection,
): CoherencePublisherBookmarkSelection | null {
  if (!finiteGeometry(selection)) return null;
  const input = selection.input;
  const start = input.range.start;
  const end = input.range.end;
  if (
    start.workId !== section.workId ||
    end.workId !== section.workId ||
    start.sectionContinuityId !== section.publisherSection.continuity.id ||
    end.sectionContinuityId !== section.publisherSection.continuity.id
  ) {
    return null;
  }
  const byBlock = mappingByBlock(section);
  const startMapping = byBlock.get(start.blockId);
  const endMapping = byBlock.get(end.blockId);
  if (
    startMapping === undefined ||
    endMapping === undefined ||
    start.blockContentHash !== startMapping.blockContentHash ||
    end.blockContentHash !== endMapping.blockContentHash
  ) {
    return null;
  }
  const covered = translateCoveredSectionSpan(
    section,
    startMapping,
    start.offset,
    endMapping,
    end.offset,
    "target",
  );
  if (covered === null) return null;
  const publisherParts = covered.blocks.map(({ block, targetStart, targetEnd }) => {
    return block.text.slice(targetStart, targetEnd);
  });
  publisherParts[0] = publisherParts[0]?.trimStart() ?? "";
  publisherParts[publisherParts.length - 1] =
    publisherParts[publisherParts.length - 1]?.trimEnd() ?? "";
  if (publisherParts.join("\n") !== input.quote) return null;

  const legacyParts = covered.blocks.map(({ block, targetStart, targetEnd }) =>
    block.text.slice(targetStart, targetEnd)
  );
  legacyParts[0] = legacyParts[0]?.trimStart() ?? "";
  legacyParts[legacyParts.length - 1] =
    legacyParts[legacyParts.length - 1]?.trimEnd() ?? "";
  const quote = legacyParts.join("\n\n");
  if (!hasEnoughWords(quote)) return null;

  const startBlock = section.publisherSection.blocks.find(
    (block) => block.id === start.blockId,
  );
  const endBlock = section.publisherSection.blocks.find(
    (block) => block.id === end.blockId,
  );
  if (startBlock === undefined || endBlock === undefined) return null;
  const startIsland = targetExactIslandAtOffset(
    startMapping,
    startBlock.text,
    start.offset,
  );
  const endIsland = targetExactIslandAtOffset(
    endMapping,
    endBlock.text,
    end.offset,
  );
  if (startIsland === null || endIsland === null) return null;
  return Object.freeze({
    section,
    range: createReaderPassageRange(
      {
        paragraphAnchor: startMapping.legacyParagraphId,
        paragraphContentHash: startMapping.legacyContentHash,
        offset: covered.translatedStart,
      },
      {
        paragraphAnchor: endMapping.legacyParagraphId,
        paragraphContentHash: endMapping.legacyContentHash,
        offset: covered.translatedEnd,
      },
    ),
    quote,
    quoteOrdinal: start.blockId === end.blockId
      ? occurrenceOrdinal(startBlock.text, quote, start.offset)
      : 0,
    prefix: safeContextSlice(
      startBlock.text,
      Math.max(startIsland.start, start.offset - maxBookmarkContextLength),
      start.offset,
    ).trimStart(),
    suffix: safeContextSlice(
      endBlock.text,
      end.offset,
      Math.min(endIsland.end, end.offset + maxBookmarkContextLength),
    ).trimEnd(),
    top: selection.top,
    left: selection.left,
    width: selection.width,
    height: selection.height,
  });
}

export function readCoherencePublisherBookmarkSelection(
  model: CoherencePublisherBookmarkRouteModel,
  selection: Selection | null,
  sourceDocument: Document = document,
): CoherencePublisherBookmarkSelection | null {
  const bound = inspectCoherencePublisherBookmarkDom(model, sourceDocument);
  if (bound === null) return null;
  let captured: CoherencePublisherBookmarkSelection | null = null;
  try {
    for (const section of bound.sections) {
      const publisherSelection = readPublisherReaderSelection(
        selection,
        section.model.workId,
        section.model.publisherSection,
        section.model.fallbackPath,
      );
      if (publisherSelection === null) continue;
      const translated = translatePublisherSelection(
        section.model,
        publisherSelection,
      );
      if (translated === null || captured !== null) return null;
      captured = translated;
    }
  } catch {
    return null;
  }
  return captured;
}

function eventInsideBridgeUi(event: Event): boolean {
  return event.target instanceof Element &&
    event.target.closest(bridgeUiSelector) !== null;
}

export function bindCoherencePublisherBookmarkCapture(
  model: CoherencePublisherBookmarkRouteModel,
  handlers: Readonly<{
    onSelection: (selection: CoherencePublisherBookmarkSelection | null) => void;
    onSave: () => void;
  }>,
  environment: BrowserEnvironment = currentEnvironment(),
): () => void {
  if (inspectCoherencePublisherBookmarkDom(model, environment.document) === null) {
    return noOp;
  }
  let timer: number | null = null;
  let pointerDown = false;
  let hasSelection = false;

  const clearTimer = () => {
    if (timer === null) return;
    environment.window.clearTimeout(timer);
    timer = null;
  };
  const read = () => {
    if (pointerDown) return;
    const next = readCoherencePublisherBookmarkSelection(
      model,
      environment.window.getSelection(),
      environment.document,
    );
    if (next !== null && !hasSelection) announceBookmarkOffered();
    hasSelection = next !== null;
    handlers.onSelection(next);
  };
  const scheduleRead = (delay: number) => {
    clearTimer();
    timer = environment.window.setTimeout(() => {
      timer = null;
      read();
    }, delay);
  };
  const onSelectionChange = () => {
    const selection = environment.window.getSelection();
    if (selection === null || selection.isCollapsed) {
      clearTimer();
      hasSelection = false;
      handlers.onSelection(null);
      return;
    }
    scheduleRead(selectionSettleMs);
  };
  const onPointerDown = (event: Event) => {
    if (eventInsideBridgeUi(event)) return;
    pointerDown = true;
    hasSelection = false;
    handlers.onSelection(null);
  };
  const onPointerUp = (event: Event) => {
    if (eventInsideBridgeUi(event)) return;
    pointerDown = false;
    scheduleRead(0);
  };
  const onKeyUp = (event: Event) => {
    if (
      (event as KeyboardEvent).key !== "Escape" &&
      !eventInsideBridgeUi(event)
    ) {
      scheduleRead(0);
    }
  };
  const onKeyDown = (event: Event) => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.key === "Escape") {
      clearTimer();
      hasSelection = false;
      handlers.onSelection(null);
      return;
    }
    if (
      keyboard.altKey &&
      (keyboard.key === "b" || keyboard.key === "B") &&
      hasSelection
    ) {
      keyboard.preventDefault();
      handlers.onSave();
    }
  };

  scheduleRead(0);
  environment.document.addEventListener("pointerdown", onPointerDown);
  environment.document.addEventListener("pointerup", onPointerUp);
  environment.document.addEventListener("keyup", onKeyUp);
  environment.document.addEventListener("selectionchange", onSelectionChange);
  environment.document.addEventListener("keydown", onKeyDown);
  return () => {
    clearTimer();
    environment.document.removeEventListener("pointerdown", onPointerDown);
    environment.document.removeEventListener("pointerup", onPointerUp);
    environment.document.removeEventListener("keyup", onKeyUp);
    environment.document.removeEventListener(
      "selectionchange",
      onSelectionChange,
    );
    environment.document.removeEventListener("keydown", onKeyDown);
  };
}

function measureBookmark(
  bound: BoundBookmarkSection,
  bookmark: ReaderBookmark,
  environment: BrowserEnvironment,
): CoherencePublisherBookmarkMarker | null {
  const paragraphs = bookmarkPassageParagraphs(bound.model);
  if (paragraphs === null) return null;
  const resolution = resolveBookmarkPassage(bookmark, paragraphs);
  if (resolution.status === "missing") return null;
  const byParagraph = mappingByParagraph(bound.model);
  const startMapping = byParagraph.get(resolution.startAnchor);
  const endMapping = byParagraph.get(resolution.endAnchor);
  if (startMapping === undefined || endMapping === undefined) return null;
  const source = resolution.status === "reanchored" ? "target" : "legacy";
  const covered = translateCoveredSectionSpan(
    bound.model,
    startMapping,
    resolution.startOffset,
    endMapping,
    resolution.endOffset,
    source,
  );
  if (covered === null) return null;
  const startOffset = source === "target"
    ? resolution.startOffset
    : covered.translatedStart;
  const endOffset = source === "target"
    ? resolution.endOffset
    : covered.translatedEnd;
  const startElement = bound.blockElements.get(startMapping.blockId);
  const endElement = bound.blockElements.get(endMapping.blockId);
  if (startElement === undefined || endElement === undefined) return null;
  try {
    const start = publisherReaderTextPointForOffset(startElement, startOffset);
    const end = publisherReaderTextPointForOffset(endElement, endOffset);
    if (start === null || end === null) return null;
    const range = publisherReaderTextRange(start, end);
    if (range === null) return null;
    const bounds = publisherReaderTextVerticalBounds(range);
    if (bounds === null) return null;
    const sectionBox = bound.sectionRoot.getBoundingClientRect();
    const isDesktop = environment.window.matchMedia("(min-width: 641px)").matches;
    const startIndex = bound.model.legacySection.paragraphs.findIndex(
      (paragraph) => paragraph.anchor === resolution.startAnchor,
    );
    const endIndex = bound.model.legacySection.paragraphs.findIndex(
      (paragraph) => paragraph.anchor === resolution.endAnchor,
    );
    if (startIndex < 0 || endIndex < startIndex) return null;
    return Object.freeze({
      bookmark,
      endParagraphAnchor: resolution.endAnchor,
      endOffset: resolution.endOffset,
      height: Math.max(44, bounds.bottom - bounds.top + 4),
      left: Math.max(
        isDesktop ? 4 : 0,
        sectionBox.left - (isDesktop ? 54 : 24),
      ) + environment.window.scrollX,
      paragraphCount: endIndex - startIndex + 1,
      startParagraphAnchor: resolution.startAnchor,
      startOffset: resolution.startOffset,
      top: bounds.top - 2 + environment.window.scrollY,
    });
  } catch {
    return null;
  }
}

export function measureCoherencePublisherBookmarkMarkers(
  model: CoherencePublisherBookmarkRouteModel,
  bookmarks: ReaderBookmarksState,
  environment: BrowserEnvironment = currentEnvironment(),
): readonly CoherencePublisherBookmarkMarker[] {
  const bound = inspectCoherencePublisherBookmarkDom(
    model,
    environment.document,
  );
  if (bound === null) return Object.freeze([]);
  const markers: CoherencePublisherBookmarkMarker[] = [];
  for (const section of bound.sections) {
    for (const bookmark of bookmarksForSection(
      bookmarks,
      section.model.legacySection,
    )) {
      const marker = measureBookmark(section, bookmark, environment);
      if (marker !== null) markers.push(marker);
    }
  }
  return Object.freeze(markers);
}

function observeLayoutShifts(
  requestMeasure: () => void,
): PerformanceObserver | null {
  if (
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes.includes("layout-shift")
  ) {
    return null;
  }
  const observer = new PerformanceObserver(requestMeasure);
  observer.observe({ type: "layout-shift", buffered: true });
  return observer;
}

export function observeCoherencePublisherBookmarkMarkers(
  model: CoherencePublisherBookmarkRouteModel,
  bookmarks: ReaderBookmarksState,
  onMarkers: (markers: readonly CoherencePublisherBookmarkMarker[]) => void,
  environment: BrowserEnvironment = currentEnvironment(),
): () => void {
  const bound = inspectCoherencePublisherBookmarkDom(
    model,
    environment.document,
  );
  if (bound === null) {
    onMarkers(Object.freeze([]));
    return noOp;
  }
  let frame = 0;
  let disposed = false;
  const measure = () => {
    if (disposed) return;
    onMarkers(
      measureCoherencePublisherBookmarkMarkers(model, bookmarks, environment),
    );
  };
  const requestMeasure = () => {
    if (disposed) return;
    environment.window.cancelAnimationFrame(frame);
    frame = environment.window.requestAnimationFrame(measure);
  };
  measure();
  environment.window.addEventListener("resize", requestMeasure);
  const handleVisibility = () => {
    if (environment.document.visibilityState === "visible") measure();
  };
  environment.document.addEventListener("visibilitychange", handleVisibility);

  const resizeObserver = new ResizeObserver(requestMeasure);
  for (const section of bound.sections) {
    resizeObserver.observe(section.sectionRoot);
    for (const element of section.blockElements.values()) {
      resizeObserver.observe(element);
    }
  }
  const rootObserver = new MutationObserver(requestMeasure);
  rootObserver.observe(environment.document.documentElement, {
    attributeFilter: ["data-reader-highlights", "style"],
  });
  const contentObserver = new MutationObserver(requestMeasure);
  contentObserver.observe(bound.root, {
    characterData: true,
    childList: true,
    subtree: true,
  });
  const layoutShiftObserver = observeLayoutShifts(requestMeasure);
  const handleFontSettle = () => requestMeasure();
  environment.document.fonts?.addEventListener(
    "loadingdone",
    handleFontSettle,
  );
  environment.document.fonts?.addEventListener(
    "loadingerror",
    handleFontSettle,
  );
  void environment.document.fonts?.ready.then(() => {
    if (!disposed) requestMeasure();
  });
  return () => {
    disposed = true;
    environment.window.cancelAnimationFrame(frame);
    environment.window.removeEventListener("resize", requestMeasure);
    environment.document.removeEventListener(
      "visibilitychange",
      handleVisibility,
    );
    resizeObserver.disconnect();
    rootObserver.disconnect();
    contentObserver.disconnect();
    layoutShiftObserver?.disconnect();
    environment.document.fonts?.removeEventListener(
      "loadingdone",
      handleFontSettle,
    );
    environment.document.fonts?.removeEventListener(
      "loadingerror",
      handleFontSettle,
    );
  };
}

function useHighlightPreference(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const read = () =>
      setEnabled(
        document.documentElement.dataset.readerHighlights === "on",
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributeFilter: ["data-reader-highlights"],
    });
    return () => observer.disconnect();
  }, []);
  return enabled;
}

type SaveStatus = "saved" | "full" | "failed" | null;
type ActiveMarker = Readonly<{
  bookmarkId: string;
  mode: "active" | "hover";
}> | null;

export function CoherencePublisherBookmarkBridgeClient({
  model,
}: {
  model: CoherencePublisherBookmarkRouteModel;
}) {
  if (typeof document === "undefined" || !validBookmarkModel(model)) return null;
  return <MountedCoherencePublisherBookmarkBridgeClient model={model} />;
}

function MountedCoherencePublisherBookmarkBridgeClient({
  model,
}: {
  model: CoherencePublisherBookmarkRouteModel;
}) {
  const bookmarks = useReaderBookmarks();
  const highlightsEnabled = useHighlightPreference();
  const [selection, setSelection] =
    useState<CoherencePublisherBookmarkSelection | null>(null);
  const [status, setStatus] = useState<SaveStatus>(null);
  const [markers, setMarkers] =
    useState<readonly CoherencePublisherBookmarkMarker[]>([]);
  const [activeMarker, setActiveMarker] = useState<ActiveMarker>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const selectionRef = useRef(selection);
  const statusTimer = useRef<number | null>(null);
  const hoverCloseTimer = useRef<number | null>(null);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const clearStatusTimer = useCallback(() => {
    if (statusTimer.current === null) return;
    window.clearTimeout(statusTimer.current);
    statusTimer.current = null;
  }, []);
  const showStatus = useCallback((next: SaveStatus) => {
    clearStatusTimer();
    setStatus(next);
    statusTimer.current = window.setTimeout(() => {
      setStatus(null);
      statusTimer.current = null;
    }, 2_400);
  }, [clearStatusTimer]);

  const save = useCallback(() => {
    const target = selectionRef.current;
    if (target === null) return;
    let refused = false;
    updateStoredBookmarks((current) => {
      if (!canAddBookmark(current)) {
        refused = true;
        return current;
      }
      return addBookmark(current, {
        section: target.section.legacySection,
        range: target.range,
        quote: target.quote,
        quoteOrdinal: target.quoteOrdinal,
        prefix: target.prefix,
        suffix: target.suffix,
      });
    });
    if (refused) {
      showStatus("full");
      return;
    }
    appendStoredEvent(
      createEngagementEvent("bookmark_added", {
        sectionId: target.section.legacySection.sectionId,
        contentHash: target.section.legacySection.contentHash,
        route: window.location.pathname,
        payload: {
          startParagraphAnchor: target.range.start.paragraphAnchor,
          startOffset: target.range.start.offset,
          endParagraphAnchor: target.range.end.paragraphAnchor,
          endOffset: target.range.end.offset,
        },
      }),
    );
    showStatus("saved");
    announceBookmarkSaved();
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [showStatus]);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() =>
    bindCoherencePublisherBookmarkCapture(model, {
      onSelection: setSelection,
      onSave: () => saveRef.current(),
    }), [model]);

  useEffect(() => {
    if (!highlightsEnabled) return;
    return observeCoherencePublisherBookmarkMarkers(
      model,
      bookmarks,
      setMarkers,
    );
  }, [bookmarks, highlightsEnabled, model]);

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimer.current === null) return;
    window.clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  }, []);
  const openMarker = useCallback(
    (bookmarkId: string, mode: "active" | "hover") => {
      clearHoverCloseTimer();
      setActiveMarker({ bookmarkId, mode });
    },
    [clearHoverCloseTimer],
  );
  const closeMarker = useCallback((bookmarkId: string) => {
    clearHoverCloseTimer();
    setActiveMarker((current) =>
      current?.bookmarkId === bookmarkId ? null : current
    );
    setEditingNoteId(null);
    setPendingRemovalId(null);
  }, [clearHoverCloseTimer]);
  const queueHoverClose = useCallback((bookmarkId: string) => {
    clearHoverCloseTimer();
    hoverCloseTimer.current = window.setTimeout(() => {
      setActiveMarker((current) =>
        current?.bookmarkId === bookmarkId && current.mode === "hover"
          ? null
          : current
      );
      hoverCloseTimer.current = null;
    }, 120);
  }, [clearHoverCloseTimer]);
  const commitRemove = useCallback((bookmark: ReaderBookmark) => {
    updateStoredBookmarks((current) => removeBookmark(current, bookmark.id));
    appendStoredEvent(
      createEngagementEvent("bookmark_removed", {
        sectionId: bookmark.sectionId,
        route: window.location.pathname,
        payload: {
          startParagraphAnchor: bookmark.range.start.paragraphAnchor,
          startOffset: bookmark.range.start.offset,
          endParagraphAnchor: bookmark.range.end.paragraphAnchor,
          endOffset: bookmark.range.end.offset,
        },
      }),
    );
    closeMarker(bookmark.id);
  }, [closeMarker]);

  useEffect(() => () => {
    clearStatusTimer();
    clearHoverCloseTimer();
  }, [clearHoverCloseTimer, clearStatusTimer]);

  const markerPortal = !highlightsEnabled || markers.length === 0
    ? null
    : createPortal(
        <>
          {markers.map((marker) => (
            <Popover.Root
              key={marker.bookmark.id}
              open={activeMarker?.bookmarkId === marker.bookmark.id}
              onOpenChange={(open) => {
                if (!open) closeMarker(marker.bookmark.id);
              }}
            >
              <Popover.Anchor asChild>
                <button
                  type="button"
                  className="reader-bookmark-highlight"
                  aria-label={`Bookmark: ${marker.bookmark.quote.slice(0, 80)}`}
                  aria-expanded={
                    activeMarker?.bookmarkId === marker.bookmark.id
                  }
                  aria-haspopup="dialog"
                  data-bookmark-highlight="true"
                  data-bookmark-id={marker.bookmark.id}
                  data-coherence-publisher-bookmark-ui="true"
                  data-paragraph-anchor={marker.startParagraphAnchor}
                  data-end-paragraph-anchor={marker.endParagraphAnchor}
                  data-start-offset={marker.startOffset}
                  data-end-offset={marker.endOffset}
                  data-reader-transient-ui="true"
                  onClick={() => openMarker(marker.bookmark.id, "active")}
                  onFocus={() => openMarker(marker.bookmark.id, "active")}
                  onMouseEnter={() => openMarker(marker.bookmark.id, "hover")}
                  onMouseLeave={() => queueHoverClose(marker.bookmark.id)}
                  style={{
                    height: `${marker.height}px`,
                    left: `${marker.left}px`,
                    top: `${marker.top}px`,
                  }}
                >
                  <span
                    className="reader-bookmark-highlight-line"
                    aria-hidden="true"
                  />
                  <span
                    className="reader-bookmark-highlight-icon"
                    aria-hidden="true"
                  >
                    <Bookmark />
                  </span>
                </button>
              </Popover.Anchor>
              <Popover.Portal>
                <Popover.Content
                  className="reader-bookmark-highlight-panel tooltip-surface"
                  role="dialog"
                  aria-label="Bookmark details"
                  side="top"
                  align="start"
                  sideOffset={10}
                  collisionPadding={12}
                  arrowPadding={12}
                  hideWhenDetached
                  data-coherence-publisher-bookmark-ui="true"
                  data-reader-transient-ui="true"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  onMouseEnter={clearHoverCloseTimer}
                  onMouseLeave={() => queueHoverClose(marker.bookmark.id)}
                >
                  <p className="reader-bookmark-highlight-quote">
                    {marker.bookmark.quote}
                  </p>
                  {marker.paragraphCount > 1 ? (
                    <p className="reader-bookmark-highlight-range">
                      {marker.paragraphCount.toLocaleString()} paragraphs
                    </p>
                  ) : null}
                  {editingNoteId === marker.bookmark.id ? (
                    <textarea
                      className="reader-bookmark-highlight-note-field"
                      defaultValue={marker.bookmark.note ?? ""}
                      maxLength={maxBookmarkNoteLength}
                      aria-label="Bookmark note"
                      autoFocus
                      onBlur={(event) => {
                        updateStoredBookmarks((current) =>
                          setBookmarkNote(
                            current,
                            marker.bookmark.id,
                            event.target.value,
                          )
                        );
                        setEditingNoteId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="reader-bookmark-highlight-note-button"
                      onClick={() => {
                        openMarker(marker.bookmark.id, "active");
                        setEditingNoteId(marker.bookmark.id);
                      }}
                    >
                      {marker.bookmark.note
                        ? marker.bookmark.note
                        : "Add a note"}
                    </button>
                  )}
                  {pendingRemovalId === marker.bookmark.id ? (
                    <div className="reader-bookmark-highlight-confirm">
                      <span>Remove this bookmark?</span>
                      <button
                        type="button"
                        onClick={() => setPendingRemovalId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="reader-bookmark-highlight-confirm-remove"
                        onClick={() => commitRemove(marker.bookmark)}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="reader-bookmark-highlight-remove"
                      onClick={() => {
                        openMarker(marker.bookmark.id, "active");
                        setPendingRemovalId(marker.bookmark.id);
                      }}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                      <span>Remove bookmark</span>
                    </button>
                  )}
                  <Popover.Arrow
                    className="reader-bookmark-highlight-arrow tooltip-arrow"
                    width={18}
                    height={9}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          ))}
        </>,
        document.body,
      );

  return (
    <>
      {selection
        ? createPortal(
            <Popover.Root open>
              <Popover.Anchor asChild>
                <span
                  className="reader-selection-anchor"
                  aria-hidden="true"
                  data-coherence-publisher-bookmark-ui="true"
                  data-reader-transient-ui="true"
                  style={{
                    top: `${selection.top}px`,
                    left: `${selection.left}px`,
                    width: "1px",
                    height: "1px",
                  }}
                />
              </Popover.Anchor>
              <Popover.Portal>
                <Popover.Content
                  className="reader-selection-bubble tooltip-surface"
                  side="top"
                  align="center"
                  sideOffset={8}
                  collisionPadding={10}
                  arrowPadding={12}
                  data-coherence-publisher-bookmark-ui="true"
                  data-reader-transient-ui="true"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                >
                  <button
                    type="button"
                    className="reader-selection-bubble-action"
                    onClick={save}
                  >
                    <Bookmark aria-hidden="true" size={13} strokeWidth={2.2} />
                    <span>Click to bookmark</span>
                  </button>
                  <Popover.Arrow
                    className="reader-selection-bubble-arrow tooltip-arrow"
                    width={18}
                    height={9}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>,
            document.body,
          )
        : null}
      {status
        ? createPortal(
            <div
              className="reader-copy-toast"
              data-coherence-publisher-bookmark-ui="true"
              data-copy-status={status === "saved" ? "copied" : "failed"}
              data-reader-transient-ui="true"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {status === "saved" ? (
                <Check aria-hidden="true" size={17} strokeWidth={2} />
              ) : (
                <TriangleAlert aria-hidden="true" size={17} strokeWidth={1.8} />
              )}
              <span>
                {status === "saved"
                  ? "Bookmark saved"
                  : status === "full"
                    ? `You have reached ${maxLiveBookmarks.toLocaleString()} bookmarks. Remove one to save another.`
                    : "Unable to save bookmark"}
              </span>
            </div>,
            document.body,
          )
        : null}
      {markerPortal}
    </>
  );
}
