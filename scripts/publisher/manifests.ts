import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PUBLISHER_VERSION } from "@genii-foundation/publisher";
import { compileMarkdownWork } from "@genii-foundation/publisher-content";
import {
  resolvePublicationSourcesForContentCompilation,
  validatePublicationShape,
  validateWorkShape,
  type Diagnostic,
  type PublicationManifest,
  type ResolvedPublicationSourceGraph,
  type WorkManifest,
  type WorkSectionDeclaration,
} from "@genii-foundation/publisher-schema";

import {
  aliasConfigPath,
  editorialVolumeIds,
  editorialVolumesRoot,
  generatedCatalogPath,
  historicalSectionMappingsPath,
  publisherConfigurationRoot,
  publisherPublicationManifestPath,
  publisherWorksRoot,
  publishingRoot,
  repoRoot,
  routeAliasConfigPath,
  sectionLineagePath,
} from "../repository/paths";
import type {
  CompiledCatalog,
  CompiledSection,
  RouteAliasConfig,
  SectionAliasConfig,
  SectionLineageConfig,
  SectionLineageEntry,
  VolumeConfig,
} from "../manuscripts/types";
import {
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE,
} from "../../src/publisher/reader-state-migration-extension-contract";

const EXPECTED_VOLUME_COUNT = 9;
const EXPECTED_SECTION_COUNT = 525;
const EXPECTED_HISTORICAL_MAPPING_COUNT = 34;
const JSON_INDENT = 2;
const PUBLICATION_SCHEMA_URL =
  "https://publisher.genii.foundation/schemas/publication.schema.json";
const WORK_SCHEMA_URL =
  "https://publisher.genii.foundation/schemas/work.schema.json";

export type PublisherManifestGenerationMode = "check" | "write";

export type PublisherManifestPaths = Readonly<{
  repoRoot: string;
  publisherRoot: string;
  worksRoot: string;
  publicationManifestPath: string;
  editorialVolumesRoot: string;
  catalogPath: string;
  aliasConfigPath: string;
  routeAliasConfigPath: string;
  sectionLineagePath: string;
  historicalSectionMappingsPath: string;
}>;

export type PublisherManuscriptSource = Readonly<{
  config: VolumeConfig;
  absolutePath: string;
  relativePath: string;
  bytes: Uint8Array;
  text: string;
}>;

export type PublisherHistoricalSectionMapping = Readonly<{
  oldSectionId: string;
  currentSectionId: string;
}>;

export type PublisherHistoricalSectionMappings = Readonly<{
  version: number;
  mappings: readonly PublisherHistoricalSectionMapping[];
}>;

export type PublisherManifestSources = Readonly<{
  paths: PublisherManifestPaths;
  volumeConfigs: readonly VolumeConfig[];
  catalog: CompiledCatalog;
  aliasConfig: SectionAliasConfig;
  routeAliasConfig: RouteAliasConfig;
  sectionLineage: SectionLineageConfig;
  historicalSectionMappings: PublisherHistoricalSectionMappings;
  manuscripts: readonly PublisherManuscriptSource[];
}>;

export type PublisherManifestFile = Readonly<{
  kind: "publication" | "work";
  workId?: string;
  absolutePath: string;
  relativePath: string;
  value: PublicationManifest | WorkManifest;
  text: string;
}>;

export type PublisherManifestSet = Readonly<{
  publication: PublicationManifest;
  works: readonly WorkManifest[];
  semanticGraph: ResolvedPublicationSourceGraph;
  files: readonly PublisherManifestFile[];
  counts: Readonly<{
    works: number;
    sections: number;
    files: number;
  }>;
}>;

export type PublisherManifestGenerationResult = Readonly<{
  mode: PublisherManifestGenerationMode;
  manifestSet: PublisherManifestSet;
  checkedFiles: readonly string[];
  writtenFiles: readonly string[];
}>;

function resolveFromRoot(root: string, candidate: string): string {
  return path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(root, candidate);
}

function rebaseCanonicalPath(root: string, canonicalPath: string): string {
  return path.resolve(root, path.relative(repoRoot, canonicalPath));
}

export function resolvePublisherManifestPaths(
  overrides: Partial<PublisherManifestPaths> = {},
): PublisherManifestPaths {
  const resolvedRepoRoot = path.resolve(overrides.repoRoot ?? repoRoot);
  const explicitWorksRoot = overrides.worksRoot === undefined
    ? undefined
    : resolveFromRoot(resolvedRepoRoot, overrides.worksRoot);
  const resolvedPublisherRoot = overrides.publisherRoot === undefined
    ? explicitWorksRoot === undefined
      ? rebaseCanonicalPath(resolvedRepoRoot, publisherConfigurationRoot)
      : path.dirname(explicitWorksRoot)
    : resolveFromRoot(resolvedRepoRoot, overrides.publisherRoot);

  return Object.freeze({
    repoRoot: resolvedRepoRoot,
    publisherRoot: resolvedPublisherRoot,
    worksRoot:
      explicitWorksRoot ??
      (overrides.publisherRoot === undefined
        ? rebaseCanonicalPath(resolvedRepoRoot, publisherWorksRoot)
        : path.join(
            resolvedPublisherRoot,
            path.basename(publisherWorksRoot),
          )),
    publicationManifestPath:
      overrides.publicationManifestPath === undefined
        ? rebaseCanonicalPath(
            resolvedRepoRoot,
            publisherPublicationManifestPath,
          )
        : resolveFromRoot(
            resolvedRepoRoot,
            overrides.publicationManifestPath,
          ),
    editorialVolumesRoot:
      overrides.editorialVolumesRoot === undefined
        ? rebaseCanonicalPath(resolvedRepoRoot, editorialVolumesRoot)
        : resolveFromRoot(resolvedRepoRoot, overrides.editorialVolumesRoot),
    catalogPath:
      overrides.catalogPath === undefined
        ? rebaseCanonicalPath(resolvedRepoRoot, generatedCatalogPath)
        : resolveFromRoot(resolvedRepoRoot, overrides.catalogPath),
    aliasConfigPath:
      overrides.aliasConfigPath === undefined
        ? rebaseCanonicalPath(resolvedRepoRoot, aliasConfigPath)
        : resolveFromRoot(resolvedRepoRoot, overrides.aliasConfigPath),
    routeAliasConfigPath:
      overrides.routeAliasConfigPath === undefined
        ? rebaseCanonicalPath(resolvedRepoRoot, routeAliasConfigPath)
        : resolveFromRoot(resolvedRepoRoot, overrides.routeAliasConfigPath),
    sectionLineagePath:
      overrides.sectionLineagePath === undefined
        ? rebaseCanonicalPath(resolvedRepoRoot, sectionLineagePath)
        : resolveFromRoot(resolvedRepoRoot, overrides.sectionLineagePath),
    historicalSectionMappingsPath:
      overrides.historicalSectionMappingsPath === undefined
        ? rebaseCanonicalPath(
            resolvedRepoRoot,
            historicalSectionMappingsPath,
          )
        : resolveFromRoot(
            resolvedRepoRoot,
            overrides.historicalSectionMappingsPath,
          ),
  });
}

function normalizeRepoPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function relativeToRepository(root: string, absolutePath: string): string {
  return normalizeRepoPath(path.relative(root, absolutePath));
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative.length === 0 ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function requirePathInside(
  root: string,
  candidate: string,
  authority: string,
): void {
  if (!isPathInside(root, candidate)) {
    throw new Error(
      `${authority} must remain inside the repository root: ${candidate}`,
    );
  }
}

function requireNoSymbolicPathSegments(
  root: string,
  candidate: string,
  authority: string,
): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  let current = path.resolve(root);
  const segments = relative.split(path.sep).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `${authority} must not cross a symbolic link: ${current}`,
      );
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error(
        `${authority} ancestors must be regular directories: ${current}`,
      );
    }
  }
}

function readJson<T>(filePath: string, authority: string): T {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read ${authority} at ${filePath}: ${reason}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot parse ${authority} at ${filePath}: ${reason}`);
  }
}

function decodeUtf8(bytes: Uint8Array, authority: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${authority} must contain valid UTF-8 text.`);
  }
}

export function readPublisherManifestSources(
  pathOverrides: Partial<PublisherManifestPaths> = {},
): PublisherManifestSources {
  const paths = resolvePublisherManifestPaths(pathOverrides);
  const readAuthorityJson = <T>(
    filePath: string,
    authority: string,
  ): T => {
    requirePathInside(paths.repoRoot, filePath, authority);
    requireNoSymbolicPathSegments(paths.repoRoot, filePath, authority);
    return readJson<T>(filePath, authority);
  };
  const volumeConfigs = editorialVolumeIds.map((editorialId) =>
    readAuthorityJson<VolumeConfig>(
      path.join(paths.editorialVolumesRoot, editorialId, "volume.json"),
      `volume manifest ${editorialId}`,
    ),
  );
  const catalog = readAuthorityJson<CompiledCatalog>(
    paths.catalogPath,
    "generated manuscript catalog",
  );
  const aliasConfig = readAuthorityJson<SectionAliasConfig>(
    paths.aliasConfigPath,
    "section alias continuity",
  );
  const routeAliasConfig = readAuthorityJson<RouteAliasConfig>(
    paths.routeAliasConfigPath,
    "route alias continuity",
  );
  const sectionLineage = readAuthorityJson<SectionLineageConfig>(
    paths.sectionLineagePath,
    "section lineage",
  );
  const historicalSectionMappings =
    readAuthorityJson<PublisherHistoricalSectionMappings>(
      paths.historicalSectionMappingsPath,
      "historical section mappings",
    );

  const manuscripts = volumeConfigs.map((config) => {
    if (typeof config.sourcePath !== "string") {
      throw new Error(
        `Volume manifest ${String(config.editorialId)} has no canonical sourcePath.`,
      );
    }
    const absolutePath = path.resolve(paths.repoRoot, config.sourcePath);
    requirePathInside(paths.repoRoot, absolutePath, "Canonical manuscript");
    requireNoSymbolicPathSegments(
      paths.repoRoot,
      absolutePath,
      "Canonical manuscript",
    );
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(
        `Canonical manuscript must be a regular file: ${absolutePath}`,
      );
    }
    const bytes = fs.readFileSync(absolutePath);
    return Object.freeze({
      config,
      absolutePath,
      relativePath: relativeToRepository(paths.repoRoot, absolutePath),
      bytes: new Uint8Array(bytes),
      text: decodeUtf8(bytes, `Canonical manuscript ${config.volumeId}`),
    });
  });

  return Object.freeze({
    paths,
    volumeConfigs: Object.freeze(volumeConfigs),
    catalog,
    aliasConfig,
    routeAliasConfig,
    sectionLineage,
    historicalSectionMappings,
    manuscripts: Object.freeze(manuscripts),
  });
}

function requireRecord(value: unknown, authority: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${authority} must be a JSON object.`);
  }
}

function requireArray(value: unknown, authority: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${authority} must be an array.`);
  }
}

function requireNonemptyString(value: unknown, authority: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${authority} must be a nonempty string.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, authority: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`${authority} must be a positive integer.`);
  }
  return Number(value);
}

function requireUniqueId(
  id: string,
  firstIndexById: Map<string, number>,
  index: number,
  authority: string,
): void {
  const firstIndex = firstIndexById.get(id);
  if (firstIndex !== undefined) {
    throw new Error(
      `${authority} contains duplicate ID "${id}" at indexes ${firstIndex} and ${index}.`,
    );
  }
  firstIndexById.set(id, index);
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameStringGroups(
  left: readonly (readonly string[])[],
  right: readonly (readonly string[])[],
): boolean {
  return (
    left.length === right.length &&
    left.every((group, index) => {
      const other = right[index];
      return other !== undefined && sameStrings(group, other);
    })
  );
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function normalizedMarkdown(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function sourceLineStarts(value: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function sourceLineAtOffset(
  starts: readonly number[],
  offset: number,
): number {
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return Math.max(1, low);
}

function formatDiagnostics(
  authority: string,
  diagnostics: readonly Diagnostic[],
): string {
  const details = diagnostics.map((item) => {
    const location = `${item.documentPath ?? authority}${item.path}`;
    return `${location}: ${item.code}: ${item.message}`;
  });
  return `${authority} validation failed:\n${details.join("\n")}`;
}

function validateLineageAgreement(
  section: CompiledSection,
  lineage: SectionLineageEntry,
): void {
  const lineageContinuityId = lineage.continuityIds[0];
  if (section.continuityId !== lineageContinuityId) {
    throw new Error(
      `Catalog and section lineage disagree on the continuity ID for "${section.sectionId}".`,
    );
  }
  const lineageLegacyContinuityIds = lineage.continuityIds.slice(1);
  if (
    !sameStrings(
      section.legacyContinuityIds,
      lineageLegacyContinuityIds,
    )
  ) {
    throw new Error(
      `Catalog and section lineage disagree on legacy continuity IDs for "${section.sectionId}".`,
    );
  }
  if (
    !sameStringGroups(
      section.progressContinuityGroups,
      lineage.progressContinuityGroups ?? [],
    )
  ) {
    throw new Error(
      `Catalog and section lineage disagree on progress groups for "${section.sectionId}".`,
    );
  }
  if (
    !sameStrings(
      section.legacySectionIds,
      lineage.historicalSectionIds,
    )
  ) {
    throw new Error(
      `Catalog and section lineage disagree on historical section IDs for "${section.sectionId}".`,
    );
  }
}

function topLevelSourceRoot(relativePath: string): string {
  const normalized = normalizeRepoPath(relativePath);
  const [first] = normalized.split("/");
  return requireNonemptyString(first, `Source path ${relativePath}`);
}

function serializeManifest(value: PublicationManifest | WorkManifest): string {
  return `${JSON.stringify(value, null, JSON_INDENT)}\n`;
}

function buildWorkManifest(
  source: PublisherManuscriptSource,
  volume: CompiledCatalog["volumes"][number],
  sections: readonly CompiledSection[],
  lineageByCurrentId: ReadonlyMap<string, SectionLineageEntry>,
): WorkManifest {
  const actualHash = sha256(source.bytes);
  if (decodeUtf8(source.bytes, `Canonical manuscript ${source.config.volumeId}`) !== source.text) {
    throw new Error(
      `Canonical manuscript bytes and text disagree for "${source.config.volumeId}".`,
    );
  }
  if (source.relativePath !== normalizeRepoPath(source.config.sourcePath)) {
    throw new Error(
      `Volume "${source.config.volumeId}" sourcePath does not resolve to its loaded manuscript.`,
    );
  }
  if (sections.length === 0) {
    throw new Error(`Volume "${source.config.volumeId}" has no catalog sections.`);
  }

  const markdown = normalizedMarkdown(source.text);
  const compiled = compileMarkdownWork({
    workId: source.config.volumeId,
    sectionId: sections[0]?.sectionId,
    title: source.config.title,
    sourcePath: source.config.sourcePath,
    markdown,
  });
  if (!compiled.valid) {
    throw new Error(
      formatDiagnostics(
        `Markdown source ${source.config.sourcePath}`,
        compiled.diagnostics,
      ),
    );
  }
  const blocks = compiled.value.work.sections[0]?.blocks ?? [];
  if (blocks.length === 0) {
    throw new Error(
      `Canonical manuscript "${source.config.volumeId}" has no Markdown blocks.`,
    );
  }
  const lineStarts = sourceLineStarts(markdown);
  const blockLines = blocks.map((block) =>
    sourceLineAtOffset(lineStarts, block.provenance.startOffset),
  );
  const occurrenceBySignature = new Map<string, number>();
  const occurrenceByBlockIndex = blocks.map((block) => {
    const signature = JSON.stringify([block.kind, block.text]);
    const occurrence = (occurrenceBySignature.get(signature) ?? 0) + 1;
    occurrenceBySignature.set(signature, occurrence);
    return occurrence;
  });

  const chapterRootByKey = new Map<string, string>();
  const closedChapterKeys = new Set<string>();
  let activeChapterKey: string | undefined;
  let previousParagraphStart = 0;
  let previousBlockIndex = -1;

  const declarations = sections.map((section, sectionIndex) => {
    const sourceHash = requireNonemptyString(
      section.sourceHash,
      `Catalog sourceHash for ${section.sectionId}`,
    );
    if (sourceHash !== actualHash) {
      throw new Error(
        `Catalog source hash is stale for "${section.sectionId}" in volume "${source.config.volumeId}".`,
      );
    }
    if (section.sourceDoc !== source.relativePath) {
      throw new Error(
        `Catalog source document is stale for "${section.sectionId}".`,
      );
    }
    const sourceParagraphStart = requirePositiveInteger(
      section.sourceParagraphStart,
      `Catalog sourceParagraphStart for ${section.sectionId}`,
    );
    const sourceParagraphEnd = requirePositiveInteger(
      section.sourceParagraphEnd,
      `Catalog sourceParagraphEnd for ${section.sectionId}`,
    );
    if (sourceParagraphEnd < sourceParagraphStart) {
      throw new Error(
        `Catalog source range is reversed for "${section.sectionId}".`,
      );
    }
    if (sourceParagraphStart <= previousParagraphStart) {
      throw new Error(
        `Catalog source ranges are not strictly increasing in volume "${source.config.volumeId}" at "${section.sectionId}".`,
      );
    }
    if (sourceParagraphEnd > lineStarts.length) {
      throw new Error(
        `Catalog source range exceeds the manuscript for "${section.sectionId}".`,
      );
    }
    previousParagraphStart = sourceParagraphStart;

    const lineage = lineageByCurrentId.get(section.sectionId);
    if (lineage === undefined) {
      throw new Error(
        `Section lineage is missing current section "${section.sectionId}".`,
      );
    }
    validateLineageAgreement(section, lineage);

    const chapterKey = `${section.partId}\u0000${section.chapterId}`;
    if (activeChapterKey !== chapterKey) {
      if (closedChapterKeys.has(chapterKey)) {
        throw new Error(
          `Catalog chapter "${section.chapterId}" is not contiguous in volume "${source.config.volumeId}".`,
        );
      }
      if (activeChapterKey !== undefined) {
        closedChapterKeys.add(activeChapterKey);
      }
      activeChapterKey = chapterKey;
    }
    const chapterRootId = chapterRootByKey.get(chapterKey);
    if (chapterRootId === undefined) {
      chapterRootByKey.set(chapterKey, section.sectionId);
    }

    let start: WorkSectionDeclaration["start"];
    let selectorSourceLine = 1;
    if (sectionIndex === 0) {
      start = { kind: "document" };
      previousBlockIndex = 0;
    } else {
      const blockIndex = blockLines.findIndex(
        (line) => line >= sourceParagraphStart,
      );
      if (blockIndex < 0) {
        throw new Error(
          `No Markdown block starts at or after sourceParagraphStart for "${section.sectionId}".`,
        );
      }
      if (blockIndex <= previousBlockIndex) {
        throw new Error(
          `Markdown selectors are not strictly increasing at "${section.sectionId}".`,
        );
      }
      const block = blocks[blockIndex];
      if (block === undefined) {
        throw new Error(
          `Markdown block selection failed for "${section.sectionId}".`,
        );
      }
      selectorSourceLine = blockLines[blockIndex] ?? 0;
      if (selectorSourceLine > sourceParagraphEnd) {
        throw new Error(
          `Markdown selector falls outside the catalog source range for "${section.sectionId}".`,
        );
      }
      start = {
        kind: "block",
        blockKind: block.kind,
        text: block.text,
        occurrence: occurrenceByBlockIndex[blockIndex] ?? 1,
      };
      previousBlockIndex = blockIndex;
    }

    return {
      id: section.sectionId,
      title: section.title,
      role: chapterRootId === undefined ? "chapter" : "section",
      ...(chapterRootId === undefined ? {} : { parentId: chapterRootId }),
      route: section.href,
      navigable: true,
      start,
      continuity: {
        id: section.continuityId,
        legacyIds: [...section.legacyContinuityIds],
        progressGroups: section.progressContinuityGroups.map((group) => [
          ...group,
        ]),
        historicalSectionIds: [...section.legacySectionIds],
      },
      metadata: {
        partId: section.partId,
        partTitle: section.partTitle,
        partOrder: section.partOrder,
        chapterId: section.chapterId,
        chapterTitle: section.chapterTitle,
        chapterOrder: section.chapterOrder,
        sectionOrder: section.sectionOrder,
        sourceDocument: source.relativePath,
        sourceHash,
        sourceParagraphStart,
        sourceParagraphEnd,
        selectorSourceLine,
        readerHref: section.readerHref,
      },
    } satisfies WorkSectionDeclaration;
  });

  return {
    $schema: WORK_SCHEMA_URL,
    schemaVersion: "1.0",
    id: source.config.volumeId,
    title: source.config.title,
    subtitle: source.config.subtitle,
    language: "en",
    publicationState: "published",
    route: volume.href,
    manuscript: {
      path: source.relativePath,
      relativeTo: "repository",
    },
    sections: declarations,
    metadata: {
      editorialId: source.config.editorialId,
      volumeOrder: source.config.order,
      numberLabel: source.config.numberLabel,
      planet: source.config.planet,
      coverImage: source.config.coverImage,
      coverAlt: source.config.coverAlt,
      sourcePath: source.relativePath,
      sourceHash: actualHash,
    },
  };
}

function assertVolumeAgreement(
  config: VolumeConfig,
  volume: CompiledCatalog["volumes"][number],
  expectedOrder: number,
): void {
  if (config.schemaVersion !== 1) {
    throw new Error(
      `Volume manifest "${String(config.editorialId)}" must use schemaVersion 1.`,
    );
  }
  if (config.order !== expectedOrder || volume.order !== expectedOrder) {
    throw new Error(
      `Volume order ${expectedOrder} disagrees between its manifest and catalog.`,
    );
  }
  if (
    config.volumeId !== volume.volumeId ||
    config.title !== volume.title ||
    config.subtitle !== volume.subtitle ||
    config.numberLabel !== volume.numberLabel ||
    config.planet !== volume.planet ||
    config.coverImage !== volume.coverImage ||
    config.coverAlt !== volume.coverAlt
  ) {
    throw new Error(
      `Volume manifest and catalog disagree for order ${expectedOrder}.`,
    );
  }
}

function manifestPathForWork(
  paths: PublisherManifestPaths,
  workId: string,
): string {
  return path.join(paths.worksRoot, `${workId}.json`);
}

function buildContinuityRedirects(
  sources: PublisherManifestSources,
  activeRoutePaths: ReadonlySet<string>,
): NonNullable<PublicationManifest["continuity"]>["redirects"] {
  requireRecord(sources.aliasConfig, "Section alias continuity");
  requireArray(sources.aliasConfig.aliases, "Section alias continuity entries");
  requireRecord(sources.routeAliasConfig, "Route alias continuity");
  requireArray(
    sources.routeAliasConfig.aliases,
    "Route alias continuity entries",
  );
  if (sources.aliasConfig.version !== 1) {
    throw new Error("Section alias continuity must use version 1.");
  }
  if (sources.routeAliasConfig.version !== 1) {
    throw new Error("Route alias continuity must use version 1.");
  }

  const sectionHrefsById = new Map(
    sources.catalog.sections.map((section) => [section.sectionId, section.href]),
  );
  const aggregateRoutePaths = new Set(
    sources.catalog.volumes.flatMap((volume) =>
      volume.parts.flatMap((part) => [
        part.href,
        ...part.chapters.map((chapter) => chapter.href),
      ]),
    ),
  );
  const claimedSources = new Set<string>();
  const redirects = new Map<
    string,
    { from: string; to: string; status: 308 }
  >();
  const claimRedirect = (
    rawEntry: unknown,
    authority: string,
    resolveTarget: (entry: Record<string, unknown>) => string,
  ): void => {
    requireRecord(rawEntry, authority);
    const entry = rawEntry as Record<string, unknown>;
    const from = requireNonemptyString(entry.sourceHref, `${authority} sourceHref`);
    const to = resolveTarget(entry);
    if (activeRoutePaths.has(from)) {
      throw new Error(`${authority} sourceHref must not be an active route: ${from}`);
    }
    if (claimedSources.has(from)) {
      throw new Error(`Duplicate continuity redirect sourceHref: ${from}`);
    }
    claimedSources.add(from);
    if (!activeRoutePaths.has(to) && aggregateRoutePaths.has(to)) {
      return;
    }
    if (!activeRoutePaths.has(to)) {
      throw new Error(`${authority} target must be an active route: ${to}`);
    }
    redirects.set(from, { from, to, status: 308 });
  };

  sources.routeAliasConfig.aliases.forEach((entry, index) =>
    claimRedirect(entry, `Route alias continuity entry ${index + 1}`, (value) =>
      requireNonemptyString(
        value.targetHref,
        `Route alias continuity entry ${index + 1} targetHref`,
      ),
    ),
  );
  sources.aliasConfig.aliases.forEach((entry, index) =>
    claimRedirect(entry, `Section alias continuity entry ${index + 1}`, (value) => {
      const targetSectionId = requireNonemptyString(
        value.targetSectionId,
        `Section alias continuity entry ${index + 1} targetSectionId`,
      );
      const targetHref = sectionHrefsById.get(targetSectionId);
      if (targetHref === undefined) {
        throw new Error(
          `Section alias continuity entry ${index + 1} targets unknown section ID: ${targetSectionId}`,
        );
      }
      return targetHref;
    }),
  );

  for (const redirect of [...redirects.values()]) {
    if (redirect.from === "/" || !redirect.from.endsWith("/")) continue;
    const companionFrom = redirect.from.slice(0, -1);
    if (redirects.has(companionFrom)) {
      throw new Error(
        `Continuity redirect slash companion conflicts with a reviewed sourceHref: ${companionFrom}`,
      );
    }
    redirects.set(companionFrom, {
      from: companionFrom,
      to: redirect.from,
      status: 308,
    });
  }

  return [...redirects.values()].sort((left, right) =>
    left.from.localeCompare(right.from),
  );
}

export function createPublisherManifestSet(
  sources: PublisherManifestSources,
): PublisherManifestSet {
  requireRecord(sources.catalog, "Generated manuscript catalog");
  requireArray(sources.catalog.volumes, "Generated manuscript catalog volumes");
  requireArray(sources.catalog.sections, "Generated manuscript catalog sections");
  requireRecord(sources.sectionLineage, "Section lineage");
  requireArray(sources.sectionLineage.sections, "Section lineage sections");
  requireRecord(sources.historicalSectionMappings, "Historical section mappings");
  requireArray(
    sources.historicalSectionMappings.mappings,
    "Historical section mapping entries",
  );

  if (
    sources.volumeConfigs.length !== EXPECTED_VOLUME_COUNT ||
    sources.manuscripts.length !== EXPECTED_VOLUME_COUNT ||
    sources.catalog.volumes.length !== EXPECTED_VOLUME_COUNT ||
    sources.catalog.stats.volumeCount !== EXPECTED_VOLUME_COUNT
  ) {
    throw new Error(
      `Publisher manifest generation requires exactly ${EXPECTED_VOLUME_COUNT} canonical volumes.`,
    );
  }
  if (
    sources.catalog.sections.length !== EXPECTED_SECTION_COUNT ||
    sources.catalog.stats.sectionCount !== EXPECTED_SECTION_COUNT ||
    sources.sectionLineage.sections.length !== EXPECTED_SECTION_COUNT
  ) {
    throw new Error(
      `Publisher manifest generation requires exactly ${EXPECTED_SECTION_COUNT} current sections in both catalog and lineage.`,
    );
  }
  if (sources.sectionLineage.version !== 1) {
    throw new Error("Section lineage must use version 1.");
  }
  if (sources.historicalSectionMappings.version !== 1) {
    throw new Error("Historical section mappings must use version 1.");
  }
  if (
    sources.historicalSectionMappings.mappings.length !==
    EXPECTED_HISTORICAL_MAPPING_COUNT
  ) {
    throw new Error(
      `Publisher manifest generation requires exactly ${EXPECTED_HISTORICAL_MAPPING_COUNT} reviewed historical section mappings.`,
    );
  }

  const sortedConfigs = [...sources.volumeConfigs].sort(
    (left, right) => left.order - right.order,
  );
  const manuscriptByVolumeId = new Map(
    sources.manuscripts.map((manuscript) => [
      manuscript.config.volumeId,
      manuscript,
    ]),
  );
  if (manuscriptByVolumeId.size !== EXPECTED_VOLUME_COUNT) {
    throw new Error("Canonical manuscript sources contain duplicate volume IDs.");
  }

  const lineageByCurrentId = new Map<string, SectionLineageEntry>();
  const firstLineageIndexById = new Map<string, number>();
  sources.sectionLineage.sections.forEach((entry, index) => {
    const id = requireNonemptyString(
      entry.currentSectionId,
      `Section lineage currentSectionId at index ${index}`,
    );
    requireUniqueId(
      id,
      firstLineageIndexById,
      index,
      "Section lineage",
    );
    requireArray(entry.continuityIds, `Continuity IDs for ${id}`);
    requireArray(entry.historicalSectionIds, `Historical section IDs for ${id}`);
    if (entry.progressContinuityGroups !== undefined) {
      requireArray(entry.progressContinuityGroups, `Progress groups for ${id}`);
    }
    lineageByCurrentId.set(id, entry);
  });

  const firstCatalogIndexById = new Map<string, number>();
  const catalogBySectionId = new Map<string, CompiledSection>();
  sources.catalog.sections.forEach((section, index) => {
    const id = requireNonemptyString(
      section.sectionId,
      `Catalog sectionId at index ${index}`,
    );
    requireUniqueId(id, firstCatalogIndexById, index, "Manuscript catalog");
    catalogBySectionId.set(id, section);
  });
  for (const lineageId of lineageByCurrentId.keys()) {
    if (!catalogBySectionId.has(lineageId)) {
      throw new Error(
        `Section lineage contains current section "${lineageId}" outside the catalog.`,
      );
    }
  }

  const historicalOwnerById = new Map<string, string>();
  sources.historicalSectionMappings.mappings.forEach((mapping, index) => {
    const oldSectionId = requireNonemptyString(
      mapping.oldSectionId,
      `Historical oldSectionId at index ${index}`,
    );
    const currentSectionId = requireNonemptyString(
      mapping.currentSectionId,
      `Historical currentSectionId at index ${index}`,
    );
    const existingOwner = historicalOwnerById.get(oldSectionId);
    if (existingOwner !== undefined) {
      throw new Error(
        `Historical section mapping repeats old ID "${oldSectionId}" for "${existingOwner}" and "${currentSectionId}".`,
      );
    }
    const lineage = lineageByCurrentId.get(currentSectionId);
    if (lineage === undefined) {
      throw new Error(
        `Historical section mapping targets unknown current section "${currentSectionId}".`,
      );
    }
    if (!lineage.historicalSectionIds.includes(oldSectionId)) {
      throw new Error(
        `Historical section mapping "${oldSectionId}" is absent from lineage for "${currentSectionId}".`,
      );
    }
    historicalOwnerById.set(oldSectionId, currentSectionId);
  });

  const routeOwnerByPath = new Map<string, string>();
  const claimRoute = (route: string, owner: string): void => {
    const firstOwner = routeOwnerByPath.get(route);
    if (firstOwner !== undefined) {
      throw new Error(
        `Published route "${route}" is claimed by both "${firstOwner}" and "${owner}".`,
      );
    }
    routeOwnerByPath.set(route, owner);
  };

  const works = sortedConfigs.map((config, configIndex) => {
    const expectedOrder = configIndex + 1;
    const expectedEditorialId = editorialVolumeIds[configIndex];
    if (config.editorialId !== expectedEditorialId) {
      throw new Error(
        `Canonical volume order ${expectedOrder} must use editorial ID "${String(expectedEditorialId)}".`,
      );
    }
    const volume = sources.catalog.volumes[configIndex];
    if (volume === undefined) {
      throw new Error(`Catalog volume ${expectedOrder} is missing.`);
    }
    assertVolumeAgreement(config, volume, expectedOrder);
    const manuscript = manuscriptByVolumeId.get(config.volumeId);
    if (manuscript === undefined) {
      throw new Error(
        `Canonical manuscript is missing for volume "${config.volumeId}".`,
      );
    }
    if (manuscript.config !== config) {
      throw new Error(
        `Canonical manuscript config identity disagrees for volume "${config.volumeId}".`,
      );
    }
    const sections = sources.catalog.sections.filter(
      (section) => section.volumeId === config.volumeId,
    );
    if (!sameStrings(volume.sectionIds, sections.map((section) => section.sectionId))) {
      throw new Error(
        `Catalog volume section census disagrees for "${config.volumeId}".`,
      );
    }
    claimRoute(volume.href, `work:${config.volumeId}`);
    sections.forEach((section) =>
      claimRoute(section.href, `section:${section.sectionId}`),
    );
    return buildWorkManifest(
      manuscript,
      volume,
      sections,
      lineageByCurrentId,
    );
  });

  const representedSectionIds = new Set(
    works.flatMap((work) => work.sections?.map((section) => section.id) ?? []),
  );
  if (
    representedSectionIds.size !== EXPECTED_SECTION_COUNT ||
    [...catalogBySectionId.keys()].some((id) => !representedSectionIds.has(id))
  ) {
    throw new Error(
      "Publisher work manifests do not represent the complete catalog section census.",
    );
  }

  const worksRoot = relativeToRepository(
    sources.paths.repoRoot,
    sources.paths.worksRoot,
  );
  const publisherRoot = relativeToRepository(
    sources.paths.repoRoot,
    sources.paths.publisherRoot,
  );
  requireNonemptyString(worksRoot, "Publisher works root");
  requireNonemptyString(publisherRoot, "Publisher configuration root");
  const durablePublishingRoot = relativeToRepository(
    sources.paths.repoRoot,
    rebaseCanonicalPath(sources.paths.repoRoot, publishingRoot),
  );
  requireNonemptyString(
    durablePublishingRoot,
    "Durable publishing source root",
  );
  const sourceRoots = new Set<string>([
    topLevelSourceRoot(publisherRoot),
    topLevelSourceRoot(durablePublishingRoot),
    ...sortedConfigs.map((config) => topLevelSourceRoot(config.sourcePath)),
  ]);
  const activeRoutePaths = new Set<string>(["/"]);
  for (const work of works) {
    activeRoutePaths.add(
      requireNonemptyString(work.route, `Publisher work ${work.id} route`),
    );
    for (const section of work.sections ?? []) {
      if (!section.navigable) continue;
      activeRoutePaths.add(
        requireNonemptyString(
          section.route,
          `Publisher section ${section.id} route`,
        ),
      );
    }
  }
  const continuityRedirects = buildContinuityRedirects(
    sources,
    activeRoutePaths,
  );
  const publication: PublicationManifest = {
    $schema: PUBLICATION_SCHEMA_URL,
    schemaVersion: "1.0",
    publication: {
      id: "coherence-thesis",
      title: sources.catalog.siteTitle,
      description:
        "A living manuscript body on interpersonal coherence and thriving future societies.",
      language: "en",
      canonicalUrl: "https://www.coherence-thesis.com",
      publisher: {
        name: "GENII Foundation",
        url: "https://genii.foundation",
      },
    },
    engine: {
      compatibility: PUBLISHER_VERSION,
    },
    layout: {
      mode: "declared",
      overrides: {
        works: {
          root: worksRoot,
          manifestTemplate: "{workId}.json",
        },
        collections: {
          root: `${publisherRoot}/collections`,
          manifestTemplate: "{collectionId}.json",
        },
        assets: `${publisherRoot}/assets`,
        continuity: `${publisherRoot}/continuity`,
      },
    },
    works: works.map((work) => ({ id: work.id })),
    extensions: [
      {
        id: COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
        package: COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE,
        capabilities: COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
      },
    ],
    routes: {
      home: "/",
      work: "/manuscripts/{workId}/",
    },
    continuity: {
      redirects: continuityRedirects,
    },
    boundaries: {
      sourceRoots: [...sourceRoots].sort(),
      outputRoots: [".publisher"],
    },
    attribution: {
      placement: "footer",
      copyright: "Copyright 2026 GENII Foundation",
      text: "Published with GENII Publisher",
      url: "https://publisher.genii.foundation",
      sourceCodeUrl:
        "https://github.com/genii-foundation/coherence-thesis",
    },
  };

  const publicationShape = validatePublicationShape(publication);
  if (!publicationShape.valid) {
    throw new Error(
      formatDiagnostics("publication.json", publicationShape.diagnostics),
    );
  }
  works.forEach((work) => {
    const workShape = validateWorkShape(work);
    if (!workShape.valid) {
      throw new Error(
        formatDiagnostics(
          `Publisher work ${work.id}`,
          workShape.diagnostics,
        ),
      );
    }
  });

  const workManifests = new Map<string, WorkManifest>();
  works.forEach((work) => {
    workManifests.set(
      relativeToRepository(
        sources.paths.repoRoot,
        manifestPathForWork(sources.paths, work.id),
      ),
      work,
    );
  });
  const semanticResult = resolvePublicationSourcesForContentCompilation({
    publication,
    engineVersion: PUBLISHER_VERSION,
    workManifests,
    collectionManifests: new Map(),
  });
  if (!semanticResult.valid) {
    throw new Error(
      formatDiagnostics(
        "Publisher semantic graph",
        semanticResult.diagnostics,
      ),
    );
  }

  const publicationRelativePath = relativeToRepository(
    sources.paths.repoRoot,
    sources.paths.publicationManifestPath,
  );
  if (publicationRelativePath !== "publication.json") {
    throw new Error(
      `Publisher publication manifest must remain at publication.json, not ${publicationRelativePath}.`,
    );
  }
  const files: PublisherManifestFile[] = [
    Object.freeze({
      kind: "publication",
      absolutePath: sources.paths.publicationManifestPath,
      relativePath: publicationRelativePath,
      value: publication,
      text: serializeManifest(publication),
    }),
    ...works.map((work) => {
      const absolutePath = manifestPathForWork(sources.paths, work.id);
      return Object.freeze({
        kind: "work" as const,
        workId: work.id,
        absolutePath,
        relativePath: relativeToRepository(
          sources.paths.repoRoot,
          absolutePath,
        ),
        value: work,
        text: serializeManifest(work),
      });
    }),
  ];

  return Object.freeze({
    publication,
    works: Object.freeze(works),
    semanticGraph: semanticResult.value,
    files: Object.freeze(files),
    counts: Object.freeze({
      works: works.length,
      sections: representedSectionIds.size,
      files: files.length,
    }),
  });
}

function expectedWorkFileNames(
  manifestSet: PublisherManifestSet,
): ReadonlySet<string> {
  return new Set(manifestSet.works.map((work) => `${work.id}.json`));
}

function refuseUnexpectedWorkEntries(
  paths: PublisherManifestPaths,
  manifestSet: PublisherManifestSet,
): void {
  if (!fs.existsSync(paths.worksRoot)) {
    return;
  }
  const rootStat = fs.lstatSync(paths.worksRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(
      `Publisher works root must be a regular directory: ${paths.worksRoot}`,
    );
  }
  const expectedNames = expectedWorkFileNames(manifestSet);
  for (const entry of fs
    .readdirSync(paths.worksRoot, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    if (!expectedNames.has(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(
        `Unexpected Publisher work entry must be reviewed manually: ${path.join(paths.worksRoot, entry.name)}`,
      );
    }
  }
}

function refuseUnsafeOutputPath(
  paths: PublisherManifestPaths,
  outputPath: string,
): void {
  requirePathInside(paths.repoRoot, outputPath, "Publisher manifest output");
  const relativeSegments = path
    .relative(paths.repoRoot, outputPath)
    .split(path.sep)
    .filter(Boolean);
  let ancestor = paths.repoRoot;
  for (const segment of relativeSegments.slice(0, -1)) {
    ancestor = path.join(ancestor, segment);
    if (!fs.existsSync(ancestor)) {
      continue;
    }
    if (fs.lstatSync(ancestor).isSymbolicLink()) {
      throw new Error(
        `Publisher manifest output must not cross a symbolic link: ${ancestor}`,
      );
    }
  }
  const relative = relativeToRepository(paths.repoRoot, outputPath);
  if (
    relative === "editorial" ||
    relative.startsWith("editorial/") ||
    relative === "publishing" ||
    relative.startsWith("publishing/")
  ) {
    throw new Error(
      `Publisher manifest output must not write below editorial or publishing: ${relative}`,
    );
  }
}

function refuseSymbolicOutput(outputPath: string): void {
  if (!fs.existsSync(outputPath)) {
    return;
  }
  const stat = fs.lstatSync(outputPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(
      `Publisher manifest output must be a regular file: ${outputPath}`,
    );
  }
}

function checkManifestFiles(manifestSet: PublisherManifestSet): void {
  const missing: string[] = [];
  const stale: string[] = [];
  for (const file of manifestSet.files) {
    refuseSymbolicOutput(file.absolutePath);
    if (!fs.existsSync(file.absolutePath)) {
      missing.push(file.relativePath);
      continue;
    }
    if (fs.readFileSync(file.absolutePath, "utf8") !== file.text) {
      stale.push(file.relativePath);
    }
  }
  if (missing.length === 0 && stale.length === 0) {
    return;
  }
  const details = [
    ...missing.map((filePath) => `Missing: ${filePath}`),
    ...stale.map((filePath) => `Stale: ${filePath}`),
  ];
  throw new Error(`Publisher manifest check failed:\n${details.join("\n")}`);
}

type OriginalFileState = Readonly<{
  bytes: Buffer | null;
  mode: number;
}>;

function stagePathFor(targetPath: string, transactionId: string): string {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.publisher-stage-${transactionId}`,
  );
}

function writeManifestFiles(
  paths: PublisherManifestPaths,
  manifestSet: PublisherManifestSet,
): readonly string[] {
  const changed = manifestSet.files.filter(
    (file) =>
      !fs.existsSync(file.absolutePath) ||
      fs.readFileSync(file.absolutePath, "utf8") !== file.text,
  );
  if (changed.length === 0) {
    return [];
  }

  changed.forEach((file) => refuseUnsafeOutputPath(paths, file.absolutePath));
  changed.forEach((file) => refuseSymbolicOutput(file.absolutePath));
  const transactionId = `${process.pid}-${crypto.randomUUID()}`;
  const originals = new Map<string, OriginalFileState>();
  const staged = new Map<string, string>();
  const committed: string[] = [];

  try {
    for (const file of changed) {
      fs.mkdirSync(path.dirname(file.absolutePath), { recursive: true });
      const exists = fs.existsSync(file.absolutePath);
      const stat = exists ? fs.statSync(file.absolutePath) : undefined;
      originals.set(
        file.absolutePath,
        Object.freeze({
          bytes: exists ? fs.readFileSync(file.absolutePath) : null,
          mode: stat?.mode ?? 0o644,
        }),
      );
      const stagedPath = stagePathFor(file.absolutePath, transactionId);
      fs.writeFileSync(stagedPath, file.text, {
        encoding: "utf8",
        flag: "wx",
        mode: stat?.mode ?? 0o644,
      });
      staged.set(file.absolutePath, stagedPath);
    }

    for (const file of changed) {
      const stagedPath = staged.get(file.absolutePath);
      if (stagedPath === undefined) {
        throw new Error(
          `Publisher manifest transaction lost its staged file for ${file.relativePath}.`,
        );
      }
      fs.renameSync(stagedPath, file.absolutePath);
      staged.delete(file.absolutePath);
      committed.push(file.absolutePath);
    }
  } catch (error) {
    for (const targetPath of [...committed].reverse()) {
      const original = originals.get(targetPath);
      if (original?.bytes === null) {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        continue;
      }
      if (original !== undefined) {
        const restorePath = stagePathFor(
          targetPath,
          `${transactionId}-restore`,
        );
        fs.writeFileSync(restorePath, original.bytes, {
          flag: "wx",
          mode: original.mode,
        });
        fs.renameSync(restorePath, targetPath);
      }
    }
    for (const stagedPath of staged.values()) {
      if (fs.existsSync(stagedPath)) {
        fs.unlinkSync(stagedPath);
      }
    }
    throw error;
  }

  return Object.freeze(changed.map((file) => file.relativePath));
}

export function runPublisherManifestGeneration(options: {
  mode: PublisherManifestGenerationMode;
  paths?: Partial<PublisherManifestPaths>;
}): PublisherManifestGenerationResult {
  const sources = readPublisherManifestSources(options.paths);
  const manifestSet = createPublisherManifestSet(sources);
  manifestSet.files.forEach((file) =>
    refuseUnsafeOutputPath(sources.paths, file.absolutePath),
  );
  refuseUnexpectedWorkEntries(sources.paths, manifestSet);

  if (options.mode === "check") {
    checkManifestFiles(manifestSet);
    return Object.freeze({
      mode: options.mode,
      manifestSet,
      checkedFiles: Object.freeze(
        manifestSet.files.map((file) => file.relativePath),
      ),
      writtenFiles: Object.freeze([]),
    });
  }

  if (options.mode !== "write") {
    throw new Error(`Unknown Publisher manifest mode: ${String(options.mode)}`);
  }
  const writtenFiles = writeManifestFiles(sources.paths, manifestSet);
  checkManifestFiles(manifestSet);
  return Object.freeze({
    mode: options.mode,
    manifestSet,
    checkedFiles: Object.freeze(
      manifestSet.files.map((file) => file.relativePath),
    ),
    writtenFiles,
  });
}

function cliMode(args: readonly string[]): PublisherManifestGenerationMode {
  if (args.length === 0) {
    return "check";
  }
  if (args.length === 1 && args[0] === "--write") {
    return "write";
  }
  throw new Error(
    "Publisher manifest generation accepts no arguments for check mode or only --write for write mode.",
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const mode = cliMode(process.argv.slice(2));
    const result = runPublisherManifestGeneration({ mode });
    const action = mode === "write" ? "wrote and checked" : "checked";
    console.log(
      `Publisher manifests ${action} ${result.manifestSet.counts.works.toLocaleString("en-US")} works and ${result.manifestSet.counts.sections.toLocaleString("en-US")} sections across ${result.checkedFiles.length.toLocaleString("en-US")} files.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
