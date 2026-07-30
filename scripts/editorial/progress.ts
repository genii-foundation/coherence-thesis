#!/usr/bin/env tsx
// Reports re-render progress for a volume against its immutable baseline.
//
//   npm run editorial:progress                 all volumes with a baseline
//   npm run editorial:progress -- --volume 01  one volume, section by section
//
// Progress is derived, never asserted. A section counts as done when a
// calibration record exists for it with status settled, so this cannot drift
// from reality the way a hand maintained checklist does. Read only.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { slugify } from "../manuscripts/io";
import {
  editorialCalibrationRoot,
  editorialReviewsRoot,
  editorialVolumeIds,
} from "../repository/paths";

interface SectionStatus {
  heading: string;
  sectionId: string;
  status: "settled" | "open" | "not started";
  words: number;
}

/** Slug a baseline heading into the section id convention, v01-some-heading.
 *  Delegates to the canonical slugify so this cannot drift. */
export function sectionIdFor(volumeNumber: string, heading: string): string {
  return `v${volumeNumber}-${slugify(heading.replace(/\*/g, ""))}`;
}

export function baselineSections(markdown: string, volumeNumber: string): SectionStatus[] {
  const lines = markdown.split("\n");
  const out: SectionStatus[] = [];
  let current: { heading: string; body: string[] } | null = null;
  const flush = (): void => {
    if (!current) return;
    const words = current.body.join(" ").match(/[A-Za-z0-9'’-]+/g)?.length ?? 0;
    out.push({
      heading: current.heading,
      sectionId: sectionIdFor(volumeNumber, current.heading),
      status: "not started",
      words,
    });
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
  return out;
}

function batchDirFor(editorialId: string): string | null {
  const base = path.join(editorialReviewsRoot, "volumes", editorialId);
  if (!existsSync(base)) return null;
  const batch = readdirSync(base)[0];
  return batch ? path.join(base, batch) : null;
}

function statusFor(editorialId: string, sectionId: string): SectionStatus["status"] {
  const record = path.join(editorialCalibrationRoot, editorialId, `${sectionId}.json`);
  if (!existsSync(record)) return "not started";
  try {
    const parsed = JSON.parse(readFileSync(record, "utf8")) as { status?: string };
    return parsed.status === "settled" ? "settled" : "open";
  } catch {
    return "open";
  }
}

const MARK: Record<SectionStatus["status"], string> = {
  settled: "[x]",
  open: "[~]",
  "not started": "[ ]",
};

function reportVolume(editorialId: string, verbose: boolean): void {
  const batch = batchDirFor(editorialId);
  const baselinePath = batch ? path.join(batch, "baseline.md") : null;
  if (!baselinePath || !existsSync(baselinePath)) {
    process.stdout.write(`${editorialId}: no baseline, skipped\n`);
    return;
  }
  const number = editorialId.replace("volume-", "");
  const sections = baselineSections(readFileSync(baselinePath, "utf8"), number).map((s) => ({
    ...s,
    status: statusFor(editorialId, s.sectionId),
  }));

  const done = sections.filter((s) => s.status === "settled");
  const open = sections.filter((s) => s.status === "open");
  const doneWords = done.reduce((total, s) => total + s.words, 0);
  const allWords = sections.reduce((total, s) => total + s.words, 0);
  const pct = sections.length ? Math.round((done.length / sections.length) * 100) : 0;

  process.stdout.write(
    `${editorialId}  ${done.length}/${sections.length} sections settled` +
      `${open.length ? `, ${open.length} open` : ""}  ${pct}%` +
      `  (${doneWords.toLocaleString()} of ${allWords.toLocaleString()} baseline words)\n`,
  );

  if (!verbose) return;
  let n = 0;
  for (const s of sections) {
    n += 1;
    process.stdout.write(
      `  ${String(n).padStart(2)} ${MARK[s.status]} ${s.heading.slice(0, 54).padEnd(56)}` +
        `${String(s.words).padStart(5)} w  ${s.sectionId}\n`,
    );
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf("--volume");
  const only = idx >= 0 ? argv[idx + 1] : null;

  if (only) {
    reportVolume(`volume-${only.padStart(2, "0")}`, true);
    return;
  }
  for (const editorialId of editorialVolumeIds) reportVolume(editorialId, false);
}

if (import.meta.filename === process.argv[1]) main();
