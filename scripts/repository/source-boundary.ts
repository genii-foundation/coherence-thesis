import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  durablePublishingFilePaths,
  editorialSourcesRoot,
  generatedRoot,
  normalizeRepoPath,
  publishingRoot,
  publicDataRoot,
  publicDownloadsRoot,
  requiredEditorialSourceFilePaths,
  retiredCanonicalRootPaths,
  repoRelative,
} from "./paths";

const DISPOSABLE_PREFIXES = [
  `${repoRelative(generatedRoot)}/`,
  `${repoRelative(publicDataRoot)}/`,
  `${repoRelative(publicDownloadsRoot)}/`,
  "content/manuscripts/",
  "src/generated/manuscripts/",
  "artifacts/",
] as const;

const REQUIRED_EDITORIAL_FILES = requiredEditorialSourceFilePaths.map(repoRelative);

const REQUIRED_PUBLISHING_FILES = durablePublishingFilePaths.map(repoRelative);

const LEGACY_LAYOUT_PREFIXES = retiredCanonicalRootPaths.map(
  (root) => `${repoRelative(root)}/`,
);
const EDITORIAL_SOURCE_PREFIX = `${repoRelative(editorialSourcesRoot)}/`;
const PUBLISHING_PREFIX = `${repoRelative(publishingRoot)}/`;

export type SourceBoundaryClassification =
  | "disposable-generated"
  | "canonical-editorial-source"
  | "durable-publishing-state"
  | "legacy-layout"
  | "other-tracked-file";

export type MissingTrackedRequirement = {
  id: "canonical-editorial-source" | "durable-publishing-state";
  description: string;
  pathspec: string;
};

export type SourceBoundaryAudit = {
  disposablePaths: string[];
  legacyPaths: string[];
  missingRequirements: MissingTrackedRequirement[];
};

export function normalizeTrackedPath(filePath: string): string {
  return normalizeRepoPath(filePath);
}

export function classifyTrackedPath(filePath: string): SourceBoundaryClassification {
  const normalizedPath = normalizeTrackedPath(filePath);

  if (
    DISPOSABLE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
  ) {
    return "disposable-generated";
  }

  if (
    LEGACY_LAYOUT_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
  ) {
    return "legacy-layout";
  }

  if (normalizedPath.startsWith(EDITORIAL_SOURCE_PREFIX)) {
    return "canonical-editorial-source";
  }

  if (normalizedPath.startsWith(PUBLISHING_PREFIX)) {
    return "durable-publishing-state";
  }

  return "other-tracked-file";
}

export function auditTrackedPaths(filePaths: readonly string[]): SourceBoundaryAudit {
  const normalizedPaths = [...new Set(filePaths.map(normalizeTrackedPath))].sort();
  const trackedPathSet = new Set(normalizedPaths);
  const disposablePaths = normalizedPaths.filter(
    (filePath) => classifyTrackedPath(filePath) === "disposable-generated",
  );
  const legacyPaths = normalizedPaths.filter(
    (filePath) => classifyTrackedPath(filePath) === "legacy-layout",
  );
  const missingRequirements: MissingTrackedRequirement[] = [];

  for (const filePath of REQUIRED_EDITORIAL_FILES) {
    if (trackedPathSet.has(filePath)) continue;
    missingRequirements.push({
      id: "canonical-editorial-source",
      description: "every editorial source package must remain complete and tracked",
      pathspec: filePath,
    });
  }

  for (const filePath of REQUIRED_PUBLISHING_FILES) {
    if (trackedPathSet.has(filePath)) continue;
    missingRequirements.push({
      id: "durable-publishing-state",
      description: "durable publishing state must remain tracked",
      pathspec: filePath,
    });
  }

  return { disposablePaths, legacyPaths, missingRequirements };
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

  if (audit.legacyPaths.length > 0) {
    lines.push(
      "",
      "Tracked files remain in retired repository locations:",
      ...audit.legacyPaths.map((filePath) => `  - ${filePath}`),
      "",
      "Move these files into the canonical editorial or publishing boundary.",
    );
  }

  if (audit.missingRequirements.length > 0) {
    lines.push(
      "",
      "Required editorial or publishing files are not tracked:",
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
    if (
      audit.disposablePaths.length > 0 ||
      audit.legacyPaths.length > 0 ||
      audit.missingRequirements.length > 0
    ) {
      console.error(formatSourceBoundaryFailure(audit));
      process.exitCode = 1;
      return;
    }

    console.log(
      "Repository source boundaries are valid. Editorial sources and durable publishing records are tracked, and generated outputs are not.",
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
