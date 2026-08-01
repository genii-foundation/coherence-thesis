import { slugify } from "@/lib/slugify";

export type EditorialSectionStatus = "settled" | "open" | "not-started";

export type EditorialSectionProgress = {
  index: number;
  heading: string;
  sectionId: string;
  status: EditorialSectionStatus;
  rendered: boolean;
  settled: boolean;
  words: number;
};

export type EditorialVolumeProgress = {
  editorialId: string;
  sections: EditorialSectionProgress[];
  rendered: number;
  settled: number;
  open: number;
  notStarted: number;
  total: number;
  renderedWords: number;
  settledWords: number;
  totalWords: number;
  renderedPercent: number;
  settledPercent: number;
};

export type CalibrationRecordState = {
  status?: unknown;
};

function sectionIdFor(volumeNumber: string, heading: string): string {
  return `v${volumeNumber}-${slugify(heading.replace(/\*/g, ""))}`;
}

function statusFor(record: CalibrationRecordState | null): EditorialSectionStatus {
  if (!record) return "not-started";
  return record.status === "settled" ? "settled" : "open";
}

export function baselineSections(
  markdown: string,
  volumeNumber: string,
): Omit<
  EditorialSectionProgress,
  "index" | "status" | "rendered" | "settled"
>[] {
  const sections: Omit<
    EditorialSectionProgress,
    "index" | "status" | "rendered" | "settled"
  >[] = [];
  let current: { heading: string; body: string[] } | null = null;
  const flush = (): void => {
    if (!current) return;
    sections.push({
      heading: current.heading,
      sectionId: sectionIdFor(volumeNumber, current.heading),
      words:
        current.body.join(" ").match(/[A-Za-z0-9'’-]+/g)?.length ?? 0,
    });
  };

  for (const line of markdown.split("\n")) {
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      current = { heading: (heading[2] ?? "").trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  flush();
  return sections;
}

export function deriveEditorialVolumeProgress(
  editorialId: string,
  baseline: string,
  records: ReadonlyMap<string, CalibrationRecordState>,
): EditorialVolumeProgress {
  const volumeNumber = editorialId.replace("volume-", "");
  const sections = baselineSections(baseline, volumeNumber).map(
    (section, index): EditorialSectionProgress => {
      const status = statusFor(records.get(section.sectionId) ?? null);
      return {
        ...section,
        index: index + 1,
        status,
        rendered: status !== "not-started",
        settled: status === "settled",
      };
    },
  );
  const rendered = sections.filter((section) => section.rendered);
  const settled = sections.filter((section) => section.settled);
  const open = sections.filter((section) => section.status === "open");
  const totalWords = sections.reduce(
    (total, section) => total + section.words,
    0,
  );

  return {
    editorialId,
    sections,
    rendered: rendered.length,
    settled: settled.length,
    open: open.length,
    notStarted: sections.length - rendered.length,
    total: sections.length,
    renderedWords: rendered.reduce(
      (total, section) => total + section.words,
      0,
    ),
    settledWords: settled.reduce(
      (total, section) => total + section.words,
      0,
    ),
    totalWords,
    renderedPercent: sections.length
      ? Math.round((rendered.length / sections.length) * 100)
      : 0,
    settledPercent: sections.length
      ? Math.round((settled.length / sections.length) * 100)
      : 0,
  };
}
