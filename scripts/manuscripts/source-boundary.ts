import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DISPOSABLE_PREFIXES = [
  "content/manuscripts/",
  "src/generated/manuscripts/",
  "public/data/breadcrumbs/",
] as const;

const DISPOSABLE_FILES = new Set([
  "public/data/outline.json",
  "public/data/pdf-downloads.json",
  "public/data/progress-sections.json",
  "public/data/reader-sections.json",
  "public/data/search-index.json",
]);

const REQUIRED_SERIES_FILES = [
  "content/series/aliases.json",
  "content/series/historical-section-mappings.json",
  "content/series/route-aliases.json",
  "content/series/route-ledger.json",
  "content/series/section-ledger.json",
  "content/series/section-lineage.json",
  "content/series/version-provenance.json",
  "content/series/volumes.json",
] as const;

const AUDIO_MANIFEST = "public/data/audio-manifest.json";
const SOURCE_PREFIX = "sources/manuscripts/";
const SERIES_PREFIX = "content/series/";

export type SourceBoundaryClassification =
  | "disposable-generated"
  | "canonical-manuscript-source"
  | "durable-series-metadata"
  | "durable-audio-manifest"
  | "other-tracked-file";

export type MissingTrackedRequirement = {
  id: "canonical-manuscript-sources" | "audio-manifest" | "series-metadata";
  description: string;
  pathspec: string;
};

export type SourceBoundaryAudit = {
  disposablePaths: string[];
  missingRequirements: MissingTrackedRequirement[];
};

export function normalizeTrackedPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function classifyTrackedPath(filePath: string): SourceBoundaryClassification {
  const normalizedPath = normalizeTrackedPath(filePath);

  if (
    DISPOSABLE_FILES.has(normalizedPath) ||
    DISPOSABLE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
  ) {
    return "disposable-generated";
  }

  if (normalizedPath === AUDIO_MANIFEST) {
    return "durable-audio-manifest";
  }

  if (normalizedPath.startsWith(SOURCE_PREFIX)) {
    return "canonical-manuscript-source";
  }

  if (normalizedPath.startsWith(SERIES_PREFIX)) {
    return "durable-series-metadata";
  }

  return "other-tracked-file";
}

export function auditTrackedPaths(filePaths: readonly string[]): SourceBoundaryAudit {
  const normalizedPaths = [...new Set(filePaths.map(normalizeTrackedPath))].sort();
  const trackedPathSet = new Set(normalizedPaths);
  const disposablePaths = normalizedPaths.filter(
    (filePath) => classifyTrackedPath(filePath) === "disposable-generated",
  );
  const missingRequirements: MissingTrackedRequirement[] = [];

  if (!normalizedPaths.some((filePath) => filePath.startsWith(SOURCE_PREFIX))) {
    missingRequirements.push({
      id: "canonical-manuscript-sources",
      description: "at least one canonical manuscript source must remain tracked",
      pathspec: SOURCE_PREFIX,
    });
  }

  if (!trackedPathSet.has(AUDIO_MANIFEST)) {
    missingRequirements.push({
      id: "audio-manifest",
      description: "the externally published audio manifest must remain tracked",
      pathspec: AUDIO_MANIFEST,
    });
  }

  const missingSeriesFiles = REQUIRED_SERIES_FILES.filter(
    (filePath) => !trackedPathSet.has(filePath),
  );
  for (const filePath of missingSeriesFiles) {
    missingRequirements.push({
      id: "series-metadata",
      description: "durable series metadata must remain tracked",
      pathspec: filePath,
    });
  }

  return { disposablePaths, missingRequirements };
}

export function formatSourceBoundaryFailure(audit: SourceBoundaryAudit): string {
  const lines = ["Manuscript source boundary validation failed."];

  if (audit.disposablePaths.length > 0) {
    const visiblePaths = audit.disposablePaths.slice(0, 25);
    lines.push(
      "",
      `${audit.disposablePaths.length.toLocaleString()} disposable generated path${
        audit.disposablePaths.length === 1 ? " is" : "s are"
      } tracked by Git:`,
      ...visiblePaths.map((filePath) => `  - ${filePath}`),
    );
    if (audit.disposablePaths.length > visiblePaths.length) {
      lines.push(
        `  - and ${(audit.disposablePaths.length - visiblePaths.length).toLocaleString()} more`,
      );
    }
    lines.push(
      "",
      "Remove each generated path from Git's index while retaining its local copy:",
      "  git rm --cached -- <path>",
      "Regenerate disposable manuscript outputs locally through the publishing workflow.",
    );
  }

  if (audit.missingRequirements.length > 0) {
    lines.push(
      "",
      "Required canonical or durable files are not tracked:",
      ...audit.missingRequirements.map(
        (requirement) => `  - ${requirement.pathspec}: ${requirement.description}`,
      ),
      "",
      "Review the missing files, then add the canonical or durable paths back to Git:",
      "  git add -- <path>",
    );
  }

  return lines.join("\n");
}

export function listTrackedPaths(cwd = process.cwd()): string[] {
  const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  }).trim();
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  return output.split("\0").filter(Boolean);
}

export function validateTrackedSourceBoundary(cwd = process.cwd()): SourceBoundaryAudit {
  return auditTrackedPaths(listTrackedPaths(cwd));
}

function runCli(): void {
  try {
    const audit = validateTrackedSourceBoundary();
    if (audit.disposablePaths.length > 0 || audit.missingRequirements.length > 0) {
      console.error(formatSourceBoundaryFailure(audit));
      process.exitCode = 1;
      return;
    }

    console.log(
      "Manuscript source boundary is valid. Canonical sources and durable publication records are tracked, and disposable outputs are not.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Could not inspect Git's tracked files. Run this command inside the repository and confirm Git is available.\n\n${message}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
