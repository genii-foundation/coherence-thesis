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

export interface GlyphViolation {
  editorialId: string;
  line: number;
  glyph: string;
  excerpt: string;
}

/**
 * Mirrors the punctuation standard's prohibited marks. The repository claims its
 * published prose contains no em dash, en dash, or double hyphen, and that claim can
 * become false with a single paste. Cheap to check, and invisible until someone reads
 * the rendered page.
 */
export function readGlyphViolations(): { checked: number; violations: GlyphViolation[] } {
  const violations: GlyphViolation[] = [];
  let checked = 0;
  for (const editorialId of editorialVolumeIds) {
    const file = path.join(editorialVolumesRoot, editorialId, "manuscript.md");
    if (!existsSync(file)) continue;
    checked += 1;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, index) => {
      // A markdown thematic break is three or more hyphens alone on a line, which is
      // structure rather than punctuation. Everything else with a double hyphen is a
      // prohibited construction.
      const isThematicBreak = /^-{3,}\s*$/.test(text);
      for (const [glyph, pattern] of [
        ["em dash", /—/],
        ["en dash", /–/],
        ["double hyphen", /\w--\w|\s--\s/],
      ] as const) {
        if (isThematicBreak) continue;
        const hit = pattern.exec(text);
        if (!hit) continue;
        violations.push({
          editorialId,
          line: index + 1,
          glyph,
          excerpt: text.slice(Math.max(0, hit.index - 30), hit.index + 40).trim(),
        });
      }
    });
  }
  return { checked, violations };
}

export interface CalibrationFinding {
  id: string;
  summary: string;
  producedRule?: string;
}

export interface CalibrationSession extends CalibrationRow {
  rulings: {
    question?: string;
    /** The founding session used decision + rationale; later records use ruling + occasion. */
    decision?: string;
    rationale?: string;
    ruling?: string;
    occasion?: string;
    scope?: string;
    by?: string;
  }[];
  rulesDerived: string[];
  generations: number;
  /** A bench can only be drawn where the generations carry their text. */
  benchable: boolean;
}

/**
 * A session is a record where something was decided: a ruling was made, or a rule was
 * derived. Most records are not sessions. They are sections re-rendered under rules that
 * already existed, and listing them beside the sessions buries the six occasions the
 * standard actually changed among twenty-two that changed nothing.
 */
export function readCalibrationSessions(): CalibrationSession[] {
  const sessions: CalibrationSession[] = [];
  for (const row of readCalibrationRows()) {
    const dir = path.join(editorialCalibrationRoot, row.editorialId, `${row.sectionId}.json`);
    if (!existsSync(dir)) continue;
    try {
      const r = JSON.parse(readFileSync(dir, "utf8")) as Record<string, unknown>;
      const rulings = (r.rulings as CalibrationSession["rulings"] | undefined) ?? [];
      const rulesDerived = (r.rulesDerived as string[] | undefined) ?? [];
      if (!rulings.length && !rulesDerived.length) continue;
      const generations = (r.generations as { text?: unknown }[] | undefined) ?? [];
      sessions.push({
        ...row,
        rulings,
        rulesDerived,
        generations: generations.length,
        benchable: generations.length > 0 && generations.every((g) => Array.isArray(g.text)),
      });
    } catch {
      // Reported by the gates page rather than silently swallowed there.
    }
  }
  return sessions.sort((a, b) => b.rulesDerived.length - a.rulesDerived.length || b.rulings.length - a.rulings.length);
}

export interface CalibrationRow {
  sectionId: string;
  editorialId: string;
  heading: string;
  currentHeading: string;
  status: string;
  settled: string;
  findings: CalibrationFinding[];
  rulesCited: string[];
  ledgerItems: string[];
  openQuestions: number;
  /** The disposable bench under generated/, if editorial:compare has been run for this section. */
  benchRendered: boolean;
}

/**
 * Reads every calibration record. The bench renderer in scripts/editorial/compare.ts
 * cannot be imported here: it resolves paths through scripts/repository/paths, which
 * relies on import.meta.dirname that the Next bundler does not provide. This reads the
 * same durable records and links out to the rendered bench rather than duplicating the
 * renderer, so there remains one implementation of the comparison view.
 */
export function readCalibrationRows(): CalibrationRow[] {
  const rows: CalibrationRow[] = [];
  const benchRoot = path.join(repoRoot, "generated", "calibration");
  for (const editorialId of editorialVolumeIds) {
    const dir = path.join(editorialCalibrationRoot, editorialId);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      try {
        const r = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
        const findings = ((r.findings as CalibrationFinding[] | undefined) ?? []).map((f) => ({
          id: f.id,
          summary: f.summary,
          producedRule: f.producedRule,
        }));
        const sectionId = String(r.sectionId ?? file.replace(/\.json$/, ""));
        rows.push({
          sectionId,
          editorialId,
          heading: String(r.sectionHeading ?? sectionId),
          currentHeading: String(r.currentHeading ?? r.sectionHeading ?? sectionId),
          status: String(r.status ?? "unknown"),
          settled: String(r.settled ?? ""),
          findings,
          rulesCited: [...new Set(findings.map((f) => f.producedRule).filter((x): x is string => Boolean(x)))],
          ledgerItems: ((r.debtImpact as { id?: string }[] | undefined) ?? [])
            .map((d) => d.id)
            .filter((x): x is string => Boolean(x)),
          openQuestions: ((r.openQuestions as unknown[] | undefined) ?? []).length,
          benchRendered: existsSync(path.join(benchRoot, `${sectionId}.html`)),
        });
      } catch {
        // A record that will not parse is a real defect, but the gates page is the
        // place that reports it. Skipping here keeps one bad file from blanking the view.
      }
    }
  }
  return rows;
}

export interface RuleRow {
  id: string;
  obligation: string;
}

export interface RuleUsage extends RuleRow {
  citations: number;
  sections: string[];
}

/**
 * Pairs each named rule with the calibration findings that cite it. A rule no record
 * has ever invoked is either dead or unenforced, which is the only thing a list of
 * rules can usefully tell you that reading the standard cannot.
 */
export function readRuleUsage(): RuleUsage[] {
  const rows = readCalibrationRows();
  return readRules().map((rule) => {
    const sections = rows
      .filter((row) => row.rulesCited.includes(rule.id))
      .map((row) => row.sectionId);
    return {
      ...rule,
      citations: rows.reduce(
        (total, row) => total + row.findings.filter((f) => f.producedRule === rule.id).length,
        0,
      ),
      sections,
    };
  });
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
