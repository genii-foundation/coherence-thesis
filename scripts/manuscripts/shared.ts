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
  SectionAlias,
  SectionAliasConfig,
  SectionLedger,
  SectionLedgerEntry,
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
  type VolumeLabelSource,
} from "../../src/lib/manuscript-labels";

// Re-export the split modules so existing `from "./shared"` imports keep working
// (MAINT-05: shared.ts was one 770-line file; types live in ./types, filesystem
// and text helpers in ./io, and the pipeline builders remain here).
export type * from "./types";
export * from "./io";

export const repoRoot = path.resolve(import.meta.dirname, "../..");
export const contentRoot = path.join(repoRoot, "content");
export const manuscriptRoot = path.join(contentRoot, "manuscripts");
export const overviewRoot = path.join(contentRoot, "overview");
export const seriesRoot = path.join(contentRoot, "series");
export const volumeConfigPath = path.join(seriesRoot, "volumes.json");
export const aliasConfigPath = path.join(seriesRoot, "aliases.json");
export const versionProvenancePath = path.join(seriesRoot, "version-provenance.json");
export const sectionLedgerPath = path.join(seriesRoot, "section-ledger.json");
export const generatedRoot = path.join(repoRoot, "src/generated/manuscripts");
export const catalogPath = path.join(generatedRoot, "catalog.json");
export const publicDataRoot = path.join(repoRoot, "public/data");
export const readerSectionsPath = path.join(publicDataRoot, "reader-sections.json");
export const progressSectionsPath = path.join(publicDataRoot, "progress-sections.json");
export const breadcrumbsDir = path.join(publicDataRoot, "breadcrumbs");
export const searchIndexPath = path.join(publicDataRoot, "search-index.json");
export const outlineDataPath = path.join(publicDataRoot, "outline.json");
export const artifactsRoot = path.join(repoRoot, "artifacts/imports");

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
): string[] {
  if (section.chapterId === section.partId) return partRouteSegments(section, volume);
  return [...partRouteSegments(section, volume), section.chapterId];
}

function shouldOmitSectionRouteSegment(
  section: RouteSection,
  volume: VolumeLabelSource | undefined,
  options: SectionHrefOptions,
): boolean {
  const leaf = sectionRouteSegment(section);
  const previousSegment = chapterRouteSegments(section, volume).at(-1);
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
  const route = chapterRouteSegments(section, volume);
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
  const chapterRoute = chapterHref(section, volume);
  if (chapterSectionCount <= 1) {
    return sectionHref(section, volume, { chapterSectionCount, partChapterCount });
  }
  return `${chapterRoute}#${section.sectionId}`;
}

export function chapterHref(
  section: RouteSection,
  volume?: VolumeLabelSource,
): string {
  const route = chapterRouteSegments(section, volume);
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
  const overviewPath = path.join(overviewRoot, "coherence-thesis.json");
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
  if (!fs.existsSync(volumeConfigPath)) return [];
  return (JSON.parse(readUtf8(volumeConfigPath)) as VolumeConfig[]).sort(
    (left, right) => left.order - right.order,
  );
}

export function readAliasConfig(): SectionAliasConfig {
  if (!fs.existsSync(aliasConfigPath)) return { version: 1, aliases: [] };
  return JSON.parse(readUtf8(aliasConfigPath)) as SectionAliasConfig;
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

export function audioVersionId(sectionId: string, contentHash: string): string {
  return `${sectionId}-${contentHash}`;
}

function routeFromHref(href: string): SectionAlias["sourceRoute"] {
  const route = href
    .replace(/^\/manuscripts\//, "")
    .replace(/\/$/, "")
    .split("/");
  const [volumeId, partId, chapterIdOrSectionId, sectionId] = route;
  if (!volumeId || !partId || route.length > 4) {
    throw new Error(`Alias sourceHref must be a section route: ${href}`);
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

export function buildCatalog(root = manuscriptRoot): CompiledCatalog {
  const docs = sortDocuments(readMarkdownDocuments(root));
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
    return {
      ...doc.frontmatter,
      path: doc.relativePath,
      href: sectionHref(doc.frontmatter, volume, {
        chapterSectionCount,
        partChapterCount,
      }),
      chapterHref: chapterHref(doc.frontmatter, volume),
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
        href: chapterHref(section, routeVolume(routeContexts, section.volumeId)),
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
  const aliasInputs = [...readAliasConfig().aliases];
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
    sections,
    aliases,
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
