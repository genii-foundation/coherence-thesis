import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import {
  buildAudioEnvelope,
  resolvePublicationAudio,
} from "@genii-foundation/publisher/node";
import {
  canonicalizeJson,
  hashCanonicalJson,
} from "@genii-foundation/publisher-content";
import type {
  PublicationNextApplication,
} from "@genii-foundation/publisher-next/server";
import { resolveDefaultPublisherNextTheme } from "@genii-foundation/publisher-next/theme/default";
import {
  createReaderNarrationSectionTextProfile,
  parseReaderNarrationEnvelope,
  readerNarrationTimingHref,
  type ReaderNarrationEnvelope,
} from "@genii-foundation/publisher-reader/narration";
import {
  parseReaderOfflineCatalog,
  serializeReaderOfflineCatalog,
} from "@genii-foundation/publisher-reader/offline";
import {
  parseJsonWithUniqueObjectKeys,
  validateAudioCatalogShape,
  validateAudioEnvelopeShape,
  type AudioClip,
  type AudioClipCatalog,
  type AudioEnvelope,
  type Diagnostic,
  type JSONValue,
  type ValidationResult,
} from "@genii-foundation/publisher-schema";

import {
  validateAudioPublicationCheckpoint,
  validateAudioPublicationCheckpoints,
  type AudioPublicationCheckpoint,
  type AudioPublicationCheckpointFile,
} from "../audio/audio-publication-checkpoints";
import { audioInputHash, audioVersionId } from "../manuscripts/shared";
import { wordCount } from "../manuscripts/io";
import {
  audioManifestSourcePath,
  audioPublicationCheckpointsRoot,
  generatedPublisherRoot,
  publisherPublicationManifestPath,
  repoRoot,
} from "../repository/paths";
import { textForAudio } from "../../src/lib/audio-text";
import { coherenceReaderStateBootstrap } from "../../src/publisher/reader-state-bootstrap";
import {
  assertCoherenceReaderStateMigrationProjection,
  createCoherenceReaderStateMigrationExtensionRegistration,
} from "../../src/publisher/reader-state-migration-extension";
import type { CompiledCatalog } from "../manuscripts/types";
import {
  assertCensusAuthorityPath,
} from "./content-fidelity";
import {
  adaptCoherencePublisherContent,
  loadCoherencePublisherContentAuthorities,
  type CoherencePublisherContentProof,
} from "./content-adapter";

const EXPECTED_CURRENT_CLIP_COUNT = 525;
const EXPECTED_SAFE_CLIP_COUNT = 122;
const EXPECTED_OMITTED_CLIP_COUNT = 403;
const EXPECTED_EQUAL_LENGTH_MISMATCH_COUNT = 195;
const EXPECTED_DIFFERENT_LENGTH_MISMATCH_COUNT = 208;
const EXPECTED_CHECKPOINT_COUNT = 19;
const EXPECTED_HISTORICAL_UNIT_COUNT = 574;
const EXPECTED_CURRENT_AUDIO_BYTES = 694_972_293;
const EXPECTED_CURRENT_TIMINGS_BYTES = 28_597_027;
const EXPECTED_CURRENT_DURATION_SECONDS = 72_037.575;
const EXPECTED_SAFE_AUDIO_BYTES = 104_355_445;
const EXPECTED_SAFE_TIMINGS_BYTES = 4_387_745;
const EXPECTED_SAFE_DURATION_SECONDS = 10_840.535;
const EXPECTED_SAFE_EXACT_WORD_COUNT = 31_299;
const EXPECTED_SAFE_INTERPOLATED_WORD_COUNT = 169;
const EXPECTED_RENDERED_WORD_COUNT = 204_120;
const EXPECTED_RAW_AUDIO_TEXT_WORD_COUNT = 204_144;
const EXPECTED_SOURCE_MANIFEST_TEXT_SHA256 =
  "sha256:4ed40d61143ff9f2ba043ed9591f9d1772796283487d38db55d44cd99878d893";
const EXPECTED_PUBLICATION_MANIFEST_TEXT_SHA256 =
  "sha256:4268377060061f177d00d7ab712a1efdc999cfb2c409e7f298e9d43b995a3e85";
const EXPECTED_CURRENT_CHECKPOINT_MATCH_EVIDENCE_SHA256 =
  "sha256:2288b329ed8a61418d0d856eebdc81073c29e798d4a2ac5a8b0a609de7328d72";
const EXPECTED_COMPLETE_CHECKPOINT_AUTHORITY_SHA256 =
  "sha256:0f768e81421de70ab5d4812c2282aebe2d0c42567d621e34b4d9f8ff619f8a20";
const EXPECTED_SAFE_SECTION_IDS_SHA256 =
  "sha256:4aa80d0705d8bc974c6d78347a15c1796a2d527e752eb97aeee35ec29eeb40be";
const EXPECTED_CURRENT_PROVENANCE = Object.freeze([
  Object.freeze({
    checkpointVersion: "2026-08-01-nine-volume-revision-v1",
    clipCount: 478,
  }),
  Object.freeze({
    checkpointVersion: "2026-08-18-pr206-editorial-v1",
    clipCount: 23,
  }),
  Object.freeze({
    checkpointVersion: "2026-08-18-pr207-publication-cleanup-v1",
    clipCount: 23,
  }),
  Object.freeze({
    checkpointVersion: "2026-08-20-ctd-0015-v1",
    clipCount: 1,
  }),
] as const);
const EXPECTED_SAFE_PROVENANCE = Object.freeze([
  Object.freeze({
    checkpointVersion: "2026-08-01-nine-volume-revision-v1",
    clipCount: 119,
  }),
  Object.freeze({
    checkpointVersion: "2026-08-18-pr207-publication-cleanup-v1",
    clipCount: 3,
  }),
] as const);
const EXPECTED_SAFE_CLIPS_BY_WORK = Object.freeze([
  Object.freeze({ workId: "humanitys-most-viable-future", clipCount: 9 }),
  Object.freeze({ workId: "wielding-intelligence", clipCount: 20 }),
  Object.freeze({ workId: "providence-imperative", clipCount: 16 }),
  Object.freeze({ workId: "architecting-providence", clipCount: 32 }),
  Object.freeze({ workId: "purposeful", clipCount: 1 }),
  Object.freeze({ workId: "smallest-nest", clipCount: 16 }),
  Object.freeze({ workId: "presencing-genius", clipCount: 22 }),
  Object.freeze({ workId: "misanthropic-artifice", clipCount: 5 }),
  Object.freeze({ workId: "cardinal-scale", clipCount: 1 }),
] as const);
const NON_GATING_HISTORICAL_SOURCE_BINDING = Object.freeze({
  nonGating: true as const,
  reconstructedByMainProof: false as const,
  checkpointUnitCount: 122,
  exactSourceCommitAvailableCount: 113,
  exactSourceCommitUnavailableCount: 9,
  exactSourceCommitUnavailableSectionIds: Object.freeze([
    "v01-civilization-as-a-living-process",
    "v01-consciousness-and-participation",
    "v01-intelligence-as-an-emergent-property",
    "v01-reverence-through-observation",
    "v01-the-flower",
    "v01-the-intelligence-we-are-building",
    "v01-the-invitation",
    "v01-the-limits-of-the-claim",
    "v01-the-work-behind-the-book",
  ]),
  compatibleSectionIdsSha256:
    "sha256:d82046c70fe3283130c9cab6c5b14916d063c8f52cfe963af0dd0e1025f98ebd",
  availableBindingRecordsSha256:
    "sha256:2bc9df8a474c6459c4bb24159e35d70ac4b2712a8f245faa5ec86280e57de759",
  unavailableSectionIdsSha256:
    "sha256:a7299f729e22d917f44fe64176624dc93a80c2b3dd700b48402d5026de970553",
  unavailableSourceCommit: "27a4fe04324f047c45b30eb17766a226e45e0fd1",
});

const LOGICAL_AUDIO_CATALOG_PATH =
  `${relativePath(generatedPublisherRoot)}/audio-catalog.json`;
type CreatePublicationNextApplication =
  typeof import("@genii-foundation/publisher-next/server")["createPublicationNextApplication"];

type LegacyAudioVoice = AudioClipCatalog["voices"][number] & Readonly<{
  renderedWordCount: number;
}>;

type LegacyAudioManifest = Readonly<{
  $schema?: AudioClipCatalog["$schema"];
  version: 1;
  generatedAt?: string;
  voices: readonly LegacyAudioVoice[];
}>;

type CheckpointMatch = Readonly<{
  checkpoint: AudioPublicationCheckpoint;
  file: AudioPublicationCheckpointFile;
}>;

export type CoherencePublisherAudioAuthorities = Readonly<{
  content: CoherencePublisherContentProof;
  rawCatalog: CompiledCatalog;
  sourceManifestText: string;
  sourceManifest: JSONValue;
  publicationManifestText: string;
  publicationManifest: JSONValue;
  checkpoints: readonly AudioPublicationCheckpoint[];
}>;

export type CoherencePublisherAudioEvidence = Readonly<{
  schemaVersion: 1;
  proofKind: "coherence-audio-synthetic-constructor-proof";
  integration: Readonly<{
    syntheticConstructorEvidence: true;
    sourceDeclarationPresent: false;
    materializedCatalog: false;
    applicationConstructedInMemory: true;
    publicApplicationAssembly: false;
    hostIntegrated: false;
    routesActivated: false;
    audioParity: false;
    timingParity: false;
    publisherCheckpointCompatible: false;
    liveRemoteBytesVerified: false;
    networkAccessPerformed: false;
    durableWritesPerformed: false;
  }>;
  authorities: Readonly<{
    sourceManifestPath: string;
    sourceManifestBytes: number;
    sourceManifestTextSha256: string;
    publicationManifestPath: string;
    publicationManifestTextSha256: string;
    sourceDeclarationPresent: false;
    unsupportedSourceFields: readonly Readonly<{
      path: string;
      keyword: string;
      field: string;
      value: number;
    }>[];
    rawCatalogSectionCount: number;
    currentClipCount: number;
    currentVersionBindingCount: number;
    checkpointCount: number;
    historicalCheckpointUnitCount: number;
    exactCurrentCheckpointMatchCount: number;
    ambiguousCurrentCheckpointMatchCount: 0;
    missingCurrentCheckpointMatchCount: 0;
    currentProvenance: readonly Readonly<{
      checkpointVersion: string;
      clipCount: number;
    }>[];
    completeCheckpointAuthoritySha256: string;
    currentCheckpointMatchEvidenceSha256: string;
    publisherCheckpointCompatible: false;
    publisherCheckpointCount: 0;
    publisherHistoricalSpokenTextAuthorityPresent: false;
    renderedWordCount: number;
    rawAudioTextWordCount: number;
    wordCounterDifference: number;
    historicalSourceBinding: typeof NON_GATING_HISTORICAL_SOURCE_BINDING;
  }>;
  projection: Readonly<{
    policy: "byte-exact-coherence-audio-text-equals-publisher-profile";
    safeClipCount: number;
    timingDeclarationCount: number;
    timingDeclarationKind: "checkpoint-bound-reference";
    timingBodiesParsed: false;
    withheldIncompatiblePublishedClipCount: number;
    equalLengthMismatchCount: number;
    differentLengthMismatchCount: number;
    safeSectionIdsSha256: string;
    withheldIncompatibleSectionIdsSha256: string;
    narrationComparisonSha256: string;
    safeProvenance: readonly Readonly<{
      checkpointVersion: string;
      clipCount: number;
    }>[];
    safeClipsByWork: readonly Readonly<{
      workId: string;
      clipCount: number;
    }>[];
    currentCensus: Readonly<{
      audioBytes: number;
      timingsBytes: number;
      durationSeconds: number;
      exactWordCount: number;
      interpolatedWordCount: number;
    }>;
    safeCensus: Readonly<{
      audioBytes: number;
      timingsBytes: number;
      durationSeconds: number;
      exactWordCount: number;
      interpolatedWordCount: number;
    }>;
  }>;
  catalog: Readonly<{
    logicalPath: typeof LOGICAL_AUDIO_CATALOG_PATH;
    materialized: false;
    canonicalValueSha256: string;
    canonicalTextSha256: string;
    canonicalTextBytes: number;
    strictRoundTripParsed: true;
    strictRoundTripSchemaValidated: true;
    strictRoundTripDeepEqual: true;
  }>;
  envelope: Readonly<{
    catalogPath: typeof LOGICAL_AUDIO_CATALOG_PATH;
    catalogTextSha256: string;
    envelopeTextSha256: string;
    readerProjectionParsed: true;
    strictRoundTripParsed: true;
    strictRoundTripSchemaValidated: true;
    strictRoundTripDeepEqual: true;
    clipCount: number;
    timingDeclarationCount: number;
  }>;
  application: Readonly<{
    constructedInMemory: true;
    publicAssembly: false;
    readerBuildId: string;
    applicationBuildId: string;
    applicationArtifactSha256: string;
    applicationManifestBindsAudio: false;
    audioBinding: "envelope-catalog-hash-and-offline-package-catalog-hash";
    offlineCatalogTextSha256: string;
    offlineCatalogParsed: true;
    offlinePackageCount: number;
    offlineAudioResourceCount: number;
    offlineTimingResourceCount: number;
    offlineNarrationCatalogHashBindingCount: number;
  }>;
  limitations: Readonly<{
    withheldClipReason: string;
    timingReferenceReason: string;
    checkpointReason: string;
  }>;
  evidenceSha256: string;
}>;

export type CoherencePublisherAudioProof = Readonly<{
  catalog: AudioClipCatalog;
  catalogText: string;
  envelope: AudioEnvelope;
  envelopeText: string;
  narration: ReaderNarrationEnvelope;
  application: PublicationNextApplication;
  safeSectionIds: readonly string[];
  withheldIncompatibleSectionIds: readonly string[];
  evidence: CoherencePublisherAudioEvidence;
}>;

function fail(message: string): never {
  throw new Error(`Publisher audio adapter: ${message}`);
}

function diagnosticsSummary(diagnostics: readonly Diagnostic[]): string {
  return diagnostics
    .map(({ code, path, message }) => `${code} at ${path || "/"}: ${message}`)
    .join("; ");
}

function requireValid<T>(result: ValidationResult<T>, label: string): T {
  if (!result.valid) {
    fail(`${label} failed with ${diagnosticsSummary(result.diagnostics)}.`);
  }
  return result.value;
}

function exact<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    fail(`${label} expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function exactJson(actual: unknown, expected: unknown, label: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    fail(`${label} does not match the reviewed authority.`);
  }
}

function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function digest(value: unknown): string {
  return hashCanonicalJson(value as JSONValue);
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
    ? (value as Record<string, unknown>)
    : null;
}

function readRegularAuthority(filePath: string, label: string): string {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`${label} must be a regular file without symbolic indirection.`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function assertRegularAuthorityTree(root: string): void {
  for (const entry of fs.readdirSync(root)) {
    const entryPath = path.join(root, entry);
    const status = fs.lstatSync(entryPath);
    if (status.isSymbolicLink()) {
      fail(`checkpoint authority tree contains a symbolic entry: ${entryPath}.`);
    }
    if (status.isDirectory()) {
      assertRegularAuthorityTree(entryPath);
      continue;
    }
    if (!status.isFile()) {
      fail(`checkpoint authority tree contains a non-file entry: ${entryPath}.`);
    }
  }
}

export function assertCoherencePublisherAudioAuthorityPaths(
  paths: Readonly<{
    sourceManifestPath?: string;
    publicationManifestPath?: string;
    checkpointsRoot?: string;
  }> = {},
): void {
  const sourceManifestPath = paths.sourceManifestPath ?? audioManifestSourcePath;
  const publicationManifestPath =
    paths.publicationManifestPath ?? publisherPublicationManifestPath;
  const checkpointsRoot = paths.checkpointsRoot ?? audioPublicationCheckpointsRoot;
  assertCensusAuthorityPath({
    repositoryRoot: repoRoot,
    authorityPath: sourceManifestPath,
    kind: "file",
    label: "Coherence audio manifest",
  });
  assertCensusAuthorityPath({
    repositoryRoot: repoRoot,
    authorityPath: publicationManifestPath,
    kind: "file",
    label: "Publisher publication manifest",
  });
  assertCensusAuthorityPath({
    repositoryRoot: repoRoot,
    authorityPath: checkpointsRoot,
    kind: "directory",
    label: "Coherence audio checkpoint root",
  });
  assertRegularAuthorityTree(checkpointsRoot);
}

function relativePath(filePath: string): string {
  return filePath.slice(repoRoot.length + 1).replaceAll("\\", "/");
}

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

function parseStrictJson(text: string, label: string): JSONValue {
  return requireValid(parseJsonWithUniqueObjectKeys(text), label);
}

function inspectAndNormalizeSourceManifest(
  value: JSONValue,
): Readonly<{
  source: LegacyAudioManifest;
  normalized: AudioClipCatalog;
  unsupportedFields: readonly Readonly<{
    path: string;
    keyword: string;
    field: string;
    value: number;
  }>[];
}> {
  const invalid = validateAudioCatalogShape(value);
  if (invalid.valid) {
    fail("source manifest unexpectedly satisfies the Publisher catalog schema.");
  }
  exact(invalid.diagnostics.length, 1, "unsupported source field count");
  const diagnostic = invalid.diagnostics[0]!;
  exact(
    diagnostic.code,
    "schema.additional_property",
    "unsupported source field diagnostic code",
  );
  exact(
    diagnostic.path,
    "/voices/0/renderedWordCount",
    "unsupported source field path",
  );
  const root = plainRecord(value);
  const voices = root?.voices;
  if (!Array.isArray(voices) || voices.length !== 1) {
    fail("source manifest must declare exactly one voice.");
  }
  const sourceVoice = plainRecord(voices[0]);
  if (
    sourceVoice === null ||
    typeof sourceVoice.renderedWordCount !== "number" ||
    !Number.isInteger(sourceVoice.renderedWordCount)
  ) {
    fail("source manifest renderedWordCount must be an integer.");
  }
  const { renderedWordCount, ...normalizedVoice } = sourceVoice;
  const normalizedValue = {
    ...root,
    voices: [{ ...normalizedVoice }],
  };
  const normalized = requireValid(
    validateAudioCatalogShape(normalizedValue),
    "source manifest after removing renderedWordCount",
  );
  exact(
    renderedWordCount,
    EXPECTED_RENDERED_WORD_COUNT,
    "source rendered word count",
  );
  return Object.freeze({
    source: value as unknown as LegacyAudioManifest,
    normalized,
    unsupportedFields: Object.freeze([
      Object.freeze({
        path: diagnostic.path,
        keyword: diagnostic.keyword,
        field: "renderedWordCount",
        value: renderedWordCount,
      }),
    ]),
  });
}

function assertPublicationHasNoAudioDeclaration(value: JSONValue): void {
  const manifest = plainRecord(value);
  if (manifest === null) fail("publication.json must be an object.");
  if (Object.hasOwn(manifest, "audio")) {
    fail("publication.json already contains an audio declaration.");
  }
}

function timingHrefForClip(clip: AudioClip): string {
  const href = readerNarrationTimingHref(clip);
  if (href === null) {
    fail(`${clip.sectionId} has no valid timing reference.`);
  }
  return href;
}

function pathnameEndsWithObjectKey(href: string, objectKey: string): boolean {
  const url = new URL(href);
  return (
    url.search.length === 0 &&
    url.hash.length === 0 &&
    decodeURIComponent(url.pathname).endsWith(`/${objectKey}`)
  );
}

function checkpointMatchesClip(
  checkpoint: AudioPublicationCheckpoint,
  file: AudioPublicationCheckpointFile,
  voice: AudioClipCatalog["voices"][number],
  clip: AudioClip,
): boolean {
  return (
    checkpoint.narrator.id === voice.id &&
    checkpoint.narrator.label === voice.label &&
    checkpoint.provider === voice.provider &&
    checkpoint.model === voice.model &&
    file.sectionId === clip.sectionId &&
    file.audioVersionId === clip.audioVersionId &&
    clip.format === "opus" &&
    file.audio.byteSize === clip.byteSize &&
    file.timings.byteSize === clip.timingsByteSize &&
    file.durationSeconds === clip.durationSeconds &&
    pathnameEndsWithObjectKey(clip.href, file.audio.objectKey) &&
    pathnameEndsWithObjectKey(timingHrefForClip(clip), file.timings.objectKey)
  );
}

function matchCurrentClipsToCheckpoints(
  catalog: AudioClipCatalog,
  checkpoints: readonly AudioPublicationCheckpoint[],
): ReadonlyMap<string, CheckpointMatch> {
  const matches = new Map<string, CheckpointMatch>();
  for (const voice of catalog.voices) {
    for (const clip of voice.sections) {
      const candidates = checkpoints.flatMap((checkpoint) =>
        checkpoint.files.flatMap((file) =>
          checkpointMatchesClip(checkpoint, file, voice, clip)
            ? [Object.freeze({ checkpoint, file })]
            : [],
        ),
      );
      if (candidates.length !== 1) {
        fail(
          `${voice.id}/${clip.sectionId} has ${candidates.length} exact Coherence checkpoint matches.`,
        );
      }
      matches.set(`${voice.id}\u0000${clip.sectionId}`, candidates[0]!);
    }
  }
  exact(matches.size, EXPECTED_CURRENT_CLIP_COUNT, "current checkpoint match count");
  return matches;
}

function summarizeProvenance(
  matches: readonly CheckpointMatch[],
): readonly Readonly<{ checkpointVersion: string; clipCount: number }>[] {
  const counts = new Map<string, number>();
  for (const { checkpoint } of matches) {
    counts.set(checkpoint.version, (counts.get(checkpoint.version) ?? 0) + 1);
  }
  return Object.freeze(
    [...counts]
      .map(([checkpointVersion, clipCount]) =>
        Object.freeze({ checkpointVersion, clipCount }),
      )
      .sort((left, right) =>
        left.checkpointVersion.localeCompare(right.checkpointVersion),
      ),
  );
}

function sumMatches(matches: readonly CheckpointMatch[]): Readonly<{
  audioBytes: number;
  timingsBytes: number;
  durationSeconds: number;
  exactWordCount: number;
  interpolatedWordCount: number;
}> {
  return Object.freeze({
    audioBytes: matches.reduce((total, { file }) => total + file.audio.byteSize, 0),
    timingsBytes: matches.reduce(
      (total, { file }) => total + file.timings.byteSize,
      0,
    ),
    durationSeconds: Number(
      matches
        .reduce((total, { file }) => total + file.durationSeconds, 0)
        .toFixed(3),
    ),
    exactWordCount: matches.reduce(
      (total, { file }) => total + file.exactWordCount,
      0,
    ),
    interpolatedWordCount: matches.reduce(
      (total, { file }) => total + file.interpolatedWordCount,
      0,
    ),
  });
}

function assertReviewedCensus(
  current: ReturnType<typeof sumMatches>,
  safe: ReturnType<typeof sumMatches>,
): void {
  exact(current.audioBytes, EXPECTED_CURRENT_AUDIO_BYTES, "current audio bytes");
  exact(
    current.timingsBytes,
    EXPECTED_CURRENT_TIMINGS_BYTES,
    "current timing bytes",
  );
  exact(
    current.durationSeconds,
    EXPECTED_CURRENT_DURATION_SECONDS,
    "current duration",
  );
  exact(safe.audioBytes, EXPECTED_SAFE_AUDIO_BYTES, "safe audio bytes");
  exact(safe.timingsBytes, EXPECTED_SAFE_TIMINGS_BYTES, "safe timing bytes");
  exact(
    safe.durationSeconds,
    EXPECTED_SAFE_DURATION_SECONDS,
    "safe duration",
  );
  exact(
    safe.exactWordCount,
    EXPECTED_SAFE_EXACT_WORD_COUNT,
    "safe exact word count",
  );
  exact(
    safe.interpolatedWordCount,
    EXPECTED_SAFE_INTERPOLATED_WORD_COUNT,
    "safe interpolated word count",
  );
}

export async function loadCoherencePublisherAudioAuthorities(): Promise<
  CoherencePublisherAudioAuthorities
> {
  assertCoherencePublisherAudioAuthorityPaths();
  const sourceManifestText = readRegularAuthority(
    audioManifestSourcePath,
    "Coherence audio manifest",
  );
  const publicationManifestText = readRegularAuthority(
    publisherPublicationManifestPath,
    "Publisher publication manifest",
  );
  const sourceManifest = parseStrictJson(
    sourceManifestText,
    "Coherence audio manifest strict JSON",
  );
  const publicationManifest = parseStrictJson(
    publicationManifestText,
    "Publisher publication manifest strict JSON",
  );
  const contentAuthorities = await loadCoherencePublisherContentAuthorities();
  const content = await adaptCoherencePublisherContent(contentAuthorities);
  return Object.freeze({
    content,
    rawCatalog: contentAuthorities.rawCatalog,
    sourceManifestText,
    sourceManifest,
    publicationManifestText,
    publicationManifest,
    checkpoints: Object.freeze(
      validateAudioPublicationCheckpoints(audioPublicationCheckpointsRoot),
    ),
  });
}

export async function adaptCoherencePublisherAudio(
  authorities: CoherencePublisherAudioAuthorities,
): Promise<CoherencePublisherAudioProof> {
  exact(
    sha256Text(authorities.sourceManifestText),
    EXPECTED_SOURCE_MANIFEST_TEXT_SHA256,
    "source manifest text identity",
  );
  exact(
    sha256Text(authorities.publicationManifestText),
    EXPECTED_PUBLICATION_MANIFEST_TEXT_SHA256,
    "publication manifest text identity",
  );
  exactJson(
    parseStrictJson(
      authorities.sourceManifestText,
      "bound Coherence audio manifest text",
    ),
    authorities.sourceManifest,
    "source manifest text binding",
  );
  exactJson(
    parseStrictJson(
      authorities.publicationManifestText,
      "bound Publisher publication manifest text",
    ),
    authorities.publicationManifest,
    "publication manifest text binding",
  );
  assertPublicationHasNoAudioDeclaration(authorities.publicationManifest);
  const source = inspectAndNormalizeSourceManifest(authorities.sourceManifest);
  const normalized = source.normalized;
  exact(normalized.voices.length, 1, "normalized voice count");
  const voice = normalized.voices[0]!;
  exact(voice.sections.length, EXPECTED_CURRENT_CLIP_COUNT, "current clip count");
  exact(
    authorities.content.evidence.currentShape.sectionCount,
    EXPECTED_CURRENT_CLIP_COUNT,
    "Reader section count",
  );
  exact(
    authorities.checkpoints.length,
    EXPECTED_CHECKPOINT_COUNT,
    "checkpoint count",
  );
  for (const [index, checkpoint] of authorities.checkpoints.entries()) {
    validateAudioPublicationCheckpoint(
      checkpoint,
      `injected Coherence audio checkpoint ${index}`,
    );
  }
  const completeCheckpointAuthoritySha256 = digest(authorities.checkpoints);
  exact(
    completeCheckpointAuthoritySha256,
    EXPECTED_COMPLETE_CHECKPOINT_AUTHORITY_SHA256,
    "complete checkpoint authority identity",
  );
  const historicalUnitCount = authorities.checkpoints.reduce(
    (total, checkpoint) => total + checkpoint.files.length,
    0,
  );
  exact(
    historicalUnitCount,
    EXPECTED_HISTORICAL_UNIT_COUNT,
    "historical checkpoint unit count",
  );

  const rawCatalog = authorities.rawCatalog;
  const rawBySectionId = new Map(
    rawCatalog.sections.map((section) => [section.sectionId, section]),
  );
  exact(rawBySectionId.size, EXPECTED_CURRENT_CLIP_COUNT, "raw catalog section count");
  const rawAudioTextWordCount = [...rawBySectionId.values()].reduce(
    (total, section) => total + wordCount(textForAudio(section)),
    0,
  );
  exact(
    rawAudioTextWordCount,
    EXPECTED_RAW_AUDIO_TEXT_WORD_COUNT,
    "raw catalog audio text word count",
  );
  for (const clip of voice.sections) {
    const raw = rawBySectionId.get(clip.sectionId);
    if (raw === undefined) fail(`${clip.sectionId} is absent from the raw catalog.`);
    const expectedVersion = audioVersionId(
      raw.sectionId,
      audioInputHash(raw.title, raw.text),
    );
    exact(clip.audioVersionId, raw.audioVersionId, `${clip.sectionId} raw audio version`);
    exact(clip.audioVersionId, expectedVersion, `${clip.sectionId} derived audio version`);
  }

  const checkpointByClip = matchCurrentClipsToCheckpoints(
    normalized,
    authorities.checkpoints,
  );
  const currentMatches = voice.sections.map((clip) =>
    checkpointByClip.get(`${voice.id}\u0000${clip.sectionId}`)!,
  );
  const currentProvenance = summarizeProvenance(currentMatches);
  exactJson(currentProvenance, EXPECTED_CURRENT_PROVENANCE, "current provenance");

  const readerSections = new Map(
    authorities.content.reader.works.flatMap((work) =>
      work.sections.map((section) => [section.id, { workId: work.id, section }] as const),
    ),
  );
  exact(readerSections.size, EXPECTED_CURRENT_CLIP_COUNT, "Reader narration section count");
  const comparisons = voice.sections.map((clip) => {
    const raw = rawBySectionId.get(clip.sectionId)!;
    const reader = readerSections.get(clip.sectionId);
    if (reader === undefined) fail(`${clip.sectionId} is absent from the Reader.`);
    const coherenceText = textForAudio(raw);
    const publisherText = createReaderNarrationSectionTextProfile(
      reader.section,
    );
    return Object.freeze({
      sectionId: clip.sectionId,
      workId: reader.workId,
      exact: coherenceText === publisherText.text,
      equalLength: coherenceText.length === publisherText.text.length,
      coherenceTextSha256: sha256Text(coherenceText),
      publisherTextSha256: sha256Text(publisherText.text),
      coherenceTextBytes: Buffer.byteLength(coherenceText, "utf8"),
      publisherTextBytes: Buffer.byteLength(publisherText.text, "utf8"),
      publisherWordCount:
        publisherText.titleWordCount + publisherText.bodyWordCount,
    });
  });
  const comparisonBySection = new Map(
    comparisons.map((comparison) => [comparison.sectionId, comparison]),
  );
  const safeClips = voice.sections.filter(
    (clip) => comparisonBySection.get(clip.sectionId)!.exact,
  );
  const omittedClips = voice.sections.filter(
    (clip) => !comparisonBySection.get(clip.sectionId)!.exact,
  );
  const equalLengthMismatchCount = comparisons.filter(
    ({ exact, equalLength }) => !exact && equalLength,
  ).length;
  const differentLengthMismatchCount = comparisons.filter(
    ({ exact, equalLength }) => !exact && !equalLength,
  ).length;
  exact(safeClips.length, EXPECTED_SAFE_CLIP_COUNT, "safe clip count");
  exact(omittedClips.length, EXPECTED_OMITTED_CLIP_COUNT, "omitted clip count");
  exact(
    equalLengthMismatchCount,
    EXPECTED_EQUAL_LENGTH_MISMATCH_COUNT,
    "equal length mismatch count",
  );
  exact(
    differentLengthMismatchCount,
    EXPECTED_DIFFERENT_LENGTH_MISMATCH_COUNT,
    "different length mismatch count",
  );
  const safeSectionIds = Object.freeze(safeClips.map(({ sectionId }) => sectionId));
  const withheldIncompatibleSectionIds = Object.freeze(
    omittedClips.map(({ sectionId }) => sectionId),
  );
  exact(
    digest(safeSectionIds),
    EXPECTED_SAFE_SECTION_IDS_SHA256,
    "safe section ID identity",
  );
  const safeClipsByWork = authorities.content.reader.works.map((work) =>
    Object.freeze({
      workId: work.id,
      clipCount: safeSectionIds.filter(
        (sectionId) => readerSections.get(sectionId)?.workId === work.id,
      ).length,
    }),
  );
  exactJson(safeClipsByWork, EXPECTED_SAFE_CLIPS_BY_WORK, "safe work coverage");
  const safeMatches = safeClips.map((clip) =>
    checkpointByClip.get(`${voice.id}\u0000${clip.sectionId}`)!,
  );
  for (const [index, clip] of safeClips.entries()) {
    const comparison = comparisonBySection.get(clip.sectionId)!;
    const file = safeMatches[index]!.file;
    exact(
      file.exactWordCount + file.interpolatedWordCount,
      comparison.publisherWordCount,
      `${clip.sectionId} checkpoint timing word coverage`,
    );
  }
  const safeProvenance = summarizeProvenance(safeMatches);
  exactJson(safeProvenance, EXPECTED_SAFE_PROVENANCE, "safe provenance");
  const currentCensus = sumMatches(currentMatches);
  const safeCensus = sumMatches(safeMatches);
  assertReviewedCensus(currentCensus, safeCensus);
  exact(
    currentCensus.exactWordCount + currentCensus.interpolatedWordCount,
    source.unsupportedFields[0]!.value,
    "checkpoint-derived rendered word count",
  );

  const projectedValue = {
    ...(normalized.$schema === undefined ? {} : { $schema: normalized.$schema }),
    version: normalized.version,
    ...(normalized.generatedAt === undefined
      ? {}
      : { generatedAt: normalized.generatedAt }),
    voices: [
      {
        id: voice.id,
        label: voice.label,
        ...(voice.provider === undefined ? {} : { provider: voice.provider }),
        ...(voice.model === undefined ? {} : { model: voice.model }),
        sections: safeClips.map((clip) => ({ ...clip })),
      },
    ],
  };
  const catalog = requireValid(
    validateAudioCatalogShape(projectedValue),
    "projected exact-profile catalog",
  );
  const catalogText = `${canonicalizeJson(catalog as unknown as JSONValue)}\n`;
  const roundTripJson = parseStrictJson(
    catalogText,
    "projected catalog canonical strict JSON round trip",
  );
  const roundTripCatalog = requireValid(
    validateAudioCatalogShape(roundTripJson),
    "projected catalog strict round trip schema",
  );
  if (!isDeepStrictEqual(roundTripCatalog, catalog)) {
    fail("projected catalog strict round trip changed its value.");
  }
  const catalogTextSha256 = sha256Text(catalogText);
  const sectionIds = authorities.content.reader.works.flatMap((work) =>
    work.sections.map(({ id }) => id),
  );
  const resolvedAudio = requireValid(
    resolvePublicationAudio({
      catalog: roundTripCatalog,
      declaredCatalogPath: LOGICAL_AUDIO_CATALOG_PATH,
      sectionIds,
    }),
    "projected catalog resolution",
  );
  const built = requireValid(
    buildAudioEnvelope({
      audio: resolvedAudio,
      adapter: Object.freeze({
        package: "coherence-thesis",
        config: Object.freeze({
          mode: "exact-reader-narration-profile",
          sourceDeclaration: "synthetic-proof-only",
          sourceManifestPath: relativePath(audioManifestSourcePath),
          sourceManifestTextSha256: EXPECTED_SOURCE_MANIFEST_TEXT_SHA256,
        }),
      }),
      publicationId: authorities.content.reader.publicationId,
      buildId: authorities.content.reader.buildId,
      catalogText,
    }),
    "projected audio envelope",
  );
  exact(
    built.envelope.source.catalogPath,
    LOGICAL_AUDIO_CATALOG_PATH,
    "envelope logical catalog path",
  );
  exact(
    built.envelope.source.catalogSha256,
    catalogTextSha256,
    "envelope exact catalog text binding",
  );
  const envelopeRoundTripJson = parseStrictJson(
    built.text,
    "audio envelope strict JSON round trip",
  );
  const envelopeRoundTrip = requireValid(
    validateAudioEnvelopeShape(envelopeRoundTripJson),
    "audio envelope strict round trip schema",
  );
  if (!isDeepStrictEqual(envelopeRoundTrip, built.envelope)) {
    fail("audio envelope strict round trip changed its value.");
  }
  const narration = parseReaderNarrationEnvelope(built.text, {
    publicationId: authorities.content.reader.publicationId,
    readerBuildId: authorities.content.reader.buildId,
  });
  if (narration === null) fail("audio envelope did not project to Reader narration.");
  exact(narration.statistics.clipCount, EXPECTED_SAFE_CLIP_COUNT, "narration clips");
  exact(narration.statistics.voiceCount, 1, "narration voice count");
  exact(
    narration.statistics.sectionCount,
    EXPECTED_CURRENT_CLIP_COUNT,
    "narration section count",
  );
  exact(built.envelope.voices.length, 1, "envelope voice count");
  const envelopeVoice = built.envelope.voices[0]!;
  exact(
    envelopeVoice.narratedSectionCount,
    EXPECTED_SAFE_CLIP_COUNT,
    "envelope narrated section count",
  );
  exact(
    envelopeVoice.unnarratedSectionCount,
    EXPECTED_OMITTED_CLIP_COUNT,
    "envelope unnarrated section count",
  );
  exact(
    built.envelope.statistics.clipCount,
    EXPECTED_SAFE_CLIP_COUNT,
    "envelope clip count",
  );
  exact(
    built.envelope.statistics.sectionCount,
    EXPECTED_CURRENT_CLIP_COUNT,
    "envelope section count",
  );
  const envelopeClips = envelopeVoice.clips;
  const envelopeSectionIds = envelopeClips
    .map(({ sectionId }) => sectionId)
    .sort();
  exactJson(
    envelopeSectionIds,
    [...safeSectionIds].sort(),
    "envelope safe section IDs",
  );
  const narrationSectionIds = narration.voices
    .flatMap(({ clips }) => clips.map(({ sectionId }) => sectionId))
    .sort();
  exactJson(
    narrationSectionIds,
    [...safeSectionIds].sort(),
    "Reader narration safe section IDs",
  );
  if (
    withheldIncompatibleSectionIds.some((sectionId) =>
      narrationSectionIds.includes(sectionId),
    )
  ) {
    fail("Reader narration retained a withheld incompatible published clip.");
  }
  const createApplication = await loadCreatePublicationNextApplication();
  const stateMigrationProjection =
    authorities.content.extensionData.extensions[0]?.clientData;
  assertCoherenceReaderStateMigrationProjection(stateMigrationProjection);
  const stateMigrationExtension =
    createCoherenceReaderStateMigrationExtensionRegistration(
      stateMigrationProjection,
    );
  const application = requireValid(
    await createApplication({
      reader: authorities.content.reader,
      audioData: built.envelope,
      readerStateBootstrap: coherenceReaderStateBootstrap,
      theme: resolveDefaultPublisherNextTheme(),
      extensionData: authorities.content.extensionData,
      extensions: [stateMigrationExtension],
    }),
    "in-memory Publisher Next audio assembly",
  );
  exact(
    application.manifest.buildId,
    authorities.content.application.manifest.buildId,
    "audio-independent application manifest build identity",
  );
  exact(
    sha256Text(application.artifact.text),
    application.artifact.hash,
    "application artifact text identity",
  );
  exactJson(
    application.artifact.manifest,
    application.manifest,
    "application artifact manifest identity",
  );
  const offlineCatalogText = serializeReaderOfflineCatalog(
    application.offlineCatalog,
  );
  exact(
    application.offlineCatalogText,
    offlineCatalogText,
    "application offline catalog serialization",
  );
  const offlineCatalog = parseReaderOfflineCatalog(offlineCatalogText, {
    publicationId: authorities.content.reader.publicationId,
    readerBuildId: authorities.content.reader.buildId,
    rendererBuildId: application.manifest.buildId,
  });
  if (offlineCatalog === null) fail("offline catalog did not round trip.");
  const offlineResources = offlineCatalog.packages.flatMap(
    ({ resources }) => resources,
  );
  const offlineAudioResourceCount = offlineResources.filter(
    ({ kind }) => kind === "audio",
  ).length;
  const offlineTimingResourceCount = offlineResources.filter(
    ({ kind }) => kind === "timing",
  ).length;
  const offlineNarrationCatalogHashBindingCount = offlineCatalog.packages.filter(
    ({ version }) => version.narrationCatalogHash === catalogTextSha256,
  ).length;
  exact(
    offlineAudioResourceCount,
    EXPECTED_SAFE_CLIP_COUNT,
    "offline audio resource count",
  );
  exact(
    offlineTimingResourceCount,
    EXPECTED_SAFE_CLIP_COUNT,
    "offline timing resource count",
  );
  exact(
    offlineNarrationCatalogHashBindingCount,
    offlineCatalog.packages.length,
    "offline package catalog hash bindings",
  );
  const resourceIdentity = (
    resource: Readonly<{ href: string; byteSize?: number }>,
  ): Readonly<{ href: string; byteSize: number | null }> =>
    Object.freeze({
      href: resource.href,
      byteSize: resource.byteSize ?? null,
    });
  const sortResourceIdentities = <
    T extends Readonly<{ href: string; byteSize: number | null }>,
  >(
    resources: readonly T[],
  ): T[] => [...resources].sort((left, right) => left.href.localeCompare(right.href));
  const expectedOfflineAudioResources = sortResourceIdentities(
    safeClips.map((clip) => resourceIdentity(clip)),
  );
  const actualOfflineAudioResources = sortResourceIdentities(
    offlineResources
    .filter(({ kind }) => kind === "audio")
      .map(resourceIdentity),
  );
  exactJson(
    actualOfflineAudioResources,
    expectedOfflineAudioResources,
    "offline audio resources",
  );
  const expectedOfflineTimingResources = sortResourceIdentities(
    safeClips.map((clip) =>
      resourceIdentity({
        href: timingHrefForClip(clip),
        byteSize: clip.timingsByteSize,
      }),
    ),
  );
  const actualOfflineTimingResources = sortResourceIdentities(
    offlineResources
      .filter(({ kind }) => kind === "timing")
      .map(resourceIdentity),
  );
  exactJson(
    actualOfflineTimingResources,
    expectedOfflineTimingResources,
    "offline timing resources",
  );
  exact(offlineCatalog.packages.length, 9, "offline package count");
  const safeClipBySectionId = new Map(
    safeClips.map((clip) => [clip.sectionId, clip]),
  );
  for (const readerWork of authorities.content.reader.works) {
    const packages = offlineCatalog.packages.filter(
      ({ workId }) => workId === readerWork.id,
    );
    exact(packages.length, 1, `${readerWork.id} offline package count`);
    const offlinePackage = packages[0]!;
    const workSafeClips = readerWork.sections.flatMap(({ id }) => {
      const clip = safeClipBySectionId.get(id);
      return clip === undefined ? [] : [clip];
    });
    const expectedWorkAudio = sortResourceIdentities(
      workSafeClips.map((clip) => resourceIdentity(clip)),
    );
    const expectedWorkTimings = sortResourceIdentities(
      workSafeClips.map((clip) =>
        resourceIdentity({
          href: timingHrefForClip(clip),
          byteSize: clip.timingsByteSize,
        }),
      ),
    );
    const actualWorkAudio = sortResourceIdentities(
      offlinePackage.resources
        .filter(({ kind }) => kind === "audio")
        .map(resourceIdentity),
    );
    const actualWorkTimings = sortResourceIdentities(
      offlinePackage.resources
        .filter(({ kind }) => kind === "timing")
        .map(resourceIdentity),
    );
    exactJson(actualWorkAudio, expectedWorkAudio, `${readerWork.id} offline audio`);
    exactJson(
      actualWorkTimings,
      expectedWorkTimings,
      `${readerWork.id} offline timings`,
    );
    exact(
      offlinePackage.audioClipCount,
      workSafeClips.length,
      `${readerWork.id} offline audio clip count`,
    );
    exact(
      offlinePackage.version.readerBuildId,
      authorities.content.reader.buildId,
      `${readerWork.id} offline Reader identity`,
    );
    exact(
      offlinePackage.version.rendererBuildId,
      application.manifest.buildId,
      `${readerWork.id} offline renderer identity`,
    );
    exact(
      offlinePackage.version.workContentHash,
      readerWork.contentHash,
      `${readerWork.id} offline work identity`,
    );
    exact(
      offlinePackage.version.narrationCatalogHash,
      catalogTextSha256,
      `${readerWork.id} offline narration catalog identity`,
    );
    exact(
      offlinePackage.resources.filter(
        ({ href, kind }) =>
          href === "/publication-audio.json" && kind === "data",
      ).length,
      1,
      `${readerWork.id} offline narration envelope resource count`,
    );
  }

  const checkpointEvidence = currentMatches.map(({ checkpoint, file }) =>
    Object.freeze({
      checkpointVersion: checkpoint.version,
      checkpointEditorialId: checkpoint.editorialId,
      sectionId: file.sectionId,
      audioVersionId: file.audioVersionId,
      audioObjectKey: file.audio.objectKey,
      audioBytes: file.audio.byteSize,
      audioSha256: file.audio.sha256,
      timingsObjectKey: file.timings.objectKey,
      timingsBytes: file.timings.byteSize,
      timingsSha256: file.timings.sha256,
      durationSeconds: file.durationSeconds,
      exactWordCount: file.exactWordCount,
      interpolatedWordCount: file.interpolatedWordCount,
    }),
  );
  exact(
    digest(checkpointEvidence),
    EXPECTED_CURRENT_CHECKPOINT_MATCH_EVIDENCE_SHA256,
    "current checkpoint match evidence identity",
  );
  const evidenceWithoutHash = Object.freeze({
    schemaVersion: 1 as const,
    proofKind: "coherence-audio-synthetic-constructor-proof" as const,
    integration: Object.freeze({
      syntheticConstructorEvidence: true as const,
      sourceDeclarationPresent: false as const,
      materializedCatalog: false as const,
      applicationConstructedInMemory: true as const,
      publicApplicationAssembly: false as const,
      hostIntegrated: false as const,
      routesActivated: false as const,
      audioParity: false as const,
      timingParity: false as const,
      publisherCheckpointCompatible: false as const,
      liveRemoteBytesVerified: false as const,
      networkAccessPerformed: false as const,
      durableWritesPerformed: false as const,
    }),
    authorities: Object.freeze({
      sourceManifestPath: relativePath(audioManifestSourcePath),
      sourceManifestBytes: Buffer.byteLength(authorities.sourceManifestText, "utf8"),
      sourceManifestTextSha256: sha256Text(authorities.sourceManifestText),
      publicationManifestPath: relativePath(publisherPublicationManifestPath),
      publicationManifestTextSha256: sha256Text(
        authorities.publicationManifestText,
      ),
      sourceDeclarationPresent: false as const,
      unsupportedSourceFields: source.unsupportedFields,
      rawCatalogSectionCount: rawBySectionId.size,
      currentClipCount: voice.sections.length,
      currentVersionBindingCount: voice.sections.length,
      checkpointCount: authorities.checkpoints.length,
      historicalCheckpointUnitCount: historicalUnitCount,
      exactCurrentCheckpointMatchCount: currentMatches.length,
      ambiguousCurrentCheckpointMatchCount: 0 as const,
      missingCurrentCheckpointMatchCount: 0 as const,
      currentProvenance,
      completeCheckpointAuthoritySha256,
      currentCheckpointMatchEvidenceSha256: digest(checkpointEvidence),
      publisherCheckpointCompatible: false as const,
      publisherCheckpointCount: 0 as const,
      publisherHistoricalSpokenTextAuthorityPresent: false as const,
      renderedWordCount: source.unsupportedFields[0]!.value,
      rawAudioTextWordCount,
      wordCounterDifference:
        rawAudioTextWordCount - source.unsupportedFields[0]!.value,
      historicalSourceBinding: NON_GATING_HISTORICAL_SOURCE_BINDING,
    }),
    projection: Object.freeze({
      policy:
        "byte-exact-coherence-audio-text-equals-publisher-profile" as const,
      safeClipCount: safeClips.length,
      timingDeclarationCount: safeClips.filter(
        ({ timingsByteSize }) => timingsByteSize !== undefined,
      ).length,
      timingDeclarationKind: "checkpoint-bound-reference" as const,
      timingBodiesParsed: false as const,
      withheldIncompatiblePublishedClipCount: omittedClips.length,
      equalLengthMismatchCount,
      differentLengthMismatchCount,
      safeSectionIdsSha256: digest(safeSectionIds),
      withheldIncompatibleSectionIdsSha256: digest(
        withheldIncompatibleSectionIds,
      ),
      narrationComparisonSha256: digest(comparisons),
      safeProvenance,
      safeClipsByWork: Object.freeze(safeClipsByWork),
      currentCensus,
      safeCensus,
    }),
    catalog: Object.freeze({
      logicalPath: LOGICAL_AUDIO_CATALOG_PATH,
      materialized: false as const,
      canonicalValueSha256: digest(catalog),
      canonicalTextSha256: catalogTextSha256,
      canonicalTextBytes: Buffer.byteLength(catalogText, "utf8"),
      strictRoundTripParsed: true as const,
      strictRoundTripSchemaValidated: true as const,
      strictRoundTripDeepEqual: true as const,
    }),
    envelope: Object.freeze({
      catalogPath: LOGICAL_AUDIO_CATALOG_PATH,
      catalogTextSha256,
      envelopeTextSha256: sha256Text(built.text),
      readerProjectionParsed: true as const,
      strictRoundTripParsed: true as const,
      strictRoundTripSchemaValidated: true as const,
      strictRoundTripDeepEqual: true as const,
      clipCount: narration.statistics.clipCount,
      timingDeclarationCount: narration.voices.reduce(
        (total, narrationVoice) =>
          total +
          narrationVoice.clips.filter(
            ({ timingsByteSize }) => timingsByteSize !== undefined,
          ).length,
        0,
      ),
    }),
    application: Object.freeze({
      constructedInMemory: true as const,
      publicAssembly: false as const,
      readerBuildId: authorities.content.reader.buildId,
      applicationBuildId: application.manifest.buildId,
      applicationArtifactSha256: application.artifact.hash,
      applicationManifestBindsAudio: false as const,
      audioBinding:
        "envelope-catalog-hash-and-offline-package-catalog-hash" as const,
      offlineCatalogTextSha256: sha256Text(application.offlineCatalogText),
      offlineCatalogParsed: true as const,
      offlinePackageCount: offlineCatalog.packages.length,
      offlineAudioResourceCount,
      offlineTimingResourceCount,
      offlineNarrationCatalogHashBindingCount,
    }),
    limitations: Object.freeze({
      withheldClipReason:
        "The 403 withheld incompatible published clips narrate Coherence text that is not byte exact with the Publisher Reader narration profile, so this proof omits them from playback as well as timing projection.",
      timingReferenceReason:
        "The 122 timing declarations are checkpoint-bound references. This proof does not read or parse timing bodies and does not claim timing parity.",
      checkpointReason:
        "Coherence checkpoints bind current objects, sizes, durations, and hashes, but they are not Publisher AudioCheckpoint records and do not carry Publisher Reader build or historical spoken-text authority.",
    }),
  });
  const evidence: CoherencePublisherAudioEvidence = Object.freeze({
    ...evidenceWithoutHash,
    evidenceSha256: digest(evidenceWithoutHash),
  });
  return Object.freeze({
    catalog,
    catalogText,
    envelope: built.envelope,
    envelopeText: built.text,
    narration,
    application,
    safeSectionIds,
    withheldIncompatibleSectionIds,
    evidence,
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    fail("this command accepts no arguments.");
  }
  const proof = await adaptCoherencePublisherAudio(
    await loadCoherencePublisherAudioAuthorities(),
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "verified",
        proofKind: proof.evidence.proofKind,
        evidenceSha256: proof.evidence.evidenceSha256,
        builds: {
          reader: proof.evidence.application.readerBuildId,
          application: proof.evidence.application.applicationBuildId,
        },
        counts: {
          currentClips: proof.evidence.authorities.currentClipCount,
          safeClips: proof.evidence.projection.safeClipCount,
          withheldIncompatiblePublishedClips:
            proof.evidence.projection.withheldIncompatiblePublishedClipCount,
          timingDeclarations: proof.evidence.projection.timingDeclarationCount,
          checkpoints: proof.evidence.authorities.checkpointCount,
          historicalCheckpointUnits:
            proof.evidence.authorities.historicalCheckpointUnitCount,
        },
        identities: {
          sourceManifestText:
            proof.evidence.authorities.sourceManifestTextSha256,
          completeCheckpointAuthority:
            proof.evidence.authorities.completeCheckpointAuthoritySha256,
          currentCheckpointMatchEvidence:
            proof.evidence.authorities.currentCheckpointMatchEvidenceSha256,
          safeSectionIds: proof.evidence.projection.safeSectionIdsSha256,
          withheldIncompatibleSectionIds:
            proof.evidence.projection.withheldIncompatibleSectionIdsSha256,
          narrationComparison:
            proof.evidence.projection.narrationComparisonSha256,
          catalogValue: proof.evidence.catalog.canonicalValueSha256,
          catalogText: proof.evidence.catalog.canonicalTextSha256,
          envelopeText: proof.evidence.envelope.envelopeTextSha256,
          applicationArtifact:
            proof.evidence.application.applicationArtifactSha256,
          offlineCatalogText:
            proof.evidence.application.offlineCatalogTextSha256,
        },
        integration: proof.evidence.integration,
      },
      null,
      2,
    )}\n`,
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    void error;
    process.stderr.write("publisher:audio:adapt: isolated proof failed.\n");
    process.exitCode = 1;
  });
}
