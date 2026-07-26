"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bookmark, Download, Search, Trash2 } from "lucide-react";
import { loadProgressSections, type ProgressSectionData } from "@/lib/reader-data";
import {
  bookmarkHref,
  bookmarkMatchesQuery,
  exportBookmarksMarkdown,
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
};

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
  const bookmarks = useReaderBookmarks();
  // Already fetched on every route by ToolbarProgressIsland, so this is a
  // memoized cache hit rather than a second download. It carries every
  // paragraph anchor and content hash in the book, which is what makes
  // staleness resolvable for any bookmark from any page.
  const sections = useLoadedData(loadProgressSections, emptySections);

  const sectionsById = useMemo(() => {
    const map = new Map<string, ProgressSectionData>();
    for (const section of sections) map.set(section.sectionId, section);
    return map;
  }, [sections]);

  const resolved = useMemo<ResolvedBookmark[]>(() => {
    return liveBookmarks(bookmarks).map((bookmark) => {
      const section = sectionsById.get(bookmark.sectionId);
      if (!section) return { bookmark, stale: false };
      const resolution = resolveBookmarkAnchor(bookmark, section.paragraphs);
      return {
        bookmark,
        section,
        href: bookmarkHref(
          bookmark,
          section,
          resolution.anchor ?? bookmark.paragraphAnchor,
        ),
        stale: resolution.status === "missing",
      };
    });
  }, [bookmarks, sectionsById]);

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

  const exportMarkdown = useCallback(() => {
    const markdown = exportBookmarksMarkdown(
      liveBookmarks(bookmarks),
      (bookmark) => sectionsById.get(bookmark.sectionId),
      window.location.origin,
    );
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "coherence-thesis-bookmarks.md";
    link.click();
    URL.revokeObjectURL(url);
  }, [bookmarks, sectionsById]);

  const total = resolved.length;

  return (
    <div className="bookmarks-menu" ref={containerRef}>
      <button
        {...triggerProps}
        type="button"
        className="bookmarks-menu-button"
        aria-label={
          total === 0
            ? "Bookmarks, none saved"
            : `Bookmarks, ${total.toLocaleString()} saved`
        }
        aria-controls="site-bookmarks-menu"
        onClick={toggle}
      >
        <Bookmark aria-hidden="true" size={17} />
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
                <button
                  type="button"
                  className="icon-button bookmarks-export"
                  onClick={exportMarkdown}
                >
                  <Download aria-hidden="true" size={15} />
                  <span>Export</span>
                </button>
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
                  <span className="bookmark-section">
                    {entry.section?.title ?? entry.bookmark.sectionId}
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
