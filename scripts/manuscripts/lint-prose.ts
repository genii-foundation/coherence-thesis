// AI-slop prose linter for manuscript sources.
//
// Counts banned and budgeted prose patterns per source file so editorial
// passes can measure progress and ratchet counts down. The pattern catalog
// and per-pattern fix strategies live in
// .claude/skills/manuscript-editorial-review/references/slop-patterns.md.
//
// Usage:
//   npm run manuscripts:lint-prose                          # report all sources
//   npm run manuscripts:lint-prose -- --json                # machine-readable
//   npm run manuscripts:lint-prose -- --file <path> [...]   # specific files
//   npm run manuscripts:lint-prose -- --strict <path> [...] # exit 1 if banned > 0
//
// Only prose lines are linted. Headings, separators, blockquotes, tables,
// and epigraph attribution lines are classified separately because they are
// governed by canon and pending global style decisions, not the sentence
// pass. Em dashes are additionally reported per context so heading and
// attribution normalization can be tracked as its own decision.

import fs from "node:fs";
import path from "node:path";

export type LineContext =
  | "heading"
  | "separator"
  | "blockquote"
  | "table"
  | "attribution"
  | "prose";

export type PatternKind = "banned" | "budgeted";

export interface PatternSpec {
  id: string;
  kind: PatternKind;
  regex: RegExp;
  note: string;
}

export interface FileReport {
  file: string;
  words: number;
  counts: Record<string, number>;
  bannedTotal: number;
  emDashByContext: Record<LineContext, number>;
}

export const PATTERNS: PatternSpec[] = [
  {
    id: "em-dash",
    kind: "banned",
    regex: /—/gu,
    note: "recast the sentence; never substitute a comma mechanically",
  },
  {
    id: "en-dash",
    kind: "banned",
    regex: /–/gu,
    note: "recast, or use 'to' for ranges",
  },
  {
    id: "double-hyphen",
    kind: "banned",
    regex: /(?:\s--\s|\w--\w)/gu,
    note: "double-hyphen prose construction",
  },
  {
    id: "it-is-worth",
    kind: "banned",
    regex: /\bit is worth\s+\w+ing\b/giu,
    note: "delete the announcement; open with the observation itself",
  },
  {
    id: "not-merely",
    kind: "banned",
    regex: /\bnot (?:merely|simply)\b/giu,
    note: "keep the second half of the sentence; cut the fake two-step",
  },
  {
    id: "stock-filler",
    kind: "banned",
    regex:
      /\b(?:delve|tapestry|testament to|seamless(?:ly)?|furthermore|moreover|multifaceted|pivotal|game-changer|at its core|in essence|paradigm shift)\b/giu,
    note: "classic AI filler; nearly absent today, keep it that way",
  },
  {
    id: "is-not-a",
    kind: "budgeted",
    regex: /\bis not an? \b/giu,
    note: "negation-contrast scaffold; max one per chapter",
  },
  {
    id: "question-reframe",
    kind: "budgeted",
    regex: /\bThe question is\b/giu,
    note: "question-reframe pivot; max one per volume",
  },
  {
    id: "not-because",
    kind: "budgeted",
    regex: /\bnot because\b/giu,
    note: "causal reversal; max one per chapter",
  },
  {
    id: "genuinely",
    kind: "budgeted",
    regex: /\bgenuinel?y?\b/giu,
    note: "sincerity varnish; max two per chapter, default fix is deletion",
  },
  {
    id: "precisely",
    kind: "budgeted",
    regex: /\bprecisely\b/giu,
    note: "only when a number, mechanism, or definition follows",
  },
  {
    id: "actually",
    kind: "budgeted",
    regex: /\bactually\b/giu,
    note: "delete wherever removal changes nothing",
  },
  {
    id: "quietly",
    kind: "budgeted",
    regex: /\bquietly\b/giu,
    note: "solemnity perfume; delete or replace with the concrete fact",
  },
  {
    id: "depth-words",
    kind: "budgeted",
    regex: /\b(?:deeper|deepest)\b/giu,
    note: "name the actual relation: earlier, causal, structural, older",
  },
  {
    id: "it-is-the",
    kind: "budgeted",
    regex: /\bit is the\b/giu,
    note: "negation-resolution cadence; vary the syntax",
  },
  {
    id: "one-of-the-most",
    kind: "budgeted",
    regex: /\bone of the most\b/giu,
    note: "max one per volume, with a falsifiable comparison class",
  },
  {
    id: "there-is-a",
    kind: "budgeted",
    regex: /\bThere is (?:a|something)\b/gu,
    note: "agentless opener; promote the buried noun to subject",
  },
  {
    id: "this-is-why",
    kind: "budgeted",
    regex: /\bThis is why\b/giu,
    note: "show the cause in the sentence instead of asserting linkage",
  },
  {
    id: "next-chapter",
    kind: "budgeted",
    regex: /\bnext chapter\b/giu,
    note: "trailer handoff; chapters end on their material",
  },
  {
    id: "this-chapter",
    kind: "budgeted",
    regex: /\bThis chapter\b/gu,
    note: "syllabus opener or self-recap; start inside the claim",
  },
  {
    id: "verify-marker",
    kind: "budgeted",
    regex: /\[verify/giu,
    note: "unresolved citation placeholder; resolve before publication",
  },
];

const SEPARATOR_LINE = /^[\s.·:—∗*⁂-]+$/u;

export function classifyLine(line: string): LineContext {
  const trimmed = line.trim();
  if (trimmed.length === 0) return "prose";
  if (/^#{1,6}\s/u.test(trimmed)) return "heading";
  if (/^\|/u.test(trimmed)) return "table";
  if (/^>/u.test(trimmed)) return "blockquote";
  if (SEPARATOR_LINE.test(trimmed)) return "separator";
  if (/^[*_]*—\s/u.test(trimmed)) return "attribution";
  return "prose";
}

function countMatches(text: string, regex: RegExp): number {
  regex.lastIndex = 0;
  let count = 0;
  while (regex.exec(text) !== null) count += 1;
  return count;
}

export function lintText(file: string, text: string): FileReport {
  const counts: Record<string, number> = {};
  for (const pattern of PATTERNS) counts[pattern.id] = 0;
  const emDashByContext: Record<LineContext, number> = {
    heading: 0,
    separator: 0,
    blockquote: 0,
    table: 0,
    attribution: 0,
    prose: 0,
  };

  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*(?:```|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const context = classifyLine(line);
    emDashByContext[context] += countMatches(line, /—/gu);
    if (context !== "prose") continue;
    for (const pattern of PATTERNS) {
      counts[pattern.id] = (counts[pattern.id] ?? 0) + countMatches(line, pattern.regex);
    }
  }

  const bannedTotal = PATTERNS.filter((p) => p.kind === "banned").reduce(
    (sum, p) => sum + (counts[p.id] ?? 0),
    0,
  );
  const words = text.split(/\s+/u).filter(Boolean).length;
  return { file, words, counts, bannedTotal, emDashByContext };
}

function defaultSourceFiles(): string[] {
  const dir = path.join("sources", "manuscripts");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => path.join(dir, name));
}

function formatReport(report: FileReport): string {
  const lines: string[] = [];
  lines.push(`${report.file} (${report.words.toLocaleString()} words)`);
  const count = (id: string): number => report.counts[id] ?? 0;
  const nonZero = PATTERNS.filter((p) => count(p.id) > 0);
  const banned = nonZero.filter((p) => p.kind === "banned");
  const budgeted = nonZero.filter((p) => p.kind === "budgeted");
  const describe = (specs: PatternSpec[]): string =>
    specs
      .sort((a, b) => count(b.id) - count(a.id))
      .map((p) => `${p.id} ${count(p.id).toLocaleString()}`)
      .join("  ");
  if (banned.length > 0) {
    lines.push(
      `  banned   (${report.bannedTotal.toLocaleString()}): ${describe(banned)}`,
    );
  } else {
    lines.push("  banned   (0): clean");
  }
  if (budgeted.length > 0) lines.push(`  budgeted: ${describe(budgeted)}`);
  const nonProse = (
    ["heading", "attribution", "blockquote", "table", "separator"] as const
  )
    .filter((context) => report.emDashByContext[context] > 0)
    .map(
      (context) =>
        `${context} ${report.emDashByContext[context].toLocaleString()}`,
    )
    .join("  ");
  if (nonProse.length > 0) lines.push(`  em dashes outside prose: ${nonProse}`);
  return lines.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const strict = args.includes("--strict");
  const fileArgs: string[] = [];
  for (const arg of args) {
    if (arg === "--file" || arg.startsWith("--")) continue;
    fileArgs.push(arg);
  }
  const files = fileArgs.length > 0 ? fileArgs : defaultSourceFiles();
  const reports = files.map((file) => lintText(file, fs.readFileSync(file, "utf8")));

  if (json) {
    process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
  } else {
    for (const report of reports) {
      process.stdout.write(`${formatReport(report)}\n\n`);
    }
    const totalBanned = reports.reduce((sum, r) => sum + r.bannedTotal, 0);
    process.stdout.write(
      `Total banned-pattern instances in prose: ${totalBanned.toLocaleString()}\n`,
    );
  }

  if (strict) {
    const dirty = reports.filter((r) => r.bannedTotal > 0);
    if (dirty.length > 0) {
      process.stderr.write(
        `lint-prose --strict: banned patterns remain in ${dirty
          .map((r) => `${r.file} (${r.bannedTotal})`)
          .join(", ")}\n`,
      );
      process.exitCode = 1;
    }
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).includes("lint-prose");
if (invokedDirectly) main();
