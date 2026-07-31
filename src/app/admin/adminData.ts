// Server side readers for the admin surface. Every value is derived from
// repository state at request time, so a page cannot show progress the repo
// does not actually have. Read only: nothing here writes to editorial/.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  normalizeProtectedText,
  protectedLinesFrom,
} from "@/lib/editorial-controls";
import {
  parseWorkingRevisionSession,
  type WorkingRevisionSession,
} from "@/lib/editorial-revision-session";
import {
  type EditorialVolumeProgress,
} from "@/lib/editorial-progress";
import { readEditorialVolumeProgress } from "../../../scripts/editorial/progress-data";

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
const corpusVoiceCardPath = path.join(
  editorialRoot,
  "sources",
  "corpus",
  "voice-card.md",
);
const corpusLedgerPath = path.join(
  editorialRoot,
  "sources",
  "corpus",
  "master-ledger.md",
);
const manuscriptCheckpointsPath = path.join(
  repoRoot,
  "publishing",
  "continuity",
  "manuscript-checkpoints.json",
);
const generatedRevisionSessionsRoot = path.join(
  repoRoot,
  "generated",
  "revision-sessions",
);
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

export type VolumeProgress = EditorialVolumeProgress;

export function readVolumeProgress(editorialId: string): VolumeProgress | null {
  return readEditorialVolumeProgress(editorialId, {
    reviewsRoot: editorialReviewsRoot,
    calibrationRoot: editorialCalibrationRoot,
  });
}

export function readAllProgress(): VolumeProgress[] {
  return editorialVolumeIds
    .map((id) => readVolumeProgress(id))
    .filter((v): v is VolumeProgress => v !== null);
}

export interface RegenerationReadiness {
  activeVoiceCards: number;
  totalVoiceCards: number;
  originalCheckpoints: number;
  corpusVoiceCardActive: boolean;
  openCorpusDecisions: number;
}

export function readRegenerationReadiness(): RegenerationReadiness {
  const activeVoiceCards = editorialVolumeIds.filter((editorialId) => {
    const file = path.join(editorialVolumesRoot, editorialId, "voice-card.md");
    if (!existsSync(file)) return false;
    const approval = readFileSync(file, "utf8").match(
      /^- (?:Author approved|Editorial authority):\s*(.+)$/im,
    )?.[1];
    if (!approval) return false;
    const state = approval.trim().toLowerCase();
    return state.startsWith("approved") || state.startsWith("editorial agent");
  }).length;

  let originalCheckpoints = 0;
  if (existsSync(manuscriptCheckpointsPath)) {
    try {
      const manifest = JSON.parse(
        readFileSync(manuscriptCheckpointsPath, "utf8"),
      ) as {
        volumes?: {
          originalCheckpointId?: string;
          checkpoints?: { checkpointId?: string; kind?: string }[];
        }[];
      };
      originalCheckpoints = (manifest.volumes ?? []).filter((volume) =>
        volume.checkpoints?.some(
          (checkpoint) =>
            checkpoint.kind === "original" &&
            checkpoint.checkpointId === volume.originalCheckpointId,
        ),
      ).length;
    } catch {
      originalCheckpoints = 0;
    }
  }

  const corpusVoiceCardActive =
    existsSync(corpusVoiceCardPath) &&
    /^- Card status:\s*Active\s*$/im.test(
      readFileSync(corpusVoiceCardPath, "utf8"),
    );
  const ledger = existsSync(corpusLedgerPath)
    ? readFileSync(corpusLedgerPath, "utf8")
    : "";
  const openCorpusDecisions = [
    ...ledger.matchAll(/^### Decision [A-Z]:.*\[open\]\s*$/gm),
  ].length;

  return {
    activeVoiceCards,
    totalVoiceCards: editorialVolumeIds.length,
    originalCheckpoints,
    corpusVoiceCardActive,
    openCorpusDecisions,
  };
}

export interface RepositoryState {
  branch: string;
  commit: string;
  changedFiles: number;
  ahead: number;
  behind: number;
  checkedAt: string;
}

export function readRepositoryState(): RepositoryState {
  const fallback: RepositoryState = {
    branch: "unknown",
    commit: "unknown",
    changedFiles: 0,
    ahead: 0,
    behind: 0,
    checkedAt: new Date().toISOString(),
  };
  try {
    const output = execFileSync(
      "git",
      ["status", "--porcelain=v2", "--branch"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 2_000,
      },
    );
    const lines = output.trimEnd().split("\n");
    const branch =
      lines.find((line) => line.startsWith("# branch.head "))?.slice(14) ??
      fallback.branch;
    const commit =
      lines.find((line) => line.startsWith("# branch.oid "))?.slice(13, 20) ??
      fallback.commit;
    const divergence = /^# branch\.ab \+(\d+) -(\d+)$/.exec(
      lines.find((line) => line.startsWith("# branch.ab ")) ?? "",
    );
    return {
      branch,
      commit,
      changedFiles: lines.filter((line) => line && !line.startsWith("#"))
        .length,
      ahead: Number.parseInt(divergence?.[1] ?? "0", 10),
      behind: Number.parseInt(divergence?.[2] ?? "0", 10),
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return fallback;
  }
}

export interface ProtectedLineViolation {
  editorialId: string;
  line: string;
}

/** Uses the same parser and normalization as the repository gate. */
export function readProtectedLineViolations(): { checked: number; violations: ProtectedLineViolation[] } {
  const violations: ProtectedLineViolation[] = [];
  let checked = 0;
  for (const editorialId of editorialVolumeIds) {
    const dir = path.join(editorialVolumesRoot, editorialId);
    const cardPath = path.join(dir, "voice-card.md");
    const manuscriptPath = path.join(dir, "manuscript.md");
    if (!existsSync(cardPath) || !existsSync(manuscriptPath)) continue;
    const lines = protectedLinesFrom(readFileSync(cardPath, "utf8"));
    const manuscript = normalizeProtectedText(
      readFileSync(manuscriptPath, "utf8"),
    );
    for (const line of lines) {
      checked += 1;
      if (!manuscript.includes(normalizeProtectedText(line))) {
        violations.push({ editorialId, line });
      }
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

export function readWorkingRevisionSessions(): WorkingRevisionSession[] {
  if (!existsSync(generatedRevisionSessionsRoot)) return [];
  const sessions: WorkingRevisionSession[] = [];
  for (const file of readdirSync(generatedRevisionSessionsRoot)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const filePath = path.join(generatedRevisionSessionsRoot, file);
    try {
      sessions.push(
        parseWorkingRevisionSession(
          JSON.parse(readFileSync(filePath, "utf8")),
          path.relative(repoRoot, filePath),
        ),
      );
    } catch {
      // Working state is disposable. A malformed file must not blank the admin
      // surface, and the session command reports the exact defect when resumed.
    }
  }
  return sessions.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function readWorkingRevisionSession(
  sectionId: string,
): WorkingRevisionSession | null {
  if (!/^[a-z0-9-]+$/.test(sectionId)) return null;
  return (
    readWorkingRevisionSessions().find(
      (session) => session.sectionId === sectionId,
    ) ?? null
  );
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
  /**
   * Whether the author ruled here, or the editorial agent ruled alone. A rule derived
   * unilaterally and a rule the author decided carry different authority, and a list
   * that shows them identically hides the difference that matters most.
   */
  authored: boolean;
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
        authored: rulings.some((r) => r.by === "author"),
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
  openQuestionItems: string[];
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
        const openQuestionItems = (
          (r.openQuestions as unknown[] | undefined) ?? []
        )
          .filter((question): question is string => typeof question === "string")
          .map((question) => question.trim())
          .filter(Boolean);
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
          openQuestions: openQuestionItems.length,
          openQuestionItems,
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
