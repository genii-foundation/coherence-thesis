"use client";

import { normalizePath } from "@/lib/routes";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Check, Download, FileText, Link, Share2 } from "lucide-react";
import {
  loadPdfDownloads,
  type PdfDownloadManifest,
  type PdfDownloadManuscript,
  type PdfDownloadSection,
} from "@/lib/reader-data";

type ShareStatus = "idle" | "copied" | "shared" | "failed";

function volumeIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/manuscripts\/([^/]+)/);
  return match?.[1] ?? null;
}

function sectionMatchesPath(section: PdfDownloadSection, currentPath: string): boolean {
  const sectionHref = normalizePath(section.href);
  if (sectionHref === currentPath) return true;
  if (!sectionHref.startsWith(currentPath)) return false;

  return sectionHref.slice(currentPath.length) === `${section.sectionId}/`;
}

function statusLabel(status: ShareStatus): string | null {
  if (status === "copied") return "Link copied";
  if (status === "shared") return "Shared";
  if (status === "failed") return "Unable to share";
  return null;
}

export function ToolbarShareIsland() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [downloads, setDownloads] = useState<PdfDownloadManifest | null>(null);
  const [actionablePdfHrefs, setActionablePdfHrefs] = useState<Set<string>>(
    new Set(),
  );
  const loadStartedRef = useRef(false);

  const currentSection = useMemo(() => {
    const currentPath = normalizePath(pathname);
    return downloads?.sections.find((section) => sectionMatchesPath(section, currentPath)) ?? null;
  }, [downloads, pathname]);

  const currentVolume = useMemo(() => {
    const volumeId = currentSection?.volumeId ?? volumeIdFromPath(pathname);
    if (!volumeId) return null;
    return downloads?.manuscripts.find((manuscript) => manuscript.volumeId === volumeId) ?? null;
  }, [currentSection, downloads, pathname]);

  const downloadCandidates = useMemo(() => {
    const hrefs = [currentSection?.pdfHref, currentVolume?.pdfHref].filter(
      (href): href is string => Boolean(href),
    );
    return [...new Set(hrefs)];
  }, [currentSection?.pdfHref, currentVolume?.pdfHref]);

  // Defer the PDF manifest fetch until the reader first opens the share menu,
  // instead of downloading it on every page load.
  useEffect(() => {
    if (!open || loadStartedRef.current) return;
    loadStartedRef.current = true;
    loadPdfDownloads()
      .then((nextDownloads) => setDownloads(nextDownloads))
      .catch(() => setDownloads({ sections: [], manuscripts: [] }));
  }, [open]);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setOpen(false);
      setStatus("idle");
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [pathname]);

  useEffect(() => {
    let mounted = true;

    if (downloadCandidates.length === 0) return;

    Promise.all(
      downloadCandidates.map(async (href) => {
        try {
          const response = await fetch(href, { method: "HEAD" });
          return response.ok ? href : null;
        } catch {
          return null;
        }
      }),
    ).then((hrefs) => {
      if (!mounted) return;
      setActionablePdfHrefs(
        new Set(hrefs.filter((href): href is string => Boolean(href))),
      );
    });

    return () => {
      mounted = false;
    };
  }, [downloadCandidates]);

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

  async function shareCurrentPage(): Promise<void> {
    const url = window.location.href;
    const title = document.title || "The Coherence Thesis";
    setStatus("idle");

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        setStatus("shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    if (!navigator.clipboard?.writeText) {
      setStatus("failed");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  const visibleStatus = statusLabel(status);
  const sectionDownload =
    currentSection && actionablePdfHrefs.has(currentSection.pdfHref)
      ? (currentSection as PdfDownloadSection)
      : null;
  const manuscriptDownload =
    currentVolume && actionablePdfHrefs.has(currentVolume.pdfHref)
      ? (currentVolume as PdfDownloadManuscript)
      : null;

  return (
    <div className="share-menu" ref={containerRef}>
      <button
        type="button"
        className="share-menu-button"
        aria-label="Share and downloads"
        aria-expanded={open}
        aria-controls="reader-share-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <Share2 aria-hidden="true" size={17} />
      </button>
      {open && (
        <section
          id="reader-share-menu"
          className="reader-share share-popover"
          aria-label="Share and downloads"
        >
          <p className="eyebrow">Share</p>
          <button type="button" className="share-action" onClick={shareCurrentPage}>
            <Link aria-hidden="true" size={16} />
            <span className="share-action-label">Share this page</span>
          </button>
          {sectionDownload?.pdfHref ? (
            <a
              className="share-action"
              href={sectionDownload.pdfHref}
              download={sectionDownload.fileName}
              aria-label={`Download this section as PDF: ${sectionDownload.title}`}
            >
              <FileText aria-hidden="true" size={16} />
              <span className="share-action-label">Download this section</span>
              <Download aria-hidden="true" size={15} />
            </a>
          ) : null}
          {manuscriptDownload?.pdfHref ? (
            <a
              className="share-action"
              href={manuscriptDownload.pdfHref}
              download={manuscriptDownload.fileName}
              aria-label={`Download full manuscript as PDF: ${manuscriptDownload.title}`}
            >
              <BookOpen aria-hidden="true" size={16} />
              <span className="share-action-label">Download full manuscript</span>
              <Download aria-hidden="true" size={15} />
            </a>
          ) : null}
          {visibleStatus && (
            <p className="share-status" role="status">
              <Check aria-hidden="true" size={15} />
              <span>{visibleStatus}</span>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
