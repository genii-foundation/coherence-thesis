"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bookmark, Search, Trash2 } from "lucide-react";
import {
  loadBreadcrumbShard,
  loadProgressSections,
  loadToolbarOutline,
  type BreadcrumbRoute,
  type ProgressSectionData,
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
  resolveBookmarkAnchor,
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
import { useLoadedData } from "@/lib/use-loaded-data";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";

const emptySections: ProgressSectionData[] = [];

type ResolvedBookmark = {
  bookmark: ReaderBookmark;
  section?: ProgressSectionData;
  href?: string;
  stale: boolean;
  // Volume, then the path down to the section. A bare section title is not
  // enough to place a passage across nine volumes with repeating structure.
  trail: string[];
};

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
  const {
    open,
    rendered,
    setOpen,
    toggle,
    containerRef,
    triggerProps,
    popoverProps,
  } = useToolbarMenu<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [turn, setTurn] = useState<{
    state: "offered" | "saved";
    id: number;
  } | null>(null);
  const turnTimerRef = useRef<number | null>(null);
  const turnIdRef = useRef(0);
  const bookmarks = useReaderBookmarks();
  // Already fetched on every route by ToolbarProgressIsland, so this is a
  // memoized cache hit rather than a second download. It carries every
  // paragraph anchor and content hash in the book, which is what makes
  // staleness resolvable for any bookmark from any page.
  const sections = useLoadedData(loadProgressSections, emptySections);
  // Volume labels come from the outline, the path within a volume from that
  // volume's breadcrumb shard. Both are memoized module loaders the outline and
  // breadcrumb surfaces already pull, so this is usually a cache hit.
  const outline = useLoadedData(loadToolbarOutline, emptyOutline);
  const [breadcrumbs, setBreadcrumbs] = useState<
    Record<string, BreadcrumbRoute[]>
  >({});

  const sectionsById = useMemo(() => {
    const map = new Map<string, ProgressSectionData>();
    for (const section of sections) map.set(section.sectionId, section);
    return map;
  }, [sections]);

  const resolved = useMemo<ResolvedBookmark[]>(() => {
    return liveBookmarks(bookmarks).map((bookmark) => {
      const section = sectionsById.get(bookmark.sectionId);
      if (!section) {
        return { bookmark, stale: false, trail: [bookmark.sectionId] };
      }
      const resolution = resolveBookmarkAnchor(bookmark, section.paragraphs);

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
          resolution.anchor ?? bookmark.paragraphAnchor,
        ),
        stale: resolution.status === "missing",
        trail,
      };
    });
  }, [bookmarks, breadcrumbs, outline, sectionsById]);

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

  // Fetch only the shards the saved bookmarks actually span, and only once the
  // panel has been opened. A reader with bookmarks in two volumes should not
  // pull nine.
  useEffect(() => {
    if (!open) return;
    const wanted = new Set<string>();
    for (const bookmark of liveBookmarks(bookmarks)) {
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
  }, [bookmarks, breadcrumbs, open, sectionsById]);

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

  const remove = useCallback((bookmark: ReaderBookmark) => {
    updateStoredBookmarks((current) => removeBookmark(current, bookmark.id));
    appendStoredEvent(
      createEngagementEvent("bookmark_removed", {
        sectionId: bookmark.sectionId,
        route: window.location.pathname,
        payload: { paragraphAnchor: bookmark.paragraphAnchor },
      }),
    );
  }, []);

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

  const total = resolved.length;

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
          <div className="bookmarks-scroll">
            {total === 0 && (
              <p className="quiet-copy bookmarks-empty">
                Select three or more words in the manuscript, then choose
                Bookmark to save the passage here.
              </p>
            )}
            {total > 0 && visible.length === 0 && (
              <p className="quiet-copy bookmarks-empty">
                No bookmarks match that filter.
              </p>
            )}
            {total > 0 && (
              <div className="bookmarks-summary">
                <span>
                  {total.toLocaleString()}{" "}
                  {total === 1 ? "bookmark" : "bookmarks"}
                </span>
                {staleCount > 0 && (
                  <span className="bookmarks-stale-tag">
                    {staleCount.toLocaleString()} revised
                  </span>
                )}
              </div>
            )}
            {visible.map((entry) => (
              <article key={entry.bookmark.id} className="bookmark-row">
                {entry.href ? (
                  <a className="bookmark-quote" href={entry.href}>
                    {entry.bookmark.quote}
                  </a>
                ) : (
                  <span className="bookmark-quote">{entry.bookmark.quote}</span>
                )}
                <p className="bookmark-meta">
                  <span className="bookmark-trail">
                    {entry.trail.map((crumb, crumbIndex) => (
                      <span key={crumb}>
                        {crumbIndex > 0 && (
                          <span className="bookmark-trail-sep" aria-hidden="true">
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
                      onClick={() => setEditingNoteId(entry.bookmark.id)}
                    >
                      {entry.bookmark.note ? entry.bookmark.note : "Add a note"}
                    </button>
                    <button
                      type="button"
                      className="icon-button bookmark-remove"
                      aria-label={`Remove bookmark: ${entry.bookmark.quote.slice(0, 60)}`}
                      onClick={() => remove(entry.bookmark)}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
