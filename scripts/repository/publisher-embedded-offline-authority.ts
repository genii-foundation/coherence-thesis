import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  coherencePublisherEmbeddedHostSourcesBuildId as trackedHostSourcesBuildId,
} from "../../src/publisher/embedded-offline-host-identity";
import { auditPublisherCandidate } from "./publisher-candidate";
import { repoRoot } from "./paths";

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const realRepoRoot = fs.realpathSync(repoRoot);
const sourceEntryPaths = Object.freeze([
  ".nvmrc",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "publication.json",
  "public/offline-sw.js",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/overview/layout.tsx",
  "src/app/overview/page.tsx",
  "src/app/manuscripts/[volumeId]/layout.tsx",
  "src/app/manuscripts/[volumeId]/page.tsx",
  "src/app/manuscripts/[volumeId]/[...route]/page.tsx",
  "src/publisher/application.ts",
  "tsconfig.json",
] as const);
const excludedSourcePaths = new Set([
  "generated/manuscripts/catalog.json",
  "src/publisher/embedded-offline-candidate.json",
  "src/publisher/embedded-offline-host-identity.ts",
]);
const sourceExtensions = [
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
] as const;

type JsonRecord = Record<string, unknown>;

export type CoherencePublisherEmbeddedHostSourceRow = Readonly<{
  bytes: number;
  path: string;
  sha256: string;
}>;

export type CoherencePublisherEmbeddedOfflineAuthorityAudit = Readonly<{
  candidateBuildId?: string;
  hostSourcesBuildId: string;
  issues: readonly string[];
  sourceBytes: number;
  sourceCount: number;
  sources: readonly CoherencePublisherEmbeddedHostSourceRow[];
}>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const object = record(value);
  if (object === null) {
    throw new TypeError("Embedded host source projection is not canonical JSON.");
  }
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function sha256(bytes: string | Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function displayPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireRepositoryPath(filePath: string, label: string): void {
  const relativePath = path.relative(repoRoot, filePath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new TypeError(`${label} escapes the repository root: ${filePath}`);
  }
}

function requireRepositoryRegularFilePath(filePath: string, label: string): void {
  requireRepositoryPath(filePath, label);
  const relativePath = path.relative(repoRoot, filePath);
  const realPath = fs.realpathSync(filePath);
  const expectedRealPath = path.resolve(realRepoRoot, relativePath);
  const realRelativePath = path.relative(realRepoRoot, realPath);
  if (
    realRelativePath === ".." ||
    realRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelativePath) ||
    realPath !== expectedRealPath
  ) {
    throw new TypeError(
      `${label} must not resolve through a symlink or outside the repository: ${filePath}`,
    );
  }
}

function readRegularFile(filePath: string): Buffer {
  requireRepositoryRegularFilePath(filePath, "Embedded host source");
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new TypeError(
      `Embedded host source must be one regular non-symlink file: ${displayPath(filePath)}`,
    );
  }
  return fs.readFileSync(filePath);
}

function resolveSourceImport(fromPath: string, specifier: string): string | null {
  const unresolved = specifier.startsWith("@/")
    ? path.join(repoRoot, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromPath), specifier)
      : null;
  if (unresolved === null) return null;
  requireRepositoryPath(unresolved, "Embedded host local import");

  const candidates = [
    unresolved,
    ...sourceExtensions.map((extension) => `${unresolved}${extension}`),
    ...sourceExtensions.map((extension) => path.join(unresolved, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    try {
      const stats = fs.lstatSync(candidate);
      if (stats.isSymbolicLink()) {
        throw new TypeError(
          `Embedded host import must not resolve through a symlink: ${displayPath(candidate)}`,
        );
      }
      if (stats.isFile()) {
        requireRepositoryRegularFilePath(
          candidate,
          "Embedded host resolved import",
        );
        return candidate;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new TypeError(
    `Embedded host local import could not be resolved: ${specifier} from ${displayPath(fromPath)}`,
  );
}

function localImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /@import\s+(?:url\(\s*)?["']([^"']+)["']/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1]);
    }
  }
  return [...new Set(specifiers)];
}

export function projectCoherencePublisherEmbeddedHostSources(): readonly CoherencePublisherEmbeddedHostSourceRow[] {
  const pending = sourceEntryPaths.map((relativePath) =>
    path.join(repoRoot, relativePath)
  );
  const visited = new Set<string>();
  const rows: CoherencePublisherEmbeddedHostSourceRow[] = [];

  while (pending.length > 0) {
    const filePath = pending.pop()!;
    const relativePath = displayPath(filePath);
    if (visited.has(relativePath) || excludedSourcePaths.has(relativePath)) {
      continue;
    }
    visited.add(relativePath);
    const bytes = readRegularFile(filePath);
    rows.push(Object.freeze({
      bytes: bytes.byteLength,
      path: relativePath,
      sha256: sha256(bytes),
    }));
    if (!sourceExtensions.some((extension) => filePath.endsWith(extension))) {
      continue;
    }
    const source = bytes.toString("utf8");
    for (const specifier of localImportSpecifiers(source)) {
      const imported = resolveSourceImport(filePath, specifier);
      if (imported !== null) pending.push(imported);
    }
  }

  return Object.freeze(
    rows.sort((left, right) => compareText(left.path, right.path)),
  );
}

export function coherencePublisherEmbeddedHostSourcesBuildId(
  sources: readonly CoherencePublisherEmbeddedHostSourceRow[],
): string {
  return sha256(canonicalJson({
    kind: "coherence-publisher-embedded-host-sources",
    schemaVersion: "1.0",
    sources,
  }));
}

export function auditCoherencePublisherEmbeddedOfflineAuthority(): CoherencePublisherEmbeddedOfflineAuthorityAudit {
  const issues: string[] = [];
  const candidateAudit = auditPublisherCandidate();
  if (
    candidateAudit.issues.length > 0 ||
    candidateAudit.candidateBuildId === undefined ||
    candidateAudit.candidateIdentity === undefined
  ) {
    issues.push("The Publisher candidate identity is not fully valid.");
  }
  const trackedCandidatePath = path.join(
    repoRoot,
    "src",
    "publisher",
    "embedded-offline-candidate.json",
  );
  const trackedCandidate = JSON.parse(
    readRegularFile(trackedCandidatePath).toString("utf8"),
  ) as unknown;
  const trackedRecord = record(trackedCandidate);
  const trackedBuildId = trackedRecord?.buildId;
  const trackedIdentity = trackedRecord === null
    ? null
    : Object.fromEntries(
        Object.entries(trackedRecord).filter(([key]) => key !== "buildId"),
      );
  if (
    typeof trackedBuildId !== "string" ||
    !SHA256.test(trackedBuildId) ||
    canonicalJson(trackedIdentity) !== canonicalJson(candidateAudit.candidateIdentity) ||
    trackedBuildId !== candidateAudit.candidateBuildId
  ) {
    issues.push("The tracked Publisher candidate identity does not match the validated archives.");
  }

  const sources = projectCoherencePublisherEmbeddedHostSources();
  const hostSourcesBuildId = coherencePublisherEmbeddedHostSourcesBuildId(sources);
  if (hostSourcesBuildId !== trackedHostSourcesBuildId) {
    issues.push(
      `The tracked embedded host source identity is stale: expected ${hostSourcesBuildId}.`,
    );
  }
  if (!sources.some(({ path: sourcePath }) => sourcePath === "src/app/reset.css")) {
    issues.push("The embedded host source closure does not include src/app/reset.css.");
  }
  if (
    !sources.some(
      ({ path: sourcePath }) => sourcePath === "public/offline-sw.js",
    )
  ) {
    issues.push("The embedded host source closure does not include public/offline-sw.js.");
  }
  if (
    sources.some(
      ({ path: sourcePath }) =>
        sourcePath === "generated/manuscripts/catalog.json",
    )
  ) {
    issues.push("The embedded host source closure includes volatile catalog Git identity.");
  }
  if (
    sources.some(
      ({ path: sourcePath }) =>
        path.isAbsolute(sourcePath) ||
        sourcePath === ".." ||
        sourcePath.startsWith("../"),
    )
  ) {
    issues.push("The embedded host source closure contains a path outside the repository.");
  }

  return Object.freeze({
    candidateBuildId: candidateAudit.candidateBuildId,
    hostSourcesBuildId,
    issues: Object.freeze(issues),
    sourceBytes: sources.reduce((total, source) => total + source.bytes, 0),
    sourceCount: sources.length,
    sources,
  });
}

function runCli(): void {
  const audit = auditCoherencePublisherEmbeddedOfflineAuthority();
  if (audit.issues.length > 0) {
    for (const issue of audit.issues) console.error(issue);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Embedded offline authority is valid for candidate ${audit.candidateBuildId}, host ${audit.hostSourcesBuildId}, and ${audit.sourceCount} source files (${audit.sourceBytes} bytes).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
