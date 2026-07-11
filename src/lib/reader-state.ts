import type { ProgressSection } from "./manuscript-data";

export type SectionReadState = {
  sectionId: string;
  contentHash: string;
  continuityIds?: string[];
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

export type ProgressIdentity = Pick<ProgressSection, "sectionId" | "contentHash"> &
  Partial<
    Pick<
      ProgressSection,
      "continuityId" | "legacyContinuityIds" | "progressContinuityGroups"
    >
  >;

type ProgressLineageIdentity = Pick<
  ProgressIdentity,
  | "sectionId"
  | "continuityId"
  | "legacyContinuityIds"
  | "progressContinuityGroups"
>;

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

// The schema version this client writes to and understands from the remote
// `reader_progress.schema_version` column. Bump this when the persisted
// progress shape changes in a way older clients cannot safely read, and add the
// matching upgrade step in reconcileRemoteProgress.
export const readerProgressSchemaVersion = 2;

export function emptyProgress(): ReaderProgressState {
  return { sections: {} };
}

function isValidSectionState(value: unknown): value is SectionReadState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const section = value as Record<string, unknown>;
  return (
    typeof section.sectionId === "string" &&
    typeof section.contentHash === "string" &&
    typeof section.readAt === "number" &&
    Number.isFinite(section.readAt) &&
    typeof section.percent === "number" &&
    Number.isFinite(section.percent)
  );
}

// Validate a progress object's shape before it enters local state. Storage can
// be edited by hand and, once sync is on, remote rows are merged in; a malformed
// entry (wrong types, an array where an object is expected) would otherwise flow
// into the merge and read paths. Structurally invalid entries are dropped;
// valid entries are kept intact with all their optional fields.
export function sanitizeProgress(value: unknown): ReaderProgressState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyProgress();
  }
  const sectionsRaw = (value as { sections?: unknown }).sections;
  if (
    !sectionsRaw ||
    typeof sectionsRaw !== "object" ||
    Array.isArray(sectionsRaw)
  ) {
    return emptyProgress();
  }
  const sections: ReaderProgressState["sections"] = {};
  for (const [key, entry] of Object.entries(
    sectionsRaw as Record<string, unknown>,
  )) {
    if (isValidSectionState(entry)) sections[key] = entry;
  }
  return { sections };
}

export function parseProgress(raw: string | null): ReaderProgressState {
  if (!raw) return emptyProgress();
  try {
    return sanitizeProgress(JSON.parse(raw));
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

export function primaryProgressKey(
  section: Pick<ProgressIdentity, "sectionId" | "continuityId">,
): string {
  return section.continuityId || section.sectionId;
}

export function progressGroups(section: ProgressLineageIdentity): string[][] {
  const primary = primaryProgressKey(section);
  const configured = section.progressContinuityGroups?.filter(
    (group) => group.length > 0,
  );
  const source =
    configured && configured.length > 0
      ? configured
      : [
          [primary],
          ...(section.legacyContinuityIds ?? []).map((id) => [id]),
        ];
  const used = new Set<string>();
  const groups = source
    .map((group) =>
      group.filter((id) => {
        if (!id || used.has(id)) return false;
        used.add(id);
        return true;
      }),
    )
    .filter((group) => group.length > 0);

  if (!used.has(primary)) {
    groups.unshift([primary]);
  }
  return groups;
}

export function progressKeys(
  section: ProgressLineageIdentity,
): string[] {
  return progressGroups(section).flat();
}

export function progressStatesForSection(
  progress: ReaderProgressState,
  section: ProgressLineageIdentity,
): SectionReadState[] {
  return [
    ...new Set(
      progressKeys(section)
        .map((key) => progress.sections[key])
        .filter((state): state is SectionReadState => Boolean(state)),
    ),
  ];
}

function stateCoversCurrentLineage(
  state: SectionReadState,
  section: ProgressLineageIdentity,
): boolean {
  const groups = progressGroups(section);
  if (groups.length === 1 && state.sectionId === section.sectionId) return true;
  const recorded = new Set([state.sectionId, ...(state.continuityIds ?? [])]);
  return groups.every((group) =>
    group.some((key) => recorded.has(key)),
  );
}

export function progressStateForSection(
  progress: ReaderProgressState,
  section: ProgressLineageIdentity,
): SectionReadState | undefined {
  const primary = progress.sections[primaryProgressKey(section)];
  if (primary?.sectionId === section.sectionId) return primary;
  const states = progressStatesForSection(progress, section);
  if (states.length === 0) return undefined;
  return states.reduce((latest, state) => {
    const latestAt = Math.max(
      latest.lastOpenedAt ?? 0,
      latest.lastReadAt ?? latest.readAt ?? 0,
    );
    const stateAt = Math.max(
      state.lastOpenedAt ?? 0,
      state.lastReadAt ?? state.readAt ?? 0,
    );
    return stateAt > latestAt ? state : latest;
  });
}

export function progressPercentForSection(
  progress: ReaderProgressState,
  section: ProgressIdentity,
): number {
  const current = progress.sections[primaryProgressKey(section)];
  if (current && stateCoversCurrentLineage(current, section)) {
    return current.percent;
  }
  const groups = progressGroups(section);
  if (groups.length === 1) {
    const state = progressStateForSection(progress, section);
    return state?.percent ?? 0;
  }
  const percentages = groups.map((group) =>
    Math.max(...group.map((key) => progress.sections[key]?.percent ?? 0)),
  );
  return Math.min(...percentages);
}

// Every section mutator rebuilds the same base record envelope (spread the
// section map, spread the existing entry, re-assert the id and the
// default-preserving contentHash/readAt/percent) before applying its own fields.
// Centralizing it (MAINT-05) means a future field cannot be silently dropped by
// one mutator, and each mutator below only expresses what it actually changes.
// The fields returned by `patch` are spread last, so a mutator can still
// override a base default (markRead sets contentHash and readAt outright).
function updateSection(
  progress: ReaderProgressState,
  section: ProgressIdentity,
  patch: (existing: SectionReadState | undefined) => Partial<SectionReadState>,
): ReaderProgressState {
  const key = primaryProgressKey(section);
  const primaryExisting = progress.sections[key];
  const groups = progressGroups(section);
  const existing =
    primaryExisting ??
    (groups.length === 1
      ? progressStateForSection(progress, section)
      : undefined);
  return {
    sections: {
      ...progress.sections,
      [key]: {
        ...existing,
        sectionId: existing?.sectionId ?? section.sectionId,
        contentHash: existing?.contentHash ?? section.contentHash,
        readAt: existing?.readAt ?? 0,
        percent: existing?.percent ?? 0,
        ...patch(existing),
      },
    },
  };
}

export function markSectionOpened(
  progress: ReaderProgressState,
  section: ProgressIdentity,
  now = Date.now(),
  source: ReaderNavigationSource = "unknown",
): ReaderProgressState {
  return updateSection(progress, section, (existing) => {
    const openCount = existing?.openCount ?? 0;
    return {
      firstOpenedAt: existing?.firstOpenedAt ?? now,
      lastOpenedAt: now,
      openCount: openCount + 1,
      returnCount: openCount > 0 ? (existing?.returnCount ?? 0) + 1 : 0,
      lastSource: source,
    };
  });
}

export function recordScrollProgress(
  progress: ReaderProgressState,
  section: ProgressIdentity,
  percent: number,
): ReaderProgressState {
  const existing = progressStateForSection(progress, section);
  const nextPercent = maxPercent(existing?.percent, percent);
  const nextMaxScroll = maxPercent(existing?.maxScrollPercent, percent);

  // Scroll fires many times per second; when the max percent has not advanced
  // there is nothing to record. Returning the same reference lets callers skip
  // a re-render and a localStorage write.
  if (
    existing &&
    existing.percent === nextPercent &&
    existing.maxScrollPercent === nextMaxScroll
  ) {
    return progress;
  }

  return updateSection(progress, section, () => ({
    percent: nextPercent,
    maxScrollPercent: nextMaxScroll,
  }));
}

export function recordReadingTime(
  progress: ReaderProgressState,
  section: ProgressIdentity,
  timing: {
    activeSeconds: number;
    idleSeconds: number;
    totalVisibleSeconds: number;
  },
): ReaderProgressState {
  return updateSection(progress, section, (existing) => ({
    activeSeconds: addSeconds(existing?.activeSeconds, timing.activeSeconds),
    idleSeconds: addSeconds(existing?.idleSeconds, timing.idleSeconds),
    totalVisibleSeconds: addSeconds(
      existing?.totalVisibleSeconds,
      timing.totalVisibleSeconds,
    ),
  }));
}

export function recordAudioSeconds(
  progress: ReaderProgressState,
  section: ProgressIdentity,
  seconds: number,
): ReaderProgressState {
  return updateSection(progress, section, (existing) => ({
    audioSeconds: addSeconds(existing?.audioSeconds, seconds),
    lastSource: "audio",
  }));
}

export function markRead(
  progress: ReaderProgressState,
  section: ProgressIdentity &
    Partial<Pick<ProgressSection, "paragraphs">>,
  percent = 100,
  now = Date.now(),
  method: "auto" | "manual" = "auto",
): ReaderProgressState {
  return updateSection(progress, section, (existing) => ({
    sectionId: section.sectionId,
    continuityIds: progressKeys(section),
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
  }));
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
      // Counters are monotonic per device, and remote is this device's own
      // last upload, so max keeps the newest count without re-adding a value
      // the device already contributed. Summing here doubled every metric on
      // each signed-in load.
      openCount: Math.max(
        localSection.openCount ?? 0,
        remoteSection.openCount ?? 0,
      ),
      returnCount: Math.max(
        localSection.returnCount ?? 0,
        remoteSection.returnCount ?? 0,
      ),
      activeSeconds: Math.max(
        localSection.activeSeconds ?? 0,
        remoteSection.activeSeconds ?? 0,
      ),
      idleSeconds: Math.max(
        localSection.idleSeconds ?? 0,
        remoteSection.idleSeconds ?? 0,
      ),
      totalVisibleSeconds: Math.max(
        localSection.totalVisibleSeconds ?? 0,
        remoteSection.totalVisibleSeconds ?? 0,
      ),
      maxScrollPercent: Math.max(
        localSection.maxScrollPercent ?? localSection.percent ?? 0,
        remoteSection.maxScrollPercent ?? remoteSection.percent ?? 0,
      ),
      manualReadCount: Math.max(
        localSection.manualReadCount ?? 0,
        remoteSection.manualReadCount ?? 0,
      ),
      autoReadCount: Math.max(
        localSection.autoReadCount ?? 0,
        remoteSection.autoReadCount ?? 0,
      ),
      audioSeconds: Math.max(
        localSection.audioSeconds ?? 0,
        remoteSection.audioSeconds ?? 0,
      ),
    };

    if (sections[sectionId].firstOpenedAt === Number.MAX_SAFE_INTEGER) {
      delete sections[sectionId].firstOpenedAt;
    }
  }

  return { sections };
}

// Decide how to fold a remote progress row into local state given the schema
// version it was written with. Returns the merged state when the remote is at
// or below this client's known schema, or null when it is newer and must not be
// merged: an older client that blindly merged a newer row could drop fields it
// does not understand and then overwrite the richer remote row with a lossy
// copy. Rows at an older version (v1) differ from the current shape only by
// additive optional fields, so they merge as-is; a future breaking bump adds
// its upgrade transform here before the merge.
export function reconcileRemoteProgress(
  local: ReaderProgressState,
  remote: ReaderProgressState,
  remoteSchemaVersion: number,
): ReaderProgressState | null {
  if (remoteSchemaVersion > readerProgressSchemaVersion) return null;
  return mergeProgressStates(local, remote);
}

export function updatedSinceRead(
  progress: ReaderProgressState,
  section: ProgressIdentity,
): boolean {
  const states = progressStatesForSection(progress, section);
  if (
    states.some(
      (state) =>
        state.contentHash === section.contentHash &&
        state.readAt > 0 &&
        state.percent >= 100 &&
        stateCoversCurrentLineage(state, section),
    )
  ) {
    return false;
  }
  // Only a genuinely read section can be "updated since you read it". Records
  // created by merely opening a section have readAt 0 and must not trigger
  // revision notices or update badges.
  return Boolean(
    states.some(
      (state) =>
        (state.readAt ?? 0) > 0 &&
        (state.percent ?? 0) >= 100 &&
        (state.contentHash !== section.contentHash ||
          !stateCoversCurrentLineage(state, section)),
    ),
  );
}

function firstChangedParagraphAnchor(
  progress: ReaderProgressState,
  section: ProgressSection,
): string | null {
  const state = progressStatesForSection(progress, section)
    .filter((candidate) => candidate.readAt > 0)
    .sort((left, right) => right.readAt - left.readAt)[0];
  if (!state?.paragraphs?.length) return section.paragraphs[0]?.anchor ?? null;
  const legacyOrdinalParagraphs = state.paragraphs.every((paragraph) =>
    /^p-\d+$/.test(paragraph.paragraphId),
  );
  if (legacyOrdinalParagraphs) {
    const previous = [...state.paragraphs].sort(
      (left, right) =>
        Number(left.paragraphId.slice(2)) - Number(right.paragraphId.slice(2)),
    );
    const length = Math.max(previous.length, section.paragraphs.length);
    for (let index = 0; index < length; index += 1) {
      if (previous[index]?.contentHash === section.paragraphs[index]?.contentHash) {
        continue;
      }
      return (
        section.paragraphs[Math.min(index, section.paragraphs.length - 1)]?.anchor ??
        section.paragraphs[0]?.anchor ??
        null
      );
    }
    return section.paragraphs[0]?.anchor ?? null;
  }
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
  if (!anchor) return section.readerHref ?? section.href;
  const baseHref = section.readerHref ?? section.href;
  if (baseHref.includes("#")) {
    return `${(section.chapterHref ?? section.href).replace(/#.*$/, "")}#${section.sectionId}-${anchor}`;
  }
  return `${baseHref}#${anchor}`;
}

export function isSectionRead(
  progress: ReaderProgressState,
  section: ProgressIdentity,
): boolean {
  // A record alone does not mean read: merely opening a section stores its
  // contentHash (markSectionOpened, recordScrollProgress). Read requires an
  // actual read event, which is the only writer of a positive readAt.
  return progressStatesForSection(progress, section).some(
    (state) =>
      (state.readAt ?? 0) > 0 &&
      (state.percent ?? 0) >= 100 &&
      state.contentHash === section.contentHash &&
      stateCoversCurrentLineage(state, section),
  );
}

export function readPercent(
  progress: ReaderProgressState,
  sections: ProgressIdentity[],
): number {
  if (sections.length === 0) return 0;
  const read = sections.reduce((total, section) => {
    const percent = progressStatesForSection(progress, section).reduce(
      (largest, state) =>
        state.contentHash === section.contentHash &&
        stateCoversCurrentLineage(state, section)
          ? Math.max(largest, state.percent ?? 0)
          : largest,
      0,
    );
    return total + Math.min(100, Math.max(0, percent));
  }, 0);
  return Math.round(read / sections.length);
}

export function recommendNextSections(
  progress: ReaderProgressState,
  sections: ProgressSection[],
  limit = 4,
): ReaderRecommendation[] {
  const firstUnread = sections.filter((section) => !isSectionRead(progress, section));
  const updated = sections.filter((section) => updatedSinceRead(progress, section));
  const candidates = [
    ...updated.map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      href: revisedSectionHref(progress, section),
      isUpdated: true,
    })),
    ...firstUnread.map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      href: section.readerHref ?? section.href,
      isUpdated: false,
    })),
  ];

  const seen = new Set<string>();
  const deduped: ReaderRecommendation[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.sectionId)) continue;
    seen.add(candidate.sectionId);
    deduped.push(candidate);
    if (deduped.length === limit) break;
  }
  return deduped;
}

export function recentlyReadSections(
  progress: ReaderProgressState,
  sections: ProgressSection[],
  limit = 4,
): RecentlyReadSection[] {
  return sections
    .map((section) => {
      const state = progressStatesForSection(progress, section)
        .filter((candidate) => candidate.readAt > 0)
        .sort((left, right) => right.readAt - left.readAt)[0];
      // readAt is 0 for sections that were only opened, never read. Those must
      // not appear under "Recently read".
      return state && state.readAt > 0
        ? {
            sectionId: section.sectionId,
            title: section.title,
            href: section.readerHref ?? section.href,
            readAt: state.readAt,
          }
        : null;
    })
    .filter((section): section is RecentlyReadSection => Boolean(section))
    .sort((left, right) => right.readAt - left.readAt)
    .slice(0, limit);
}
