"use client";

import { useEffect, useState } from "react";
import type { ProgressSection } from "@/lib/manuscript-data";
import {
  bookmarksForSection,
  resolveBookmarkAnchor,
  type ReaderBookmark,
} from "@/lib/reader-bookmarks";
import { useReaderBookmarks } from "@/lib/reader-progress-store";
import { paragraphBlockSelector } from "@/lib/reader-selection";

// Paints saved passages back into the prose, off by default behind the reader
// preference.
//
// The CSS Custom Highlight API rather than wrapping text in elements. Wrapping
// would mean mutating the same manuscript DOM that
// ReaderAudioWordInteractionIsland already mutates imperatively, adding and
// removing is-audio-current and is-audio-focused on .audio-word spans outside
// React and appending its own portal target into a live word. Two uncoordinated
// mutators over one subtree is how you get a highlight that eats a word span
// mid-playback. Highlight ranges live beside the DOM instead of inside it, so
// nothing here can disturb a single node.
//
// Where the API is missing the feature simply does not paint. A wrapped-span
// fallback would reintroduce exactly the mutation this avoids, for a decorative
// feature the reader opted into, which is a bad trade.
const highlightName = "coherence-bookmark";

function supportsHighlights(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof Highlight === "function"
  );
}

// The one place in this codebase that styles from JavaScript, and it is not a
// preference. The ::highlight() pseudo-element cannot go in globals.css:
// lightningcss 1.32.0, which Next bundles, does not recognize it and emits
// "Parsing CSS source code failed" on every build. It passes the rule through
// intact, so the feature worked either way, but a permanent parse warning is
// how real CSS errors get ignored later.
//
// A constructed stylesheet is safe to reach for here because every browser that
// implements CSS.highlights also implements adoptedStyleSheets, and this runs
// only after supportsHighlights(). The colour comes from a custom property in
// globals.css so theming still lives with the rest of the theme.
let highlightSheet: CSSStyleSheet | null = null;

function ensureHighlightStyle(): void {
  if (highlightSheet || !("adoptedStyleSheets" in document)) return;
  highlightSheet = new CSSStyleSheet();
  highlightSheet.replaceSync(
    `::highlight(${highlightName}){background-color:var(--bookmark-highlight);color:var(--ink);}`,
  );
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, highlightSheet];
}

// Walk the block's text nodes accumulating length until the stored character
// offsets land, which is the same visible-text coordinate space the offsets
// were captured in.
function rangeForOffsets(
  block: HTMLElement,
  startOffset: number,
  endOffset: number,
): Range | null {
  const walker = block.ownerDocument.createTreeWalker(
    block,
    NodeFilter.SHOW_TEXT,
  );
  const range = block.ownerDocument.createRange();
  let consumed = 0;
  let started = false;
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent?.length ?? 0;
    if (!started && consumed + length >= startOffset) {
      range.setStart(node, Math.max(0, startOffset - consumed));
      started = true;
    }
    if (started && consumed + length >= endOffset) {
      range.setEnd(node, Math.max(0, endOffset - consumed));
      return range;
    }
    consumed += length;
    node = walker.nextNode();
  }

  return started ? null : null;
}

function blockFor(
  section: ProgressSection,
  bookmark: ReaderBookmark,
): HTMLElement | null {
  const resolution = resolveBookmarkAnchor(bookmark, section.paragraphs);
  if (!resolution.anchor) return null;
  const sectionRoot = document.querySelector<HTMLElement>(
    `[data-reader-section-id="${CSS.escape(section.sectionId)}"]`,
  );
  if (!sectionRoot) return null;
  return sectionRoot.querySelector<HTMLElement>(
    `${paragraphBlockSelector}[data-paragraph-anchor="${CSS.escape(resolution.anchor)}"]`,
  );
}

// The preference lives as a data attribute on the root, set by
// applyReaderPreferences and by the pre-paint bootstrap script. There is no
// preferences store to subscribe to, so watch the attribute itself; that also
// picks up the bootstrap write before hydration without a second source of
// truth.
function useHighlightPreference(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const read = () =>
      setEnabled(document.documentElement.dataset.readerHighlights === "on");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributeFilter: ["data-reader-highlights"],
    });
    return () => observer.disconnect();
  }, []);

  return enabled;
}

export function ReaderBookmarkHighlightIsland({
  sections,
}: {
  sections: ProgressSection[];
}) {
  const bookmarks = useReaderBookmarks();
  const enabled = useHighlightPreference();

  useEffect(() => {
    if (!supportsHighlights() || typeof CSS.escape !== "function") return;

    if (!enabled) {
      CSS.highlights.delete(highlightName);
      return;
    }

    ensureHighlightStyle();

    const ranges: Range[] = [];
    for (const section of sections) {
      for (const bookmark of bookmarksForSection(bookmarks, section)) {
        const block = blockFor(section, bookmark);
        if (!block) continue;
        const range = rangeForOffsets(
          block,
          bookmark.startOffset,
          bookmark.endOffset,
        );
        if (range) ranges.push(range);
      }
    }

    if (ranges.length === 0) {
      CSS.highlights.delete(highlightName);
      return;
    }

    CSS.highlights.set(highlightName, new Highlight(...ranges));
    return () => {
      CSS.highlights.delete(highlightName);
    };
  }, [bookmarks, enabled, sections]);

  return null;
}
