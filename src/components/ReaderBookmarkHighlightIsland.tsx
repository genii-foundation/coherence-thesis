"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import { Bookmark, Trash2 } from "lucide-react";
import type { ProgressSection } from "@/lib/manuscript-data";
import {
  bookmarksForSection,
  maxBookmarkNoteLength,
  removeBookmark,
  resolveBookmarkAnchor,
  setBookmarkNote,
  type ReaderBookmark,
} from "@/lib/reader-bookmarks";
import { createEngagementEvent } from "@/lib/reader-engagement";
import {
  appendStoredEvent,
  updateStoredBookmarks,
  useReaderBookmarks,
} from "@/lib/reader-progress-store";
import { paragraphBlockSelector } from "@/lib/reader-selection";

type BookmarkHighlightMarker = {
  bookmark: ReaderBookmark;
  height: number;
  left: number;
  top: number;
};

type ActiveMarker = {
  bookmarkId: string;
  mode: "active" | "hover";
} | null;

// Saved passages are marked beside the prose rather than wrapped or painted
// behind the words. The reader's audio island changes classes on word spans
// imperatively, so this island must not mutate that same manuscript subtree.
// Document-positioned portal markers preserve the text DOM and scroll with it.

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

  return null;
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
  const [markers, setMarkers] = useState<BookmarkHighlightMarker[]>([]);
  const [activeMarker, setActiveMarker] = useState<ActiveMarker>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const hoverCloseTimer = useRef<number | null>(null);

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

  const closeMarker = useCallback(
    (bookmarkId: string) => {
      clearHoverCloseTimer();
      setActiveMarker((current) =>
        current?.bookmarkId === bookmarkId ? null : current,
      );
      setEditingNoteId(null);
      setPendingRemovalId(null);
    },
    [clearHoverCloseTimer],
  );

  const queueHoverClose = useCallback(
    (bookmarkId: string) => {
      clearHoverCloseTimer();
      hoverCloseTimer.current = window.setTimeout(() => {
        setActiveMarker((current) =>
          current?.bookmarkId === bookmarkId && current.mode === "hover"
            ? null
            : current,
        );
        hoverCloseTimer.current = null;
      }, 120);
    },
    [clearHoverCloseTimer],
  );

  const commitRemove = useCallback(
    (bookmark: ReaderBookmark) => {
      updateStoredBookmarks((current) => removeBookmark(current, bookmark.id));
      appendStoredEvent(
        createEngagementEvent("bookmark_removed", {
          sectionId: bookmark.sectionId,
          route: window.location.pathname,
          payload: { paragraphAnchor: bookmark.paragraphAnchor },
        }),
      );
      closeMarker(bookmark.id);
    },
    [closeMarker],
  );

  useEffect(() => {
    if (!enabled || typeof CSS.escape !== "function") return;

    let frame = 0;
    let disposed = false;

    const measure = () => {
      if (disposed) return;

      const nextMarkers: BookmarkHighlightMarker[] = [];
      for (const section of sections) {
        for (const bookmark of bookmarksForSection(bookmarks, section)) {
          const block = blockFor(section, bookmark);
          if (!block) continue;
          const range = rangeForOffsets(
            block,
            bookmark.startOffset,
            bookmark.endOffset,
          );
          if (!range) continue;

          const boxes = Array.from(range.getClientRects()).filter(
            (box) => box.width > 0 && box.height > 0,
          );
          if (boxes.length === 0) continue;

          const prose = block.closest<HTMLElement>(".manuscript-prose");
          const proseBox = (prose ?? block).getBoundingClientRect();
          const top = Math.min(...boxes.map((box) => box.top));
          const bottom = Math.max(...boxes.map((box) => box.bottom));
          const isDesktop = window.matchMedia("(min-width: 641px)").matches;

          nextMarkers.push({
            bookmark,
            height: Math.max(44, bottom - top + 4),
            left:
              Math.max(
                isDesktop ? 4 : 0,
                proseBox.left - (isDesktop ? 54 : 24),
              ) + window.scrollX,
            top: Math.max(0, top - 2) + window.scrollY,
          });
        }
      }

      setMarkers(nextMarkers);
    };

    const requestMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    requestMeasure();
    window.addEventListener("resize", requestMeasure);

    const resizeObserver = new ResizeObserver(requestMeasure);
    for (const section of sections) {
      const sectionRoot = document.querySelector<HTMLElement>(
        `[data-reader-section-id="${CSS.escape(section.sectionId)}"]`,
      );
      const prose =
        sectionRoot?.querySelector<HTMLElement>(".manuscript-prose");
      if (prose) resizeObserver.observe(prose);
    }

    const rootObserver = new MutationObserver(requestMeasure);
    rootObserver.observe(document.documentElement, {
      attributeFilter: ["style"],
    });

    void document.fonts?.ready.then(requestMeasure);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", requestMeasure);
      resizeObserver.disconnect();
      rootObserver.disconnect();
    };
  }, [bookmarks, enabled, sections]);

  useEffect(() => clearHoverCloseTimer, [clearHoverCloseTimer]);

  if (!enabled || markers.length === 0 || typeof document === "undefined") {
    return null;
  }

  return createPortal(
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
              aria-expanded={activeMarker?.bookmarkId === marker.bookmark.id}
              aria-haspopup="dialog"
              data-bookmark-highlight="true"
              data-bookmark-id={marker.bookmark.id}
              data-paragraph-anchor={marker.bookmark.paragraphAnchor}
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
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              onMouseEnter={clearHoverCloseTimer}
              onMouseLeave={() => queueHoverClose(marker.bookmark.id)}
            >
              <p className="reader-bookmark-highlight-quote">
                {marker.bookmark.quote}
              </p>
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
                      ),
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
                  {marker.bookmark.note ? marker.bookmark.note : "Add a note"}
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
}
