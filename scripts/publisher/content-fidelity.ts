import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BuiltPublicationReader } from "@genii-foundation/publisher/node";
import { compileMarkdownWork } from "@genii-foundation/publisher-content";

import type {
  CompiledCatalog,
  CompiledSection,
} from "../manuscripts/types";
import type { SemanticLinkRegistry } from "../editorial/semantic-links";
import { createCoherenceReaderStateMigrationBootstrapExtensionRegistration } from "../../src/publisher/reader-state-migration-extension";
import {
  aliasConfigPath,
  editorialCorpusRoot,
  expectedVolumeManifestPaths,
  generatedCatalogPath,
  generatedManuscriptsRoot,
  generatedSectionsRoot,
  overviewPath,
  repoRoot,
  routeAliasConfigPath,
  routeLedgerPath,
  sectionLineagePath,
  semanticLinksPath,
  versionProvenancePath,
} from "../repository/paths";
import {
  createPublisherManifestSet,
  readPublisherManifestSources,
  type PublisherManuscriptSource,
} from "./manifests";
import {
  createPublisherReaderBuild,
  defaultPublisherReaderBuildPaths,
} from "./reader-build";
import * as manuscriptIoImport from "../manuscripts/io";
import * as manuscriptSharedImport from "../manuscripts/shared";
import * as semanticReferencesImport from "../manuscripts/semantic-references";
import * as semanticLinksImport from "../editorial/semantic-links";
import * as markdownInlineImport from "../../src/lib/markdown-inline";
import * as markdownBlocksImport from "../../src/lib/markdown-blocks";

function moduleExports<T>(value: unknown): T {
  if (
    value &&
    typeof value === "object" &&
    "default" in value &&
    (value as { default?: unknown }).default
  ) {
    return (value as { default: T }).default;
  }
  return value as T;
}

const {
  normalizeNewlines,
  paragraphFingerprints,
  sha256,
  stripMarkdown,
  wordCount,
} = moduleExports<typeof import("../manuscripts/io")>(manuscriptIoImport);
const { buildCatalog } = moduleExports<typeof import("../manuscripts/shared")>(
  manuscriptSharedImport,
);
const {
  applySemanticReferences,
  planSemanticReferenceBodyEdits,
} = moduleExports<typeof import("../manuscripts/semantic-references")>(
  semanticReferencesImport,
);
const { readSemanticLinkRegistry } = moduleExports<
  typeof import("../editorial/semantic-links")
>(semanticLinksImport);
const {
  inlineMarkdownVisibleText,
  parseInlineMarkdown,
  visitInlineMarkdown,
} = moduleExports<typeof import("../../src/lib/markdown-inline")>(
  markdownInlineImport,
);
const { splitMarkdownBlocks } = moduleExports<
  typeof import("../../src/lib/markdown-blocks")
>(markdownBlocksImport);

const EXPECTED_WORK_COUNT = 9;
const EXPECTED_SECTION_COUNT = 525;
const EXPECTED_BLOCK_COUNT = 3_486;
const EXPECTED_ACTIVE_ROUTE_COUNT = 535;
const EXPECTED_REDIRECT_COUNT = 518;
const EXPECTED_SEMANTIC_REDIRECT_COUNT = 259;
const EXPECTED_COMPANION_REDIRECT_COUNT = 259;
const EXPECTED_OMITTED_PART_COUNT = 47;
const EXPECTED_CATALOG_WORD_COUNT = 202_137;
const EXPECTED_PUBLISHER_WORD_COUNT = 206_448;
const EXPECTED_WORD_DELTA = 4_311;

export type MarkdownLink = Readonly<{
  label: string;
  destination: string;
  markdown: string;
  rawStart: number;
  rawEnd: number;
}>;

export type CatalogLinkEvidence = MarkdownLink &
  Readonly<{
    sectionId: string;
    blockIndex: number;
  }>;

export type ReaderLinkEvidence = MarkdownLink &
  Readonly<{
    workId: string;
    sectionId: string;
    sourcePath: string;
    blockId: string;
    sourceStartOffset: number;
    sourceEndOffset: number;
  }>;

export type CanonicalManuscriptInput = Readonly<{
  workId: string;
  editorialId: string;
  sourcePath: string;
  bytes: Uint8Array;
  text: string;
}>;

export type ContentFidelityAuthorities = Readonly<{
  built: BuiltPublicationReader;
  catalog: CompiledCatalog;
  rawCatalog: CompiledCatalog;
  redirects: BuiltPublicationReader["reader"]["routes"]["redirects"];
  semanticRegistry: SemanticLinkRegistry;
  manuscripts: readonly CanonicalManuscriptInput[];
}>;

export type CensusAuthorityPathInput = Readonly<{
  repositoryRoot: string;
  authorityPath: string;
  kind: "file" | "directory";
  label: string;
}>;

export type TitleMatterPrefixEvidence = Readonly<{
  workId: string;
  firstSectionId: string;
  sourceParagraphStart: number;
  provenanceBlockCount: number;
  provenanceWordCount: number;
  visibleBodyPrefixBlockCount: number;
  visibleBodyPrefixWordCount: number;
  provenanceSha256: string;
}>;

export type SemanticCatalogOnlyEvidence = Readonly<{
  occurrenceId: string;
  sourceSectionId: string;
  targetSectionId: string;
  paragraphAnchor: string;
  label: string;
  destination: string;
  catalogBlockIndex: number;
  readerBlockId: string;
  sourceRawStart: number;
  sourceRawEnd: number;
}>;

export type ContentFidelityReport = Readonly<{
  schemaVersion: 1;
  status: "reviewed-known-gaps";
  parity: false;
  reader: Readonly<{
    buildId: string;
    contentBuildId: string;
    workCount: number;
    sectionCount: number;
    blockCount: number;
    wordCount: number;
  }>;
  catalog: Readonly<{
    path: string;
    workCount: number;
    sectionCount: number;
    wordCount: number;
  }>;
  coverage: Readonly<{
    workCount: number;
    sectionCount: number;
    routeCount: number;
    sectionRouteCount: number;
    redirectCount: number;
    semanticRedirectCount: number;
    companionRedirectCount: number;
    redirectsSha256: string;
    continuityCount: number;
    sourceOrderCount: number;
    sourceSpanBlockCount: number;
    canonicalManuscriptCount: number;
    activeRoutesSha256: string;
    omittedPartCount: number;
    omittedPartRoutesSha256: string;
    hierarchyRoles: Readonly<{
      chapter: number;
      section: number;
    }>;
    hierarchySha256: string;
    bodyProjection: Readonly<{
      sectionCount: number;
      missingSectionIds: readonly string[];
      bodyBlockCount: number;
      matchedBodyBlockCount: number;
      bodyWordCount: number;
      matchedBeforeRangeBlockCount: number;
      matchedInsideRangeBlockCount: number;
      matchedAfterRangeBlockCount: number;
      unmatchedBeforeRangeBlockCount: number;
      unmatchedInsideRangeBlockCount: number;
      unmatchedAfterRangeBlockCount: number;
      projectionSha256: string;
    }>;
    workIds: readonly string[];
    sectionIdsSha256: string;
    routesSha256: string;
    continuitySha256: string;
    sourceOrderSha256: string;
    canonicalManuscripts: readonly Readonly<{
      workId: string;
      editorialId: string;
      sourcePath: string;
      rawByteLength: number;
      rawSha256: string;
      blockCount: number;
    }>[];
  }>;
  knownGaps: Readonly<{
    words: Readonly<{
      catalog: number;
      publisher: number;
      delta: number;
    }>;
    titleMatterPrefix: Readonly<{
      provenanceBlockCount: number;
      provenanceWordCount: number;
      visibleBodyPrefixBlockCount: number;
      visibleBodyPrefixWordCount: number;
      works: readonly TitleMatterPrefixEvidence[];
    }>;
    semanticLinkFidelity: Readonly<{
      preparedCatalogLinkCount: number;
      rawCatalogLinkCount: number;
      publisherReaderLinkCount: number;
      canonicalSource: Readonly<{
        linkCount: number;
        sourceSectionCount: number;
        destinationCount: number;
        workIds: readonly string[];
        sourceSectionIds: readonly string[];
        destinations: readonly string[];
        identitySha256: string;
        sourceSpanSha256: string;
      }>;
      generatedCatalogOnly: Readonly<{
        linkCount: number;
        sourceSectionCount: number;
        targetSectionCount: number;
        destinationCount: number;
        registryOccurrenceCount: number;
        sourceSectionIds: readonly string[];
        targetSectionIds: readonly string[];
        destinations: readonly string[];
        identitySha256: string;
        occurrenceEvidenceSha256: string;
        evidence: readonly SemanticCatalogOnlyEvidence[];
      }>;
    }>;
  }>;
}>;

type MarkdownBlockRange = Readonly<{
  value: string;
  rawStart: number;
  rawEnd: number;
}>;

type LinkIdentity = Readonly<{
  sectionId: string;
  label: string;
  destination: string;
  markdown: string;
}>;

function fail(message: string): never {
  throw new Error(`Publisher content fidelity census failed: ${message}`);
}

function repositorySafeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const resolvedRoot = path.resolve(repoRoot);
  return message
    .replaceAll(`${resolvedRoot}${path.sep}`, "")
    .replaceAll(resolvedRoot, ".");
}

function readCensusAuthority<T>(label: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    fail(`${label} could not be read: ${repositorySafeError(error)}`);
  }
}

async function readCensusAuthorityAsync<T>(
  label: string,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    fail(`${label} could not be read: ${repositorySafeError(error)}`);
  }
}

function repositoryRelativeLabel(
  repositoryRoot: string,
  authorityPath: string,
): string {
  const relative = path.relative(
    path.resolve(repositoryRoot),
    path.resolve(authorityPath),
  );
  return (relative || ".").replaceAll("\\", "/");
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

export function assertCensusAuthorityPath({
  repositoryRoot,
  authorityPath,
  kind,
  label,
}: CensusAuthorityPathInput): void {
  const resolvedRoot = path.resolve(repositoryRoot);
  const resolvedAuthority = path.resolve(authorityPath);
  const displayPath = repositoryRelativeLabel(resolvedRoot, resolvedAuthority);
  if (!isWithin(resolvedRoot, resolvedAuthority)) {
    fail(`${label} must remain inside the repository.`);
  }
  const relative = path.relative(resolvedRoot, resolvedAuthority);
  let cursor = resolvedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    let status: fs.Stats;
    try {
      status = fs.lstatSync(cursor);
    } catch {
      fail(`${label} '${displayPath}' does not exist.`);
    }
    if (status.isSymbolicLink()) {
      fail(`${label} '${displayPath}' must not contain a symbolic path segment.`);
    }
  }
  const status = fs.lstatSync(resolvedAuthority);
  if (kind === "file" && !status.isFile()) {
    fail(`${label} '${displayPath}' must be a regular file.`);
  }
  if (kind === "directory" && !status.isDirectory()) {
    fail(`${label} '${displayPath}' must be a directory.`);
  }
  const realRoot = fs.realpathSync(resolvedRoot);
  const realAuthority = fs.realpathSync(resolvedAuthority);
  if (!isWithin(realRoot, realAuthority)) {
    fail(`${label} '${displayPath}' resolves outside the repository.`);
  }
}

function assertCensusAuthorityTree(
  repositoryRoot: string,
  authorityRoot: string,
  label: string,
): void {
  assertCensusAuthorityPath({
    repositoryRoot,
    authorityPath: authorityRoot,
    kind: "directory",
    label,
  });
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        fail(
          `${label} '${repositoryRelativeLabel(repositoryRoot, entryPath)}' must not be symbolic.`,
        );
      }
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        fail(
          `${label} '${repositoryRelativeLabel(repositoryRoot, entryPath)}' must be a regular file.`,
        );
      }
    }
  };
  walk(authorityRoot);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

function exact(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(canonicalValue(actual)) === JSON.stringify(canonicalValue(expected))) return;
  fail(
    `${label} drifted. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
  );
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    fail(`${label} must be a nonnegative integer.`);
  }
  return value as number;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a nonempty string.`);
  }
  return value;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function digest(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function linkIdentity(link: CatalogLinkEvidence | ReaderLinkEvidence): LinkIdentity {
  return {
    sectionId: link.sectionId,
    label: link.label,
    destination: link.destination,
    markdown: link.markdown,
  };
}

function identityKey(link: LinkIdentity): string {
  return JSON.stringify(link);
}

function linkIdentityDigest(
  links: readonly (CatalogLinkEvidence | ReaderLinkEvidence)[],
): string {
  return digest(links.map((link) => identityKey(linkIdentity(link))).sort());
}

function linkIdentityCounts(
  links: readonly (CatalogLinkEvidence | ReaderLinkEvidence)[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const link of links) {
    const key = identityKey(linkIdentity(link));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function assertSameLinkMultiset(
  left: readonly (CatalogLinkEvidence | ReaderLinkEvidence)[],
  right: readonly (CatalogLinkEvidence | ReaderLinkEvidence)[],
  label: string,
): void {
  exact(
    [...linkIdentityCounts(left)].sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey),
    ),
    [...linkIdentityCounts(right)].sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey),
    ),
    label,
  );
}

function subtractLinkMultiset(
  all: readonly CatalogLinkEvidence[],
  remove: readonly CatalogLinkEvidence[],
): CatalogLinkEvidence[] {
  const remaining = linkIdentityCounts(remove);
  const result: CatalogLinkEvidence[] = [];
  for (const link of all) {
    const key = identityKey(linkIdentity(link));
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
    } else {
      result.push(link);
    }
  }
  const leftovers = [...remaining].filter(([, count]) => count !== 0);
  if (leftovers.length > 0) {
    fail("the raw catalog contains links absent from the prepared catalog.");
  }
  return result;
}

export function extractMarkdownLinks(markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const nodes = parseInlineMarkdown(markdown);
  visitInlineMarkdown(nodes, (node) => {
    if (node.type !== "link") return;
    links.push({
      label: inlineMarkdownVisibleText(node.children),
      destination: node.destination,
      markdown: markdown.slice(node.rawStart, node.rawEnd),
      rawStart: node.rawStart,
      rawEnd: node.rawEnd,
    });
  });
  return links;
}

function markdownBlockRanges(markdown: string): MarkdownBlockRange[] {
  const ranges: MarkdownBlockRange[] = [];
  let cursor = 0;
  for (const value of splitMarkdownBlocks(markdown)) {
    const rawStart = markdown.indexOf(value, cursor);
    if (rawStart < 0) fail("a Markdown block could not be mapped to its body.");
    const rawEnd = rawStart + value.length;
    ranges.push({ value, rawStart, rawEnd });
    cursor = rawEnd;
  }
  return ranges;
}

function catalogLinks(catalog: CompiledCatalog): CatalogLinkEvidence[] {
  return catalog.sections.flatMap((section) =>
    splitMarkdownBlocks(section.body).flatMap((block, blockIndex) =>
      extractMarkdownLinks(block).map((link) => ({
        ...link,
        sectionId: section.sectionId,
        blockIndex,
      })),
    ),
  );
}

function expectedContinuity(section: CompiledSection): unknown {
  return {
    id: section.continuityId,
    legacyIds: section.legacyContinuityIds,
    progressGroups: section.progressContinuityGroups,
    historicalSectionIds: section.legacySectionIds,
  };
}

function readerLinksAndSourceCoverage(
  authorities: ContentFidelityAuthorities,
): Readonly<{
  links: readonly ReaderLinkEvidence[];
  sourceSpanBlockCount: number;
  blocksBySourcePath: ReadonlyMap<string, number>;
}> {
  const sourceByPath = new Map(
    authorities.manuscripts.map((source) => [source.sourcePath, source]),
  );
  const links: ReaderLinkEvidence[] = [];
  const blocksBySourcePath = new Map<string, number>();
  let sourceSpanBlockCount = 0;

  for (const work of authorities.built.content.works) {
    for (const section of work.sections) {
      for (const block of section.blocks) {
        const source = sourceByPath.get(block.provenance.sourcePath);
        if (!source) {
          fail(
            `Reader block '${block.id}' names unknown canonical source '${block.provenance.sourcePath}'.`,
          );
        }
        const startOffset = block.provenance.start.offset;
        const endOffset = block.provenance.end.offset;
        if (
          !Number.isInteger(startOffset) ||
          !Number.isInteger(endOffset) ||
          startOffset < 0 ||
          endOffset <= startOffset ||
          endOffset > source.text.length
        ) {
          fail(`Reader block '${block.id}' has invalid canonical source offsets.`);
        }
        exact(
          source.text.slice(startOffset, endOffset),
          block.markdown,
          `canonical source span for Reader block '${block.id}'`,
        );
        sourceSpanBlockCount += 1;
        blocksBySourcePath.set(
          source.sourcePath,
          (blocksBySourcePath.get(source.sourcePath) ?? 0) + 1,
        );
        for (const link of extractMarkdownLinks(block.markdown)) {
          links.push({
            ...link,
            workId: work.id,
            sectionId: section.id,
            sourcePath: source.sourcePath,
            blockId: block.id,
            sourceStartOffset: startOffset + link.rawStart,
            sourceEndOffset: startOffset + link.rawEnd,
          });
        }
      }
    }
  }

  return { links, sourceSpanBlockCount, blocksBySourcePath };
}

function sectionById(
  sections: readonly CompiledSection[],
  sectionId: string,
): CompiledSection {
  const matches = sections.filter((section) => section.sectionId === sectionId);
  if (matches.length !== 1) {
    fail(
      `section '${sectionId}' has ${matches.length.toLocaleString()} catalog owners.`,
    );
  }
  return matches[0]!;
}

function semanticCatalogOnlyEvidence(
  authorities: ContentFidelityAuthorities,
  catalogOnlyLinks: readonly CatalogLinkEvidence[],
): SemanticCatalogOnlyEvidence[] {
  const expectedEnriched = applySemanticReferences({
    sections: authorities.rawCatalog.sections,
    volumes: authorities.rawCatalog.volumes,
    registry: authorities.semanticRegistry,
  });
  exact(
    authorities.catalog.sections.map(({ sectionId, body }) => ({ sectionId, body })),
    expectedEnriched.map(({ sectionId, body }) => ({ sectionId, body })),
    "prepared catalog semantic reference projection",
  );

  const remainingLinks = new Map<string, CatalogLinkEvidence[]>();
  for (const link of catalogOnlyLinks) {
    const key = identityKey(linkIdentity(link));
    const values = remainingLinks.get(key) ?? [];
    values.push(link);
    remainingLinks.set(key, values);
  }
  for (const values of remainingLinks.values()) {
    values.sort(
      (left, right) =>
        left.blockIndex - right.blockIndex || left.rawStart - right.rawStart,
    );
  }

  const readerSections = new Map(
    authorities.built.content.works.flatMap((work) =>
      work.sections.map((section) => [section.id, section] as const),
    ),
  );
  const evidence: SemanticCatalogOnlyEvidence[] = [];
  const edits = planSemanticReferenceBodyEdits({
    sections: authorities.rawCatalog.sections,
    volumes: authorities.rawCatalog.volumes,
    registry: authorities.semanticRegistry,
  });

  for (const edit of edits) {
    const rawSection = sectionById(
      authorities.rawCatalog.sections,
      edit.sourceSectionId,
    );
    const rawLabel = rawSection.body.slice(edit.rawStart, edit.rawEnd);
    const label = inlineMarkdownVisibleText(parseInlineMarkdown(rawLabel));
    const expectedMarkdown = `[${rawLabel}](${edit.href})`;
    const key = identityKey({
      sectionId: edit.sourceSectionId,
      label,
      destination: edit.href,
      markdown: expectedMarkdown,
    });
    const candidates = remainingLinks.get(key) ?? [];
    const catalogLink = candidates.shift();
    if (!catalogLink) {
      fail(
        `approved semantic occurrence '${edit.occurrenceId}' is absent from the prepared catalog.`,
      );
    }

    const range = markdownBlockRanges(rawSection.body).find(
      (candidate) =>
        edit.rawStart >= candidate.rawStart && edit.rawEnd <= candidate.rawEnd,
    );
    if (!range) {
      fail(
        `approved semantic occurrence '${edit.occurrenceId}' has no raw catalog block.`,
      );
    }
    const readerSection = readerSections.get(edit.sourceSectionId);
    if (!readerSection) {
      fail(
        `approved semantic occurrence '${edit.occurrenceId}' has no Publisher Reader section.`,
      );
    }
    const readerBlocks = readerSection.blocks.filter(
      (block) => block.markdown === range.value,
    );
    if (readerBlocks.length !== 1) {
      fail(
        `approved semantic occurrence '${edit.occurrenceId}' maps to ${readerBlocks.length.toLocaleString()} Publisher Reader blocks.`,
      );
    }
    const readerBlock = readerBlocks[0]!;
    const localStart = edit.rawStart - range.rawStart;
    const localEnd = edit.rawEnd - range.rawStart;
    exact(
      readerBlock.markdown.slice(localStart, localEnd),
      rawLabel,
      `raw Reader text for approved semantic occurrence '${edit.occurrenceId}'`,
    );
    const overlappingReaderLink = extractMarkdownLinks(readerBlock.markdown).find(
      (link) => localStart < link.rawEnd && localEnd > link.rawStart,
    );
    if (overlappingReaderLink) {
      fail(
        `approved semantic occurrence '${edit.occurrenceId}' unexpectedly exists in the Publisher Reader.`,
      );
    }

    evidence.push({
      occurrenceId: edit.occurrenceId,
      sourceSectionId: edit.sourceSectionId,
      targetSectionId: edit.targetSectionId,
      paragraphAnchor: edit.paragraphAnchor,
      label,
      destination: edit.href,
      catalogBlockIndex: catalogLink.blockIndex,
      readerBlockId: readerBlock.id,
      sourceRawStart: edit.rawStart,
      sourceRawEnd: edit.rawEnd,
    });
  }

  const unmatched = [...remainingLinks.values()].flat();
  if (unmatched.length > 0) {
    fail(
      `${unmatched.length.toLocaleString()} prepared catalog only link(s) have no approved semantic occurrence.`,
    );
  }
  return evidence.sort((left, right) =>
    left.occurrenceId.localeCompare(right.occurrenceId),
  );
}

function titleMatterPrefixes(
  authorities: ContentFidelityAuthorities,
): TitleMatterPrefixEvidence[] {
  return authorities.built.content.works.map((work) => {
    const catalogSections = authorities.catalog.sections.filter(
      (section) => section.volumeId === work.id,
    );
    const firstCatalogSection = catalogSections[0];
    const firstReaderSection = work.sections[0];
    if (!firstCatalogSection || !firstReaderSection) {
      fail(`work '${work.id}' has no first section for title matter evidence.`);
    }
    const sourceParagraphStart = integer(
      firstCatalogSection.sourceParagraphStart,
      `sourceParagraphStart for '${firstCatalogSection.sectionId}'`,
    );
    const provenanceBlocks = firstReaderSection.blocks.filter(
      (block) => block.provenance.start.line < sourceParagraphStart,
    );
    const firstBodyBlock = splitMarkdownBlocks(firstCatalogSection.body)[0];
    if (!firstBodyBlock) {
      fail(`first section '${firstCatalogSection.sectionId}' has no body block.`);
    }
    const visibleBodyIndex = firstReaderSection.blocks.findIndex(
      (block) => block.markdown === firstBodyBlock,
    );
    if (visibleBodyIndex < 0) {
      fail(
        `first section '${firstCatalogSection.sectionId}' has no visible catalog body boundary in the Publisher Reader.`,
      );
    }
    const visiblePrefix = firstReaderSection.blocks.slice(0, visibleBodyIndex);
    return {
      workId: work.id,
      firstSectionId: firstReaderSection.id,
      sourceParagraphStart,
      provenanceBlockCount: provenanceBlocks.length,
      provenanceWordCount: provenanceBlocks.reduce(
        (total, block) => total + block.wordCount,
        0,
      ),
      visibleBodyPrefixBlockCount: visiblePrefix.length,
      visibleBodyPrefixWordCount: visiblePrefix.reduce(
        (total, block) => total + block.wordCount,
        0,
      ),
      provenanceSha256: digest(
        provenanceBlocks.map((block) => ({
          id: block.id,
          markdown: block.markdown,
          wordCount: block.wordCount,
          sourcePath: block.provenance.sourcePath,
          start: block.provenance.start,
          end: block.provenance.end,
        })),
      ),
    };
  });
}

type CatalogHierarchyEntry = Readonly<{
  sectionId: string;
  role: "chapter" | "section";
  parentId: string | null;
  childIds: readonly string[];
}>;

function catalogHierarchy(catalog: CompiledCatalog): Readonly<{
  bySectionId: ReadonlyMap<string, CatalogHierarchyEntry>;
  rootIdsByWorkId: ReadonlyMap<string, readonly string[]>;
  roles: Readonly<{ chapter: number; section: number }>;
  sha256: string;
}> {
  const entries: CatalogHierarchyEntry[] = [];
  const rootIdsByWorkId = new Map<string, readonly string[]>();
  for (const volume of catalog.volumes) {
    const sections = catalog.sections.filter(
      (section) => section.volumeId === volume.volumeId,
    );
    const sectionsByChapter = new Map<string, CompiledSection[]>();
    for (const section of sections) {
      const key = `${section.partId}\u0000${section.chapterId}`;
      const values = sectionsByChapter.get(key) ?? [];
      values.push(section);
      sectionsByChapter.set(key, values);
    }
    const roots: string[] = [];
    for (const chapterSections of sectionsByChapter.values()) {
      const root = chapterSections[0];
      if (!root) fail(`work '${volume.volumeId}' contains an empty chapter.`);
      roots.push(root.sectionId);
      entries.push({
        sectionId: root.sectionId,
        role: "chapter",
        parentId: null,
        childIds: chapterSections.slice(1).map(({ sectionId }) => sectionId),
      });
      for (const section of chapterSections.slice(1)) {
        entries.push({
          sectionId: section.sectionId,
          role: "section",
          parentId: root.sectionId,
          childIds: [],
        });
      }
    }
    rootIdsByWorkId.set(volume.volumeId, roots);
  }
  const order = new Map(
    catalog.sections.map((section, index) => [section.sectionId, index]),
  );
  entries.sort(
    (left, right) =>
      (order.get(left.sectionId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.sectionId) ?? Number.MAX_SAFE_INTEGER),
  );
  return {
    bySectionId: new Map(entries.map((entry) => [entry.sectionId, entry])),
    rootIdsByWorkId,
    roles: {
      chapter: entries.filter(({ role }) => role === "chapter").length,
      section: entries.filter(({ role }) => role === "section").length,
    },
    sha256: digest(entries),
  };
}

function catalogBodyProjection(
  authorities: ContentFidelityAuthorities,
): ContentFidelityReport["coverage"]["bodyProjection"] {
  const readerSections = new Map(
    authorities.built.content.works.flatMap((work) =>
      work.sections.map((section) => [section.id, section] as const),
    ),
  );
  const missingSectionIds: string[] = [];
  const projectionRows: unknown[] = [];
  let bodyBlockCount = 0;
  let matchedBodyBlockCount = 0;
  let bodyWordCount = 0;
  let matchedBeforeRangeBlockCount = 0;
  let matchedInsideRangeBlockCount = 0;
  let matchedAfterRangeBlockCount = 0;
  let unmatchedBeforeRangeBlockCount = 0;
  let unmatchedInsideRangeBlockCount = 0;
  let unmatchedAfterRangeBlockCount = 0;

  for (const section of authorities.rawCatalog.sections) {
    exact(
      section.text,
      stripMarkdown(section.body),
      `raw catalog body text at '${section.sectionId}'`,
    );
    exact(
      section.wordCount,
      wordCount(section.body),
      `raw catalog body word count at '${section.sectionId}'`,
    );
    exact(
      section.paragraphs,
      paragraphFingerprints(section.body),
      `raw catalog body paragraphs at '${section.sectionId}'`,
    );
    exact(
      section.contentHash,
      sha256(normalizeNewlines(section.body)).slice(0, 16),
      `raw catalog body hash at '${section.sectionId}'`,
    );

    const compiled = compileMarkdownWork({
      workId: section.volumeId,
      sectionId: section.sectionId,
      title: section.title,
      sourcePath: stringValue(
        section.sourceDoc,
        `source document for '${section.sectionId}'`,
      ),
      markdown: section.body,
      route: section.href,
    });
    if (!compiled.valid) {
      fail(
        `raw catalog body '${section.sectionId}' does not compile (${compiled.diagnostics
          .map(({ code }) => code)
          .join(", ")}).`,
      );
    }
    const bodyBlocks = compiled.value.work.sections[0]?.blocks ?? [];
    bodyBlockCount += bodyBlocks.length;
    const readerSection = readerSections.get(section.sectionId);
    if (!readerSection) {
      missingSectionIds.push(section.sectionId);
      continue;
    }
    const matchedIndexes = new Set<number>();
    const matchedRows: unknown[] = [];
    let cursor = 0;
    for (const bodyBlock of bodyBlocks) {
      const readerIndex = readerSection.blocks.findIndex(
        (candidate, index) =>
          index >= cursor &&
          candidate.kind === bodyBlock.kind &&
          candidate.markdown === bodyBlock.markdown &&
          candidate.text === bodyBlock.text,
      );
      if (readerIndex < 0) {
        missingSectionIds.push(section.sectionId);
        break;
      }
      const readerBlock = readerSection.blocks[readerIndex]!;
      matchedIndexes.add(readerIndex);
      cursor = readerIndex + 1;
      matchedBodyBlockCount += 1;
      bodyWordCount += readerBlock.wordCount;
      const sourceLine = readerBlock.provenance.start.line;
      const range =
        sourceLine < (section.sourceParagraphStart ?? 0)
          ? "before"
          : sourceLine <= (section.sourceParagraphEnd ?? 0)
            ? "inside"
            : "after";
      if (range === "before") matchedBeforeRangeBlockCount += 1;
      if (range === "inside") matchedInsideRangeBlockCount += 1;
      if (range === "after") matchedAfterRangeBlockCount += 1;
      matchedRows.push({
        bodyKind: bodyBlock.kind,
        bodyMarkdown: bodyBlock.markdown,
        bodyText: bodyBlock.text,
        readerBlockId: readerBlock.id,
        readerIndex,
        readerWordCount: readerBlock.wordCount,
        sourcePath: readerBlock.provenance.sourcePath,
        sourceStart: readerBlock.provenance.start,
        sourceEnd: readerBlock.provenance.end,
        range,
      });
    }
    const unmatchedRows: unknown[] = [];
    readerSection.blocks.forEach((readerBlock, readerIndex) => {
      if (matchedIndexes.has(readerIndex)) return;
      const sourceLine = readerBlock.provenance.start.line;
      const range =
        sourceLine < (section.sourceParagraphStart ?? 0)
          ? "before"
          : sourceLine <= (section.sourceParagraphEnd ?? 0)
            ? "inside"
            : "after";
      if (range === "before") unmatchedBeforeRangeBlockCount += 1;
      if (range === "inside") unmatchedInsideRangeBlockCount += 1;
      if (range === "after") unmatchedAfterRangeBlockCount += 1;
      unmatchedRows.push({
        readerBlockId: readerBlock.id,
        readerIndex,
        kind: readerBlock.kind,
        markdown: readerBlock.markdown,
        wordCount: readerBlock.wordCount,
        sourcePath: readerBlock.provenance.sourcePath,
        sourceStart: readerBlock.provenance.start,
        sourceEnd: readerBlock.provenance.end,
        range,
      });
    });
    projectionRows.push({
      sectionId: section.sectionId,
      catalogBodySha256: sha256(section.body),
      sourceParagraphStart: section.sourceParagraphStart,
      sourceParagraphEnd: section.sourceParagraphEnd,
      bodyBlockCount: bodyBlocks.length,
      matched: matchedRows,
      unmatched: unmatchedRows,
    });
  }

  const uniqueMissingIds = sortedUnique(missingSectionIds);
  if (uniqueMissingIds.length > 0) {
    fail(
      `raw catalog body projection is missing exact Reader blocks for ${uniqueMissingIds.join(", ")}.`,
    );
  }
  if (
    matchedBeforeRangeBlockCount !== 0 ||
    matchedAfterRangeBlockCount !== 0 ||
    matchedInsideRangeBlockCount !== bodyBlockCount
  ) {
    fail("raw catalog body blocks must remain inside their declared source ranges.");
  }
  const partitionCount =
    matchedBeforeRangeBlockCount +
    matchedInsideRangeBlockCount +
    matchedAfterRangeBlockCount +
    unmatchedBeforeRangeBlockCount +
    unmatchedInsideRangeBlockCount +
    unmatchedAfterRangeBlockCount;
  exact(
    partitionCount,
    authorities.built.content.statistics.blockCount,
    "Reader body projection partition census",
  );

  return {
    sectionCount: authorities.rawCatalog.sections.length,
    missingSectionIds: uniqueMissingIds,
    bodyBlockCount,
    matchedBodyBlockCount,
    bodyWordCount,
    matchedBeforeRangeBlockCount,
    matchedInsideRangeBlockCount,
    matchedAfterRangeBlockCount,
    unmatchedBeforeRangeBlockCount,
    unmatchedInsideRangeBlockCount,
    unmatchedAfterRangeBlockCount,
    projectionSha256: digest(projectionRows),
  };
}

export function adaptContentFidelityAuthorities(
  authorities: ContentFidelityAuthorities,
): ContentFidelityReport {
  const { built, catalog, rawCatalog } = authorities;
  exact(catalog.stats.volumeCount, catalog.volumes.length, "catalog work census");
  exact(catalog.stats.sectionCount, catalog.sections.length, "catalog section census");
  exact(rawCatalog.stats.volumeCount, catalog.stats.volumeCount, "raw catalog work census");
  exact(rawCatalog.stats.sectionCount, catalog.stats.sectionCount, "raw catalog section census");
  exact(rawCatalog.stats.wordCount, catalog.stats.wordCount, "raw catalog word census");

  const contentWorks = built.content.works;
  const readerWorks = built.reader.works;
  const hierarchy = catalogHierarchy(catalog);
  exact(contentWorks.length, catalog.volumes.length, "Publisher content work count");
  exact(readerWorks.length, catalog.volumes.length, "Publisher Reader work count");

  const coverageSectionIds: string[] = [];
  const coverageRoutes: unknown[] = [];
  const coverageContinuity: unknown[] = [];
  const coverageSourceOrder: unknown[] = [];

  for (const [workIndex, volume] of catalog.volumes.entries()) {
    const contentWork = contentWorks[workIndex];
    const readerWork = readerWorks[workIndex];
    if (!contentWork || !readerWork) fail(`Publisher work ${workIndex + 1} is missing.`);
    exact(contentWork.id, volume.volumeId, `content work identity at index ${workIndex}`);
    exact(readerWork.id, volume.volumeId, `Reader work identity at index ${workIndex}`);
    exact(contentWork.route, volume.href, `content work route for '${volume.volumeId}'`);
    exact(readerWork.route, volume.href, `Reader work route for '${volume.volumeId}'`);

    const catalogSections = catalog.sections.filter(
      (section) => section.volumeId === volume.volumeId,
    );
    const rawSections = rawCatalog.sections.filter(
      (section) => section.volumeId === volume.volumeId,
    );
    exact(volume.sectionIds, catalogSections.map(({ sectionId }) => sectionId), `catalog volume order for '${volume.volumeId}'`);
    exact(rawSections.map(({ sectionId }) => sectionId), catalogSections.map(({ sectionId }) => sectionId), `raw catalog section order for '${volume.volumeId}'`);
    exact(contentWork.sections.length, catalogSections.length, `content section count for '${volume.volumeId}'`);
    exact(readerWork.sections.length, catalogSections.length, `Reader section count for '${volume.volumeId}'`);
    const expectedRootIds = hierarchy.rootIdsByWorkId.get(volume.volumeId) ?? [];
    exact(contentWork.rootSectionIds, expectedRootIds, `content hierarchy roots for '${volume.volumeId}'`);
    exact(readerWork.rootSectionIds, expectedRootIds, `Reader hierarchy roots for '${volume.volumeId}'`);

    let priorSourceStart = 0;
    for (const [sectionIndex, catalogSection] of catalogSections.entries()) {
      const rawSection = rawSections[sectionIndex];
      const contentSection = contentWork.sections[sectionIndex];
      const readerSection = readerWork.sections[sectionIndex];
      if (!rawSection || !contentSection || !readerSection) {
        fail(`section ${sectionIndex + 1} is missing from work '${volume.volumeId}'.`);
      }
      exact(rawSection.sectionId, catalogSection.sectionId, `raw section identity at '${catalogSection.sectionId}'`);
      exact(rawSection.href, catalogSection.href, `raw section route at '${catalogSection.sectionId}'`);
      exact(
        {
          volumeId: rawSection.volumeId,
          partId: rawSection.partId,
          chapterId: rawSection.chapterId,
          sectionOrder: rawSection.sectionOrder,
        },
        {
          volumeId: catalogSection.volumeId,
          partId: catalogSection.partId,
          chapterId: catalogSection.chapterId,
          sectionOrder: catalogSection.sectionOrder,
        },
        `raw section hierarchy at '${catalogSection.sectionId}'`,
      );
      exact(rawSection.text, catalogSection.text, `raw section text at '${catalogSection.sectionId}'`);
      exact(rawSection.wordCount, catalogSection.wordCount, `raw section words at '${catalogSection.sectionId}'`);
      exact(contentSection.id, catalogSection.sectionId, `content section identity at '${catalogSection.sectionId}'`);
      exact(readerSection.id, catalogSection.sectionId, `Reader section identity at '${catalogSection.sectionId}'`);
      const expectedRoute = catalogSection.href;
      exact(contentSection.routes.canonical?.path, expectedRoute, `content route at '${catalogSection.sectionId}'`);
      exact(contentSection.readerAddress?.path, expectedRoute, `content Reader address at '${catalogSection.sectionId}'`);
      exact(readerSection.routes.canonical?.path, expectedRoute, `Reader route at '${catalogSection.sectionId}'`);
      exact(readerSection.readerAddress?.path, expectedRoute, `Reader address at '${catalogSection.sectionId}'`);
      const continuity = expectedContinuity(catalogSection);
      exact(contentSection.continuity, continuity, `content continuity at '${catalogSection.sectionId}'`);
      exact(readerSection.continuity, continuity, `Reader continuity at '${catalogSection.sectionId}'`);
      const expectedHierarchy = hierarchy.bySectionId.get(
        catalogSection.sectionId,
      );
      if (!expectedHierarchy) {
        fail(`catalog hierarchy is missing '${catalogSection.sectionId}'.`);
      }
      exact(contentSection.role, expectedHierarchy.role, `content hierarchy role at '${catalogSection.sectionId}'`);
      exact(readerSection.role, expectedHierarchy.role, `Reader hierarchy role at '${catalogSection.sectionId}'`);
      exact(contentSection.parentId ?? null, expectedHierarchy.parentId, `content hierarchy parent at '${catalogSection.sectionId}'`);
      exact(readerSection.parentId ?? null, expectedHierarchy.parentId, `Reader hierarchy parent at '${catalogSection.sectionId}'`);
      exact(contentSection.childIds, expectedHierarchy.childIds, `content hierarchy children at '${catalogSection.sectionId}'`);
      exact(readerSection.childIds, expectedHierarchy.childIds, `Reader hierarchy children at '${catalogSection.sectionId}'`);
      exact(
        readerSection.blocks.map(({ id, markdown, wordCount }) => ({ id, markdown, wordCount })),
        contentSection.blocks.map(({ id, markdown, wordCount }) => ({ id, markdown, wordCount })),
        `Reader block projection at '${catalogSection.sectionId}'`,
      );

      const metadata = contentSection.metadata as Readonly<Record<string, unknown>>;
      const sourceParagraphStart = integer(
        catalogSection.sourceParagraphStart,
        `sourceParagraphStart at '${catalogSection.sectionId}'`,
      );
      const sourceParagraphEnd = integer(
        catalogSection.sourceParagraphEnd,
        `sourceParagraphEnd at '${catalogSection.sectionId}'`,
      );
      if (sourceParagraphStart <= priorSourceStart) {
        fail(`catalog source order is not increasing at '${catalogSection.sectionId}'.`);
      }
      priorSourceStart = sourceParagraphStart;
      exact(metadata.sourceDocument, catalogSection.sourceDoc, `content source document at '${catalogSection.sectionId}'`);
      exact(metadata.sourceHash, catalogSection.sourceHash, `content source hash at '${catalogSection.sectionId}'`);
      exact(metadata.sourceParagraphStart, sourceParagraphStart, `content source start at '${catalogSection.sectionId}'`);
      exact(metadata.sourceParagraphEnd, sourceParagraphEnd, `content source end at '${catalogSection.sectionId}'`);

      coverageSectionIds.push(catalogSection.sectionId);
      coverageRoutes.push({
        sectionId: catalogSection.sectionId,
        route: expectedRoute,
      });
      coverageContinuity.push({
        sectionId: catalogSection.sectionId,
        continuity,
      });
      coverageSourceOrder.push({
        sectionId: catalogSection.sectionId,
        volumeId: catalogSection.volumeId,
        sourceDoc: catalogSection.sourceDoc,
        sourceParagraphStart,
        sourceParagraphEnd,
      });
    }
  }

  const expectedActiveRoutes: unknown[] = [
    { path: "/", target: { kind: "home" } },
  ];
  for (const volume of catalog.volumes) {
    expectedActiveRoutes.push({
      path: volume.href,
      target: { kind: "work", workId: volume.volumeId },
    });
    for (const section of catalog.sections.filter(
      (candidate) => candidate.volumeId === volume.volumeId,
    )) {
      expectedActiveRoutes.push({
        path: section.href,
        target: {
          kind: "section",
          routeName: "canonical",
          sectionId: section.sectionId,
          workId: volume.volumeId,
        },
      });
    }
  }
  exact(built.content.routes, built.reader.routes, "content and Reader route indexes");
  exact(built.reader.routes.active, expectedActiveRoutes, "Reader active route census");
  exact(
    built.reader.routes.redirects,
    authorities.redirects,
    "Reader redirect authority census",
  );
  const semanticRedirects = built.reader.routes.redirects.filter(({ from }) =>
    from.endsWith("/"),
  );
  const companionRedirects = built.reader.routes.redirects.filter(
    ({ from }) => !from.endsWith("/"),
  );
  const omittedPartRoutes = catalog.volumes.flatMap((volume) =>
    volume.parts.map((part) => ({
      workId: volume.volumeId,
      partId: part.partId,
      path: part.href,
    })),
  );
  const activePartTargets = (
    built.reader.routes.active as readonly Readonly<{
      target: Readonly<{ kind: string }>;
    }>[]
  ).filter(({ target }) => target.kind === "part");
  exact(
    activePartTargets,
    [],
    "intentionally omitted catalog part route targets",
  );
  const bodyProjection = catalogBodyProjection(authorities);

  const sourceCoverage = readerLinksAndSourceCoverage(authorities);
  const contentManuscriptSources = new Map(
    built.content.sources
      .filter((source) => source.role === "manuscript")
      .map((source) => [source.path, source] as const),
  );
  exact(
    contentManuscriptSources.size,
    authorities.manuscripts.length,
    "Publisher canonical manuscript source count",
  );
  const canonicalManuscripts = authorities.manuscripts.map((manuscript) => {
    const source = contentManuscriptSources.get(manuscript.sourcePath);
    if (!source) fail(`canonical manuscript '${manuscript.sourcePath}' is absent from Publisher source provenance.`);
    const rawSha256 = sha256(Buffer.from(manuscript.bytes));
    exact(source.rawHash, `sha256:${rawSha256}`, `Publisher raw hash for '${manuscript.sourcePath}'`);
    exact(source.rawByteLength, manuscript.bytes.byteLength, `Publisher raw byte length for '${manuscript.sourcePath}'`);
    const catalogSections = catalog.sections.filter(
      (section) => section.volumeId === manuscript.workId,
    );
    exact(
      sortedUnique(
        catalogSections.map((section) =>
          stringValue(section.sourceHash, `catalog source hash for '${section.sectionId}'`),
        ),
      ),
      [rawSha256],
      `catalog source hashes for '${manuscript.workId}'`,
    );
    return {
      workId: manuscript.workId,
      editorialId: manuscript.editorialId,
      sourcePath: manuscript.sourcePath,
      rawByteLength: manuscript.bytes.byteLength,
      rawSha256,
      blockCount: sourceCoverage.blocksBySourcePath.get(manuscript.sourcePath) ?? 0,
    };
  });

  const preparedCatalogLinks = catalogLinks(catalog);
  const rawCatalogLinks = catalogLinks(rawCatalog);
  assertSameLinkMultiset(
    rawCatalogLinks,
    sourceCoverage.links,
    "canonical source link projection into the Publisher Reader",
  );
  const catalogOnlyLinks = subtractLinkMultiset(
    preparedCatalogLinks,
    rawCatalogLinks,
  );
  const semanticEvidence = semanticCatalogOnlyEvidence(
    authorities,
    catalogOnlyLinks,
  );
  const approvedOccurrences = authorities.semanticRegistry.occurrences.filter(
    (occurrence) => occurrence.decision === "link",
  );
  exact(
    semanticEvidence.length,
    approvedOccurrences.length,
    "approved semantic occurrence coverage",
  );

  const prefixes = titleMatterPrefixes(authorities);
  const prefixTotals = {
    provenanceBlockCount: prefixes.reduce(
      (total, prefix) => total + prefix.provenanceBlockCount,
      0,
    ),
    provenanceWordCount: prefixes.reduce(
      (total, prefix) => total + prefix.provenanceWordCount,
      0,
    ),
    visibleBodyPrefixBlockCount: prefixes.reduce(
      (total, prefix) => total + prefix.visibleBodyPrefixBlockCount,
      0,
    ),
    visibleBodyPrefixWordCount: prefixes.reduce(
      (total, prefix) => total + prefix.visibleBodyPrefixWordCount,
      0,
    ),
  };
  const wordDelta = built.reader.statistics.wordCount - catalog.stats.wordCount;

  return {
    schemaVersion: 1,
    status: "reviewed-known-gaps",
    parity: false,
    reader: {
      buildId: built.reader.buildId,
      contentBuildId: built.content.buildId,
      workCount: built.reader.statistics.workCount,
      sectionCount: built.reader.statistics.sectionCount,
      blockCount: built.reader.statistics.blockCount,
      wordCount: built.reader.statistics.wordCount,
    },
    catalog: {
      path: path.relative(repoRoot, generatedCatalogPath).replaceAll("\\", "/"),
      workCount: catalog.stats.volumeCount,
      sectionCount: catalog.stats.sectionCount,
      wordCount: catalog.stats.wordCount,
    },
    coverage: {
      workCount: contentWorks.length,
      sectionCount: coverageSectionIds.length,
      routeCount: built.reader.routes.active.length,
      sectionRouteCount: coverageRoutes.length,
      redirectCount: built.reader.routes.redirects.length,
      semanticRedirectCount: semanticRedirects.length,
      companionRedirectCount: companionRedirects.length,
      redirectsSha256: digest(built.reader.routes.redirects),
      continuityCount: coverageContinuity.length,
      sourceOrderCount: coverageSourceOrder.length,
      sourceSpanBlockCount: sourceCoverage.sourceSpanBlockCount,
      canonicalManuscriptCount: canonicalManuscripts.length,
      activeRoutesSha256: digest(built.reader.routes.active),
      omittedPartCount: omittedPartRoutes.length,
      omittedPartRoutesSha256: digest(omittedPartRoutes),
      hierarchyRoles: hierarchy.roles,
      hierarchySha256: hierarchy.sha256,
      bodyProjection,
      workIds: catalog.volumes.map(({ volumeId }) => volumeId),
      sectionIdsSha256: digest(coverageSectionIds),
      routesSha256: digest(coverageRoutes),
      continuitySha256: digest(coverageContinuity),
      sourceOrderSha256: digest(coverageSourceOrder),
      canonicalManuscripts,
    },
    knownGaps: {
      words: {
        catalog: catalog.stats.wordCount,
        publisher: built.reader.statistics.wordCount,
        delta: wordDelta,
      },
      titleMatterPrefix: {
        ...prefixTotals,
        works: prefixes,
      },
      semanticLinkFidelity: {
        preparedCatalogLinkCount: preparedCatalogLinks.length,
        rawCatalogLinkCount: rawCatalogLinks.length,
        publisherReaderLinkCount: sourceCoverage.links.length,
        canonicalSource: {
          linkCount: sourceCoverage.links.length,
          sourceSectionCount: sortedUnique(
            sourceCoverage.links.map(({ sectionId }) => sectionId),
          ).length,
          destinationCount: sortedUnique(
            sourceCoverage.links.map(({ destination }) => destination),
          ).length,
          workIds: sortedUnique(sourceCoverage.links.map(({ workId }) => workId)),
          sourceSectionIds: sortedUnique(
            sourceCoverage.links.map(({ sectionId }) => sectionId),
          ),
          destinations: sortedUnique(
            sourceCoverage.links.map(({ destination }) => destination),
          ),
          identitySha256: linkIdentityDigest(sourceCoverage.links),
          sourceSpanSha256: digest(
            sourceCoverage.links.map((link) => ({
              workId: link.workId,
              sectionId: link.sectionId,
              sourcePath: link.sourcePath,
              blockId: link.blockId,
              sourceStartOffset: link.sourceStartOffset,
              sourceEndOffset: link.sourceEndOffset,
              label: link.label,
              destination: link.destination,
              markdown: link.markdown,
            })),
          ),
        },
        generatedCatalogOnly: {
          linkCount: catalogOnlyLinks.length,
          sourceSectionCount: sortedUnique(
            semanticEvidence.map(({ sourceSectionId }) => sourceSectionId),
          ).length,
          targetSectionCount: sortedUnique(
            semanticEvidence.map(({ targetSectionId }) => targetSectionId),
          ).length,
          destinationCount: sortedUnique(
            semanticEvidence.map(({ destination }) => destination),
          ).length,
          registryOccurrenceCount: approvedOccurrences.length,
          sourceSectionIds: sortedUnique(
            semanticEvidence.map(({ sourceSectionId }) => sourceSectionId),
          ),
          targetSectionIds: sortedUnique(
            semanticEvidence.map(({ targetSectionId }) => targetSectionId),
          ),
          destinations: sortedUnique(
            semanticEvidence.map(({ destination }) => destination),
          ),
          identitySha256: linkIdentityDigest(catalogOnlyLinks),
          occurrenceEvidenceSha256: digest(semanticEvidence),
          evidence: semanticEvidence,
        },
      },
    },
  };
}

export function createContentFidelityReport(
  authorities: ContentFidelityAuthorities,
): ContentFidelityReport {
  return adaptContentFidelityAuthorities(authorities);
}

export const reviewedContentFidelityBaseline = Object.freeze({
  readerBuildId:
    "sha256:3f301ec319cb4f18441d2a0019a523d6d7c7ddf7153bd88e0c79ba24812982b4",
  contentBuildId:
    "sha256:6d077c4ab99ef9e8e6be569fdd20d8aa53c199ca6f1b773d7b2d89ed08b38eab",
  workIds: Object.freeze([
    "humanitys-most-viable-future",
    "wielding-intelligence",
    "providence-imperative",
    "architecting-providence",
    "purposeful",
    "smallest-nest",
    "presencing-genius",
    "misanthropic-artifice",
    "cardinal-scale",
  ]),
  sectionIdsSha256:
    "9e1585d92b0bb8b2a76fdc3e29f67e766b8e3198550f59385ecc0870759d40d4",
  routesSha256:
    "91832359b299a7084314d0e88b31c5c7ef20bbd08c617025db48bb1214474140",
  continuitySha256:
    "a2d7bb4f47f92b769ea90802f0cdfa15e0e2ac52d13256aef6875b4ae7265228",
  sourceOrderSha256:
    "88072522c34355ca6f5c4a3f3ba7595369e9d6bfc7eee3eeb67553f192acdc73",
  activeRoutesSha256:
    "0e279549d9b3261d638dc8409582237e0077a6b361ae480213156173c761a96b",
  redirectsSha256:
    "6e3ed95657dcaac2e60a35346b6c9e2c2a6c187bda68efff42e791a74f33e471",
  omittedPartRoutesSha256:
    "553d5f8aef5147d52b00f51c30f2f91ece8fad96cb61f61e9d358380be537439",
  hierarchySha256:
    "8315fad49e86c3ae3cf64fab50980bacab3533f99e64f940627bfa4c79b1014e",
  bodyProjectionSha256:
    "0654ef0edd63789be8952a72a775db5b2f502959ddab148517a5b95517af0b9c",
  canonicalManuscriptsSha256:
    "b773990ed75bbb0b874474c1b68c406cedb2e0a9e5c5cd3eb6bc89150a708792",
  completeReportSha256:
    "4cbe91b2f59a8c3debe8d4095e33e0d4cdb0ca8283aee8bb2f146fc1f153b4fd",
  rawLinkIdentitySha256:
    "8164fcdc7e80c30e9b5492240eb11f2beacfba3b732acf53bbf2aacdfa40ff06",
  rawLinkSourceSpanSha256:
    "13ed49db0f8f0796a3d649673119342cf7b9bb5f40a09a5c2847275fbd66dc48",
  semanticLinkIdentitySha256:
    "fbda92a4a982dd04d54beb16078345cf050fbacf146934fe6c41aa9acda814a9",
  semanticOccurrenceEvidenceSha256:
    "cc00eac0ae7144a44377498f935fc314c367d19218b3c734447451b31c7bf0f8",
  canonicalSourceSections: Object.freeze([
    "v06-the-between",
    "v06-the-currency",
    "v06-the-current",
    "v06-the-dragon",
    "v06-the-loom",
    "v06-the-pathway",
    "v06-the-right-size",
    "v06-the-seeing",
    "v06-the-smallest-nest",
    "v06-the-unspent-gift",
    "v06-your-people",
  ]),
  canonicalDestinations: Object.freeze([
    "/manuscripts/1/",
    "/manuscripts/2/",
    "/manuscripts/3/",
    "/manuscripts/5/how-potential-becomes-real/finding-your-people/",
    "/manuscripts/5/how-potential-becomes-real/the-missing-elders/",
    "/manuscripts/5/legacy/for-the-ones-not-yet-born/",
    "/manuscripts/5/legacy/the-assembly-of-builders/",
    "/manuscripts/5/the-architecture-of-becoming/providence-reconsidered/",
    "/manuscripts/5/the-architecture-of-becoming/purposeful/",
    "/manuscripts/5/the-builders/the-cardinal-scale/",
    "/manuscripts/5/the-builders/the-dragon-named-earth/",
    "/manuscripts/5/the-crisis-of-unrealized-potential/the-human-capacity-we-fail-to-see/",
    "/manuscripts/7/",
  ]),
  semanticSourceSections: Object.freeze([
    "v01-boundaries-and-burden-of-proof",
    "v01-four-movements",
    "v01-how-understanding-takes-root",
    "v01-icons-and-the-cardinal-scale",
    "v01-into-the-flower",
    "v01-the-currency-of-presence",
    "v01-the-ground-beneath-the-argument",
    "v01-the-horizon-before-the-blueprint",
    "v01-the-invitation",
    "v01-the-seeds-boundaries",
    "v01-why-coherence-is-a-prerequisite",
  ]),
  semanticTargetSections: Object.freeze([
    "v01-how-coherence-becomes-structure",
    "v01-the-flower",
    "v01-the-human-being-reconsidered",
    "v01-the-seed",
    "v01-when-scale-outruns-regulation",
    "v04-the-first-scale",
    "v05-the-cardinal-scale",
  ]),
  semanticDestinations: Object.freeze([
    "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/",
    "/manuscripts/1/seed-sprout-stem-and-soil/the-soil/",
    "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/",
    "/manuscripts/1/seed-sprout-stem-and-soil/the-stem/",
    "/manuscripts/1/the-flower/chapter-start/",
    "/manuscripts/4/the-scales-of-the-dragon/the-first-scale/",
    "/manuscripts/5/the-builders/the-cardinal-scale/",
  ]),
  titleMatterPrefixes: Object.freeze([
    Object.freeze({
      workId: "humanitys-most-viable-future",
      firstSectionId: "v01-orientation",
      sourceParagraphStart: 11,
      provenanceBlockCount: 6,
      provenanceWordCount: 38,
      visibleBodyPrefixBlockCount: 7,
      visibleBodyPrefixWordCount: 39,
      provenanceSha256:
        "f27fb1573d4514a3580f1675b92a4386d03c405a6be456a3f6a5ed960a57e394",
    }),
    Object.freeze({
      workId: "wielding-intelligence",
      firstSectionId: "v02-what-the-first-volume-left-in-our-hands",
      sourceParagraphStart: 39,
      provenanceBlockCount: 19,
      provenanceWordCount: 311,
      visibleBodyPrefixBlockCount: 20,
      visibleBodyPrefixWordCount: 319,
      provenanceSha256:
        "d5c96e22540b35d00839758e4ddfe0d1972e890b7f15842ae6032c242805fc8b",
    }),
    Object.freeze({
      workId: "providence-imperative",
      firstSectionId: "v03-the-next-nest",
      sourceParagraphStart: 31,
      provenanceBlockCount: 15,
      provenanceWordCount: 86,
      visibleBodyPrefixBlockCount: 16,
      visibleBodyPrefixWordCount: 89,
      provenanceSha256:
        "1a3dd975862ef08961df4b119c7074add450455dcea07e7c91a5cebef7b320ea",
    }),
    Object.freeze({
      workId: "architecting-providence",
      firstSectionId: "v04-power-without-coordination",
      sourceParagraphStart: 27,
      provenanceBlockCount: 13,
      provenanceWordCount: 65,
      visibleBodyPrefixBlockCount: 14,
      visibleBodyPrefixWordCount: 68,
      provenanceSha256:
        "b78d44b6d150061de6ac16406d6704e99fb0892e949bc7d6ec2fce5430229b04",
    }),
    Object.freeze({
      workId: "purposeful",
      firstSectionId: "v05-on-returning-to-the-human",
      sourceParagraphStart: 79,
      provenanceBlockCount: 39,
      provenanceWordCount: 169,
      visibleBodyPrefixBlockCount: 40,
      visibleBodyPrefixWordCount: 174,
      provenanceSha256:
        "bc5c42ee29e193928004fc8d4d1aadd1557ebd096aec5a052429537599298625",
    }),
    Object.freeze({
      workId: "smallest-nest",
      firstSectionId: "v06-on-nests",
      sourceParagraphStart: 73,
      provenanceBlockCount: 36,
      provenanceWordCount: 148,
      visibleBodyPrefixBlockCount: 37,
      visibleBodyPrefixWordCount: 150,
      provenanceSha256:
        "d47c3cd0e7b9c49ddd14512d70010573bf7d462ee4dba4d126ddae5f0bf9cdf3",
    }),
    Object.freeze({
      workId: "presencing-genius",
      firstSectionId: "v07-the-argument-arrived",
      sourceParagraphStart: 50,
      provenanceBlockCount: 20,
      provenanceWordCount: 166,
      visibleBodyPrefixBlockCount: 20,
      visibleBodyPrefixWordCount: 166,
      provenanceSha256:
        "329468ef84bf98ee042451fdec8d8f8f481c9d10f3790caa780c63927371b208",
    }),
    Object.freeze({
      workId: "misanthropic-artifice",
      firstSectionId: "v08-prologue-two-scenes",
      sourceParagraphStart: 12,
      provenanceBlockCount: 6,
      provenanceWordCount: 54,
      visibleBodyPrefixBlockCount: 7,
      visibleBodyPrefixWordCount: 57,
      provenanceSha256:
        "4182d142b6c350d6a4a593a719fb493a6ae99554e4a036072c14bcd67e0db793",
    }),
    Object.freeze({
      workId: "cardinal-scale",
      firstSectionId: "v09-a-note-on-the-register",
      sourceParagraphStart: 27,
      provenanceBlockCount: 12,
      provenanceWordCount: 88,
      visibleBodyPrefixBlockCount: 13,
      visibleBodyPrefixWordCount: 93,
      provenanceSha256:
        "e1a76680184ee2aac743f9fbe9f090ea8102d0fc3d5e48b0c06802fae1374a73",
    }),
  ]),
});

export function assertReviewedContentFidelityBaseline(
  report: ContentFidelityReport,
): void {
  exact(report.schemaVersion, 1, "report schema version");
  exact(report.status, "reviewed-known-gaps", "report status");
  exact(report.parity, false, "parity claim");
  exact(report.reader.buildId, reviewedContentFidelityBaseline.readerBuildId, "Reader build identity");
  exact(report.reader.contentBuildId, reviewedContentFidelityBaseline.contentBuildId, "content build identity");
  exact(report.reader.workCount, EXPECTED_WORK_COUNT, "Reader work count");
  exact(report.reader.sectionCount, EXPECTED_SECTION_COUNT, "Reader section count");
  exact(report.reader.blockCount, EXPECTED_BLOCK_COUNT, "Reader block count");
  exact(report.reader.wordCount, EXPECTED_PUBLISHER_WORD_COUNT, "Reader word count");
  exact(report.catalog.path, "generated/manuscripts/catalog.json", "catalog report path");
  exact(report.catalog.workCount, EXPECTED_WORK_COUNT, "catalog work count");
  exact(report.catalog.sectionCount, EXPECTED_SECTION_COUNT, "catalog section count");
  exact(report.catalog.wordCount, EXPECTED_CATALOG_WORD_COUNT, "catalog word count");
  exact(report.coverage.workCount, EXPECTED_WORK_COUNT, "covered work count");
  exact(report.coverage.sectionCount, EXPECTED_SECTION_COUNT, "covered section count");
  exact(report.coverage.routeCount, EXPECTED_ACTIVE_ROUTE_COUNT, "active route count");
  exact(report.coverage.sectionRouteCount, EXPECTED_SECTION_COUNT, "section route count");
  exact(report.coverage.redirectCount, EXPECTED_REDIRECT_COUNT, "redirect count");
  exact(
    report.coverage.semanticRedirectCount,
    EXPECTED_SEMANTIC_REDIRECT_COUNT,
    "semantic redirect count",
  );
  exact(
    report.coverage.companionRedirectCount,
    EXPECTED_COMPANION_REDIRECT_COUNT,
    "companion redirect count",
  );
  exact(
    report.coverage.redirectsSha256,
    reviewedContentFidelityBaseline.redirectsSha256,
    "redirect tuple census",
  );
  exact(report.coverage.continuityCount, EXPECTED_SECTION_COUNT, "covered continuity count");
  exact(report.coverage.sourceOrderCount, EXPECTED_SECTION_COUNT, "covered source order count");
  exact(report.coverage.sourceSpanBlockCount, report.reader.blockCount, "covered source span block count");
  exact(report.coverage.canonicalManuscriptCount, EXPECTED_WORK_COUNT, "canonical manuscript count");
  exact(report.coverage.canonicalManuscripts.length, EXPECTED_WORK_COUNT, "canonical manuscript evidence count");
  exact(report.coverage.workIds, reviewedContentFidelityBaseline.workIds, "work identities and order");
  exact(report.coverage.sectionIdsSha256, reviewedContentFidelityBaseline.sectionIdsSha256, "section identity census");
  exact(report.coverage.routesSha256, reviewedContentFidelityBaseline.routesSha256, "section route census");
  exact(report.coverage.continuitySha256, reviewedContentFidelityBaseline.continuitySha256, "section continuity census");
  exact(report.coverage.sourceOrderSha256, reviewedContentFidelityBaseline.sourceOrderSha256, "section source order census");
  exact(report.coverage.activeRoutesSha256, reviewedContentFidelityBaseline.activeRoutesSha256, "active route census");
  exact(report.coverage.omittedPartCount, EXPECTED_OMITTED_PART_COUNT, "omitted part route count");
  exact(report.coverage.omittedPartRoutesSha256, reviewedContentFidelityBaseline.omittedPartRoutesSha256, "omitted part route census");
  exact(report.coverage.hierarchyRoles, { chapter: 386, section: 139 }, "hierarchy role census");
  exact(report.coverage.hierarchySha256, reviewedContentFidelityBaseline.hierarchySha256, "hierarchy identity census");
  exact(
    report.coverage.bodyProjection,
    {
      sectionCount: EXPECTED_SECTION_COUNT,
      missingSectionIds: [],
      bodyBlockCount: 2_548,
      matchedBodyBlockCount: 2_548,
      bodyWordCount: 202_629,
      matchedBeforeRangeBlockCount: 0,
      matchedInsideRangeBlockCount: 2_548,
      matchedAfterRangeBlockCount: 0,
      unmatchedBeforeRangeBlockCount: 166,
      unmatchedInsideRangeBlockCount: 567,
      unmatchedAfterRangeBlockCount: 205,
      projectionSha256: reviewedContentFidelityBaseline.bodyProjectionSha256,
    },
    "complete catalog body projection census",
  );
  exact(
    digest(report.coverage.canonicalManuscripts),
    reviewedContentFidelityBaseline.canonicalManuscriptsSha256,
    "canonical manuscript evidence census",
  );

  exact(report.knownGaps.words, {
    catalog: EXPECTED_CATALOG_WORD_COUNT,
    publisher: EXPECTED_PUBLISHER_WORD_COUNT,
    delta: EXPECTED_WORD_DELTA,
  }, "reviewed word count gap");
  exact(report.knownGaps.words.catalog, report.catalog.wordCount, "catalog word evidence consistency");
  exact(report.knownGaps.words.publisher, report.reader.wordCount, "Reader word evidence consistency");
  exact(
    {
      provenanceBlockCount:
        report.knownGaps.titleMatterPrefix.provenanceBlockCount,
      provenanceWordCount:
        report.knownGaps.titleMatterPrefix.provenanceWordCount,
      visibleBodyPrefixBlockCount:
        report.knownGaps.titleMatterPrefix.visibleBodyPrefixBlockCount,
      visibleBodyPrefixWordCount:
        report.knownGaps.titleMatterPrefix.visibleBodyPrefixWordCount,
    },
    {
      provenanceBlockCount: 166,
      provenanceWordCount: 1_125,
      visibleBodyPrefixBlockCount: 174,
      visibleBodyPrefixWordCount: 1_155,
    },
    "reviewed title matter prefix totals",
  );
  exact(
    report.knownGaps.titleMatterPrefix.works,
    reviewedContentFidelityBaseline.titleMatterPrefixes,
    "reviewed title matter prefixes",
  );
  exact(
    {
      provenanceBlockCount: report.knownGaps.titleMatterPrefix.works.reduce(
        (total, item) => total + item.provenanceBlockCount,
        0,
      ),
      provenanceWordCount: report.knownGaps.titleMatterPrefix.works.reduce(
        (total, item) => total + item.provenanceWordCount,
        0,
      ),
      visibleBodyPrefixBlockCount:
        report.knownGaps.titleMatterPrefix.works.reduce(
          (total, item) => total + item.visibleBodyPrefixBlockCount,
          0,
        ),
      visibleBodyPrefixWordCount:
        report.knownGaps.titleMatterPrefix.works.reduce(
          (total, item) => total + item.visibleBodyPrefixWordCount,
          0,
        ),
    },
    {
      provenanceBlockCount:
        report.knownGaps.titleMatterPrefix.provenanceBlockCount,
      provenanceWordCount:
        report.knownGaps.titleMatterPrefix.provenanceWordCount,
      visibleBodyPrefixBlockCount:
        report.knownGaps.titleMatterPrefix.visibleBodyPrefixBlockCount,
      visibleBodyPrefixWordCount:
        report.knownGaps.titleMatterPrefix.visibleBodyPrefixWordCount,
    },
    "title matter prefix evidence consistency",
  );

  const links = report.knownGaps.semanticLinkFidelity;
  exact(links.preparedCatalogLinkCount, 35, "prepared catalog link count");
  exact(links.rawCatalogLinkCount, 14, "raw catalog link count");
  exact(links.publisherReaderLinkCount, 14, "Publisher Reader link count");
  exact(links.canonicalSource.linkCount, 14, "canonical source link count");
  exact(links.canonicalSource.sourceSectionCount, 11, "canonical source link section count");
  exact(links.canonicalSource.destinationCount, 13, "canonical source destination count");
  exact(links.canonicalSource.workIds, ["smallest-nest"], "canonical source link work identities");
  exact(links.canonicalSource.sourceSectionIds, reviewedContentFidelityBaseline.canonicalSourceSections, "canonical source link section identities");
  exact(links.canonicalSource.destinations, reviewedContentFidelityBaseline.canonicalDestinations, "canonical source link destinations");
  exact(links.canonicalSource.identitySha256, reviewedContentFidelityBaseline.rawLinkIdentitySha256, "canonical source link identity census");
  exact(links.canonicalSource.sourceSpanSha256, reviewedContentFidelityBaseline.rawLinkSourceSpanSha256, "canonical source link span census");

  const semantic = links.generatedCatalogOnly;
  exact(semantic.linkCount, 21, "catalog only semantic link count");
  exact(semantic.registryOccurrenceCount, 21, "approved semantic registry occurrence count");
  exact(semantic.sourceSectionCount, 11, "semantic source section count");
  exact(semantic.targetSectionCount, 7, "semantic target section count");
  exact(semantic.destinationCount, 7, "semantic destination count");
  exact(semantic.sourceSectionIds, reviewedContentFidelityBaseline.semanticSourceSections, "semantic source section identities");
  exact(semantic.targetSectionIds, reviewedContentFidelityBaseline.semanticTargetSections, "semantic target section identities");
  exact(semantic.destinations, reviewedContentFidelityBaseline.semanticDestinations, "semantic destinations");
  exact(semantic.identitySha256, reviewedContentFidelityBaseline.semanticLinkIdentitySha256, "semantic link identity census");
  exact(semantic.evidence.length, 21, "semantic occurrence evidence count");
  exact(digest(semantic.evidence), semantic.occurrenceEvidenceSha256, "semantic occurrence evidence consistency");
  exact(semantic.occurrenceEvidenceSha256, reviewedContentFidelityBaseline.semanticOccurrenceEvidenceSha256, "semantic occurrence evidence census");
  exact(
    digest(report),
    reviewedContentFidelityBaseline.completeReportSha256,
    "complete report evidence census",
  );
}

function adaptManuscriptSource(
  manuscript: PublisherManuscriptSource,
): CanonicalManuscriptInput {
  return {
    workId: manuscript.config.volumeId,
    editorialId: manuscript.config.editorialId,
    sourcePath: manuscript.relativePath,
    bytes: manuscript.bytes,
    text: manuscript.text,
  };
}

export async function runContentFidelityCensus(
  suppliedAuthorities?: ContentFidelityAuthorities,
): Promise<ContentFidelityReport> {
  const authorities =
    suppliedAuthorities ?? (await loadContentFidelityAuthorities());
  const report = createContentFidelityReport(authorities);
  assertReviewedContentFidelityBaseline(report);
  return report;
}

export async function loadContentFidelityAuthorities(): Promise<ContentFidelityAuthorities> {
  const extraFiles = [
    generatedCatalogPath,
    semanticLinksPath,
    aliasConfigPath,
    routeAliasConfigPath,
    sectionLineagePath,
    routeLedgerPath,
    versionProvenancePath,
    overviewPath,
    ...expectedVolumeManifestPaths(),
  ];
  for (const authorityPath of extraFiles) {
    assertCensusAuthorityPath({
      repositoryRoot: repoRoot,
      authorityPath,
      kind: "file",
      label: "census authority",
    });
  }
  assertCensusAuthorityPath({
    repositoryRoot: repoRoot,
    authorityPath: generatedManuscriptsRoot,
    kind: "directory",
    label: "generated manuscript authority",
  });
  assertCensusAuthorityTree(
    repoRoot,
    generatedSectionsRoot,
    "generated raw catalog authority",
  );
  assertCensusAuthorityPath({
    repositoryRoot: repoRoot,
    authorityPath: editorialCorpusRoot,
    kind: "directory",
    label: "semantic authority root",
  });
  const manifestSources = readCensusAuthority(
    "Publisher manifest authorities",
    () => readPublisherManifestSources(),
  );
  const manifestSet = readCensusAuthority(
    "Publisher manifest redirect projection",
    () => createPublisherManifestSet(manifestSources),
  );
  const redirects = manifestSet.publication.continuity?.redirects;
  if (redirects === undefined) {
    fail("Publisher manifest redirect projection omitted continuity redirects.");
  }
  exact(
    repositoryRelativeLabel(repoRoot, manifestSources.paths.catalogPath),
    repositoryRelativeLabel(repoRoot, generatedCatalogPath),
    "generated catalog authority path",
  );
  const rawCatalog = readCensusAuthority(
    "generated raw catalog authorities",
    () => buildCatalog(undefined, { semanticReferences: "omit" }),
  );
  const built = (
    await readCensusAuthorityAsync("Publisher Reader authorities", () =>
      createPublisherReaderBuild(defaultPublisherReaderBuildPaths, [
        createCoherenceReaderStateMigrationBootstrapExtensionRegistration(
          "coherence-thesis",
        ),
      ]),
    )
  ).built;
  return {
    built,
    catalog: manifestSources.catalog,
    rawCatalog,
    redirects,
    semanticRegistry: readCensusAuthority(
      "semantic link authority",
      () => readSemanticLinkRegistry(semanticLinksPath),
    ),
    manuscripts: manifestSources.manuscripts.map(adaptManuscriptSource),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 0) {
    throw new Error("Usage: content-fidelity.ts");
  }
  const report = await runContentFidelityCensus();
  const links = report.knownGaps.semanticLinkFidelity;
  console.log(
    [
      "Publisher content fidelity census passed the reviewed known-gap baseline",
      `${report.coverage.workCount} works`,
      `${report.coverage.sectionCount} current sections`,
      `${report.knownGaps.words.catalog} catalog words`,
      `${report.knownGaps.words.publisher} Publisher words`,
      `delta ${report.knownGaps.words.delta}`,
      `${links.canonicalSource.linkCount} canonical links preserved`,
      `${links.generatedCatalogOnly.linkCount} catalog-only semantic links absent from Publisher`,
      "this is known-gap evidence, not parity",
    ].join(", ") + ".",
  );
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
