"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Bookmark, Search, Trash2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  loadBreadcrumbShard,
  loadBookmarkSections,
  loadToolbarOutline,
  type BookmarkSectionData,
  type BreadcrumbRoute,
  type ToolbarOutlineData,
} from "@/lib/reader-data";
import {
  bookmarkOfferedTurnMs,
  bookmarkSavedTurnMs,
  readerBookmarkOfferedEvent,
  readerBookmarkSavedEvent,
} from "@/lib/reader-bookmark-events";
import {
  bookmarkHref,
  bookmarkMatchesQuery,
  liveBookmarks,
  removeBookmark,
  resolveBookmarkPassage,
  setBookmarkNote,
  maxBookmarkNoteLength,
  type ReaderBookmark,
} from "@/lib/reader-bookmarks";
import { createEngagementEvent } from "@/lib/reader-engagement";
import {
  appendStoredEvent,
  updateStoredBookmarks,
  useReaderBookmarks,
} from "@/lib/reader-progress-store";
import { foldSearchText } from "@/lib/reader-text-search";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";

const deleteAllConfirmationText = "DELETE ALL";
const modalFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type ResolvedBookmark = {
  bookmark: ReaderBookmark;
  section?: BookmarkSectionData;
  href?: string;
  paragraphCount: number | null;
  stale: boolean;
  // Volume, then the path down to the section. A bare section title is not
  // enough to place a passage across nine volumes with repeating structure.
  trail: string[];
};

type PendingBookmarkDeletion =
  { kind: "single"; bookmark: ReaderBookmark } | { kind: "all" };

const emptyOutline: ToolbarOutlineData = {
  home: { title: "", href: "/" },
  overview: { title: "", href: "/overview/" },
  volumes: [],
};

// Breadcrumbs are sharded by volume, and a section's reader route always starts
// /manuscripts/<volumeId>/. Reading the shard key off the href avoids carrying a
// volume id on every bookmark.
function volumeKeyFromHref(href: string): string | null {
  return /^\/manuscripts\/([^/]+)\//.exec(href)?.[1] ?? null;
}

export function ToolbarBookmarksIsland() {
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const deleteAllInputRef = useRef<HTMLInputElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteModalOpenRef = useRef(false);
  const detailsLoadStartedRef = useRef(false);
  const {
    open,
    rendered,
    setOpen,
    toggle,
    containerRef,
    triggerProps,
    popoverProps,
  } = useToolbarMenu<HTMLDivElement>({
    floatingRefs: [deleteModalRef],
    onEscape: () => !deleteModalOpenRef.current,
  });
  const [query, setQuery] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] =
    useState<PendingBookmarkDeletion | null>(null);
  const [deleteAllEntry, setDeleteAllEntry] = useState("");
  const [turn, setTurn] = useState<{
    state: "offered" | "saved";
    id: number;
  } | null>(null);
  const turnTimerRef = useRef<number | null>(null);
  const turnIdRef = useRef(0);
  const bookmarks = useReaderBookmarks();
  const live = useMemo(() => liveBookmarks(bookmarks), [bookmarks]);
  const [sections, setSections] = useState<BookmarkSectionData[]>([]);
  const [outline, setOutline] = useState<ToolbarOutlineData>(emptyOutline);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<
    Record<string, BreadcrumbRoute[]>
  >({});

  const sectionsById = useMemo(() => {
    // Index each section under its current id and every id it has ever
    // published under, so a bookmark saved before a rename still resolves.
    // Legacy claims go in first and never displace one another; current ids go
    // in last so a live sectionId always beats another section's history.
    const map = new Map<string, BookmarkSectionData>();
    for (const section of sections) {
      for (const legacyId of section.legacySectionIds ?? []) {
        if (legacyId && !map.has(legacyId)) map.set(legacyId, section);
      }
    }
    for (const section of sections) map.set(section.sectionId, section);
    return map;
  }, [sections]);

  const resolved = useMemo<ResolvedBookmark[]>(() => {
    if (!open) return [];
    return live.map((bookmark) => {
      const section = sectionsById.get(bookmark.sectionId);
      if (!section) {
        // No section answers to this id under any lineage. That is the most
        // broken a bookmark can be, so it must read as stale, not healthy.
        return {
          bookmark,
          paragraphCount: null,
          stale: true,
          trail: [bookmark.sectionId],
        };
      }
      const resolution = resolveBookmarkPassage(bookmark, section.paragraphs);

      const volumeKey = volumeKeyFromHref(section.readerHref);
      const volume = outline.volumes.find(
        (candidate) => volumeKeyFromHref(candidate.href) === volumeKey,
      );
      const crumbs = (volumeKey ? (breadcrumbs[volumeKey] ?? []) : []).find(
        (route) => route.href === section.readerHref,
      )?.crumbs;
      const trail = [
        ...(volume ? [`Volume ${volume.numberLabel}`] : []),
        ...(crumbs?.map((crumb) => crumb.label) ?? [section.title]),
      ];

      return {
        bookmark,
        section,
        href: bookmarkHref(
          bookmark,
          section,
          resolution.startAnchor ?? bookmark.range.start.paragraphAnchor,
        ),
        paragraphCount:
          resolution.status === "missing"
            ? null
            : (() => {
                const startIndex = section.paragraphs.findIndex(
                  (paragraph) => paragraph.anchor === resolution.startAnchor,
                );
                const endIndex = section.paragraphs.findIndex(
                  (paragraph) => paragraph.anchor === resolution.endAnchor,
                );
                return startIndex >= 0 && endIndex >= startIndex
                  ? endIndex - startIndex + 1
                  : null;
              })(),
        stale:
          resolution.status === "missing" ||
          resolution.status === "reanchored",
        trail,
      };
    });
  }, [breadcrumbs, live, open, outline, sectionsById]);

  const foldedQuery = foldSearchText(query);
  const visible = useMemo(
    () =>
      resolved.filter((entry) =>
        bookmarkMatchesQuery(
          entry.bookmark,
          foldedQuery,
          entry.section?.title ?? "",
        ),
      ),
    [foldedQuery, resolved],
  );
  // TanStack Virtual owns a mutable measurement cache. React Compiler cannot
  // memoize that API safely, so this island deliberately stays uncompiled.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 166,
    getItemKey: (index) => visible[index]?.bookmark.id ?? index,
    overscan: 6,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [foldedQuery]);

  // Paragraph fingerprints are needed only for bookmark destination repair.
  // Keep that book-wide data and the outline out of Safari's heap until the
  // reader asks to see the menu.
  useEffect(() => {
    if (!open || detailsLoadStartedRef.current) return;
    detailsLoadStartedRef.current = true;
    setDetailsLoading(true);
    let active = true;
    let settled = false;

    Promise.allSettled([loadBookmarkSections(), loadToolbarOutline()]).then(
      ([sectionsResult, outlineResult]) => {
        settled = true;
        if (!active) return;
        if (sectionsResult.status === "fulfilled") {
          setSections(sectionsResult.value);
        } else {
          detailsLoadStartedRef.current = false;
        }
        if (outlineResult.status === "fulfilled") {
          setOutline(outlineResult.value);
        }
        setDetailsLoading(false);
      },
    );

    return () => {
      active = false;
      if (!settled) detailsLoadStartedRef.current = false;
    };
  }, [open]);

  // Fetch only the shards the saved bookmarks actually span, and only once the
  // panel has been opened. A reader with bookmarks in two volumes should not
  // pull nine.
  useEffect(() => {
    if (!open) return;
    const wanted = new Set<string>();
    for (const bookmark of live) {
      const section = sectionsById.get(bookmark.sectionId);
      const key = section ? volumeKeyFromHref(section.readerHref) : null;
      if (key && !(key in breadcrumbs)) wanted.add(key);
    }
    if (wanted.size === 0) return;

    let active = true;
    for (const key of wanted) {
      loadBreadcrumbShard(key)
        .then((routes) => {
          if (!active) return;
          setBreadcrumbs((current) => ({ ...current, [key]: routes }));
        })
        .catch(() => {
          // A missing shard costs the volume label and nothing else; the
          // section title still renders.
        });
    }
    return () => {
      active = false;
    };
  }, [breadcrumbs, live, open, sectionsById]);

  const staleCount = resolved.filter((entry) => entry.stale).length;

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setOpen(false);
      setQuery("");
      setEditingNoteId(null);
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [pathname, setOpen]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

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
  }, []);

  const closeDeleteModal = useCallback(
    (focusTarget: "trigger" | "search" = "trigger") => {
      deleteModalOpenRef.current = false;
      setPendingDeletion(null);
      setDeleteAllEntry("");
      window.setTimeout(() => {
        if (focusTarget === "search") searchRef.current?.focus();
        else deleteTriggerRef.current?.focus();
      }, 0);
    },
    [],
  );

  const requestSingleDelete = useCallback(
    (bookmark: ReaderBookmark, trigger: HTMLButtonElement) => {
      deleteTriggerRef.current = trigger;
      deleteModalOpenRef.current = true;
      setDeleteAllEntry("");
      setPendingDeletion({ kind: "single", bookmark });
    },
    [],
  );

  const requestDeleteAll = useCallback((trigger: HTMLButtonElement) => {
    deleteTriggerRef.current = trigger;
    deleteModalOpenRef.current = true;
    setDeleteAllEntry("");
    setPendingDeletion({ kind: "all" });
  }, []);

  const confirmDeletion = useCallback(() => {
    if (!pendingDeletion) return;
    if (pendingDeletion.kind === "single") {
      commitRemove(pendingDeletion.bookmark);
      closeDeleteModal("search");
      return;
    }
    if (deleteAllEntry !== deleteAllConfirmationText) return;

    const targets = live;
    const removedAt = Date.now();
    updateStoredBookmarks((current) =>
      targets.reduce(
        (next, bookmark) => removeBookmark(next, bookmark.id, removedAt),
        current,
      ),
    );
    appendStoredEvent(
      createEngagementEvent("bookmark_removed", {
        route: window.location.pathname,
        payload: { bulk: true, count: targets.length },
      }),
    );
    setQuery("");
    setEditingNoteId(null);
    closeDeleteModal("search");
  }, [
    closeDeleteModal,
    commitRemove,
    deleteAllEntry,
    live,
    pendingDeletion,
  ]);

  useEffect(() => {
    if (!pendingDeletion) return;
    const modalBackdrop = deleteModalRef.current;
    const siteShell = document.querySelector<HTMLElement>(".site-shell");
    const siteShellWasInert = siteShell?.inert ?? false;
    const rootOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;

    if (siteShell) siteShell.inert = true;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    function handleModalKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDeleteModal();
        return;
      }
      if (event.key !== "Tab" || !modalBackdrop) return;
      const focusableElements = Array.from(
        modalBackdrop.querySelectorAll<HTMLElement>(modalFocusableSelector),
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (!first || !last) return;

      const activeElement = document.activeElement;
      if (
        event.shiftKey &&
        (activeElement === first || !modalBackdrop.contains(activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === last || !modalBackdrop.contains(activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleModalKeys);
    const focusTimer = window.setTimeout(() => {
      if (pendingDeletion.kind === "all") deleteAllInputRef.current?.focus();
      else deleteCancelRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleModalKeys);
      if (siteShell) siteShell.inert = siteShellWasInert;
      document.documentElement.style.overflow = rootOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, [closeDeleteModal, pendingDeletion]);

  // The control answers two different questions with the same gesture.
  //
  // Selecting a passage turns it once over an outline back: an invitation,
  // saying this can be bookmarked and here is where that happens. Saving turns
  // it once over the solid back, so the fill is revealed by the motion rather
  // than faded in over it. A toast already says a bookmark saved; this says
  // where it went, which is what a reader who has never opened that panel
  // actually needs.
  useEffect(() => {
    const flipTo = (next: "offered" | "saved", ms: number) => {
      if (turnTimerRef.current !== null) {
        window.clearTimeout(turnTimerRef.current);
      }
      // The id remounts the card, which restarts the CSS animation cleanly so a
      // save arriving mid-offer replays rather than inheriting the tail of the
      // previous turn. Deliberately not requestAnimationFrame: rAF does not
      // fire at all while the document is hidden, which would leave the control
      // silently dead on a backgrounded tab.
      turnIdRef.current += 1;
      setTurn({ state: next, id: turnIdRef.current });
      turnTimerRef.current = window.setTimeout(() => {
        setTurn(null);
        turnTimerRef.current = null;
      }, ms + 80);
    };

    const onOffered = () => flipTo("offered", bookmarkOfferedTurnMs);
    const onSaved = () => flipTo("saved", bookmarkSavedTurnMs);

    window.addEventListener(readerBookmarkOfferedEvent, onOffered);
    window.addEventListener(readerBookmarkSavedEvent, onSaved);
    return () => {
      window.removeEventListener(readerBookmarkOfferedEvent, onOffered);
      window.removeEventListener(readerBookmarkSavedEvent, onSaved);
      if (turnTimerRef.current !== null) {
        window.clearTimeout(turnTimerRef.current);
      }
    };
  }, []);

  const total = live.length;

  return (
    <div className="bookmarks-menu" ref={containerRef}>
      <button
        {...triggerProps}
        type="button"
        className={`bookmarks-menu-button${turn ? ` is-bookmark-${turn.state}` : ""}`}
        aria-label={
          total === 0
            ? "Bookmarks, none saved"
            : `Bookmarks, ${total.toLocaleString()} saved`
        }
        aria-controls="site-bookmarks-menu"
        onClick={toggle}
      >
        {/* Two real faces rather than a crossfade. The card carries the
            rotation and each face hides its own back, so the solid glyph is
            genuinely behind the outline and the turn is what reveals it. The
            bookmark shape is left-right symmetric, so the mirrored back needs
            no compensating flip. */}
        <span key={turn?.id ?? 0} className="bookmark-card" aria-hidden="true">
          <span className="bookmark-face">
            <Bookmark size={17} />
          </span>
          <span className="bookmark-face bookmark-face-back">
            <Bookmark size={17} />
          </span>
        </span>
      </button>
      {rendered && (
        <section
          {...popoverProps}
          id="site-bookmarks-menu"
          className="bookmarks-popover"
          aria-label="Bookmarks"
        >
          <label className="bookmarks-search">
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">Filter bookmarks</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter bookmarks"
              autoComplete="off"
            />
          </label>
          <div
            className="bookmarks-scroll"
            ref={scrollRef}
            aria-busy={detailsLoading}
          >
            {detailsLoading && total > 0 && (
              <p className="sr-only" role="status">
                Loading bookmark destinations.
              </p>
            )}
            {total === 0 && (
              <p className="quiet-copy bookmarks-empty">
                Keep what finds you. Select three or more words, then choose
                Bookmark.
              </p>
            )}
            {total > 0 && visible.length === 0 && (
              <p className="quiet-copy bookmarks-empty">
                No bookmarks match that filter.
              </p>
            )}
            {visible.length > 0 && (
              <div
                className="bookmarks-virtual-list"
                role="list"
                style={{ height: rowVirtualizer.getTotalSize() }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const entry = visible[virtualRow.index];
                  if (!entry) return null;
                  return (
                    <div
                      key={virtualRow.key}
                      ref={rowVirtualizer.measureElement}
                      className="bookmark-virtual-row"
                      data-index={virtualRow.index}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <article
                        className="bookmark-row"
                        role="listitem"
                        aria-posinset={virtualRow.index + 1}
                        aria-setsize={visible.length}
                      >
                        {entry.href ? (
                          <a className="bookmark-quote" href={entry.href}>
                            {entry.bookmark.quote}
                          </a>
                        ) : (
                          <span className="bookmark-quote">
                            {entry.bookmark.quote}
                          </span>
                        )}
                        <p className="bookmark-meta">
                          <span className="bookmark-trail">
                            {entry.trail.map((crumb, crumbIndex) => (
                              <span key={crumb}>
                                {crumbIndex > 0 && (
                                  <span
                                    className="bookmark-trail-sep"
                                    aria-hidden="true"
                                  >
                                    ›
                                  </span>
                                )}
                                {crumb}
                              </span>
                            ))}
                          </span>
                          {entry.stale && (
                            <span className="bookmarks-stale-tag">
                              revised since you saved it
                            </span>
                          )}
                          {(entry.paragraphCount ?? 0) > 1 && (
                            <span className="bookmarks-range-tag">
                              {entry.paragraphCount!.toLocaleString()} paragraphs
                            </span>
                          )}
                        </p>
                        {editingNoteId === entry.bookmark.id ? (
                          <textarea
                            className="bookmark-note-field"
                            defaultValue={entry.bookmark.note ?? ""}
                            maxLength={maxBookmarkNoteLength}
                            aria-label="Bookmark note"
                            autoFocus
                            onBlur={(event) => {
                              updateStoredBookmarks((current) =>
                                setBookmarkNote(
                                  current,
                                  entry.bookmark.id,
                                  event.target.value,
                                ),
                              );
                              setEditingNoteId(null);
                            }}
                          />
                        ) : (
                          <div className="bookmark-actions">
                            <button
                              type="button"
                              className="bookmark-note-button"
                              onClick={() =>
                                setEditingNoteId(entry.bookmark.id)
                              }
                            >
                              {entry.bookmark.note
                                ? entry.bookmark.note
                                : "Add a note"}
                            </button>
                            <button
                              type="button"
                              className="icon-button bookmark-remove"
                              aria-label={`Remove bookmark: ${entry.bookmark.quote.slice(0, 60)}`}
                              onClick={(event) =>
                                requestSingleDelete(
                                  entry.bookmark,
                                  event.currentTarget,
                                )
                              }
                            >
                              <Trash2 aria-hidden="true" size={15} />
                            </button>
                          </div>
                        )}
                      </article>
                    </div>
                  );
                })}
              </div>
            )}
            {total > 0 && (
              <div className="bookmarks-summary">
                <span className="bookmarks-summary-count">
                  <span>
                    {total.toLocaleString()}{" "}
                    {total === 1 ? "bookmark" : "bookmarks"}
                  </span>
                  {staleCount > 0 && (
                    <span className="bookmarks-stale-tag">
                      {staleCount.toLocaleString()} revised
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="bookmark-delete-all"
                  onClick={(event) => requestDeleteAll(event.currentTarget)}
                >
                  Delete all
                </button>
              </div>
            )}
          </div>
        </section>
      )}
      {pendingDeletion && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={deleteModalRef}
              className="bookmark-delete-modal-backdrop"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) closeDeleteModal();
              }}
            >
              <div
                className="bookmark-delete-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bookmark-delete-modal-title"
                aria-describedby="bookmark-delete-modal-description"
              >
                <Trash2 aria-hidden="true" size={20} />
                <div className="bookmark-delete-modal-copy">
                  <h2 id="bookmark-delete-modal-title">
                    {pendingDeletion.kind === "single"
                      ? "Delete this bookmark?"
                      : "Delete all bookmarks?"}
                  </h2>
                  <p id="bookmark-delete-modal-description">
                    {pendingDeletion.kind === "single"
                      ? "This removes the saved passage and its note. If cloud sync is connected, the deletion will also sync to your account and other devices."
                      : `This removes all ${total.toLocaleString()} bookmarks and their notes. If cloud sync is connected, the deletions will also sync to your account and other devices.`}
                  </p>
                  {pendingDeletion.kind === "single" && (
                    <blockquote>{pendingDeletion.bookmark.quote}</blockquote>
                  )}
                </div>
                {pendingDeletion.kind === "all" && (
                  <label className="bookmark-delete-modal-field">
                    <span>
                      Type <strong>{deleteAllConfirmationText}</strong> to
                      confirm
                    </span>
                    <input
                      ref={deleteAllInputRef}
                      type="text"
                      value={deleteAllEntry}
                      onChange={(event) =>
                        setDeleteAllEntry(event.target.value)
                      }
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                )}
                <div className="bookmark-delete-modal-actions">
                  <button
                    ref={deleteCancelRef}
                    type="button"
                    className="secondary-link"
                    onClick={() => closeDeleteModal()}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="icon-button bookmark-confirm-delete"
                    disabled={
                      pendingDeletion.kind === "all" &&
                      deleteAllEntry !== deleteAllConfirmationText
                    }
                    onClick={confirmDeletion}
                  >
                    <Trash2 aria-hidden="true" size={17} />
                    <span>
                      {pendingDeletion.kind === "single"
                        ? "Delete bookmark"
                        : "Delete all bookmarks"}
                    </span>
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
