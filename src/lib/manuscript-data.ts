import catalogJson from "@/generated/manuscripts/catalog.json";

export type ParagraphFingerprint = {
  paragraphId: string;
  anchor: string;
  order: number;
  contentHash: string;
  text: string;
};

export type Section = {
  volumeId: string;
  volumeTitle: string;
  volumeOrder: number;
  partId: string;
  partTitle: string;
  partOrder: number;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  sectionId: string;
  title: string;
  sectionOrder: number;
  sourceDoc?: string;
  sourceHash?: string;
  sourceParagraphStart?: number;
  sourceParagraphEnd?: number;
  aliases?: string[];
  path: string;
  href: string;
  body: string;
  text: string;
  paragraphs: ParagraphFingerprint[];
  wordCount: number;
  readingMinutes: number;
  contentHash: string;
  versionHash: string;
  versionDate: string;
  versionUrl: string;
  audioVersionId: string;
  previousSectionId: string | null;
  nextSectionId: string | null;
};

export type Chapter = {
  chapterId: string;
  title: string;
  order: number;
  href: string;
  sectionIds: string[];
  wordCount: number;
};

export type Part = {
  partId: string;
  title: string;
  order: number;
  href: string;
  chapters: Chapter[];
  sectionIds: string[];
  wordCount: number;
};

export type Volume = {
  volumeId: string;
  title: string;
  subtitle: string;
  order: number;
  numberLabel: string;
  planet: string;
  coverImage: string;
  coverAlt: string;
  href: string;
  parts: Part[];
  sectionIds: string[];
  wordCount: number;
};

export type SectionAlias = {
  sourceHref: string;
  targetSectionId: string;
  note?: string;
  targetHref: string;
  sourceRoute: {
    volumeId: string;
    partId: string;
    chapterId: string;
    sectionId: string;
  };
};

export type Catalog = {
  siteTitle: string;
  generatedFrom: string;
  gitRevision: string;
  stats: {
    volumeCount: number;
    partCount: number;
    chapterCount: number;
    sectionCount: number;
    wordCount: number;
    readingMinutes: number;
  };
  volumes: Volume[];
  sections: Section[];
  aliases: SectionAlias[];
  overview: {
    title: string;
    subtitle: string;
    readingMinutes: number;
    nodes: Array<{
      id: string;
      title: string;
      summary: string;
      references: Array<{ sectionId: string; label?: string }>;
      children?: unknown[];
    }>;
  };
};
export type ProgressParagraph = Pick<
  ParagraphFingerprint,
  "paragraphId" | "anchor" | "contentHash"
>;
export type ProgressSection = Pick<
  Section,
  "sectionId" | "contentHash" | "title" | "href"
> & {
  paragraphs: ProgressParagraph[];
};
export type BreadcrumbCrumb = {
  label: string;
  href: string;
};
export type BreadcrumbRoute = {
  href: string;
  crumbs: BreadcrumbCrumb[];
};
export type OutlineChapter = {
  title: string;
  href: string;
  wordCount: number;
};
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
export type ToolbarOutline = {
  home: { title: string; href: string };
  overview: { title: string; href: string };
  volumes: OutlineVolume[];
};
export type NavigationItem = {
  title: string;
  href: string;
};
export type PageNavigation = {
  previous?: NavigationItem | null;
  parent: NavigationItem;
  next?: NavigationItem | null;
};
export type PartRouteMatch = {
  volume: Volume;
  part: Part;
};
export type ChapterRouteMatch = PartRouteMatch & {
  chapter: Chapter;
};

export const catalog = catalogJson as Catalog;

export function allSections(): Section[] {
  return catalog.sections;
}

export function toProgressSection(section: Section): ProgressSection {
  return {
    sectionId: section.sectionId,
    contentHash: section.contentHash,
    title: section.title,
    href: section.href,
    paragraphs: section.paragraphs.map((paragraph) => ({
      paragraphId: paragraph.paragraphId,
      anchor: paragraph.anchor,
      contentHash: paragraph.contentHash,
    })),
  };
}

export function progressSections(): ProgressSection[] {
  return catalog.sections.map(toProgressSection);
}

export function toolbarOutline(): ToolbarOutline {
  return {
    home: { title: catalog.siteTitle, href: "/" },
    overview: { title: "Five minute overview", href: "/overview/" },
    volumes: catalog.volumes.map((volume) => ({
      title: volume.title,
      subtitle: volume.subtitle,
      href: volume.href,
      numberLabel: volume.numberLabel,
      wordCount: volume.wordCount,
      parts: volume.parts.map((part) => ({
        title: part.title,
        href: part.href,
        wordCount: part.wordCount,
        chapters: part.chapters.map((chapter) => ({
          title: chapter.title,
          href: chapter.href,
          wordCount: chapter.wordCount,
        })),
      })),
    })),
  };
}

function addBreadcrumbRoute(
  routes: Map<string, BreadcrumbRoute>,
  href: string,
  crumbs: BreadcrumbCrumb[],
): void {
  routes.set(href, { href, crumbs });
}

export function breadcrumbRoutes(): BreadcrumbRoute[] {
  const routes = new Map<string, BreadcrumbRoute>();
  const overview = { label: "Overview", href: "/overview/" };

  addBreadcrumbRoute(routes, "/", []);
  addBreadcrumbRoute(routes, "/overview/", [overview]);

  for (const volume of catalog.volumes) {
    addBreadcrumbRoute(routes, volume.href, []);

    for (const part of volume.parts) {
      const partCrumb = { label: part.title, href: part.href };
      addBreadcrumbRoute(routes, part.href, [partCrumb]);

      for (const chapter of part.chapters) {
        const chapterCrumb = { label: chapter.title, href: chapter.href };
        if (chapter.href !== part.href) {
          addBreadcrumbRoute(routes, chapter.href, [partCrumb, chapterCrumb]);
        }
      }
    }
  }

  for (const section of catalog.sections) {
    const volume = volumeById(section.volumeId);
    const part = partById(section.volumeId, section.partId);
    const chapter = chapterById(section.volumeId, section.partId, section.chapterId);
    if (!volume || !part || !chapter) continue;
    const crumbs = [
      { label: part.title, href: part.href },
      { label: section.title, href: section.href },
    ];
    if (chapter.href !== part.href && !isSingletonChapterSection(chapter, section)) {
      crumbs.splice(1, 0, { label: chapter.title, href: chapter.href });
    }
    addBreadcrumbRoute(routes, section.href, crumbs);
  }

  return [...routes.values()];
}

export function sectionById(sectionId: string): Section | undefined {
  return catalog.sections.find((section) => section.sectionId === sectionId);
}

export function volumeById(volumeId: string): Volume | undefined {
  return catalog.volumes.find((volume) => volume.volumeId === volumeId);
}

export function partById(volumeId: string, partId: string): Part | undefined {
  return volumeById(volumeId)?.parts.find((part) => part.partId === partId);
}

export function chapterById(
  volumeId: string,
  partId: string,
  chapterId: string,
): Chapter | undefined {
  return partById(volumeId, partId)?.chapters.find(
    (chapter) => chapter.chapterId === chapterId,
  );
}

export function sectionByRoute(
  volumeId: string,
  partId: string,
  chapterId: string,
  sectionId: string,
): Section | undefined {
  return catalog.sections.find(
    (section) =>
      section.volumeId === volumeId &&
      section.partId === partId &&
      section.chapterId === chapterId &&
      section.sectionId === sectionId,
  );
}

export function aliasByRoute(
  volumeId: string,
  partId: string,
  chapterId: string,
  sectionId: string,
): SectionAlias | undefined {
  return catalog.aliases.find(
    (alias) =>
      alias.sourceRoute.volumeId === volumeId &&
      alias.sourceRoute.partId === partId &&
      alias.sourceRoute.chapterId === chapterId &&
      alias.sourceRoute.sectionId === sectionId,
  );
}

export function sectionByRouteOrAlias(
  volumeId: string,
  partId: string,
  chapterId: string,
  sectionId: string,
): { section: Section; alias?: SectionAlias } | undefined {
  const section = sectionByRoute(volumeId, partId, chapterId, sectionId);
  if (section) return { section };
  const alias = aliasByRoute(volumeId, partId, chapterId, sectionId);
  const target = alias ? sectionById(alias.targetSectionId) : undefined;
  return target ? { section: target, alias } : undefined;
}

function normalizeHref(href: string): string {
  if (href === "/") return href;
  return href.endsWith("/") ? href : `${href}/`;
}

export function manuscriptHrefFromRoute(volumeId: string, route: string[]): string {
  return normalizeHref(`/manuscripts/${[volumeId, ...route].join("/")}`);
}

export function manuscriptRouteFromHref(href: string): { volumeId: string; route: string[] } {
  const parts = normalizeHref(href).split("/").filter(Boolean);
  if (parts[0] !== "manuscripts" || !parts[1] || parts.length < 3) {
    throw new Error(`Expected manuscript href: ${href}`);
  }
  return {
    volumeId: parts[1],
    route: parts.slice(2),
  };
}

export function partByHref(href: string): PartRouteMatch | undefined {
  const normalized = normalizeHref(href);
  for (const volume of catalog.volumes) {
    const part = volume.parts.find((candidate) => normalizeHref(candidate.href) === normalized);
    if (part) return { volume, part };
    const legacyPart = volume.parts.find(
      (candidate) =>
        candidate.partId === volume.volumeId &&
        normalizeHref(`/manuscripts/${volume.volumeId}/${candidate.partId}/`) === normalized,
    );
    if (legacyPart) return { volume, part: legacyPart };
  }
  return undefined;
}

export function chapterByHref(href: string): ChapterRouteMatch | undefined {
  const normalized = normalizeHref(href);
  for (const volume of catalog.volumes) {
    for (const part of volume.parts) {
      const chapter = part.chapters.find(
        (candidate) =>
          normalizeHref(candidate.href) === normalized &&
          normalizeHref(candidate.href) !== normalizeHref(part.href),
      );
      if (chapter) return { volume, part, chapter };
    }
  }
  return undefined;
}

export function sectionByHrefOrAlias(
  href: string,
): { section: Section; alias?: SectionAlias } | undefined {
  const normalized = normalizeHref(href);
  const section = catalog.sections.find(
    (candidate) => normalizeHref(candidate.href) === normalized,
  );
  if (section) return { section };
  const alias = catalog.aliases.find(
    (candidate) => normalizeHref(candidate.sourceHref) === normalized,
  );
  const target = alias ? sectionById(alias.targetSectionId) : undefined;
  return target ? { section: target, alias } : undefined;
}

function navigationItem(item: NavigationItem): NavigationItem {
  return {
    title: item.title,
    href: item.href,
  };
}

function isSingletonChapterSection(chapter: Chapter, section: Section): boolean {
  return chapter.sectionIds.length === 1 && chapter.sectionIds[0] === section.sectionId;
}

function sectionParentNavigationItem(section: Section): NavigationItem | undefined {
  const part = partById(section.volumeId, section.partId);
  const chapter = chapterById(section.volumeId, section.partId, section.chapterId);
  if (!part || !chapter) return undefined;
  return navigationItem(isSingletonChapterSection(chapter, section) ? part : chapter);
}

function siblingNavigation<T extends NavigationItem>(
  items: T[],
  currentHref: string,
  parent: NavigationItem,
): PageNavigation | undefined {
  const currentIndex = items.findIndex((item) => item.href === currentHref);
  if (currentIndex < 0) return undefined;
  return {
    previous: items[currentIndex - 1] ? navigationItem(items[currentIndex - 1]) : null,
    parent: navigationItem(parent),
    next: items[currentIndex + 1] ? navigationItem(items[currentIndex + 1]) : null,
  };
}

export function volumeNavigation(volumeId: string): PageNavigation | undefined {
  const volume = volumeById(volumeId);
  if (!volume) return undefined;
  return siblingNavigation(catalog.volumes, volume.href, {
    title: "Home",
    href: "/",
  });
}

export function partNavigation(
  volumeId: string,
  partId: string,
): PageNavigation | undefined {
  const volume = volumeById(volumeId);
  const part = partById(volumeId, partId);
  if (!volume || !part) return undefined;
  return siblingNavigation(volume.parts, part.href, volume);
}

export function chapterNavigation(
  volumeId: string,
  partId: string,
  chapterId: string,
): PageNavigation | undefined {
  const part = partById(volumeId, partId);
  const chapter = chapterById(volumeId, partId, chapterId);
  if (!part || !chapter) return undefined;
  return siblingNavigation(part.chapters, chapter.href, part);
}

export function sectionNavigation(section: Section): PageNavigation | undefined {
  const parent = sectionParentNavigationItem(section);
  if (!parent) return undefined;
  return {
    previous: section.previousSectionId
      ? sectionById(section.previousSectionId) ?? null
      : null,
    parent,
    next: section.nextSectionId ? sectionById(section.nextSectionId) ?? null : null,
  };
}

export function sectionsStartingAt(sectionId: string): Section[] {
  const startIndex = catalog.sections.findIndex(
    (section) => section.sectionId === sectionId,
  );
  if (startIndex < 0) return [];
  return catalog.sections.slice(startIndex);
}

export function sectionsForChapter(
  volumeId: string,
  partId: string,
  chapterId: string,
): Section[] {
  const chapter = chapterById(volumeId, partId, chapterId);
  if (!chapter) return [];
  const ids = new Set(chapter.sectionIds);
  return catalog.sections.filter((section) => ids.has(section.sectionId));
}

export function sectionsForPart(volumeId: string, partId: string): Section[] {
  const part = partById(volumeId, partId);
  if (!part) return [];
  const ids = new Set(part.sectionIds);
  return catalog.sections.filter((section) => ids.has(section.sectionId));
}

export function routeParams() {
  return [
    ...catalog.sections.map((section) => ({
      volumeId: section.volumeId,
      partId: section.partId,
      chapterId: section.chapterId,
      sectionId: section.sectionId,
    })),
    ...catalog.aliases.map((alias) => alias.sourceRoute),
  ];
}

export function manuscriptPathParams(): Array<{ volumeId: string; route: string[] }> {
  const params = new Map<string, { volumeId: string; route: string[] }>();
  const addHref = (href: string) => {
    const route = manuscriptRouteFromHref(href);
    params.set(`${route.volumeId}:${route.route.join("/")}`, route);
  };

  for (const volume of catalog.volumes) {
    for (const part of volume.parts) {
      addHref(part.href);
      if (part.partId === volume.volumeId) {
        addHref(`/manuscripts/${volume.volumeId}/${part.partId}/`);
      }
      for (const chapter of part.chapters) {
        if (chapter.href !== part.href) addHref(chapter.href);
      }
    }
  }

  for (const section of catalog.sections) addHref(section.href);
  for (const alias of catalog.aliases) addHref(alias.sourceHref);

  return [...params.values()];
}

export function excerpt(text: string, maxLength = 180): string {
  if (text.length <= maxLength) return text;
  const shortened = text.slice(0, maxLength);
  return `${shortened.slice(0, shortened.lastIndexOf(" "))}...`;
}
