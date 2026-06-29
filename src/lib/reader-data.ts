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

let readerSectionsPromise: Promise<ReaderSectionData[]> | null = null;
let breadcrumbRoutesPromise: Promise<BreadcrumbRoute[]> | null = null;
let searchIndexPromise: Promise<SearchIndexEntry[]> | null = null;

export function loadReaderSections(): Promise<ReaderSectionData[]> {
  readerSectionsPromise ??= fetch("/data/reader-sections.json").then((response) => {
    if (!response.ok) {
      throw new Error(`Unable to load reader section data: ${response.status}`);
    }
    return response.json() as Promise<ReaderSectionData[]>;
  });
  return readerSectionsPromise;
}

export function loadBreadcrumbRoutes(): Promise<BreadcrumbRoute[]> {
  breadcrumbRoutesPromise ??= fetch("/data/breadcrumb-routes.json").then((response) => {
    if (!response.ok) {
      throw new Error(`Unable to load breadcrumb data: ${response.status}`);
    }
    return response.json() as Promise<BreadcrumbRoute[]>;
  });
  return breadcrumbRoutesPromise;
}

export function loadSearchIndex(): Promise<SearchIndexEntry[]> {
  searchIndexPromise ??= fetch("/data/search-index.json").then((response) => {
    if (!response.ok) {
      throw new Error(`Unable to load search index: ${response.status}`);
    }
    return response.json() as Promise<SearchIndexEntry[]>;
  });
  return searchIndexPromise;
}
