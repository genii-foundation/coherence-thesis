"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { loadSearchIndex, type SearchIndexEntry } from "@/lib/reader-data";

type SearchResult = SearchIndexEntry & {
  score: number;
  snippet: string;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9'\s]+/g, " ").replace(/\s+/g, " ").trim();
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

function scoreEntry(entry: SearchIndexEntry, terms: string[], phrase: string): SearchResult | null {
  if (terms.length === 0) return null;
  const titleText = normalize(entry.title);
  const hierarchyText = normalize(
    `${entry.volumeTitle} ${entry.partTitle} ${entry.chapterTitle}`,
  );
  const bodyText = normalize(entry.text);
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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchIndexEntry[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadSearchIndex()
      .then((entries) => {
        if (mounted) setIndex(entries);
      })
      .catch(() => {
        if (mounted) setLoadError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setOpen(false);
      setQuery("");
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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

  return (
    <div className="search-menu" ref={containerRef}>
      <button
        type="button"
        className="search-menu-button"
        aria-label="Search manuscripts"
        aria-expanded={open}
        aria-controls="site-search-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <Search aria-hidden="true" size={18} />
      </button>
      {open && (
        <section
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
              placeholder="Search all manuscripts"
              autoComplete="off"
            />
          </label>
          <div className="search-results">
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
            {results.map((result) => (
              <a key={result.sectionId} href={result.href} className="search-result">
                <span className="search-result-heading">
                  <strong>{result.title}</strong>
                  <small>
                    {result.volumeTitle} / {result.partTitle} / {result.chapterTitle}
                  </small>
                </span>
                <span className="search-result-snippet">{result.snippet}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
