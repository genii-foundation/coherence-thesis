import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import {
  compileLoadedPublicationContent,
  derivePublicationWorkInputs,
  loadPublicationCompilationSources,
  type LoadedPublicationCompilationSources,
} from "@genii-foundation/publisher/node";
import {
  compileMarkdownWork,
  countWords,
  hashCanonicalJson,
  type MarkdownBlockInput,
  type ResolvedContentLinkInput,
  type SectionContentInput,
  type WorkContentInput,
} from "@genii-foundation/publisher-content";
import {
  projectPublicationReader,
} from "@genii-foundation/publisher-reader";
import {
  applyReaderLinksToMarkdown,
  type ReaderBlockMarkdownLink,
} from "@genii-foundation/publisher-reader/markdown";
import {
  createReaderProgressCatalog,
  type ReaderProgressCatalog,
} from "@genii-foundation/publisher-reader/progress-catalog";
import {
  createReaderSearchIndex,
  type ReaderSearchIndex,
} from "@genii-foundation/publisher-reader/search";
import { createPublisherNextRoutePlan } from "@genii-foundation/publisher-next/config";
import type {
  PublicationNextApplication,
  PublisherNextRoutePlan,
} from "@genii-foundation/publisher-next/server";
import { resolveDefaultPublisherNextTheme } from "@genii-foundation/publisher-next/theme/default";
import type {
  Diagnostic,
  JSONValue,
  PublicationContentEnvelope,
  PublicationReaderEnvelope,
  ValidationResult,
} from "@genii-foundation/publisher-schema";

import type { SemanticLinkRegistry } from "../editorial/semantic-links";
import type { CompiledCatalog, CompiledSection } from "../manuscripts/types";
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
import { coherenceReaderStateBootstrap } from "../../src/publisher/reader-state-bootstrap";
import { assertCensusAuthorityPath } from "./content-fidelity";
import {
  readPublisherManifestSources,
} from "./manifests";
import * as semanticLinksImport from "../editorial/semantic-links";
import * as manuscriptSharedImport from "../manuscripts/shared";
import * as semanticReferencesImport from "../manuscripts/semantic-references";

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

const { readSemanticLinkRegistry } = moduleExports<
  typeof import("../editorial/semantic-links")
>(semanticLinksImport);
const { buildCatalog, getGitRevision } = moduleExports<
  typeof import("../manuscripts/shared")
>(manuscriptSharedImport);
const {
  applySemanticReferences,
  planSemanticReferenceBodyEdits,
} = moduleExports<typeof import("../manuscripts/semantic-references")>(
  semanticReferencesImport,
);

type CreatePublicationNextApplication =
  typeof import("@genii-foundation/publisher-next/server")["createPublicationNextApplication"];

async function loadCreatePublicationNextApplication(): Promise<
  CreatePublicationNextApplication
> {
  try {
    const server = await import("@genii-foundation/publisher-next/server");
    return server.createPublicationNextApplication;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("only be used from a Server Component")
    ) {
      throw error;
    }
    const server = await import(
      "../../node_modules/@genii-foundation/publisher-next/dist/server/application.js"
    );
    return server.createPublicationNextApplication;
  }
}

const EXPECTED_WORK_COUNT = 9;
const EXPECTED_SECTION_COUNT = 525;
const EXPECTED_BLOCK_COUNT = 3_485;
const EXPECTED_WORD_COUNT = 206_196;
const EXPECTED_BODY_BLOCK_COUNT = 2_547;
const EXPECTED_BODY_WORD_COUNT = 202_377;
const EXPECTED_CATALOG_WORD_COUNT = 201_885;
const EXPECTED_STRUCTURAL_BLOCK_COUNT = 938;
const EXPECTED_STRUCTURAL_WORD_COUNT = 3_819;
const EXPECTED_STRUCTURAL_BLOCKS_BEFORE_RANGE = 166;
const EXPECTED_STRUCTURAL_BLOCKS_INSIDE_RANGE = 567;
const EXPECTED_STRUCTURAL_BLOCKS_AFTER_RANGE = 205;
const EXPECTED_APPENDED_TRAVERSAL_INVERSIONS = 193_898;
const EXPECTED_BASELINE_ACTIVE_ROUTE_COUNT = 535;
const EXPECTED_ACTIVE_ROUTE_COUNT = 539;
const EXPECTED_REDIRECT_COUNT = 0;
const EXPECTED_SEARCH_ENTRY_COUNT = 525;
const EXPECTED_PROGRESS_ENTRY_COUNT = 525;
const EXPECTED_SEMANTIC_LINK_COUNT = 21;
const EXPECTED_SEMANTIC_LINK_BLOCK_GROUP_COUNT = 17;
const EXPECTED_SEMANTIC_LINK_INPUTS_SHA256 =
  "sha256:a107111eb168ed8e9069c1f494016a64facc9132d515cd7033a0718225d5479f";
const EXPECTED_GROUPED_SEMANTIC_APPLICATION_SHA256 =
  "sha256:5a127f598bc52d74d949ad94bdb084173cff9717ac135b68b7b34a93542ec851";
const EXPECTED_ABSENT_READER_BASE_PATH_COUNT = 46;
const EXPECTED_ABSENT_READER_BASE_PATH_REFERENCE_COUNT = 153;
const EXPECTED_FINAL_ABSENT_READER_BASE_PATH_COUNT = 44;
const EXPECTED_FINAL_ABSENT_READER_BASE_PATH_REFERENCE_COUNT = 141;
const EXPECTED_MISSING_READER_FRAGMENT_HREF_COUNT = 153;
const EXPECTED_MISSING_READER_FRAGMENT_HREFS_SHA256 =
  "sha256:0bd2f269c6654243115aee7d9dd69aa7a181c1636110d014622772ce3c5ddbdf";
const EXPECTED_SEMANTIC_REGISTRY_SHA256 =
  "sha256:1ee06a681efbc9f35fc8f2adce60b25a2b1dbf0a44f881510140e9e0a4f9a2ce";
const EXPECTED_RAW_CATALOG_SHA256 =
  "sha256:c58b46b6bd743456a56e3075333d9dde007e3ef8da1b3f0ef1df02fe2b031305";
const EXPECTED_PREPARED_CATALOG_SHA256 =
  "sha256:f18633aad1930850d1530877e21999badecfde31a54ac06bd3db1ea852efa751";
const SEMANTIC_ROUTE_NAME = "semantic-target";
const COHERENCE_ADAPTER_IDENTITY = Object.freeze({
  id: "coherence-content",
  package: "coherence-thesis",
  version: "0.1.0",
} as const);

const EXPECTED_STRUCTURAL_BLOCKS_BY_WORK = Object.freeze({
  "humanitys-most-viable-future": 74,
  "wielding-intelligence": 129,
  "providence-imperative": 200,
  "architecting-providence": 201,
  purposeful: 106,
  "smallest-nest": 69,
  "presencing-genius": 68,
  "misanthropic-artifice": 61,
  "cardinal-scale": 30,
} as const);

const EXPECTED_APPENDED_INVERSIONS_BY_WORK = Object.freeze({
  "humanitys-most-viable-future": 12_043,
  "wielding-intelligence": 32_727,
  "providence-imperative": 58_944,
  "architecting-providence": 55_440,
  purposeful: 15_760,
  "smallest-nest": 6_915,
  "presencing-genius": 7_341,
  "misanthropic-artifice": 3_582,
  "cardinal-scale": 1_146,
} as const);

const EXPECTED_SEMANTIC_ROUTE_ADDITIONS = Object.freeze([
  Object.freeze({
    sectionId: "v01-how-coherence-becomes-structure",
    path: "/manuscripts/1/seed-sprout-stem-and-soil/the-stem/",
  }),
  Object.freeze({
    sectionId: "v01-the-flower",
    path: "/manuscripts/1/the-flower/chapter-start/",
  }),
  Object.freeze({
    sectionId: "v01-the-human-being-reconsidered",
    path: "/manuscripts/1/seed-sprout-stem-and-soil/the-soil/",
  }),
  Object.freeze({
    sectionId: "v01-when-scale-outruns-regulation",
    path: "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/",
  }),
] as const);

const EXPECTED_RAW_READER_BASE_PATH_CLOSURES = Object.freeze([
  Object.freeze({
    path: "/manuscripts/1/seed-sprout-stem-and-soil/the-soil/",
    catalogReferenceCount: 6,
  }),
  Object.freeze({
    path: "/manuscripts/1/seed-sprout-stem-and-soil/the-stem/",
    catalogReferenceCount: 6,
  }),
] as const);

const EXPECTED_SEMANTIC_AGGREGATE_ONLY_TARGETS = Object.freeze([
  "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/",
  "/manuscripts/1/the-flower/chapter-start/",
] as const);

export type CoherencePublisherSemanticLinkPolicy = Readonly<{
  mode: "include-all-approved";
  approvedLinkIds: readonly string[];
}>;

export type CoherencePublisherContentAuthorities = Readonly<{
  loaded: LoadedPublicationCompilationSources;
  sourceWorks: readonly WorkContentInput[];
  preparedCatalog: CompiledCatalog;
  rawCatalog: CompiledCatalog;
  semanticRegistry: SemanticLinkRegistry;
  semanticLinkPolicy: CoherencePublisherSemanticLinkPolicy;
}>;

export type CoherencePublisherStructuralWorkEvidence = Readonly<{
  workId: string;
  bodyBlockCount: number;
  bodyWordCount: number;
  structuralBlockCount: number;
  structuralWordCount: number;
  structuralOwnerSectionCount: number;
  structuralRunCount: number;
  appendedSectionTraversalInversions: number;
}>;

export type CoherencePublisherContentEvidence = Readonly<{
  schemaVersion: 2;
  proofKind: "coherence-content-lower-api-proof";
  integration: Readonly<{
    proofOnly: true;
    wiredToHostRoutes: false;
    appWiringApproved: false;
    reason: string;
  }>;
  currentShape: Readonly<{
    workCount: number;
    sectionCount: number;
    blockCount: number;
    wordCount: number;
    workIds: readonly string[];
  }>;
  structuralPartition: Readonly<{
    evidenceOnly: true;
    materialized: false;
    proposedStructuralSectionCount: number;
    materializationSafe: false;
    reason: string;
    bodyBlockCount: number;
    bodyWordCount: number;
    structuralBlockCount: number;
    structuralWordCount: number;
    structuralSourceRange: Readonly<{
      before: number;
      inside: number;
      after: number;
    }>;
    appendedSectionTraversalInversions: number;
    works: readonly CoherencePublisherStructuralWorkEvidence[];
    partitionSha256: string;
  }>;
  routes: Readonly<{
    baselineActiveRouteCount: number;
    finalActiveRouteCount: number;
    redirectCount: number;
    semanticTargetRouteCount: number;
    semanticTargetRoutes: readonly Readonly<{
      sectionId: string;
      path: string;
    }>[];
    baselineAbsentReaderBasePathCount: number;
    baselineCatalogReferencesOnAbsentBasePaths: number;
    baselineAbsentReaderBasePathsSha256: string;
    finalAbsentReaderBasePathCount: number;
    finalCatalogReferencesOnAbsentBasePaths: number;
    finalAbsentReaderBasePathsSha256: string;
    baselineMissingReaderFragmentHrefCount: number;
    baselineMissingReaderFragmentHrefsSha256: string;
    finalMissingReaderFragmentHrefCount: number;
    finalMissingReaderFragmentHrefsSha256: string;
    rawReaderBasePathClosures: readonly Readonly<{
      path: string;
      catalogReferenceCount: number;
    }>[];
    semanticAggregateOnlyTargets: readonly string[];
    fullReaderRouteParity: false;
  }>;
  semanticOverlay: Readonly<{
    policy: "include-all-approved";
    includedAsCompleteSet: true;
    approvedLinkCount: number;
    lowerCompiledLinkCount: number;
    lowerProjectedLinkCount: number;
    individuallyApplicableLinkCount: number;
    groupedApplicableLinkCount: number;
    linkIds: readonly string[];
    blockGroupCount: number;
    groupedApplicationSha256: string;
    blockGroups: readonly Readonly<{
      workId: string;
      sectionId: string;
      blockId: string;
      linkIds: readonly string[];
    }>[];
    applicationAssembled: true;
    sourceWorkPageWorkId: string;
    sourceWorkPagePath: string;
    sourceWorkPageRendered: true;
    sourceWorkPageLinkCount: number;
    sourceWorkPageLinkIds: readonly string[];
    sourceWorkPageLinkIdsSha256: string;
    sourceWorkPageRenderedBlockGroupCount: number;
    sourceWorkPageRenderedAnchorCount: number;
    sourceWorkPageRenderedAnchorsSha256: string;
  }>;
  projections: Readonly<{
    searchEntryCount: number;
    progressEntryCount: number;
    routePlanStaticParamCount: number;
    applicationStaticParamCount: number;
    explicitRedirectCount: number;
    canonicalSlashRedirectCount: number;
    semanticSlashProbes: readonly Readonly<{
      from: string;
      to: string;
      status: 308;
    }>[];
    searchEntriesSha256: string;
    progressEntriesSha256: string;
    routePlanActivePathsSha256: string;
    routePlanStaticParamsSha256: string;
    applicationStaticParamsSha256: string;
  }>;
  identities: Readonly<{
    baselineContentBuildId: string;
    baselineReaderBuildId: string;
    finalContentBuildId: string;
    finalReaderBuildId: string;
    sourceWorkInputsSha256: string;
    adaptedWorkInputsSha256: string;
    semanticLinkInputsSha256: string;
    finalApplicationBuildId: string;
    adapterIdentitySha256: string;
    semanticRegistrySha256: string;
    rawCatalogSha256: string;
    preparedCatalogSha256: string;
    inputAuthoritiesSha256: string;
  }>;
  evidenceSha256: string;
}>;

export type CoherencePublisherContentProof = Readonly<{
  workInputs: readonly WorkContentInput[];
  content: PublicationContentEnvelope;
  reader: PublicationReaderEnvelope;
  search: ReaderSearchIndex;
  progress: ReaderProgressCatalog;
  routePlan: PublisherNextRoutePlan;
  application: PublicationNextApplication;
  evidence: CoherencePublisherContentEvidence;
}>;

type SectionPartition = Readonly<{
  workId: string;
  sourceSection: SectionContentInput;
  catalogSection: CompiledSection;
  expectedBodyBlocks: readonly MarkdownBlockInput[];
  bodyBlocks: readonly MarkdownBlockInput[];
  structuralBlocks: readonly MarkdownBlockInput[];
}>;

type StructuralPartition = Readonly<{
  bySectionId: ReadonlyMap<string, SectionPartition>;
  workEvidence: readonly CoherencePublisherStructuralWorkEvidence[];
  bodyBlockCount: number;
  bodyWordCount: number;
  structuralBlockCount: number;
  structuralWordCount: number;
  structuralSourceRange: Readonly<{
    before: number;
    inside: number;
    after: number;
  }>;
  appendedSectionTraversalInversions: number;
  partitionSha256: string;
}>;

type SemanticRouteAddition = Readonly<{
  sectionId: string;
  path: string;
}>;

function fail(message: string): never {
  throw new Error(`Coherence Publisher content proof: ${message}`);
}

function exact<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    fail(`${label} changed. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function exactJson(actual: unknown, expected: unknown, label: string): void {
  const actualHash = digest(actual);
  const expectedHash = digest(expected);
  if (actualHash !== expectedHash) {
    fail(`${label} changed. Expected ${expectedHash}, received ${actualHash}.`);
  }
}

function digest(value: unknown): string {
  return hashCanonicalJson(value as JSONValue);
}

function authorityValue(value: unknown): JSONValue {
  if (value === undefined) return ["undefined"];
  if (value === null) return ["null"];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "number" && Number.isFinite(value)) {
    return ["number", value];
  }
  if (Array.isArray(value)) {
    return ["array", ...value.map(authorityValue)];
  }
  if (value instanceof Uint8Array) {
    return [
      "bytes",
      value.byteLength,
      createHash("sha256").update(value).digest("hex"),
    ];
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("catalog authority contains a non-plain object.");
    }
    return [
      "object",
      ...Object.keys(value)
        .sort()
        .map((key) => [
          key,
          authorityValue(
            (value as Readonly<Record<string, unknown>>)[key],
          ),
        ]),
    ];
  }
  fail("catalog authority contains a non-JSON value.");
}

function stableCatalogAuthority(
  catalog: CompiledCatalog,
): Omit<CompiledCatalog, "gitRevision"> {
  const { gitRevision, ...stable } = catalog;
  if (typeof gitRevision !== "string" || gitRevision.length === 0) {
    fail("catalog authority has no Git revision.");
  }
  return stable;
}

function contentAuthorityIdentities(
  authorities: CoherencePublisherContentAuthorities,
): Readonly<{
  semanticRegistrySha256: string;
  rawCatalogSha256: string;
  preparedCatalogSha256: string;
}> {
  return Object.freeze({
    semanticRegistrySha256: digest(authorities.semanticRegistry),
    rawCatalogSha256: digest(
      authorityValue(stableCatalogAuthority(authorities.rawCatalog)),
    ),
    preparedCatalogSha256: digest(
      authorityValue(stableCatalogAuthority(authorities.preparedCatalog)),
    ),
  });
}

function inputAuthoritiesSha256(
  authorities: CoherencePublisherContentAuthorities,
): string {
  return digest(
    authorityValue({
      loaded: authorities.loaded,
      sourceWorks: authorities.sourceWorks,
      preparedCatalog: stableCatalogAuthority(authorities.preparedCatalog),
      rawCatalog: stableCatalogAuthority(authorities.rawCatalog),
      semanticRegistry: authorities.semanticRegistry,
      semanticLinkPolicy: authorities.semanticLinkPolicy,
    }),
  );
}

function assertReviewedContentAuthorityIdentities(
  identities: ReturnType<typeof contentAuthorityIdentities>,
): void {
  exact(
    identities.semanticRegistrySha256,
    EXPECTED_SEMANTIC_REGISTRY_SHA256,
    "semantic registry authority identity",
  );
  exact(
    identities.rawCatalogSha256,
    EXPECTED_RAW_CATALOG_SHA256,
    "raw catalog authority identity",
  );
  exact(
    identities.preparedCatalogSha256,
    EXPECTED_PREPARED_CATALOG_SHA256,
    "prepared catalog authority identity",
  );
}

function withoutKeys<T extends object>(
  value: T,
  keys: readonly (keyof T)[],
): Partial<T> {
  const copy: Partial<T> = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

function diagnosticsSummary(diagnostics: readonly Diagnostic[]): string {
  return diagnostics
    .map(({ code, documentPath, path }) =>
      [code, documentPath, path].filter(Boolean).join(" "),
    )
    .join(", ");
}

function requireValid<T>(
  result: ValidationResult<T>,
  label: string,
): T {
  if (!result.valid) {
    fail(`${label} failed with ${diagnosticsSummary(result.diagnostics)}.`);
  }
  return result.value;
}

function assertAuthorityTree(authorityRoot: string, label: string): void {
  assertCensusAuthorityPath({
    repositoryRoot: repoRoot,
    authorityPath: authorityRoot,
    kind: "directory",
    label,
  });
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        fail(`${label} contains a symbolic entry at '${entryPath}'.`);
      }
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        fail(`${label} contains a non-file entry at '${entryPath}'.`);
      }
    }
  };
  walk(authorityRoot);
}

function assertFilesystemAuthorities(): void {
  const files = [
    path.join(repoRoot, "package.json"),
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
  for (const authorityPath of files) {
    assertCensusAuthorityPath({
      repositoryRoot: repoRoot,
      authorityPath,
      kind: "file",
      label: "content proof authority",
    });
  }
  assertCensusAuthorityPath({
    repositoryRoot: repoRoot,
    authorityPath: generatedManuscriptsRoot,
    kind: "directory",
    label: "generated manuscript authority",
  });
  assertAuthorityTree(generatedSectionsRoot, "generated section authority");
  assertCensusAuthorityPath({
    repositoryRoot: repoRoot,
    authorityPath: editorialCorpusRoot,
    kind: "directory",
    label: "semantic authority root",
  });
  const packageIdentity = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as { name?: unknown; version?: unknown };
  exact(
    packageIdentity.name,
    COHERENCE_ADAPTER_IDENTITY.package,
    "adapter package identity",
  );
  exact(
    packageIdentity.version,
    COHERENCE_ADAPTER_IDENTITY.version,
    "adapter package version",
  );
}

function manuscriptSourcesByWork(
  loaded: LoadedPublicationCompilationSources,
): ReadonlyMap<string, Extract<(typeof loaded.sources)[number], { contents: string }>> {
  const sources = new Map<
    string,
    Extract<(typeof loaded.sources)[number], { contents: string }>
  >();
  for (const source of loaded.sources) {
    if (
      source.role !== "manuscript" ||
      source.entityId === undefined ||
      typeof source.contents !== "string"
    ) {
      continue;
    }
    if (sources.has(source.entityId)) {
      fail(`work '${source.entityId}' has more than one manuscript source.`);
    }
    sources.set(
      source.entityId,
      source as Extract<(typeof loaded.sources)[number], { contents: string }>,
    );
  }
  exact(sources.size, EXPECTED_WORK_COUNT, "manuscript source count");
  return sources;
}

function sourceLineStarts(source: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function lineNumberAtOffset(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? Number.MAX_SAFE_INTEGER) <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function assertBlockSourceRange(
  block: MarkdownBlockInput,
  sourcePath: string,
  sourceText: string,
  label: string,
): void {
  exact(block.provenance.sourcePath, sourcePath, `${label} source path`);
  const { startOffset, endOffset } = block.provenance;
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    endOffset <= startOffset ||
    endOffset > sourceText.length
  ) {
    fail(`${label} has an invalid source range.`);
  }
  exact(
    sourceText.slice(startOffset, endOffset),
    block.markdown,
    `${label} source bytes`,
  );
}

function assertCatalogBodySourceLines(
  blocks: readonly MarkdownBlockInput[],
  catalogSection: CompiledSection,
  lineStarts: readonly number[],
): void {
  const sourceLines = catalogSection.sourceLineNumbers;
  if (
    !Array.isArray(sourceLines) ||
    sourceLines.length === 0 ||
    sourceLines.some((line) => !Number.isInteger(line) || line < 1)
  ) {
    fail(`catalog section '${catalogSection.sectionId}' has invalid source lines.`);
  }
  const allowed = new Set(sourceLines);
  for (const block of blocks) {
    const startLine = lineNumberAtOffset(
      lineStarts,
      block.provenance.startOffset,
    );
    const endLine = lineNumberAtOffset(
      lineStarts,
      block.provenance.endOffset - 1,
    );
    for (let line = startLine; line <= endLine; line += 1) {
      if (!allowed.has(line)) {
        fail(
          `catalog body block '${block.id}' escapes source lines for '${catalogSection.sectionId}'.`,
        );
      }
    }
  }
}

function blockOccupiesCatalogBodyLines(
  block: MarkdownBlockInput,
  catalogSection: CompiledSection,
  lineStarts: readonly number[],
): boolean {
  const sourceLines = catalogSection.sourceLineNumbers;
  if (!Array.isArray(sourceLines) || sourceLines.length === 0) return false;
  const allowed = new Set(sourceLines);
  const startLine = lineNumberAtOffset(
    lineStarts,
    block.provenance.startOffset,
  );
  const endLine = lineNumberAtOffset(
    lineStarts,
    block.provenance.endOffset - 1,
  );
  for (let line = startLine; line <= endLine; line += 1) {
    if (!allowed.has(line)) return false;
  }
  return true;
}

function blockSemantics(block: MarkdownBlockInput): Readonly<{
  kind: string;
  markdown: string;
  text: string;
}> {
  return {
    kind: block.kind,
    markdown: block.markdown,
    text: block.text,
  };
}

function classifyStructuralPartition(
  authorities: CoherencePublisherContentAuthorities,
): StructuralPartition {
  const manuscripts = manuscriptSourcesByWork(authorities.loaded);
  const rawSectionsById = new Map(
    authorities.rawCatalog.sections.map((section) => [section.sectionId, section]),
  );
  exact(rawSectionsById.size, EXPECTED_SECTION_COUNT, "raw catalog section identities");
  const partitions = new Map<string, SectionPartition>();
  const partitionRows: unknown[] = [];
  const workEvidence: CoherencePublisherStructuralWorkEvidence[] = [];
  const allBlockIds = new Set<string>();
  let bodyBlockCount = 0;
  let bodyWordCount = 0;
  let structuralBlockCount = 0;
  let structuralWordCount = 0;
  const structuralSourceRange = { before: 0, inside: 0, after: 0 };
  let appendedSectionTraversalInversions = 0;

  for (const work of authorities.sourceWorks) {
    const manuscript = manuscripts.get(work.workId);
    if (!manuscript) fail(`work '${work.workId}' has no manuscript source.`);
    const lineStarts = sourceLineStarts(manuscript.contents);
    let previousEnd = -1;
    let workBodyBlockCount = 0;
    let workBodyWordCount = 0;
    let workStructuralBlockCount = 0;
    let workStructuralWordCount = 0;
    let structuralOwnerSectionCount = 0;
    let structuralRunCount = 0;
    let previousKind: "body" | "structural" | undefined;
    const workBlockKinds: Array<"body" | "structural"> = [];

    for (const section of work.sections) {
      const catalogSection = rawSectionsById.get(section.id);
      if (!catalogSection) {
        fail(`source section '${section.id}' is absent from the raw catalog.`);
      }
      exact(
        catalogSection.volumeId,
        work.workId,
        `catalog work owner for '${section.id}'`,
      );
      exact(
        catalogSection.sourceDoc,
        manuscript.path,
        `catalog source path for '${section.id}'`,
      );
      const sourceParagraphStart = catalogSection.sourceParagraphStart;
      const sourceParagraphEnd = catalogSection.sourceParagraphEnd;
      if (
        !Number.isInteger(sourceParagraphStart) ||
        !Number.isInteger(sourceParagraphEnd) ||
        (sourceParagraphStart ?? -1) < 1 ||
        (sourceParagraphEnd ?? -1) < (sourceParagraphStart ?? 0)
      ) {
        fail(`catalog section '${section.id}' has an invalid source range.`);
      }
      const compiledBody = requireValid(
        compileMarkdownWork({
          workId: work.workId,
          sectionId: section.id,
          title: section.title,
          sourcePath: manuscript.path,
          markdown: catalogSection.body,
        }),
        `catalog body compilation for '${section.id}'`,
      );
      const expectedBodyBlocks = compiledBody.work.sections[0]?.blocks ?? [];
      if (section.blocks.length < expectedBodyBlocks.length) {
        fail(`source section '${section.id}' has fewer blocks than its catalog body.`);
      }
      const bodyIndexes: number[] = [];
      const candidateIndexes = expectedBodyBlocks.map((expectedBlock) => {
        const expectedSemantics = digest(blockSemantics(expectedBlock));
        return section.blocks.flatMap((block, index) =>
          blockOccupiesCatalogBodyLines(block, catalogSection, lineStarts) &&
          digest(blockSemantics(block)) === expectedSemantics
            ? [index]
            : [],
        );
      });
      const completionMemo = new Map<string, boolean>();
      const canComplete = (bodyIndex: number, sourceCursor: number): boolean => {
        if (bodyIndex === expectedBodyBlocks.length) return true;
        const memoKey = `${bodyIndex}:${sourceCursor}`;
        const memoized = completionMemo.get(memoKey);
        if (memoized !== undefined) return memoized;
        const result = candidateIndexes[bodyIndex]!.some(
          (index) =>
            index >= sourceCursor && canComplete(bodyIndex + 1, index + 1),
        );
        completionMemo.set(memoKey, result);
        return result;
      };
      let cursor = 0;
      for (const bodyIndex of expectedBodyBlocks.keys()) {
        const eligibleIndexes = candidateIndexes[bodyIndex]!.filter(
          (index) =>
            index >= cursor && canComplete(bodyIndex + 1, index + 1),
        );
        if (eligibleIndexes.length !== 1) {
          fail(
            `catalog body block ${bodyIndex} has ${eligibleIndexes.length} ordered source owners in '${section.id}'.`,
          );
        }
        const sourceIndex = eligibleIndexes[0]!;
        bodyIndexes.push(sourceIndex);
        cursor = sourceIndex + 1;
      }
      const bodyIndexSet = new Set(bodyIndexes);
      const bodyBlocks = bodyIndexes.map((index) => section.blocks[index]!);
      const structuralBlocks = section.blocks.filter(
        (_, index) => !bodyIndexSet.has(index),
      );
      exact(
        bodyBlocks.length,
        expectedBodyBlocks.length,
        `body block count for '${section.id}'`,
      );
      bodyBlocks.forEach((block, index) => {
        exactJson(
          blockSemantics(block),
          blockSemantics(expectedBodyBlocks[index]!),
          `body block semantics for '${section.id}' at ${index}`,
        );
      });
      assertCatalogBodySourceLines(bodyBlocks, catalogSection, lineStarts);
      if (structuralBlocks.length > 0) structuralOwnerSectionCount += 1;

      for (const [index, block] of section.blocks.entries()) {
        const scopedBlockId = `${work.workId}\u0000${section.id}\u0000${block.id}`;
        if (allBlockIds.has(scopedBlockId)) {
          fail(`block identity '${block.id}' is not unique in '${section.id}'.`);
        }
        allBlockIds.add(scopedBlockId);
        assertBlockSourceRange(
          block,
          manuscript.path,
          manuscript.contents,
          `block '${block.id}'`,
        );
        if (block.provenance.startOffset < previousEnd) {
          fail(`block '${block.id}' changed manuscript source order.`);
        }
        previousEnd = block.provenance.endOffset;
        const kind = bodyIndexSet.has(index) ? "body" : "structural";
        workBlockKinds.push(kind);
        if (kind === "structural") {
          const sourceLine = lineNumberAtOffset(
            lineStarts,
            block.provenance.startOffset,
          );
          const range =
            sourceLine < (sourceParagraphStart as number)
              ? "before"
              : sourceLine <= (sourceParagraphEnd as number)
                ? "inside"
                : "after";
          structuralSourceRange[range] += 1;
        }
        if (kind === "structural" && previousKind !== "structural") {
          structuralRunCount += 1;
        }
        previousKind = kind;
      }

      const sectionBodyWordCount = bodyBlocks.reduce(
        (total, block) => total + countWords(block.text),
        0,
      );
      const sectionStructuralWordCount = structuralBlocks.reduce(
        (total, block) => total + countWords(block.text),
        0,
      );
      workBodyBlockCount += bodyBlocks.length;
      workBodyWordCount += sectionBodyWordCount;
      workStructuralBlockCount += structuralBlocks.length;
      workStructuralWordCount += sectionStructuralWordCount;
      partitions.set(section.id, {
        workId: work.workId,
        sourceSection: section,
        catalogSection,
        expectedBodyBlocks,
        bodyBlocks,
        structuralBlocks,
      });
      partitionRows.push({
        workId: work.workId,
        sectionId: section.id,
        bodyBlockIds: bodyBlocks.map(({ id }) => id),
        structuralBlockIds: structuralBlocks.map(({ id }) => id),
        blockRanges: section.blocks.map(({ id, provenance }) => ({
          id,
          sourcePath: provenance.sourcePath,
          startOffset: provenance.startOffset,
          endOffset: provenance.endOffset,
        })),
      });
    }

    const expectedStructural = EXPECTED_STRUCTURAL_BLOCKS_BY_WORK[
      work.workId as keyof typeof EXPECTED_STRUCTURAL_BLOCKS_BY_WORK
    ];
    if (expectedStructural === undefined) {
      fail(`work '${work.workId}' is absent from the structural census.`);
    }
    exact(
      workStructuralBlockCount,
      expectedStructural,
      `structural block count for '${work.workId}'`,
    );
    if (structuralRunCount < 2) {
      fail(`work '${work.workId}' no longer proves structural interleaving.`);
    }
    let remainingBodyBlocks = workBlockKinds.filter(
      (kind) => kind === "body",
    ).length;
    let workTraversalInversions = 0;
    for (const kind of workBlockKinds) {
      if (kind === "body") {
        remainingBodyBlocks -= 1;
      } else {
        workTraversalInversions += remainingBodyBlocks;
      }
    }
    const expectedInversions = EXPECTED_APPENDED_INVERSIONS_BY_WORK[
      work.workId as keyof typeof EXPECTED_APPENDED_INVERSIONS_BY_WORK
    ];
    if (expectedInversions === undefined) {
      fail(`work '${work.workId}' is absent from the traversal census.`);
    }
    exact(
      workTraversalInversions,
      expectedInversions,
      `appended structural traversal inversions for '${work.workId}'`,
    );
    workEvidence.push({
      workId: work.workId,
      bodyBlockCount: workBodyBlockCount,
      bodyWordCount: workBodyWordCount,
      structuralBlockCount: workStructuralBlockCount,
      structuralWordCount: workStructuralWordCount,
      structuralOwnerSectionCount,
      structuralRunCount,
      appendedSectionTraversalInversions: workTraversalInversions,
    });
    bodyBlockCount += workBodyBlockCount;
    bodyWordCount += workBodyWordCount;
    structuralBlockCount += workStructuralBlockCount;
    structuralWordCount += workStructuralWordCount;
    appendedSectionTraversalInversions += workTraversalInversions;
  }

  exact(partitions.size, EXPECTED_SECTION_COUNT, "partition section count");
  exact(allBlockIds.size, EXPECTED_BLOCK_COUNT, "partition block identities");
  exact(bodyBlockCount, EXPECTED_BODY_BLOCK_COUNT, "catalog body block count");
  exact(bodyWordCount, EXPECTED_BODY_WORD_COUNT, "catalog body word count");
  exact(
    structuralBlockCount,
    EXPECTED_STRUCTURAL_BLOCK_COUNT,
    "structural block count",
  );
  exact(
    structuralWordCount,
    EXPECTED_STRUCTURAL_WORD_COUNT,
    "structural word count",
  );
  exact(
    structuralSourceRange.before,
    EXPECTED_STRUCTURAL_BLOCKS_BEFORE_RANGE,
    "structural blocks before catalog ranges",
  );
  exact(
    structuralSourceRange.inside,
    EXPECTED_STRUCTURAL_BLOCKS_INSIDE_RANGE,
    "structural blocks inside catalog ranges",
  );
  exact(
    structuralSourceRange.after,
    EXPECTED_STRUCTURAL_BLOCKS_AFTER_RANGE,
    "structural blocks after catalog ranges",
  );
  exact(
    appendedSectionTraversalInversions,
    EXPECTED_APPENDED_TRAVERSAL_INVERSIONS,
    "appended structural traversal inversions",
  );
  exact(
    bodyBlockCount + structuralBlockCount,
    EXPECTED_BLOCK_COUNT,
    "closed block partition",
  );
  exact(
    bodyWordCount + structuralWordCount,
    EXPECTED_WORD_COUNT,
    "closed word partition",
  );

  return Object.freeze({
    bySectionId: partitions,
    workEvidence: Object.freeze(workEvidence.map((entry) => Object.freeze(entry))),
    bodyBlockCount,
    bodyWordCount,
    structuralBlockCount,
    structuralWordCount,
    structuralSourceRange: Object.freeze({ ...structuralSourceRange }),
    appendedSectionTraversalInversions,
    partitionSha256: digest(partitionRows),
  });
}

function assertCatalogAuthorities(
  authorities: CoherencePublisherContentAuthorities,
): void {
  exact(authorities.preparedCatalog.stats.volumeCount, EXPECTED_WORK_COUNT, "prepared catalog work count");
  exact(authorities.rawCatalog.stats.volumeCount, EXPECTED_WORK_COUNT, "raw catalog work count");
  exact(authorities.preparedCatalog.stats.sectionCount, EXPECTED_SECTION_COUNT, "prepared catalog section count");
  exact(authorities.rawCatalog.stats.sectionCount, EXPECTED_SECTION_COUNT, "raw catalog section count");
  exact(authorities.preparedCatalog.stats.wordCount, EXPECTED_CATALOG_WORD_COUNT, "prepared catalog word count");
  exact(authorities.rawCatalog.stats.wordCount, EXPECTED_CATALOG_WORD_COUNT, "raw catalog word count");
  const expectedPrepared = applySemanticReferences({
    sections: authorities.rawCatalog.sections,
    volumes: authorities.rawCatalog.volumes,
    registry: authorities.semanticRegistry,
  });
  exactJson(
    authorities.preparedCatalog.sections.map(({ sectionId, body }) => ({
      sectionId,
      body,
    })),
    expectedPrepared.map(({ sectionId, body }) => ({ sectionId, body })),
    "prepared catalog semantic projection",
  );
  const workIds = authorities.sourceWorks.map(({ workId }) => workId);
  exactJson(
    workIds,
    authorities.rawCatalog.volumes.map(({ volumeId }) => volumeId),
    "source work order",
  );
  for (const work of authorities.sourceWorks) {
    exactJson(
      work.sections.map(({ id }) => id),
      authorities.rawCatalog.sections
        .filter(({ volumeId }) => volumeId === work.workId)
        .map(({ sectionId }) => sectionId),
      `source section order for '${work.workId}'`,
    );
  }
}

function readerBaseRouteGap(
  catalog: CompiledCatalog,
  activePaths: ReadonlySet<string>,
): Readonly<{
  paths: readonly Readonly<{ path: string; sectionIds: readonly string[] }>[];
  catalogReferenceCount: number;
}> {
  const missing = new Map<string, string[]>();
  for (const section of catalog.sections) {
    const basePath = section.readerHref.split("#", 1)[0]!;
    if (activePaths.has(basePath)) continue;
    const sectionIds = missing.get(basePath) ?? [];
    sectionIds.push(section.sectionId);
    missing.set(basePath, sectionIds);
  }
  const paths = [...missing]
    .map(([path, sectionIds]) => ({
      path,
      sectionIds: Object.freeze(sectionIds),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({
    paths: Object.freeze(paths.map((entry) => Object.freeze(entry))),
    catalogReferenceCount: paths.reduce(
      (total, entry) => total + entry.sectionIds.length,
      0,
    ),
  });
}

function readerFragmentHrefGap(
  catalog: CompiledCatalog,
  reader: PublicationReaderEnvelope,
): readonly Readonly<{ sectionId: string; readerHref: string }>[] {
  const renderedFragmentHrefs = new Set<string>();
  for (const work of reader.works) {
    for (const section of work.sections) {
      if (section.readerAddress !== null && section.domId !== null) {
        renderedFragmentHrefs.add(
          `${section.readerAddress.path}#${section.domId}`,
        );
      }
      for (const block of section.blocks) {
        if (block.readerAddress !== null) {
          renderedFragmentHrefs.add(
            `${block.readerAddress.path}#${block.domId}`,
          );
        }
      }
    }
  }
  return Object.freeze(
    catalog.sections
      .flatMap(({ readerHref, sectionId }) =>
        readerHref.includes("#") && !renderedFragmentHrefs.has(readerHref)
          ? [Object.freeze({ readerHref, sectionId })]
          : [],
      )
      .sort(
        (left, right) =>
          left.readerHref.localeCompare(right.readerHref) ||
          left.sectionId.localeCompare(right.sectionId),
      ),
  );
}

function approvedSemanticLinkIds(
  registry: SemanticLinkRegistry,
): readonly string[] {
  const ids = registry.occurrences
    .filter(({ decision }) => decision === "link")
    .map(({ occurrenceId }) => occurrenceId)
    .sort();
  exact(ids.length, EXPECTED_SEMANTIC_LINK_COUNT, "approved semantic link IDs");
  exact(
    new Set(ids).size,
    ids.length,
    "unique approved semantic link IDs",
  );
  return Object.freeze(ids);
}

function deriveSemanticRouteAdditions(
  authorities: CoherencePublisherContentAuthorities,
  baselineActivePaths: ReadonlySet<string>,
): Readonly<{
  additions: readonly SemanticRouteAddition[];
  edits: ReturnType<typeof planSemanticReferenceBodyEdits>;
}> {
  const edits = planSemanticReferenceBodyEdits({
    sections: authorities.rawCatalog.sections,
    volumes: authorities.rawCatalog.volumes,
    registry: authorities.semanticRegistry,
  });
  exact(edits.length, EXPECTED_SEMANTIC_LINK_COUNT, "approved semantic link count");
  const targets = new Map<string, string>();
  for (const edit of edits) {
    const existing = targets.get(edit.targetSectionId);
    if (existing !== undefined && existing !== edit.href) {
      fail(`semantic target '${edit.targetSectionId}' resolves to multiple routes.`);
    }
    targets.set(edit.targetSectionId, edit.href);
  }
  const additions = [...targets]
    .filter(([, targetPath]) => !baselineActivePaths.has(targetPath))
    .map(([sectionId, path]) => Object.freeze({ sectionId, path }))
    .sort((left, right) => left.sectionId.localeCompare(right.sectionId));
  exactJson(
    additions,
    EXPECTED_SEMANTIC_ROUTE_ADDITIONS,
    "semantic authority route additions",
  );
  return Object.freeze({ additions: Object.freeze(additions), edits });
}

function applySemanticRouteAdditions(
  sourceWorks: readonly WorkContentInput[],
  additions: readonly SemanticRouteAddition[],
): readonly WorkContentInput[] {
  const additionsBySection = new Map(
    additions.map((addition) => [addition.sectionId, addition]),
  );
  const applied = new Set<string>();
  const works = sourceWorks.map((work) =>
      Object.freeze({
        ...work,
        adapter: COHERENCE_ADAPTER_IDENTITY,
        sections: Object.freeze(
          work.sections.map((section) => {
            const addition = additionsBySection.get(section.id);
            if (!addition) return section;
            if (Object.hasOwn(section.routes ?? {}, SEMANTIC_ROUTE_NAME)) {
              fail(`section '${section.id}' already owns '${SEMANTIC_ROUTE_NAME}'.`);
            }
            applied.add(section.id);
            return Object.freeze({
              ...section,
              routes: Object.freeze({
                ...(section.routes ?? {}),
                [SEMANTIC_ROUTE_NAME]: Object.freeze({ path: addition.path }),
              }),
              activeRouteNames: Object.freeze([
                ...(section.activeRouteNames ?? []),
                SEMANTIC_ROUTE_NAME,
              ]),
            });
          }),
        ),
      }),
    );
  exact(applied.size, additions.length, "applied semantic route count");
  return Object.freeze(works);
}

function findSection(
  works: readonly WorkContentInput[],
  sectionId: string,
): Readonly<{ work: WorkContentInput; section: SectionContentInput }> {
  const matches = works.flatMap((work) =>
    work.sections
      .filter((section) => section.id === sectionId)
      .map((section) => ({ work, section })),
  );
  if (matches.length !== 1) {
    fail(`section '${sectionId}' has ${matches.length} work input owners.`);
  }
  return matches[0]!;
}

function routeNameForTarget(
  works: readonly WorkContentInput[],
  sectionId: string,
  targetPath: string,
): Readonly<{ workId: string; routeName: string }> {
  const { work, section } = findSection(works, sectionId);
  const names = (section.activeRouteNames ?? []).filter(
    (routeName) => section.routes?.[routeName]?.path === targetPath,
  );
  if (names.length !== 1) {
    fail(
      `semantic target '${sectionId}' has ${names.length} active routes at '${targetPath}'.`,
    );
  }
  return Object.freeze({ workId: work.workId, routeName: names[0]! });
}

function createSemanticLinkInputs(
  works: readonly WorkContentInput[],
  partition: StructuralPartition,
  edits: ReturnType<typeof planSemanticReferenceBodyEdits>,
): readonly ResolvedContentLinkInput[] {
  const links = edits.map((edit): ResolvedContentLinkInput => {
    const source = partition.bySectionId.get(edit.sourceSectionId);
    if (!source) fail(`semantic source '${edit.sourceSectionId}' has no partition.`);
    const candidateIndexes = source.expectedBodyBlocks.flatMap((block, index) =>
      edit.rawStart >= block.provenance.startOffset &&
      edit.rawEnd <= block.provenance.endOffset
        ? [index]
        : [],
    );
    if (candidateIndexes.length !== 1) {
      fail(`semantic link '${edit.occurrenceId}' has no unique catalog body block.`);
    }
    const bodyBlockIndex = candidateIndexes[0]!;
    const expectedBlock = source.expectedBodyBlocks[bodyBlockIndex]!;
    const authorityBlock = source.bodyBlocks[bodyBlockIndex]!;
    const localStart = edit.rawStart - expectedBlock.provenance.startOffset;
    const localEnd = edit.rawEnd - expectedBlock.provenance.startOffset;
    const rawLabel = source.catalogSection.body.slice(edit.rawStart, edit.rawEnd);
    exact(
      authorityBlock.markdown.slice(localStart, localEnd),
      rawLabel,
      `semantic source range for '${edit.occurrenceId}'`,
    );
    const target = routeNameForTarget(works, edit.targetSectionId, edit.href);
    return Object.freeze({
      id: edit.occurrenceId,
      source: Object.freeze({
        kind: "source" as const,
        workId: source.workId,
        sectionId: edit.sourceSectionId,
        blockId: authorityBlock.id,
        occurrence: Object.freeze({
          sourcePath: authorityBlock.provenance.sourcePath,
          startOffset: authorityBlock.provenance.startOffset + localStart,
          endOffset: authorityBlock.provenance.startOffset + localEnd,
        }),
      }),
      target: Object.freeze({
        kind: "section" as const,
        workId: target.workId,
        sectionId: edit.targetSectionId,
        routeName: target.routeName,
      }),
      href: edit.href,
      label: rawLabel,
    });
  });
  return Object.freeze(
    [...links].sort((left, right) => left.id.localeCompare(right.id)),
  );
}

function classifySemanticLinkApplication(
  reader: PublicationReaderEnvelope,
): Readonly<{
  linkIds: readonly string[];
  individuallyApplicableLinkCount: number;
  groupedApplicableLinkCount: number;
  blockGroups: readonly Readonly<{
    workId: string;
    sectionId: string;
    blockId: string;
    linkIds: readonly string[];
  }>[];
  groupedApplicationSha256: string;
}> {
  const blocks = new Map<string, PublicationReaderEnvelope["works"][number]["sections"][number]["blocks"][number]>(
    reader.works.flatMap((work) =>
      work.sections.flatMap((section) =>
        section.blocks.map((block) => [
          `${work.id}\u0000${section.id}\u0000${block.id}`,
          block,
        ] as const),
      ),
    ),
  );
  const linksByBlock = new Map<string, ReaderBlockMarkdownLink[]>();
  for (const link of reader.links) {
    if (link.source.kind !== "block-markdown") {
      fail(`semantic link '${link.id}' did not project to block Markdown.`);
    }
    const blockKey = `${link.source.workId}\u0000${link.source.sectionId}\u0000${link.source.blockId}`;
    const block = blocks.get(blockKey);
    if (!block) fail(`semantic link '${link.id}' names an absent Reader block.`);
    const application = applyReaderLinksToMarkdown(
      block,
      [link as ReaderBlockMarkdownLink],
    );
    if (!application.valid) {
      fail(
        `semantic link '${link.id}' does not apply individually: ${diagnosticsSummary(application.diagnostics)}.`,
      );
    }
    const grouped = linksByBlock.get(blockKey) ?? [];
    grouped.push(link as ReaderBlockMarkdownLink);
    linksByBlock.set(blockKey, grouped);
  }
  const visitedGroups = new Set<string>();
  const blockGroups: Array<Readonly<{
    workId: string;
    sectionId: string;
    blockId: string;
    linkIds: readonly string[];
  }>> = [];
  let groupedApplicableLinkCount = 0;
  for (const work of reader.works) {
    for (const section of work.sections) {
      for (const block of section.blocks) {
        const blockKey = `${work.id}\u0000${section.id}\u0000${block.id}`;
        const grouped = linksByBlock.get(blockKey);
        if (grouped === undefined) continue;
        grouped.sort(
          (left, right) =>
            left.source.range.start - right.source.range.start ||
            left.source.range.end - right.source.range.end ||
            left.id.localeCompare(right.id),
        );
        const application = applyReaderLinksToMarkdown(block, grouped);
        if (!application.valid) {
          fail(
            `semantic link group '${blockKey}' does not apply atomically: ${diagnosticsSummary(application.diagnostics)}.`,
          );
        }
        visitedGroups.add(blockKey);
        groupedApplicableLinkCount += grouped.length;
        blockGroups.push(Object.freeze({
          workId: work.id,
          sectionId: section.id,
          blockId: block.id,
          linkIds: Object.freeze(grouped.map(({ id }) => id)),
        }));
      }
    }
  }
  exact(
    visitedGroups.size,
    linksByBlock.size,
    "visited semantic link block group count",
  );
  exact(
    blockGroups.length,
    EXPECTED_SEMANTIC_LINK_BLOCK_GROUP_COUNT,
    "semantic link block group count",
  );
  exact(
    groupedApplicableLinkCount,
    EXPECTED_SEMANTIC_LINK_COUNT,
    "grouped applicable semantic link count",
  );
  const linkIds = [...reader.links.map(({ id }) => id)].sort();
  exact(linkIds.length, EXPECTED_SEMANTIC_LINK_COUNT, "applicable link IDs");
  exact(new Set(linkIds).size, linkIds.length, "unique applicable link IDs");
  const groupedApplicationSha256 = digest(blockGroups);
  exact(
    groupedApplicationSha256,
    EXPECTED_GROUPED_SEMANTIC_APPLICATION_SHA256,
    "grouped semantic application identity",
  );
  return Object.freeze({
    linkIds: Object.freeze(linkIds),
    individuallyApplicableLinkCount: reader.links.length,
    groupedApplicableLinkCount,
    blockGroups: Object.freeze(blockGroups),
    groupedApplicationSha256,
  });
}

async function verifySourceWorkPageLinks(
  application: PublicationNextApplication,
  routePlan: PublisherNextRoutePlan,
  expectedLinkIds: readonly string[],
): Promise<Readonly<{
  workId: string;
  path: string;
  rendered: true;
  linkIds: readonly string[];
  renderedBlockGroupCount: number;
  renderedAnchorCount: number;
  renderedAnchorsSha256: string;
}>> {
  const sourceWorkIds = new Set(
    application.reader.links.flatMap(({ source }) =>
      source.kind === "block-markdown" ? [source.workId] : [],
    ),
  );
  exact(sourceWorkIds.size, 1, "semantic source work count");
  const workId = [...sourceWorkIds][0]!;
  const routeMatches = application.reader.routes.active.flatMap(
    (route, index) =>
      route.target.kind === "work" && route.target.workId === workId
        ? [{ route, index }]
        : [],
  );
  exact(routeMatches.length, 1, "semantic source work route count");
  const { route, index } = routeMatches[0]!;
  const resolution = application.resolveRoute(
    routePlan.staticParams[index]?.segments,
  );
  if (resolution.status !== "resolved" || resolution.page.kind !== "work") {
    fail(`semantic source work page '${route.path}' did not resolve.`);
  }
  exact(resolution.page.work.id, workId, "semantic source work page identity");
  const linkIds = resolution.page.links.map(({ id }) => id).sort();
  exactJson(linkIds, expectedLinkIds, "semantic source work page link IDs");
  const markup = renderToStaticMarkup(
    await application.renderPage(resolution.page),
  );
  const sourceLinks = application.reader.links
    .flatMap((link) =>
      link.source.kind === "block-markdown" && link.source.workId === workId
        ? [link]
        : [],
    );
  const sourceLinksByBlock = new Map<string, typeof sourceLinks>();
  for (const link of sourceLinks) {
    if (link.source.kind !== "block-markdown") continue;
    const current = sourceLinksByBlock.get(link.source.blockId) ?? [];
    current.push(link);
    sourceLinksByBlock.set(link.source.blockId, current);
  }
  const blockIds = application.reader.works.flatMap((work) =>
    work.sections.flatMap((section) =>
      section.blocks.flatMap((block) =>
        sourceLinksByBlock.has(block.id) ? [block.id] : [],
      ),
    ),
  );
  exact(
    blockIds.length,
    sourceLinksByBlock.size,
    "rendered semantic block traversal identity",
  );
  const renderedAnchors = blockIds.map((blockId) => {
    const opening =
      `<div class="publisher-markdown" data-publisher-block="${blockId}"`;
    const blockStart = markup.indexOf(opening);
    if (blockStart < 0) {
      fail(`rendered source work page omitted semantic block '${blockId}'.`);
    }
    const contentStart = markup.indexOf(">", blockStart) + 1;
    const blockEnd = markup.indexOf("</div>", contentStart);
    if (contentStart === 0 || blockEnd < 0) {
      fail(`rendered semantic block '${blockId}' has invalid HTML bounds.`);
    }
    const anchors = [
      ...markup.slice(contentStart, blockEnd).matchAll(
        /<a href="([^"]+)">([\s\S]*?)<\/a>/gu,
      ),
    ].map((match) => {
      const labelMarkup = match[2]!
        .replace(
          /<span(?: [a-z][a-z0-9:-]*="[^"]*")*>|<\/span>/gu,
          "",
        );
      if (/[<>]/u.test(labelMarkup)) {
        fail(`rendered semantic anchor in '${blockId}' has unexpected markup.`);
      }
      const label = labelMarkup
        .replace(/&#(x[0-9a-f]+|[0-9]+);/giu, (_match, encoded: string) =>
          String.fromCodePoint(
            encoded.toLowerCase().startsWith("x")
              ? Number.parseInt(encoded.slice(1), 16)
              : Number.parseInt(encoded, 10),
          ),
        )
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&apos;", "'");
      return Object.freeze({ href: match[1]!, label });
    });
    const expectedAnchors = [...sourceLinksByBlock.get(blockId)!]
      .sort((left, right) =>
        left.source.kind === "block-markdown" &&
        right.source.kind === "block-markdown"
          ? left.source.range.start - right.source.range.start ||
            left.source.range.end - right.source.range.end ||
            left.id.localeCompare(right.id)
          : 0,
      )
      .map((link) => Object.freeze({ href: link.href, label: link.label }));
    exactJson(
      anchors,
      expectedAnchors,
      `rendered semantic anchors for '${blockId}'`,
    );
    return Object.freeze({ blockId, anchors: Object.freeze(anchors) });
  });
  exact(
    renderedAnchors.length,
    EXPECTED_SEMANTIC_LINK_BLOCK_GROUP_COUNT,
    "rendered semantic block group count",
  );
  const renderedAnchorCount = renderedAnchors.reduce(
    (total, group) => total + group.anchors.length,
    0,
  );
  exact(
    renderedAnchorCount,
    EXPECTED_SEMANTIC_LINK_COUNT,
    "rendered semantic anchor count",
  );
  return Object.freeze({
    workId,
    path: route.path,
    rendered: true as const,
    linkIds: Object.freeze(linkIds),
    renderedBlockGroupCount: renderedAnchors.length,
    renderedAnchorCount,
    renderedAnchorsSha256: digest(renderedAnchors),
  });
}

async function verifySemanticSlashAliases(
  application: PublicationNextApplication,
  additions: readonly SemanticRouteAddition[],
): Promise<Readonly<{
  explicitRedirectCount: number;
  canonicalSlashRedirectCount: number;
  probes: readonly Readonly<{
    from: string;
    to: string;
    status: 308;
  }>[];
}>> {
  exact(
    application.manifest.continuity.explicitRedirectCount,
    EXPECTED_REDIRECT_COUNT,
    "explicit continuity redirect count",
  );
  exact(
    application.manifest.continuity.canonicalSlashRedirectCount,
    EXPECTED_ACTIVE_ROUTE_COUNT - 1,
    "canonical slash redirect count",
  );
  const probes = await Promise.all(additions.map(async (addition) => {
    const from = addition.path.endsWith("/")
      ? addition.path.slice(0, -1)
      : `${addition.path}/`;
    const response = await application.handleRequest(
      new Request(`https://publisher.invalid${from}?proof=semantic-route`),
    );
    if (!response) fail(`semantic slash alias '${from}' produced no response.`);
    exact(response.status, 308, `semantic slash status for '${from}'`);
    const expectedLocation =
      `https://publisher.invalid${addition.path}?proof=semantic-route`;
    exact(
      response.headers.get("location"),
      expectedLocation,
      `semantic slash location for '${from}'`,
    );
    return Object.freeze({
      from,
      to: addition.path,
      status: 308 as const,
    });
  }));
  return Object.freeze({
    explicitRedirectCount:
      application.manifest.continuity.explicitRedirectCount,
    canonicalSlashRedirectCount:
      application.manifest.continuity.canonicalSlashRedirectCount,
    probes: Object.freeze(probes),
  });
}

function assertCompiledShape(
  content: PublicationContentEnvelope,
  reader: PublicationReaderEnvelope,
  sectionCount: number,
): void {
  exact(content.statistics.workCount, EXPECTED_WORK_COUNT, "content work count");
  exact(reader.statistics.workCount, EXPECTED_WORK_COUNT, "Reader work count");
  exact(content.statistics.sectionCount, sectionCount, "content section count");
  exact(reader.statistics.sectionCount, sectionCount, "Reader section count");
  exact(content.statistics.blockCount, EXPECTED_BLOCK_COUNT, "content block count");
  exact(reader.statistics.blockCount, EXPECTED_BLOCK_COUNT, "Reader block count");
  exact(content.statistics.wordCount, EXPECTED_WORD_COUNT, "content word count");
  exact(reader.statistics.wordCount, EXPECTED_WORD_COUNT, "Reader word count");
}

function assertRelationalSectionProjections(
  reader: PublicationReaderEnvelope,
  search: ReaderSearchIndex,
  progress: ReaderProgressCatalog,
): void {
  let order = 0;
  const expected = reader.works.flatMap((work) =>
    work.sections.flatMap((section) => {
      if (!section.navigable) return [];
      if (section.readerAddress === null) {
        fail(`navigable Reader section '${section.id}' has no reader address.`);
      }
      const row = Object.freeze({
        workId: work.id,
        sectionId: section.id,
        continuityId: section.continuity.id,
        href: section.readerAddress.path,
        order,
        contentHash: section.contentHash,
        wordCount: section.wordCount,
      });
      order += 1;
      return [row];
    }),
  );
  exactJson(
    search.entries.map(
      ({
        workId,
        sectionId,
        continuityId,
        href,
        order: entryOrder,
        contentHash,
        wordCount,
      }) => ({
        workId,
        sectionId,
        continuityId,
        href,
        order: entryOrder,
        contentHash,
        wordCount,
      }),
    ),
    expected,
    "search entries against Reader section traversal",
  );
  exactJson(
    progress.entries.map(
      ({
        workId,
        id,
        continuity,
        href,
        order: entryOrder,
        contentHash,
        wordCount,
      }) => ({
        workId,
        sectionId: id,
        continuityId: continuity.id,
        href,
        order: entryOrder,
        contentHash,
        wordCount,
      }),
    ),
    expected,
    "progress entries against Reader section traversal",
  );
}

function staticParamsForActivePaths(
  paths: readonly string[],
): readonly Readonly<{ segments?: readonly string[] }>[] {
  return Object.freeze(
    paths.map((routePath) => {
      if (routePath === "/") return Object.freeze({});
      const withoutSlashes = routePath.slice(
        1,
        routePath.endsWith("/") ? -1 : undefined,
      );
      return Object.freeze({
        segments: Object.freeze(
          withoutSlashes.split("/").map((segment) => decodeURIComponent(segment)),
        ),
      });
    }),
  );
}

function assertBlockReferencesPreserved(
  sourceWorks: readonly WorkContentInput[],
  adaptedWorks: readonly WorkContentInput[],
  additions: readonly SemanticRouteAddition[],
): void {
  exactJson(
    adaptedWorks.map((work) => work.sections.map(({ id }) => id)),
    sourceWorks.map((work) => work.sections.map(({ id }) => id)),
    "adapted section membership and order",
  );
  const additionsBySection = new Map(
    additions.map((addition) => [addition.sectionId, addition]),
  );
  for (const [workIndex, sourceWork] of sourceWorks.entries()) {
    const adaptedWork = adaptedWorks[workIndex]!;
    exactJson(
      adaptedWork.adapter,
      COHERENCE_ADAPTER_IDENTITY,
      `adapter identity for '${sourceWork.workId}'`,
    );
    if (adaptedWork.metrics !== sourceWork.metrics) {
      fail(`work '${sourceWork.workId}' lost its inherited metrics identity.`);
    }
    const sourceWorkRemainder = withoutKeys(sourceWork, [
      "sections",
      "adapter",
    ]);
    const adaptedWorkRemainder = withoutKeys(adaptedWork, [
      "sections",
      "adapter",
    ]);
    exactJson(
      adaptedWorkRemainder,
      sourceWorkRemainder,
      `work allowlist for '${sourceWork.workId}'`,
    );
    for (const [sectionIndex, sourceSection] of sourceWork.sections.entries()) {
      const adaptedSection = adaptedWork.sections[sectionIndex]!;
      const addition = additionsBySection.get(sourceSection.id);
      if (addition === undefined && adaptedSection !== sourceSection) {
        fail(`section '${sourceSection.id}' changed outside the route allowlist.`);
      }
      const sourceSectionRemainder = withoutKeys(sourceSection, [
        "routes",
        "activeRouteNames",
      ]);
      const adaptedSectionRemainder = withoutKeys(adaptedSection, [
        "routes",
        "activeRouteNames",
      ]);
      exactJson(
        adaptedSectionRemainder,
        sourceSectionRemainder,
        `section allowlist for '${sourceSection.id}'`,
      );
      if (adaptedSection.blocks !== sourceSection.blocks) {
        fail(`section '${sourceSection.id}' lost its block array authority.`);
      }
      if (
        adaptedSection.continuity !== sourceSection.continuity ||
        adaptedSection.readerLocation !== sourceSection.readerLocation ||
        adaptedSection.metadata !== sourceSection.metadata
      ) {
        fail(`section '${sourceSection.id}' lost non-route authority references.`);
      }
      if (addition !== undefined) {
        exactJson(
          adaptedSection.activeRouteNames,
          [...(sourceSection.activeRouteNames ?? []), SEMANTIC_ROUTE_NAME],
          `active route allowlist for '${sourceSection.id}'`,
        );
        const sourceRoutes = sourceSection.routes ?? {};
        const adaptedRoutes = adaptedSection.routes ?? {};
        exactJson(
          Object.keys(adaptedRoutes).sort(),
          [...Object.keys(sourceRoutes), SEMANTIC_ROUTE_NAME].sort(),
          `route key allowlist for '${sourceSection.id}'`,
        );
        for (const [routeName, route] of Object.entries(sourceRoutes)) {
          if (adaptedRoutes[routeName] !== route) {
            fail(`section '${sourceSection.id}' changed route '${routeName}'.`);
          }
        }
        exactJson(
          adaptedRoutes[SEMANTIC_ROUTE_NAME],
          { path: addition.path },
          `semantic route for '${sourceSection.id}'`,
        );
      }
      exact(
        adaptedSection.blocks.length,
        sourceSection.blocks.length,
        `adapted block count for '${sourceSection.id}'`,
      );
      sourceSection.blocks.forEach((sourceBlock, blockIndex) => {
        const adaptedBlock = adaptedSection.blocks[blockIndex];
        if (adaptedBlock !== sourceBlock) {
          fail(`block '${sourceBlock.id}' was cloned or reordered.`);
        }
        if (adaptedBlock.provenance !== sourceBlock.provenance) {
          fail(`block '${sourceBlock.id}' lost its provenance authority.`);
        }
      });
    }
  }
}

export async function loadCoherencePublisherContentAuthorities(): Promise<
  CoherencePublisherContentAuthorities
> {
  assertFilesystemAuthorities();
  const loaded = requireValid(
    await loadPublicationCompilationSources({ publicationRoot: repoRoot }),
    "Publisher source loading",
  );
  const sourceWorks = requireValid(
    derivePublicationWorkInputs(loaded),
    "Publisher work input derivation",
  );
  const manifestSources = readPublisherManifestSources();
  const rawCatalog = buildCatalog(undefined, { semanticReferences: "omit" });
  const semanticRegistry = readSemanticLinkRegistry(semanticLinksPath);
  return Object.freeze({
    loaded,
    sourceWorks,
    preparedCatalog: manifestSources.catalog,
    rawCatalog,
    semanticRegistry,
    semanticLinkPolicy: Object.freeze({
      mode: "include-all-approved" as const,
      approvedLinkIds: approvedSemanticLinkIds(semanticRegistry),
    }),
  });
}

export async function adaptCoherencePublisherContent(
  authorities: CoherencePublisherContentAuthorities,
): Promise<CoherencePublisherContentProof> {
  if (authorities.semanticLinkPolicy.mode !== "include-all-approved") {
    fail("semantic link policy must include the complete approved overlay set.");
  }
  exactJson(
    authorities.semanticLinkPolicy.approvedLinkIds,
    approvedSemanticLinkIds(authorities.semanticRegistry),
    "complete approved semantic overlay policy",
  );
  const currentGitRevision = getGitRevision();
  exact(
    authorities.rawCatalog.gitRevision,
    currentGitRevision,
    "raw catalog Git revision",
  );
  exact(
    authorities.preparedCatalog.gitRevision,
    currentGitRevision,
    "prepared catalog Git revision",
  );
  const authorityIdentities = contentAuthorityIdentities(authorities);
  assertReviewedContentAuthorityIdentities(authorityIdentities);
  const initialInputAuthoritiesSha256 = inputAuthoritiesSha256(authorities);
  assertCatalogAuthorities(authorities);
  exact(authorities.sourceWorks.length, EXPECTED_WORK_COUNT, "source work count");
  exact(
    authorities.sourceWorks.reduce(
      (total, work) => total + work.sections.length,
      0,
    ),
    EXPECTED_SECTION_COUNT,
    "source section count",
  );

  const baselineContent = requireValid(
    compileLoadedPublicationContent({
      loaded: authorities.loaded,
      works: authorities.sourceWorks,
    }),
    "baseline lower content compilation",
  );
  const baselineReader = requireValid(
    projectPublicationReader(baselineContent, { audience: "preview" }),
    "baseline lower Reader projection",
  );
  assertCompiledShape(baselineContent, baselineReader, EXPECTED_SECTION_COUNT);
  exact(
    baselineReader.routes.active.length,
    EXPECTED_BASELINE_ACTIVE_ROUTE_COUNT,
    "baseline active route count",
  );
  exact(
    baselineReader.routes.redirects.length,
    EXPECTED_REDIRECT_COUNT,
    "baseline redirect count",
  );
  const baselineActivePaths = new Set(
    baselineReader.routes.active.map(({ path }) => path),
  );
  const routeGap = readerBaseRouteGap(
    authorities.rawCatalog,
    baselineActivePaths,
  );
  exact(
    routeGap.paths.length,
    EXPECTED_ABSENT_READER_BASE_PATH_COUNT,
    "baseline absent Reader base path count",
  );
  exact(
    routeGap.catalogReferenceCount,
    EXPECTED_ABSENT_READER_BASE_PATH_REFERENCE_COUNT,
    "baseline catalog references on absent Reader base paths",
  );
  const baselineFragmentHrefGap = readerFragmentHrefGap(
    authorities.rawCatalog,
    baselineReader,
  );
  exact(
    baselineFragmentHrefGap.length,
    EXPECTED_MISSING_READER_FRAGMENT_HREF_COUNT,
    "baseline missing Reader fragment href count",
  );
  exact(
    digest(baselineFragmentHrefGap),
    EXPECTED_MISSING_READER_FRAGMENT_HREFS_SHA256,
    "baseline missing Reader fragment href identity",
  );

  const partition = classifyStructuralPartition(authorities);
  const semanticRoutes = deriveSemanticRouteAdditions(
    authorities,
    baselineActivePaths,
  );
  const workInputs = applySemanticRouteAdditions(
    authorities.sourceWorks,
    semanticRoutes.additions,
  );
  assertBlockReferencesPreserved(
    authorities.sourceWorks,
    workInputs,
    semanticRoutes.additions,
  );
  const semanticLinks = createSemanticLinkInputs(
    workInputs,
    partition,
    semanticRoutes.edits,
  );
  exact(
    semanticLinks.length,
    EXPECTED_SEMANTIC_LINK_COUNT,
    "semantic link input count",
  );
  const semanticLinkIds = semanticLinks.map(({ id }) => id).sort();
  exactJson(
    authorities.semanticLinkPolicy.approvedLinkIds,
    semanticLinkIds,
    "complete approved semantic overlay policy",
  );
  exactJson(
    semanticLinkIds,
    approvedSemanticLinkIds(authorities.semanticRegistry),
    "complete approved semantic overlay authority",
  );
  exact(
    digest(semanticLinks),
    EXPECTED_SEMANTIC_LINK_INPUTS_SHA256,
    "complete approved semantic overlay input identity",
  );

  const content = requireValid(
    compileLoadedPublicationContent({
      loaded: authorities.loaded,
      works: workInputs,
      links: semanticLinks,
    }),
    "linkful lower content compilation",
  );
  const reader = requireValid(
    projectPublicationReader(content, { audience: "preview" }),
    "linkful lower Reader projection",
  );
  assertCompiledShape(content, reader, EXPECTED_SECTION_COUNT);
  exact(
    content.links.length,
    EXPECTED_SEMANTIC_LINK_COUNT,
    "lower compiled semantic link count",
  );
  exact(
    reader.links.length,
    EXPECTED_SEMANTIC_LINK_COUNT,
    "lower projected semantic link count",
  );
  const semanticApplication = classifySemanticLinkApplication(reader);
  const createApplication = await loadCreatePublicationNextApplication();
  exact(
    reader.routes.active.length,
    EXPECTED_ACTIVE_ROUTE_COUNT,
    "final active route count",
  );
  exact(
    reader.routes.redirects.length,
    EXPECTED_REDIRECT_COUNT,
    "final redirect count",
  );
  const search = createReaderSearchIndex(reader);
  const progress = createReaderProgressCatalog(reader);
  exact(
    search.entries.length,
    EXPECTED_SEARCH_ENTRY_COUNT,
    "search projection entry count",
  );
  exact(
    progress.entries.length,
    EXPECTED_PROGRESS_ENTRY_COUNT,
    "progress projection entry count",
  );
  assertRelationalSectionProjections(reader, search, progress);
  const routePlan = requireValid(
    createPublisherNextRoutePlan(reader),
    "Publisher Next route planning",
  );
  exact(
    routePlan.activePaths.length,
    EXPECTED_ACTIVE_ROUTE_COUNT,
    "Next route plan active path count",
  );
  const readerActivePaths = reader.routes.active.map(({ path }) => path);
  exact(readerActivePaths[0], "/", "Reader home route order");
  exactJson(
    routePlan.activePaths,
    readerActivePaths,
    "Next route plan active paths against Reader routes",
  );
  const expectedRoutePlanStaticParams = staticParamsForActivePaths(
    readerActivePaths,
  );
  exactJson(
    routePlan.staticParams,
    expectedRoutePlanStaticParams,
    "Next route plan static parameters against Reader routes",
  );
  exact(
    routePlan.staticParams.length,
    EXPECTED_ACTIVE_ROUTE_COUNT,
    "Next route plan static parameter count",
  );
  const finalRouteGap = readerBaseRouteGap(
    authorities.rawCatalog,
    new Set(reader.routes.active.map(({ path }) => path)),
  );
  exact(
    finalRouteGap.paths.length,
    EXPECTED_FINAL_ABSENT_READER_BASE_PATH_COUNT,
    "final absent Reader base path count",
  );
  exact(
    finalRouteGap.catalogReferenceCount,
    EXPECTED_FINAL_ABSENT_READER_BASE_PATH_REFERENCE_COUNT,
    "final catalog references on absent Reader base paths",
  );
  const finalFragmentHrefGap = readerFragmentHrefGap(
    authorities.rawCatalog,
    reader,
  );
  exact(
    finalFragmentHrefGap.length,
    EXPECTED_MISSING_READER_FRAGMENT_HREF_COUNT,
    "final missing Reader fragment href count",
  );
  exact(
    digest(finalFragmentHrefGap),
    EXPECTED_MISSING_READER_FRAGMENT_HREFS_SHA256,
    "final missing Reader fragment href identity",
  );
  const baselineGapByPath = new Map(
    routeGap.paths.map((entry) => [entry.path, entry]),
  );
  const finalGapPaths = new Set(finalRouteGap.paths.map(({ path }) => path));
  const rawReaderBasePathClosures = semanticRoutes.additions
    .flatMap(({ path }) => {
      const baselineGap = baselineGapByPath.get(path);
      return baselineGap !== undefined && !finalGapPaths.has(path)
        ? [
            Object.freeze({
              path,
              catalogReferenceCount: baselineGap.sectionIds.length,
            }),
          ]
        : [];
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  exactJson(
    rawReaderBasePathClosures,
    EXPECTED_RAW_READER_BASE_PATH_CLOSURES,
    "raw Reader base path closures",
  );
  const semanticAggregateOnlyTargets = semanticRoutes.additions
    .map(({ path }) => path)
    .filter((path) => !baselineGapByPath.has(path))
    .sort();
  exactJson(
    semanticAggregateOnlyTargets,
    EXPECTED_SEMANTIC_AGGREGATE_ONLY_TARGETS,
    "semantic aggregate-only route targets",
  );
  const application = requireValid(
    await createApplication({
      reader,
      readerStateBootstrap: coherenceReaderStateBootstrap,
      theme: resolveDefaultPublisherNextTheme(),
    }),
    "linkful Publisher Next assembly",
  );
  exact(
    application.staticParams.length,
    EXPECTED_ACTIVE_ROUTE_COUNT - 1,
    "Publisher Next application static parameter count",
  );
  exactJson(
    application.staticParams,
    expectedRoutePlanStaticParams.slice(1),
    "Publisher Next application static parameters against nonroot Reader routes",
  );
  exact(
    application.manifest.continuity.explicitRedirectCount,
    EXPECTED_REDIRECT_COUNT,
    "application explicit redirect count",
  );
  exact(
    application.manifest.continuity.canonicalSlashRedirectCount,
    EXPECTED_ACTIVE_ROUTE_COUNT - 1,
    "application canonical slash redirect count",
  );
  const slashEvidence = await verifySemanticSlashAliases(
    application,
    semanticRoutes.additions,
  );
  const sourceWorkPage = await verifySourceWorkPageLinks(
    application,
    routePlan,
    semanticApplication.linkIds,
  );

  const evidenceWithoutHash = Object.freeze({
    schemaVersion: 2 as const,
    proofKind: "coherence-content-lower-api-proof" as const,
    integration: Object.freeze({
      proofOnly: true as const,
      wiredToHostRoutes: false as const,
      appWiringApproved: false as const,
      reason:
        "This isolated compiler and application proof exercises Publisher pages without wiring any Coherence host route.",
    }),
    currentShape: Object.freeze({
      workCount: content.statistics.workCount,
      sectionCount: content.statistics.sectionCount,
      blockCount: content.statistics.blockCount,
      wordCount: content.statistics.wordCount,
      workIds: Object.freeze(workInputs.map(({ workId }) => workId)),
    }),
    structuralPartition: Object.freeze({
      evidenceOnly: true as const,
      materialized: false as const,
      proposedStructuralSectionCount: EXPECTED_WORK_COUNT,
      materializationSafe: false as const,
      reason:
        "Structural blocks occur in multiple source-order runs inside every work. One work-level structural section would reorder manuscript traversal, while duplication would break the closed block census.",
      bodyBlockCount: partition.bodyBlockCount,
      bodyWordCount: partition.bodyWordCount,
      structuralBlockCount: partition.structuralBlockCount,
      structuralWordCount: partition.structuralWordCount,
      structuralSourceRange: partition.structuralSourceRange,
      appendedSectionTraversalInversions:
        partition.appendedSectionTraversalInversions,
      works: partition.workEvidence,
      partitionSha256: partition.partitionSha256,
    }),
    routes: Object.freeze({
      baselineActiveRouteCount: baselineReader.routes.active.length,
      finalActiveRouteCount: reader.routes.active.length,
      redirectCount: reader.routes.redirects.length,
      semanticTargetRouteCount: semanticRoutes.additions.length,
      semanticTargetRoutes: semanticRoutes.additions,
      baselineAbsentReaderBasePathCount: routeGap.paths.length,
      baselineCatalogReferencesOnAbsentBasePaths:
        routeGap.catalogReferenceCount,
      baselineAbsentReaderBasePathsSha256: digest(routeGap.paths),
      finalAbsentReaderBasePathCount: finalRouteGap.paths.length,
      finalCatalogReferencesOnAbsentBasePaths:
        finalRouteGap.catalogReferenceCount,
      finalAbsentReaderBasePathsSha256: digest(finalRouteGap.paths),
      baselineMissingReaderFragmentHrefCount:
        baselineFragmentHrefGap.length,
      baselineMissingReaderFragmentHrefsSha256:
        digest(baselineFragmentHrefGap),
      finalMissingReaderFragmentHrefCount: finalFragmentHrefGap.length,
      finalMissingReaderFragmentHrefsSha256: digest(finalFragmentHrefGap),
      rawReaderBasePathClosures: Object.freeze(rawReaderBasePathClosures),
      semanticAggregateOnlyTargets: Object.freeze(
        semanticAggregateOnlyTargets,
      ),
      fullReaderRouteParity: false as const,
    }),
    semanticOverlay: Object.freeze({
      policy: "include-all-approved" as const,
      includedAsCompleteSet: true as const,
      approvedLinkCount: semanticRoutes.edits.length,
      lowerCompiledLinkCount: content.links.length,
      lowerProjectedLinkCount: reader.links.length,
      individuallyApplicableLinkCount:
        semanticApplication.individuallyApplicableLinkCount,
      groupedApplicableLinkCount:
        semanticApplication.groupedApplicableLinkCount,
      linkIds: semanticApplication.linkIds,
      blockGroupCount: semanticApplication.blockGroups.length,
      groupedApplicationSha256:
        semanticApplication.groupedApplicationSha256,
      blockGroups: semanticApplication.blockGroups,
      applicationAssembled: true as const,
      sourceWorkPageWorkId: sourceWorkPage.workId,
      sourceWorkPagePath: sourceWorkPage.path,
      sourceWorkPageRendered: sourceWorkPage.rendered,
      sourceWorkPageLinkCount: sourceWorkPage.linkIds.length,
      sourceWorkPageLinkIds: sourceWorkPage.linkIds,
      sourceWorkPageLinkIdsSha256: digest(sourceWorkPage.linkIds),
      sourceWorkPageRenderedBlockGroupCount:
        sourceWorkPage.renderedBlockGroupCount,
      sourceWorkPageRenderedAnchorCount: sourceWorkPage.renderedAnchorCount,
      sourceWorkPageRenderedAnchorsSha256:
        sourceWorkPage.renderedAnchorsSha256,
    }),
    projections: Object.freeze({
      searchEntryCount: search.entries.length,
      progressEntryCount: progress.entries.length,
      routePlanStaticParamCount: routePlan.staticParams.length,
      applicationStaticParamCount: application.staticParams.length,
      explicitRedirectCount: slashEvidence.explicitRedirectCount,
      canonicalSlashRedirectCount: slashEvidence.canonicalSlashRedirectCount,
      semanticSlashProbes: slashEvidence.probes,
      searchEntriesSha256: digest(search.entries),
      progressEntriesSha256: digest(progress.entries),
      routePlanActivePathsSha256: digest(routePlan.activePaths),
      routePlanStaticParamsSha256: digest(routePlan.staticParams),
      applicationStaticParamsSha256: digest(application.staticParams),
    }),
    identities: Object.freeze({
      baselineContentBuildId: baselineContent.buildId,
      baselineReaderBuildId: baselineReader.buildId,
      finalContentBuildId: content.buildId,
      finalReaderBuildId: reader.buildId,
      sourceWorkInputsSha256: digest(authorities.sourceWorks),
      adaptedWorkInputsSha256: digest(workInputs),
      semanticLinkInputsSha256: digest(semanticLinks),
      finalApplicationBuildId: application.manifest.buildId,
      adapterIdentitySha256: digest(COHERENCE_ADAPTER_IDENTITY),
      ...authorityIdentities,
      inputAuthoritiesSha256: initialInputAuthoritiesSha256,
    }),
  });
  const evidence: CoherencePublisherContentEvidence = Object.freeze({
    ...evidenceWithoutHash,
    evidenceSha256: digest(evidenceWithoutHash),
  });
  exact(
    inputAuthoritiesSha256(authorities),
    initialInputAuthoritiesSha256,
    "input authorities after adaptation",
  );

  return Object.freeze({
    workInputs,
    content,
    reader,
    search,
    progress,
    routePlan,
    application,
    evidence,
  });
}

function contentAdapterCliSummary(
  proof: CoherencePublisherContentProof,
): Readonly<{
  schemaVersion: 2;
  status: "verified";
  proofKind: CoherencePublisherContentEvidence["proofKind"];
  proofSchemaVersion: CoherencePublisherContentEvidence["schemaVersion"];
  evidenceSha256: string;
  builds: Readonly<{
    content: string;
    reader: string;
    application: string;
  }>;
  counts: Readonly<{
    works: number;
    sections: number;
    blocks: number;
    words: number;
    semanticLinks: number;
    semanticLinkBlockGroups: number;
    searchEntries: number;
    progressEntries: number;
    activeRoutes: number;
    routePlanStaticParams: number;
    applicationStaticParams: number;
  }>;
  routeGap: Readonly<{
    absentBasePaths: number;
    catalogReferencesOnAbsentBasePaths: number;
    missingReaderFragmentHrefs: number;
    fullReaderRouteParity: false;
  }>;
  integration: CoherencePublisherContentEvidence["integration"];
}> {
  const { evidence } = proof;
  return Object.freeze({
    schemaVersion: 2 as const,
    status: "verified" as const,
    proofKind: evidence.proofKind,
    proofSchemaVersion: evidence.schemaVersion,
    evidenceSha256: evidence.evidenceSha256,
    builds: Object.freeze({
      content: evidence.identities.finalContentBuildId,
      reader: evidence.identities.finalReaderBuildId,
      application: evidence.identities.finalApplicationBuildId,
    }),
    counts: Object.freeze({
      works: evidence.currentShape.workCount,
      sections: evidence.currentShape.sectionCount,
      blocks: evidence.currentShape.blockCount,
      words: evidence.currentShape.wordCount,
      semanticLinks: evidence.semanticOverlay.lowerProjectedLinkCount,
      semanticLinkBlockGroups: evidence.semanticOverlay.blockGroupCount,
      searchEntries: evidence.projections.searchEntryCount,
      progressEntries: evidence.projections.progressEntryCount,
      activeRoutes: evidence.routes.finalActiveRouteCount,
      routePlanStaticParams: evidence.projections.routePlanStaticParamCount,
      applicationStaticParams:
        evidence.projections.applicationStaticParamCount,
    }),
    routeGap: Object.freeze({
      absentBasePaths: evidence.routes.finalAbsentReaderBasePathCount,
      catalogReferencesOnAbsentBasePaths:
        evidence.routes.finalCatalogReferencesOnAbsentBasePaths,
      missingReaderFragmentHrefs:
        evidence.routes.finalMissingReaderFragmentHrefCount,
      fullReaderRouteParity: evidence.routes.fullReaderRouteParity,
    }),
    integration: evidence.integration,
  });
}

function assertNoCliArguments(args: readonly string[]): void {
  if (args.length !== 0) {
    throw new TypeError("Usage: content-adapter.ts");
  }
}

async function main(args: readonly string[]): Promise<void> {
  assertNoCliArguments(args);
  const authorities = await loadCoherencePublisherContentAuthorities();
  const proof = await adaptCoherencePublisherContent(authorities);
  console.log(JSON.stringify(contentAdapterCliSummary(proof), null, 2));
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
