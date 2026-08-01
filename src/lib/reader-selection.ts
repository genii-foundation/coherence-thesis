import {
  hasEnoughWords,
  maxBookmarkContextLength,
} from "./reader-bookmarks";
import {
  createReaderPassageRange,
  type ReaderPassageRange,
} from "./reader-passage-range";

// Resolving a browser text selection to a durable manuscript anchor.
//
// The unit is the paragraph block, not the word. Word spans carry char offsets
// and look like the obvious choice, but MarkdownBody only emits them when it is
// given a sectionId, and ChapterReader does not pass one, so 52 multi-section
// chapters covering 207 sections have no word spans at all. The whitespace
// between word spans is also a bare text node, so a selection boundary landing
// in a gap has the block as its parent and a walk up to [data-audio-word]
// returns null. Blocks carry data-paragraph-anchor on every route.
//
// Offsets are into the block element's visible textContent, which is one
// coordinate space and only one. The codebase already has three that do not
// interconvert (raw markdown, stripMarkdown text, and the rendered text that
// data-audio-char-start counts with its +2 per block gap), so this deliberately
// joins none of them.

export const paragraphBlockSelector = "[data-paragraph-anchor]";

export type ReaderSelectionAnchor = {
  sectionId: string;
  range: ReaderPassageRange;
  quote: string;
  quoteOrdinal: number;
  prefix: string;
  suffix: string;
  // Document coordinates, so the bubble anchor tracks the page as it scrolls
  // rather than detaching the way a viewport-fixed snapshot would.
  top: number;
  left: number;
  width: number;
  height: number;
};

function elementFor(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

// Count of complete earlier occurrences of `quote` in `text` before `startOffset`.
// Disambiguates a quote that repeats inside its own paragraph.
function occurrenceOrdinal(
  text: string,
  quote: string,
  startOffset: number,
): number {
  if (!quote) return 0;
  let ordinal = 0;
  let index = text.indexOf(quote);
  while (index >= 0 && index < startOffset) {
    ordinal += 1;
    index = text.indexOf(quote, index + 1);
  }
  return ordinal;
}

function visibleOffset(
  block: HTMLElement,
  container: Node,
  offset: number,
): number | null {
  try {
    const before = block.ownerDocument.createRange();
    before.selectNodeContents(block);
    before.setEnd(container, offset);
    return before.toString().length;
  } catch {
    return null;
  }
}

export function readSelectionAnchor(
  selection: Selection | null,
): ReaderSelectionAnchor | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const startBlock = elementFor(range.startContainer)?.closest<HTMLElement>(
    paragraphBlockSelector,
  );
  const endBlock = elementFor(range.endContainer)?.closest<HTMLElement>(
    paragraphBlockSelector,
  );
  if (!startBlock || !endBlock) return null;
  // Only manuscript prose is bookmarkable. Headings and navigation carry
  // paragraph anchors too, but a bookmark on a nav label is noise.
  const prose = startBlock.closest<HTMLElement>(".manuscript-prose");
  if (!prose || endBlock.closest(".manuscript-prose") !== prose) return null;

  const startSection = startBlock.closest<HTMLElement>(
    "[data-reader-section-id]",
  );
  const endSection = endBlock.closest<HTMLElement>("[data-reader-section-id]");
  const sectionId = startSection?.dataset.readerSectionId;
  // A passage range belongs to exactly one section. Chapter routes render
  // several sections in one prose surface, so sharing a manuscript container
  // alone is not enough to establish that invariant.
  if (!sectionId || endSection?.dataset.readerSectionId !== sectionId) return null;

  const blocks = Array.from(
    prose.querySelectorAll<HTMLElement>(paragraphBlockSelector),
  );
  const initialStartIndex = blocks.indexOf(startBlock);
  const initialEndIndex = blocks.indexOf(endBlock);
  if (
    initialStartIndex < 0 ||
    initialEndIndex < initialStartIndex
  ) {
    return null;
  }

  const rawStartOffset = visibleOffset(
    startBlock,
    range.startContainer,
    range.startOffset,
  );
  const rawEndOffset = visibleOffset(
    endBlock,
    range.endContainer,
    range.endOffset,
  );
  if (rawStartOffset === null || rawEndOffset === null) return null;

  const selectedBlocks = blocks.slice(initialStartIndex, initialEndIndex + 1);
  const parts = selectedBlocks.map((block, index) => {
    const text = block.textContent ?? "";
    const start = index === 0 ? rawStartOffset : 0;
    const end = index === selectedBlocks.length - 1 ? rawEndOffset : text.length;
    return text.slice(start, end);
  });

  const firstPartIndex = parts.findIndex((part) => /\S/.test(part));
  if (firstPartIndex < 0) return null;
  let lastPartIndex = parts.length - 1;
  while (lastPartIndex >= firstPartIndex && !/\S/.test(parts[lastPartIndex] ?? "")) {
    lastPartIndex -= 1;
  }

  const firstPart = parts[firstPartIndex]!;
  const lastPart = parts[lastPartIndex]!;
  const leadingWhitespace = firstPart.length - firstPart.trimStart().length;
  const trailingWhitespace = lastPart.length - lastPart.trimEnd().length;
  const startIndex = initialStartIndex + firstPartIndex;
  const endIndex = initialStartIndex + lastPartIndex;
  const selectedStartBlock = blocks[startIndex]!;
  const selectedEndBlock = blocks[endIndex]!;
  const startOffset =
    (firstPartIndex === 0 ? rawStartOffset : 0) + leadingWhitespace;
  const endOffset =
    (lastPartIndex === selectedBlocks.length - 1
      ? rawEndOffset
      : (selectedEndBlock.textContent ?? "").length) - trailingWhitespace;
  const quoteParts = parts.slice(firstPartIndex, lastPartIndex + 1);
  quoteParts[0] = quoteParts[0]!.trimStart();
  quoteParts[quoteParts.length - 1] =
    quoteParts[quoteParts.length - 1]!.trimEnd();
  const quote = quoteParts.join("\n\n");
  if (!quote || !hasEnoughWords(quote)) return null;

  const startAnchor = selectedStartBlock.dataset.paragraphAnchor;
  const endAnchor = selectedEndBlock.dataset.paragraphAnchor;
  if (!startAnchor || !endAnchor) return null;
  const startText = selectedStartBlock.textContent ?? "";
  const endText = selectedEndBlock.textContent ?? "";
  const box = range.getBoundingClientRect();

  return {
    sectionId,
    range: createReaderPassageRange(
      {
        paragraphAnchor: startAnchor,
        paragraphContentHash:
          selectedStartBlock.dataset.paragraphContentHash ?? "",
        offset: startOffset,
      },
      {
        paragraphAnchor: endAnchor,
        paragraphContentHash:
          selectedEndBlock.dataset.paragraphContentHash ?? "",
        offset: endOffset,
      },
    ),
    quote,
    quoteOrdinal:
      startIndex === endIndex
        ? occurrenceOrdinal(startText, quote, startOffset)
        : 0,
    prefix: startText
      .slice(Math.max(0, startOffset - maxBookmarkContextLength), startOffset)
      .trimStart(),
    suffix: endText
      .slice(endOffset, endOffset + maxBookmarkContextLength)
      .trimEnd(),
    top: box.top + window.scrollY,
    left: box.left + window.scrollX,
    width: box.width,
    height: box.height,
  };
}

export function selectionIsActive(): boolean {
  const selection =
    typeof window === "undefined" ? null : window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.rangeCount > 0);
}
