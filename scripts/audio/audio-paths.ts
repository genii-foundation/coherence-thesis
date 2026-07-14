import fs from "node:fs";
import path from "node:path";

const safePathSegmentPattern = /^[a-z0-9][a-z0-9._-]*$/i;

function rejectExistingSymbolicLink(filePath: string, label: string): void {
  if (fs.existsSync(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
    throw new Error(`${label} cannot be a symbolic link: ${filePath}`);
  }
}

function rejectSymbolicLinksBelow(root: string, target: string, label: string): void {
  let current = path.resolve(root);
  for (const segment of path.relative(current, path.resolve(target)).split(path.sep)) {
    if (!segment) continue;
    current = path.join(current, segment);
    if (!fs.existsSync(current)) break;
    rejectExistingSymbolicLink(current, label);
  }
}

function assertRealPathContained(root: string, target: string, label: string): void {
  if (!fs.existsSync(root) || !fs.existsSync(target)) return;
  const realRoot = fs.realpathSync(root);
  const realTarget = fs.realpathSync(target);
  if (realTarget !== realRoot && !realTarget.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`${label} resolves outside its audio run.`);
  }
}

export function assertSafeAudioPathSegment(value: string, label: string): string {
  if (!safePathSegmentPattern.test(value)) {
    throw new Error(
      `${label} '${value}' must be one safe path segment containing only letters, numbers, periods, underscores, or hyphens.`,
    );
  }
  return value;
}

export function resolveAudioRunRoot(audioRoot: string, runId: string): string {
  assertSafeAudioPathSegment(runId, "Audio run id");
  const resolvedAudioRoot = path.resolve(audioRoot);
  const runRoot = path.resolve(resolvedAudioRoot, runId);
  if (path.dirname(runRoot) !== resolvedAudioRoot) {
    throw new Error(`Audio run '${runId}' must be a direct child of the audio run root.`);
  }
  rejectExistingSymbolicLink(resolvedAudioRoot, "Audio run root");
  rejectExistingSymbolicLink(runRoot, "Audio run directory");
  assertRealPathContained(resolvedAudioRoot, runRoot, "Audio run directory");
  return runRoot;
}

export function resolveAudioRunFile(
  runRoot: string,
  relativeFilePath: string,
  label: string,
): string {
  if (!relativeFilePath || path.isAbsolute(relativeFilePath)) {
    throw new Error(`${label} must be a relative path inside its audio run.`);
  }
  const resolvedRunRoot = path.resolve(runRoot);
  const filePath = path.resolve(resolvedRunRoot, relativeFilePath);
  if (!filePath.startsWith(`${resolvedRunRoot}${path.sep}`)) {
    throw new Error(`${label} escapes its audio run: ${relativeFilePath}`);
  }
  rejectExistingSymbolicLink(resolvedRunRoot, "Audio run directory");
  rejectSymbolicLinksBelow(resolvedRunRoot, filePath, label);
  assertRealPathContained(resolvedRunRoot, filePath, label);
  return filePath;
}

export function assertCanonicalRunManifestPath(
  audioRoot: string,
  manifestPath: string,
): { manifestPath: string; runRoot: string } {
  const resolvedManifestPath = path.resolve(manifestPath);
  if (path.basename(resolvedManifestPath) !== "manifest.json") {
    throw new Error("An audio run manifest must be named manifest.json.");
  }
  const runRoot = path.dirname(resolvedManifestPath);
  const runId = path.basename(runRoot);
  const canonicalRunRoot = resolveAudioRunRoot(audioRoot, runId);
  if (runRoot !== canonicalRunRoot) {
    throw new Error("The audio run manifest must live in the generated audio run root.");
  }
  const canonicalManifestPath = resolveAudioRunFile(
    canonicalRunRoot,
    "manifest.json",
    "Audio run manifest",
  );
  if (resolvedManifestPath !== canonicalManifestPath) {
    throw new Error("The audio run manifest must use its canonical run path.");
  }
  return { manifestPath: canonicalManifestPath, runRoot };
}
