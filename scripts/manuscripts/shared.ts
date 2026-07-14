import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type {
  CompiledCatalog,
  CompiledChapter,
  CompiledPart,
  CompiledSection,
  CompiledVolume,
  ManuscriptFrontmatter,
  MarkdownDocument,
  OverviewDocument,
  SearchIndexEntry,
  RouteAliasConfig,
  SectionAlias,
  SectionAliasConfig,
  SectionLineageConfig,
  SectionLedger,
  SectionLedgerEntry,
  RouteLedger,
  RouteLedgerEntry,
  PublishedRouteResolution,
  VersionProvenanceManifest,
  VolumeConfig,
} from "./types";
import {
  normalizeNewlines,
  paragraphFingerprints,
  readingMinutes,
  readUtf8,
  sha256,
  stripMarkdown,
  wordCount,
} from "./io";
import {
  displayPartRouteSegment,
  displayPartTitle,
  isSyntheticFrontMatterPart,
  type VolumeLabelSource,
} from "../../src/lib/manuscript-labels";
import {
  aliasConfigPath,
  breadcrumbsDir,
  continuityRoot,
  editorialOverviewRoot,
  expectedVolumeManifestPaths,
  generatedCatalogPath,
  generatedImportReportsRoot,
  generatedManuscriptsRoot,
  generatedSectionsRoot,
  outlineDataPath,
  overviewPath,
  progressSectionsPath,
  publicDataRoot,
  readerSectionsPath,
  repoRoot,
  routeAliasConfigPath,
  routeLedgerPath,
  searchIndexPath,
  sectionLedgerPath,
  sectionLineagePath,
  versionProvenancePath,
} from "../repository/paths";
import { validateRepositoryLayout } from "../repository/layout";
import { enrichSemanticReferences } from "./semantic-references";

// Re-export the split modules so existing `from "./shared"` imports keep working
// (MAINT-05: shared.ts was one 770-line file; types live in ./types, filesystem
// and text helpers in ./io, and the pipeline builders remain here).
export type * from "./types";
export * from "./io";

export const manuscriptRoot = generatedSectionsRoot;
export const overviewRoot = editorialOverviewRoot;
export const seriesRoot = continuityRoot;
export const generatedRoot = generatedManuscriptsRoot;
export const catalogPath = generatedCatalogPath;
export const artifactsRoot = generatedImportReportsRoot;

export {
  aliasConfigPath,
  breadcrumbsDir,
  outlineDataPath,
  progressSectionsPath,
  publicDataRoot,
  readerSectionsPath,
  repoRoot,
  routeAliasConfigPath,
  routeLedgerPath,
  searchIndexPath,
  sectionLedgerPath,
  sectionLineagePath,
  versionProvenancePath,
};

export function markdownFiles(root = manuscriptRoot): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
        files.push(entryPath);
      }
    }
  };
  walk(root);
  return files.sort();
}

function parseYamlScalar(value: string): string | number | string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return JSON.parse(trimmed) as string[];
  }
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return JSON.parse(trimmed.replace(/^'/, "\"").replace(/'$/, "\""));
  }
  return trimmed;
}

export function parseFrontmatter(source: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const normalized = normalizeNewlines(source);
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Markdown file is missing frontmatter.");
  }
  const frontmatter: Record<string, unknown> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);
    frontmatter[key] = parseYamlScalar(value);
  }
  return { frontmatter, body: normalizeNewlines(match[2] ?? "") };
}

function yamlValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  return JSON.stringify(String(value ?? ""));
}

export function formatFrontmatter(frontmatter: Record<string, unknown>): string {
  const lines = Object.entries(frontmatter).map(
    ([key, value]) => `${key}: ${yamlValue(value)}`,
  );
  return `---\n${lines.join("\n")}\n---\n`;
}

function requireString(frontmatter: Record<string, unknown>, key: string): string {
  const value = frontmatter[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Frontmatter field '${key}' must be a nonempty string.`);
  }
  return value;
}

function requireNumber(frontmatter: Record<string, unknown>, key: string): number {
  const value = frontmatter[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Frontmatter field '${key}' must be a number.`);
  }
  return value;
}

export function readMarkdownDocuments(root = manuscriptRoot): MarkdownDocument[] {
  return markdownFiles(root).map((filePath) => {
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    try {
      return parseMarkdownDocument(filePath, relativePath);
    } catch (error) {
      // Name the offending file so a bad frontmatter block or a missing
      // required field is actionable instead of an anonymous failure (MAINT-03).
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`${relativePath}: ${reason}`);
    }
  });
}

function parseMarkdownDocument(
  filePath: string,
  relativePath: string,
): MarkdownDocument {
  const parsed = parseFrontmatter(readUtf8(filePath));
  const frontmatter: ManuscriptFrontmatter = {
    volumeId: requireString(parsed.frontmatter, "volumeId"),
      volumeTitle: requireString(parsed.frontmatter, "volumeTitle"),
      volumeOrder: requireNumber(parsed.frontmatter, "volumeOrder"),
      partId: requireString(parsed.frontmatter, "partId"),
      partTitle: requireString(parsed.frontmatter, "partTitle"),
      partOrder: requireNumber(parsed.frontmatter, "partOrder"),
      chapterId: requireString(parsed.frontmatter, "chapterId"),
      chapterTitle: requireString(parsed.frontmatter, "chapterTitle"),
      chapterOrder: requireNumber(parsed.frontmatter, "chapterOrder"),
      sectionId: requireString(parsed.frontmatter, "sectionId"),
      title: requireString(parsed.frontmatter, "title"),
      sectionOrder: requireNumber(parsed.frontmatter, "sectionOrder"),
      sourceDoc:
        typeof parsed.frontmatter.sourceDoc === "string"
          ? parsed.frontmatter.sourceDoc
          : undefined,
      sourceHash:
        typeof parsed.frontmatter.sourceHash === "string"
          ? parsed.frontmatter.sourceHash
          : undefined,
      sourceParagraphStart:
        typeof parsed.frontmatter.sourceParagraphStart === "number"
          ? parsed.frontmatter.sourceParagraphStart
          : undefined,
      sourceParagraphEnd:
        typeof parsed.frontmatter.sourceParagraphEnd === "number"
          ? parsed.frontmatter.sourceParagraphEnd
          : undefined,
      sourceLineNumbers:
        Array.isArray(parsed.frontmatter.sourceLineNumbers) &&
        parsed.frontmatter.sourceLineNumbers.every(
          (value) => typeof value === "number" && Number.isInteger(value),
        )
          ? (parsed.frontmatter.sourceLineNumbers as number[])
          : undefined,
    aliases: Array.isArray(parsed.frontmatter.aliases)
      ? (parsed.frontmatter.aliases as string[])
      : undefined,
  };
  return { filePath, relativePath, frontmatter, body: parsed.body };
}

type RouteSection = Pick<
  ManuscriptFrontmatter,
  | "volumeId"
  | "volumeOrder"
  | "partId"
  | "partTitle"
  | "partOrder"
  | "chapterId"
  | "sectionId"
>;

type RoutePart = Pick<
  ManuscriptFrontmatter,
  "volumeId" | "volumeOrder" | "partId" | "partTitle" | "partOrder"
>;

type VolumeRouteSource = {
  volumeId: string;
  volumeOrder?: number;
  order?: number;
};

type SectionHrefOptions = {
  chapterSectionCount?: number;
  partChapterCount?: number;
};

export function routeVolumesForDocuments(
  docs: MarkdownDocument[],
): Map<string, VolumeLabelSource> {
  const partMaps = new Map<string, Map<string, RoutePart>>();
  for (const doc of docs) {
    const fm = doc.frontmatter;
    const parts = partMaps.get(fm.volumeId) ?? new Map<string, RoutePart>();
    if (!parts.has(fm.partId)) {
      parts.set(fm.partId, {
        volumeId: fm.volumeId,
        volumeOrder: fm.volumeOrder,
        partId: fm.partId,
        partTitle: fm.partTitle,
        partOrder: fm.partOrder,
      });
    }
    partMaps.set(fm.volumeId, parts);
  }

  return new Map(
    [...partMaps].map(([volumeId, parts]) => [
      volumeId,
      { parts: [...parts.values()] },
    ]),
  );
}

function routeVolume(
  contexts: Map<string, VolumeLabelSource>,
  volumeId: string,
): VolumeLabelSource | undefined {
  return contexts.get(volumeId);
}

export function volumeRouteSegment(volume: VolumeRouteSource): string {
  const order = volume.volumeOrder ?? volume.order;
  return typeof order === "number" && Number.isInteger(order) && order > 0
    ? String(order)
    : volume.volumeId;
}

function partRouteSegment(section: RoutePart, volume?: VolumeLabelSource): string {
  if (section.partId === section.volumeId) return "main";
  return displayPartRouteSegment(section, volume);
}

function sectionRouteSegment(section: Pick<RouteSection, "sectionId">): string {
  return section.sectionId.replace(/^v\d+-/, "");
}

function partRouteSegments(section: RoutePart, volume?: VolumeLabelSource): string[] {
  return [volumeRouteSegment(section), partRouteSegment(section, volume)];
}

function chapterRouteSegments(
  section: RouteSection,
  volume?: VolumeLabelSource,
  options: SectionHrefOptions = {},
): string[] {
  if (section.chapterId === section.partId) {
    const route = partRouteSegments(section, volume);
    if ((options.partChapterCount ?? 0) > 1) route.push("chapter-start");
    return route;
  }
  return [...partRouteSegments(section, volume), section.chapterId];
}

function shouldOmitSectionRouteSegment(
  section: RouteSection,
  volume: VolumeLabelSource | undefined,
  options: SectionHrefOptions,
): boolean {
  const leaf = sectionRouteSegment(section);
  const previousSegment = chapterRouteSegments(section, volume, options).at(-1);
  if (leaf !== previousSegment) return false;
  if (options.chapterSectionCount !== 1) return false;
  if (section.chapterId === section.partId && (options.partChapterCount ?? 0) > 1) {
    return false;
  }
  return true;
}

export function sectionHref(
  section: RouteSection,
  volume?: VolumeLabelSource,
  options: SectionHrefOptions = {},
): string {
  const route = chapterRouteSegments(section, volume, options);
  if (!shouldOmitSectionRouteSegment(section, volume, options)) {
    const leaf = sectionRouteSegment(section);
    route.push(leaf === route.at(-1) ? "start" : leaf);
  }
  return `/manuscripts/${route.join("/")}/`;
}

function sectionReaderHref(
  section: RouteSection,
  chapterSectionCount: number,
  partChapterCount: number,
  volume?: VolumeLabelSource,
): string {
  const chapterRoute = chapterHref(section, volume, { partChapterCount });
  if (
    chapterSectionCount <= 1 ||
    (section.chapterId === section.partId && partChapterCount === 1)
  ) {
    return sectionHref(section, volume, { chapterSectionCount, partChapterCount });
  }
  return `${chapterRoute}#${section.sectionId}`;
}

export function chapterHref(
  section: RouteSection,
  volume?: VolumeLabelSource,
  options: SectionHrefOptions = {},
): string {
  const route = chapterRouteSegments(section, volume, options);
  return `/manuscripts/${route.join("/")}/`;
}

export function partHref(
  section: RoutePart,
  volume?: VolumeLabelSource,
): string {
  return `/manuscripts/${partRouteSegments(section, volume).join("/")}/`;
}

export function volumeHref(volume: VolumeRouteSource): string {
  return `/manuscripts/${volumeRouteSegment(volume)}/`;
}

// Canonical git subprocess runner for the build scripts. Throws on failure so
// callers choose their own fallback.
export function git(args: string[], cwd = repoRoot): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function getGitRevision(): string {
  try {
    return git(["rev-parse", "--short", "HEAD"]);
  } catch {
    return "uncommitted";
  }
}

export function sortDocuments(docs: MarkdownDocument[]): MarkdownDocument[] {
  return [...docs].sort((left, right) => {
    const fields: Array<keyof ManuscriptFrontmatter> = [
      "volumeOrder",
      "partOrder",
      "chapterOrder",
      "sectionOrder",
    ];
    for (const field of fields) {
      const l = left.frontmatter[field] as number;
      const r = right.frontmatter[field] as number;
      if (l !== r) return l - r;
    }
    return left.frontmatter.sectionId.localeCompare(right.frontmatter.sectionId);
  });
}

export function readOverview(): OverviewDocument {
  if (!fs.existsSync(overviewPath)) {
    return {
      title: "The Coherence Thesis",
      subtitle: "A five minute map of the current manuscript body.",
      readingMinutes: 5,
      nodes: [],
    };
  }
  return JSON.parse(readUtf8(overviewPath)) as OverviewDocument;
}

export function readVolumeConfigs(): VolumeConfig[] {
  validateRepositoryLayout();
  return expectedVolumeManifestPaths()
    .map(
      (manifestPath) =>
        JSON.parse(readUtf8(manifestPath)) as VolumeConfig,
    )
    .sort((left, right) => left.order - right.order);
}

export function readAliasConfig(): SectionAliasConfig {
  if (!fs.existsSync(aliasConfigPath)) return { version: 1, aliases: [] };
  return JSON.parse(readUtf8(aliasConfigPath)) as SectionAliasConfig;
}

export function readRouteAliasConfig(): RouteAliasConfig {
  if (!fs.existsSync(routeAliasConfigPath)) return { version: 1, aliases: [] };
  return JSON.parse(readUtf8(routeAliasConfigPath)) as RouteAliasConfig;
}

export function readSectionLineage(): SectionLineageConfig {
  if (!fs.existsSync(sectionLineagePath)) return { version: 1, sections: [] };
  return JSON.parse(readUtf8(sectionLineagePath)) as SectionLineageConfig;
}

export function validateSectionLineageConfig(
  catalog: CompiledCatalog,
  config: SectionLineageConfig = readSectionLineage(),
): void {
  if (config.version !== 1) {
    throw new Error("Section lineage must use version 1.");
  }
  const catalogIds = new Set(catalog.sections.map((section) => section.sectionId));
  const currentIds = new Set<string>();
  const identityOwners = new Map<string, string>();
  const claimIdentity = (identity: string, owner: string) => {
    const existingOwner = identityOwners.get(identity);
    if (existingOwner && existingOwner !== owner) {
      throw new Error(
        `Identity '${identity}' is owned by both '${existingOwner}' and '${owner}'.`,
      );
    }
    identityOwners.set(identity, owner);
  };
  for (const entry of config.sections) {
    if (currentIds.has(entry.currentSectionId)) {
      throw new Error(
        `Duplicate section lineage entry for '${entry.currentSectionId}'.`,
      );
    }
    currentIds.add(entry.currentSectionId);
    claimIdentity(entry.currentSectionId, entry.currentSectionId);
    if (!catalogIds.has(entry.currentSectionId)) {
      throw new Error(
        `Section lineage references missing current section '${entry.currentSectionId}'.`,
      );
    }
    if (entry.continuityIds.length === 0 || entry.continuityIds.some((id) => !id)) {
      throw new Error(
        `Section lineage '${entry.currentSectionId}' needs a continuity ID.`,
      );
    }
    if (new Set(entry.continuityIds).size !== entry.continuityIds.length) {
      throw new Error(
        `Section lineage '${entry.currentSectionId}' repeats a continuity ID.`,
      );
    }
    if (entry.progressContinuityGroups) {
      if (entry.progressContinuityGroups.length === 0) {
        throw new Error(
          `Section lineage '${entry.currentSectionId}' needs a progress continuity group.`,
        );
      }
      if (
        entry.progressContinuityGroups[0]?.[0] !== entry.continuityIds[0]
      ) {
        throw new Error(
          `Section lineage '${entry.currentSectionId}' must begin its progress continuity groups with the primary continuity ID.`,
        );
      }
      const progressIds = new Set<string>();
      const continuityIds = new Set(entry.continuityIds);
      for (const group of entry.progressContinuityGroups) {
        if (group.length === 0) {
          throw new Error(
            `Section lineage '${entry.currentSectionId}' has an empty progress continuity group.`,
          );
        }
        for (const id of group) {
          if (!continuityIds.has(id)) {
            throw new Error(
              `Section lineage '${entry.currentSectionId}' uses unknown progress continuity ID '${id}'.`,
            );
          }
          if (progressIds.has(id)) {
            throw new Error(
              `Section lineage '${entry.currentSectionId}' repeats progress continuity ID '${id}'.`,
            );
          }
          progressIds.add(id);
        }
      }
    }
    if (
      new Set(entry.historicalSectionIds).size !==
      entry.historicalSectionIds.length
    ) {
      throw new Error(
        `Section lineage '${entry.currentSectionId}' repeats a historical section ID.`,
      );
    }
    for (const historicalId of entry.historicalSectionIds) {
      claimIdentity(historicalId, entry.currentSectionId);
    }
    for (const continuityId of entry.continuityIds) {
      claimIdentity(continuityId, entry.currentSectionId);
    }
  }
  const missing = catalog.sections
    .map((section) => section.sectionId)
    .filter((sectionId) => !currentIds.has(sectionId));
  if (missing.length > 0) {
    throw new Error(
      `Section lineage is missing ${missing.length.toLocaleString()} current section(s), starting with '${missing[0]}'. Run npm run manuscripts:preserve-links before compiling.`,
    );
  }
}

export function readVersionProvenance(): VersionProvenanceManifest {
  if (!fs.existsSync(versionProvenancePath)) {
    return { version: 1, generatedAt: new Date(0).toISOString(), entries: [] };
  }
  return JSON.parse(readUtf8(versionProvenancePath)) as VersionProvenanceManifest;
}

export function readSectionLedger(): SectionLedger {
  if (!fs.existsSync(sectionLedgerPath)) {
    return { version: 1, routes: [] };
  }
  return JSON.parse(readUtf8(sectionLedgerPath)) as SectionLedger;
}

export function readRouteLedger(): RouteLedger {
  if (!fs.existsSync(routeLedgerPath)) {
    throw new Error(
      "Route ledger is missing. Restore publishing/continuity/route-ledger.json before compiling.",
    );
  }
  const parsed = JSON.parse(readUtf8(routeLedgerPath)) as RouteLedger;
  if (parsed.version !== 2) {
    throw new Error(
      `Route ledger version ${parsed.version} is unsupported. Expected version 2.`,
    );
  }
  return parsed;
}

// Union the current catalog's section routes into the existing ledger and sort
// deterministically. Historical entries are never dropped, so the result is
// stable input for both the committed artifact and the drift check.
export function buildSectionLedger(
  catalog: CompiledCatalog,
  existing: SectionLedger = readSectionLedger(),
): SectionLedger {
  const routes = new Map<string, SectionLedgerEntry>();
  const add = (entry: SectionLedgerEntry) => {
    routes.set(JSON.stringify([entry.sectionId, entry.href]), {
      sectionId: entry.sectionId,
      href: entry.href,
    });
  };
  for (const entry of existing.routes) add(entry);
  for (const section of catalog.sections) {
    add({ sectionId: section.sectionId, href: section.href });
  }
  const sorted = [...routes.values()].sort((a, b) =>
    a.href === b.href
      ? a.sectionId.localeCompare(b.sectionId)
      : a.href.localeCompare(b.href),
  );
  return { version: existing.version || 1, routes: sorted };
}

export function sectionContinuityIds(
  section: Pick<
    CompiledSection,
    "sectionId" | "continuityId" | "legacyContinuityIds"
  >,
): string[] {
  return [
    ...new Set([
      section.continuityId || section.sectionId,
      ...(section.legacyContinuityIds ?? []),
    ]),
  ].sort();
}

function continuityIdsForSections(
  catalog: CompiledCatalog,
  sectionIds: string[],
): string[] {
  const wanted = new Set(sectionIds);
  return [
    ...new Set(
      catalog.sections
        .filter((section) => wanted.has(section.sectionId))
        .flatMap(sectionContinuityIds),
    ),
  ].sort();
}

function normalizePublishedHref(href: string): string {
  const [pathPart, fragment] = href.split("#", 2);
  const normalizedPath = pathPart === "/" || pathPart?.endsWith("/")
    ? pathPart
    : `${pathPart}/`;
  return fragment ? `${normalizedPath}#${fragment}` : normalizedPath ?? href;
}

function routeVariants(catalog: CompiledCatalog, href: string): string[] {
  const [pathPart, fragment] = normalizePublishedHref(href).split("#", 2);
  const segments = (pathPart ?? "").split("/").filter(Boolean);
  if (segments[0] !== "manuscripts" || !segments[1]) return [href];
  const volume = catalog.volumes.find((candidate) => {
    const canonical = candidate.href.split("/").filter(Boolean)[1];
    return canonical === segments[1] || candidate.volumeId === segments[1];
  });
  if (!volume) return [href];
  const canonical = volume.href.split("/").filter(Boolean)[1] ?? volume.volumeId;
  return [...new Set([canonical, volume.volumeId])].map((segment) => {
    const next = [...segments];
    next[1] = segment;
    const pathHref = `/${next.join("/")}/`;
    return fragment ? `${pathHref}#${fragment}` : pathHref;
  });
}

const canonicalResolutionCache = new WeakMap<
  CompiledCatalog,
  Map<string, PublishedRouteResolution>
>();

type PublishedRouteIndexes = {
  routeAliasByPath: Map<string, CompiledCatalog["routeAliases"][number]>;
  sectionAliasByPath: Map<string, CompiledCatalog["aliases"][number]>;
  sectionById: Map<string, CompiledSection>;
  directReaderByHref: Map<string, CompiledSection>;
  sectionsByContinuityId: Map<string, CompiledSection[]>;
};

const publishedRouteIndexCache = new WeakMap<
  CompiledCatalog,
  PublishedRouteIndexes
>();

function publishedRouteIndexes(catalog: CompiledCatalog): PublishedRouteIndexes {
  const cached = publishedRouteIndexCache.get(catalog);
  if (cached) return cached;
  const routeAliasByPath = new Map<
    string,
    CompiledCatalog["routeAliases"][number]
  >();
  for (const alias of catalog.routeAliases ?? []) {
    for (const variant of routeVariants(catalog, alias.sourceHref)) {
      routeAliasByPath.set(normalizePublishedHref(variant), alias);
    }
  }
  const sectionAliasByPath = new Map<
    string,
    CompiledCatalog["aliases"][number]
  >();
  for (const alias of catalog.aliases) {
    for (const variant of routeVariants(catalog, alias.sourceHref)) {
      sectionAliasByPath.set(normalizePublishedHref(variant), alias);
    }
  }
  const sectionById = new Map(
    catalog.sections.map((section) => [section.sectionId, section]),
  );
  const directReaderByHref = new Map(
    catalog.sections.flatMap((section) =>
      typeof section.readerHref === "string" && section.readerHref
        ? [[normalizePublishedHref(section.readerHref), section] as const]
        : [],
    ),
  );
  const sectionsByContinuityId = new Map<string, CompiledSection[]>();
  for (const section of catalog.sections) {
    for (const id of sectionContinuityIds(section)) {
      const matches = sectionsByContinuityId.get(id) ?? [];
      matches.push(section);
      sectionsByContinuityId.set(id, matches);
    }
  }
  const indexes = {
    routeAliasByPath,
    sectionAliasByPath,
    sectionById,
    directReaderByHref,
    sectionsByContinuityId,
  };
  publishedRouteIndexCache.set(catalog, indexes);
  return indexes;
}

function canonicalRouteResolutions(
  catalog: CompiledCatalog,
): Map<string, PublishedRouteResolution> {
  const cached = canonicalResolutionCache.get(catalog);
  if (cached) return cached;
  const routes = new Map<string, PublishedRouteResolution>();
  const add = (
    href: string,
    kind: PublishedRouteResolution["kind"],
    targetContinuityIds: string[],
    targetHref = href,
  ) => {
    for (const variant of routeVariants(catalog, href)) {
      routes.set(normalizePublishedHref(variant), {
        href: normalizePublishedHref(variant),
        kind,
        targetContinuityIds: [...new Set(targetContinuityIds)].sort(),
        targetHref,
      });
    }
  };

  // Runtime resolution prefers sections over chapters and parts. Adding the
  // broadest routes first and sections last reproduces that precedence.
  for (const volume of catalog.volumes) {
    add(
      volume.href,
      "volume",
      continuityIdsForSections(catalog, volume.sectionIds),
    );
    for (const part of volume.parts) {
      add(part.href, "part", continuityIdsForSections(catalog, part.sectionIds));
      for (const chapter of part.chapters) {
        if (chapter.href === part.href) continue;
        add(
          chapter.href,
          "chapter",
          continuityIdsForSections(catalog, chapter.sectionIds),
        );
      }
    }
  }
  for (const section of catalog.sections) {
    add(section.href, "section", sectionContinuityIds(section));
  }
  canonicalResolutionCache.set(catalog, routes);
  return routes;
}

export function resolvePublishedRoute(
  catalog: CompiledCatalog,
  href: string,
): PublishedRouteResolution | undefined {
  const normalized = normalizePublishedHref(href);
  const [pathHref, fragment] = normalized.split("#", 2);
  const canonical = canonicalRouteResolutions(catalog);
  const indexes = publishedRouteIndexes(catalog);
  const routeAlias = indexes.routeAliasByPath.get(pathHref ?? normalized);
  if (routeAlias) {
    const target = canonical.get(normalizePublishedHref(routeAlias.targetHref));
    if (!target) return undefined;
    return {
      href: normalized,
      kind: "route-alias",
      targetContinuityIds: target.targetContinuityIds,
      targetHref: routeAlias.targetHref,
    };
  }
  const canonicalAtPath = canonical.get(pathHref ?? normalized);
  const sectionAlias =
    canonicalAtPath?.kind === "section"
      ? undefined
      : indexes.sectionAliasByPath.get(pathHref ?? normalized);
  if (sectionAlias) {
    const section = indexes.sectionById.get(sectionAlias.targetSectionId);
    if (!section) return undefined;
    return {
      href: normalized,
      kind: fragment ? "reader" : "section-alias",
      targetContinuityIds: sectionContinuityIds(section),
      targetHref: section.readerHref,
    };
  }

  if (fragment) {
    const directReader = indexes.directReaderByHref.get(normalized);
    if (directReader) {
      return {
        href: normalized,
        kind: "reader",
        targetContinuityIds: sectionContinuityIds(directReader),
        targetHref: directReader.readerHref,
      };
    }
    const base = canonical.get(pathHref ?? normalized);
    if (!base) return undefined;
    const baseSections = [
      ...new Map(
        base.targetContinuityIds
          .flatMap((id) => indexes.sectionsByContinuityId.get(id) ?? [])
          .map((section) => [section.sectionId, section]),
      ).values(),
    ];
    const legacyTarget = baseSections.find((section) => {
      const sectionIds = [section.sectionId, ...(section.legacySectionIds ?? [])];
      return (
        (sectionIds.some(
          (sectionId) =>
            fragment === sectionId || fragment.startsWith(`${sectionId}-p-`),
        ) ||
          (/^p-(?:\d+|h[0-9a-f]{16}(?:-\d+)?)$/.test(fragment) &&
            baseSections.length === 1))
      );
    });
    if (!legacyTarget) return undefined;
    return {
      href: normalized,
      kind: "reader",
      targetContinuityIds: sectionContinuityIds(legacyTarget),
      targetHref: legacyTarget.readerHref,
    };
  }
  return canonical.get(normalized);
}

export function currentPublishedRoutes(
  catalog: CompiledCatalog,
): RouteLedgerEntry[] {
  const routes = new Map<string, RouteLedgerEntry>();
  const add = (entry: RouteLedgerEntry) => {
    const normalized: RouteLedgerEntry = {
      href: normalizePublishedHref(entry.href),
      kind: entry.kind,
      targetContinuityIds: [...new Set(entry.targetContinuityIds)].sort(),
    };
    const key = JSON.stringify([
      normalized.href,
      normalized.kind,
      normalized.targetContinuityIds,
    ]);
    routes.set(key, normalized);
  };
  for (const resolution of canonicalRouteResolutions(catalog).values()) {
    add(resolution);
  }
  for (const alias of catalog.aliases) {
    for (const variant of routeVariants(catalog, alias.sourceHref)) {
      const resolved = resolvePublishedRoute(catalog, variant);
      if (resolved) add(resolved);
    }
  }
  for (const alias of catalog.routeAliases ?? []) {
    for (const variant of routeVariants(catalog, alias.sourceHref)) {
      const resolved = resolvePublishedRoute(catalog, variant);
      if (resolved) add(resolved);
    }
  }
  for (const section of catalog.sections) {
    if (!section.readerHref?.includes("#")) continue;
    const resolved = resolvePublishedRoute(catalog, section.readerHref);
    if (resolved) add(resolved);
  }
  return [...routes.values()];
}

export function buildRouteLedger(
  catalog: CompiledCatalog,
  existing: RouteLedger = readRouteLedger(),
  sectionLedger: SectionLedger = readSectionLedger(),
): RouteLedger {
  const routes = new Map<string, RouteLedgerEntry>();
  const add = (entry: RouteLedgerEntry) => {
    const normalized: RouteLedgerEntry = {
      href: normalizePublishedHref(entry.href),
      kind: entry.kind,
      targetContinuityIds: [...new Set(entry.targetContinuityIds)].sort(),
    };
    const key = JSON.stringify([
      normalized.href,
      normalized.kind,
      normalized.targetContinuityIds,
    ]);
    routes.set(key, normalized);
  };
  for (const entry of existing.routes) add(entry);
  for (const entry of currentPublishedRoutes(catalog)) add(entry);
  for (const entry of sectionLedger.routes) {
    const resolved = resolvePublishedRoute(catalog, entry.href);
    if (resolved) add(resolved);
  }
  return {
    version: 2,
    routes: [...routes.values()].sort(
      (left, right) =>
        left.href.localeCompare(right.href) ||
        left.kind.localeCompare(right.kind) ||
        left.targetContinuityIds.join("\0").localeCompare(
          right.targetContinuityIds.join("\0"),
        ),
    ),
  };
}

export function audioVersionId(sectionId: string, contentHash: string): string {
  return `${sectionId}-${contentHash}`;
}

function routeFromHref(href: string): SectionAlias["sourceRoute"] {
  const route = href
    .replace(/^\/manuscripts\//, "")
    .replace(/\/$/, "")
    .split("/");
  const [volumeId, partId, chapterIdOrSectionId, sectionId] = route;
  if (!volumeId || route.length > 4) {
    throw new Error(`Alias sourceHref must be a manuscript route: ${href}`);
  }
  if (!partId) {
    return {
      volumeId,
      partId: volumeId,
      chapterId: volumeId,
      sectionId: volumeId,
    };
  }
  if (!chapterIdOrSectionId) {
    return {
      volumeId,
      partId: volumeId,
      chapterId: volumeId,
      sectionId: partId,
    };
  }
  return {
    volumeId,
    partId,
    chapterId: sectionId ? chapterIdOrSectionId : partId,
    sectionId: sectionId ?? chapterIdOrSectionId,
  };
}

function fullDepthSectionHref(section: Pick<
  ManuscriptFrontmatter,
  "volumeId" | "partId" | "chapterId" | "sectionId"
>): string {
  return `/manuscripts/${section.volumeId}/${section.partId}/${section.chapterId}/${section.sectionId}/`;
}

function legacySectionHref(
  section: RouteSection,
  volume?: VolumeLabelSource,
): string {
  const route = [section.volumeId];
  if (section.partId !== section.volumeId) {
    route.push(displayPartRouteSegment(section, volume));
  }
  if (section.chapterId !== section.partId) route.push(section.chapterId);
  route.push(section.sectionId);
  return `/manuscripts/${route.join("/")}/`;
}

function canonicalVolumeLegacySectionHref(
  section: RouteSection,
  volume?: VolumeLabelSource,
): string {
  const route = chapterRouteSegments(section, volume);
  route.push(section.sectionId);
  return `/manuscripts/${route.join("/")}/`;
}

function canonicalVolumeRepeatedSectionHref(
  section: RouteSection,
  volume?: VolumeLabelSource,
): string {
  const route = chapterRouteSegments(section, volume);
  route.push(sectionRouteSegment(section));
  return `/manuscripts/${route.join("/")}/`;
}

const STRUCTURAL_PART_OPENER_WORD_LIMIT = 75;

function structuralPartOpenerIds(
  docs: MarkdownDocument[],
  chapterSectionCounts: Map<string, number>,
  partChapters: Map<string, Set<string>>,
): Set<string> {
  const firstChapterOrderByPart = new Map<string, number>();
  for (const doc of docs) {
    const fm = doc.frontmatter;
    const partKey = `${fm.volumeId}:${fm.partId}`;
    firstChapterOrderByPart.set(
      partKey,
      Math.min(firstChapterOrderByPart.get(partKey) ?? Infinity, fm.chapterOrder),
    );
  }

  return new Set(
    docs
      .filter((doc) => {
        const fm = doc.frontmatter;
        const chapterKey = `${fm.volumeId}:${fm.partId}:${fm.chapterId}`;
        const partKey = `${fm.volumeId}:${fm.partId}`;
        return (
          fm.title === fm.partTitle &&
          fm.title === fm.chapterTitle &&
          chapterSectionCounts.get(chapterKey) === 1 &&
          (partChapters.get(partKey)?.size ?? 0) > 1 &&
          fm.chapterOrder === firstChapterOrderByPart.get(partKey) &&
          wordCount(doc.body) <= STRUCTURAL_PART_OPENER_WORD_LIMIT
        );
      })
      .map((doc) => doc.frontmatter.sectionId),
  );
}

function historicalSectionAliasInputs(
  ledger: RouteLedger,
  sections: CompiledSection[],
  volumes: CompiledVolume[],
): SectionAliasConfig["aliases"] {
  const sectionsByContinuityId = new Map<string, CompiledSection[]>();
  for (const section of sections) {
    for (const continuityId of sectionContinuityIds(section)) {
      const owners = sectionsByContinuityId.get(continuityId) ?? [];
      owners.push(section);
      sectionsByContinuityId.set(continuityId, owners);
    }
  }

  const claimsByRoute = new Map<
    string,
    {
      complete: boolean;
      sourceHrefs: Set<string>;
      targetSectionIds: Set<string>;
    }
  >();
  for (const entry of ledger.routes) {
    if (
      entry.kind !== "section" &&
      entry.kind !== "section-alias" &&
      entry.kind !== "reader"
    ) {
      continue;
    }
    const sourceHref = normalizePublishedHref(entry.href).split("#", 1)[0]!;
    const variants = routeVariants(
      { volumes } as CompiledCatalog,
      sourceHref,
    ).sort();
    const routeKey = variants.join("\0");
    const claim = claimsByRoute.get(routeKey) ?? {
      complete: true,
      sourceHrefs: new Set<string>(),
      targetSectionIds: new Set<string>(),
    };
    claim.sourceHrefs.add(sourceHref);
    for (const continuityId of entry.targetContinuityIds) {
      const owners = sectionsByContinuityId.get(continuityId) ?? [];
      if (owners.length !== 1) {
        claim.complete = false;
        continue;
      }
      claim.targetSectionIds.add(owners[0]!.sectionId);
    }
    if (entry.targetContinuityIds.length === 0) claim.complete = false;
    claimsByRoute.set(routeKey, claim);
  }

  return [...claimsByRoute.values()]
    .filter(
      (claim) => claim.complete && claim.targetSectionIds.size === 1,
    )
    .flatMap((claim) =>
      [...claim.sourceHrefs].map((sourceHref) => ({
        sourceHref,
        targetSectionId: [...claim.targetSectionIds][0]!,
        note: "Generated from reviewed continuity ownership in the route ledger.",
      })),
    )
    .sort((left, right) => left.sourceHref.localeCompare(right.sourceHref));
}

export function buildCatalog(
  root = manuscriptRoot,
  {
    aliasConfig = readAliasConfig(),
    routeAliasConfig = readRouteAliasConfig(),
    sectionLineage = readSectionLineage(),
    routeLedger = readRouteLedger(),
    semanticReferences = "apply",
  }: {
    aliasConfig?: SectionAliasConfig;
    routeAliasConfig?: RouteAliasConfig;
    sectionLineage?: SectionLineageConfig;
    routeLedger?: RouteLedger;
    semanticReferences?: "apply" | "omit";
  } = {},
): CompiledCatalog {
  const docs = sortDocuments(readMarkdownDocuments(root));
  const lineageByCurrentId = new Map(
    sectionLineage.sections.map((entry) => [entry.currentSectionId, entry]),
  );
  const provenanceByHash = new Map(
    readVersionProvenance().entries.map((entry) => [entry.contentHash, entry]),
  );
  const volumeConfigs = new Map(
    readVolumeConfigs().map((volume) => [volume.volumeId, volume]),
  );
  const routeContexts = routeVolumesForDocuments(docs);
  const rawChapterSectionCounts = docs.reduce((counts, doc) => {
    const key = `${doc.frontmatter.volumeId}:${doc.frontmatter.partId}:${doc.frontmatter.chapterId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const rawPartChapters = docs.reduce((chapters, doc) => {
    const key = `${doc.frontmatter.volumeId}:${doc.frontmatter.partId}`;
    const partChapters = chapters.get(key) ?? new Set<string>();
    partChapters.add(doc.frontmatter.chapterId);
    chapters.set(key, partChapters);
    return chapters;
  }, new Map<string, Set<string>>());
  const skippedStructuralOpenerIds = structuralPartOpenerIds(
    docs,
    rawChapterSectionCounts,
    rawPartChapters,
  );
  const publishedDocs = docs.filter(
    (doc) => !skippedStructuralOpenerIds.has(doc.frontmatter.sectionId),
  );
  const chapterSectionCounts = publishedDocs.reduce((counts, doc) => {
    const key = `${doc.frontmatter.volumeId}:${doc.frontmatter.partId}:${doc.frontmatter.chapterId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const partChapters = publishedDocs.reduce((chapters, doc) => {
    const key = `${doc.frontmatter.volumeId}:${doc.frontmatter.partId}`;
    const chaptersInPart = chapters.get(key) ?? new Set<string>();
    chaptersInPart.add(doc.frontmatter.chapterId);
    chapters.set(key, chaptersInPart);
    return chapters;
  }, new Map<string, Set<string>>());
  const sections = publishedDocs.map((doc, index) => {
    const words = wordCount(doc.body);
    const contentHash = sha256(normalizeNewlines(doc.body)).slice(0, 16);
    const provenance = provenanceByHash.get(contentHash);
    const chapterKey = `${doc.frontmatter.volumeId}:${doc.frontmatter.partId}:${doc.frontmatter.chapterId}`;
    const chapterSectionCount = chapterSectionCounts.get(chapterKey) ?? 1;
    const partKey = `${doc.frontmatter.volumeId}:${doc.frontmatter.partId}`;
    const partChapterCount = partChapters.get(partKey)?.size ?? 1;
    const volume = routeVolume(routeContexts, doc.frontmatter.volumeId);
    const lineage = lineageByCurrentId.get(doc.frontmatter.sectionId);
    const continuityIds = lineage?.continuityIds.filter(Boolean) ?? [];
    const primaryContinuityId = continuityIds[0] ?? doc.frontmatter.sectionId;
    const progressContinuityGroups = lineage?.progressContinuityGroups?.length
      ? lineage.progressContinuityGroups.map((group) => [...group])
      : [
          [primaryContinuityId],
          ...continuityIds.slice(1).map((id) => [id]),
        ];
    return {
      ...doc.frontmatter,
      continuityId: primaryContinuityId,
      legacyContinuityIds: continuityIds.slice(1),
      progressContinuityGroups,
      legacySectionIds: lineage?.historicalSectionIds ?? [],
      path: doc.relativePath,
      href: sectionHref(doc.frontmatter, volume, {
        chapterSectionCount,
        partChapterCount,
      }),
      chapterHref: chapterHref(doc.frontmatter, volume, { partChapterCount }),
      readerHref: sectionReaderHref(
        doc.frontmatter,
        chapterSectionCount,
        partChapterCount,
        volume,
      ),
      body: doc.body,
      text: stripMarkdown(doc.body),
      paragraphs: paragraphFingerprints(doc.body),
      wordCount: words,
      readingMinutes: readingMinutes(words),
      contentHash,
      versionHash: contentHash,
      versionDate: provenance?.versionDate ?? "",
      versionUrl: provenance?.pullRequestUrl ?? provenance?.commitUrl ?? "",
      audioVersionId: audioVersionId(doc.frontmatter.sectionId, contentHash),
      previousSectionId: publishedDocs[index - 1]?.frontmatter.sectionId ?? null,
      nextSectionId: publishedDocs[index + 1]?.frontmatter.sectionId ?? null,
    } satisfies CompiledSection;
  });

  const volumeMap = new Map<string, CompiledVolume>();
  const chapterMap = new Map<string, CompiledChapter>();
  const partMap = new Map<string, CompiledPart>();

  for (const section of sections) {
    let volume = volumeMap.get(section.volumeId);
    if (!volume) {
      const config = volumeConfigs.get(section.volumeId);
      volume = {
        volumeId: section.volumeId,
        title: config?.title ?? section.volumeTitle,
        subtitle: config?.subtitle ?? "",
        order: section.volumeOrder,
        numberLabel: config?.numberLabel ?? String(section.volumeOrder),
        planet: config?.planet ?? "",
        coverImage: config?.coverImage ?? "/art/coherence-thesis-vol5-cover.png",
        coverAlt:
          config?.coverAlt ??
          `Cover artwork for ${section.volumeTitle}, part of The Coherence Thesis.`,
        href: volumeHref(config ?? section),
        parts: [],
        sectionIds: [],
        wordCount: 0,
      };
      volumeMap.set(section.volumeId, volume);
    }

    const partKey = `${section.volumeId}:${section.partId}`;
    let part = partMap.get(partKey);
    if (!part) {
      part = {
        partId: section.partId,
        title: section.partTitle,
        order: section.partOrder,
        href: partHref(section, routeVolume(routeContexts, section.volumeId)),
        chapters: [],
        sectionIds: [],
        wordCount: 0,
      };
      partMap.set(partKey, part);
      volume.parts.push(part);
    }

    const chapterKey = `${section.volumeId}:${section.partId}:${section.chapterId}`;
    let chapter = chapterMap.get(chapterKey);
    if (!chapter) {
      chapter = {
        chapterId: section.chapterId,
        title: section.chapterTitle,
        order: section.chapterOrder,
        href: section.chapterHref,
        sectionIds: [],
        wordCount: 0,
      };
      chapterMap.set(chapterKey, chapter);
      part.chapters.push(chapter);
    }

    volume.sectionIds.push(section.sectionId);
    volume.wordCount += section.wordCount;
    part.sectionIds.push(section.sectionId);
    part.wordCount += section.wordCount;
    chapter.sectionIds.push(section.sectionId);
    chapter.wordCount += section.wordCount;
  }

  const volumes = [...volumeMap.values()]
    .sort((left, right) => left.order - right.order)
    .map((volume) => ({
      ...volume,
      parts: volume.parts
        .sort((left, right) => left.order - right.order)
        .map((part) => ({
          ...part,
          chapters: part.chapters.sort((left, right) => left.order - right.order),
        })),
    }));

  const wordTotal = sections.reduce((sum, section) => sum + section.wordCount, 0);
  const partCount = volumes.reduce((sum, volume) => sum + volume.parts.length, 0);
  const chapterCount = volumes.reduce(
    (sum, volume) =>
      sum + volume.parts.reduce((partSum, part) => partSum + part.chapters.length, 0),
    0,
  );
  const sectionById = new Map(sections.map((section) => [section.sectionId, section]));
  const aliasInputs = [...aliasConfig.aliases];
  const addAlias = (
    sourceHref: string,
    targetSectionId: string,
    note: string,
  ) => {
    if (aliasInputs.some((alias) => alias.sourceHref === sourceHref)) return;
    aliasInputs.push({ sourceHref, targetSectionId, note });
  };

  for (const [index, doc] of docs.entries()) {
    if (!skippedStructuralOpenerIds.has(doc.frontmatter.sectionId)) continue;
    const target = docs.slice(index + 1).find(
      (candidate) =>
        candidate.frontmatter.volumeId === doc.frontmatter.volumeId &&
        candidate.frontmatter.partId === doc.frontmatter.partId &&
        !skippedStructuralOpenerIds.has(candidate.frontmatter.sectionId),
    );
    if (!target) {
      throw new Error(
        `Structural opener '${doc.frontmatter.sectionId}' has no content section in its part.`,
      );
    }
    const fm = doc.frontmatter;
    const chapterKey = `${fm.volumeId}:${fm.partId}:${fm.chapterId}`;
    const partKey = `${fm.volumeId}:${fm.partId}`;
    const volume = routeVolume(routeContexts, fm.volumeId);
    const targetSectionId = target.frontmatter.sectionId;
    const note = "Generated alias for a removed structural part opener.";
    const sourceHrefs = new Set([
      sectionHref(fm, volume, {
        chapterSectionCount: rawChapterSectionCounts.get(chapterKey) ?? 1,
        partChapterCount: rawPartChapters.get(partKey)?.size ?? 1,
      }),
      fullDepthSectionHref(fm),
      legacySectionHref(fm, volume),
      canonicalVolumeLegacySectionHref(fm, volume),
      canonicalVolumeRepeatedSectionHref(fm, volume),
      ...(fm.aliases ?? []),
    ]);
    for (const sourceHref of sourceHrefs) {
      addAlias(sourceHref, targetSectionId, note);
    }
  }
  for (const section of sections) {
    for (const sourceHref of section.aliases ?? []) {
      addAlias(
        sourceHref,
        section.sectionId,
        "Generated alias for a skipped subtitle-only opener route.",
      );
    }
  }
  for (const section of sections) {
    const sourceHref = fullDepthSectionHref(section);
    if (sourceHref === section.href) continue;
    addAlias(
      sourceHref,
      section.sectionId,
      "Generated alias for the former full depth route.",
    );
  }
  for (const section of sections) {
    const volume = routeVolume(routeContexts, section.volumeId);
    const sourceHref = legacySectionHref(section, volume);
    if (sourceHref === section.href) continue;
    addAlias(
      sourceHref,
      section.sectionId,
      "Generated alias for the former title-based volume route.",
    );
  }
  for (const section of sections) {
    const volume = routeVolume(routeContexts, section.volumeId);
    const sourceHref = canonicalVolumeLegacySectionHref(section, volume);
    if (sourceHref === section.href) continue;
    addAlias(
      sourceHref,
      section.sectionId,
      "Generated alias for the former volume-prefixed section slug.",
    );
  }
  for (const section of sections) {
    const volume = routeVolume(routeContexts, section.volumeId);
    const sourceHref = canonicalVolumeRepeatedSectionHref(section, volume);
    if (sourceHref === section.href) continue;
    addAlias(
      sourceHref,
      section.sectionId,
      "Generated alias for the repeated section slug route.",
    );
  }

  const occupiedAliasVariants = new Set(
    aliasInputs.flatMap((alias) =>
      routeVariants({ volumes } as CompiledCatalog, alias.sourceHref),
    ),
  );
  const configuredRouteAliasVariants = new Set(
    routeAliasConfig.aliases.flatMap((alias) =>
      routeVariants({ volumes } as CompiledCatalog, alias.sourceHref),
    ),
  );
  const canonicalRouteVariants = new Set(
    volumes.flatMap((volume) =>
      [
        volume.href,
        ...volume.parts.flatMap((part) => [
          part.href,
          ...part.chapters.map((chapter) => chapter.href),
        ]),
        ...sections
          .filter((section) => section.volumeId === volume.volumeId)
          .map((section) => section.href),
      ].flatMap((href) =>
        routeVariants({ volumes } as CompiledCatalog, href),
      ),
    ),
  );
  for (const alias of historicalSectionAliasInputs(
    routeLedger,
    sections,
    volumes,
  )) {
    const variants = routeVariants(
      { volumes } as CompiledCatalog,
      alias.sourceHref,
    );
    if (
      variants.some(
        (variant) =>
          occupiedAliasVariants.has(variant) ||
          configuredRouteAliasVariants.has(variant) ||
          canonicalRouteVariants.has(variant),
      )
    ) {
      continue;
    }
    addAlias(alias.sourceHref, alias.targetSectionId, alias.note ?? "");
    for (const variant of variants) occupiedAliasVariants.add(variant);
  }

  const aliases = aliasInputs.map((alias) => {
    const target = sectionById.get(alias.targetSectionId);
    if (!target) {
      throw new Error(
        `Alias targetSectionId '${alias.targetSectionId}' does not exist.`,
      );
    }
    return {
      ...alias,
      targetHref: target.href,
      sourceRoute: routeFromHref(alias.sourceHref),
    };
  });

  const sectionAliasTargetsByVariant = new Map<string, string>();
  for (const alias of aliases) {
    for (const variant of routeVariants(
      { volumes } as CompiledCatalog,
      alias.sourceHref,
    )) {
      const currentTarget = sectionAliasTargetsByVariant.get(variant);
      if (currentTarget && currentTarget !== alias.targetSectionId) {
        throw new Error(
          `Equivalent section alias route '${variant}' targets both '${currentTarget}' and '${alias.targetSectionId}'.`,
        );
      }
      sectionAliasTargetsByVariant.set(variant, alias.targetSectionId);
    }
  }

  const canonicalHrefs = new Set<string>();
  for (const volume of volumes) {
    canonicalHrefs.add(volume.href);
    for (const part of volume.parts) {
      canonicalHrefs.add(part.href);
      for (const chapter of part.chapters) canonicalHrefs.add(chapter.href);
    }
  }
  for (const section of sections) canonicalHrefs.add(section.href);
  const servedCanonicalHrefs = new Set(
    [...canonicalHrefs].flatMap((href) =>
      routeVariants({ volumes } as CompiledCatalog, href),
    ),
  );
  const canonicalSectionTargetsByVariant = new Map<string, string>();
  for (const section of sections) {
    for (const variant of routeVariants(
      { volumes } as CompiledCatalog,
      section.href,
    )) {
      canonicalSectionTargetsByVariant.set(variant, section.sectionId);
    }
  }
  for (const alias of aliases) {
    for (const variant of routeVariants(
      { volumes } as CompiledCatalog,
      alias.sourceHref,
    )) {
      if (!servedCanonicalHrefs.has(variant)) continue;
      const canonicalTarget = canonicalSectionTargetsByVariant.get(variant);
      if (canonicalTarget === alias.targetSectionId) continue;
      throw new Error(
        `Section alias sourceHref '${alias.sourceHref}' conflicts with canonical route variant '${variant}'.`,
      );
    }
  }
  const sectionAliasSources = new Set(
    aliases.flatMap((alias) =>
      routeVariants({ volumes } as CompiledCatalog, alias.sourceHref),
    ),
  );
  const routeAliasesBySource = new Map<string, RouteAliasConfig["aliases"][number]>();
  const addRouteAlias = (
    sourceHref: string,
    targetHref: string,
    note: string,
  ) => {
    if (sourceHref === targetHref) return;
    const existing = routeAliasesBySource.get(sourceHref);
    if (existing && existing.targetHref !== targetHref) {
      throw new Error(
        `Route alias source '${sourceHref}' targets both '${existing.targetHref}' and '${targetHref}'.`,
      );
    }
    routeAliasesBySource.set(sourceHref, existing ?? { sourceHref, targetHref, note });
  };
  for (const alias of routeAliasConfig.aliases) {
    addRouteAlias(alias.sourceHref, alias.targetHref, alias.note ?? "Reviewed route alias.");
  }
  for (const volume of volumes) {
    const volumeSegments = [
      ...new Set([
        volume.href.split("/").filter(Boolean)[1] ?? volume.volumeId,
        volume.volumeId,
      ]),
    ];
    for (const part of volume.parts) {
      if (isSyntheticFrontMatterPart(part)) {
        for (const segment of volumeSegments) {
          addRouteAlias(
            `/manuscripts/${segment}/front-matter/`,
            part.href,
            "Generated alias for a former front matter part route.",
          );
          for (const chapter of part.chapters) {
            if (chapter.href === part.href) continue;
            addRouteAlias(
              `/manuscripts/${segment}/front-matter/${chapter.chapterId}/`,
              chapter.href,
              "Generated alias for a former front matter chapter route.",
            );
          }
        }
      }
      if (part.partId === volume.volumeId) {
        for (const segment of volumeSegments) {
          addRouteAlias(
            `/manuscripts/${segment}/${part.partId}/`,
            part.href,
            "Generated alias for a former implicit part route.",
          );
          addRouteAlias(
            `/manuscripts/${segment}/part-${part.partId}/`,
            part.href,
            "Generated alias for a former prefixed part route.",
          );
        }
      }
    }
  }
  const routeAliases = [...routeAliasesBySource.values()];
  const routeAliasSources = new Set<string>();
  const routeAliasTargetsByVariant = new Map<string, string>();
  for (const alias of routeAliases) {
    const sourceVariants = routeVariants(
      { volumes } as CompiledCatalog,
      alias.sourceHref,
    );
    const sourceDepth = alias.sourceHref.split("/").filter(Boolean).length;
    if (
      !alias.sourceHref.startsWith("/manuscripts/") ||
      sourceDepth < 3 ||
      alias.sourceHref.includes("?") ||
      alias.sourceHref.includes("#") ||
      !alias.sourceHref.endsWith("/")
    ) {
      throw new Error(
        `Route alias sourceHref must be a non-volume manuscript route: ${alias.sourceHref}`,
      );
    }
    if (
      alias.targetHref.includes("?") ||
      alias.targetHref.includes("#") ||
      !alias.targetHref.endsWith("/")
    ) {
      throw new Error(
        `Route alias targetHref must be a canonical manuscript route: ${alias.targetHref}`,
      );
    }
    if (
      sourceVariants.some(
        (variant) =>
          servedCanonicalHrefs.has(variant) || sectionAliasSources.has(variant),
      )
    ) {
      throw new Error(
        `Route alias sourceHref '${alias.sourceHref}' conflicts with a current route.`,
      );
    }
    if (routeAliasSources.has(alias.sourceHref)) {
      throw new Error(`Duplicate route alias sourceHref '${alias.sourceHref}'.`);
    }
    for (const variant of sourceVariants) {
      const currentTarget = routeAliasTargetsByVariant.get(variant);
      if (currentTarget && currentTarget !== alias.targetHref) {
        throw new Error(
          `Equivalent route alias source '${variant}' targets both '${currentTarget}' and '${alias.targetHref}'.`,
        );
      }
      routeAliasTargetsByVariant.set(variant, alias.targetHref);
    }
    if (!canonicalHrefs.has(alias.targetHref)) {
      throw new Error(
        `Route alias targetHref '${alias.targetHref}' must be a current canonical route.`,
      );
    }
    routeAliasSources.add(alias.sourceHref);
  }

  const outputSections =
    semanticReferences === "apply"
      ? enrichSemanticReferences(sections, volumes)
      : sections;

  return {
    siteTitle: "The Coherence Thesis",
    generatedFrom: "canonical markdown",
    gitRevision: getGitRevision(),
    stats: {
      volumeCount: volumes.length,
      partCount,
      chapterCount,
      sectionCount: sections.length,
      wordCount: wordTotal,
      readingMinutes: readingMinutes(wordTotal),
    },
    volumes,
    sections: outputSections,
    aliases,
    routeAliases,
    overview: readOverview(),
  };
}

export function buildSearchIndex(catalog: CompiledCatalog): SearchIndexEntry[] {
  return catalog.sections.map((section) => {
    const volume = catalog.volumes.find(
      (candidate) => candidate.volumeId === section.volumeId,
    );

    return {
      sectionId: section.sectionId,
      href: section.readerHref,
      readerHref: section.readerHref,
      title: section.title,
      volumeTitle: section.volumeTitle,
      partTitle: displayPartTitle(section, volume),
      chapterTitle: section.chapterTitle,
      wordCount: section.wordCount,
      contentHash: section.contentHash,
      text: section.text,
    };
  });
}
