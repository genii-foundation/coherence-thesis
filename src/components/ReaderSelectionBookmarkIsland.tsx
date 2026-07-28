"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import { Bookmark, Check, TriangleAlert } from "lucide-react";
import type { ProgressSection } from "@/lib/manuscript-data";
import {
  addBookmark,
  canAddBookmark,
  maxLiveBookmarks,
} from "@/lib/reader-bookmarks";
import {
  announceBookmarkOffered,
  announceBookmarkSaved,
} from "@/lib/reader-bookmark-events";
import { createEngagementEvent } from "@/lib/reader-engagement";
import {
  appendStoredEvent,
  updateStoredBookmarks,
} from "@/lib/reader-progress-store";
import {
  readSelectionAnchor,
  type ReaderSelectionAnchor,
} from "@/lib/reader-selection";

type SaveStatus = "saved" | "full" | "failed" | null;

const bubbleClassName = "reader-selection-bubble";

// How long a selection must hold still before the bubble appears, when the
// trigger was selectionchange rather than the end of a pointer gesture. Long
// enough that dragging a touch handle across a paragraph does not strobe.
const selectionSettleMs = 250;

export function ReaderSelectionBookmarkIsland({
  sections,
}: {
  sections: ProgressSection[];
}) {
  const [anchor, setAnchor] = useState<ReaderSelectionAnchor | null>(null);
  const [status, setStatus] = useState<SaveStatus>(null);
  const sectionsRef = useRef(sections);
  const statusTimerRef = useRef<number | null>(null);
  const anchorRef = useRef<ReaderSelectionAnchor | null>(null);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    anchorRef.current = anchor;
  }, [anchor]);

  const clearStatusTimer = useCallback(() => {
    if (statusTimerRef.current === null) return;
    window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = null;
  }, []);

  const showStatus = useCallback(
    (next: SaveStatus) => {
      clearStatusTimer();
      setStatus(next);
      statusTimerRef.current = window.setTimeout(() => {
        setStatus(null);
        statusTimerRef.current = null;
      }, 2400);
    },
    [clearStatusTimer],
  );

  const save = useCallback(() => {
    const target = anchorRef.current;
    if (!target) return;
    const section = sectionsRef.current.find(
      (candidate) => candidate.sectionId === target.sectionId,
    );
    if (!section) return;

    // Ask the state the updater actually saw, not a re-read. readStoredBookmarks
    // re-parses storage and returns a fresh object every call, so comparing
    // references across two reads is always unequal and would report success
    // for a save the cap refused.
    let refused = false;
    updateStoredBookmarks((current) => {
      if (!canAddBookmark(current)) {
        refused = true;
        return current;
      }
      return addBookmark(current, {
        section,
        paragraphAnchor: target.paragraphAnchor,
        quote: target.quote,
        quoteOrdinal: target.quoteOrdinal,
        prefix: target.prefix,
        suffix: target.suffix,
        startOffset: target.startOffset,
        endOffset: target.endOffset,
      });
    }, "add");

    if (refused) {
      showStatus("full");
      return;
    }

    appendStoredEvent(
      createEngagementEvent("bookmark_added", {
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        route: window.location.pathname,
        payload: { paragraphAnchor: target.paragraphAnchor },
      }),
    );

    showStatus("saved");
    // Pulses the toolbar trigger. The toast says it saved; this says where.
    announceBookmarkSaved();
    setAnchor(null);
    window.getSelection()?.removeAllRanges();
  }, [showStatus]);

  useEffect(() => {
    // Reading on pointerup and keyup rather than on selectionchange: the
    // selection is not final until the gesture ends, and selectionchange fires
    // on every pixel of a drag. selectionchange is still used, but only to tear
    // the bubble down the moment the selection collapses.
    // A timer, not requestAnimationFrame. The deferral exists because the
    // selection is not final until the gesture has fully settled, and rAF does
    // not fire at all while the document is hidden, which would leave the
    // bubble permanently dead on a backgrounded tab.
    let timer: number | null = null;
    let pointerDown = false;

    const scheduleRead = (delayMs: number) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        // Mid-drag the selection is still growing, and a bubble that chased the
        // cursor would sit under it. Wait for the release.
        if (pointerDown) return;
        const next = readSelectionAnchor(window.getSelection());
        // Announce only on the transition into a bookmarkable selection.
        // Extending a selection re-reads the anchor continuously, and a control
        // that turned over on every one of those would be intolerable.
        if (next && !anchorRef.current) announceBookmarkOffered();
        setAnchor(next);
      }, delayMs);
    };

    const insideBubble = (event: Event) =>
      event.target instanceof Element &&
      event.target.closest(`.${bubbleClassName}`) !== null;

    const refresh = (event: Event) => {
      if (insideBubble(event)) return;
      scheduleRead(0);
    };

    // selectionchange is the primary trigger, not just a teardown signal.
    // Touch devices do not select text with a pointer drag: the platform takes
    // over on long press and moves its own handles, and the page may never see
    // a pointerup for those adjustments. selectionchange is the one event every
    // input method produces, so mouse, touch, and shift-arrow keyboard
    // selection all surface the bubble through the same path.
    const onSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        setAnchor(null);
        return;
      }
      scheduleRead(selectionSettleMs);
    };

    // Pressing the bubble must not tear it down before the click resolves,
    // which is why this carries the same in-bubble guard refresh has.
    const onPointerDown = (event: Event) => {
      if (insideBubble(event)) return;
      pointerDown = true;
      setAnchor(null);
    };

    const onPointerUp = (event: Event) => {
      if (insideBubble(event)) return;
      pointerDown = false;
      refresh(event);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAnchor(null);
        return;
      }
      // Keyboard path to save, which the audio word tooltip has never had.
      // Alt is used rather than a bare letter so it cannot fire while the
      // reader is typing in the search or filter fields.
      if (event.altKey && (event.key === "b" || event.key === "B")) {
        if (!anchorRef.current) return;
        event.preventDefault();
        save();
      }
    };

    // A reader can finish selecting before this island hydrates, and a
    // selection made in that window emits its selectionchange into nothing.
    // Read once on mount so an already-selected passage still gets its offer
    // instead of requiring the reader to select it a second time.
    scheduleRead(0);

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keyup", refresh);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keyup", refresh);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [save]);

  useEffect(() => clearStatusTimer, [clearStatusTimer]);

  if (typeof document === "undefined") return null;

  return (
    <>
      {anchor
        ? createPortal(
            <Popover.Root open>
              <Popover.Anchor asChild>
                <span
                  className="reader-selection-anchor"
                  aria-hidden="true"
                  style={{
                    top: `${anchor.top}px`,
                    left: `${anchor.left}px`,
                    width: `${anchor.width}px`,
                    height: `${anchor.height}px`,
                  }}
                />
              </Popover.Anchor>
              <Popover.Portal>
                <Popover.Content
                  className={`${bubbleClassName} tooltip-surface`}
                  side="top"
                  align="center"
                  sideOffset={8}
                  collisionPadding={10}
                  arrowPadding={12}
                  // Taking focus would collapse the selection the bubble exists
                  // to act on.
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
              data-copy-status={status === "saved" ? "copied" : "failed"}
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
    </>
  );
}
