"use client";

import { normalizePath } from "@/lib/routes";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Home, ListTree, Search } from "lucide-react";
import {
  loadProgressSections,
  loadToolbarOutline,
  type ProgressSectionData,
  type ToolbarOutlineData,
} from "@/lib/reader-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";
import { useReaderProgress } from "@/lib/reader-progress-store";
import {
  progressSectionForHref,
  progressSectionsForPrefix,
  sectionGroupProgressStatus,
} from "@/lib/section-progress";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";
import { ProgressStateDot } from "@/components/ProgressStateDot";

function searchable(value: string): string {
  return value.trim().toLowerCase();
}

function matchesQuery(values: string[], query: string): boolean {
  if (!query) return true;
  return values.some((value) => searchable(value).includes(query));
}

export function OutlineMenuIsland() {
  const pathname = usePathname();
  const {
    open,
    rendered,
    setOpen,
    toggle,
    containerRef,
    triggerProps,
    popoverProps,
  } = useToolbarMenu<HTMLDivElement>();
  const searchRef = useRef<HTMLInputElement>(null);
  const progress = useReaderProgress();
  const [query, setQuery] = useState("");
  const [outline, setOutline] = useState<ToolbarOutlineData | null>(null);
  const [progressSections, setProgressSections] = useState<ProgressSectionData[]>(
    [],
  );
  const loadStartedRef = useRef(false);
  const currentPath = normalizePath(pathname);
  const normalizedQuery = searchable(query);

  // Fetch the outline tree the first time the menu opens, instead of shipping it
  // in every page (PERF-05).
  useEffect(() => {
    if (!open || loadStartedRef.current) return;
    loadStartedRef.current = true;
    loadToolbarOutline()
      .then(setOutline)
      .catch(() => {
        loadStartedRef.current = false;
      });
    loadProgressSections().then(setProgressSections).catch(() => undefined);
  }, [open]);

  const topLinks = useMemo(
    () =>
      !outline
        ? []
        : [
            {
              title: outline.home.title,
              href: outline.home.href,
              detail: "Home",
              icon: "home",
            },
            {
              title: outline.overview.title,
              href: outline.overview.href,
              detail: "Outline",
              icon: "outline",
            },
          ].filter((item) =>
            matchesQuery([item.title, item.detail], normalizedQuery),
          ),
    [normalizedQuery, outline],
  );

  const volumes = useMemo(
    () =>
      (outline?.volumes ?? [])
        .map((volume) => {
          const volumeMatches = matchesQuery(
            [volume.title, volume.subtitle, volume.numberLabel],
            normalizedQuery,
          );
          const parts = volume.parts
            .map((part) => {
              const partMatches = matchesQuery([part.title], normalizedQuery);
              const chapters = part.chapters.filter((chapter) =>
                matchesQuery([chapter.title], normalizedQuery),
              );

              return {
                ...part,
                chapters:
                  volumeMatches || partMatches || !normalizedQuery
                    ? part.chapters
                    : chapters,
                visible:
                  volumeMatches ||
                  partMatches ||
                  chapters.length > 0 ||
                  !normalizedQuery,
              };
            })
            .filter((part) => part.visible);

          return {
            ...volume,
            parts,
            visible: volumeMatches || parts.length > 0 || !normalizedQuery,
          };
        })
        .filter((volume) => volume.visible),
    [normalizedQuery, outline],
  );

  const hasResults = topLinks.length > 0 || volumes.length > 0;

  const progressStatusForPrefix = useCallback(
    (href: string) =>
      sectionGroupProgressStatus(
        progress,
        progressSectionsForPrefix(progressSections, href),
      ),
    [progress, progressSections],
  );

  const progressStatusForHref = useCallback(
    (href: string) =>
      sectionGroupProgressStatus(
        progress,
        progressSectionForHref(progressSections, href),
      ),
    [progress, progressSections],
  );

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setOpen(false);
      setQuery("");
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [pathname, setOpen]);

  // Open/close, outside-click, and Escape (with focus return) come from
  // useToolbarMenu; this only adds the search-field autofocus on open.
  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  return (
    <div className="outline-menu" ref={containerRef}>
      <button
        {...triggerProps}
        type="button"
        className="outline-menu-button"
        aria-label="Outline"
        aria-controls="site-outline-menu"
        onClick={toggle}
      >
        <ListTree aria-hidden="true" size={17} />
      </button>
      {rendered && (
        <section
          {...popoverProps}
          id="site-outline-menu"
          className="outline-popover"
          aria-label="Site outline"
        >
          <label className="outline-search">
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">Filter outline</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search outline"
              autoComplete="off"
            />
          </label>
          <div className="outline-scroll">
            {topLinks.length > 0 && (
              <div className="outline-section">
                <p className="eyebrow">Start</p>
                <div className="outline-top-links">
                  {topLinks.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={normalizePath(item.href) === currentPath ? "page" : undefined}
                    >
                      {item.icon === "outline" ? (
                        <ListTree aria-hidden="true" size={16} />
                      ) : (
                        <Home aria-hidden="true" size={16} />
                      )}
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {volumes.length > 0 && (
              <div className="outline-section">
                <p className="eyebrow">Manuscripts</p>
                <div className="outline-volume-list">
                  {volumes.map((volume) => (
                    <article className="outline-volume" key={volume.href}>
                      <a
                        className="outline-volume-link"
                        href={volume.href}
                        aria-current={normalizePath(volume.href) === currentPath ? "page" : undefined}
                      >
                        <span className="outline-volume-number">{volume.numberLabel}</span>
                        <span>
                          <strong>{volume.title}</strong>
                          <small>{formatReadingDurationForWords(volume.wordCount)}</small>
                        </span>
                        <ProgressStateDot
                          className="outline-progress-dot"
                          status={progressStatusForPrefix(volume.href)}
                        />
                      </a>
                      {volume.parts.length > 0 && (
                        <div className="outline-parts">
                          {volume.parts.map((part) => {
                            const partPath = normalizePath(part.href);
                            const partIsCurrent = currentPath.startsWith(partPath);
                            return (
                              <details
                                className="outline-part"
                                key={part.href}
                                open={normalizedQuery.length > 0 || partIsCurrent}
                              >
                                <summary>
                                  <span className="outline-part-title">
                                    <ChevronRight
                                      className="outline-part-chevron"
                                      aria-hidden="true"
                                      size={15}
                                    />
                                    <span>{part.title}</span>
                                  </span>
                                  <span className="outline-row-meta">
                                    <small>{formatReadingDurationForWords(part.wordCount)}</small>
                                    <ProgressStateDot
                                      className="outline-progress-dot"
                                      status={progressStatusForPrefix(part.href)}
                                    />
                                  </span>
                                </summary>
                                <div className="outline-chapters">
                                  <a
                                    className="outline-part-link"
                                    href={part.href}
                                    aria-current={
                                      partPath === currentPath ? "page" : undefined
                                    }
                                  >
                                    <span>Overview</span>
                                    <span className="outline-row-meta">
                                      <ProgressStateDot
                                        className="outline-progress-dot"
                                        status={progressStatusForHref(part.href)}
                                      />
                                    </span>
                                  </a>
                                  {part.chapters.map((chapter) => (
                                    <a
                                      key={chapter.href}
                                      href={chapter.href}
                                      aria-current={
                                        normalizePath(chapter.href) === currentPath
                                          ? "page"
                                          : undefined
                                      }
                                    >
                                      <span>{chapter.title}</span>
                                      <span className="outline-row-meta">
                                        <small>
                                          {formatReadingDurationForWords(chapter.wordCount)}
                                        </small>
                                        <ProgressStateDot
                                          className="outline-progress-dot"
                                          status={progressStatusForPrefix(chapter.href)}
                                        />
                                      </span>
                                    </a>
                                  ))}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}
            {!outline && (
              <p className="quiet-copy outline-empty">Loading outline…</p>
            )}
            {outline && !hasResults && (
              <p className="quiet-copy outline-empty">No outline matches.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
