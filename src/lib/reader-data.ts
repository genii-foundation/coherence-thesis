export type ReaderParagraph = {
  paragraphId: string;
  anchor: string;
  order: number;
  contentHash: string;
};

export type ReaderSectionData = {
  sectionId: string;
  title: string;
  href: string;
  text: string;
  contentHash: string;
  versionHash: string;
  versionDate: string;
  versionUrl: string;
  audioVersionId: string;
  paragraphs: ReaderParagraph[];
};

export type BreadcrumbCrumb = {
  label: string;
  href: string;
};

export type BreadcrumbRoute = {
  href: string;
  crumbs: BreadcrumbCrumb[];
};

export type SearchIndexEntry = {
  sectionId: string;
  href: string;
  title: string;
  volumeTitle: string;
  partTitle: string;
  chapterTitle: string;
  wordCount: number;
  contentHash: string;
  text: string;
};

export type PdfDownloadSection = {
  sectionId: string;
  volumeId: string;
  volumeTitle: string;
  title: string;
  href: string;
  pdfHref: string;
  fileName: string;
  contentHash: string;
};

export type PdfDownloadManuscript = {
  volumeId: string;
  title: string;
  href: string;
  pdfHref: string;
  fileName: string;
  contentHash: string;
};

export type PdfDownloadManifest = {
  sections: PdfDownloadSection[];
  manuscripts: PdfDownloadManuscript[];
};

// The toolbar outline tree (~68KB) is fetched on demand when the outline menu
// first opens, rather than serialized into every page. These mirror the
// manuscript-data ToolbarOutline shape as browser-facing types.
export type OutlineChapter = { title: string; href: string; wordCount: number };
export type OutlinePart = {
  title: string;
  href: string;
  wordCount: number;
  chapters: OutlineChapter[];
};
export type OutlineVolume = {
  title: string;
  subtitle: string;
  href: string;
  numberLabel: string;
  wordCount: number;
  parts: OutlinePart[];
};
export type ToolbarOutlineData = {
  home: { title: string; href: string };
  overview: { title: string; href: string };
  volumes: OutlineVolume[];
};

// Memoizes only fulfilled results. A rejected fetch clears the cache so the
// next call retries, rather than permanently disabling a feature after one
// transient network error during the (now interaction-triggered) load.
function memoizedLoader<T>(url: string, label: string): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => {
    if (cached) return cached;
    const request = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load ${label}: ${response.status}`);
        }
        return response.json() as Promise<T>;
      })
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
    cached = request;
    return request;
  };
}

export const loadReaderSections = memoizedLoader<ReaderSectionData[]>(
  "/data/reader-sections.json",
  "reader section data",
);

export const loadBreadcrumbRoutes = memoizedLoader<BreadcrumbRoute[]>(
  "/data/breadcrumb-routes.json",
  "breadcrumb data",
);

export const loadSearchIndex = memoizedLoader<SearchIndexEntry[]>(
  "/data/search-index.json",
  "search index",
);

export const loadPdfDownloads = memoizedLoader<PdfDownloadManifest>(
  "/data/pdf-downloads.json",
  "PDF download data",
);

export const loadToolbarOutline = memoizedLoader<ToolbarOutlineData>(
  "/data/outline.json",
  "outline data",
);
