import fs from "node:fs";
import path from "node:path";

export const repoRoot = path.resolve(import.meta.dirname, "../..");

export const editorialRoot = path.join(repoRoot, "editorial");
export const editorialSourcesRoot = path.join(editorialRoot, "sources");
export const editorialCorpusRoot = path.join(editorialSourcesRoot, "corpus");
export const editorialOverviewRoot = path.join(editorialSourcesRoot, "overview");
export const editorialVolumesRoot = path.join(editorialSourcesRoot, "volumes");
export const editorialVolumeIds = Array.from(
  { length: 9 },
  (_, index) => `volume-${String(index + 1).padStart(2, "0")}`,
) as readonly string[];
export const volumePackageFileNames = [
  "manuscript.md",
  "voice-card.md",
  "volume.json",
] as const;
export const editorialReviewsRoot = path.join(editorialRoot, "reviews");
export const editorialAuditsRoot = path.join(editorialRoot, "audits");
export const editorialDebtRoot = path.join(editorialRoot, "debt");
export const masterLedgerPath = path.join(
  editorialCorpusRoot,
  "master-ledger.md",
);
export const overviewPath = path.join(
  editorialOverviewRoot,
  "coherence-thesis.json",
);

export const publishingRoot = path.join(repoRoot, "publishing");
export const continuityRoot = path.join(publishingRoot, "continuity");
export const aliasConfigPath = path.join(continuityRoot, "aliases.json");
export const historicalSectionMappingsPath = path.join(
  continuityRoot,
  "historical-section-mappings.json",
);
export const routeAliasConfigPath = path.join(
  continuityRoot,
  "route-aliases.json",
);
export const routeLedgerPath = path.join(continuityRoot, "route-ledger.json");
export const sectionLedgerPath = path.join(
  continuityRoot,
  "section-ledger.json",
);
export const sectionLineagePath = path.join(
  continuityRoot,
  "section-lineage.json",
);
export const versionProvenancePath = path.join(
  continuityRoot,
  "version-provenance.json",
);
export const audioManifestSourcePath = path.join(
  publishingRoot,
  "audio/manifest.json",
);
export const updatesSnapshotPath = path.join(
  publishingRoot,
  "updates/snapshot.json",
);
export const continuityFilePaths = [
  aliasConfigPath,
  historicalSectionMappingsPath,
  routeAliasConfigPath,
  routeLedgerPath,
  sectionLedgerPath,
  sectionLineagePath,
  versionProvenancePath,
] as const;
export const durablePublishingFilePaths = [
  ...continuityFilePaths,
  audioManifestSourcePath,
  updatesSnapshotPath,
] as const;

export const generatedRoot = path.join(repoRoot, "generated");
export const generatedManuscriptsRoot = path.join(
  generatedRoot,
  "manuscripts",
);
export const generatedSectionsRoot = path.join(
  generatedManuscriptsRoot,
  "sections",
);
export const generatedCatalogPath = path.join(
  generatedManuscriptsRoot,
  "catalog.json",
);
export const generatedReportsRoot = path.join(generatedRoot, "reports");
export const generatedImportReportsRoot = path.join(
  generatedReportsRoot,
  "imports",
);
export const generatedAudioReportsRoot = path.join(
  generatedReportsRoot,
  "audio-runs",
);
export const generatedUpdatesSnapshotPath = path.join(
  generatedRoot,
  "updates/snapshot.json",
);

export const publicDataRoot = path.join(repoRoot, "public/data");
export const publicAudioManifestPath = path.join(
  publicDataRoot,
  "audio-manifest.json",
);
export const readerSectionsPath = path.join(
  publicDataRoot,
  "reader-sections.json",
);
export const progressSectionsPath = path.join(
  publicDataRoot,
  "progress-sections.json",
);
export const breadcrumbsDir = path.join(publicDataRoot, "breadcrumbs");
export const searchIndexPath = path.join(publicDataRoot, "search-index.json");
export const outlineDataPath = path.join(publicDataRoot, "outline.json");

export const legacyPaths = {
  manuscriptSourcesRoot: path.join(repoRoot, "sources/manuscripts"),
  masterLedgerPath: path.join(
    repoRoot,
    "sources/manuscripts/coherence-thesis-master-ledger.md",
  ),
  generatedSectionsRoot: path.join(repoRoot, "content/manuscripts"),
  generatedCatalogPath: path.join(
    repoRoot,
    "src/generated/manuscripts/catalog.json",
  ),
  continuityRoot: path.join(repoRoot, "content/series"),
  overviewPath: path.join(repoRoot, "content/overview/coherence-thesis.json"),
  audioManifestPath: path.join(repoRoot, "public/data/audio-manifest.json"),
  updatesSnapshotPath: path.join(repoRoot, "src/generated/updates.json"),
  importReportsRoot: path.join(repoRoot, "artifacts/imports"),
} as const;

export const retiredCanonicalRootPaths = [
  legacyPaths.manuscriptSourcesRoot,
  legacyPaths.continuityRoot,
  path.dirname(legacyPaths.overviewPath),
  path.join(editorialRoot, "voice-cards"),
] as const;

export const requiredEditorialSourceFilePaths = [
  masterLedgerPath,
  overviewPath,
  ...editorialVolumeIds.flatMap((editorialId) =>
    volumePackageFileNames.map((fileName) =>
      path.join(editorialVolumesRoot, editorialId, fileName),
    ),
  ),
] as const;

export const canonicalManuscriptPrefix =
  "editorial/sources/volumes/" as const;
export const editorialReviewPrefix = "editorial/reviews/" as const;
export const legacyManuscriptPrefixes = [
  "sources/manuscripts/",
  "content/manuscripts/",
] as const;

export type VolumePathManifest = {
  schemaVersion: number;
  editorialId: string;
  volumeId: string;
  sourcePath: string;
  voiceCardPath: string;
  historicalSourcePaths: string[];
};

export function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function repoRelative(filePath: string): string {
  return normalizeRepoPath(path.relative(repoRoot, filePath));
}

export function volumePackageDirectories(
  root = editorialVolumesRoot,
): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^volume-\d{2}$/.test(entry.name))
    .map((entry) => path.join(root, entry.name))
    .sort();
}

export function volumeManifestPaths(root = editorialVolumesRoot): string[] {
  return volumePackageDirectories(root).map((directory) =>
    path.join(directory, "volume.json"),
  );
}

export function expectedVolumeManifestPaths(
  root = editorialVolumesRoot,
): string[] {
  return editorialVolumeIds.map((editorialId) =>
    path.join(root, editorialId, "volume.json"),
  );
}

export function readVolumePathManifests(): VolumePathManifest[] {
  return volumeManifestPaths()
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .map((manifestPath) => {
      const manifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      ) as VolumePathManifest;
      return manifest;
    });
}

export function volumeManifestForSourcePath(
  sourcePath: string,
): VolumePathManifest | undefined {
  const normalized = normalizeRepoPath(sourcePath);
  return readVolumePathManifests().find(
    (manifest) =>
      normalizeRepoPath(manifest.sourcePath) === normalized ||
      manifest.historicalSourcePaths.some(
        (candidate) => normalizeRepoPath(candidate) === normalized,
      ),
  );
}

export function canonicalSourcePath(sourcePath: string): string {
  const normalized = normalizeRepoPath(sourcePath);
  if (normalized === repoRelative(legacyPaths.masterLedgerPath)) {
    return repoRelative(masterLedgerPath);
  }
  return volumeManifestForSourcePath(normalized)?.sourcePath ?? normalized;
}

export function sourcePathCandidates(sourcePath: string): string[] {
  const normalized = normalizeRepoPath(sourcePath);
  const currentMasterLedgerPath = repoRelative(masterLedgerPath);
  const historicalMasterLedgerPath = repoRelative(legacyPaths.masterLedgerPath);
  if (
    normalized === currentMasterLedgerPath ||
    normalized === historicalMasterLedgerPath
  ) {
    return [currentMasterLedgerPath, historicalMasterLedgerPath];
  }
  const manifest = volumeManifestForSourcePath(normalized);
  if (!manifest) return [normalizeRepoPath(sourcePath)];
  return [manifest.sourcePath, ...manifest.historicalSourcePaths].map(
    normalizeRepoPath,
  );
}

export function generatedSectionPathCandidates(sectionPath: string): string[] {
  const normalized = normalizeRepoPath(sectionPath);
  const currentPrefix = `${repoRelative(generatedSectionsRoot)}/`;
  const legacyPrefix = `${repoRelative(legacyPaths.generatedSectionsRoot)}/`;
  if (normalized.startsWith(currentPrefix)) {
    return [
      normalized,
      `${legacyPrefix}${normalized.slice(currentPrefix.length)}`,
    ];
  }
  if (normalized.startsWith(legacyPrefix)) {
    return [
      `${currentPrefix}${normalized.slice(legacyPrefix.length)}`,
      normalized,
    ];
  }
  return [normalized];
}

export function isCanonicalManuscriptPath(filePath: string): boolean {
  const normalized = normalizeRepoPath(filePath);
  return (
    normalized.startsWith(canonicalManuscriptPrefix) &&
    normalized.endsWith("/manuscript.md")
  );
}

export function isEditorialReviewPath(filePath: string): boolean {
  return normalizeRepoPath(filePath).startsWith(editorialReviewPrefix);
}
