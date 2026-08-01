#!/usr/bin/env tsx
// Asserts that every voice-card exemplar has an exact opening anchor in the
// manuscript. A prose description can survive while the passage it meant is
// replaced, so the quoted opening words are the mechanically stable identity.

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  editorialVolumeIds,
  editorialVolumesRoot,
  repoRoot,
} from "../repository/paths";
import { normalizeProtectedText } from "./protected-lines";

const EXEMPLAR_FIELD = /^- Exemplar opening anchors:(.*)$/m;

export function exemplarAnchorsFrom(voiceCard: string): string[] {
  const field = EXEMPLAR_FIELD.exec(voiceCard);
  if (!field) return [];
  return [...(field[1] ?? "").matchAll(/["“]([^"”]+)["”]/g)]
    .map((match) => (match[1] ?? "").trim())
    .filter(Boolean);
}

export interface ExemplarViolation {
  editorialId: string;
  anchor?: string;
  kind: "missing-field" | "missing-anchor";
}

export function findExemplarViolations(
  read: (file: string) => string,
  volumeIds: readonly string[] = editorialVolumeIds,
): { checked: number; violations: ExemplarViolation[] } {
  const violations: ExemplarViolation[] = [];
  let checked = 0;

  for (const editorialId of volumeIds) {
    const dir = path.join(editorialVolumesRoot, editorialId);
    const anchors = exemplarAnchorsFrom(read(path.join(dir, "voice-card.md")));
    if (anchors.length === 0) {
      violations.push({ editorialId, kind: "missing-field" });
      continue;
    }

    const manuscript = normalizeProtectedText(
      read(path.join(dir, "manuscript.md")),
    );
    for (const anchor of anchors) {
      checked += 1;
      if (!manuscript.includes(normalizeProtectedText(anchor))) {
        violations.push({
          editorialId,
          anchor,
          kind: "missing-anchor",
        });
      }
    }
  }

  return { checked, violations };
}

function main(): void {
  const { checked, violations } = findExemplarViolations((file) =>
    readFileSync(file, "utf8"),
  );

  if (violations.length === 0) {
    process.stdout.write(
      `All ${checked.toLocaleString()} voice exemplar anchors are present in their manuscripts.\n`,
    );
    return;
  }

  process.stderr.write(
    `Voice exemplar validation failed with ${violations.length.toLocaleString()} violation(s).\n\n`,
  );
  for (const violation of violations) {
    const card = path.relative(
      repoRoot,
      path.join(editorialVolumesRoot, violation.editorialId, "voice-card.md"),
    );
    if (violation.kind === "missing-field") {
      process.stderr.write(
        `  ${violation.editorialId}: no exemplar opening anchors\n    ${card}\n`,
      );
    } else {
      process.stderr.write(
        `  ${violation.editorialId}: "${violation.anchor}"\n    ${card}\n`,
      );
    }
  }
  process.exit(1);
}

if (import.meta.filename === process.argv[1]) main();
