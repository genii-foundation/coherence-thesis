#!/usr/bin/env tsx
// Reports re-render progress for a volume against its immutable baseline.
//
//   npm run editorial:progress                 all volumes with a baseline
//   npm run editorial:progress -- --volume 01  one volume, section by section
//
// Progress is derived, never asserted. Rendering coverage and editorial
// settlement are separate facts, both read from calibration records. Read only.

import process from "node:process";

import {
  type EditorialSectionStatus,
} from "../../src/lib/editorial-progress";
import { readEditorialVolumeProgress } from "./progress-data";
import {
  editorialCalibrationRoot,
  editorialReviewsRoot,
  editorialVolumeIds,
} from "../repository/paths";

const MARK: Record<EditorialSectionStatus, string> = {
  settled: "[x]",
  open: "[~]",
  "not-started": "[ ]",
};

function reportVolume(editorialId: string, verbose: boolean): void {
  const progress = readEditorialVolumeProgress(editorialId, {
    reviewsRoot: editorialReviewsRoot,
    calibrationRoot: editorialCalibrationRoot,
  });
  if (!progress) {
    process.stdout.write(`${editorialId}: no baseline, skipped\n`);
    return;
  }

  process.stdout.write(
    `${editorialId}  ${progress.rendered}/${progress.total} sections rendered` +
      `  ${progress.renderedPercent}%` +
      `  (${progress.settled} settled` +
      `${progress.open ? `, ${progress.open} open` : ""}` +
      `${progress.notStarted ? `, ${progress.notStarted} not started` : ""})` +
      `  (${progress.renderedWords.toLocaleString()} of ${progress.totalWords.toLocaleString()} baseline words)\n`,
  );

  if (!verbose) return;
  for (const section of progress.sections) {
    process.stdout.write(
      `  ${String(section.index).padStart(2)} ${MARK[section.status]} ${section.heading.slice(0, 54).padEnd(56)}` +
        `${String(section.words).padStart(5)} w  ${section.sectionId}\n`,
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
