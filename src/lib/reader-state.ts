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
  firstOpenedAt?: number;
  lastOpenedAt?: number;
  lastReadAt?: number;
  openCount?: number;
  returnCount?: number;
  activeSeconds?: number;
  idleSeconds?: number;
  totalVisibleSeconds?: number;
  maxScrollPercent?: number;
  manualReadCount?: number;
  autoReadCount?: number;
  audioSeconds?: number;
  lastSource?: ReaderNavigationSource;
};

export type ReaderProgressState = {
  sections: Record<string, SectionReadState>;
};

export type ReaderNavigationSource =
  | "direct"
  | "outline"
  | "search"
  | "recommendation"
  | "next-section"
  | "previous-section"
  | "chapter"
  | "updated-notice"
  | "audio"
  | "unknown";

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
export const readerProgressV2StorageKey = "coherence-reader-progress-v2";
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

function paragraphHashes(
  section: Partial<Pick<ProgressSection, "paragraphs">>,
): SectionReadState["paragraphs"] {
  return section.paragraphs?.map((paragraph) => ({
    paragraphId: paragraph.paragraphId,
    contentHash: paragraph.contentHash,
  }));
}

function addSeconds(current: number | undefined, seconds: number): number {
  return Math.max(0, Math.round((current ?? 0) + seconds));
}

function maxPercent(current: number | undefined, percent: number): number {
  return Math.max(current ?? 0, Math.min(100, Math.max(0, Math.round(percent))));
}

export function markSectionOpened(
  progress: ReaderProgressState,
  section: Pick<ProgressSection, "sectionId" | "contentHash">,
  now = Date.now(),
  source: ReaderNavigationSource = "unknown",
): ReaderProgressState {
  const existing = progress.sections[section.sectionId];
  const openCount = existing?.openCount ?? 0;

  return {
    sections: {
      ...progress.sections,
      [section.sectionId]: {
        ...existing,
        sectionId: section.sectionId,
        contentHash: existing?.contentHash ?? section.contentHash,
        readAt: existing?.readAt ?? 0,
        percent: existing?.percent ?? 0,
        firstOpenedAt: existing?.firstOpenedAt ?? now,
        lastOpenedAt: now,
        openCount: openCount + 1,
        returnCount: openCount > 0 ? (existing?.returnCount ?? 0) + 1 : 0,
        lastSource: source,
      },
    },
  };
}

export function recordScrollProgress(
  progress: ReaderProgressState,
  section: Pick<ProgressSection, "sectionId" | "contentHash">,
  percent: number,
): ReaderProgressState {
  const existing = progress.sections[section.sectionId];

  return {
    sections: {
      ...progress.sections,
      [section.sectionId]: {
        ...existing,
        sectionId: section.sectionId,
        contentHash: existing?.contentHash ?? section.contentHash,
        readAt: existing?.readAt ?? 0,
        percent: maxPercent(existing?.percent, percent),
        maxScrollPercent: maxPercent(existing?.maxScrollPercent, percent),
      },
    },
  };
}

export function recordReadingTime(
  progress: ReaderProgressState,
  section: Pick<ProgressSection, "sectionId" | "contentHash">,
  timing: {
    activeSeconds: number;
    idleSeconds: number;
    totalVisibleSeconds: number;
  },
): ReaderProgressState {
  const existing = progress.sections[section.sectionId];

  return {
    sections: {
      ...progress.sections,
      [section.sectionId]: {
        ...existing,
        sectionId: section.sectionId,
        contentHash: existing?.contentHash ?? section.contentHash,
        readAt: existing?.readAt ?? 0,
        percent: existing?.percent ?? 0,
        activeSeconds: addSeconds(existing?.activeSeconds, timing.activeSeconds),
        idleSeconds: addSeconds(existing?.idleSeconds, timing.idleSeconds),
        totalVisibleSeconds: addSeconds(
          existing?.totalVisibleSeconds,
          timing.totalVisibleSeconds,
        ),
      },
    },
  };
}

export function recordAudioSeconds(
  progress: ReaderProgressState,
  section: Pick<ProgressSection, "sectionId" | "contentHash">,
  seconds: number,
): ReaderProgressState {
  const existing = progress.sections[section.sectionId];

  return {
    sections: {
      ...progress.sections,
      [section.sectionId]: {
        ...existing,
        sectionId: section.sectionId,
        contentHash: existing?.contentHash ?? section.contentHash,
        readAt: existing?.readAt ?? 0,
        percent: existing?.percent ?? 0,
        audioSeconds: addSeconds(existing?.audioSeconds, seconds),
        lastSource: "audio",
      },
    },
  };
}

export function markRead(
  progress: ReaderProgressState,
  section: Pick<ProgressSection, "sectionId" | "contentHash"> &
    Partial<Pick<ProgressSection, "paragraphs">>,
  percent = 100,
  now = Date.now(),
  method: "auto" | "manual" = "auto",
): ReaderProgressState {
  const existing = progress.sections[section.sectionId];

  return {
    sections: {
      ...progress.sections,
      [section.sectionId]: {
        ...existing,
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        paragraphs: paragraphHashes(section) ?? existing?.paragraphs,
        readAt: now,
        lastReadAt: now,
        percent: maxPercent(existing?.percent, percent),
        firstOpenedAt: existing?.firstOpenedAt ?? now,
        lastOpenedAt: existing?.lastOpenedAt ?? now,
        maxScrollPercent: maxPercent(existing?.maxScrollPercent, percent),
        manualReadCount:
          (existing?.manualReadCount ?? 0) + (method === "manual" ? 1 : 0),
        autoReadCount: (existing?.autoReadCount ?? 0) + (method === "auto" ? 1 : 0),
      },
    },
  };
}

export function mergeProgressStates(
  local: ReaderProgressState,
  remote: ReaderProgressState,
): ReaderProgressState {
  const sections: ReaderProgressState["sections"] = { ...remote.sections };

  for (const [sectionId, localSection] of Object.entries(local.sections)) {
    const remoteSection = sections[sectionId];
    if (!remoteSection) {
      sections[sectionId] = localSection;
      continue;
    }

    const localReadAt = localSection.readAt ?? 0;
    const remoteReadAt = remoteSection.readAt ?? 0;
    const preferred =
      localReadAt > remoteReadAt ||
      (localReadAt === remoteReadAt &&
        (localSection.percent ?? 0) >= (remoteSection.percent ?? 0))
        ? localSection
        : remoteSection;

    sections[sectionId] = {
      ...preferred,
      firstOpenedAt: Math.min(
        localSection.firstOpenedAt ?? localSection.readAt ?? Number.MAX_SAFE_INTEGER,
        remoteSection.firstOpenedAt ?? remoteSection.readAt ?? Number.MAX_SAFE_INTEGER,
      ),
      lastOpenedAt: Math.max(
        localSection.lastOpenedAt ?? 0,
        remoteSection.lastOpenedAt ?? 0,
      ),
      openCount: (localSection.openCount ?? 0) + (remoteSection.openCount ?? 0),
      returnCount:
        (localSection.returnCount ?? 0) + (remoteSection.returnCount ?? 0),
      activeSeconds:
        (localSection.activeSeconds ?? 0) + (remoteSection.activeSeconds ?? 0),
      idleSeconds: (localSection.idleSeconds ?? 0) + (remoteSection.idleSeconds ?? 0),
      totalVisibleSeconds:
        (localSection.totalVisibleSeconds ?? 0) +
        (remoteSection.totalVisibleSeconds ?? 0),
      maxScrollPercent: Math.max(
        localSection.maxScrollPercent ?? localSection.percent ?? 0,
        remoteSection.maxScrollPercent ?? remoteSection.percent ?? 0,
      ),
      manualReadCount:
        (localSection.manualReadCount ?? 0) + (remoteSection.manualReadCount ?? 0),
      autoReadCount:
        (localSection.autoReadCount ?? 0) + (remoteSection.autoReadCount ?? 0),
      audioSeconds:
        (localSection.audioSeconds ?? 0) + (remoteSection.audioSeconds ?? 0),
    };

    if (sections[sectionId].firstOpenedAt === Number.MAX_SAFE_INTEGER) {
      delete sections[sectionId].firstOpenedAt;
    }
  }

  return { sections };
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
