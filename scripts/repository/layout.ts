import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  durablePublishingFilePaths,
  editorialCorpusRoot,
  editorialOverviewRoot,
  editorialRoot,
  editorialSourcesRoot,
  editorialVolumeIds,
  editorialVolumesRoot,
  masterLedgerPath,
  normalizeRepoPath,
  overviewPath,
  retiredCanonicalRootPaths,
  repoRoot,
  semanticLinksPath,
  type VolumePathManifest,
  volumePackageFileNames,
} from "./paths";

const SOURCE_ROLE_NAMES = new Set<string>(volumePackageFileNames);

export type RepositoryLayoutPaths = {
  repoRoot: string;
  editorialRoot: string;
  editorialSourcesRoot: string;
  editorialCorpusRoot: string;
  editorialOverviewRoot: string;
  editorialVolumesRoot: string;
  masterLedgerPath: string;
  semanticLinksPath: string;
  overviewPath: string;
  publishingFiles: readonly string[];
  retiredCanonicalRoots: readonly string[];
};

export type RepositoryLayoutIssueCode =
  | "duplicate-source"
  | "invalid-manifest"
  | "missing-publishing-file"
  | "missing-source-file"
  | "retired-canonical-root"
  | "source-symlink"
  | "unexpected-volume-entry"
  | "volume-count"
  | "wrong-file-type";

export type RepositoryLayoutIssue = {
  code: RepositoryLayoutIssueCode;
  path: string;
  message: string;
};

export type RepositoryLayoutAudit = {
  issues: RepositoryLayoutIssue[];
  publishingFiles: string[];
  sourceFiles: string[];
  volumePackages: string[];
};

type VolumeManifest = VolumePathManifest & {
  order?: number;
};

function canonicalLayoutPaths(): RepositoryLayoutPaths {
  return {
    repoRoot,
    editorialRoot,
    editorialSourcesRoot,
    editorialCorpusRoot,
    editorialOverviewRoot,
    editorialVolumesRoot,
    masterLedgerPath,
    semanticLinksPath,
    overviewPath,
    publishingFiles: durablePublishingFilePaths,
    retiredCanonicalRoots: retiredCanonicalRootPaths,
  };
}

function relativePath(paths: RepositoryLayoutPaths, filePath: string): string {
  return normalizeRepoPath(path.relative(paths.repoRoot, filePath));
}

function lstat(filePath: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function addIssue(
  issues: RepositoryLayoutIssue[],
  paths: RepositoryLayoutPaths,
  code: RepositoryLayoutIssueCode,
  filePath: string,
  message: string,
): void {
  issues.push({
    code,
    path: relativePath(paths, filePath),
    message,
  });
}

function inspectRequiredFile(
  issues: RepositoryLayoutIssue[],
  paths: RepositoryLayoutPaths,
  filePath: string,
  missingCode: "missing-publishing-file" | "missing-source-file",
  sourceFiles: string[],
): fs.Stats | undefined {
  const stats = lstat(filePath);
  if (!stats) {
    addIssue(
      issues,
      paths,
      missingCode,
      filePath,
      "Required file is missing.",
    );
    return undefined;
  }
  if (stats.isSymbolicLink()) {
    addIssue(
      issues,
      paths,
      "source-symlink",
      filePath,
      "Canonical files must be regular files, not symbolic links.",
    );
    return undefined;
  }
  if (!stats.isFile()) {
    addIssue(
      issues,
      paths,
      "wrong-file-type",
      filePath,
      "Required path is not a regular file.",
    );
    return undefined;
  }
  if (missingCode === "missing-source-file") {
    sourceFiles.push(relativePath(paths, filePath));
  }
  return stats;
}

function walkSourceTree(
  root: string,
  visit: (filePath: string, stats: fs.Stats) => void,
): void {
  const rootStats = lstat(root);
  if (!rootStats) return;
  visit(root, rootStats);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) return;

  for (const entry of fs.readdirSync(root)) {
    walkSourceTree(path.join(root, entry), visit);
  }
}

function recordIdentity(
  identities: Map<string, string>,
  issues: RepositoryLayoutIssue[],
  paths: RepositoryLayoutPaths,
  filePath: string,
  stats: fs.Stats,
): void {
  const identity = `${stats.dev}:${stats.ino}`;
  const firstPath = identities.get(identity);
  if (!firstPath) {
    identities.set(identity, filePath);
    return;
  }
  addIssue(
    issues,
    paths,
    "duplicate-source",
    filePath,
    `Canonical source shares one filesystem identity with ${relativePath(paths, firstPath)}.`,
  );
}

function readManifest(
  issues: RepositoryLayoutIssue[],
  paths: RepositoryLayoutPaths,
  manifestPath: string,
): VolumeManifest | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Manifest root must be an object.");
    }
    return value as VolumeManifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addIssue(
      issues,
      paths,
      "invalid-manifest",
      manifestPath,
      `Volume manifest is not valid JSON: ${message}`,
    );
    return undefined;
  }
}

function validateManifest(
  manifest: VolumeManifest,
  manifestPath: string,
  expectedName: string,
  expectedOrder: number,
  sourcePath: string,
  voiceCardPath: string,
  issues: RepositoryLayoutIssue[],
  paths: RepositoryLayoutPaths,
): void {
  const failures: string[] = [];
  const expectedSourcePath = relativePath(paths, sourcePath);
  const expectedVoiceCardPath = relativePath(paths, voiceCardPath);

  if (manifest.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (manifest.editorialId !== expectedName) {
    failures.push(`editorialId must be ${expectedName}`);
  }
  if (typeof manifest.volumeId !== "string" || manifest.volumeId.length === 0) {
    failures.push("volumeId must be a nonempty string");
  }
  if (manifest.order !== expectedOrder) {
    failures.push(`order must be ${expectedOrder}`);
  }
  if (normalizeRepoPath(manifest.sourcePath ?? "") !== expectedSourcePath) {
    failures.push(`sourcePath must be ${expectedSourcePath}`);
  }
  if (
    normalizeRepoPath(manifest.voiceCardPath ?? "") !== expectedVoiceCardPath
  ) {
    failures.push(`voiceCardPath must be ${expectedVoiceCardPath}`);
  }
  if (!Array.isArray(manifest.historicalSourcePaths)) {
    failures.push("historicalSourcePaths must be an array");
  }

  if (failures.length > 0) {
    addIssue(
      issues,
      paths,
      "invalid-manifest",
      manifestPath,
      failures.join("; "),
    );
  }
}

export function auditRepositoryLayout(
  paths: RepositoryLayoutPaths = canonicalLayoutPaths(),
): RepositoryLayoutAudit {
  const issues: RepositoryLayoutIssue[] = [];
  const sourceFiles: string[] = [];
  const publishingFiles: string[] = [];
  const identities = new Map<string, string>();
  const expectedSourcePaths = new Set<string>([
    paths.masterLedgerPath,
    paths.semanticLinksPath,
    paths.overviewPath,
  ]);

  for (const retiredRoot of paths.retiredCanonicalRoots) {
    if (!lstat(retiredRoot)) continue;
    addIssue(
      issues,
      paths,
      "retired-canonical-root",
      retiredRoot,
      "Retired canonical location still exists.",
    );
  }

  for (const sourcePath of [
    paths.masterLedgerPath,
    paths.semanticLinksPath,
    paths.overviewPath,
  ]) {
    const stats = inspectRequiredFile(
      issues,
      paths,
      sourcePath,
      "missing-source-file",
      sourceFiles,
    );
    if (stats) recordIdentity(identities, issues, paths, sourcePath, stats);
  }

  const volumeRootStats = lstat(paths.editorialVolumesRoot);
  let volumeEntries: fs.Dirent[] = [];
  if (!volumeRootStats) {
    addIssue(
      issues,
      paths,
      "volume-count",
      paths.editorialVolumesRoot,
      "Expected exactly nine volume packages, but the volume root is missing.",
    );
  } else if (volumeRootStats.isSymbolicLink()) {
    addIssue(
      issues,
      paths,
      "source-symlink",
      paths.editorialVolumesRoot,
      "The volume package root must not be a symbolic link.",
    );
  } else if (!volumeRootStats.isDirectory()) {
    addIssue(
      issues,
      paths,
      "wrong-file-type",
      paths.editorialVolumesRoot,
      "The volume package root must be a directory.",
    );
  } else {
    volumeEntries = fs.readdirSync(paths.editorialVolumesRoot, {
      withFileTypes: true,
    });
  }

  const actualPackageNames = volumeEntries
    .filter((entry) => entry.isDirectory() && /^volume-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (
    actualPackageNames.length !== editorialVolumeIds.length ||
    actualPackageNames.some(
      (packageName, index) => packageName !== editorialVolumeIds[index],
    )
  ) {
    addIssue(
      issues,
      paths,
      "volume-count",
      paths.editorialVolumesRoot,
      `Expected volume-01 through volume-09, found ${actualPackageNames.join(", ") || "none"}.`,
    );
  }

  for (const entry of volumeEntries) {
    if (editorialVolumeIds.includes(entry.name)) continue;
    addIssue(
      issues,
      paths,
      "unexpected-volume-entry",
      path.join(paths.editorialVolumesRoot, entry.name),
      "Only the nine approved volume package directories belong at this level.",
    );
  }

  const manifestSourcePaths = new Map<string, string>();
  const manifestVoiceCardPaths = new Map<string, string>();
  const volumeIds = new Map<string, string>();

  editorialVolumeIds.forEach((packageName, index) => {
    const packagePath = path.join(paths.editorialVolumesRoot, packageName);
    const packageStats = lstat(packagePath);
    if (!packageStats) return;
    if (packageStats.isSymbolicLink()) {
      addIssue(
        issues,
        paths,
        "source-symlink",
        packagePath,
        "Volume packages must be real directories, not symbolic links.",
      );
      return;
    }
    if (!packageStats.isDirectory()) {
      addIssue(
        issues,
        paths,
        "wrong-file-type",
        packagePath,
        "Volume package path is not a directory.",
      );
      return;
    }

    const manuscriptPath = path.join(packagePath, "manuscript.md");
    const voiceCardPath = path.join(packagePath, "voice-card.md");
    const manifestPath = path.join(packagePath, "volume.json");
    for (const filePath of [manuscriptPath, voiceCardPath, manifestPath]) {
      expectedSourcePaths.add(filePath);
      const stats = inspectRequiredFile(
        issues,
        paths,
        filePath,
        "missing-source-file",
        sourceFiles,
      );
      if (stats) recordIdentity(identities, issues, paths, filePath, stats);
    }

    if (!lstat(manifestPath)?.isFile()) return;
    const manifest = readManifest(issues, paths, manifestPath);
    if (!manifest) return;
    validateManifest(
      manifest,
      manifestPath,
      packageName,
      index + 1,
      manuscriptPath,
      voiceCardPath,
      issues,
      paths,
    );

    for (const [value, registry, label] of [
      [manifest.sourcePath, manifestSourcePaths, "sourcePath"],
      [manifest.voiceCardPath, manifestVoiceCardPaths, "voiceCardPath"],
      [manifest.volumeId, volumeIds, "volumeId"],
    ] as const) {
      if (typeof value !== "string" || value.length === 0) continue;
      const normalized = normalizeRepoPath(value);
      const firstManifest = registry.get(normalized);
      if (firstManifest) {
        addIssue(
          issues,
          paths,
          "duplicate-source",
          manifestPath,
          `${label} duplicates the value declared by ${relativePath(paths, firstManifest)}.`,
        );
      } else {
        registry.set(normalized, manifestPath);
      }
    }
  });

  walkSourceTree(paths.editorialSourcesRoot, (filePath, stats) => {
    if (stats.isSymbolicLink()) {
      addIssue(
        issues,
        paths,
        "source-symlink",
        filePath,
        "Canonical source trees must not contain symbolic links.",
      );
      return;
    }
    if (
      stats.isFile() &&
      SOURCE_ROLE_NAMES.has(path.basename(filePath)) &&
      !expectedSourcePaths.has(filePath)
    ) {
      addIssue(
        issues,
        paths,
        "duplicate-source",
        filePath,
        "Source role file exists outside its one approved canonical location.",
      );
    }
  });

  for (const publishingPath of paths.publishingFiles) {
    const stats = inspectRequiredFile(
      issues,
      paths,
      publishingPath,
      "missing-publishing-file",
      sourceFiles,
    );
    if (stats) publishingFiles.push(relativePath(paths, publishingPath));
  }

  const uniqueIssues = [
    ...new Map(
      issues.map((issue) => [`${issue.code}:${issue.path}`, issue]),
    ).values(),
  ];

  return {
    issues: uniqueIssues.sort((left, right) =>
      `${left.path}:${left.code}`.localeCompare(`${right.path}:${right.code}`),
    ),
    publishingFiles: publishingFiles.sort(),
    sourceFiles: [...new Set(sourceFiles)].sort(),
    volumePackages: actualPackageNames,
  };
}

export function formatRepositoryLayoutAudit(audit: RepositoryLayoutAudit): string {
  if (audit.issues.length === 0) {
    return [
      "Repository layout is valid.",
      `Volume packages: ${audit.volumePackages.length.toLocaleString()}`,
      `Canonical source files: ${audit.sourceFiles.length.toLocaleString()}`,
      `Publishing files: ${audit.publishingFiles.length.toLocaleString()}`,
    ].join("\n");
  }

  return [
    `Repository layout has ${audit.issues.length.toLocaleString()} issue${
      audit.issues.length === 1 ? "" : "s"
    }.`,
    ...audit.issues.map(
      (issue) => `  [${issue.code}] ${issue.path}: ${issue.message}`,
    ),
  ].join("\n");
}

export function validateRepositoryLayout(
  paths?: RepositoryLayoutPaths,
): RepositoryLayoutAudit {
  const audit = auditRepositoryLayout(paths);
  if (audit.issues.length > 0) {
    throw new Error(formatRepositoryLayoutAudit(audit));
  }
  return audit;
}

function runCli(): void {
  try {
    console.log(formatRepositoryLayoutAudit(validateRepositoryLayout()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
