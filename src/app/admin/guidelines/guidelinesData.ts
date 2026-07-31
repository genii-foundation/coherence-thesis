import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export const editorialStandardPath = "editorial/method/standard.md";
export const corpusVoiceCardPath = "editorial/sources/corpus/voice-card.md";
const editorialVolumeIds = Array.from(
  { length: 9 },
  (_, index) => `volume-${String(index + 1).padStart(2, "0")}`,
);
const historicalEditorialStandardPath = "editorial/standards/editorial.md";
const originalEditorialStandardPath =
  ".agents/skills/coherence-editorial-review/references/editorial-standards.md";
const editorialStandardPaths = [
  editorialStandardPath,
  historicalEditorialStandardPath,
  originalEditorialStandardPath,
] as const;

export interface GuidelineSection {
  id: string;
  title: string;
  markdown: string;
}

export interface GuidelineRule {
  id: string;
  obligation: string;
  section: string;
}

export interface GuidelineHistoryEntry {
  hash: string;
  shortHash: string;
  date: string;
  subject: string;
  additions: number;
  deletions: number;
  changedPath: string;
  addedRules: string[];
  renamedFrom?: string;
  renamedTo?: string;
}

export interface GuidelineSectionRevision {
  hash: string;
  shortHash: string;
  date: string;
  subject: string;
  kind: "introduced" | "revised";
  additions: number;
  deletions: number;
  addedRules: string[];
}

export interface GuidelineSectionHistory {
  sectionId: string;
  introducedAt: string;
  revisions: GuidelineSectionRevision[];
}

export interface EditorialGuidelines {
  markdown: string;
  sections: GuidelineSection[];
  rules: GuidelineRule[];
  catalogCategories: number;
  lineCount: number;
  wordCount: number;
  history: GuidelineHistoryEntry[];
  sectionHistories: Record<string, GuidelineSectionHistory>;
}

export interface EditorialVoiceCard {
  id: string;
  label: string;
  title: string;
  path: string;
  markdown: string;
  status: "Active" | "Pending";
  statusDetail: string;
  departure?: string;
  history: VoiceCardHistoryEntry[];
}

export interface VoiceCardHistoryEntry {
  hash: string;
  shortHash: string;
  date: string;
  subject: string;
  additions: number;
  deletions: number;
  changedPath: string;
}

interface VolumeManifest {
  editorialId: string;
  title: string;
  numberLabel: string;
  order: number;
  voiceCardPath: string;
}

function headingId(title: string): string {
  return title
    .replace(/`/g, "")
    .replace(/^\d+\.\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseEditorialStandard(
  markdown: string,
): Omit<EditorialGuidelines, "history" | "sectionHistories"> {
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  const sections = headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? markdown.length;
    const title = heading[1]?.trim() ?? "Untitled";
    return {
      id: headingId(title),
      title: title.replace(/^\d+\.\s*/, ""),
      markdown: markdown.slice(start, end).trim(),
    };
  });
  const rules = [
    ...markdown.matchAll(
      /^\|\s*`(R-[A-Z-]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm,
    ),
  ].map((match) => ({
    id: match[1] ?? "",
    obligation: match[2]?.trim() ?? "",
    section: match[3]?.trim() ?? "",
  }));
  const catalogCategories = new Set(
    [...markdown.matchAll(/^###\s+4\.(\d+)\s+/gm)].map((match) => match[1]),
  ).size;

  return {
    markdown,
    sections,
    rules,
    catalogCategories,
    lineCount: markdown.split("\n").length - (markdown.endsWith("\n") ? 1 : 0),
    wordCount: markdown.trim() ? markdown.trim().split(/\s+/).length : 0,
  };
}

function countFromNumstat(value: string | undefined): number {
  if (!value || value === "-") return 0;
  return Number.parseInt(value, 10) || 0;
}

export function parseGuidelineHistoryLog(log: string): GuidelineHistoryEntry[] {
  return log
    .split(/^@@@/gm)
    .slice(1)
    .map((chunk) => {
      const [header = "", ...bodyLines] = chunk.split("\n");
      const [hash = "", date = "", subject = ""] = header.split("\x1f");
      const body = bodyLines.join("\n");
      const numstat = body.match(/^([\d-]+)\t([\d-]+)\t(.+)$/m);
      const addedRules = [
        ...new Set(
          [...body.matchAll(/^\+###\s+[^\n]*`(R-[A-Z-]+)`/gm)].map(
            (match) => match[1] ?? "",
          ),
        ),
      ].filter(Boolean);

      return {
        hash,
        shortHash: hash.slice(0, 7),
        date,
        subject,
        additions: countFromNumstat(numstat?.[1]),
        deletions: countFromNumstat(numstat?.[2]),
        changedPath: numstat?.[3] ?? editorialStandardPath,
        addedRules,
        renamedFrom: body.match(/^rename from (.+)$/m)?.[1],
        renamedTo: body.match(/^rename to (.+)$/m)?.[1],
      };
    })
    .filter((entry) => entry.hash && entry.date && entry.subject);
}

function readStandardAtCommit(repoRoot: string, hash: string): string | null {
  for (const standardPath of editorialStandardPaths) {
    try {
      return execFileSync("git", ["show", `${hash}:${standardPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // The standard moved twice. Try the next canonical former path.
    }
  }
  return null;
}

function rulesInSection(markdown: string): string[] {
  return [
    ...new Set(
      [...markdown.matchAll(/`(R-[A-Z-]+)`/g)].map((match) => match[1] ?? ""),
    ),
  ].filter(Boolean);
}

function voiceCardBody(markdown: string): string {
  return markdown.replace(/^#\s+.+\n+/, "").trim();
}

function voiceCardStatus(markdown: string): {
  status: EditorialVoiceCard["status"];
  statusDetail: string;
} {
  const cardStatus = markdown.match(/^- Card status:\s*(.+)$/m)?.[1]?.trim();
  if (cardStatus) {
    return {
      status: /^active$/i.test(cardStatus) ? "Active" : "Pending",
      statusDetail: cardStatus,
    };
  }

  const approval =
    markdown.match(/^- Author approved:\s*(.+)$/m)?.[1]?.trim() ?? "Pending";
  return {
    status: /^pending/i.test(approval) ? "Pending" : "Active",
    statusDetail: approval,
  };
}

export function parseVoiceCardHistoryLog(log: string): VoiceCardHistoryEntry[] {
  return log
    .split(/^@@@/gm)
    .slice(1)
    .map((chunk) => {
      const [header = "", ...bodyLines] = chunk.split("\n");
      const [hash = "", date = "", subject = ""] = header.split("\x1f");
      const numstat = bodyLines.join("\n").match(/^([\d-]+)\t([\d-]+)\t(.+)$/m);

      return {
        hash,
        shortHash: hash.slice(0, 7),
        date,
        subject,
        additions: countFromNumstat(numstat?.[1]),
        deletions: countFromNumstat(numstat?.[2]),
        changedPath: numstat?.[3] ?? "",
      };
    })
    .filter((entry) => entry.hash && entry.date && entry.subject);
}

function readVoiceCardHistory(
  repoRoot: string,
  voiceCardPath: string,
): VoiceCardHistoryEntry[] {
  const log = execFileSync(
    "git",
    [
      "log",
      "--date=iso-strict",
      "--format=@@@%H%x1f%aI%x1f%s",
      "--numstat",
      "--find-renames",
      "--follow",
      "--",
      voiceCardPath,
    ],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  return parseVoiceCardHistoryLog(log);
}

function voiceCardDeparture(markdown: string): string | undefined {
  return markdown.match(/^- Where this volume departs:\s*(.+)$/m)?.[1]?.trim();
}

export function readEditorialVoiceCards(): EditorialVoiceCard[] {
  const repoRoot = process.cwd();
  const corpusMarkdown = readFileSync(
    path.join(repoRoot, corpusVoiceCardPath),
    "utf8",
  );
  const corpusStatus = voiceCardStatus(corpusMarkdown);
  const corpusCard: EditorialVoiceCard = {
    id: "corpus",
    label: "Global",
    title: "Coherence Thesis",
    path: corpusVoiceCardPath,
    markdown: voiceCardBody(corpusMarkdown),
    history: readVoiceCardHistory(repoRoot, corpusVoiceCardPath),
    ...corpusStatus,
  };

  const volumeCards = editorialVolumeIds
    .map((editorialId) => {
      const packageRoot = path.join(
        repoRoot,
        "editorial",
        "sources",
        "volumes",
        editorialId,
      );
      const manifest = JSON.parse(
        readFileSync(path.join(packageRoot, "volume.json"), "utf8"),
      ) as VolumeManifest;
      const markdown = readFileSync(
        path.join(repoRoot, manifest.voiceCardPath),
        "utf8",
      );
      return {
        id: manifest.editorialId,
        label: `Volume ${manifest.numberLabel}`,
        title: manifest.title,
        path: manifest.voiceCardPath,
        markdown: voiceCardBody(markdown),
        departure: voiceCardDeparture(markdown),
        history: readVoiceCardHistory(repoRoot, manifest.voiceCardPath),
        order: manifest.order,
        ...voiceCardStatus(markdown),
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(
      ({
        id,
        label,
        title,
        path: voiceCardPath,
        markdown,
        status,
        statusDetail,
        departure,
        history,
      }) => ({
        id,
        label,
        title,
        path: voiceCardPath,
        markdown,
        status,
        statusDetail,
        departure,
        history,
      }),
    );

  return [corpusCard, ...volumeCards];
}

export function lineDiffCounts(
  before: string,
  after: string,
): { additions: number; deletions: number } {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let previous = new Uint16Array(afterLines.length + 1);

  for (const beforeLine of beforeLines) {
    const current = new Uint16Array(afterLines.length + 1);
    for (let afterIndex = 1; afterIndex <= afterLines.length; afterIndex += 1) {
      current[afterIndex] =
        beforeLine === afterLines[afterIndex - 1]
          ? (previous[afterIndex - 1] ?? 0) + 1
          : Math.max(previous[afterIndex] ?? 0, current[afterIndex - 1] ?? 0);
    }
    previous = current;
  }

  const commonLines = previous[afterLines.length] ?? 0;
  return {
    additions: afterLines.length - commonLines,
    deletions: beforeLines.length - commonLines,
  };
}

export function buildSectionHistories(
  currentSections: GuidelineSection[],
  snapshots: Array<{ entry: GuidelineHistoryEntry; markdown: string }>,
): Record<string, GuidelineSectionHistory> {
  const chronologicalSnapshots = [...snapshots].reverse().map((snapshot) => ({
    entry: snapshot.entry,
    sections: parseEditorialStandard(snapshot.markdown).sections,
  }));

  return Object.fromEntries(
    currentSections.map((currentSection) => {
      let previousMarkdown: string | null = null;
      let previousRules = new Set<string>();
      const revisions: GuidelineSectionRevision[] = [];

      for (const snapshot of chronologicalSnapshots) {
        const section = snapshot.sections.find(
          (candidate) => candidate.id === currentSection.id,
        );
        if (!section || section.markdown === previousMarkdown) continue;

        const currentRules = new Set(rulesInSection(section.markdown));
        const addedRules = [...currentRules].filter(
          (rule) => !previousRules.has(rule),
        );
        const kind = previousMarkdown === null ? "introduced" : "revised";
        const movement =
          previousMarkdown === null
            ? {
                additions: section.markdown.split("\n").length,
                deletions: 0,
              }
            : lineDiffCounts(previousMarkdown, section.markdown);

        revisions.push({
          hash: snapshot.entry.hash,
          shortHash: snapshot.entry.shortHash,
          date: snapshot.entry.date,
          subject: snapshot.entry.subject,
          kind,
          additions: movement.additions,
          deletions: movement.deletions,
          addedRules,
        });
        previousMarkdown = section.markdown;
        previousRules = currentRules;
      }

      return [
        currentSection.id,
        {
          sectionId: currentSection.id,
          introducedAt: revisions[0]?.date ?? "",
          revisions,
        },
      ];
    }),
  );
}

export function readEditorialGuidelines(): EditorialGuidelines {
  const repoRoot = process.cwd();
  const markdown = readFileSync(
    path.join(repoRoot, editorialStandardPath),
    "utf8",
  );
  const historyLog = execFileSync(
    "git",
    [
      "log",
      "--date=iso-strict",
      "--format=@@@%H%x1f%aI%x1f%s",
      "--numstat",
      "-p",
      "--unified=0",
      "--find-renames",
      "--follow",
      "--",
      editorialStandardPath,
    ],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );

  const parsed = parseEditorialStandard(markdown);
  const history = parseGuidelineHistoryLog(historyLog);
  const snapshots = history.flatMap((entry) => {
    const snapshotMarkdown = readStandardAtCommit(repoRoot, entry.hash);
    return snapshotMarkdown ? [{ entry, markdown: snapshotMarkdown }] : [];
  });

  return {
    ...parsed,
    history,
    sectionHistories: buildSectionHistories(parsed.sections, snapshots),
  };
}
