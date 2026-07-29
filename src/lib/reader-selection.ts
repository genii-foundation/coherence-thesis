import {
  hasEnoughWords,
  maxBookmarkContextLength,
  maxBookmarkQuoteLength,
} from "./reader-bookmarks";

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
  paragraphAnchor: string;
  paragraphContentHash: string;
  quote: string;
  quoteOrdinal: number;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
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

export function readSelectionAnchor(
  selection: Selection | null,
): ReaderSelectionAnchor | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const block = elementFor(range.startContainer)?.closest<HTMLElement>(
    paragraphBlockSelector,
  );
  if (!block) return null;
  // Only manuscript prose is bookmarkable. Headings and navigation carry
  // paragraph anchors too, but a bookmark on a nav label is noise.
  if (!block.closest(".manuscript-prose")) return null;

  const paragraphAnchor = block.dataset.paragraphAnchor;
  if (!paragraphAnchor) return null;

  const sectionId = block
    .closest<HTMLElement>("[data-reader-section-id]")
    ?.dataset.readerSectionId;
  if (!sectionId) return null;

  // Clamp a cross-block selection to the block it started in. Every durable
  // anchor in this codebase is single-block, and inventing a range grammar that
  // spans two content-addressed paragraphs would break the moment either one is
  // edited.
  const clamped = range.cloneRange();
  if (!block.contains(range.endContainer)) {
    clamped.selectNodeContents(block);
    clamped.setStart(range.startContainer, range.startOffset);
  }

  const quote = clamped.toString().trim();
  if (!quote || !hasEnoughWords(quote)) return null;

  const before = block.ownerDocument.createRange();
  before.selectNodeContents(block);
  before.setEnd(clamped.startContainer, clamped.startOffset);
  // The trim above can shift the real start; re-find the quote from the raw
  // boundary so the stored offsets address the trimmed text.
  const rawStart = before.toString().length;
  const blockText = block.textContent ?? "";
  const startOffset = Math.max(rawStart, blockText.indexOf(quote, rawStart));
  const endOffset = startOffset + quote.length;

  const box = clamped.getBoundingClientRect();

  return {
    sectionId,
    paragraphAnchor,
    paragraphContentHash: block.dataset.paragraphContentHash ?? "",
    quote: quote.slice(0, maxBookmarkQuoteLength),
    quoteOrdinal: occurrenceOrdinal(blockText, quote, startOffset),
    prefix: blockText
      .slice(Math.max(0, startOffset - maxBookmarkContextLength), startOffset)
      .trimStart(),
    suffix: blockText
      .slice(endOffset, endOffset + maxBookmarkContextLength)
      .trimEnd(),
    startOffset,
    endOffset,
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
