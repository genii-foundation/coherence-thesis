// Server side readers for the admin surface. Every value is derived from
// repository state at request time, so a page cannot show progress the repo
// does not actually have. Read only: nothing here writes to editorial/.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// The reader app resolves these from the working directory rather than importing
// scripts/repository/paths, which is Node script tooling and relies on
// import.meta.dirname that the Next bundler does not provide. Admin runs only
// under the dev server, where cwd is the repository root.
const repoRoot = process.cwd();
const editorialRoot = path.join(repoRoot, "editorial");
const editorialEvidenceRoot = path.join(editorialRoot, "evidence");
const editorialReviewsRoot = path.join(editorialEvidenceRoot, "reviews");
const editorialCalibrationRoot = path.join(editorialEvidenceRoot, "calibration");
const editorialVolumesRoot = path.join(editorialRoot, "sources", "volumes");
const editorialVolumeIds = Array.from({ length: 9 }, (_, i) => `volume-${String(i + 1).padStart(2, "0")}`);

export type Tier = "green" | "amber" | "red";
export type TaskState = "pending" | "in-progress" | "blocked" | "done";

export interface Task {
  id: string;
  title: string;
  tier: Tier;
  status: TaskState;
  area: string;
  detail?: string;
  blockedBy?: string[];
  progress?: { kind: string; editorialId: string };
}

export interface TaskRegister {
  updated: string;
  tiers: Record<Tier, string>;
  tasks: Task[];
}

export function readTasks(): TaskRegister {
  const file = path.join(editorialEvidenceRoot, "tasks", "tasks.json");
  if (!existsSync(file)) return { updated: "never", tiers: {} as Record<Tier, string>, tasks: [] };
  return JSON.parse(readFileSync(file, "utf8")) as TaskRegister;
}

export interface SectionRow {
  index: number;
  heading: string;
  sectionId: string;
  settled: boolean;
  words: number;
}

export interface VolumeProgress {
  editorialId: string;
  sections: SectionRow[];
  settled: number;
  total: number;
  settledWords: number;
  totalWords: number;
  percent: number;
}

function sectionIdFor(volumeNumber: string, heading: string): string {
  const slug = heading
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `v${volumeNumber}-${slug}`;
}

function baselineFor(editorialId: string): string | null {
  const base = path.join(editorialReviewsRoot, "volumes", editorialId);
  if (!existsSync(base)) return null;
  const batch = readdirSync(base)[0];
  if (!batch) return null;
  const file = path.join(base, batch, "baseline.md");
  return existsSync(file) ? file : null;
}

export function readVolumeProgress(editorialId: string): VolumeProgress | null {
  const baseline = baselineFor(editorialId);
  if (!baseline) return null;
  const number = editorialId.replace("volume-", "");
  const lines = readFileSync(baseline, "utf8").split("\n");

  const sections: SectionRow[] = [];
  let current: { heading: string; body: string[] } | null = null;
  const flush = (): void => {
    if (!current) return;
    const words = current.body.join(" ").match(/[A-Za-z0-9'’-]+/g)?.length ?? 0;
    const sectionId = sectionIdFor(number, current.heading);
    const record = path.join(editorialCalibrationRoot, editorialId, `${sectionId}.json`);
    let settled = false;
    if (existsSync(record)) {
      try {
        settled = (JSON.parse(readFileSync(record, "utf8")) as { status?: string }).status === "settled";
      } catch {
        settled = false;
      }
    }
    sections.push({ index: sections.length + 1, heading: current.heading, sectionId, settled, words });
  };
  for (const line of lines) {
    const m = /^(#{1,2})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      current = { heading: (m[2] ?? "").trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  flush();

  const settled = sections.filter((s) => s.settled);
  const totalWords = sections.reduce((t, s) => t + s.words, 0);
  return {
    editorialId,
    sections,
    settled: settled.length,
    total: sections.length,
    settledWords: settled.reduce((t, s) => t + s.words, 0),
    totalWords,
    percent: sections.length ? Math.round((settled.length / sections.length) * 100) : 0,
  };
}

export function readAllProgress(): VolumeProgress[] {
  return editorialVolumeIds
    .map((id) => readVolumeProgress(id))
    .filter((v): v is VolumeProgress => v !== null);
}

export interface ProtectedLineViolation {
  editorialId: string;
  line: string;
}

/** Mirrors scripts/editorial/protected-lines.ts so the gate reads the same here. */
export function readProtectedLineViolations(): { checked: number; violations: ProtectedLineViolation[] } {
  const violations: ProtectedLineViolation[] = [];
  let checked = 0;
  const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();
  for (const editorialId of editorialVolumeIds) {
    const dir = path.join(editorialVolumesRoot, editorialId);
    const cardPath = path.join(dir, "voice-card.md");
    const manuscriptPath = path.join(dir, "manuscript.md");
    if (!existsSync(cardPath) || !existsSync(manuscriptPath)) continue;
    const field = /^- Protected lines or passages:(.*)$/m.exec(readFileSync(cardPath, "utf8"));
    if (!field) continue;
    const manuscript = normalize(readFileSync(manuscriptPath, "utf8"));
    for (const m of (field[1] ?? "").matchAll(/["“]([^"”]+)["”]/g)) {
      checked += 1;
      const line = (m[1] ?? "").trim();
      if (!manuscript.includes(normalize(line))) violations.push({ editorialId, line });
    }
  }
  return { checked, violations };
}

export interface RuleRow {
  id: string;
  obligation: string;
}

export function readRules(): RuleRow[] {
  const standard = path.join(editorialRoot, "method", "standard.md");
  if (!existsSync(standard)) return [];
  const rows: RuleRow[] = [];
  for (const m of readFileSync(standard, "utf8").matchAll(/^\|\s*`(R-[A-Z-]+)`\s*\|\s*([^|]+?)\s*\|/gm)) {
    rows.push({ id: m[1] ?? "", obligation: m[2] ?? "" });
  }
  return rows;
}
