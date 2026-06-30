import type { ProgressSection, Section } from "./manuscript-data";

export type SectionReadState = {
  sectionId: string;
  contentHash: string;
  paragraphs?: Array<{
    paragraphId: string;
    contentHash: string;
  }>;
  readAt: number;
  percent: number;
};

export type ReaderProgressState = {
  sections: Record<string, SectionReadState>;
};

export type ReaderRecommendation = {
  sectionId: string;
  title: string;
  href: string;
  isUpdated: boolean;
};

export type RecentlyReadSection = {
  sectionId: string;
  title: string;
  href: string;
  readAt: number;
};

export const readerProgressStorageKey = "coherence-reader-progress-v1";
export const readerProgressUpdatedEvent = "coherence-reader-progress-updated";

export function emptyProgress(): ReaderProgressState {
  return { sections: {} };
}

export function parseProgress(raw: string | null): ReaderProgressState {
  if (!raw) return emptyProgress();
  try {
    const parsed = JSON.parse(raw) as ReaderProgressState;
    if (!parsed || typeof parsed !== "object" || !parsed.sections) {
      return emptyProgress();
    }
    return parsed;
  } catch {
    return emptyProgress();
  }
}

export function serializeProgress(progress: ReaderProgressState): string {
  return JSON.stringify(progress);
}

export function markRead(
  progress: ReaderProgressState,
  section: Pick<ProgressSection, "sectionId" | "contentHash"> &
    Partial<Pick<ProgressSection, "paragraphs">>,
  percent = 100,
  now = Date.now(),
): ReaderProgressState {
  return {
    sections: {
      ...progress.sections,
      [section.sectionId]: {
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        paragraphs: section.paragraphs?.map((paragraph) => ({
          paragraphId: paragraph.paragraphId,
          contentHash: paragraph.contentHash,
        })),
        readAt: now,
        percent,
      },
    },
  };
}

export function updatedSinceRead(
  progress: ReaderProgressState,
  section: Pick<Section, "sectionId" | "contentHash">,
): boolean {
  const state = progress.sections[section.sectionId];
  return Boolean(state && state.contentHash !== section.contentHash);
}

function firstChangedParagraphAnchor(
  progress: ReaderProgressState,
  section: ProgressSection,
): string | null {
  const state = progress.sections[section.sectionId];
  if (!state?.paragraphs?.length) return section.paragraphs[0]?.anchor ?? null;
  const readParagraphs = new Map(
    state.paragraphs.map((paragraph) => [paragraph.paragraphId, paragraph.contentHash]),
  );
  const changed = section.paragraphs.find(
    (paragraph) => readParagraphs.get(paragraph.paragraphId) !== paragraph.contentHash,
  );
  return changed?.anchor ?? section.paragraphs[0]?.anchor ?? null;
}

export function revisedSectionHref(
  progress: ReaderProgressState,
  section: ProgressSection,
): string {
  const anchor = firstChangedParagraphAnchor(progress, section);
  return anchor ? `${section.href}#${anchor}` : section.href;
}

export function readPercent(
  progress: ReaderProgressState,
  sections: Array<Pick<Section, "sectionId" | "contentHash">>,
): number {
  if (sections.length === 0) return 0;
  const read = sections.filter(
    (section) =>
      progress.sections[section.sectionId]?.contentHash === section.contentHash,
  ).length;
  return Math.round((read / sections.length) * 100);
}

export function recommendNextSections(
  progress: ReaderProgressState,
  sections: ProgressSection[],
  limit = 4,
): ReaderRecommendation[] {
  const firstUnread = sections.filter(
    (section) => !progress.sections[section.sectionId],
  );
  const updated = sections.filter((section) => updatedSinceRead(progress, section));
  return [
    ...updated.map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      href: revisedSectionHref(progress, section),
      isUpdated: true,
    })),
    ...firstUnread.map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      href: section.href,
      isUpdated: false,
    })),
  ]
    .filter(
      (section, index, list) =>
        list.findIndex((candidate) => candidate.sectionId === section.sectionId) === index,
    )
    .slice(0, limit);
}

export function recentlyReadSections(
  progress: ReaderProgressState,
  sections: ProgressSection[],
  limit = 4,
): RecentlyReadSection[] {
  return sections
    .map((section) => {
      const state = progress.sections[section.sectionId];
      return state
        ? {
            sectionId: section.sectionId,
            title: section.title,
            href: section.href,
            readAt: state.readAt,
          }
        : null;
    })
    .filter((section): section is RecentlyReadSection => Boolean(section))
    .sort((left, right) => right.readAt - left.readAt)
    .slice(0, limit);
}
