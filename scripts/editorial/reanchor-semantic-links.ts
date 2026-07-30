#!/usr/bin/env tsx
// Re-anchors reviewed semantic link occurrences after a section's prose changes.
//
//   npm run editorial:reanchor -- --dry-run
//   npm run editorial:reanchor -- --write
//
// A semantic link records the paragraph it points at by content hash. Editing a
// section changes those hashes, so every re-render breaks the links inside it
// even when the linked words survive. This finds each occurrence's paragraph
// again by its own match text and rewrites the anchor and derived id.
//
// An occurrence whose match text no longer appears anywhere in its section is
// retired rather than repointed. That case means the link was approved against
// text an edit has removed, and guessing a new home for it would invent a
// relationship no one reviewed.
//
// Durable editorial state. Requires --write, and prints a full diff first.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { paragraphFingerprints } from "../manuscripts/io";
import { semanticLinkOccurrenceId } from "./semantic-links";
import {
  editorialVolumesRoot,
  repoRoot,
  sectionLineagePath,
  semanticLinksPath,
} from "../repository/paths";

interface OccurrenceSource {
  editorialId: string;
  sectionContinuityId: string;
  paragraphAnchor: string;
  matchText: string;
  matchOrdinal: number;
}

interface Occurrence {
  occurrenceId: string;
  conceptId: string;
  source: OccurrenceSource;
  [key: string]: unknown;
}

/** Slug a heading the way section continuity ids are formed. */
export function headingSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface SectionBody {
  continuityId: string;
  body: string;
}

/** Split a manuscript into its level one and two sections, keyed by continuity id. */
export function sectionBodies(markdown: string, volumeNumber: string): SectionBody[] {
  const heads = [...markdown.matchAll(/^#{1,2} (.*)$/gm)];
  return heads.map((h, i) => {
    const start = h.index ?? 0;
    const end = i + 1 < heads.length ? (heads[i + 1]!.index ?? markdown.length) : markdown.length;
    return {
      continuityId: `v${volumeNumber}-${headingSlug(h[1] ?? "")}`,
      body: markdown.slice(start, end),
    };
  });
}

function main(): void {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");

  const registry = JSON.parse(readFileSync(semanticLinksPath, "utf8")) as {
    occurrences: Occurrence[];
    [key: string]: unknown;
  };

  // A reviewed occurrence names its section by the continuity id in force when the
  // link was approved. Renaming a heading changes that id, so the lineage record is
  // what connects an old name to the section it became.
  const lineage = JSON.parse(readFileSync(sectionLineagePath, "utf8")) as {
    sections: { currentSectionId: string; continuityIds: string[]; historicalSectionIds: string[] }[];
  };
  const toCurrent = new Map<string, string>();
  for (const entry of lineage.sections) {
    for (const id of [...entry.continuityIds, ...entry.historicalSectionIds]) {
      toCurrent.set(id, entry.currentSectionId);
    }
  }

  // Index every section of every volume once, under its current id and every id
  // that has ever resolved to it.
  const bodies = new Map<string, string>();
  const volumes = new Set(registry.occurrences.map((o) => o.source.editorialId));
  for (const editorialId of volumes) {
    const file = path.join(editorialVolumesRoot, editorialId, "manuscript.md");
    const number = editorialId.replace("volume-", "");
    for (const section of sectionBodies(readFileSync(file, "utf8"), number)) {
      bodies.set(`${editorialId}::${section.continuityId}`, section.body);
      for (const [old, current] of toCurrent) {
        if (current === section.continuityId) bodies.set(`${editorialId}::${old}`, section.body);
      }
    }
  }

  const kept: Occurrence[] = [];
  const moved: string[] = [];
  const retired: string[] = [];
  const unknown: string[] = [];

  // matchOrdinal counts repetitions inside a single paragraph, not which paragraph,
  // so it cannot select among several paragraphs that mention the same term. Group
  // the occurrences that share a section, concept, and match text, then pair them
  // with the matching paragraphs in document order.
  const groups = new Map<string, Occurrence[]>();
  for (const occurrence of registry.occurrences) {
    const { editorialId, sectionContinuityId, matchText } = occurrence.source;
    const key = `${editorialId}::${sectionContinuityId}::${occurrence.conceptId}::${matchText.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), occurrence]);
  }

  const ambiguous: string[] = [];
  for (const [key, group] of groups) {
    const [editorialId, sectionContinuityId, , matchText] = key.split("::");
    const body = bodies.get(`${editorialId}::${sectionContinuityId}`);
    if (body === undefined) {
      unknown.push(`${sectionContinuityId} / ${matchText} (${group.length})`);
      kept.push(...group);
      continue;
    }
    const escaped = (matchText ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    const hits = paragraphFingerprints(body).filter((p) => pattern.test(p.text));

    if (hits.length === 0) {
      retired.push(`${sectionContinuityId} / ${matchText} (${group.length})`);
      continue;
    }
    if (hits.length !== group.length) {
      // The section gained or lost paragraphs mentioning this term. Pairing them by
      // order would guess which reviewed link belongs to which paragraph, so leave
      // the whole group untouched and report it for review.
      ambiguous.push(
        `${sectionContinuityId} / ${matchText}: ${group.length} reviewed link(s), ${hits.length} matching paragraph(s)`,
      );
      kept.push(...group);
      continue;
    }
    group.forEach((occurrence, index) => {
      const target = hits[index]!;
      if (target.anchor !== occurrence.source.paragraphAnchor) {
        moved.push(`${sectionContinuityId} / ${matchText}: ${occurrence.source.paragraphAnchor} -> ${target.anchor}`);
        occurrence.source.paragraphAnchor = target.anchor;
      }
      occurrence.occurrenceId = semanticLinkOccurrenceId(occurrence.conceptId, occurrence.source);
      kept.push(occurrence);
    });
  }

  const out = process.stdout;
  out.write(`${registry.occurrences.length} occurrences examined\n`);
  if (moved.length) {
    out.write(`\nre-anchored ${moved.length}:\n`);
    for (const line of moved) out.write(`  ${line}\n`);
  }
  if (retired.length) {
    out.write(`\nretired ${retired.length}, match text no longer present in the section:\n`);
    for (const line of retired) out.write(`  ${line}\n`);
  }
  if (ambiguous.length) {
    out.write(`\nambiguous ${ambiguous.length}, left untouched:\n`);
    for (const line of ambiguous) out.write(`  ${line}\n`);
  }
  if (unknown.length) {
    out.write(`\nsection not found for ${unknown.length}, left untouched:\n`);
    for (const line of unknown) out.write(`  ${line}\n`);
  }
  if (!moved.length && !retired.length && !ambiguous.length) {
    out.write("\nEvery occurrence already resolves. Nothing to do.\n");
    return;
  }

  if (!write) {
    out.write(`\nDry run. Re-run with --write to apply.\n`);
    return;
  }
  registry.occurrences = kept;
  writeFileSync(semanticLinksPath, `${JSON.stringify(registry, null, 2)}\n`);
  out.write(`\nWrote ${path.relative(repoRoot, semanticLinksPath)}\n`);
}

if (import.meta.filename === process.argv[1]) main();
