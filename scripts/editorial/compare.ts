#!/usr/bin/env tsx
// Renders a calibration record as a side by side comparison view.
//
//   npm run editorial:compare -- --section v01-orientation
//
// Reads the durable record, resolves the immutable baseline and the current
// manuscript text for the section, and writes a disposable view under
// generated/calibration/. Read only with respect to editorial/.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  editorialCalibrationRoot,
  editorialReviewsRoot,
  editorialVolumesRoot,
  generatedCalibrationRoot,
  repoRoot,
} from "../repository/paths";

import {
  extractSection,
  render,
  wordsOf,
  type CalibrationRecord,
} from "./compare-render";
import {
  effectiveVoiceRulesFrom,
  resolveEffectiveVoiceCard,
} from "./voice-card";

function fail(message: string): never {
  process.stderr.write(`editorial:compare: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): { section: string } {
  let section = "";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--section") section = argv[i + 1] ?? "";
  }
  if (!section) fail("missing --section <section-id>");
  return { section };
}

/** Extract one section from a Markdown source by its exact heading text. */

function main(): void {
  const { section } = parseArgs(process.argv.slice(2));
  const editorialId = /^v(\d{2})-/.exec(section)?.[1];
  if (!editorialId) fail(`cannot derive an editorial id from section "${section}"`);
  const volume = `volume-${editorialId}`;

  const recordPath = path.join(editorialCalibrationRoot, volume, `${section}.json`);
  if (!existsSync(recordPath)) fail(`no calibration record at ${path.relative(repoRoot, recordPath)}`);
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as CalibrationRecord;

  const baselinePath = path.join(editorialReviewsRoot, "volumes", volume, record.baseline.batchId, record.baseline.path);
  if (!existsSync(baselinePath)) fail(`baseline missing at ${path.relative(repoRoot, baselinePath)}`);
  const currentPath = path.join(editorialVolumesRoot, volume, "manuscript.md");
  const volumeCardPath = path.join(editorialVolumesRoot, volume, "voice-card.md");
  const effective = resolveEffectiveVoiceCard(volumeCardPath);
  record.effectiveVoiceCard = effectiveVoiceRulesFrom(
    readFileSync(effective.corpusPath, "utf8"),
  );

  const baseText = extractSection(readFileSync(baselinePath, "utf8"), record.sectionHeading);
  const currentText = extractSection(readFileSync(currentPath, "utf8"), record.sectionHeading);
  if (!baseText.length) fail(`heading "${record.sectionHeading}" not found in the baseline`);

  mkdirSync(generatedCalibrationRoot, { recursive: true });
  const out = path.join(generatedCalibrationRoot, `${section}.html`);
  writeFileSync(out, render(record, baseText, currentText));

  process.stdout.write(`${path.relative(repoRoot, out)}\n`);
  process.stdout.write(`  baseline ${baseText.flatMap(wordsOf).length} words, ${record.generations.length} generations\n`);
}

if (import.meta.filename === process.argv[1]) main();
