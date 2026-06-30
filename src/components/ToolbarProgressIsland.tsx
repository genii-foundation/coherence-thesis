"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";
import { loadReaderSections } from "@/lib/reader-data";
import type { ProgressSection } from "@/lib/manuscript-data";
import {
  emptyProgress,
  markRead,
  parseProgress,
  readPercent,
  readerProgressStorageKey,
  readerProgressUpdatedEvent,
  recentlyReadSections,
  recommendNextSections,
  serializeProgress,
  updatedSinceRead,
  type ReaderProgressState,
} from "@/lib/reader-state";

function readStoredProgress(): ReaderProgressState {
  if (typeof window === "undefined") return emptyProgress();
  return parseProgress(window.localStorage.getItem(readerProgressStorageKey));
}

function writeStoredProgress(progress: ReaderProgressState): void {
  window.localStorage.setItem(readerProgressStorageKey, serializeProgress(progress));
  window.dispatchEvent(new Event(readerProgressUpdatedEvent));
}

function normalizePath(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export function ToolbarProgressIsland() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<ReaderProgressState>(() => emptyProgress());
  const [allSections, setAllSections] = useState<ProgressSection[]>([]);

  const section = useMemo(() => {
    const currentPath = normalizePath(pathname);
    return allSections.find((candidate) => normalizePath(candidate.href) === currentPath);
  }, [allSections, pathname]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setProgress(readStoredProgress());
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    let mounted = true;
    loadReaderSections()
      .then((sections) => {
        if (mounted) setAllSections(sections);
      })
      .catch(() => {
        if (mounted) setAllSections([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setOpen(false);
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
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
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!section) return;
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const percent = Math.round((window.scrollY / scrollable) * 100);
      if (percent < 80) return;
      setProgress((current) => {
        const existing = current.sections[section.sectionId];
        if (existing?.contentHash === section.contentHash && existing.percent >= 100) {
          return current;
        }
        const next = markRead(current, section);
        writeStoredProgress(next);
        return next;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [section]);

  const percent = useMemo(
    () => readPercent(progress, allSections),
    [allSections, progress],
  );
  const recommendations = useMemo(
    () => recommendNextSections(progress, allSections, 4),
    [allSections, progress],
  );
  const recentSections = useMemo(
    () => recentlyReadSections(progress, allSections, 4),
    [allSections, progress],
  );
  const revisedCount = recommendations.filter((item) => item.isUpdated).length;
  const isRead = section
    ? progress.sections[section.sectionId]?.contentHash === section.contentHash
    : false;
  const isUpdated = section ? updatedSinceRead(progress, section) : false;

  function markCurrentRead(): void {
    if (!section) return;
    setProgress((current) => {
      const next = markRead(current, section);
      writeStoredProgress(next);
      return next;
    });
  }

  return (
    <div className="progress-menu" ref={containerRef}>
      <button
        type="button"
        className="progress-menu-button"
        aria-label={`Progress ${percent}%`}
        aria-expanded={open}
        aria-controls="reader-progress-menu"
        style={
          { "--progress-value": percent } as CSSProperties & {
            "--progress-value": number;
          }
        }
        onClick={() => setOpen((current) => !current)}
      >
        <span className="progress-percent">{percent}%</span>
      </button>
      {open && (
        <div
          id="reader-progress-menu"
          className="reader-status progress-popover"
          role="region"
          aria-label="Reader progress"
        >
          <div className="progress-section">
            <p className="eyebrow">Local progress</p>
            <div className="progress-row">
              <div className="progress-bar" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </div>
              <strong>{percent}%</strong>
            </div>
            <p className="quiet-copy">
              Stored only in this browser. No account, no server reading history.
            </p>
          </div>
          {section && (
            <div className="reader-actions progress-section">
              <button type="button" className="icon-button" onClick={markCurrentRead}>
                <Check aria-hidden="true" size={17} />
                <span>{isRead ? "Read" : "Mark read"}</span>
              </button>
              {isUpdated && (
                <span className="updated-badge">
                  <RotateCcw aria-hidden="true" size={15} />
                  <span>Updated since read</span>
                </span>
              )}
            </div>
          )}
          {recentSections.length > 0 && (
            <div className="recently-read progress-section">
              <p className="eyebrow">Recently read</p>
              <div className="progress-link-list">
                {recentSections.map((item) => (
                  <a key={item.sectionId} href={item.href}>
                    {item.title}
                  </a>
                ))}
              </div>
            </div>
          )}
          {recommendations.length > 0 && (
            <div className="recommendations progress-section">
              <p className="eyebrow">
                {revisedCount > 0 ? "Revised sections first" : "Recommended next"}
              </p>
              <div className="progress-link-list">
                {recommendations.map((item) => (
                  <a
                    key={item.sectionId}
                    href={item.href}
                    className={item.isUpdated ? "revised-link" : undefined}
                  >
                    {item.isUpdated ? "Updated: " : ""}
                    {item.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
