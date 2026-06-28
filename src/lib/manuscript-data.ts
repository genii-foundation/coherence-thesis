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
export type OutlineSubsection = {
  title: string;
  href: string;
  wordCount: number;
};
export type OutlineVolume = {
  title: string;
  subtitle: string;
  href: string;
  numberLabel: string;
  wordCount: number;
  subsections: OutlineSubsection[];
};
export type ToolbarOutline = {
  home: { title: string; href: string };
  overview: { title: string; href: string };
  volumes: OutlineVolume[];
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
      subsections: volume.parts.slice(0, 3).map((part) => ({
        title: part.title,
        href: part.href,
        wordCount: part.wordCount,
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
  const manuscripts = { label: "Manuscripts", href: "/manuscripts/" };

  addBreadcrumbRoute(routes, "/", []);
  addBreadcrumbRoute(routes, "/overview/", [overview]);
  addBreadcrumbRoute(routes, "/manuscripts/", [manuscripts]);

  for (const volume of catalog.volumes) {
    const volumeCrumb = { label: volume.title, href: volume.href };
    addBreadcrumbRoute(routes, volume.href, [volumeCrumb]);

    for (const part of volume.parts) {
      const partCrumb = { label: part.title, href: part.href };
      addBreadcrumbRoute(routes, part.href, [volumeCrumb, partCrumb]);

      for (const chapter of part.chapters) {
        const chapterCrumb = { label: chapter.title, href: chapter.href };
        addBreadcrumbRoute(routes, chapter.href, [volumeCrumb, partCrumb, chapterCrumb]);
      }
    }
  }

  for (const section of catalog.sections) {
    const volume = volumeById(section.volumeId);
    const part = partById(section.volumeId, section.partId);
    const chapter = chapterById(section.volumeId, section.partId, section.chapterId);
    if (!volume || !part || !chapter) continue;
    addBreadcrumbRoute(routes, section.href, [
      { label: volume.title, href: volume.href },
      { label: part.title, href: part.href },
      { label: chapter.title, href: chapter.href },
      { label: section.title, href: section.href },
    ]);
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

export function excerpt(text: string, maxLength = 180): string {
  if (text.length <= maxLength) return text;
  const shortened = text.slice(0, maxLength);
  return `${shortened.slice(0, shortened.lastIndexOf(" "))}...`;
}
