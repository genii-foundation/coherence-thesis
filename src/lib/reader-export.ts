import type { ProgressSection } from "./manuscript-data";
import {
  bookmarkHref,
  liveBookmarks,
  type ReaderBookmarksState,
} from "./reader-bookmarks";
import type {
  ReaderEngagementEvent,
  ReaderSyncConsent,
} from "./reader-engagement";
import type { ReaderPreferences } from "./reader-preferences";
import {
  primaryProgressKey,
  progressStateForSection,
  type ReaderProgressState,
  type SectionReadState,
} from "./reader-state";

// Everything this site has recorded about one reader, in one readable file.
//
// Markdown rather than JSON: this is meant to be opened and understood, not
// re-imported. A reader asking what a site knows about them is owed an answer
// they can read, so the numbers are formatted, the bookmarks carry their
// quotes, and the sections that hold nothing are left out rather than padding
// the file with zeroes.
//
// Pure, so it is unit testable and the island stays a shell.

export type ReaderExportInput = {
  progress: ReaderProgressState;
  bookmarks: ReaderBookmarksState;
  events: readonly ReaderEngagementEvent[];
  consent: ReaderSyncConsent | null;
  preferences: ReaderPreferences | null;
  sections: readonly ProgressSection[];
  signedIn: boolean;
  lastSyncedAt: number | null;
  generatedAt: number;
  origin?: string;
};

export const readerExportFileName = "coherence-thesis-reader-data.md";
export const readerExportFormatVersion = 1;

const numberFormat = new Intl.NumberFormat("en-US");

function formatNumber(value: number): string {
  return numberFormat.format(Math.round(value));
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

// Whole units only. "2 hours 5 minutes" reads better than a decimal, and this
// is a document a person reads rather than a metric anyone sums.
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) {
    return `${formatNumber(total)} second${total === 1 ? "" : "s"}`;
  }
  const minutes = Math.round(total / 60);
  if (minutes < 60) {
    return `${formatNumber(minutes)} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hoursLabel = `${formatNumber(hours)} hour${hours === 1 ? "" : "s"}`;
  if (remainder === 0) return hoursLabel;
  return `${hoursLabel} ${formatNumber(remainder)} minute${remainder === 1 ? "" : "s"}`;
}

type SectionActivity = {
  section: ProgressSection;
  state: SectionReadState;
};

function sectionsWithActivity(
  progress: ReaderProgressState,
  sections: readonly ProgressSection[],
): SectionActivity[] {
  const seen = new Set<string>();
  const rows: SectionActivity[] = [];
  for (const section of sections) {
    const state = progressStateForSection(progress, section);
    if (!state) continue;
    const key = primaryProgressKey(section);
    if (seen.has(key)) continue;
    seen.add(key);
    const touched =
      (state.percent ?? 0) > 0 ||
      (state.openCount ?? 0) > 0 ||
      (state.totalVisibleSeconds ?? 0) > 0 ||
      (state.audioSeconds ?? 0) > 0;
    if (!touched) continue;
    rows.push({ section, state });
  }
  return rows;
}

function summaryLines(input: ReaderExportInput, rows: SectionActivity[]): string[] {
  const readCount = rows.filter(
    (row) => (row.state.readAt ?? 0) > 0 && (row.state.percent ?? 0) >= 100,
  ).length;
  const activeSeconds = rows.reduce(
    (total, row) => total + (row.state.activeSeconds ?? 0),
    0,
  );
  const audioSeconds = rows.reduce(
    (total, row) => total + (row.state.audioSeconds ?? 0),
    0,
  );
  const saved = liveBookmarks(input.bookmarks);

  return [
    `- Sections opened: ${formatNumber(rows.length)} of ${formatNumber(input.sections.length)}`,
    `- Sections finished: ${formatNumber(readCount)}`,
    `- Time reading: ${formatDuration(activeSeconds)}`,
    `- Time listening: ${formatDuration(audioSeconds)}`,
    `- Bookmarks saved: ${formatNumber(saved.length)}`,
    `- Activity records kept on this device: ${formatNumber(input.events.length)}`,
  ];
}

function bookmarkLines(input: ReaderExportInput): string[] {
  const saved = liveBookmarks(input.bookmarks);
  if (saved.length === 0) {
    return ["No bookmarks saved."];
  }

  const sectionById = new Map(
    input.sections.map((section) => [section.sectionId, section]),
  );
  const lines: string[] = [];
  let lastTitle: string | null = null;

  for (const bookmark of saved) {
    const section = sectionById.get(bookmark.sectionId);
    const title = section?.title ?? bookmark.sectionId;
    if (title !== lastTitle) {
      lines.push(`### ${title}`, "");
      lastTitle = title;
    }
    for (const line of bookmark.quote.split("\n")) lines.push(`> ${line}`);
    lines.push("");
    if (bookmark.note) {
      lines.push("Note:", "");
      // Notes are reader-controlled Markdown-shaped text. Keeping every line
      // inside a block quote prevents a note such as "## Reading activity"
      // from forging a structural heading in the exported report.
      for (const line of bookmark.note.split("\n")) lines.push(`> ${line}`);
      lines.push("");
    }
    lines.push(`Saved ${formatDate(bookmark.createdAt)}.`);
    if (section) {
      lines.push(
        `[Open passage](${input.origin ?? ""}${bookmarkHref(bookmark, section)})`,
      );
    }
    lines.push("");
  }
  return lines;
}

function activityLines(rows: SectionActivity[]): string[] {
  if (rows.length === 0) return ["No reading activity recorded yet."];

  const lines = [
    "| Section | Progress | Times opened | Reading time | Listening time |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const { section, state } of rows) {
    lines.push(
      [
        "",
        section.title.replace(/\|/g, "\\|"),
        `${formatNumber(state.percent ?? 0)}%`,
        formatNumber(state.openCount ?? 0),
        formatDuration(state.activeSeconds ?? 0),
        formatDuration(state.audioSeconds ?? 0),
        "",
      ].join(" | ").trim(),
    );
  }
  return lines;
}

function eventLines(events: readonly ReaderEngagementEvent[]): string[] {
  if (events.length === 0) {
    return ["No activity records stored."];
  }
  const counts = new Map<string, number>();
  let earliest = Number.MAX_SAFE_INTEGER;
  let latest = 0;
  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
    earliest = Math.min(earliest, event.eventAt);
    latest = Math.max(latest, event.eventAt);
  }

  const lines = [
    `Recorded between ${formatDate(earliest)} and ${formatDate(latest)}.`,
    "",
    "| Activity | Times recorded |",
    "| --- | --- |",
  ];
  for (const [type, count] of [...counts.entries()].sort(
    (left, right) => right[1] - left[1],
  )) {
    lines.push(`| ${type.replace(/_/g, " ")} | ${formatNumber(count)} |`);
  }
  return lines;
}

function syncLines(input: ReaderExportInput): string[] {
  if (!input.signedIn) {
    return [
      "This browser is not currently signed in. This report was generated from data stored locally in this browser.",
      "The browser cannot determine whether a previous signed-in session synchronized any of this data.",
    ];
  }
  const granted = input.consent?.granted === true;
  return [
    granted
      ? "Signed in, with syncing turned on. Reading progress and bookmarks are eligible to be copied to your account."
      : "Signed in, with syncing turned off. This report was generated from data stored locally in this browser.",
    input.lastSyncedAt
      ? `Last synced ${formatDate(input.lastSyncedAt)}.`
      : "Never synced.",
    granted
      ? "A successful sync time reports the last completed synchronization from this browser."
      : "Data synchronized by an earlier session may remain in the account until the reader deletes it.",
  ];
}

function preferenceLines(preferences: ReaderPreferences | null): string[] {
  if (!preferences) return [];
  return [
    "## Your settings",
    "",
    `- Theme: ${preferences.theme}`,
    `- Typeface: ${preferences.fontFamily}`,
    `- Text size: ${formatNumber(preferences.fontSize)}%`,
    `- Animations: ${preferences.animations}`,
    `- Bookmark highlights: ${preferences.highlights}`,
    "",
  ];
}

export function buildReaderExport(input: ReaderExportInput): string {
  const rows = sectionsWithActivity(input.progress, input.sections);

  return [
    "# Your Coherence Thesis reader data",
    "",
    `Exported ${formatDate(input.generatedAt)}.`,
    `Export format version: ${readerExportFormatVersion}.`,
    "",
    "This readable report summarizes the reader data currently stored by this browser: reading progress, saved passages and notes, activity counts, reader settings, and synchronization status.",
    "",
    "## Summary",
    "",
    ...summaryLines(input, rows),
    "",
    "## Bookmarks",
    "",
    ...bookmarkLines(input),
    "",
    "## Reading activity",
    "",
    ...activityLines(rows),
    "",
    "## Activity records",
    "",
    ...eventLines(input.events),
    "",
    ...preferenceLines(input.preferences),
    "## Where this is stored",
    "",
    ...syncLines(input),
    "",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}
