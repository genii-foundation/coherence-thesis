#!/usr/bin/env tsx
// Reports what the prior editorial pass removed, per section, across every volume.
//
//   npm run editorial:damage
//   npm run editorial:damage -- --volume 03
//   npm run editorial:damage -- --json
//
// Compression alone is not damage, and this does not claim otherwise. It reports the
// size of the change and the mechanical signals that correlated with real loss during
// the Volume I re-render, so a review can start where the evidence is rather than at
// section one. Judgment still happens against the baseline in a calibration record.
//
// Read only.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  editorialCalibrationRoot,
  editorialReviewsRoot,
  editorialVolumesRoot,
  repoRoot,
} from "../repository/paths";
import { slugify } from "../manuscripts/io";
import { uniqueId } from "../manuscripts/import-markdown";

/**
 * Renamed headings are the norm in this corpus, not the exception, so slug equality
 * alone reported half the sections as deleted. The continuity lineage already records
 * every rename, and consulting it is the difference between a report that says a
 * passage is gone and one that says it moved.
 */
function loadAliases(): Map<string, string> {
  const file = path.join(repoRoot, "publishing/continuity/section-lineage.json");
  const alias = new Map<string, string>();
  if (!existsSync(file)) return alias;
  const data = JSON.parse(readFileSync(file, "utf8")) as {
    sections?: {
      currentSectionId: string;
      continuityIds?: string[];
      historicalSectionIds?: string[];
      progressContinuityGroups?: string[][];
    }[];
  };
  for (const entry of data.sections ?? []) {
    const olds = new Set([
      ...(entry.continuityIds ?? []),
      ...(entry.historicalSectionIds ?? []),
      ...(entry.progressContinuityGroups ?? []).flat(),
    ]);
    for (const old of olds) alias.set(old, entry.currentSectionId);
  }
  return alias;
}

const ALIASES = loadAliases();

interface SectionDamage {
  editorialId: string;
  index: number;
  heading: string;
  sectionId: string;
  baselineWords: number;
  currentWords: number;
  delta: number;
  /** Denials the baseline made and the current text does not. */
  lostDenials: number;
  /** Standalone short lines the baseline used as landings. */
  lostLandings: number;
  hasRecord: boolean;
  matched: boolean;
  /**
   * Set when the lineage sends this baseline section to a current section another
   * baseline section already claimed. That is a recorded merge, not a deletion, and it
   * is a third state: the prose belongs in the surviving section and no heading needs
   * to be recreated to restore it.
   */
  mergedInto?: string;
}

const WORD = /[A-Za-z0-9'’-]+/g;
const words = (text: string): number => (text.match(WORD) ?? []).length;

/** Sentences that name what a thing is not. The construction the pass removed most. */
function denials(text: string): number {
  return (
    text.match(/\b(?:is|are|was|were|do|does|did)\s+not\b|\bnot\s+(?:a|an|the|merely|only|just)\b/gi)
      ?.length ?? 0
  );
}

/** Short standalone paragraphs. In this corpus these are landings, not fragments. */
function landings(blocks: string[]): number {
  return blocks.filter((b) => {
    const n = words(b);
    return n > 0 && n <= 12 && !b.startsWith("#") && !b.startsWith(">") && !b.startsWith("|");
  }).length;
}

interface Section {
  heading: string;
  body: string;
  blocks: string[];
}

/**
 * Section boundaries. Most baselines mark them with markdown headings, but the
 * production-pass batches mark them with bold display lines instead, which is a
 * typesetting convention rather than an absence of structure. Reading only `#` reported
 * Volume VII as unmeasurable when its sections map one to one onto the current
 * manuscript's headings.
 */
function splitSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const hasMarkdownHeadings = lines.some((l) => /^#{1,3}\s+\S/.test(l));
  const out: Section[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  for (const line of lines) {
    const m = hasMarkdownHeadings
      ? /^(#{1,3})\s+(.*)$/.exec(line)
      : /^\*\*(.+?)\*\*\s*$/.exec(`${line}`)
        ? ["", "", line.replace(/^\*\*(.+?)\*\*\s*$/, "$1").replace(/\s*·\s*$/, "").trim()]
        : null;
    if (m) {
      if (current) {
        const body = current.lines.join("\n");
        out.push({ heading: current.heading, body, blocks: body.split(/\n{2,}/).map((b) => b.trim()) });
      }
      current = { heading: (m[2] ?? "").trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) {
    const body = current.lines.join("\n");
    out.push({ heading: current.heading, body, blocks: body.split(/\n{2,}/).map((b) => b.trim()) });
  }
  return out;
}

function baselineFor(editorialId: string): string | null {
  const base = path.join(editorialReviewsRoot, "volumes", editorialId);
  if (!existsSync(base)) return null;
  for (const batch of readdirSync(base)) {
    const file = path.join(base, batch, "baseline.md");
    if (existsSync(file)) return file;
  }
  return null;
}

function analyse(editorialId: string): SectionDamage[] {
  const baselinePath = baselineFor(editorialId);
  const currentPath = path.join(editorialVolumesRoot, editorialId, "manuscript.md");
  if (!baselinePath || !existsSync(currentPath)) return [];

  const number = editorialId.replace("volume-", "");
  const baseSections = splitSections(readFileSync(baselinePath, "utf8"));

  /**
   * Keyed by id AND ordinal. Repeated headings are common here: five sections named
   * "The Larger Argument", six named "What Providence Is and Is Not Doing in This
   * Dimension". A plain Map collapses them, so every one of the five compared against
   * whichever survived the overwrite and the report invented severity it could not
   * substantiate. The nth baseline occurrence now matches the nth current occurrence.
   */
  /**
   * Monotonic matching. Ids alone are ambiguous here: headings repeat across chapters,
   * so a baseline section can match a current section belonging to a different chapter,
   * and a deleted section can claim its neighbour through the lineage alias. Both were
   * observed, the second reporting a section deleted outright as plus 120 percent.
   *
   * Documents do not reorder, so a match is only valid after the previous match. Walking
   * both sides forward resolves duplicates by position and leaves a genuinely deleted
   * section unmatched, which is the one thing the report must never get wrong.
   */
  const currentList = splitSections(readFileSync(currentPath, "utf8"));

  /**
   * Ids must carry the same occurrence suffix the importer assigns, because that is what
   * the continuity records store. Without it every "What Providence Is and Is Not Doing
   * in This Dimension" collapses to one id: the first occurrence consumes the only alias
   * and the other four report as deleted, when in fact each has its own renamed current
   * section. Five sections at roughly -13% were reading as five total losses.
   */
  const identify = (sections: Section[]): string[] => {
    const used = new Set<string>();
    return sections.map((section) =>
      uniqueId(`v${number}-${slugify(section.heading.replace(/\*/g, ""))}`, used),
    );
  };
  const currentIds = identify(currentList);
  const ids = identify(baseSections);
  /**
   * Resolution by lineage target rather than by walking both documents in step.
   *
   * The walker this replaces was greedy: a baseline section whose alias pointed several
   * places ahead would claim the survivor and step over the current section a later
   * baseline section matched exactly. Volume III's failure chapter is the case that
   * exposed it. Three baseline sections close it, the current has two, and the merge
   * pairs the first with the third across the second, so the section in the middle
   * desynchronised and reported as deleted when it had simply been renamed.
   *
   * Now that ids carry the importer's occurrence suffix they are unique, which makes
   * position unnecessary. The lineage already states where every section went, so the
   * honest operation is to read it: group the baseline sections by the current section
   * they point at. One claimant is a rename, several are a merge, none is a deletion.
   * That resolves non-adjacent merges and reorderings, neither of which a walker can.
   */
  const currentIndex = new Map(currentIds.map((id, j) => [id, j]));
  const claimants = new Map<number, number[]>();
  const targetOf = new Array<number | undefined>(baseSections.length);
  ids.forEach((id, i) => {
    // An exact id wins over the alias: a section that kept its heading did not move.
    const target = currentIndex.has(id) ? id : ALIASES.get(id);
    const j = target === undefined ? undefined : currentIndex.get(target);
    if (j === undefined) return;
    targetOf[i] = j;
    claimants.set(j, [...(claimants.get(j) ?? []), i]);
  });

  const matched = new Array<Section | undefined>(baseSections.length);
  const mergedInto = new Array<string | undefined>(baseSections.length);
  targetOf.forEach((j, i) => {
    if (j === undefined) return;
    const group = claimants.get(j) ?? [];
    matched[i] = currentList[j];
    if (group.length < 2) return;
    mergedInto[i] = `${currentIds[j]} (with ${group
      .filter((other) => other !== i)
      .map((other) => ids[other])
      .join(", ")})`;
  });

  /**
   * Both members of a merge carry the group's delta, and the surviving section's words
   * are credited once. Crediting them to the first member alone made one member read as
   * growth and the other as total loss, which is how a merged-away section came to be
   * reported as plus 120 percent.
   */
  const mergeMembers = new Map<number, number[]>();
  for (const group of claimants.values()) {
    if (group.length < 2) continue;
    for (const i of group) mergeMembers.set(i, group);
  }

  return baseSections.map((section, index) => {
    const sectionId = ids[index] as string;
    const current = matched[index];
    const baselineWords = words(section.body);
    const members = mergeMembers.get(index);
    // Credit the surviving section's words to the first member only.
    const currentWords =
      members && members[0] !== index ? 0 : current ? words(current.body) : 0;
    const groupBaseline = members
      ? members.reduce((total, i) => total + words(baseSections[i]?.body ?? ""), 0)
      : baselineWords;
    const groupCurrent = members ? words(matched[members[0] as number]?.body ?? "") : currentWords;
    return {
      editorialId,
      index: index + 1,
      heading: section.heading,
      sectionId,
      baselineWords,
      currentWords,
      delta: groupBaseline
        ? Math.round(((groupCurrent - groupBaseline) / groupBaseline) * 100)
        : 0,
      lostDenials: Math.max(0, denials(section.body) - (current ? denials(current.body) : 0)),
      lostLandings: Math.max(0, landings(section.blocks) - (current ? landings(current.blocks) : 0)),
      hasRecord: existsSync(path.join(editorialCalibrationRoot, editorialId, `${sectionId}.json`)),
      matched: Boolean(current),
      mergedInto: mergedInto[index],
    };
  });
}

function main(): void {
  const argv = process.argv.slice(2);
  const only = argv.includes("--volume") ? argv[argv.indexOf("--volume") + 1] : null;
  const asJson = argv.includes("--json");

  const ids = Array.from({ length: 9 }, (_, i) => `volume-${String(i + 1).padStart(2, "0")}`).filter(
    (id) => !only || id.endsWith(only),
  );

  const all = ids.flatMap(analyse);
  if (asJson) {
    process.stdout.write(`${JSON.stringify(all, null, 2)}\n`);
    return;
  }

  for (const id of ids) {
    const rows = all.filter((r) => r.editorialId === id);
    if (!rows.length) continue;
    const b = rows.reduce((t, r) => t + r.baselineWords, 0);
    const c = rows.reduce((t, r) => t + r.currentWords, 0);
    const unmatched = rows.filter((r) => !r.matched).length;
    process.stdout.write(
      `\n${id}  ${rows.length} sections  ${b.toLocaleString()} -> ${c.toLocaleString()} words  ` +
        `${b ? Math.round(((c - b) / b) * 100) : 0}%` +
        `${unmatched ? `  ${unmatched} unmatched` : ""}\n`,
    );
    for (const r of [...rows].sort((a, z) => a.delta - z.delta).slice(0, 12)) {
      process.stdout.write(
        `  ${String(r.delta).padStart(4)}%  ${String(r.baselineWords).padStart(5)}w  ` +
          `${r.hasRecord ? "rec" : "   "} ${r.matched ? "    " : r.mergedInto ? "MERG" : "GONE"}  ` +
          `${r.lostDenials ? `-${r.lostDenials}d` : "   "} ${r.lostLandings ? `-${r.lostLandings}l` : "   "}  ` +
          `${r.heading.slice(0, 52)}\n`,
      );
    }
    if (rows.length > 12) process.stdout.write(`  ... ${rows.length - 12} more\n`);
  }

  const worst = [...all].filter((r) => r.matched && r.baselineWords >= 120).sort((a, z) => a.delta - z.delta);
  process.stdout.write(`\nWorst 20 sections corpus wide, by proportion removed:\n`);
  for (const r of worst.slice(0, 20)) {
    process.stdout.write(
      `  ${r.editorialId.replace("volume-", "v")}  ${String(r.delta).padStart(4)}%  ` +
        `${String(r.baselineWords).padStart(5)}w  ${r.heading.slice(0, 56)}\n`,
    );
  }
  process.stdout.write(
    `\n${all.length} sections, ${all.filter((r) => !r.matched).length} with no current match, ` +
      `${all.filter((r) => r.hasRecord).length} with a calibration record.\n` +
      `Report is evidence for where to look. Compression is not itself a defect.\n`,
  );
}

if (import.meta.filename === process.argv[1]) main();
