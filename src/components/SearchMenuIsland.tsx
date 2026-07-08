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
import { Search } from "lucide-react";
import { loadSearchIndex, type SearchIndexEntry } from "@/lib/reader-data";
import { createEngagementEvent } from "@/lib/reader-engagement";
import { appendStoredEvent } from "@/lib/reader-progress-store";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";

type SearchResult = SearchIndexEntry & {
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

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9'\s]+/g, " ").replace(/\s+/g, " ").trim();
}

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

function queryTerms(query: string): string[] {
  return normalize(query).split(" ").filter(Boolean);
}

function firstTermIndex(text: string, terms: string[]): number {
  const indexes = terms
    .map((term) => text.indexOf(term))
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

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

function scoreEntry(entry: NormalizedEntry, terms: string[], phrase: string): SearchResult | null {
  if (terms.length === 0) return null;
  const titleText = entry.titleNorm;
  const hierarchyText = entry.hierarchyNorm;
  const bodyText = entry.bodyNorm;
  const haystack = `${titleText} ${hierarchyText} ${bodyText}`;
  if (!terms.every((term) => haystack.includes(term))) return null;

  let score = 0;
  if (titleText.includes(phrase)) score += 120;
  if (hierarchyText.includes(phrase)) score += 70;
  if (bodyText.includes(phrase)) score += 35;

  for (const term of terms) {
    if (titleText.includes(term)) score += 35;
    if (hierarchyText.includes(term)) score += 18;
    if (bodyText.includes(term)) score += 4;
  }

  return {
    ...entry,
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

  const results = useMemo(() => {
    const terms = queryTerms(query);
    const phrase = normalize(query);
    return index
      .map((entry) => scoreEntry(entry, terms, phrase))
      .filter((entry): entry is SearchResult => Boolean(entry))
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
      .slice(0, 12);
  }, [index, query]);

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
                Search titles, chapters, and full manuscript text.
              </p>
            )}
            {!loadError && trimmedQuery.length > 0 && results.length === 0 && (
              <p className="quiet-copy search-empty">No manuscript matches.</p>
            )}
            {results.map((result, resultIndex) => (
              <a
                key={result.sectionId}
                ref={(element) => {
                  resultRefs.current[resultIndex] = element;
                }}
                href={result.href}
                className="search-result"
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
