#!/usr/bin/env tsx
// Asserts that every line a voice card declares protected still appears verbatim
// in its manuscript.
//
//   npm run editorial:protected-lines
//
// A voice card names protected lines in exact quotation. That makes the strongest
// section of the card mechanically checkable, which is what turns a declaration
// into a gate. Read only. Fails closed on any missing line.

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { editorialVolumeIds, editorialVolumesRoot, repoRoot } from "../repository/paths";

const PROTECTED_FIELD = /^- Protected lines or passages:(.*)$/m;

/** Pull the exactly quoted passages out of a voice card's protected line field. */
export function protectedLinesFrom(voiceCard: string): string[] {
  const field = PROTECTED_FIELD.exec(voiceCard);
  if (!field) return [];
  return [...(field[1] ?? "").matchAll(/["“]([^"”]+)["”]/g)]
    .map((m) => (m[1] ?? "").trim())
    .filter(Boolean);
}

const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

export interface Violation {
  editorialId: string;
  line: string;
}

export function findViolations(
  read: (file: string) => string,
  volumeIds: readonly string[] = editorialVolumeIds,
): { checked: number; violations: Violation[] } {
  const violations: Violation[] = [];
  let checked = 0;
  for (const editorialId of volumeIds) {
    const dir = path.join(editorialVolumesRoot, editorialId);
    const lines = protectedLinesFrom(read(path.join(dir, "voice-card.md")));
    const manuscript = normalize(read(path.join(dir, "manuscript.md")));
    for (const line of lines) {
      checked += 1;
      if (!manuscript.includes(normalize(line))) violations.push({ editorialId, line });
    }
  }
  return { checked, violations };
}

function main(): void {
  const { checked, violations } = findViolations((f) => readFileSync(f, "utf8"));

  if (violations.length === 0) {
    process.stdout.write(
      `All ${checked.toLocaleString()} protected lines are present in their manuscripts.\n`,
    );
    return;
  }

  process.stderr.write(
    `Protected line validation failed. ${violations.length} of ${checked.toLocaleString()} declared lines are missing.\n\n`,
  );
  for (const v of violations) {
    const card = path.relative(repoRoot, path.join(editorialVolumesRoot, v.editorialId, "voice-card.md"));
    process.stderr.write(`  ${v.editorialId}: "${v.line}"\n    declared in ${card}\n`);
  }
  process.stderr.write(
    "\nA protected line is removed only by revising the voice card first. Restore the line,\nor record an explicit decision to release it and update the card in the same revision.\n",
  );
  process.exit(1);
}

if (import.meta.filename === process.argv[1]) main();
