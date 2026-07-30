"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { usePathname } from "next/navigation";
import { Bookmark, Search } from "lucide-react";
import { loadSearchIndex, type SearchIndexEntry } from "@/lib/reader-data";
import { createEngagementEvent } from "@/lib/reader-engagement";
import { bookmarkHref, liveBookmarks } from "@/lib/reader-bookmarks";
import {
  appendStoredEvent,
  useReaderBookmarks,
} from "@/lib/reader-progress-store";
import {
  firstTermIndex,
  foldSearchText,
  searchTerms,
} from "@/lib/reader-text-search";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";

type SearchResult = SearchIndexEntry & {
  resultKey: string;
  kind: "bookmark" | "manuscript";
  score: number;
  snippet: string;
};

// Normalized fields are computed once when the index loads, not per keystroke,
// so per-query work is substring matching over ~1.25 MB rather than re-running
// regex passes over the whole corpus on every character typed.
type NormalizedEntry = SearchIndexEntry & {
  titleNorm: string;
  hierarchyNorm: string;
  bodyNorm: string;
};

const normalize = foldSearchText;

function normalizeEntry(entry: SearchIndexEntry): NormalizedEntry {
  return {
    ...entry,
    titleNorm: normalize(entry.title),
    hierarchyNorm: normalize(
      `${entry.volumeTitle} ${entry.partTitle} ${entry.chapterTitle}`,
    ),
    bodyNorm: normalize(entry.text),
  };
}

const queryTerms = searchTerms;

function resultSnippet(text: string, terms: string[]): string {
  const normalizedText = normalize(text);
  const index = firstTermIndex(normalizedText, terms);
  if (index < 0) return text.slice(0, 190);
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + 190);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < text.length ? " ..." : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

// Bookmark proximity weights, calibrated against the scale below rather than
// against its top. A body term is worth 4 and there is no term frequency, no
// IDF, and no length normalization, so two sections that merely contain a term
// score identically; a boost of even +5 would decide all body-only ranking.
// Both weights sit under the 18 a hierarchy term earns, so a bookmark reorders
// near-ties without burying a better title match.
const nearBookmarkScore = 14;
const bookmarkedSectionScore = 6;

// How close a match has to be to a bookmarked passage to count as near it,
// measured in normalized characters, which is roughly a long paragraph.
const nearBookmarkDistance = 600;

type BookmarkSearchHit = {
  id: string;
  entry: NormalizedEntry;
  href: string;
  offset: number;
  quote: string;
  quoteNorm: string;
  note?: string;
  noteNorm: string;
};

// Searchable bookmark text and the quote's corpus offset, keyed by section.
// Computed once per bookmark change rather than per keystroke: the scorer runs
// over all 551 entries on every character typed, and that path was already a
// measured problem.
type BookmarkSearchData = {
  all: BookmarkSearchHit[];
  bySection: ReadonlyMap<string, BookmarkSearchHit[]>;
};

function bookmarkSearchDataFor(
  bookmarks: ReturnType<typeof useReaderBookmarks>,
  index: NormalizedEntry[],
): BookmarkSearchData {
  const all: BookmarkSearchHit[] = [];
  const bySection = new Map<string, BookmarkSearchHit[]>();
  if (index.length === 0) return { all, bySection };
  const entryBySection = new Map(index.map((entry) => [entry.sectionId, entry]));

  for (const bookmark of liveBookmarks(bookmarks)) {
    const entry = entryBySection.get(bookmark.sectionId);
    if (!entry) continue;
    const existing = bySection.get(bookmark.sectionId) ?? [];
    const quoteNorm = foldSearchText(bookmark.quote);
    // The quote and the body are folded the same way, so this offset is in the
    // identical coordinate space the match offset below is measured in. That is
    // what makes "near" exact rather than a guess, with no payload growth.
    const at = entry.bodyNorm.indexOf(quoteNorm);
    const hit = {
      id: bookmark.id,
      entry,
      href: bookmarkHref(bookmark, entry),
      offset: at >= 0 ? at : -1,
      quote: bookmark.quote,
      quoteNorm,
      ...(bookmark.note ? { note: bookmark.note } : {}),
      noteNorm: foldSearchText(bookmark.note ?? ""),
    };
    existing.push(hit);
    all.push(hit);
    bySection.set(bookmark.sectionId, existing);
  }
  return { all, bySection };
}

function scoreBookmarkHit(
  hit: BookmarkSearchHit,
  terms: string[],
  phrase: string,
): { score: number; snippet: string } | null {
  if (terms.length === 0) return null;
  const bookmarkText = `${hit.quoteNorm} ${hit.noteNorm}`;
  if (!terms.every((term) => bookmarkText.includes(term))) return null;

  let score = 0;
  if (hit.quoteNorm.includes(phrase)) score += 90;
  if (hit.noteNorm.includes(phrase)) score += 100;
  for (const term of terms) {
    if (hit.quoteNorm.includes(term)) score += 22;
    if (hit.noteNorm.includes(term)) score += 24;
  }

  const noteMatches = terms.some((term) => hit.noteNorm.includes(term));
  return {
    score,
    snippet: noteMatches
      ? `Bookmark note: ${resultSnippet(hit.note ?? "", terms)}`
      : `Bookmarked passage: ${resultSnippet(hit.quote, terms)}`,
  };
}

function bookmarkResult(
  hit: BookmarkSearchHit,
  terms: string[],
  phrase: string,
): SearchResult | null {
  const match = scoreBookmarkHit(hit, terms, phrase);
  if (!match) return null;
  return {
    ...hit.entry,
    href: hit.href,
    resultKey: `bookmark:${hit.id}`,
    kind: "bookmark",
    score: match.score,
    snippet: match.snippet,
  };
}

function scoreEntry(
  entry: NormalizedEntry,
  terms: string[],
  phrase: string,
  bookmarkHitsBySection: BookmarkSearchData["bySection"],
): SearchResult | null {
  if (terms.length === 0) return null;
  const titleText = entry.titleNorm;
  const hierarchyText = entry.hierarchyNorm;
  const bodyText = entry.bodyNorm;
  const haystack = `${titleText} ${hierarchyText} ${bodyText}`;
  const manuscriptMatches = terms.every((term) => haystack.includes(term));
  if (!manuscriptMatches) return null;
  const bookmarkHits = bookmarkHitsBySection.get(entry.sectionId);

  let score = 0;
  if (titleText.includes(phrase)) score += 120;
  if (hierarchyText.includes(phrase)) score += 70;
  if (bodyText.includes(phrase)) score += 35;

  for (const term of terms) {
    if (titleText.includes(term)) score += 35;
    if (hierarchyText.includes(term)) score += 18;
    if (bodyText.includes(term)) score += 4;
  }

  if (bookmarkHits && manuscriptMatches) {
    const matchAt = firstTermIndex(bodyText, terms);
    const near =
      matchAt >= 0 &&
      bookmarkHits.some(
        (hit) =>
          hit.offset >= 0 &&
          Math.abs(hit.offset - matchAt) <= nearBookmarkDistance,
      );
    score += near ? nearBookmarkScore : bookmarkedSectionScore;
  }

  return {
    ...entry,
    resultKey: `manuscript:${entry.sectionId}`,
    kind: "manuscript",
    score,
    snippet: resultSnippet(entry.text, terms),
  };
}

export function SearchMenuIsland() {
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const lastSubmittedQueryRef = useRef("");
  const {
    open,
    rendered,
    setOpen,
    toggle,
    containerRef,
    triggerRef,
    triggerProps,
    popoverProps,
  } = useToolbarMenu<HTMLDivElement>();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<NormalizedEntry[]>([]);
  const bookmarks = useReaderBookmarks();
  const [loadError, setLoadError] = useState(false);
  const loadStartedRef = useRef(false);

  // Defer the ~1.5 MB search index fetch until the reader first opens search,
  // instead of downloading and parsing it on every page load.
  useEffect(() => {
    if (!open || loadStartedRef.current) return;
    loadStartedRef.current = true;
    loadSearchIndex()
      .then((entries) => setIndex(entries.map(normalizeEntry)))
      .catch(() => setLoadError(true));
  }, [open]);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setOpen(false);
      setQuery("");
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [pathname, setOpen]);

  const closeSearch = useCallback((restoreFocus = false): void => {
    setOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }, [setOpen, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeSearch();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSearch(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSearch, containerRef, open]);

  const bookmarkSearchData = useMemo(
    () => bookmarkSearchDataFor(bookmarks, index),
    [bookmarks, index],
  );

  const results = useMemo(() => {
    const terms = queryTerms(query);
    const phrase = normalize(query);
    const bookmarkResults = bookmarkSearchData.all
      .map((hit) => bookmarkResult(hit, terms, phrase))
      .filter((entry): entry is SearchResult => Boolean(entry))
      .sort(
        (left, right) =>
          right.score - left.score || left.title.localeCompare(right.title),
      );
    const bookmarkSections = new Set(
      bookmarkResults.map((result) => result.sectionId),
    );
    const manuscriptResults = index
      .map((entry) =>
        scoreEntry(entry, terms, phrase, bookmarkSearchData.bySection),
      )
      .filter((entry): entry is SearchResult => Boolean(entry))
      .filter((entry) => !bookmarkSections.has(entry.sectionId))
      .sort(
        (left, right) =>
          right.score - left.score || left.title.localeCompare(right.title),
      );
    return [...bookmarkResults, ...manuscriptResults].slice(0, 12);
  }, [bookmarkSearchData, index, query]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open || trimmedQuery.length < 2) return;
    const timer = window.setTimeout(() => {
      if (lastSubmittedQueryRef.current === trimmedQuery) return;
      lastSubmittedQueryRef.current = trimmedQuery;
      appendStoredEvent(
        createEngagementEvent("search_submitted", {
          route: pathname,
          payload: {
            query: trimmedQuery,
            resultCount: results.length,
          },
        }),
      );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [open, pathname, results.length, trimmedQuery]);

  function focusResult(index: number): void {
    resultRefs.current[index]?.focus();
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      focusResult(0);
      return;
    }

    const topResult = results[0];
    if (event.key === "Enter" && topResult) {
      event.preventDefault();
      appendStoredEvent(
        createEngagementEvent("search_result_clicked", {
          sectionId: topResult.sectionId,
          route: topResult.href,
          payload: {
            query: trimmedQuery,
            rank: 1,
          },
        }),
      );
      window.location.assign(topResult.href);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch(true);
    }
  }

  function onResultKeyDown(
    event: ReactKeyboardEvent<HTMLAnchorElement>,
    index: number,
  ): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusResult(Math.min(results.length - 1, index + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        inputRef.current?.focus();
      } else {
        focusResult(index - 1);
      }
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusResult(results.length - 1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch(true);
    }
  }

  return (
    <div className="search-menu" ref={containerRef}>
      <button
        {...triggerProps}
        type="button"
        className="search-menu-button"
        aria-label="Search manuscripts"
        aria-controls="site-search-menu"
        onClick={toggle}
      >
        <Search aria-hidden="true" size={18} />
      </button>
      {rendered && (
        <section
          {...popoverProps}
          id="site-search-menu"
          className="search-popover"
          aria-label="Manuscript search"
        >
          <label className="search-field">
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">Search all manuscripts</span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              aria-controls="search-results-list"
              placeholder="Search all manuscripts"
              autoComplete="off"
            />
          </label>
          <div
            id="search-results-list"
            className="search-results"
            aria-live="polite"
          >
            {loadError && (
              <p className="quiet-copy search-empty">Search index could not load.</p>
            )}
            {!loadError && trimmedQuery.length === 0 && (
              <p className="quiet-copy search-empty">
                Find the thread. Search every title, chapter, and passage.
              </p>
            )}
            {!loadError && trimmedQuery.length > 0 && results.length === 0 && (
              <p className="quiet-copy search-empty">No manuscript matches.</p>
            )}
            {results.map((result, resultIndex) => (
              <a
                key={result.resultKey}
                ref={(element) => {
                  resultRefs.current[resultIndex] = element;
                }}
                href={result.href}
                className={`search-result${
                  result.kind === "bookmark" ? " search-result-bookmark" : ""
                }`}
                data-search-result-kind={result.kind}
                onKeyDown={(event) => onResultKeyDown(event, resultIndex)}
                onClick={() =>
                  appendStoredEvent(
                    createEngagementEvent("search_result_clicked", {
                      sectionId: result.sectionId,
                      route: result.href,
                      payload: {
                        query: trimmedQuery,
                        rank: resultIndex + 1,
                      },
                    }),
                  )
                }
              >
                {result.kind === "bookmark" && (
                  <Bookmark
                    aria-hidden="true"
                    className="search-result-bookmark-icon"
                    fill="currentColor"
                    size={18}
                  />
                )}
                <span className="search-result-title">
                  <strong>{result.title}</strong>
                </span>
                <small className="search-result-meta">
                  {result.volumeTitle} / {result.partTitle} / {result.chapterTitle}
                </small>
                <span className="search-result-snippet">{result.snippet}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
