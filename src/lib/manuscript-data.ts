import catalogJson from "@/generated/manuscripts/catalog.json";
import {
  displayPartRouteSegment,
  displayPartTitle,
  isSyntheticFrontMatterPart,
} from "@/lib/manuscript-labels";

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
  chapterHref: string;
  readerHref: string;
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
  "sectionId" | "contentHash" | "title" | "href" | "chapterHref" | "readerHref"
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
    chapterHref: section.chapterHref,
    readerHref: section.readerHref,
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
        title: displayPartTitle(part, volume),
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
  const compactCrumbs = crumbs.filter(
    (crumb, index) => crumb.label !== crumbs[index + 1]?.label,
  );
  routes.set(href, { href, crumbs: compactCrumbs });
}

export function breadcrumbRoutes(): BreadcrumbRoute[] {
  const routes = new Map<string, BreadcrumbRoute>();
  const overview = { label: "Overview", href: "/overview/" };

  addBreadcrumbRoute(routes, "/", []);
  addBreadcrumbRoute(routes, "/overview/", [overview]);

  for (const volume of catalog.volumes) {
    addBreadcrumbRoute(routes, volume.href, []);

    for (const part of volume.parts) {
      const partCrumb = { label: displayPartTitle(part, volume), href: part.href };
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
      { label: displayPartTitle(part, volume), href: part.href },
      { label: section.title, href: section.readerHref },
    ];
    if (chapter.href !== part.href && !isSingletonChapterSection(chapter, section)) {
      crumbs.splice(1, 0, { label: chapter.title, href: chapter.href });
    }
    addBreadcrumbRoute(routes, section.readerHref, crumbs);
    if (section.href !== section.readerHref) {
      addBreadcrumbRoute(routes, section.href, [
        { label: displayPartTitle(part, volume), href: part.href },
        { label: chapter.title, href: chapter.href },
      ]);
    }
  }

  return [...routes.values()];
}

export function sectionById(sectionId: string): Section | undefined {
  return catalog.sections.find((section) => section.sectionId === sectionId);
}

export function volumeById(volumeId: string): Volume | undefined {
  return catalog.volumes.find((volume) => volume.volumeId === volumeId);
}

function volumeRouteSegment(volume: Volume): string {
  return volume.href.split("/").filter(Boolean)[1] ?? volume.volumeId;
}

function volumeRouteSegments(volume: Volume): string[] {
  return [...new Set([volumeRouteSegment(volume), volume.volumeId])];
}

export function volumeByRouteSegment(segment: string): Volume | undefined {
  return catalog.volumes.find((volume) =>
    volumeRouteSegments(volume).includes(segment),
  );
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

function normalizeHref(href: string): string {
  if (href === "/") return href;
  return href.endsWith("/") ? href : `${href}/`;
}

function manuscriptHrefWithVolumeSegment(
  href: string,
  volumeSegment: string,
): string {
  const parts = normalizeHref(href).split("/").filter(Boolean);
  if (parts[0] !== "manuscripts" || !parts[1]) return normalizeHref(href);
  parts[1] = volumeSegment;
  return normalizeHref(`/${parts.join("/")}`);
}

function canonicalizeManuscriptVolumeHref(href: string): string {
  const parts = normalizeHref(href).split("/").filter(Boolean);
  if (parts[0] !== "manuscripts" || !parts[1]) return normalizeHref(href);
  const volume = volumeByRouteSegment(parts[1]);
  if (!volume) return normalizeHref(href);
  parts[1] = volumeRouteSegment(volume);
  return normalizeHref(`/${parts.join("/")}`);
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
  const canonicalized = canonicalizeManuscriptVolumeHref(href);
  for (const volume of catalog.volumes) {
    const part = volume.parts.find((candidate) => normalizeHref(candidate.href) === normalized);
    if (part) return { volume, part };
    const canonicalPart = volume.parts.find(
      (candidate) => normalizeHref(candidate.href) === canonicalized,
    );
    if (canonicalPart) return { volume, part: canonicalPart };
    const legacyFrontMatterPart = volume.parts.find(
      (candidate) =>
        isSyntheticFrontMatterPart(candidate) &&
        volumeRouteSegments(volume).some(
          (segment) =>
            normalizeHref(`/manuscripts/${segment}/front-matter/`) === normalized,
        ),
    );
    if (legacyFrontMatterPart) return { volume, part: legacyFrontMatterPart };
    const legacyPart = volume.parts.find(
      (candidate) =>
        candidate.partId === volume.volumeId &&
        volumeRouteSegments(volume).some(
          (segment) =>
            normalizeHref(`/manuscripts/${segment}/${candidate.partId}/`) ===
            normalized,
        ),
    );
    if (legacyPart) return { volume, part: legacyPart };
  }
  return undefined;
}

export function chapterByHref(href: string): ChapterRouteMatch | undefined {
  const normalized = normalizeHref(href);
  const canonicalized = canonicalizeManuscriptVolumeHref(href);
  for (const volume of catalog.volumes) {
    for (const part of volume.parts) {
      const chapter = part.chapters.find(
        (candidate) =>
          (normalizeHref(candidate.href) === normalized ||
            normalizeHref(candidate.href) === canonicalized) &&
          normalizeHref(candidate.href) !== normalizeHref(part.href),
      );
      if (chapter) return { volume, part, chapter };
      if (!isSyntheticFrontMatterPart(part)) continue;
      const legacyChapter = part.chapters.find(
        (candidate) =>
          volumeRouteSegments(volume).some(
            (segment) =>
              normalizeHref(
                `/manuscripts/${segment}/front-matter/${candidate.chapterId}/`,
              ) === normalized,
          ) &&
          normalizeHref(candidate.href) !== normalizeHref(part.href),
      );
      if (legacyChapter) return { volume, part, chapter: legacyChapter };
    }
  }
  return undefined;
}

export function sectionByHrefOrAlias(
  href: string,
): { section: Section; alias?: SectionAlias } | undefined {
  const normalized = normalizeHref(href);
  const canonicalized = canonicalizeManuscriptVolumeHref(href);
  const section = catalog.sections.find(
    (candidate) =>
      normalizeHref(candidate.href) === normalized ||
      normalizeHref(candidate.href) === canonicalized,
  );
  if (section) return { section };
  const alias = catalog.aliases.find(
    (candidate) =>
      normalizeHref(candidate.sourceHref) === normalized ||
      normalizeHref(candidate.sourceHref) === canonicalized,
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

function readerNavigationItem(section: Section): NavigationItem {
  return {
    title: section.title,
    href: section.readerHref,
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
  const previous = items[currentIndex - 1];
  const next = items[currentIndex + 1];
  return {
    previous: previous ? navigationItem(previous) : null,
    parent: navigationItem(parent),
    next: next ? navigationItem(next) : null,
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
  const navigation = siblingNavigation(part.chapters, chapter.href, part);
  if (!navigation || navigation.next) return navigation;

  const sections = sectionsForChapter(volumeId, partId, chapterId);
  const lastSection = sections[sections.length - 1];
  if (!lastSection) return navigation;
  const next = lastSection.nextSectionId
    ? sectionById(lastSection.nextSectionId)
    : undefined;

  return {
    ...navigation,
    next: next ? readerNavigationItem(next) : null,
  };
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

export function manuscriptPathParams(): Array<{ volumeId: string; route: string[] }> {
  const params = new Map<string, { volumeId: string; route: string[] }>();
  const addHref = (href: string) => {
    const route = manuscriptRouteFromHref(href);
    params.set(`${route.volumeId}:${route.route.join("/")}`, route);
  };
  const addVolumeHrefs = (volume: Volume, href: string) => {
    for (const segment of volumeRouteSegments(volume)) {
      addHref(manuscriptHrefWithVolumeSegment(href, segment));
    }
  };

  for (const volume of catalog.volumes) {
    for (const part of volume.parts) {
      addVolumeHrefs(volume, part.href);
      if (isSyntheticFrontMatterPart(part)) {
        for (const segment of volumeRouteSegments(volume)) {
          addHref(`/manuscripts/${segment}/front-matter/`);
          addHref(`/manuscripts/${segment}/${displayPartRouteSegment(part, volume)}/`);
        }
      }
      if (part.partId === volume.volumeId) {
        for (const segment of volumeRouteSegments(volume)) {
          addHref(`/manuscripts/${segment}/${part.partId}/`);
          addHref(`/manuscripts/${segment}/part-${part.partId}/`);
        }
      }
      for (const chapter of part.chapters) {
        if (chapter.href !== part.href) addVolumeHrefs(volume, chapter.href);
        if (isSyntheticFrontMatterPart(part)) {
          for (const segment of volumeRouteSegments(volume)) {
            addHref(`/manuscripts/${segment}/front-matter/${chapter.chapterId}/`);
          }
        }
      }
    }
  }

  for (const section of catalog.sections) {
    const volume = volumeById(section.volumeId);
    if (volume) {
      addVolumeHrefs(volume, section.href);
    } else {
      addHref(section.href);
    }
  }
  for (const alias of catalog.aliases) addHref(alias.sourceHref);

  return [...params.values()];
}
