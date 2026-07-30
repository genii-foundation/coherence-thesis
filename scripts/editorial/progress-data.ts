import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  deriveEditorialVolumeProgress,
  type CalibrationRecordState,
  type EditorialVolumeProgress,
} from "../../src/lib/editorial-progress";

export type EditorialProgressPaths = {
  reviewsRoot: string;
  calibrationRoot: string;
};

function currentBaselinePath(
  editorialId: string,
  paths: EditorialProgressPaths,
): string | null {
  const volumeReviews = path.join(paths.reviewsRoot, "volumes", editorialId);
  if (!existsSync(volumeReviews)) return null;

  for (const batch of readdirSync(volumeReviews).sort()) {
    const directory = path.join(volumeReviews, batch);
    const manifestPath = path.join(directory, "review.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        standing?: unknown;
        baseline?: { snapshotPath?: unknown };
      };
      if (manifest.standing !== "current") continue;
      const snapshot =
        typeof manifest.baseline?.snapshotPath === "string"
          ? manifest.baseline.snapshotPath
          : "baseline.md";
      const baselinePath = path.join(directory, snapshot);
      return existsSync(baselinePath) ? baselinePath : null;
    } catch {
      return null;
    }
  }
  return null;
}

function calibrationRecords(
  editorialId: string,
  paths: EditorialProgressPaths,
): ReadonlyMap<string, CalibrationRecordState> {
  const records = new Map<string, CalibrationRecordState>();
  const directory = path.join(paths.calibrationRoot, editorialId);
  if (!existsSync(directory)) return records;

  for (const file of readdirSync(directory).sort()) {
    if (!file.endsWith(".json")) continue;
    try {
      const record = JSON.parse(
        readFileSync(path.join(directory, file), "utf8"),
      ) as CalibrationRecordState & { sectionId?: unknown };
      if (typeof record.sectionId === "string") {
        records.set(record.sectionId, record);
      }
    } catch {
      continue;
    }
  }
  return records;
}

export function readEditorialVolumeProgress(
  editorialId: string,
  paths: EditorialProgressPaths,
): EditorialVolumeProgress | null {
  const baselinePath = currentBaselinePath(editorialId, paths);
  if (!baselinePath) return null;
  return deriveEditorialVolumeProgress(
    editorialId,
    readFileSync(baselinePath, "utf8"),
    calibrationRecords(editorialId, paths),
  );
}
