import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileManuscripts } from "./compile";
import { pdfManifestPath } from "./pdf";
import {
  artifactsRoot,
  breadcrumbsDir,
  catalogPath,
  manuscriptRoot,
  outlineDataPath,
  progressSectionsPath,
  readerSectionsPath,
  repoRoot,
  searchIndexPath,
} from "./shared";
import {
  audioManifestSourcePath,
  continuityRoot,
  editorialSourcesRoot,
  legacyPaths,
  publicAudioManifestPath,
} from "../repository/paths";

type PreparationState = {
  version: 1;
  fingerprint: string;
};

type PdfManifest = {
  sections: Array<{ pdfHref: string }>;
  manuscripts: Array<{ pdfHref: string }>;
};

type CatalogSummary = {
  stats: { sectionCount: number };
  volumes: Array<{ href: string }>;
};

type ImportReport = {
  volumes: Array<{ sectionCount: number }>;
};

export type PrepareOptions = {
  force?: boolean;
  gitRevision?: string;
  inputPaths?: string[];
  materialize?: () => Promise<void>;
  outputsReady?: () => boolean;
  statePath?: string;
};

const preparationStatePath = path.join(
  repoRoot,
  "node_modules/.cache/coherence-thesis/manuscripts-prepare.json",
);
const markdownImportReportPath = path.join(
  artifactsRoot,
  "markdown-series-report.json",
);

function preparationInputPaths(root = repoRoot): string[] {
  return [
    path.join(root, "package.json"),
    path.join(root, "package-lock.json"),
    path.join(root, path.relative(repoRoot, editorialSourcesRoot)),
    path.join(root, path.relative(repoRoot, continuityRoot)),
    path.join(root, path.relative(repoRoot, audioManifestSourcePath)),
    path.join(root, "scripts/editorial"),
    path.join(root, "scripts/manuscripts"),
    path.join(root, "scripts/repository"),
    path.join(root, "src/lib/manuscript-data.ts"),
    path.join(root, "src/lib/manuscript-labels.ts"),
    path.join(root, "src/lib/markdown-blocks.ts"),
    path.join(root, "src/lib/markdown-inline.ts"),
    path.join(root, "src/lib/reading-time.ts"),
    path.join(root, "fonts"),
    path.join(root, "public/art"),
  ];
}

function filesUnder(inputPath: string): string[] {
  if (!fs.existsSync(inputPath)) return [];
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return [inputPath];
  if (!stat.isDirectory()) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
    const entryPath = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesUnder(entryPath));
    } else if (entry.isFile() && !entry.name.endsWith(".test.ts")) {
      files.push(entryPath);
    }
  }
  return files;
}

function currentGitRevision(root = repoRoot): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "git-revision-unavailable";
  }
}

export function buildPreparationFingerprint(
  inputPaths = preparationInputPaths(),
  gitRevision = currentGitRevision(),
): string {
  const hash = crypto.createHash("sha256");
  hash.update("coherence-manuscripts-prepare-v1\0");
  hash.update(gitRevision);
  hash.update("\0");

  const files = [...new Set(inputPaths.flatMap(filesUnder))].sort();
  for (const filePath of files) {
    hash.update(path.relative(repoRoot, filePath).replaceAll(path.sep, "/"));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function markdownFileCount(root: string): number {
  if (!fs.existsSync(root)) return 0;
  return fs.readdirSync(root, { withFileTypes: true }).reduce((count, entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return count + markdownFileCount(entryPath);
    return count + (entry.isFile() && /\.mdx?$/.test(entry.name) ? 1 : 0);
  }, 0);
}

function pdfPathFromHref(href: string): string {
  return path.join(repoRoot, "public", href.replace(/^\//, ""));
}

export function preparationCountsMatch({
  importedSections,
  materializedMarkdownFiles,
  publishedSections,
  readerSections,
  progressSections,
  searchEntries,
}: {
  importedSections: number;
  materializedMarkdownFiles: number;
  publishedSections: number;
  readerSections: number;
  progressSections: number;
  searchEntries: number;
}): boolean {
  return (
    importedSections > 0 &&
    materializedMarkdownFiles === importedSections &&
    publishedSections > 0 &&
    readerSections === publishedSections &&
    progressSections === publishedSections &&
    searchEntries === publishedSections
  );
}

export function breadcrumbShardPath(
  volumeHref: string,
  root = breadcrumbsDir,
): string {
  const shardKey = volumeHref.match(/^\/manuscripts\/([^/]+)\//)?.[1];
  if (!shardKey) throw new Error(`Invalid manuscript volume route: ${volumeHref}`);
  return path.join(root, `${shardKey}.json`);
}

export function preparationRequiredOutputPaths(): string[] {
  return [
    catalogPath,
    readerSectionsPath,
    progressSectionsPath,
    searchIndexPath,
    outlineDataPath,
    publicAudioManifestPath,
    pdfManifestPath,
    markdownImportReportPath,
  ];
}

export function preparationOutputsReady(): boolean {
  const requiredFiles = preparationRequiredOutputPaths();
  if (requiredFiles.some((filePath) => !fs.existsSync(filePath))) return false;

  try {
    const catalog = readJson<CatalogSummary>(catalogPath);
    const importReport = readJson<ImportReport>(markdownImportReportPath);
    const readerSections = readJson<unknown[]>(readerSectionsPath);
    const progressSections = readJson<unknown[]>(progressSectionsPath);
    const searchIndex = readJson<unknown[]>(searchIndexPath);
    if (catalog.stats.sectionCount <= 0) return false;
    const importedSectionCount = importReport.volumes.reduce(
      (sum, volume) => sum + volume.sectionCount,
      0,
    );
    if (
      !preparationCountsMatch({
        importedSections: importedSectionCount,
        materializedMarkdownFiles: markdownFileCount(manuscriptRoot),
        publishedSections: catalog.stats.sectionCount,
        readerSections: readerSections.length,
        progressSections: progressSections.length,
        searchEntries: searchIndex.length,
      })
    ) {
      return false;
    }

    const breadcrumbFiles = [
      path.join(breadcrumbsDir, "index.json"),
      ...catalog.volumes.map((volume) => breadcrumbShardPath(volume.href)),
    ];
    if (breadcrumbFiles.some((filePath) => !fs.existsSync(filePath))) return false;
    if (
      breadcrumbFiles.some(
        (filePath) => readJson<unknown[]>(filePath).length === 0,
      )
    ) {
      return false;
    }

    const pdfManifest = readJson<PdfManifest>(pdfManifestPath);
    if (pdfManifest.sections.length !== catalog.stats.sectionCount) return false;
    if (pdfManifest.manuscripts.length !== catalog.volumes.length) return false;
    const pdfHrefs = [
      ...pdfManifest.sections.map((entry) => entry.pdfHref),
      ...pdfManifest.manuscripts.map((entry) => entry.pdfHref),
    ];
    if (pdfHrefs.length === 0) return false;
    return pdfHrefs.every((href) => fs.existsSync(pdfPathFromHref(href)));
  } catch {
    return false;
  }
}

function readPreparationState(statePath: string): PreparationState | null {
  try {
    const state = readJson<PreparationState>(statePath);
    return state.version === 1 && typeof state.fingerprint === "string"
      ? state
      : null;
  } catch {
    return null;
  }
}

export function preparationCacheHit(
  statePath: string,
  fingerprint: string,
  outputsReady: () => boolean,
): boolean {
  const state = readPreparationState(statePath);
  return state?.fingerprint === fingerprint && outputsReady();
}

function writeStateAtomically(
  statePath: string,
  state: PreparationState,
): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(temporaryPath, statePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function importMarkdownSources(): void {
  const require = createRequire(import.meta.url);
  const tsxCliPath = require.resolve("tsx/cli");
  execFileSync(
    process.execPath,
    [tsxCliPath, path.join(import.meta.dirname, "import-markdown.ts")],
    { cwd: repoRoot, env: process.env, stdio: "inherit" },
  );
}

async function materializeManuscripts(): Promise<void> {
  for (const legacyPath of [
    legacyPaths.generatedSectionsRoot,
    path.dirname(legacyPaths.generatedCatalogPath),
    legacyPaths.importReportsRoot,
  ]) {
    fs.rmSync(legacyPath, { recursive: true, force: true });
  }
  importMarkdownSources();
  await compileManuscripts();
}

export async function prepareManuscripts(
  options: PrepareOptions = {},
): Promise<boolean> {
  const statePath = options.statePath ?? preparationStatePath;
  const inputs = options.inputPaths ?? preparationInputPaths();
  const gitRevision = options.gitRevision ?? currentGitRevision();
  const outputsReady = options.outputsReady ?? preparationOutputsReady;
  const materialize = options.materialize ?? materializeManuscripts;
  const fingerprint = buildPreparationFingerprint(inputs, gitRevision);

  if (
    !options.force &&
    preparationCacheHit(statePath, fingerprint, outputsReady)
  ) {
    console.log("Manuscript outputs are current.");
    return false;
  }

  await materialize();
  if (!outputsReady()) {
    throw new Error("Manuscript preparation finished without every required output.");
  }

  writeStateAtomically(statePath, { version: 1, fingerprint });
  console.log("Prepared manuscript outputs from canonical sources.");
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareManuscripts({ force: process.argv.includes("--force") }).catch(
    (error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
