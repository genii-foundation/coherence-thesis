import {
  spawn,
  spawnSync,
  type ChildProcess,
} from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { brotliDecompressSync } from "node:zlib";
import {
  canonicalizeJson,
  hashCanonicalJson,
} from "@genii-foundation/publisher-content";
import {
  PUBLISHER_NEXT_APPLICATION_ARTIFACT_KIND,
  PUBLISHER_NEXT_APPLICATION_ARTIFACT_MEDIA_TYPE,
  PUBLISHER_NEXT_APPLICATION_ARTIFACT_RELATIVE_PATH,
  PUBLISHER_NEXT_APPLICATION_SCHEMA_URL,
  PUBLISHER_NEXT_APPLICATION_SCHEMA_VERSION,
  PUBLISHER_NEXT_REQUIRED_HOST_OVERRIDES,
} from "@genii-foundation/publisher-next";
import {
  PUBLISHER_NEXT_AUDIO_DATA_PATH,
  PUBLISHER_NEXT_HOST_CONTRACT_VERSION,
  PUBLISHER_NEXT_HOST_RENDERER,
  PUBLISHER_NEXT_PROGRESS_DATA_PATH,
  PUBLISHER_NEXT_PUBLIC_IDENTITY_DATA_PATH,
  PUBLISHER_NEXT_READER_DATA_PATH,
  PUBLISHER_NEXT_SEARCH_DATA_PATH,
  PUBLISHER_NEXT_EXTENSION_DATA_PATH,
  PUBLISHER_NEXT_SYNC_DATA_PATH,
  PUBLISHER_NEXT_UPDATES_DATA_PATH,
  createPublisherNextHostTemplate,
  type PublisherNextHostFile,
  type PublisherNextHostTemplate,
} from "@genii-foundation/publisher-next/host";
import {
  resolveArtifactDestination,
  writeHostArtifact,
  type PublisherExtensionDataEnvelope,
} from "@genii-foundation/publisher/node";
import type {
  JSONValue,
  PublicationReaderEnvelope,
} from "@genii-foundation/publisher-schema";
import { auditPublisherCandidate } from "../repository/publisher-candidate";
import {
  auditCoherencePublisherEmbeddedOfflineAuthority,
} from "../repository/publisher-embedded-offline-authority";
import {
  editorialRoot,
  generatedPublisherExtensionDataPath,
  generatedPublisherPublicIdentityPath,
  generatedPublisherReaderPath,
  generatedPublisherRoot,
  generatedPublisherThemeHostProofRoot,
  generatedPublisherUpdatesPath,
  publisherConfigurationRoot,
  publishingRoot,
  publicPublisherReaderProgressPath,
  publicPublisherReaderSearchPath,
  publicPublisherStateMigrationPath,
  repoRoot,
} from "../repository/paths";
import {
  createPublisherReaderArtifacts,
  type PublisherReaderArtifact,
} from "./reader-build";
import {
  adaptCoherencePublisherContent,
  loadCoherencePublisherContentAuthorities,
  type CoherencePublisherContentEvidence,
  type CoherencePublisherContentProof,
} from "./content-adapter";
import {
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION,
  assertCoherenceReaderStateMigrationProjection,
  type CoherenceReaderStateMigrationProjection,
} from "../../src/publisher/reader-state-migration-extension-contract";
import {
  COHERENCE_READER_STATE_MIGRATION_HREF,
} from "../../src/publisher/reader-state-migration-schema";
import type {
  MaterializedCoherenceReaderStateMigrationArtifact,
} from "./reader-state-migration-artifact";
import { verifyCoherencePublisherUpdatesDormancy } from "./updates-adapter";
import {
  coherencePublisherTransitionPreviewBoundary,
  createCoherencePublisherTransitionPreviewApplication,
} from "../../src/publisher/transition-preview-application";

const EXPECTED_NODE_VERSION = "22.12.0";
const EXPECTED_NPM_VERSION = "10.9.0";
const EXPECTED_RENDERER_VERSION = "0.1.0-alpha.0";
const EXPECTED_THEME_PACKAGE = "coherence-thesis";
const EXPECTED_THEME_VERSION = "0.1.0";
const EXPECTED_THEME_RENDERER_COMPATIBILITY = ">=0.1.0-alpha.0 <0.2.0";
const EXPECTED_PUBLISHER_CANDIDATE_COMMIT =
  "ab4c5733764ee3a24ad9bcbe9bf2d85b61c032ba";
const EXPECTED_PUBLISHER_CANDIDATE_BUILD_ID =
  "sha256:520f8850edf46a0e83f326f9eb04b80467461310822781d5dba7f27ee912c2cc";
const EXPECTED_PUBLISHER_CANDIDATE_ARCHIVE_COUNT = 5;
const EXPECTED_EMBEDDED_HOST_SOURCES_BUILD_ID =
  "sha256:45d0be96fd0672aeac3091dd3d0d72a8e1551078d43a34ebf6e60000515fd6b5";
const EXPECTED_EMBEDDED_HOST_SOURCE_COUNT = 124;
const EXPECTED_EMBEDDED_HOST_SOURCE_BYTES = 1_615_141;
const EXPECTED_FONTKIT_VERSION = "2.0.4";
const EXPECTED_FONTKIT_RESOLVED =
  "https://registry.npmjs.org/fontkit/-/fontkit-2.0.4.tgz";
const EXPECTED_FONTKIT_INTEGRITY =
  "sha512-syetQadaUEDNdxdugga9CpEYVaQIxOwk7GlwZWWZ19//qW4zE5bknOKeMBDYAASwnpaSHKJITRLMF9m1fp3s6g==";
const EXPECTED_COMPILED_CSS_HASH =
  "sha256:7b53a352eabf2d0e759292957f01af310a9a59579297fe97aefaafc9a13ef2d7";
const EXPECTED_FONT_EVIDENCE_HASH =
  "sha256:b04796eae5d76d06d07e2372376ec2de8d4c9df78aef6f55b0bb601ffa63a1ca";
const EXPECTED_COMPILED_FONT_ASSET_COUNT = 48;
const EXPECTED_OFFICIAL_FILE_COUNT = 33;
const EXPECTED_READER_ARTIFACT_COUNT = 4;
const EXPECTED_SEMANTIC_LINK_COUNT = 21;
const EXPECTED_SEMANTIC_LINK_BLOCK_GROUP_COUNT = 17;
const EXPECTED_CONTENT_BUILD_ID =
  "sha256:875982935232aa71f0a615cf94f07323a2adb18cc648e213d0fd06e5579e0b17";
const EXPECTED_READER_BUILD_ID =
  "sha256:77f94de86e3fe3462a4f905ad2884207aa11f8b9137dcf90486031a214af7d03";
const EXPECTED_CURRENT_ADAPTED_APPLICATION_BUILD_ID =
  "sha256:088a25ba74bf51995d9dc61fe67473b94f74181b6051fa614c6756588a3fb547";
const EXPECTED_HISTORICAL_ADAPTED_APPLICATION_BUILD_ID =
  "sha256:69f40109916aa544325935c52f46a1f8a47dd590eb0ebcc6d163c3c5ee15b5bc";
const EXPECTED_ACTIVE_ROUTE_COUNT = 586;
const EXPECTED_EXPLICIT_REDIRECT_COUNT = 584;
const EXPECTED_ROUTE_PLAN_STATIC_PARAM_COUNT = 586;
const EXPECTED_APPLICATION_STATIC_PARAM_COUNT = 585;
const EXPECTED_CANONICAL_SLASH_REDIRECT_COUNT = 585;
const EXPECTED_ROUTE_PLAN_ACTIVE_PATHS_HASH =
  "sha256:62d07fd9d597dd4f86ca53dedaff583efd155aabc421caef578cefa38a648991";
const EXPECTED_READER_ACTIVE_ROUTES_HASH =
  "sha256:fdc059c5da46c87261211eb30cda835f01e5b9d719615984e05b7420a430fe94";
const EXPECTED_ROUTE_PLAN_STATIC_PARAMS_HASH =
  "sha256:7268c8b6dfdd6436088d8aa7a900c3d951d1cff8c22d6f6de084c5de1ffeb146";
const EXPECTED_APPLICATION_STATIC_PARAMS_HASH =
  "sha256:dcf4d19e4173927dc88c43b4908d146537ca820d660e4af30a5f2d134a6e067e";
const EXPECTED_REDIRECT_TUPLES_HASH =
  "sha256:8193048bfc8ece56bf2d2349d7e6468d07ec7e9a663961aedffb77ff40be3948";
const EXPECTED_SECTION_INDEX_COUNT = 3;
const EXPECTED_SECTION_INDEX_REFERENCE_COUNT = 57;
const EXPECTED_SECTION_INDEXES_HASH =
  "sha256:1bbe96438b6c2b4f772b5c2bde098108f9cd7a82ad58b7307ee70a1bc365e25c";
const EXPECTED_SECTION_INDEX_PATHS = Object.freeze([
  "/manuscripts/3/governance/",
  "/manuscripts/3/the-design/",
  "/manuscripts/6/the-whole-in-the-fewest-words/",
]);
const EXPECTED_SECTION_INDEX_PATHS_HASH =
  "sha256:6cc441c431d1236763bcb310ada0b766bfeeb4e4d3bc1e8aa087e3651ca4692d";
const EXPECTED_UPDATES_CATALOG_TEXT_HASH =
  "sha256:f57afe7238fb47d84c4acbce0488c8190026d4944706bc8997bccca3ba53be46";
const EXPECTED_UPDATES_DATA_TEXT_HASH =
  "sha256:b5f0f4acf0a7eeddaa1b076c97ce42240bdc0652c26a880005726ae911837e0d";
const EXPECTED_SOURCE_WORK_ID = "humanitys-most-viable-future";
const EXPECTED_SOURCE_WORK_PATH = "/manuscripts/1/";
const EXPECTED_CURRENT_CONTENT_EVIDENCE_HASH =
  "sha256:7a4de33169f6f21e799acf97ddb702bcf84bd2df341fa2e542096cc6be6c5f37";
const EXPECTED_HISTORICAL_CONTENT_EVIDENCE_HASH =
  "sha256:4794f0799c3d8172573217881657382ad27800d8d991ad2c0f11d26c78fe47b0";
const EXPECTED_ABSENT_READER_BASE_PATH_COUNT = 0;
const EXPECTED_MISSING_READER_FRAGMENT_HREF_COUNT = 0;
const EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_COUNT = 46;
const EXPECTED_CATALOG_CHAPTER_ROOT_CHILD_COUNT = 107;
const EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_GROUPS_HASH =
  "sha256:6e4b2ffb9b6c1b130659a96be104d5e174b02e56286c16bc182fcadf64baacb2";
const EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_IDS_HASH =
  "sha256:8f586a30ae231f85a1103613bce6fa08baec55f510175015605d70a106857cbb";
const EXPECTED_CATALOG_CHAPTER_ROOT_CHILD_IDS_HASH =
  "sha256:1c493c167d85bfdc507f1a0f061efbc7843a2af81bc185733440a7a32e9a3879";
const EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_PATHS_HASH =
  "sha256:aa33821c6b83a0ce25b176762b8bb6c0b24081a79fde993cee17e4dcb270b652";
const EXPECTED_CATALOG_ROOT_ROUTE_ADDITION_COUNT = 44;
const EXPECTED_CATALOG_ROOT_ROUTE_ADDITIONS_HASH =
  "sha256:9ac78c1a980f76a230e449b3a5e9760f2e52d2ea51ba366c7113b36f254edbe2";
const EXPECTED_LIVE_CONTENT_PATH_COUNT = 47;
const EXPECTED_LIVE_CONTENT_PATHS_HASH =
  "sha256:eb3555af3ccc6ab49f5ac500ceed751f7eacaf199f56538442037af7e3c13916";
const PROBE_ROUTE_NAME = "coherence-theme-proof";
const PROOF_HOST_PACKAGE_NAME = "coherence-publisher-theme-host-proof";
const LOCAL_THEME_SOURCE_PATH = "coherence-theme.ts";
const LOCAL_THEME_CONTRACT_SOURCE_PATH =
  "src/publisher/coherence-theme-contract.ts";
const EXPECTED_LOCAL_THEME_CONTRACT_SOURCE_BYTES = 56;
const EXPECTED_LOCAL_THEME_CONTRACT_SOURCE_HASH =
  "sha256:bbac20f170a2aa6341e25a4c3f3c28bebbae7d0ecce00c615db41b17e9dea3bb";
const STATE_MIGRATION_HOST_RELATIVE_PATH =
  `public${COHERENCE_READER_STATE_MIGRATION_HREF}`;
const STATE_MIGRATION_EXTENSION_SOURCE_PATHS = Object.freeze([
  "reader-state-migration-extension.ts",
  "reader-state-migration-extension-client.tsx",
  "reader-state-migration-extension-contract.ts",
  "reader-state-migration.ts",
  "reader-state-migration-schema.ts",
] as const);
const BUILD_TIMEOUT_MS = 300_000;
const SERVER_READY_TIMEOUT_MS = 60_000;
const SERVER_STOP_TIMEOUT_MS = 5_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAXIMUM_PROCESS_OUTPUT_BYTES = 32 * 1024 * 1024;
export const PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAXIMUM_STYLESHEET_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAXIMUM_FONT_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAXIMUM_TOTAL_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAXIMUM_RUNTIME_ARTIFACT_BYTES = 32 * 1024 * 1024;
const MAXIMUM_RUNTIME_ARTIFACT_TOTAL_BYTES = 64 * 1024 * 1024;
const MAXIMUM_RESPONSE_CHUNKS = 8_192;
const MAXIMUM_DIAGNOSTIC_TAIL_BYTES = 32 * 1024;
const MAXIMUM_WOFF2_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MAXIMUM_WOFF2_DECOMPRESSED_BYTES = 16 * 1024 * 1024;
const MAXIMUM_WOFF2_SFNT_BYTES = 16 * 1024 * 1024;
const GIT_PATH = "/usr/bin/git";

export type PublisherThemeRuntimeArtifactEvidence =
  | Readonly<{
      path: string;
      state: "absent";
    }>
  | Readonly<{
      path: string;
      state: "present";
      bytes: number;
      hash: string;
    }>;

function repositoryRelativeArtifactPath(absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

export const PUBLISHER_THEME_RUNTIME_ARTIFACT_PATHS = Object.freeze([
  repositoryRelativeArtifactPath(publicPublisherStateMigrationPath),
  repositoryRelativeArtifactPath(publicPublisherReaderSearchPath),
  repositoryRelativeArtifactPath(publicPublisherReaderProgressPath),
  repositoryRelativeArtifactPath(generatedPublisherPublicIdentityPath),
  repositoryRelativeArtifactPath(generatedPublisherExtensionDataPath),
  repositoryRelativeArtifactPath(generatedPublisherUpdatesPath),
  repositoryRelativeArtifactPath(generatedPublisherReaderPath),
] as const);

export const PUBLISHER_THEME_SOURCE_AUTHORITY_PATHS = Object.freeze([
  "generated/manuscripts/catalog.json",
  "next.config.ts",
  "publication.json",
  "public/offline-sw.js",
  "publishing/audio/manifest.json",
  "src/app",
  "src/components/AudioPlayerIsland.tsx",
  "src/components/ChapterReader.tsx",
  "src/components/ReaderAudioWordInteractionIsland.tsx",
  "src/components/ReaderEngagementIsland.tsx",
  "src/components/SiteShell.tsx",
  "src/components/ToolbarProgressIsland.tsx",
  "src/lib/audio-offline-cache.ts",
  "src/lib/audio-events.ts",
  "src/lib/audio-text.ts",
  "src/lib/audio-word-anchors.ts",
  "src/lib/reader-preferences.ts",
  "src/lib/reader-selection.ts",
  "src/publisher/application-config.ts",
  "src/publisher/application.ts",
  "src/publisher/coherence-theme.ts",
  "src/publisher/coherence-theme-contract.ts",
  "src/publisher/embedded-offline-authority.ts",
  "src/publisher/embedded-offline-candidate.json",
  "src/publisher/embedded-offline-host-identity.ts",
  "src/publisher/embedded-reader-appearance.ts",
  "src/publisher/legacy-audio-word-bridge.ts",
  "src/publisher/legacy-audio-word-bridge-client.tsx",
  "src/publisher/legacy-audio-word-bridge-contract.ts",
  "src/publisher/legacy-fragment-continuity.ts",
  "src/publisher/legacy-reader-bookmark-bridge.ts",
  "src/publisher/legacy-reader-bookmark-bridge-client.tsx",
  "src/publisher/legacy-reader-progress-bridge.ts",
  "src/publisher/preview-mode.ts",
  "src/publisher/reader-state-bootstrap.ts",
  "src/publisher/reader-state-migration-extension.ts",
  "src/publisher/reader-state-migration-extension-client.tsx",
  "src/publisher/reader-state-migration-extension-contract.ts",
  "src/publisher/reader-state-migration.ts",
  "src/publisher/reader-state-migration-schema.ts",
  "src/publisher/transition-page.tsx",
  "src/publisher/transition-preview-application.ts",
  "src/components/CoherenceSiteFrame.tsx",
  "src/components/LegacyFragmentRedirectIsland.tsx",
] as const);

export const PUBLISHER_THEME_CURRENT_TRANSITION_SOURCE_PATHS = Object.freeze([
  "public/offline-sw.js",
  "src/components/ChapterReader.tsx",
  "src/components/ReaderEngagementIsland.tsx",
  "src/components/SiteShell.tsx",
  "src/components/ToolbarProgressIsland.tsx",
  "src/lib/audio-offline-cache.ts",
  "src/publisher/embedded-offline-authority.ts",
  "src/publisher/embedded-offline-candidate.json",
  "src/publisher/embedded-offline-host-identity.ts",
  "src/publisher/legacy-reader-bookmark-bridge-client.tsx",
  "src/publisher/legacy-reader-bookmark-bridge.ts",
  "src/publisher/legacy-reader-progress-bridge.ts",
] as const);

export const PUBLISHER_THEME_READER_FONT_IDS = Object.freeze([
  "literata",
  "source-serif",
  "newsreader",
  "cormorant",
  "fraunces",
  "serif",
] as const);

const PUBLISHER_THEME_COMPILED_FONT_IDS = Object.freeze(
  PUBLISHER_THEME_READER_FONT_IDS.filter((id) => id !== "serif"),
);

const PUBLISHER_THEME_COMPILED_FONT_WEIGHTS = Object.freeze({
  literata: "200 900",
  "source-serif": "200 900",
  newsreader: "200 800",
  cormorant: "300 700",
  fraunces: "100 900",
} as const);

const WOFF2_KNOWN_TABLE_TAGS = Object.freeze([
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post",
  "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea",
  "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop",
  "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
]);

export type PublisherThemeHostProofBoundary = Readonly<{
  publicationRoot: string;
  generatedRoot: string;
  proofRoot: string;
  protectedRoots: readonly string[];
}>;

export type PublisherThemeHostProofPaths = PublisherThemeHostProofBoundary &
  Readonly<{
    nextCliPath: string;
    themeSourcePath: string;
  }>;

export const defaultPublisherThemeHostProofPaths: PublisherThemeHostProofPaths =
  Object.freeze({
    publicationRoot: repoRoot,
    generatedRoot: generatedPublisherRoot,
    proofRoot: generatedPublisherThemeHostProofRoot,
    protectedRoots: Object.freeze([
      editorialRoot,
      publisherConfigurationRoot,
      publishingRoot,
      path.join(repoRoot, "src"),
      path.join(repoRoot, "public"),
      path.join(repoRoot, ".github"),
    ]),
    nextCliPath: path.join(repoRoot, "node_modules/next/dist/bin/next"),
    themeSourcePath: path.join(repoRoot, "src/publisher/coherence-theme.ts"),
  });

export type PublisherThemeHostTemplateEvidence = Readonly<{
  template: PublisherNextHostTemplate;
  inputHash: string;
  filesHash: string;
}>;

export type PublisherThemeHostBuildResult = Readonly<{
  outputBytes: number;
}>;

export type PublisherThemeHostBuildRunner = (input: Readonly<{
  hostRoot: string;
  nextCliPath: string;
  runtimeRoot: string;
  signal: AbortSignal;
}>) => Promise<PublisherThemeHostBuildResult>;

export type PublisherThemeHostFetchResult = Readonly<{
  probe: unknown;
  homeHtml: string;
  audioArtifactStatus: number;
  routePages: readonly Readonly<{
    path: string;
    html: string;
  }>[];
  homeStylesheets: readonly Readonly<{
    path: string;
    text: string;
  }>[];
  homeFonts: readonly Readonly<{
    path: string;
    bytes: Uint8Array;
  }>[];
}>;

export type PublisherThemeResponseBudget = {
  maximumBytes: number;
  usedBytes: number;
};

export type PublisherThemeHostFetchRunner = (input: Readonly<{
  homePath: string;
  hostRoot: string;
  liveHostObserver?: PublisherThemeHostLiveObserver;
  liveHostObserverProjection?: PublisherThemeHostReaderProjection;
  nextCliPath: string;
  routePaths: readonly string[];
  runtimeRoot: string;
  signal: AbortSignal;
}>) => Promise<PublisherThemeHostFetchResult>;

type PublisherThemeHostLinkProjection = Readonly<{
  id: string;
  sectionId: string;
  blockId: string;
  href: string;
  label: string;
  sourceStart: number;
  workId: string;
}>;

type PublisherThemeHostFragmentOwner = Readonly<{
  workId: string;
  sectionId: string;
  path: string;
  anchor: string;
  href: string;
  childIds: readonly string[];
  catalogSectionIds: readonly string[];
}>;

type PublisherThemeHostSectionIndex = Readonly<{
  id: string;
  title: string;
  path: string;
  workId: string;
  sections: readonly Readonly<{
    id: string;
    title: string;
    href: string;
  }>[];
}>;

export type PublisherThemeCurrentTransitionBoundary = Readonly<{
  proofScope: "current Coherence Publisher transition preview facade";
  exposedApplicationKeys: readonly ["renderEmbeddedPage", "resolveRoute"];
  facadeFrozen: true;
  readerProvidersExposed: false;
  rootLayoutExposed: false;
  providerComposition: "excluded-by-transition-facade";
  isolatedHostEvidenceUsed: false;
}>;

export type PublisherThemeCurrentSourceAuthority = Readonly<{
  proofScope: "current browser-free Coherence Publisher transition source authority";
  publisherCommit: typeof EXPECTED_PUBLISHER_CANDIDATE_COMMIT;
  candidateBuildId: typeof EXPECTED_PUBLISHER_CANDIDATE_BUILD_ID;
  candidateArchiveCount: typeof EXPECTED_PUBLISHER_CANDIDATE_ARCHIVE_COUNT;
  hostSourcesBuildId: typeof EXPECTED_EMBEDDED_HOST_SOURCES_BUILD_ID;
  hostSourceCount: typeof EXPECTED_EMBEDDED_HOST_SOURCE_COUNT;
  hostSourceBytes: typeof EXPECTED_EMBEDDED_HOST_SOURCE_BYTES;
  browserDerivedReceipts: "historical-not-refreshed";
}>;

export type PublisherThemeUpdatesDormancyEvidence = Readonly<{
  catalogTextHash: string;
  updatesDataTextHash: string;
  adaptationReady: true;
  runtimeDormant: true;
  routesActivated: false;
  activationEligible: false;
  readerUpdatesTargetCount: 0;
  adapterRouteDeclarationCount: 2;
  dormantRoutePlanValid: true;
  activationAttemptRejected: true;
  activationDiagnostic: Readonly<{
    code: "next.updates.view_undeclared";
    path: "/updatesData/views/0/id";
    keyword: "route";
    viewId: "all";
  }>;
  injectedIntoIsolatedHost: false;
}>;

export type PublisherThemeHostReaderProjection = Readonly<{
  reader: PublicationReaderEnvelope;
  artifacts: readonly PublisherReaderArtifact[];
  extensionData: PublisherExtensionDataEnvelope;
  isolatedExtensionManifest: NonNullable<
    CoherencePublisherContentProof["application"]["manifest"]["extensions"]
  >;
  stateMigrationArtifact: MaterializedCoherenceReaderStateMigrationArtifact;
  stateMigrationProjection: CoherenceReaderStateMigrationProjection;
  contentBuildId: string;
  adaptedApplicationBuildId: string;
  contentEvidenceHash: string;
  activeRouteCount: 586;
  explicitRedirectCount: 584;
  canonicalSlashRedirectCount: 585;
  activePathsHash: string;
  activeRoutesHash: string;
  routePlanStaticParamsHash: string;
  applicationStaticParamsHash: string;
  redirectTuplesHash: string;
  absentReaderBasePathCount: 0;
  missingReaderFragmentHrefCount: 0;
  currentCatalogFragmentCoverage:
    CoherencePublisherContentEvidence["routes"]["currentCatalogFragmentCoverage"];
  sourceWorkId: string;
  sourceWorkPath: string;
  semanticLinks: readonly PublisherThemeHostLinkProjection[];
  semanticLinkBlockGroupCount: number;
  routePlanStaticParamCount: 586;
  applicationStaticParamCount: 585;
  sectionIndexes: readonly PublisherThemeHostSectionIndex[];
  sectionIndexCount: 3;
  sectionIndexReferenceCount: 57;
  sectionIndexesHash: string;
  sectionIndexPaths: readonly string[];
  sectionIndexPathsHash: string;
  fragmentOwners: readonly PublisherThemeHostFragmentOwner[];
  fragmentOwnerChildIds: readonly string[];
  catalogChapterRootOwnerGroupsHash: string;
  catalogChapterRootOwnerIdsHash: string;
  catalogChapterRootChildIdsHash: string;
  catalogChapterRootOwnerPathsHash: string;
  liveContentPaths: readonly string[];
  liveContentPathsHash: string;
  updatesDormancy: PublisherThemeUpdatesDormancyEvidence;
  baseRoutePresence: true;
  aggregateChapterPageParity: true;
  nestedFragmentParity: false;
  durableFragmentParity: false;
  fullReaderRouteParity: false;
}>;

export type PublisherThemeHostLiveObserver = (input: Readonly<{
  baseUrl: string;
  projection: PublisherThemeHostReaderProjection;
  probe: unknown;
  signal: AbortSignal;
}>) => Promise<void>;

export type PublisherThemeFontEvidence = Readonly<{
  cssHash: string;
  evidenceHash: string;
  familyCount: number;
  assetCount: number;
  familyCensus: readonly Readonly<{
    id: string;
    faceCount: number;
    assetCount: number;
  }>[];
}>;

export type PublisherThemeHostVerification = Readonly<{
  applicationBuildId: string;
  applicationArtifactHash: string;
  configHash: string;
  tokensHash: string;
  payloadHash: string;
  liveContentProjectionHash: string;
  offlineAudioEnvelopeResourceCount: 0;
  verifiedHostPaths: readonly string[];
  verifiedHostPageEvidence: readonly Readonly<{
    path: string;
    bytes: number;
  }>[];
  fontEvidence: PublisherThemeFontEvidence;
}>;

export type PublisherThemeHostProofSummary = Readonly<{
  proofScope: "isolated Next linkful theme compiler host";
  contentParity: "not asserted";
  adaptedReaderHostVerified: true;
  currentPublicRoutes: "untouched";
  publicationId: string;
  contentBuildId: string;
  contentEvidenceHash: string;
  absentReaderBasePathCount: 0;
  missingReaderFragmentHrefCount: 0;
  currentCatalogFragmentCoverage:
    CoherencePublisherContentEvidence["routes"]["currentCatalogFragmentCoverage"];
  activeRouteCount: 586;
  explicitRedirectCount: 584;
  canonicalSlashRedirectCount: 585;
  activePathsHash: string;
  activeRoutesHash: string;
  routePlanStaticParamsHash: string;
  applicationStaticParamsHash: string;
  redirectTuplesHash: string;
  baseRoutePresence: true;
  aggregateChapterPageParity: true;
  nestedFragmentParity: false;
  durableFragmentParity: false;
  fullReaderRouteParity: false;
  readerBuildId: string;
  adaptedApplicationBuildId: string;
  applicationBuildId: string;
  applicationArtifactHash: string;
  hostContractVersion: string;
  renderer: string;
  rendererVersion: string;
  publisherContentVersion: string;
  publisherReaderVersion: string;
  publisherSchemaVersion: string;
  themePackage: string;
  themeVersion: string;
  themeConfigHash: string;
  themeTokensHash: string;
  themeSourceHash: string;
  templateInputHash: string;
  templateFilesHash: string;
  proofTemplateFilesHash: string;
  proofConfigHash: string;
  hostSourcesHash: string;
  scaffoldingHash: string;
  readerArtifactsHash: string;
  readerArtifactEvidence: readonly Readonly<{
    path: string;
    bytes: number;
    hash: string;
  }>[];
  readerArtifactCount: 4;
  readerArtifactPaths: readonly string[];
  extensionDataArtifact: Readonly<{
    path: string;
    bytes: number;
    hash: string;
  }>;
  stateMigrationArtifact: Readonly<{
    path: string;
    bytes: number;
    hash: string;
    buildId: string;
  }>;
  semanticLinkCount: 21;
  semanticLinkBlockGroupCount: 17;
  routePlanStaticParamCount: 586;
  applicationStaticParamCount: 585;
  sectionIndexCount: 3;
  sectionIndexReferenceCount: 57;
  sectionIndexesHash: string;
  sectionIndexPaths: readonly string[];
  sectionIndexPathsHash: string;
  catalogChapterRootOwnerCount: 46;
  catalogChapterRootChildCount: 107;
  catalogChapterRootOwnerGroupsHash: string;
  catalogChapterRootOwnerIdsHash: string;
  catalogChapterRootChildIdsHash: string;
  catalogChapterRootOwnerPathsHash: string;
  liveContentPathCount: 47;
  liveContentPathsHash: string;
  fragmentOwnerSectionIds: readonly string[];
  fragmentOwnerChildSectionIds: readonly string[];
  fragmentOwnerAddresses: readonly PublisherThemeHostFragmentOwner[];
  verifiedHostPaths: readonly string[];
  verifiedHostPageEvidence: readonly Readonly<{
    path: string;
    bytes: number;
  }>[];
  currentTransition: PublisherThemeCurrentTransitionBoundary;
  isolatedMigrationExtension: "mounted";
  migrationExecution: "not-exercised" | "delegated-to-live-observer";
  updatesDormancy: PublisherThemeUpdatesDormancyEvidence;
  isolatedUpdates: "absent";
  isolatedSync: "absent";
  audioDeclaration: "absent";
  audioArtifact: "absent";
  offlineAudioEnvelopeResourceCount: 0;
  liveContentProjectionHash: string;
  applicationPayloadHash: string;
  compiledCssHash: string;
  fontEvidenceHash: string;
  defaultReaderFontFamilyId: "literata";
  readerFontFamilyCount: number;
  compiledNextFontCount: number;
  compiledFontAssetCount: number;
  nodeVersion: string;
  npmVersion: string;
  nextVersion: string;
  reactVersion: string;
  reactDomVersion: string;
  typescriptVersion: string;
  sourceAuthorityHash: string;
  gitSourceStateHash: string;
  runtimeArtifactEvidence: readonly PublisherThemeRuntimeArtifactEvidence[];
  runtimeArtifactStateHash: string;
  runtimeArtifactsUnchanged: true;
  generatedHostCleanup: "completed";
}>;

type JsonRecord = Record<string, unknown>;

type ExternalStateSnapshot = Readonly<{
  authorityHash: string;
  gitSourceState: Buffer;
  gitSourceStateHash: string;
  ignoredState: Buffer;
  runtimeArtifacts: RuntimeArtifactSnapshot;
  themeSourceHash: string;
}>;

type RuntimeArtifactOwnership =
  | Readonly<{
      path: string;
      state: "absent";
      parentChain: readonly RuntimeArtifactParentIdentity[];
    }>
  | Readonly<{
      path: string;
      state: "present";
      parentChain: readonly RuntimeArtifactParentIdentity[];
      fileDevice: string;
      fileInode: string;
      fileModifiedNanoseconds: string;
      fileChangedNanoseconds: string;
      parentPath: string;
      parentDevice: string;
      parentInode: string;
    }>;

type RuntimeArtifactParentIdentity =
  | Readonly<{
      path: string;
      state: "absent";
    }>
  | Readonly<{
      path: string;
      state: "present";
      device: string;
      inode: string;
      modifiedNanoseconds: string;
      changedNanoseconds: string;
    }>;

type RuntimeArtifactSnapshot = Readonly<{
  evidence: readonly PublisherThemeRuntimeArtifactEvidence[];
  evidenceHash: string;
  ownership: readonly RuntimeArtifactOwnership[];
}>;

type ProcessTail = Readonly<{
  bytes: number;
  text: string;
}>;

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function isStrictlyInside(candidate: string, root: string): boolean {
  return path.resolve(candidate) !== path.resolve(root) && isInside(candidate, root);
}

function sha256Bytes(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashJson(value: JSONValue): string {
  return hashCanonicalJson(value);
}

function requireDirectoryPathWithoutSymbols(
  root: string,
  candidate: string,
  label: string,
): void {
  const absoluteRoot = path.resolve(root);
  const absoluteCandidate = path.resolve(candidate);
  if (!isInside(absoluteCandidate, absoluteRoot)) {
    throw new TypeError(`${label} must stay inside its declared root.`);
  }
  if (!fs.existsSync(absoluteRoot)) {
    throw new TypeError(`${label} root does not exist.`);
  }
  const rootStat = fs.lstatSync(absoluteRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new TypeError(`${label} root must be one real directory.`);
  }
  const relative = path.relative(absoluteRoot, absoluteCandidate);
  let current = absoluteRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new TypeError(`${label} must not cross a symbolic link.`);
    }
    if (!stat.isDirectory()) {
      throw new TypeError(`${label} ancestors must be directories.`);
    }
  }
}

function readStableRegularFile(
  filePath: string,
  label: string,
  containingRoot?: string,
  maximumBytes = Number.MAX_SAFE_INTEGER,
): Buffer {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new TypeError(`${label} received an invalid file limit.`);
  }
  const absolute = path.resolve(filePath);
  if (containingRoot !== undefined) {
    const root = path.resolve(containingRoot);
    if (!isStrictlyInside(absolute, root)) {
      throw new TypeError(`${label} must be a strict child of its authority root.`);
    }
    requireDirectoryPathWithoutSymbols(root, path.dirname(absolute), label);
  }
  const initial = fs.lstatSync(absolute);
  if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1) {
    throw new TypeError(`${label} must be one regular, nonlinked file.`);
  }
  if (initial.size > maximumBytes) {
    throw new TypeError(`${label} exceeded its file limit.`);
  }
  const descriptor = fs.openSync(
    absolute,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1) {
      throw new TypeError(`${label} changed before it could be read.`);
    }
    if (before.size > maximumBytes) {
      throw new TypeError(`${label} exceeded its file limit.`);
    }
    if (!Number.isSafeInteger(before.size) || before.size < 0) {
      throw new TypeError(`${label} has an unsupported file size.`);
    }
    const value = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < value.byteLength) {
      const bytesRead = fs.readSync(
        descriptor,
        value,
        offset,
        value.byteLength - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const trailingByte = Buffer.alloc(1);
    const trailingBytesRead = fs.readSync(
      descriptor,
      trailingByte,
      0,
      1,
      value.byteLength,
    );
    const after = fs.fstatSync(descriptor);
    if (
      offset !== value.byteLength ||
      trailingBytesRead !== 0 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      value.byteLength !== before.size
    ) {
      throw new TypeError(`${label} changed while it was being read.`);
    }
    return value;
  } finally {
    fs.closeSync(descriptor);
  }
}

function readJsonRecord(filePath: string, label: string): JsonRecord {
  const value: unknown = JSON.parse(
    readStableRegularFile(filePath, label, repoRoot).toString("utf8"),
  );
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must contain one JSON object.`);
  }
  return value as JsonRecord;
}

function requiredString(record: JsonRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must declare ${key}.`);
  }
  return value;
}

function requiredSha256(record: JsonRecord, key: string, label: string): string {
  const value = requiredString(record, key, label);
  if (!/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError(`${label} must declare ${key} as one SHA-256 digest.`);
  }
  return value;
}

function requiredObject(record: JsonRecord, key: string, label: string): JsonRecord {
  const value = record[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must declare ${key} as an object.`);
  }
  return value as JsonRecord;
}

function installedPackageManifest(packageName: string): JsonRecord {
  return readJsonRecord(
    path.join(repoRoot, "node_modules", ...packageName.split("/"), "package.json"),
    `${packageName} package manifest`,
  );
}

function installedPackageVersion(packageName: string): string {
  return requiredString(
    installedPackageManifest(packageName),
    "version",
    `${packageName} package manifest`,
  );
}

export function assertPublisherThemeCurrentSourceAuthority():
  PublisherThemeCurrentSourceAuthority {
  const candidateAudit = auditPublisherCandidate();
  const embeddedAudit =
    auditCoherencePublisherEmbeddedOfflineAuthority();
  const sourceAuthorityPaths = new Set(PUBLISHER_THEME_SOURCE_AUTHORITY_PATHS);
  if (
    candidateAudit.issues.length !== 0 ||
    candidateAudit.candidateCommit !== EXPECTED_PUBLISHER_CANDIDATE_COMMIT ||
    candidateAudit.candidateIdentity?.publisherCommit !==
      EXPECTED_PUBLISHER_CANDIDATE_COMMIT ||
    candidateAudit.candidateBuildId !== EXPECTED_PUBLISHER_CANDIDATE_BUILD_ID ||
    candidateAudit.archiveCount !== EXPECTED_PUBLISHER_CANDIDATE_ARCHIVE_COUNT ||
    embeddedAudit.issues.length !== 0 ||
    embeddedAudit.candidateBuildId !== EXPECTED_PUBLISHER_CANDIDATE_BUILD_ID ||
    embeddedAudit.hostSourcesBuildId !==
      EXPECTED_EMBEDDED_HOST_SOURCES_BUILD_ID ||
    embeddedAudit.sourceCount !== EXPECTED_EMBEDDED_HOST_SOURCE_COUNT ||
    embeddedAudit.sourceBytes !== EXPECTED_EMBEDDED_HOST_SOURCE_BYTES ||
    PUBLISHER_THEME_CURRENT_TRANSITION_SOURCE_PATHS.some(
      (sourcePath) => !sourceAuthorityPaths.has(sourcePath),
    )
  ) {
    throw new TypeError(
      "Publisher theme compiler proof requires the exact current Publisher candidate and embedded host source authority.",
    );
  }
  return Object.freeze({
    proofScope:
      "current browser-free Coherence Publisher transition source authority" as const,
    publisherCommit: EXPECTED_PUBLISHER_CANDIDATE_COMMIT,
    candidateBuildId: EXPECTED_PUBLISHER_CANDIDATE_BUILD_ID,
    candidateArchiveCount: EXPECTED_PUBLISHER_CANDIDATE_ARCHIVE_COUNT,
    hostSourcesBuildId: EXPECTED_EMBEDDED_HOST_SOURCES_BUILD_ID,
    hostSourceCount: EXPECTED_EMBEDDED_HOST_SOURCE_COUNT,
    hostSourceBytes: EXPECTED_EMBEDDED_HOST_SOURCE_BYTES,
    browserDerivedReceipts: "historical-not-refreshed" as const,
  });
}

function lockedPackageRecord(
  lock: JsonRecord,
  entryPath: string,
  label: string,
): JsonRecord {
  return requiredObject(
    requiredObject(lock, "packages", label),
    entryPath,
    label,
  );
}

function assertExactFontkitLockRecord(record: JsonRecord, label: string): void {
  if (
    record.version !== EXPECTED_FONTKIT_VERSION ||
    record.resolved !== EXPECTED_FONTKIT_RESOLVED ||
    record.integrity !== EXPECTED_FONTKIT_INTEGRITY
  ) {
    throw new TypeError(`${label} does not bind the reviewed fontkit package.`);
  }
}

function assertFontkitInstallAuthority(): void {
  if (installedPackageVersion("fontkit") !== EXPECTED_FONTKIT_VERSION) {
    throw new TypeError("Publisher theme font parser version is not reviewed.");
  }
  const rootLock = readJsonRecord(
    path.join(repoRoot, "package-lock.json"),
    "publication package lockfile",
  );
  const hiddenLock = readJsonRecord(
    path.join(repoRoot, "node_modules/.package-lock.json"),
    "installed package lockfile",
  );
  assertExactFontkitLockRecord(
    lockedPackageRecord(rootLock, "node_modules/fontkit", "publication package lockfile"),
    "The publication lockfile",
  );
  assertExactFontkitLockRecord(
    lockedPackageRecord(hiddenLock, "node_modules/fontkit", "installed package lockfile"),
    "The installed package lockfile",
  );
  const installState = readJsonRecord(
    path.join(repoRoot, "node_modules/.coherence-install-state.json"),
    "dependency bootstrap install receipt",
  );
  if (
    installState.nodeVersion !== EXPECTED_NODE_VERSION ||
    installState.npmVersion !== EXPECTED_NPM_VERSION ||
    installState.packageManager !== "npm" ||
    installState.platform !== process.platform ||
    installState.architecture !== process.arch
  ) {
    throw new TypeError(
      "Publisher theme font parser is not covered by the current dependency bootstrap receipt.",
    );
  }
}

type FontkitGlyph = Readonly<{ id: number }>;

type FontkitFont = Readonly<{
  type: string;
  numGlyphs: number;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  characterSet: readonly number[];
  glyphForCodePoint: (codePoint: number) => FontkitGlyph;
  layout: (text: string) => Readonly<{
    glyphs: readonly FontkitGlyph[];
    positions: readonly Readonly<{ xAdvance: number }>[];
  }>;
}>;

type FontkitModule = Readonly<{
  create: (bytes: Buffer) => FontkitFont;
}>;

let reviewedFontkit: FontkitModule | undefined;

function fontkitModule(): FontkitModule {
  assertFontkitInstallAuthority();
  if (reviewedFontkit === undefined) {
    const localRequire = createRequire(import.meta.url);
    const loaded: unknown = localRequire("fontkit");
    if (
      loaded === null ||
      typeof loaded !== "object" ||
      !("create" in loaded) ||
      typeof loaded.create !== "function"
    ) {
      throw new TypeError("Publisher theme font parser entry point is invalid.");
    }
    reviewedFontkit = loaded as FontkitModule;
  }
  return reviewedFontkit;
}

function resolveLocalNpmCliPath(): string {
  const executableDirectory = path.dirname(process.execPath);
  const candidates =
    process.platform === "win32"
      ? [
          path.join(executableDirectory, "node_modules/npm/bin/npm-cli.js"),
          path.resolve(executableDirectory, "../lib/node_modules/npm/bin/npm-cli.js"),
        ]
      : [
          path.resolve(executableDirectory, "../lib/node_modules/npm/bin/npm-cli.js"),
          path.join(executableDirectory, "node_modules/npm/bin/npm-cli.js"),
        ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (match === undefined) {
    throw new TypeError("Publisher theme compiler proof cannot find the local npm CLI.");
  }
  readStableRegularFile(match, "local npm CLI");
  return match;
}

export function createPublisherThemeChildEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  runtimeRoot?: string,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {
    PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
    CI: "1",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NO_COLOR: "1",
  };
  for (const key of ["LANG", "LC_ALL"]) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  if (result.LANG === undefined && result.LC_ALL === undefined) {
    result.LANG = "C.UTF-8";
  }
  if (runtimeRoot !== undefined) {
    const runtime = directoryIdentity(runtimeRoot, "Publisher theme child runtime");
    const home = path.join(runtime.path, "home");
    const temporary = path.join(runtime.path, "tmp");
    const cache = path.join(runtime.path, "cache");
    for (const [directory, label] of [
      [home, "Publisher theme child home"],
      [temporary, "Publisher theme child temporary directory"],
      [cache, "Publisher theme child cache"],
    ] as const) {
      const identity = directoryIdentity(directory, label);
      if (!isStrictlyInside(identity.realPath, runtime.realPath)) {
        throw new TypeError(`${label} escaped the private runtime root.`);
      }
    }
    result.HOME = home;
    result.TMPDIR = temporary;
    result.TMP = temporary;
    result.TEMP = temporary;
    result.XDG_CACHE_HOME = cache;
  }
  return result;
}

function actualNpmVersion(): string {
  const result = spawnSync(process.execPath, [resolveLocalNpmCliPath(), "--version"], {
    encoding: "utf8",
    env: createPublisherThemeChildEnvironment(),
    maxBuffer: 1024 * 1024,
  });
  const version = result.stdout.trim();
  if (result.status !== 0 || version.length === 0) {
    throw new TypeError("Publisher theme compiler proof could not read npm version.");
  }
  return version;
}

function assertExactRuntime(rootManifest: JsonRecord): string {
  if (process.versions.node !== EXPECTED_NODE_VERSION) {
    throw new TypeError(
      `Publisher theme compiler proof requires Node.js ${EXPECTED_NODE_VERSION}, received ${process.versions.node}.`,
    );
  }
  const packageManager = requiredString(
    rootManifest,
    "packageManager",
    "publication package manifest",
  );
  if (packageManager !== `npm@${EXPECTED_NPM_VERSION}`) {
    throw new TypeError(
      `Publisher theme compiler proof requires packageManager npm@${EXPECTED_NPM_VERSION}.`,
    );
  }
  const npmVersion = actualNpmVersion();
  if (npmVersion !== EXPECTED_NPM_VERSION) {
    throw new TypeError(
      `Publisher theme compiler proof requires npm ${EXPECTED_NPM_VERSION}, received ${npmVersion}.`,
    );
  }
  return npmVersion;
}

function assertRequiredOverrides(rootManifest: JsonRecord): void {
  const actualOverrides = requiredObject(
    rootManifest,
    "overrides",
    "publication package manifest",
  );
  for (const [selector, expected] of Object.entries(
    PUBLISHER_NEXT_REQUIRED_HOST_OVERRIDES,
  )) {
    if (!isDeepStrictEqual(actualOverrides[selector], expected)) {
      throw new TypeError(
        `Publication package overrides do not match the Publisher requirement for ${selector}.`,
      );
    }
  }
}

export function assertPublisherThemeHostProofBoundary(
  boundary: PublisherThemeHostProofBoundary,
): void {
  const publicationRoot = path.resolve(boundary.publicationRoot);
  const generatedRoot = path.resolve(boundary.generatedRoot);
  const proofRoot = path.resolve(boundary.proofRoot);
  if (!isStrictlyInside(generatedRoot, publicationRoot)) {
    throw new TypeError(
      "Publisher theme proof generated output must be a strict child of the publication root.",
    );
  }
  if (!isStrictlyInside(proofRoot, generatedRoot)) {
    throw new TypeError(
      "Publisher theme proof runs must stay inside their dedicated generated root.",
    );
  }
  for (const protectedRoot of boundary.protectedRoots) {
    if (isInside(proofRoot, protectedRoot) || isInside(protectedRoot, proofRoot)) {
      throw new TypeError(
        "Publisher theme proof output must be disjoint from every protected root.",
      );
    }
  }
  requireDirectoryPathWithoutSymbols(
    publicationRoot,
    proofRoot,
    "Publisher theme proof output",
  );
}

function templateFileProjection(
  files: readonly PublisherNextHostFile[],
): readonly Readonly<{ path: string; hash: string }>[] {
  return Object.freeze(
    [...files]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((file) => Object.freeze({ path: file.path, hash: sha256Bytes(file.contents) })),
  );
}

const EXPECTED_PUBLISHER_HOST_PACKAGE_VERSIONS = Object.freeze({
  "@genii-foundation/publisher-content": EXPECTED_RENDERER_VERSION,
  "@genii-foundation/publisher-next": EXPECTED_RENDERER_VERSION,
  "@genii-foundation/publisher-reader": EXPECTED_RENDERER_VERSION,
  "@genii-foundation/publisher-schema": EXPECTED_RENDERER_VERSION,
});

export function assertPublisherThemeHostPackageVersions(
  dependencies: Readonly<Record<string, string>>,
): void {
  for (const [packageName, expectedVersion] of Object.entries(
    EXPECTED_PUBLISHER_HOST_PACKAGE_VERSIONS,
  )) {
    if (dependencies[packageName] !== expectedVersion) {
      throw new TypeError(
        `Publisher theme compiler proof received an unreviewed ${packageName} version.`,
      );
    }
  }
}

export function createPublisherThemeHostTemplateEvidence(): PublisherThemeHostTemplateEvidence {
  const rootManifest = readJsonRecord(
    path.join(repoRoot, "package.json"),
    "publication package manifest",
  );
  assertExactRuntime(rootManifest);
  assertRequiredOverrides(rootManifest);
  const rendererManifest = installedPackageManifest(
    "@genii-foundation/publisher-next",
  );
  const rendererVersion = requiredString(
    rendererManifest,
    "version",
    "Publisher Next package manifest",
  );
  if (rendererVersion !== EXPECTED_RENDERER_VERSION) {
    throw new TypeError("Publisher theme compiler proof received an unreviewed renderer version.");
  }
  const peerDependencies = requiredObject(
    rendererManifest,
    "peerDependencies",
    "Publisher Next package manifest",
  );
  const dependencies = Object.freeze({
    "@genii-foundation/publisher-content": installedPackageVersion(
      "@genii-foundation/publisher-content",
    ),
    "@genii-foundation/publisher-next": rendererVersion,
    "@genii-foundation/publisher-reader": installedPackageVersion(
      "@genii-foundation/publisher-reader",
    ),
    "@genii-foundation/publisher-schema": installedPackageVersion(
      "@genii-foundation/publisher-schema",
    ),
    next: installedPackageVersion("next"),
    react: installedPackageVersion("react"),
    "react-dom": installedPackageVersion("react-dom"),
  });
  assertPublisherThemeHostPackageVersions(dependencies);
  for (const peer of ["next", "react", "react-dom"] as const) {
    if (dependencies[peer] !== peerDependencies[peer]) {
      throw new TypeError(`Installed ${peer} does not match the exact Publisher Next peer.`);
    }
  }
  const devDependencies = Object.freeze({
    "@types/node": installedPackageVersion("@types/node"),
    "@types/react": installedPackageVersion("@types/react"),
    "@types/react-dom": installedPackageVersion("@types/react-dom"),
    typescript: installedPackageVersion("typescript"),
  });
  const input = Object.freeze({
    hostPackageName: PROOF_HOST_PACKAGE_NAME,
    dependencies,
    devDependencies,
    overrides: PUBLISHER_NEXT_REQUIRED_HOST_OVERRIDES,
  });
  const template = createPublisherNextHostTemplate(input);
  if (
    template.contractVersion !== PUBLISHER_NEXT_HOST_CONTRACT_VERSION ||
    template.contractVersion !== "0.18.0" ||
    template.renderer !== PUBLISHER_NEXT_HOST_RENDERER ||
    template.rendererVersion !== rendererVersion ||
    template.files.length !== EXPECTED_OFFICIAL_FILE_COUNT
  ) {
    throw new TypeError(
      "Publisher theme compiler proof received a mismatched host contract identity.",
    );
  }
  const packageFile = template.files.find(({ path: filePath }) => filePath === "package.json");
  if (packageFile === undefined) {
    throw new TypeError("Publisher host template omitted package.json.");
  }
  const packageValue: unknown = JSON.parse(packageFile.contents);
  const expectedPackage = {
    name: PROOF_HOST_PACKAGE_NAME,
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: { build: "next build", start: "next start" },
    dependencies,
    overrides: PUBLISHER_NEXT_REQUIRED_HOST_OVERRIDES,
    devDependencies,
  };
  if (!isDeepStrictEqual(packageValue, expectedPackage)) {
    throw new TypeError("Publisher host template package graph drifted.");
  }
  return Object.freeze({
    template,
    inputHash: sha256Bytes(canonicalizeJson(input as unknown as JSONValue)),
    filesHash: hashJson(templateFileProjection(template.files) as unknown as JSONValue),
  });
}

function proofRouteSource(): string {
  return [
    'import theme from "genii-publisher:theme";',
    'import { application } from "../../publisher-application.js";',
    'import { publisherErrorIdentity } from "../../publisher-error-identity";',
    "",
    "const configured = theme.implementation.configure(theme.config);",
    "if (!configured.valid) {",
    '  throw new TypeError("The selected Coherence theme did not configure.");',
    "}",
    "const configuredTheme = configured.value;",
    "if (",
    "  application.manifest.theme.package !== theme.package ||",
    "  application.manifest.theme.version !== theme.version",
    ") {",
    '  throw new TypeError("The application manifest did not select the theme alias.");',
    "}",
    "const applicationTokens = JSON.stringify(application.theme.tokens);",
    "if (",
    "  applicationTokens !== JSON.stringify(configuredTheme.tokens) ||",
    "  applicationTokens !== JSON.stringify(publisherErrorIdentity.theme.tokens)",
    ") {",
    '  throw new TypeError("The application and error surfaces resolved different theme tokens.");',
    "}",
    "const homePath = application.reader.routes.active.find(",
    '  ({ target }) => target.kind === "home",',
    ")?.path;",
    "if (homePath === undefined) {",
    '  throw new TypeError("The compiled Reader has no home route.");',
    "}",
    "const offlinePackages = application.offlineCatalog.packages;",
    "const offlineAudioClipCount = offlinePackages.reduce(",
    "  (total, item) => total + item.audioClipCount,",
    "  0,",
    ");",
    "const offlineAudioResourceCount = offlinePackages.reduce(",
    "  (total, item) => total + item.resources.filter(({ kind }) => kind === \"audio\").length,",
    "  0,",
    ");",
    "const offlineAudioEnvelopeResourceCount = offlinePackages.reduce(",
    `  (total, item) => total + item.resources.filter(({ href, kind }) => kind === "data" && href === "/${PUBLISHER_NEXT_AUDIO_DATA_PATH}").length,`,
    "  0,",
    ");",
    "const offlineTimingResourceCount = offlinePackages.reduce(",
    "  (total, item) => total + item.resources.filter(({ kind }) => kind === \"timing\").length,",
    "  0,",
    ");",
    "const offlineNarrationCatalogCount = offlinePackages.filter(",
    "  ({ version }) => version.narrationCatalogHash !== null,",
    ").length;",
    "",
    "const proof = {",
    '    proofSchemaVersion: "2.0",',
    '    proofScope: "isolated Next linkful theme compiler host",',
    '    contentParity: "not asserted",',
    "    baseRoutePresence: true,",
    "    aggregateChapterPageParity: true,",
    "    nestedFragmentParity: false,",
    "    durableFragmentParity: false,",
    "    fullReaderRouteParity: false,",
    "    adaptedReaderHostVerified: true,",
    '    currentPublicRoutes: "untouched",',
    "    publicationId: application.reader.publicationId,",
    "    readerBuildId: application.reader.buildId,",
    "    readerActiveRouteCount: application.reader.routes.active.length,",
    "    readerExplicitRedirectCount: application.reader.routes.redirects.length,",
    "    semanticLinkIds: application.reader.links.map(({ id }) => id).sort(),",
    "    applicationStaticParamCount: application.staticParams.length,",
    "    offlineAudioClipCount,",
    "    offlineAudioResourceCount,",
    "    offlineAudioEnvelopeResourceCount,",
    "    offlineTimingResourceCount,",
    "    offlineNarrationCatalogCount,",
    "    homePath,",
    "    selectedTheme: {",
    "      package: theme.package,",
    "      version: theme.version,",
    "      config: theme.config,",
    "    },",
    "    applicationManifest: application.manifest,",
    "    applicationArtifact: {",
    "      hash: application.artifact.hash,",
    "      text: application.artifact.text,",
    "    },",
    "    applicationTokens: application.theme.tokens,",
    "    configuredTokens: configuredTheme.tokens,",
    "    errorIdentityTokens: publisherErrorIdentity.theme.tokens,",
    "};",
    "const proofText = JSON.stringify(proof)",
    '  .replaceAll("<", "\\\\u003c")',
    '  .replaceAll("\\u2028", "\\\\u2028")',
    '  .replaceAll("\\u2029", "\\\\u2029");',
    "",
    'export const dynamic = "force-static";',
    "",
    "export default function PublisherThemeProofPage() {",
    "  return (",
    "    <main",
    '      data-publisher-theme-content-parity="not-asserted"',
    '      data-publisher-theme-adapted-reader="verified"',
    '      data-publisher-theme-current-routes="untouched"',
    '      data-publisher-theme-proof="coherence-thesis"',
    "    >",
    "      <h1>Publisher theme compiler proof</h1>",
    "      <script",
    '        id="publisher-theme-proof-data"',
    "        type=\"application/json\"",
    "        dangerouslySetInnerHTML={{ __html: proofText }}",
    "      />",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
}

export function createPublisherThemeHostScaffolding(input: Readonly<{
  themeSourceText: string;
  themeContractSourceText: string;
  stateMigrationProjection: CoherenceReaderStateMigrationProjection;
  stateMigrationSourceFiles: readonly PublisherNextHostFile[];
}>): readonly PublisherNextHostFile[] {
  assertCoherenceReaderStateMigrationProjection(input.stateMigrationProjection);
  if (
    Buffer.byteLength(input.themeContractSourceText, "utf8") !==
      EXPECTED_LOCAL_THEME_CONTRACT_SOURCE_BYTES ||
    sha256Bytes(input.themeContractSourceText) !==
      EXPECTED_LOCAL_THEME_CONTRACT_SOURCE_HASH
  ) {
    throw new TypeError(
      "Publisher theme host received drifted local theme contract source.",
    );
  }
  if (
    !isDeepStrictEqual(
      input.stateMigrationSourceFiles.map(({ path: filePath }) => filePath),
      STATE_MIGRATION_EXTENSION_SOURCE_PATHS,
    )
  ) {
    throw new TypeError(
      "Publisher theme host received a drifted state migration extension source set.",
    );
  }
  return Object.freeze([
    Object.freeze({ path: LOCAL_THEME_SOURCE_PATH, contents: input.themeSourceText }),
    Object.freeze({
      path: LOCAL_THEME_CONTRACT_SOURCE_PATH,
      contents: input.themeContractSourceText,
    }),
    Object.freeze({
      path: "publisher.theme.mjs",
      contents:
        'export { coherencePublisherTheme as default } from "./coherence-theme.ts";\n',
    }),
    ...input.stateMigrationSourceFiles,
    Object.freeze({
      path: "publisher.extensions.mjs",
      contents: [
        'import { createCoherenceReaderStateMigrationExtensionRegistration } from "./reader-state-migration-extension.ts";',
        "",
        `const projection = ${canonicalizeJson(input.stateMigrationProjection as unknown as JSONValue)};`,
        "",
        "export default Object.freeze([",
        "  createCoherenceReaderStateMigrationExtensionRegistration(projection),",
        "]);",
        "",
      ].join("\n"),
    }),
    Object.freeze({
      path: `app/${PROBE_ROUTE_NAME}/page.tsx`,
      contents: proofRouteSource(),
    }),
  ]);
}

function readPublisherThemeStateMigrationSourceFiles(): readonly PublisherNextHostFile[] {
  const sourceRoot = path.join(repoRoot, "src", "publisher");
  return Object.freeze(
    STATE_MIGRATION_EXTENSION_SOURCE_PATHS.map((filePath) =>
      Object.freeze({
        path: filePath,
        contents: readStableRegularFile(
          path.join(sourceRoot, filePath),
          `Coherence Reader state migration source '${filePath}'`,
          repoRoot,
        ).toString("utf8"),
      }),
    ),
  );
}

export function createPublisherThemeProofHostFiles(
  template: PublisherNextHostTemplate,
): readonly PublisherNextHostFile[] {
  const nextConfigNeedle = "  turbopack: {\n    resolveAlias:";
  const nextConfigReplacement = [
    "  turbopack: {",
    '    root: new URL("../../../../../", import.meta.url).pathname,',
    "    resolveAlias:",
  ].join("\n");
  const tsconfigNeedle = [
    '    "plugins": [',
    "      {",
    '        "name": "next"',
    "      }",
    "    ]",
  ].join("\n");
  const tsconfigReplacement = [
    '    "plugins": [',
    "      {",
    '        "name": "next"',
    "      }",
    "    ],",
    '    "paths": {',
    '      "@/*": [',
    '        "./src/*"',
    "      ]",
    "    }",
  ].join("\n");
  let nextConfigReplacements = 0;
  let tsconfigReplacements = 0;
  const files = template.files.map((file) => {
    if (file.path === "next.config.mjs") {
      if (file.contents.split(nextConfigNeedle).length !== 2) {
        throw new TypeError("Publisher proof could not bind the isolated Turbopack root.");
      }
      nextConfigReplacements += 1;
      return Object.freeze({
        path: file.path,
        contents: file.contents.replace(
          nextConfigNeedle,
          nextConfigReplacement,
        ),
      });
    }
    if (file.path !== "tsconfig.json") return file;
    if (file.contents.split(tsconfigNeedle).length !== 2) {
      throw new TypeError(
        "Publisher proof could not bind the isolated TypeScript source alias.",
      );
    }
    tsconfigReplacements += 1;
    return Object.freeze({
      path: file.path,
      contents: file.contents.replace(tsconfigNeedle, tsconfigReplacement),
    });
  });
  if (nextConfigReplacements !== 1 || tsconfigReplacements !== 1) {
    throw new TypeError(
      "Publisher proof requires one official Next and TypeScript configuration.",
    );
  }
  return Object.freeze(files);
}

function validateHostRelativePath(hostPath: string): readonly string[] {
  if (
    hostPath.length === 0 ||
    path.posix.isAbsolute(hostPath) ||
    hostPath.includes("\\") ||
    hostPath.includes("\0")
  ) {
    throw new TypeError("Publisher theme proof refused an unsafe host path.");
  }
  const segments = hostPath.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new TypeError("Publisher theme proof refused an unsafe host path.");
  }
  return segments;
}

function resolveHostSourcePath(hostRoot: string, hostPath: string): string {
  const segments = validateHostRelativePath(hostPath);
  const destination = path.join(path.resolve(hostRoot), ...segments);
  if (!isStrictlyInside(destination, hostRoot)) {
    throw new TypeError("Publisher theme proof host path escaped its root.");
  }
  requireDirectoryPathWithoutSymbols(
    hostRoot,
    path.dirname(destination),
    "Publisher theme proof host path",
  );
  return destination;
}

export function materializePublisherThemeHostSources(input: Readonly<{
  files: readonly PublisherNextHostFile[];
  hostRoot: string;
}>): void {
  const seen = new Set<string>();
  for (const file of input.files) {
    validateHostRelativePath(file.path);
    const folded = file.path.toLowerCase();
    if (seen.has(folded)) {
      throw new TypeError("Publisher theme proof host source path is duplicated.");
    }
    seen.add(folded);
  }
  for (const file of input.files) {
    const destination = resolveHostSourcePath(input.hostRoot, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    requireDirectoryPathWithoutSymbols(
      input.hostRoot,
      path.dirname(destination),
      "Publisher theme proof host path",
    );
    fs.writeFileSync(destination, file.contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644,
    });
  }
}

function walkFiles(
  root: string,
  options: Readonly<{ omitNextRoot?: boolean; skipSymbols?: boolean }> = {},
): readonly string[] {
  const files: string[] = [];
  const visit = (directory: string, relativeDirectory: string): void => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (options.omitNextRoot && relativePath === ".next") continue;
      const absolutePath = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        if (options.skipSymbols) continue;
        throw new TypeError(
          `Publisher theme proof output must not contain symbolic links: ${relativePath}.`,
        );
      }
      if (stat.isDirectory()) visit(absolutePath, relativePath);
      else if (stat.isFile() && stat.nlink === 1) files.push(relativePath);
      else {
        throw new TypeError("Publisher theme proof output contains an unsupported entry.");
      }
    }
  };
  visit(path.resolve(root), "");
  return Object.freeze(files);
}

function fileProjection(root: string, files: readonly string[]): JSONValue {
  return files.map((relativePath) => {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const bytes = readStableRegularFile(absolutePath, "Publisher proof file", root);
    return {
      path: relativePath,
      bytes: bytes.byteLength,
      hash: sha256Bytes(bytes),
    };
  });
}

export function snapshotPublisherThemeHostSources(
  hostRoot: string,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      walkFiles(hostRoot, { omitNextRoot: true }).map((relativePath) => [
        relativePath,
        sha256Bytes(
          readStableRegularFile(
            path.join(hostRoot, ...relativePath.split("/")),
            "Publisher theme host source",
            hostRoot,
          ),
        ),
      ]),
    ),
  );
}

export function assertPublisherThemeHostSourcesCurrent(input: Readonly<{
  actual: Readonly<Record<string, string>>;
  expected: Readonly<Record<string, string>>;
}>): void {
  if (!isDeepStrictEqual(input.actual, input.expected)) {
    throw new TypeError("Next changed the isolated Publisher theme host source set.");
  }
}

function appendProcessTail(current: ProcessTail, chunk: Buffer): ProcessTail {
  const bytes = current.bytes + chunk.byteLength;
  const combined = Buffer.concat([Buffer.from(current.text), chunk]);
  const tail =
    combined.byteLength <= MAXIMUM_DIAGNOSTIC_TAIL_BYTES
      ? combined
      : combined.subarray(combined.byteLength - MAXIMUM_DIAGNOSTIC_TAIL_BYTES);
  return Object.freeze({ bytes, text: tail.toString("utf8") });
}

async function stopChild(
  child: ChildProcess,
  timeoutMs = SERVER_STOP_TIMEOUT_MS,
): Promise<void> {
  const groupId =
    process.platform !== "win32" && typeof child.pid === "number" && child.pid > 0
      ? -child.pid
      : null;
  const groupExists = (): boolean => {
    if (groupId === null) return false;
    try {
      process.kill(groupId, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
      throw error;
    }
  };
  const waitForClose = async (waitMs: number): Promise<boolean> => {
    if (child.exitCode !== null || child.signalCode !== null) return true;
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        child.removeListener("close", close);
        resolve(false);
      }, waitMs);
      timer.unref();
      const close = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      child.once("close", close);
    });
  };
  const signal = (value: NodeJS.Signals): void => {
    if (groupId !== null) {
      try {
        process.kill(groupId, value);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    child.kill(value);
  };
  if (
    (child.exitCode === null && child.signalCode === null) ||
    groupExists()
  ) {
    signal("SIGTERM");
  }
  await waitForClose(timeoutMs);
  if (
    (child.exitCode === null && child.signalCode === null) ||
    groupExists()
  ) {
    signal("SIGKILL");
  }
  const leaderClosed = await waitForClose(timeoutMs);
  const groupDeadline = Date.now() + timeoutMs;
  while (groupExists() && Date.now() < groupDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!leaderClosed || groupExists()) {
    throw new Error("Publisher theme proof child process did not stop.");
  }
}

export async function runBoundedNodeCommand(input: Readonly<{
  args: readonly string[];
  cwd: string;
  label: string;
  maximumOutputBytes?: number;
  runtimeRoot?: string;
  signal?: AbortSignal;
  timeoutMs: number;
}>): Promise<PublisherThemeHostBuildResult> {
  return await new Promise<PublisherThemeHostBuildResult>((resolve, reject) => {
    const child = spawn(process.execPath, [...input.args], {
      cwd: input.cwd,
      detached: process.platform !== "win32",
      env: createPublisherThemeChildEnvironment(process.env, input.runtimeRoot),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let tail: ProcessTail = Object.freeze({ bytes: 0, text: "" });
    let failure: "abort" | "output" | "timeout" | null = null;
    let settled = false;
    let stopPromise: Promise<void> | null = null;
    const maximumOutputBytes =
      input.maximumOutputBytes ?? MAXIMUM_PROCESS_OUTPUT_BYTES;
    const timer = setTimeout(() => {
      if (failure === null) requestStop("timeout");
    }, input.timeoutMs);
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
    };
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const requestStop = (reason: "abort" | "output" | "timeout"): void => {
      if (failure === null) failure = reason;
      if (stopPromise !== null) return;
      stopPromise = stopChild(child);
      void stopPromise.catch((error) => {
        rejectOnce(
          new AggregateError(
            [error],
            `${input.label} could not stop its process group.`,
          ),
        );
      });
    };
    const abort = (): void => requestStop("abort");
    const collect = (chunk: Buffer): void => {
      tail = appendProcessTail(tail, chunk);
      if (tail.bytes > maximumOutputBytes && failure === null) {
        requestStop("output");
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", rejectOnce);
    input.signal?.addEventListener("abort", abort, { once: true });
    if (input.signal?.aborted) abort();
    timer.unref();
    child.once("close", async (code, signal) => {
      if (settled) return;
      if (stopPromise !== null) {
        try {
          await stopPromise;
        } catch {
          return;
        }
      }
      cleanup();
      if (settled) return;
      settled = true;
      if (failure === "abort") {
        reject(new Error(`${input.label} was interrupted.`));
      } else if (failure === "timeout") {
        reject(new Error(`${input.label} exceeded its time limit.`));
      } else if (failure === "output") {
        reject(new Error(`${input.label} exceeded its output limit.`));
      } else if (code !== 0) {
        reject(
          new Error(
            `${input.label} failed with code ${String(code)}, signal ${String(signal)}, and ${String(tail.bytes)} output bytes.`,
          ),
        );
      } else {
        resolve(Object.freeze({ outputBytes: tail.bytes }));
      }
    });
  });
}

export const runPublisherThemeNextBuild: PublisherThemeHostBuildRunner = async ({
  hostRoot,
  nextCliPath,
  runtimeRoot,
  signal,
}) => {
  readStableRegularFile(nextCliPath, "Next.js CLI", repoRoot);
  return await runBoundedNodeCommand({
    args: [nextCliPath, "build"],
    cwd: hostRoot,
    label: "Publisher theme compiler Next build",
    runtimeRoot,
    signal,
    timeoutMs: BUILD_TIMEOUT_MS,
  });
};

export function createPublisherThemeResponseBudget(
  maximumBytes = MAXIMUM_TOTAL_RESPONSE_BYTES,
): PublisherThemeResponseBudget {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new TypeError("Publisher theme response budget is invalid.");
  }
  return { maximumBytes, usedBytes: 0 };
}

function declaredResponseLength(response: Response, label: string): number | undefined {
  const contentLength = response.headers.get("content-length");
  if (contentLength === null) return undefined;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength)) {
    throw new TypeError(`${label} used an invalid Content-Length.`);
  }
  const value = Number(contentLength);
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} used an invalid Content-Length.`);
  }
  return value;
}

export async function readPublisherThemeBoundedResponse(
  response: Response,
  label: string,
  maximumResponseBytes: number,
  budget: PublisherThemeResponseBudget,
): Promise<Buffer> {
  if (
    !Number.isSafeInteger(maximumResponseBytes) ||
    maximumResponseBytes < 0 ||
    !Number.isSafeInteger(budget.maximumBytes) ||
    budget.maximumBytes < 0 ||
    !Number.isSafeInteger(budget.usedBytes) ||
    budget.usedBytes < 0 ||
    budget.usedBytes > budget.maximumBytes
  ) {
    throw new TypeError(`${label} received an invalid response limit.`);
  }
  const contentEncoding = response.headers.get("content-encoding");
  if (
    contentEncoding !== null &&
    contentEncoding.trim() !== "" &&
    contentEncoding.trim().toLowerCase() !== "identity"
  ) {
    throw new TypeError(`${label} used an unsupported content encoding.`);
  }
  const declaredLength = declaredResponseLength(response, label);
  const remainingBudget = budget.maximumBytes - budget.usedBytes;
  if (
    declaredLength !== undefined &&
    (declaredLength > maximumResponseBytes || declaredLength > remainingBudget)
  ) {
    throw new TypeError(`${label} exceeded its response limit.`);
  }
  if (response.body === null) {
    if (declaredLength !== undefined && declaredLength !== 0) {
      throw new TypeError(`${label} did not match its Content-Length.`);
    }
    return Buffer.alloc(0);
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let responseBytes = 0;
  let chunkCount = 0;
  let complete = false;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) {
        complete = true;
        break;
      }
      const chunk = item.value;
      chunkCount += 1;
      if (
        chunkCount > MAXIMUM_RESPONSE_CHUNKS ||
        chunk.byteLength > maximumResponseBytes - responseBytes ||
        chunk.byteLength > budget.maximumBytes - budget.usedBytes
      ) {
        throw new TypeError(`${label} exceeded its response limit.`);
      }
      responseBytes += chunk.byteLength;
      budget.usedBytes += chunk.byteLength;
      // Own only the counted bytes. A small Uint8Array view can otherwise retain
      // an arbitrarily large response-owned backing buffer until concatenation.
      chunks.push(Buffer.from(chunk));
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (declaredLength !== undefined && responseBytes !== declaredLength) {
    throw new TypeError(`${label} did not match its Content-Length.`);
  }
  return Buffer.concat(chunks, responseBytes);
}

async function readBoundedTextResponse(
  response: Response,
  label: string,
  maximumResponseBytes: number,
  budget: PublisherThemeResponseBudget,
): Promise<string> {
  const bytes = await readPublisherThemeBoundedResponse(
    response,
    label,
    maximumResponseBytes,
    budget,
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  return await fetch(url, {
    cache: "no-store",
    credentials: "omit",
    headers: { "accept-encoding": "identity" },
    redirect: "manual",
    signal:
      signal === undefined
        ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
        : AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
  });
}

function isValidHttpQuotedString(value: string): boolean {
  if (!value.startsWith('"') || !value.endsWith('"') || value.length < 2) {
    return false;
  }
  let escaped = false;
  for (const character of value.slice(1, -1)) {
    const code = character.codePointAt(0)!;
    if (escaped) {
      if (character !== "\t" && (code < 0x20 || code > 0xff)) return false;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (
      character === '"' ||
      (character !== "\t" && (code < 0x20 || code === 0x7f || code > 0xff))
    ) {
      return false;
    }
  }
  return !escaped;
}

export function assertPublisherThemeResponseMediaType(
  contentType: string | null,
  kind: "font" | "html" | "stylesheet",
): void {
  const expected = {
    font: "font/woff2",
    html: "text/html",
    stylesheet: "text/css",
  } as const;
  const value = contentType ?? "";
  if (/\r|\n/u.test(value)) {
    throw new TypeError(`Publisher theme ${kind} used an invalid media type.`);
  }
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index <= value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === ";" || character === undefined) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
  const parameters = new Set<string>();
  const valid =
    !quoted &&
    !escaped &&
    parts[0]?.toLowerCase() === expected[kind] &&
    parts.slice(1).every((part) => {
      const separator = part.indexOf("=");
      const name = part.slice(0, separator).trim().toLowerCase();
      const parameterValue = part.slice(separator + 1).trim();
      const quotedValue = isValidHttpQuotedString(parameterValue);
      if (
        separator <= 0 ||
        !token.test(name) ||
        parameters.has(name) ||
        (!token.test(parameterValue) && !quotedValue)
      ) {
        return false;
      }
      parameters.add(name);
      return true;
    });
  if (!valid) {
    throw new TypeError(`Publisher theme ${kind} used an invalid media type.`);
  }
}

async function waitForProbe(baseUrl: string, signal: AbortSignal): Promise<Response> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let lastStatus: number | undefined;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/${PROBE_ROUTE_NAME}`,
        signal,
      );
      lastStatus = response.status;
      if (response.status === 200) return response;
      await response.body?.cancel();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Publisher theme compiler server did not become ready${lastStatus === undefined ? "" : `, last status ${lastStatus}`}.`,
  );
}

export function parsePublisherThemeProofPage(html: string): unknown {
  const matches = htmlOpeningElements(html).filter(
    ({ name, attributes }) =>
      name === "script" &&
      attributes.id === "publisher-theme-proof-data",
  );
  if (matches.length !== 1) {
    throw new TypeError(
      "Publisher theme proof page must contain one live inert identity payload.",
    );
  }
  const match = matches[0]!;
  assertExactKeys(
    match.attributes as JsonRecord,
    ["id", "type"],
    "Publisher theme proof script",
  );
  if (match.attributes.type !== "application/json" || match.content === undefined) {
    throw new TypeError("Publisher theme proof identity payload is not inert JSON.");
  }
  return JSON.parse(match.content);
}

export function assertPublisherThemeVerificationRoutePaths(
  routePaths: readonly string[],
): void {
  if (
    new Set(routePaths).size !== routePaths.length ||
    routePaths.some(
      (routePath) =>
        !routePath.startsWith("/") ||
        routePath.startsWith("//") ||
        routePath.includes("\\") ||
        routePath.includes("?") ||
        routePath.includes("#") ||
        /(?:^|\/)\.{1,2}(?:\/|$)/u.test(routePath) ||
        /%2e/iu.test(routePath),
    )
  ) {
    throw new TypeError(
      "Publisher theme host received an unsafe route verification set.",
    );
  }
}

function detachedImmutablePublisherThemeObserverValue<T>(value: T): T {
  const detached = structuredClone(value);
  const seen = new WeakSet<object>();
  const freeze = (entry: unknown): void => {
    if (entry === null || typeof entry !== "object" || seen.has(entry)) return;
    seen.add(entry);
    for (const child of Object.values(entry)) freeze(child);
    Object.freeze(entry);
  };
  freeze(detached);
  return detached;
}

export const fetchPublisherThemeBuiltHost: PublisherThemeHostFetchRunner = async ({
  homePath,
  hostRoot,
  liveHostObserver,
  liveHostObserverProjection,
  nextCliPath,
  routePaths,
  runtimeRoot,
  signal,
}) => {
  if (
    (liveHostObserver === undefined) !==
    (liveHostObserverProjection === undefined)
  ) {
    throw new TypeError(
      "Publisher theme live host observer requires one exact adapted projection.",
    );
  }
  readStableRegularFile(nextCliPath, "Next.js CLI", repoRoot);
  signal.throwIfAborted();
  const child = spawn(
    process.execPath,
    [nextCliPath, "start", "--hostname", "127.0.0.1", "--port", "0"],
    {
      cwd: hostRoot,
      detached: process.platform !== "win32",
      env: createPublisherThemeChildEnvironment(process.env, runtimeRoot),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let tail: ProcessTail = Object.freeze({ bytes: 0, text: "" });
  let baseUrl: string | undefined;
  let exited = false;
  let outputExceeded = false;
  let startupError = false;
  const abort = (): void => {
    void stopChild(child).catch(() => undefined);
  };
  const collect = (chunk: Buffer): void => {
    tail = appendProcessTail(tail, chunk);
    const match = tail.text.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/u);
    if (match !== null) baseUrl = `http://127.0.0.1:${match[1]}`;
    if (tail.bytes > MAXIMUM_PROCESS_OUTPUT_BYTES) {
      outputExceeded = true;
      void stopChild(child).catch(() => undefined);
    }
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.once("close", () => {
    exited = true;
  });
  child.once("error", () => {
    startupError = true;
  });
  signal.addEventListener("abort", abort, { once: true });
  try {
    const responseBudget = createPublisherThemeResponseBudget();
    const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
    while (baseUrl === undefined && !exited && Date.now() < deadline) {
      signal.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (outputExceeded) {
      throw new Error("Publisher theme compiler server exceeded its output limit.");
    }
    if (baseUrl === undefined || exited || startupError) {
      throw new Error("Publisher theme compiler server failed to start.");
    }
    const probeResponse = await waitForProbe(baseUrl, signal);
    assertPublisherThemeResponseMediaType(
      probeResponse.headers.get("content-type"),
      "html",
    );
    const probeHtml = await readBoundedTextResponse(
      probeResponse,
      "Publisher theme proof",
      PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES,
      responseBudget,
    );
    const probe = parsePublisherThemeProofPage(probeHtml);
    const homeResponse = await fetchWithTimeout(
      new URL(homePath, baseUrl).href,
      signal,
    );
    if (homeResponse.status !== 200) {
      throw new TypeError(
        `Publisher theme compiler home route returned ${homeResponse.status}.`,
      );
    }
    assertPublisherThemeResponseMediaType(
      homeResponse.headers.get("content-type"),
      "html",
    );
    const homeHtml = await readBoundedTextResponse(
      homeResponse,
      "Publisher theme home page",
      PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES,
      responseBudget,
    );
    assertPublisherThemeVerificationRoutePaths(routePaths);
    const routePages: Array<Readonly<{ path: string; html: string }>> = [];
    for (const routePath of routePaths) {
      const response = await fetchWithTimeout(
        new URL(routePath, baseUrl).href,
        signal,
      );
      if (response.status !== 200) {
        await readBoundedTextResponse(
          response,
          "Publisher theme route failure",
          PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES,
          responseBudget,
        );
        throw new TypeError(
          `Publisher theme route '${routePath}' returned ${response.status}.`,
        );
      }
      assertPublisherThemeResponseMediaType(
        response.headers.get("content-type"),
        "html",
      );
      routePages.push(
        Object.freeze({
          path: routePath,
          html: await readBoundedTextResponse(
            response,
            `Publisher theme route '${routePath}'`,
            PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES,
            responseBudget,
          ),
        }),
      );
    }
    const audioArtifactResponse = await fetchWithTimeout(
      new URL("/publication-audio.json", baseUrl).href,
      signal,
    );
    await readBoundedTextResponse(
      audioArtifactResponse,
      "Publisher theme absent audio artifact",
      PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES,
      responseBudget,
    );
    if (audioArtifactResponse.status !== 404) {
      throw new TypeError(
        `Publisher theme audio artifact probe returned ${audioArtifactResponse.status}.`,
      );
    }
    const references = publisherThemeHomeAssetReferences(homeHtml);
    const homeStylesheets: Array<Readonly<{ path: string; text: string }>> = [];
    for (const stylesheetPath of references.stylesheets) {
      const response = await fetchWithTimeout(
        new URL(`/_next/${stylesheetPath}`, baseUrl).href,
        signal,
      );
      if (response.status !== 200) {
        throw new TypeError(
          `Publisher theme stylesheet returned ${response.status}.`,
        );
      }
      assertPublisherThemeResponseMediaType(
        response.headers.get("content-type"),
        "stylesheet",
      );
      homeStylesheets.push(
        Object.freeze({
          path: stylesheetPath,
          text: await readBoundedTextResponse(
            response,
            "Publisher theme stylesheet",
            MAXIMUM_STYLESHEET_RESPONSE_BYTES,
            responseBudget,
          ),
        }),
      );
    }
    const homeFonts: Array<Readonly<{ path: string; bytes: Uint8Array }>> = [];
    for (const fontPath of publisherThemeFontAssetPaths(homeStylesheets)) {
      const response = await fetchWithTimeout(
        new URL(`/_next/${fontPath}`, baseUrl).href,
        signal,
      );
      if (response.status !== 200) {
        throw new TypeError(`Publisher theme font returned ${response.status}.`);
      }
      assertPublisherThemeResponseMediaType(
        response.headers.get("content-type"),
        "font",
      );
      homeFonts.push(
        Object.freeze({
          path: fontPath,
          bytes: await readPublisherThemeBoundedResponse(
            response,
            "Publisher theme font",
            MAXIMUM_FONT_RESPONSE_BYTES,
            responseBudget,
          ),
        }),
      );
    }
    if (outputExceeded) {
      throw new Error("Publisher theme compiler server exceeded its output limit.");
    }
    if (
      liveHostObserver !== undefined &&
      liveHostObserverProjection !== undefined
    ) {
      signal.throwIfAborted();
      const observerSignal = AbortSignal.any([signal]);
      await liveHostObserver(
        Object.freeze({
          baseUrl,
          projection: detachedImmutablePublisherThemeObserverValue(
            liveHostObserverProjection,
          ),
          probe: detachedImmutablePublisherThemeObserverValue(probe),
          signal: observerSignal,
        }),
      );
      signal.throwIfAborted();
    }
    if (outputExceeded) {
      throw new Error("Publisher theme compiler server exceeded its output limit.");
    }
    return Object.freeze({
      probe,
      homeHtml,
      audioArtifactStatus: audioArtifactResponse.status,
      routePages: Object.freeze(routePages),
      homeStylesheets: Object.freeze(homeStylesheets),
      homeFonts: Object.freeze(homeFonts),
    });
  } finally {
    signal.removeEventListener("abort", abort);
    await stopChild(child);
  }
};

function asRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be one object.`);
  }
  return value as JsonRecord;
}

function assertExactKeys(record: JsonRecord, keys: readonly string[], label: string): void {
  if (!isDeepStrictEqual(Object.keys(record).sort(), [...keys].sort())) {
    throw new TypeError(`${label} has an unexpected field set.`);
  }
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

type HtmlOpeningElement = Readonly<{
  index: number;
  name: string;
  attributes: Readonly<Record<string, string>>;
  ancestors: readonly Readonly<{
    name: string;
    index: number;
    attributes: Readonly<Record<string, string>>;
  }>[];
  hiddenByTree: boolean;
  inertByTree: boolean;
  content?: string;
}>;

function parseHtmlOpeningElement(source: string): HtmlOpeningElement {
  const nameMatch = source.match(/^<([A-Za-z][A-Za-z0-9:-]*)/u);
  if (nameMatch === null) {
    throw new TypeError("Publisher theme proof encountered invalid HTML markup.");
  }
  const attributes: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  let offset = nameMatch[0].length;
  while (offset < source.length) {
    while (/\s/u.test(source[offset] ?? "")) offset += 1;
    if (source.startsWith("/>", offset) || source[offset] === ">") break;
    const attributeMatch = source
      .slice(offset)
      .match(/^([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/u);
    if (attributeMatch === null) {
      throw new TypeError("Publisher theme proof encountered an invalid HTML attribute.");
    }
    const name = attributeMatch[1]!.toLowerCase();
    if (Object.hasOwn(attributes, name)) {
      throw new TypeError("Publisher theme proof encountered a duplicate HTML attribute.");
    }
    attributes[name] = decodeHtmlAttribute(
      attributeMatch[2] ?? attributeMatch[3] ?? attributeMatch[4] ?? "",
    );
    offset += attributeMatch[0].length;
  }
  return Object.freeze({
    index: -1,
    name: nameMatch[1]!.toLowerCase(),
    attributes: Object.freeze(attributes),
    ancestors: Object.freeze([]),
    hiddenByTree: false,
    inertByTree: false,
  });
}

function findHtmlTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let end = start + 1; end < html.length; end += 1) {
    const character = html[end]!;
    if (quote === null && (character === '"' || character === "'")) {
      quote = character;
    } else if (quote === character) {
      quote = null;
    } else if (quote === null && character === ">") {
      return end;
    }
  }
  throw new TypeError("Publisher theme proof encountered unterminated HTML markup.");
}

function htmlOpeningElements(html: string): readonly HtmlOpeningElement[] {
  const elements: HtmlOpeningElement[] = [];
  const rawTextElements = new Set([
    "iframe",
    "noembed",
    "noframes",
    "noscript",
    "plaintext",
    "script",
    "style",
    "textarea",
    "title",
    "xmp",
  ]);
  const voidElements = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);
  const stack: Array<
    Readonly<{
      name: string;
      index: number;
      attributes: Readonly<Record<string, string>>;
      hiddenByTree: boolean;
      inertByTree: boolean;
    }>
  > = [];
  let offset = 0;
  let openingIndex = 0;
  let templateDepth = 0;
  while (offset < html.length) {
    const start = html.indexOf("<", offset);
    if (start < 0) break;
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      if (end < 0) {
        throw new TypeError("Publisher theme proof encountered an unterminated comment.");
      }
      offset = end + 3;
      continue;
    }
    if (html[start + 1] === "!" || html[start + 1] === "?") {
      offset = findHtmlTagEnd(html, start) + 1;
      continue;
    }
    if (html[start + 1] === "/") {
      const end = findHtmlTagEnd(html, start);
      const closingName = html
        .slice(start + 2, end)
        .trim()
        .split(/\s+/u)[0]
        ?.toLowerCase();
      if (closingName !== undefined) {
        const matchingIndex = stack.findLastIndex(
          ({ name }) => name === closingName,
        );
        if (matchingIndex >= 0) stack.splice(matchingIndex);
        templateDepth = stack.filter(({ name }) => name === "template").length;
      }
      offset = end + 1;
      continue;
    }
    const first = html[start + 1];
    if (first === undefined || !/[A-Za-z]/u.test(first)) {
      offset = start + 1;
      continue;
    }
    const end = findHtmlTagEnd(html, start);
    const parsed = parseHtmlOpeningElement(html.slice(start, end + 1));
    const elementIndex = openingIndex;
    openingIndex += 1;
    const parent = stack.at(-1);
    const inlineStyle = parsed.attributes.style?.toLowerCase() ?? "";
    const hiddenByTree =
      parent?.hiddenByTree === true ||
      Object.hasOwn(parsed.attributes, "hidden") ||
      parsed.attributes["aria-hidden"]?.trim().toLowerCase() === "true" ||
      /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|content-visibility\s*:\s*hidden)\s*(?:!important\s*)?(?:;|$)/u.test(
        inlineStyle,
      ) ||
      /(?:^|;)\s*opacity\s*:\s*(?:0+(?:\.0+)?|\.0+)\s*(?:!important\s*)?(?:;|$)/u.test(
        inlineStyle,
      ) ||
      ((parsed.name === "dialog" || parsed.name === "details") &&
        !Object.hasOwn(parsed.attributes, "open")) ||
      Object.hasOwn(parsed.attributes, "popover");
    const inertByTree =
      parent?.inertByTree === true || Object.hasOwn(parsed.attributes, "inert");
    const element = Object.freeze({
      ...parsed,
      index: elementIndex,
      ancestors: Object.freeze(
        stack.map(({ name, index, attributes }) =>
          Object.freeze({ name, index, attributes }),
        ),
      ),
      hiddenByTree,
      inertByTree,
      ...(["a", "h1"].includes(parsed.name)
        ? {
            content: (() => {
              const closePattern = new RegExp(
                `<\\/${parsed.name}\\s*>`,
                "igu",
              );
              closePattern.lastIndex = end + 1;
              const close = closePattern.exec(html);
              if (close === null) {
                throw new TypeError(
                  `Publisher theme proof encountered an unterminated ${parsed.name} element.`,
                );
              }
              const content = html.slice(end + 1, close.index);
              if (
                parsed.name === "a" &&
                /<a(?:\s|>)/iu.test(content)
              ) {
                throw new TypeError(
                  "Publisher theme proof encountered nested anchor elements.",
                );
              }
              return content;
            })(),
          }
        : {}),
    });
    if (element.name === "template") {
      stack.push(element);
      templateDepth += 1;
      offset = end + 1;
      continue;
    }
    if (rawTextElements.has(element.name)) {
      const closePattern = new RegExp(`<\\/${element.name}\\s*>`, "igu");
      closePattern.lastIndex = end + 1;
      const close = closePattern.exec(html);
      if (close === null) {
        throw new TypeError(
          `Publisher theme proof encountered an unterminated ${element.name} element.`,
        );
      }
      if (templateDepth === 0) {
        elements.push(
          Object.freeze({
            ...element,
            content: html.slice(end + 1, close.index),
          }),
        );
      }
      offset = close.index + close[0].length;
      continue;
    }
    if (templateDepth === 0) elements.push(element);
    if (
      !voidElements.has(element.name) &&
      !html.slice(start, end + 1).endsWith("/>")
    ) {
      stack.push(element);
    }
    offset = end + 1;
  }
  return Object.freeze(elements);
}

function decodeHtmlText(value: string): string {
  const decoded = value.replace(
    /&(?:amp|lt|gt|quot|apos|#39|#x27|#[0-9]+|#x[0-9a-f]+);/giu,
    (entity) => {
      const normalized = entity.toLowerCase();
      if (normalized === "&amp;") return "&";
      if (normalized === "&lt;") return "<";
      if (normalized === "&gt;") return ">";
      if (normalized === "&quot;") return '"';
      if (
        normalized === "&apos;" ||
        normalized === "&#39;" ||
        normalized === "&#x27;"
      ) {
        return "'";
      }
      const hexadecimal = normalized.startsWith("&#x");
      const digits = normalized.slice(hexadecimal ? 3 : 2, -1);
      const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        throw new TypeError(
          "Publisher theme proof encountered an invalid HTML text entity.",
        );
      }
      return String.fromCodePoint(codePoint);
    },
  );
  if (/&(?:#|[A-Za-z])/u.test(decoded)) {
    throw new TypeError(
      "Publisher theme proof encountered an unsupported HTML text entity.",
    );
  }
  return decoded;
}

function publisherThemeAnchorLabel(content: string): string {
  if (/<!--|<\/?(?:script|style|template|noscript)(?:\s|>)/iu.test(content)) {
    throw new TypeError(
      "Publisher theme semantic link contains inert or executable label markup.",
    );
  }
  const descendants = htmlOpeningElements(content);
  if (
    descendants.some(
      ({ hiddenByTree, inertByTree }) => hiddenByTree || inertByTree,
    )
  ) {
    throw new TypeError(
      "Publisher theme semantic link contains hidden label markup.",
    );
  }
  let text = "";
  let offset = 0;
  while (offset < content.length) {
    const start = content.indexOf("<", offset);
    if (start < 0) {
      text += content.slice(offset);
      break;
    }
    text += content.slice(offset, start);
    const end = findHtmlTagEnd(content, start);
    offset = end + 1;
  }
  return decodeHtmlText(text);
}

function closestPublisherThemeOwner(
  element: HtmlOpeningElement,
  attribute: string,
): HtmlOpeningElement["ancestors"][number] | undefined {
  return element.ancestors.findLast(({ attributes }) =>
    Object.hasOwn(attributes, attribute),
  );
}

export function verifyPublisherThemeLinkfulHostPages(input: Readonly<{
  fetched: PublisherThemeHostFetchResult;
  projection: PublisherThemeHostReaderProjection;
}>): Readonly<{
  projectionHash: string;
  verifiedPaths: readonly string[];
  pageEvidence: readonly Readonly<{
    path: string;
    bytes: number;
  }>[];
}> {
  const expectedPaths = Object.freeze([
    ...input.projection.liveContentPaths,
    ...input.projection.sectionIndexPaths,
  ]);
  if (
    input.projection.liveContentPaths.length !==
      input.projection.fragmentOwners.length + 1 ||
    hashJson(input.projection.liveContentPaths as unknown as JSONValue) !==
      input.projection.liveContentPathsHash ||
    input.projection.sectionIndexPaths.length !==
      input.projection.sectionIndexes.length ||
    hashJson(input.projection.sectionIndexPaths as unknown as JSONValue) !==
      input.projection.sectionIndexPathsHash
  ) {
    throw new TypeError(
      "Publisher theme host received a drifted live content path projection.",
    );
  }
  if (
    !isDeepStrictEqual(
      input.fetched.routePages.map(({ path: routePath }) => routePath),
      expectedPaths,
    )
  ) {
    throw new TypeError(
      "Publisher theme host returned a mismatched route verification set.",
    );
  }
  const sourcePage = input.fetched.routePages[0];
  if (sourcePage === undefined) {
    throw new TypeError("Publisher theme host omitted the semantic source work page.");
  }
  const sourceElements = htmlOpeningElements(sourcePage.html);
  const sourcePageRoots = sourceElements.filter(
    ({ name, attributes, hiddenByTree, inertByTree }) =>
      name === "div" &&
      (attributes.class ?? "").split(/\s+/u).includes("publisher-root") &&
      attributes["data-publisher-page"] === "work" &&
      !hiddenByTree &&
      !inertByTree,
  );
  if (sourcePageRoots.length !== 1) {
    throw new TypeError(
      "Publisher theme semantic source route omitted its exact work page root.",
    );
  }
  const sourcePageRoot = sourcePageRoots[0]!;
  const workRoots = sourceElements.filter(
    ({ name, attributes, ancestors, hiddenByTree, inertByTree }) =>
      name === "article" &&
      attributes["data-publisher-work"] === input.projection.sourceWorkId &&
      ancestors.some(({ index }) => index === sourcePageRoot.index) &&
      !hiddenByTree &&
      !inertByTree,
  );
  if (workRoots.length !== 1) {
    throw new TypeError(
      "Publisher theme semantic source page omitted its exact work owner.",
    );
  }
  const workRoot = workRoots[0]!;
  const expectedGroups = new Map<
    string,
    {
      workId: string;
      sectionId: string;
      blockId: string;
      links: PublisherThemeHostLinkProjection[];
    }
  >();
  for (const link of input.projection.semanticLinks) {
    const key = `${link.workId}\u0000${link.sectionId}\u0000${link.blockId}`;
    const group = expectedGroups.get(key);
    if (group === undefined) {
      expectedGroups.set(key, {
        workId: link.workId,
        sectionId: link.sectionId,
        blockId: link.blockId,
        links: [link],
      });
    } else {
      group.links.push(link);
    }
  }
  if (expectedGroups.size !== input.projection.semanticLinkBlockGroupCount) {
    throw new TypeError(
      "Publisher theme semantic block group identity drifted.",
    );
  }
  const liveGroups = [...expectedGroups.values()].map((group) => {
    const expectedLinks = [...group.links].sort(
      (left, right) => left.sourceStart - right.sourceStart,
    );
    const blockRoots = sourceElements.filter(
      (element) => {
        const sectionOwner = closestPublisherThemeOwner(
          element,
          "data-publisher-section",
        );
        const workOwner = closestPublisherThemeOwner(
          element,
          "data-publisher-work",
        );
        return (
          element.name === "div" &&
          element.attributes["data-publisher-block"] === group.blockId &&
          sectionOwner?.name === "section" &&
          sectionOwner.attributes["data-publisher-section"] ===
            group.sectionId &&
          workOwner?.index === workRoot.index &&
          !element.hiddenByTree &&
          !element.inertByTree
        );
      },
    );
    if (blockRoots.length !== 1) {
      throw new TypeError(
        `Publisher theme semantic block '${group.blockId}' has no unique live owner.`,
      );
    }
    const blockRoot = blockRoots[0]!;
    const liveLinks = sourceElements
      .filter(
        (element) => {
          const workOwner = closestPublisherThemeOwner(
            element,
            "data-publisher-work",
          );
          const sectionOwner = closestPublisherThemeOwner(
            element,
            "data-publisher-section",
          );
          const blockOwner = closestPublisherThemeOwner(
            element,
            "data-publisher-block",
          );
          return (
            element.name === "a" &&
            !element.hiddenByTree &&
            !element.inertByTree &&
            workOwner?.index === workRoot.index &&
            sectionOwner?.name === "section" &&
            sectionOwner.attributes["data-publisher-section"] ===
              group.sectionId &&
            blockOwner?.index === blockRoot.index
          );
        },
      )
      .map((element) => ({
        href: element.attributes.href,
        label: publisherThemeAnchorLabel(element.content ?? ""),
      }));
    const expectedLinkProjection = expectedLinks.map(({ href, label }) => ({
      href,
      label,
    }));
    if (!isDeepStrictEqual(liveLinks, expectedLinkProjection)) {
      throw new TypeError(
        `Publisher theme semantic block '${group.blockId}' rendered the wrong link sequence.`,
      );
    }
    return Object.freeze({
      workId: group.workId,
      sectionId: group.sectionId,
      blockId: group.blockId,
      links: Object.freeze(
        expectedLinks.map(({ id, href, label }) =>
          Object.freeze({ id, href, label }),
        ),
      ),
    });
  });
  const liveOwners = input.projection.fragmentOwners.map(
    (owner, ownerIndex) => {
      const page = input.fetched.routePages[ownerIndex + 1];
      if (page === undefined || page.path !== owner.path) {
        throw new TypeError(
          `Publisher theme host omitted fragment owner '${owner.sectionId}'.`,
        );
      }
      const ownerElements = htmlOpeningElements(page.html);
      const ownerPageRoots = ownerElements.filter(
        ({ name, attributes, hiddenByTree, inertByTree }) =>
          name === "div" &&
          (attributes.class ?? "").split(/\s+/u).includes("publisher-root") &&
          attributes["data-publisher-page"] === "section" &&
          !hiddenByTree &&
          !inertByTree,
      );
      if (ownerPageRoots.length !== 1) {
        throw new TypeError(
          `Publisher theme fragment owner '${owner.sectionId}' omitted its exact section page root.`,
        );
      }
      const ownerPageRoot = ownerPageRoots[0]!;
      const ownerWorkRoots = ownerElements.filter(
        ({ name, attributes, ancestors, hiddenByTree, inertByTree }) =>
          name === "article" &&
          attributes["data-publisher-work"] === owner.workId &&
          ancestors.some(({ index }) => index === ownerPageRoot.index) &&
          !hiddenByTree &&
          !inertByTree,
      );
      if (ownerWorkRoots.length !== 1) {
        throw new TypeError(
          `Publisher theme fragment owner '${owner.sectionId}' omitted its exact work ancestry.`,
        );
      }
      const ownerWorkRoot = ownerWorkRoots[0]!;
      const expectedSectionOwnerIds = [owner.sectionId, ...owner.childIds];
      const liveSectionOwnerIds = ownerElements.flatMap(({ attributes }) =>
        attributes["data-publisher-section"] === undefined
          ? []
          : [attributes["data-publisher-section"]]
      );
      if (!isDeepStrictEqual(liveSectionOwnerIds, expectedSectionOwnerIds)) {
        throw new TypeError(
          `Publisher theme fragment owner '${owner.sectionId}' rendered a drifted exact section ownership census.`,
        );
      }
      const idOwners = ownerElements.filter(
        ({ attributes }) => attributes.id === owner.anchor,
      );
      const sectionOwners = ownerElements.filter(
        ({ attributes }) =>
          attributes["data-publisher-section"] === owner.sectionId,
      );
      if (
        idOwners.length !== 1 ||
        sectionOwners.length !== 1 ||
        idOwners[0]!.index !== sectionOwners[0]!.index ||
        idOwners[0]!.name !== "section" ||
        idOwners[0]!.attributes["data-publisher-section"] !== owner.sectionId ||
        idOwners[0]!.hiddenByTree ||
        idOwners[0]!.inertByTree ||
        !idOwners[0]!.ancestors.some(
          ({ index }) => index === ownerPageRoot.index,
        ) ||
        closestPublisherThemeOwner(
          idOwners[0]!,
          "data-publisher-work",
        )?.index !== ownerWorkRoot.index
      ) {
        throw new TypeError(
          `Publisher theme fragment owner '${owner.sectionId}' did not render its exact live section ownership.`,
        );
      }
      const childIdSet = new Set(owner.childIds);
      for (const childId of childIdSet) {
        const childIdOwners = ownerElements.filter(
          ({ attributes }) => attributes.id === childId,
        );
        const childSectionOwners = ownerElements.filter(
          ({ attributes }) =>
            attributes["data-publisher-section"] === childId,
        );
        if (
          childIdOwners.length !== 1 ||
          childSectionOwners.length !== 1 ||
          childIdOwners[0]!.index !== childSectionOwners[0]!.index ||
          childIdOwners[0]!.name !== "section" ||
          childIdOwners[0]!.hiddenByTree ||
          childIdOwners[0]!.inertByTree ||
          !childIdOwners[0]!.ancestors.some(
            ({ index }) => index === ownerPageRoot.index,
          ) ||
          closestPublisherThemeOwner(
            childIdOwners[0]!,
            "data-publisher-work",
          )?.index !== ownerWorkRoot.index
        ) {
          throw new TypeError(
            `Publisher theme fragment owner '${owner.sectionId}' omitted nested section '${childId}'.`,
          );
        }
      }
      return Object.freeze({
        workId: owner.workId,
        sectionId: owner.sectionId,
        path: owner.path,
        anchor: owner.anchor,
        href: owner.href,
        childIds: owner.childIds,
        ownerSectionRendered: true as const,
        childSectionOwnershipRendered: true as const,
      });
    },
  );
  const liveSectionIndexes = input.projection.sectionIndexes.map(
    (sectionIndex, sectionIndexOffset) => {
      const page = input.fetched.routePages[
        input.projection.liveContentPaths.length + sectionIndexOffset
      ];
      if (page === undefined || page.path !== sectionIndex.path) {
        throw new TypeError(
          `Publisher theme host omitted section index '${sectionIndex.id}'.`,
        );
      }
      const elements = htmlOpeningElements(page.html);
      const pageRoots = elements.filter(
        ({ name, attributes, hiddenByTree, inertByTree }) =>
          name === "div" &&
          (attributes.class ?? "").split(/\s+/u).includes("publisher-root") &&
          attributes["data-publisher-page"] === "section-index" &&
          !hiddenByTree &&
          !inertByTree,
      );
      if (pageRoots.length !== 1) {
        throw new TypeError(
          `Publisher theme section index '${sectionIndex.id}' omitted its exact page root.`,
        );
      }
      const pageRoot = pageRoots[0]!;
      const indexRoots = elements.filter(
        ({ name, attributes, ancestors, hiddenByTree, inertByTree }) =>
          name === "article" &&
          attributes["data-publisher-section-index"] === sectionIndex.id &&
          attributes["data-publisher-work"] === sectionIndex.workId &&
          ancestors.some(({ index }) => index === pageRoot.index) &&
          !hiddenByTree &&
          !inertByTree,
      );
      if (indexRoots.length !== 1) {
        throw new TypeError(
          `Publisher theme section index '${sectionIndex.id}' omitted its exact article owner.`,
        );
      }
      const indexRoot = indexRoots[0]!;
      const headings = elements.filter(
        ({ name, ancestors, hiddenByTree, inertByTree }) =>
          name === "h1" &&
          ancestors.some(({ index }) => index === indexRoot.index) &&
          !hiddenByTree &&
          !inertByTree,
      );
      if (
        headings.length !== 1 ||
        publisherThemeAnchorLabel(headings[0]!.content ?? "") !==
          sectionIndex.title
      ) {
        throw new TypeError(
          `Publisher theme section index '${sectionIndex.id}' rendered the wrong title.`,
        );
      }
      const catalogRoots = elements.filter(
        ({ name, attributes, ancestors, hiddenByTree, inertByTree }) =>
          name === "ol" &&
          (attributes.class ?? "").split(/\s+/u).includes("publisher-catalog") &&
          ancestors.some(({ index }) => index === indexRoot.index) &&
          !hiddenByTree &&
          !inertByTree,
      );
      if (catalogRoots.length !== 1) {
        throw new TypeError(
          `Publisher theme section index '${sectionIndex.id}' omitted its exact catalog.`,
        );
      }
      const catalogRoot = catalogRoots[0]!;
      const liveSections = elements
        .filter(
          ({ name, ancestors, hiddenByTree, inertByTree }) =>
            name === "a" &&
            ancestors.some(({ index }) => index === catalogRoot.index) &&
            !hiddenByTree &&
            !inertByTree,
        )
        .map(({ attributes, content }) =>
          Object.freeze({
            href: attributes.href,
            title: publisherThemeAnchorLabel(content ?? ""),
          }),
        );
      if (
        !isDeepStrictEqual(
          liveSections,
          sectionIndex.sections.map(({ href, title }) => ({ href, title })),
        )
      ) {
        throw new TypeError(
          `Publisher theme section index '${sectionIndex.id}' rendered the wrong section sequence.`,
        );
      }
      return Object.freeze({
        id: sectionIndex.id,
        title: sectionIndex.title,
        path: sectionIndex.path,
        workId: sectionIndex.workId,
        sections: sectionIndex.sections,
        pageRendered: true as const,
      });
    },
  );
  const liveProjection = Object.freeze({
    sourceWork: Object.freeze({
      workId: input.projection.sourceWorkId,
      path: input.projection.sourceWorkPath,
      groups: Object.freeze(liveGroups),
    }),
    catalogChapterRootOwnerGroups: Object.freeze(liveOwners),
    sectionIndexes: Object.freeze(liveSectionIndexes),
  });
  return Object.freeze({
    projectionHash: hashJson(liveProjection as unknown as JSONValue),
    verifiedPaths: expectedPaths,
    pageEvidence: Object.freeze(
      input.fetched.routePages.map(({ path: routePath, html }) =>
        Object.freeze({
          path: routePath,
          bytes: Buffer.byteLength(html, "utf8"),
        }),
      ),
    ),
  });
}

function normalizeNextStaticAssetUrl(
  value: string,
  basePath = "/",
  allowRelative = false,
): string {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#") ||
    value.startsWith("//") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) ||
    (!allowRelative && !value.startsWith("/"))
  ) {
    throw new TypeError("Publisher theme proof encountered an unsafe asset URL.");
  }
  const origin = "https://publisher-theme-proof.invalid";
  const base = new URL(basePath, origin);
  const resolved = new URL(value, base);
  if (
    resolved.protocol !== "https:" ||
    resolved.origin !== origin ||
    resolved.username !== "" ||
    resolved.password !== "" ||
    resolved.search !== "" ||
    resolved.hash !== "" ||
    !resolved.pathname.startsWith("/_next/static/") ||
    !/^\/_next\/static\/[A-Za-z0-9._/-]+$/u.test(resolved.pathname) ||
    resolved.pathname.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new TypeError("Publisher theme proof encountered an unsafe asset URL.");
  }
  return resolved.pathname.slice("/_next/".length);
}

function uniqueSortedPaths(values: readonly string[], label: string): readonly string[] {
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${label} contains a duplicate asset.`);
  }
  return Object.freeze([...values].sort());
}

function assertAlwaysMatchingLinkMedia(
  attributes: Readonly<Record<string, string>>,
  label: string,
): void {
  const media = attributes.media?.trim().toLowerCase();
  if (media !== undefined && media !== "" && media !== "all") {
    throw new TypeError(`${label} uses a conditional media contract.`);
  }
}

function publisherThemeHomeAssetReferences(homeHtml: string): Readonly<{
  fontPreloads: readonly string[];
  stylesheets: readonly string[];
}> {
  const fontPreloads: string[] = [];
  const stylesheets: string[] = [];
  for (const element of htmlOpeningElements(homeHtml)) {
    if (element.name === "base") {
      throw new TypeError("Publisher home must not contain a live base element.");
    }
    if (element.name !== "link") continue;
    const rel = (element.attributes.rel ?? "")
      .toLowerCase()
      .split(/\s+/u)
      .filter(Boolean);
    const href = element.attributes.href;
    if (rel.includes("stylesheet")) {
      if (
        href === undefined ||
        rel.includes("alternate") ||
        Object.keys(element.attributes).some((name) => /^on/iu.test(name)) ||
        Object.hasOwn(element.attributes, "disabled") ||
        Object.hasOwn(element.attributes, "integrity") ||
        Object.hasOwn(element.attributes, "crossorigin") ||
        Object.hasOwn(element.attributes, "title") ||
        (element.attributes.type !== undefined &&
          element.attributes.type.toLowerCase() !== "text/css")
      ) {
        throw new TypeError("Publisher home stylesheet link has an inactive or unsupported contract.");
      }
      assertAlwaysMatchingLinkMedia(
        element.attributes,
        "Publisher home stylesheet link",
      );
      const assetPath = normalizeNextStaticAssetUrl(href);
      if (!assetPath.endsWith(".css")) {
        throw new TypeError("Publisher home stylesheet link is not CSS.");
      }
      stylesheets.push(assetPath);
    }
    if (rel.includes("preload") && element.attributes.as === "font") {
      if (
        href === undefined ||
        element.attributes.type !== "font/woff2" ||
        !Object.hasOwn(element.attributes, "crossorigin") ||
        !["", "anonymous"].includes(
          (element.attributes.crossorigin ?? "").trim().toLowerCase(),
        ) ||
        Object.hasOwn(element.attributes, "disabled") ||
        Object.hasOwn(element.attributes, "integrity")
      ) {
        throw new TypeError("Publisher home font preload has an invalid contract.");
      }
      assertAlwaysMatchingLinkMedia(
        element.attributes,
        "Publisher home font preload",
      );
      const assetPath = normalizeNextStaticAssetUrl(href);
      if (!assetPath.endsWith(".woff2")) {
        throw new TypeError("Publisher home font preload is not WOFF2.");
      }
      fontPreloads.push(assetPath);
    }
  }
  if (stylesheets.length === 0 || fontPreloads.length < 5) {
    throw new TypeError(
      "Publisher home did not deliver its compiled stylesheets and five fonts.",
    );
  }
  return Object.freeze({
    fontPreloads: uniqueSortedPaths(fontPreloads, "Publisher home font preloads"),
    stylesheets: uniqueSortedPaths(stylesheets, "Publisher home stylesheets"),
  });
}

function parseStyleAttribute(value: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const declaration of value.split(";")) {
    if (declaration.trim().length === 0) continue;
    const separator = declaration.indexOf(":");
    if (separator <= 0) {
      throw new TypeError("Publisher home contains an invalid inline style.");
    }
    const name = declaration.slice(0, separator).trim();
    const propertyValue = declaration.slice(separator + 1).trim();
    if (name.length === 0 || propertyValue.length === 0 || Object.hasOwn(result, name)) {
      throw new TypeError("Publisher home contains an invalid inline style.");
    }
    result[name] = propertyValue;
  }
  return Object.freeze(result);
}

function fontFamilyStack(value: string): readonly string[] {
  const families: string[] = [];
  let start = 0;
  let quote: '"' | "'" | null = null;
  for (let index = 0; index <= value.length; index += 1) {
    const character = value[index];
    if (character === "\\") {
      throw new TypeError("Publisher theme contains an escaped font family.");
    }
    if (quote === null && (character === '"' || character === "'")) {
      quote = character;
    } else if (quote === character) {
      quote = null;
    }
    if ((character === "," && quote === null) || index === value.length) {
      const raw = value.slice(start, index).trim();
      const match = raw.match(
        /^(?:"([^"\\]+)"|'([^'\\]+)'|([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*))$/u,
      );
      const family = match?.[1] ?? match?.[2] ?? match?.[3];
      if (family === undefined) {
        throw new TypeError("Publisher theme contains an invalid compiled font family.");
      }
      families.push(family);
      start = index + 1;
    }
  }
  if (quote !== null || families.length === 0 || new Set(families).size !== families.length) {
    throw new TypeError("Publisher theme contains an invalid compiled font family.");
  }
  return Object.freeze(families);
}

function normalizeFontAssetPath(value: string, cssPath: string): string {
  const withoutQuotes = value.trim().replace(/^['"]|['"]$/gu, "");
  const resolved = normalizeNextStaticAssetUrl(
    withoutQuotes,
    `/_next/${path.posix.dirname(cssPath)}/`,
    true,
  );
  if (!resolved.startsWith("static/media/") || !resolved.endsWith(".woff2")) {
    throw new TypeError("Publisher theme CSS references an invalid font asset path.");
  }
  return resolved;
}

function fontManifestRouteAssets(
  nextRoot: string,
): Readonly<{ home: readonly string[]; proof: readonly string[] }> {
  const manifest = readJsonRecordWithin(
    path.join(nextRoot, "server/next-font-manifest.json"),
    "Next font manifest",
    nextRoot,
  );
  const app = requiredObject(manifest, "app", "Next font manifest");
  const hostRoot = path.dirname(nextRoot);
  if (!isStrictlyInside(hostRoot, repoRoot)) {
    throw new TypeError("Next font manifest host escaped the publication root.");
  }
  const relativeHostRoot = path.relative(repoRoot, hostRoot).split(path.sep).join("/");
  const prefix = `[project]/${relativeHostRoot}/app/`;
  const normalized = new Map<string, readonly string[]>();
  for (const [key, value] of Object.entries(app)) {
    if (!key.startsWith(prefix)) continue;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new TypeError("Next font manifest route entry is invalid.");
    }
    const routeKey = key.slice(prefix.length);
    if (normalized.has(routeKey)) {
      throw new TypeError("Next font manifest duplicated a normalized route entry.");
    }
    normalized.set(
      routeKey,
      uniqueSortedPaths(
        value.map((item) =>
          normalizeNextStaticAssetUrl(`/_next/${item as string}`),
        ),
        `Next font manifest ${routeKey}`,
      ),
    );
  }
  const home = normalized.get("page");
  const proof = normalized.get(`${PROBE_ROUTE_NAME}/page`);
  if (home === undefined || proof === undefined) {
    throw new TypeError(
      "Next font manifest omitted the home or theme proof route entry.",
    );
  }
  return Object.freeze({ home, proof });
}

function readWoff2Base128(
  bytes: Buffer,
  initialOffset: number,
  label: string,
): Readonly<{ offset: number; value: number }> {
  let offset = initialOffset;
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    if (offset >= bytes.byteLength) {
      throw new TypeError(`${label} has a truncated WOFF2 table directory.`);
    }
    const octet = bytes[offset]!;
    offset += 1;
    if ((index === 0 && octet === 0x80) || value > 0x01ff_ffff) {
      throw new TypeError(`${label} has an invalid WOFF2 integer.`);
    }
    value = value * 128 + (octet & 0x7f);
    if (value > 0xffff_ffff) {
      throw new TypeError(`${label} has an overflowing WOFF2 integer.`);
    }
    if ((octet & 0x80) === 0) return Object.freeze({ offset, value });
  }
  throw new TypeError(`${label} has an overlong WOFF2 integer.`);
}

function validateWoff2(bytes: Buffer, label: string): FontkitFont {
  if (
    bytes.byteLength < 48 ||
    bytes.subarray(0, 4).toString("ascii") !== "wOF2" ||
    bytes.readUInt32BE(4) === 0x7474_6366 ||
    bytes.readUInt32BE(8) !== bytes.byteLength ||
    bytes.readUInt16BE(12) === 0 ||
    bytes.readUInt16BE(14) !== 0 ||
    bytes.readUInt32BE(16) === 0 ||
    bytes.readUInt32BE(20) === 0
  ) {
    throw new TypeError(`${label} is not a structurally valid WOFF2 file.`);
  }
  const totalSfntSize = bytes.readUInt32BE(16);
  const compressedLength = bytes.readUInt32BE(20);
  if (
    compressedLength > MAXIMUM_WOFF2_COMPRESSED_BYTES ||
    totalSfntSize > MAXIMUM_WOFF2_SFNT_BYTES
  ) {
    throw new TypeError(`${label} exceeds the WOFF2 resource limit.`);
  }
  const numberOfTables = bytes.readUInt16BE(12);
  const tags = new Set<string>();
  let directoryOffset = 48;
  let decompressedLength = 0;
  for (let tableIndex = 0; tableIndex < numberOfTables; tableIndex += 1) {
    if (directoryOffset >= bytes.byteLength) {
      throw new TypeError(`${label} has a truncated WOFF2 table directory.`);
    }
    const flags = bytes[directoryOffset]!;
    directoryOffset += 1;
    const tagIndex = flags & 0x3f;
    let tag: string;
    if (tagIndex === 0x3f) {
      if (directoryOffset + 4 > bytes.byteLength) {
        throw new TypeError(`${label} has a truncated custom WOFF2 table tag.`);
      }
      tag = bytes.subarray(directoryOffset, directoryOffset + 4).toString("latin1");
      directoryOffset += 4;
    } else {
      tag = WOFF2_KNOWN_TABLE_TAGS[tagIndex]!;
    }
    if (tags.has(tag)) {
      throw new TypeError(`${label} duplicates a WOFF2 table tag.`);
    }
    tags.add(tag);
    const original = readWoff2Base128(bytes, directoryOffset, label);
    directoryOffset = original.offset;
    const transformVersion = flags >>> 6;
    const isGlyfOrLoca = tag === "glyf" || tag === "loca";
    const transformed = isGlyfOrLoca
      ? transformVersion === 0
      : tag === "hmtx" && transformVersion === 1;
    const supportedTransform = isGlyfOrLoca
      ? transformVersion === 0 || transformVersion === 3
      : tag === "hmtx"
        ? transformVersion === 0 || transformVersion === 1
        : transformVersion === 0;
    if (!supportedTransform) {
      throw new TypeError(`${label} has an unsupported WOFF2 table transform.`);
    }
    let storedLength = original.value;
    if (transformed) {
      const transformedLength = readWoff2Base128(
        bytes,
        directoryOffset,
        label,
      );
      directoryOffset = transformedLength.offset;
      storedLength = transformedLength.value;
      if (tag === "loca" && storedLength !== 0) {
        throw new TypeError(`${label} has an invalid transformed loca table.`);
      }
    }
    if (
      storedLength > MAXIMUM_WOFF2_DECOMPRESSED_BYTES - decompressedLength
    ) {
      throw new TypeError(`${label} exceeds the WOFF2 decompression limit.`);
    }
    decompressedLength += storedLength;
  }
  const compressedEnd = directoryOffset + compressedLength;
  if (compressedEnd > bytes.byteLength) {
    throw new TypeError(`${label} has truncated WOFF2 compressed data.`);
  }
  let decompressed: Buffer;
  try {
    decompressed = brotliDecompressSync(
      bytes.subarray(directoryOffset, compressedEnd),
      { maxOutputLength: MAXIMUM_WOFF2_DECOMPRESSED_BYTES },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ERR_BUFFER_TOO_LARGE"
    ) {
      throw new TypeError(`${label} exceeds the WOFF2 decompression limit.`);
    }
    throw new TypeError(`${label} contains invalid WOFF2 Brotli data.`);
  }
  if (decompressed.byteLength !== decompressedLength) {
    throw new TypeError(`${label} has inconsistent WOFF2 table lengths.`);
  }
  for (const [offsetOffset, lengthOffset] of [
    [28, 32],
    [40, 44],
  ] as const) {
    const offset = bytes.readUInt32BE(offsetOffset);
    const length = bytes.readUInt32BE(lengthOffset);
    if (
      (offset === 0) !== (length === 0) ||
      (offset !== 0 && (offset < 48 || offset + length > bytes.byteLength))
    ) {
      throw new TypeError(`${label} has an invalid WOFF2 data range.`);
    }
  }
  const metadataOffset = bytes.readUInt32BE(28);
  const privateOffset = bytes.readUInt32BE(40);
  const firstAuxiliaryOffset = [metadataOffset, privateOffset]
    .filter((value) => value !== 0)
    .sort((left, right) => left - right)[0];
  if (
    firstAuxiliaryOffset !== undefined &&
    firstAuxiliaryOffset < compressedEnd
  ) {
    throw new TypeError(`${label} overlaps WOFF2 auxiliary and table data.`);
  }
  try {
    const font = fontkitModule().create(bytes);
    if (
      font.type !== "WOFF2" ||
      !Number.isSafeInteger(font.numGlyphs) ||
      font.numGlyphs < 2 ||
      font.numGlyphs > 1_000_000 ||
      !Number.isSafeInteger(font.unitsPerEm) ||
      font.unitsPerEm < 16 ||
      font.unitsPerEm > 16_384 ||
      !Number.isFinite(font.ascent) ||
      !Number.isFinite(font.descent) ||
      font.ascent <= font.descent ||
      !Array.isArray(font.characterSet) ||
      font.characterSet.length === 0 ||
      font.characterSet.length > 2_000_000 ||
      typeof font.glyphForCodePoint !== "function" ||
      typeof font.layout !== "function"
    ) {
      throw new TypeError("font metrics are incomplete");
    }
    return font;
  } catch {
    throw new TypeError(`${label} is not a usable WOFF2 font.`);
  }
}

function readJsonRecordWithin(
  filePath: string,
  label: string,
  root: string,
): JsonRecord {
  const value: unknown = JSON.parse(
    readStableRegularFile(filePath, label, root).toString("utf8"),
  );
  return asRecord(value, label);
}

function cssStringEnd(css: string, offset: number, label: string): number {
  const quote = css[offset];
  for (let cursor = offset + 1; cursor < css.length; cursor += 1) {
    if (css[cursor] === "\\") {
      cursor += 1;
      if (cursor >= css.length) break;
      continue;
    }
    if (css[cursor] === quote) return cursor + 1;
    if (css[cursor] === "\n" || css[cursor] === "\r") break;
  }
  throw new TypeError(`${label} contains an unterminated CSS string.`);
}

function cssCommentEnd(css: string, offset: number, label: string): number {
  const end = css.indexOf("*/", offset + 2);
  if (end === -1) {
    throw new TypeError(`${label} contains an unterminated CSS comment.`);
  }
  return end + 2;
}

function cssWithoutComments(css: string, label: string): string {
  let output = "";
  let cursor = 0;
  while (cursor < css.length) {
    if (css.startsWith("/*", cursor)) {
      cursor = cssCommentEnd(css, cursor, label);
      output += " ";
      continue;
    }
    if (css[cursor] === '"' || css[cursor] === "'") {
      const end = cssStringEnd(css, cursor, label);
      output += css.slice(cursor, end);
      cursor = end;
      continue;
    }
    output += css[cursor];
    cursor += 1;
  }
  return output;
}

function cssBlock(
  css: string,
  offset: number,
  label: string,
): Readonly<{ contents: string; offset: number }> {
  let depth = 1;
  let cursor = offset + 1;
  while (cursor < css.length) {
    if (css.startsWith("/*", cursor)) {
      cursor = cssCommentEnd(css, cursor, label);
      continue;
    }
    if (css[cursor] === '"' || css[cursor] === "'") {
      cursor = cssStringEnd(css, cursor, label);
      continue;
    }
    if (css[cursor] === "{") depth += 1;
    if (css[cursor] === "}") {
      depth -= 1;
      if (depth === 0) {
        return Object.freeze({
          contents: css.slice(offset + 1, cursor),
          offset: cursor + 1,
        });
      }
    }
    cursor += 1;
  }
  throw new TypeError(`${label} contains an unterminated CSS block.`);
}

function activeTopLevelFontFaceBlocks(
  css: string,
  label: string,
): readonly string[] {
  const blocks: string[] = [];
  let statementStart = 0;
  let cursor = 0;
  let parentheses = 0;
  let brackets = 0;
  while (cursor < css.length) {
    if (css.startsWith("/*", cursor)) {
      cursor = cssCommentEnd(css, cursor, label);
      continue;
    }
    if (css[cursor] === '"' || css[cursor] === "'") {
      cursor = cssStringEnd(css, cursor, label);
      continue;
    }
    if (css[cursor] === "(") parentheses += 1;
    if (css[cursor] === ")") parentheses -= 1;
    if (css[cursor] === "[") brackets += 1;
    if (css[cursor] === "]") brackets -= 1;
    if (parentheses < 0 || brackets < 0 || css[cursor] === "}") {
      throw new TypeError(`${label} contains unbalanced top-level CSS.`);
    }
    if (css[cursor] === "{" && parentheses === 0 && brackets === 0) {
      const prelude = cssWithoutComments(
        css.slice(statementStart, cursor),
        label,
      ).trim();
      const block = cssBlock(css, cursor, label);
      if (/^@font-face$/iu.test(prelude)) {
        blocks.push(block.contents);
      } else if (/^@font-face\b/iu.test(prelude)) {
        throw new TypeError(`${label} contains an invalid @font-face prelude.`);
      } else if (
        /@font-face\b/iu.test(cssWithoutComments(block.contents, label)) ||
        /\.woff2(?:[?#)'"\s]|$)/iu.test(
          cssWithoutComments(`${prelude}{${block.contents}}`, label),
        )
      ) {
        throw new TypeError(
          `${label} contains an unsupported nested or non-face WOFF2 source.`,
        );
      }
      cursor = block.offset;
      statementStart = cursor;
      continue;
    }
    if (css[cursor] === ";" && parentheses === 0 && brackets === 0) {
      const statement = cssWithoutComments(
        css.slice(statementStart, cursor),
        label,
      ).trim();
      if (/^@import\b/iu.test(statement)) {
        throw new TypeError(`${label} contains an unsupported @import rule.`);
      }
      statementStart = cursor + 1;
    }
    cursor += 1;
  }
  if (
    parentheses !== 0 ||
    brackets !== 0 ||
    cssWithoutComments(css.slice(statementStart), label).trim() !== ""
  ) {
    throw new TypeError(`${label} contains unterminated top-level CSS.`);
  }
  return Object.freeze(blocks);
}

type PublisherUnicodeRange = Readonly<{ start: number; end: number }>;

type PublisherCompiledFontFace = Readonly<{
  assetPath: string;
  family: string;
  style: "italic" | "normal";
  unicodeRanges: readonly PublisherUnicodeRange[];
  weight: string;
}>;

type PublisherParsedFontFaces = Readonly<{
  compiled: readonly PublisherCompiledFontFace[];
  fallbacks: readonly string[];
}>;

function fontFaceFamily(value: string | undefined, label: string): string {
  const match = value?.match(
    /^(?:"([^"\\]+)"|'([^'\\]+)'|([A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*))$/u,
  );
  const family = match?.[1] ?? match?.[2] ?? match?.[3];
  if (family === undefined) {
    throw new TypeError(`${label} has an invalid @font-face family.`);
  }
  return family;
}

function assertFontFaceDescriptorKeys(
  descriptors: ReadonlyMap<string, string>,
  expected: readonly string[],
  label: string,
): void {
  if (!isDeepStrictEqual([...descriptors.keys()].sort(), [...expected].sort())) {
    throw new TypeError(`${label} has an unsupported @font-face descriptor set.`);
  }
}

function unicodeRangeHasScalar(range: PublisherUnicodeRange): boolean {
  return range.start <= 0xd7ff || range.end >= 0xe000;
}

function parseUnicodeRanges(value: string, label: string): readonly PublisherUnicodeRange[] {
  const ranges = value.split(",").map((item) => item.trim());
  if (ranges.length === 0 || ranges.some((item) => item === "")) {
    throw new TypeError(`${label} has an invalid unicode-range descriptor.`);
  }
  return Object.freeze(
    ranges.map((item) => {
      const wildcard = item.match(/^U\+([0-9A-F]{0,5})(\?{1,6})$/iu);
      let start: number;
      let end: number;
      if (wildcard !== null && wildcard[1]!.length + wildcard[2]!.length <= 6) {
        start = Number.parseInt(`${wildcard[1]}${"0".repeat(wildcard[2]!.length)}`, 16);
        end = Number.parseInt(`${wildcard[1]}${"F".repeat(wildcard[2]!.length)}`, 16);
      } else {
        const explicit = item.match(
          /^U\+([0-9A-F]{1,6})(?:-([0-9A-F]{1,6}))?$/iu,
        );
        if (explicit === null) {
          throw new TypeError(`${label} has an invalid unicode-range descriptor.`);
        }
        start = Number.parseInt(explicit[1]!, 16);
        end = Number.parseInt(explicit[2] ?? explicit[1]!, 16);
      }
      const range = Object.freeze({ start, end });
      if (
        start > end ||
        end > 0x10ffff ||
        !unicodeRangeHasScalar(range)
      ) {
        throw new TypeError(`${label} has an unusable unicode-range descriptor.`);
      }
      return range;
    }),
  );
}

function percentageDescriptor(value: string | undefined): number | undefined {
  const match = value?.match(/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?%$/u);
  if (match === null || match === undefined) return undefined;
  const result = Number.parseFloat(value!);
  return Number.isFinite(result) && result <= 500 ? result : undefined;
}

function parseActiveFontFaces(
  css: string,
  cssPath: string,
): PublisherParsedFontFaces {
  const label = `Publisher home stylesheet ${cssPath}`;
  const compiled: PublisherCompiledFontFace[] = [];
  const fallbacks: string[] = [];
  for (const block of activeTopLevelFontFaceBlocks(css, label)) {
    if (block.includes("/*") || block.includes("{") || block.includes("}")) {
      throw new TypeError(`${label} has an unsupported @font-face shape.`);
    }
    const descriptors = new Map<string, string>();
    for (const rawDeclaration of block.split(";")) {
      const declaration = rawDeclaration.trim();
      if (declaration === "") continue;
      const separator = declaration.indexOf(":");
      const name = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (
        separator <= 0 ||
        !/^[a-z-]+$/u.test(name) ||
        value === "" ||
        descriptors.has(name)
      ) {
        throw new TypeError(`${label} has an invalid @font-face descriptor.`);
      }
      descriptors.set(name, value);
    }
    const family = fontFaceFamily(descriptors.get("font-family"), label);
    const source = descriptors.get("src");
    if (source === undefined) {
      throw new TypeError(`${label} has an incomplete @font-face rule.`);
    }
    if (!/\burl\s*\(/iu.test(source)) {
      assertFontFaceDescriptorKeys(
        descriptors,
        [
          "ascent-override",
          "descent-override",
          "font-family",
          "line-gap-override",
          "size-adjust",
          "src",
        ],
        label,
      );
      const ascentOverride = percentageDescriptor(
        descriptors.get("ascent-override"),
      );
      const descentOverride = percentageDescriptor(
        descriptors.get("descent-override"),
      );
      const lineGapOverride = percentageDescriptor(
        descriptors.get("line-gap-override"),
      );
      const sizeAdjust = percentageDescriptor(descriptors.get("size-adjust"));
      if (
        !/^local\(\s*(?:"Times New Roman"|'Times New Roman'|Times New Roman)\s*\)$/u.test(
          source,
        ) ||
        !family.endsWith("Fallback") ||
        ascentOverride === undefined ||
        ascentOverride <= 0 ||
        descentOverride === undefined ||
        descentOverride <= 0 ||
        lineGapOverride === undefined ||
        sizeAdjust === undefined ||
        sizeAdjust <= 0
      ) {
        throw new TypeError(`${label} has an invalid Next fallback font rule.`);
      }
      fallbacks.push(family);
      continue;
    }
    assertFontFaceDescriptorKeys(
      descriptors,
      [
        "font-display",
        "font-family",
        "font-style",
        "font-weight",
        "src",
        "unicode-range",
      ],
      label,
    );
    const sourceMatch = source.match(
      /^url\(\s*(?:"([^"\\]+)"|'([^'\\]+)'|([^\s)'"\\]+))\s*\)\s*format\(\s*(?:"woff2"|'woff2')\s*\)$/iu,
    );
    const style = descriptors.get("font-style");
    const weight = descriptors.get("font-weight");
    if (
      sourceMatch === null ||
      (style !== "normal" && style !== "italic") ||
      weight === undefined ||
      !/^(?:[1-9][0-9]{0,2}|1000)(?: (?:[1-9][0-9]{0,2}|1000))?$/u.test(weight) ||
      descriptors.get("font-display") !== "swap"
    ) {
      throw new TypeError(`${label} has an invalid compiled @font-face contract.`);
    }
    const weightParts = weight.split(" ").map(Number);
    if (weightParts.length === 2 && weightParts[0]! > weightParts[1]!) {
      throw new TypeError(`${label} has an invalid compiled font weight range.`);
    }
    compiled.push(
      Object.freeze({
        assetPath: normalizeFontAssetPath(
          (sourceMatch[1] ?? sourceMatch[2] ?? sourceMatch[3])!,
          cssPath,
        ),
        family,
        style,
        unicodeRanges: parseUnicodeRanges(
          descriptors.get("unicode-range")!,
          label,
        ),
        weight,
      }),
    );
  }
  return Object.freeze({
    compiled: Object.freeze(compiled),
    fallbacks: Object.freeze(fallbacks),
  });
}

function publisherThemeFontAssetPaths(
  stylesheets: readonly Readonly<{ path: string; text: string }>[],
): readonly string[] {
  return uniqueSortedPaths(
    stylesheets.flatMap(({ path: cssPath, text }) =>
      parseActiveFontFaces(text, cssPath).compiled.map(({ assetPath }) => assetPath),
    ).filter((assetPath, index, paths) => paths.indexOf(assetPath) === index),
    "Publisher home CSS font assets",
  );
}

export function verifyPublisherThemeFontArtifacts(input: Readonly<{
  homeHtml: string;
  homeStylesheets: readonly Readonly<{ path: string; text: string }>[];
  homeFonts: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
  nextRoot: string;
  readerFontFamilies: readonly Readonly<{ id: string; family: string }>[];
}>): PublisherThemeFontEvidence {
  const references = publisherThemeHomeAssetReferences(input.homeHtml);
  const stylesheetPaths = input.homeStylesheets.map(({ path: assetPath }) =>
    normalizeNextStaticAssetUrl(`/_next/${assetPath}`),
  );
  if (
    !isDeepStrictEqual(
      uniqueSortedPaths(stylesheetPaths, "Fetched Publisher home stylesheets"),
      references.stylesheets,
    )
  ) {
    throw new TypeError(
      "Fetched Publisher stylesheets do not match the home response.",
    );
  }
  const cssProjection = input.homeStylesheets
    .map(({ path: cssPath, text }) => {
      const artifactPath = normalizeNextStaticAssetUrl(`/_next/${cssPath}`);
      const diskBytes = readStableRegularFile(
        path.join(input.nextRoot, ...artifactPath.split("/")),
        "Publisher home stylesheet artifact",
        input.nextRoot,
        MAXIMUM_STYLESHEET_RESPONSE_BYTES,
      );
      const responseBytes = Buffer.from(text, "utf8");
      if (!diskBytes.equals(responseBytes)) {
        throw new TypeError(
          "Fetched Publisher stylesheet bytes differ from the built artifact.",
        );
      }
      return Object.freeze({
        path: artifactPath,
        bytes: diskBytes.byteLength,
        hash: sha256Bytes(diskBytes),
        text,
      });
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const compiledFaces: PublisherCompiledFontFace[] = [];
  const fallbackFamilies: string[] = [];
  for (const { path: cssPath, text: css } of cssProjection) {
    const parsed = parseActiveFontFaces(css, cssPath);
    compiledFaces.push(...parsed.compiled);
    fallbackFamilies.push(...parsed.fallbacks);
  }
  const manifestAssets = fontManifestRouteAssets(input.nextRoot);
  if (
    !isDeepStrictEqual(manifestAssets.home, references.fontPreloads) ||
    !isDeepStrictEqual(manifestAssets.proof, references.fontPreloads)
  ) {
    throw new TypeError(
      "The route-specific Next font manifest does not match the home preloads.",
    );
  }
  const expectedFamilies = input.readerFontFamilies
    .filter(({ id }) => PUBLISHER_THEME_COMPILED_FONT_IDS.includes(id as never))
    .map(({ id, family }) => {
      const stack = fontFamilyStack(family);
      if (stack.length !== 2) {
        throw new TypeError(
          `Publisher theme font ${id} must declare one compiled and one fallback family.`,
        );
      }
      return {
        id,
        family: stack[0]!,
        fallback: stack[1]!,
        weight:
          PUBLISHER_THEME_COMPILED_FONT_WEIGHTS[
            id as keyof typeof PUBLISHER_THEME_COMPILED_FONT_WEIGHTS
          ],
      };
    });
  if (
    expectedFamilies.length !== PUBLISHER_THEME_COMPILED_FONT_IDS.length ||
    expectedFamilies.some(({ weight }) => weight === undefined) ||
    new Set(expectedFamilies.flatMap(({ family, fallback }) => [family, fallback])).size !==
      expectedFamilies.length * 2
  ) {
    throw new TypeError("Publisher theme compiler proof requires five distinct compiled fonts.");
  }
  const compiledFamilies = uniqueSortedPaths(
    [...new Set(compiledFaces.map(({ family }) => family))],
    "Publisher home CSS compiled font families",
  );
  if (
    !isDeepStrictEqual(
      compiledFamilies,
      expectedFamilies.map(({ family }) => family).sort(),
    )
  ) {
    throw new TypeError("Publisher home CSS contains an unexpected compiled font family.");
  }
  if (
    !isDeepStrictEqual(
      uniqueSortedPaths(fallbackFamilies, "Publisher home CSS fallback font families"),
      expectedFamilies.map(({ fallback }) => fallback).sort(),
    )
  ) {
    throw new TypeError("Publisher home CSS does not contain the exact Next fallback rules.");
  }
  for (const expected of expectedFamilies) {
    const familyFaces = compiledFaces.filter(
      ({ family }) => family === expected.family,
    );
    if (
      !isDeepStrictEqual(
        [...new Set(familyFaces.map(({ style }) => style))].sort(),
        ["italic", "normal"],
      ) ||
      familyFaces.some(({ weight }) => weight !== expected.weight)
    ) {
      throw new TypeError(
        `Publisher theme font ${expected.id} does not match its reviewed style and weight contract.`,
      );
    }
  }
  const routeCssAssets = new Set(
    compiledFaces.map(({ assetPath }) => assetPath),
  );
  if (
    references.fontPreloads.some((relativePath) => !routeCssAssets.has(relativePath))
  ) {
    throw new TypeError(
      "Publisher home preloads a font absent from its delivered CSS.",
    );
  }
  const servedFontPaths = input.homeFonts.map(({ path: fontPath }) =>
    normalizeNextStaticAssetUrl(`/_next/${fontPath}`),
  );
  if (
    !isDeepStrictEqual(
      uniqueSortedPaths(servedFontPaths, "Fetched Publisher home fonts"),
      [...routeCssAssets].sort(),
    )
  ) {
    throw new TypeError(
      "Fetched Publisher fonts do not match every WOFF2 asset in the delivered CSS.",
    );
  }
  const servedFonts = new Map(
    input.homeFonts.map(({ path: fontPath, bytes }) => [
      normalizeNextStaticAssetUrl(`/_next/${fontPath}`),
      Buffer.from(bytes),
    ]),
  );
  const verifiedAssets = new Map<
    string,
    Readonly<{ bytes: Buffer; font: FontkitFont; hash: string }>
  >();
  for (const relativePath of [...routeCssAssets].sort()) {
    const diskBytes = readStableRegularFile(
      path.join(input.nextRoot, ...relativePath.split("/")),
      "Publisher theme font artifact",
      input.nextRoot,
      MAXIMUM_FONT_RESPONSE_BYTES,
    );
    if (!diskBytes.equals(servedFonts.get(relativePath) ?? Buffer.alloc(0))) {
      throw new TypeError(
        "Fetched Publisher font bytes differ from the built artifact.",
      );
    }
    verifiedAssets.set(
      relativePath,
      Object.freeze({
        bytes: diskBytes,
        font: validateWoff2(diskBytes, `Publisher theme font ${relativePath}`),
        hash: sha256Bytes(diskBytes),
      }),
    );
  }
  for (const face of compiledFaces) {
    const font = verifiedAssets.get(face.assetPath)?.font;
    let usable = false;
    if (font !== undefined) {
      for (const codePoint of font.characterSet) {
        if (
          !Number.isSafeInteger(codePoint) ||
          codePoint < 0 ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
          !face.unicodeRanges.some(
            ({ start, end }) => codePoint >= start && codePoint <= end,
          )
        ) {
          continue;
        }
        try {
          const glyph = font.glyphForCodePoint(codePoint);
          const run = font.layout(String.fromCodePoint(codePoint));
          if (
            Number.isSafeInteger(glyph.id) &&
            glyph.id > 0 &&
            run.glyphs.length > 0 &&
            run.positions.length === run.glyphs.length &&
            run.positions.every(({ xAdvance }) => Number.isFinite(xAdvance))
          ) {
            usable = true;
            break;
          }
        } catch {}
      }
    }
    if (!usable) {
      throw new TypeError(
        `Publisher theme font ${face.family} does not implement its declared unicode range.`,
      );
    }
  }
  const claimedPaths = new Map<string, string>();
  const claimedHashes = new Map<string, string>();
  const evidence = expectedFamilies.map(({ id, family }) => {
    const familyFaces = compiledFaces.filter((face) => face.family === family);
    const assets = [...new Set(familyFaces.map(({ assetPath }) => assetPath))].sort();
    if (assets.length === 0) {
      throw new TypeError(`Publisher theme font ${id} has no compiled WOFF2 asset.`);
    }
    if (!assets.some((relativePath) => references.fontPreloads.includes(relativePath))) {
      throw new TypeError(
        `Publisher theme font ${id} has no preload asset in the Next font manifest.`,
      );
    }
    return {
      id,
      family,
      faces: familyFaces
        .map(({ assetPath, style, unicodeRanges, weight }) => ({
          assetPath,
          style,
          unicodeRanges,
          weight,
        }))
        .sort((left, right) =>
          `${left.style}:${left.assetPath}`.localeCompare(
            `${right.style}:${right.assetPath}`,
          ),
        ),
      assets: assets.map((relativePath) => {
        const verified = verifiedAssets.get(relativePath);
        if (verified === undefined) {
          throw new TypeError(`Publisher theme font ${id} was not verified.`);
        }
        const { bytes, hash } = verified;
        const pathOwner = claimedPaths.get(relativePath);
        const hashOwner = claimedHashes.get(hash);
        if (
          (pathOwner !== undefined && pathOwner !== id) ||
          (hashOwner !== undefined && hashOwner !== id)
        ) {
          throw new TypeError(
            "Publisher compiled font families share one WOFF2 artifact.",
          );
        }
        claimedPaths.set(relativePath, id);
        claimedHashes.set(hash, id);
        return {
          path: relativePath,
          bytes: bytes.byteLength,
          hash,
          preloaded: references.fontPreloads.includes(relativePath),
        };
      }),
    };
  });
  const assetCount = new Set(
    evidence.flatMap(({ assets }) => assets.map(({ path: relativePath }) => relativePath)),
  ).size;
  if (assetCount < PUBLISHER_THEME_COMPILED_FONT_IDS.length) {
    throw new TypeError("Publisher theme compiler proof produced too few font assets.");
  }
  return Object.freeze({
    cssHash: hashJson(
      cssProjection.map(({ path: cssPath, bytes, hash }) => ({
        path: cssPath,
        bytes,
        hash,
      })),
    ),
    evidenceHash: hashJson({
      assets: evidence,
      routeManifest: manifestAssets,
      stylesheets: references.stylesheets,
    } as unknown as JSONValue),
    familyCount: evidence.length,
    assetCount,
    familyCensus: Object.freeze(
      evidence.map(({ id, faces, assets }) =>
        Object.freeze({
          id,
          faceCount: faces.length,
          assetCount: assets.length,
        }),
      ),
    ),
  });
}

const EXPECTED_COMPILED_FONT_FAMILY_CENSUS = Object.freeze([
  Object.freeze({ id: "literata", faceCount: 14, assetCount: 14 }),
  Object.freeze({ id: "source-serif", faceCount: 12, assetCount: 12 }),
  Object.freeze({ id: "newsreader", faceCount: 6, assetCount: 6 }),
  Object.freeze({ id: "cormorant", faceCount: 10, assetCount: 10 }),
  Object.freeze({ id: "fraunces", faceCount: 6, assetCount: 6 }),
]);

export function assertReviewedPublisherThemeFontEvidence(
  evidence: PublisherThemeFontEvidence,
): void {
  if (
    evidence.cssHash !== EXPECTED_COMPILED_CSS_HASH ||
    evidence.evidenceHash !== EXPECTED_FONT_EVIDENCE_HASH ||
    evidence.familyCount !== PUBLISHER_THEME_COMPILED_FONT_IDS.length ||
    evidence.assetCount !== EXPECTED_COMPILED_FONT_ASSET_COUNT ||
    !isDeepStrictEqual(
      evidence.familyCensus,
      EXPECTED_COMPILED_FONT_FAMILY_CENSUS,
    )
  ) {
    throw new TypeError(
      "Publisher theme font output differs from the exact reviewed CSS and WOFF2 census.",
    );
  }
}

function verifyRenderedThemeStyles(homeHtml: string, tokens: JsonRecord): void {
  const roots = htmlOpeningElements(homeHtml).filter(
    ({ attributes }) => attributes["data-publisher-page"] === "home",
  );
  if (roots.length !== 1) {
    throw new TypeError(
      "Publisher theme compiler proof requires exactly one Reader home root.",
    );
  }
  const root = roots[0]!;
  if (
    root.name !== "div" ||
    !(root.attributes.class ?? "").split(/\s+/u).includes("publisher-root") ||
    root.attributes.style === undefined ||
    root.hiddenByTree ||
    root.inertByTree
  ) {
    throw new TypeError("Publisher Reader home root has an invalid element contract.");
  }
  const color = asRecord(tokens.color, "Publisher theme color tokens");
  const typography = asRecord(
    tokens.typography,
    "Publisher theme typography tokens",
  );
  const layout = asRecord(tokens.layout, "Publisher theme layout tokens");
  const readerFamilies = typography.readerFontFamilies;
  if (!Array.isArray(readerFamilies)) {
    throw new TypeError("Publisher theme typography omitted Reader families.");
  }
  const defaultId = requiredString(
    typography,
    "defaultReaderFontFamilyId",
    "Publisher theme typography",
  );
  const defaultFamily = readerFamilies
    .map((item) => asRecord(item, "Reader font family"))
    .find((item) => item.id === defaultId);
  if (defaultFamily === undefined) {
    throw new TypeError("Publisher theme default Reader font is missing.");
  }
  const expected: Record<string, string> = {
    "--publisher-color-canvas": requiredString(
      color,
      "canvas",
      "Publisher theme color tokens",
    ),
    "--publisher-color-surface": requiredString(
      color,
      "surface",
      "Publisher theme color tokens",
    ),
    "--publisher-color-text": requiredString(
      color,
      "text",
      "Publisher theme color tokens",
    ),
    "--publisher-color-muted-text": requiredString(
      color,
      "mutedText",
      "Publisher theme color tokens",
    ),
    "--publisher-color-accent": requiredString(
      color,
      "accent",
      "Publisher theme color tokens",
    ),
    "--publisher-color-focus": requiredString(
      color,
      "focus",
      "Publisher theme color tokens",
    ),
    "--publisher-color-border": requiredString(
      color,
      "border",
      "Publisher theme color tokens",
    ),
    "--publisher-font-body": requiredString(
      typography,
      "bodyFamily",
      "Publisher theme typography",
    ),
    "--publisher-font-heading": requiredString(
      typography,
      "headingFamily",
      "Publisher theme typography",
    ),
    "--publisher-font-mono": requiredString(
      typography,
      "monoFamily",
      "Publisher theme typography",
    ),
    "--publisher-reader-default-font-family": requiredString(
      defaultFamily,
      "family",
      "Publisher theme default Reader font",
    ),
    "--publisher-font-size": requiredString(
      typography,
      "baseSize",
      "Publisher theme typography",
    ),
    "--publisher-line-height": String(typography.lineHeight),
    "--publisher-reading-measure": requiredString(
      layout,
      "readingMeasure",
      "Publisher theme layout",
    ),
    "--publisher-page-gutter": requiredString(
      layout,
      "pageGutter",
      "Publisher theme layout",
    ),
    "--publisher-section-gap": requiredString(
      layout,
      "sectionGap",
      "Publisher theme layout",
    ),
    "--publisher-control-radius": requiredString(
      layout,
      "controlRadius",
      "Publisher theme layout",
    ),
  };
  const schemes = asRecord(tokens.colorSchemes, "Publisher theme color schemes");
  for (const scheme of ["light", "dark", "black"] as const) {
    const palette = asRecord(schemes[scheme], `Publisher ${scheme} palette`);
    for (const [token, variable] of [
      ["canvas", "canvas"],
      ["surface", "surface"],
      ["text", "text"],
      ["mutedText", "muted-text"],
      ["accent", "accent"],
      ["focus", "focus"],
      ["border", "border"],
    ] as const) {
      expected[`--publisher-color-${scheme}-${variable}`] = requiredString(
        palette,
        token,
        `Publisher ${scheme} palette`,
      );
    }
  }
  const actual = parseStyleAttribute(root.attributes.style);
  if (
    !isDeepStrictEqual(Object.keys(actual).sort(), Object.keys(expected).sort()) ||
    !Object.entries(expected).every(([key, value]) => actual[key] === value)
  ) {
    throw new TypeError("Publisher home HTML omitted the exact configured theme style.");
  }
}

export function verifyPublisherThemeHostRuntime(input: Readonly<{
  fetched: PublisherThemeHostFetchResult;
  nextRoot: string;
  projection: PublisherThemeHostReaderProjection;
}>): PublisherThemeHostVerification {
  const probe = asRecord(input.fetched.probe, "Publisher theme proof payload");
  assertExactKeys(
    probe,
    [
      "applicationArtifact",
      "applicationManifest",
      "applicationStaticParamCount",
      "applicationTokens",
      "adaptedReaderHostVerified",
      "aggregateChapterPageParity",
      "baseRoutePresence",
      "configuredTokens",
      "contentParity",
      "currentPublicRoutes",
      "durableFragmentParity",
      "errorIdentityTokens",
      "fullReaderRouteParity",
      "homePath",
      "nestedFragmentParity",
      "offlineAudioClipCount",
      "offlineAudioEnvelopeResourceCount",
      "offlineAudioResourceCount",
      "offlineNarrationCatalogCount",
      "offlineTimingResourceCount",
      "proofSchemaVersion",
      "proofScope",
      "publicationId",
      "readerActiveRouteCount",
      "readerBuildId",
      "readerExplicitRedirectCount",
      "selectedTheme",
      "semanticLinkIds",
    ],
    "Publisher theme proof payload",
  );
  if (
    probe.proofSchemaVersion !== "2.0" ||
    probe.proofScope !== "isolated Next linkful theme compiler host" ||
    probe.contentParity !== "not asserted" ||
    probe.baseRoutePresence !== input.projection.baseRoutePresence ||
    probe.aggregateChapterPageParity !==
      input.projection.aggregateChapterPageParity ||
    probe.nestedFragmentParity !== input.projection.nestedFragmentParity ||
    probe.durableFragmentParity !== input.projection.durableFragmentParity ||
    probe.fullReaderRouteParity !== input.projection.fullReaderRouteParity ||
    probe.adaptedReaderHostVerified !== true ||
    probe.currentPublicRoutes !== "untouched" ||
    probe.publicationId !== input.projection.reader.publicationId ||
    probe.readerBuildId !== input.projection.reader.buildId ||
    probe.readerActiveRouteCount !==
      input.projection.routePlanStaticParamCount ||
    probe.readerExplicitRedirectCount !==
      input.projection.explicitRedirectCount ||
    probe.applicationStaticParamCount !==
      input.projection.applicationStaticParamCount ||
    !isDeepStrictEqual(
      probe.semanticLinkIds,
      input.projection.semanticLinks.map(({ id }) => id).sort(),
    ) ||
    probe.offlineAudioClipCount !== 0 ||
    probe.offlineAudioEnvelopeResourceCount !== 0 ||
    probe.offlineAudioResourceCount !== 0 ||
    probe.offlineTimingResourceCount !== 0 ||
    probe.offlineNarrationCatalogCount !== 0 ||
    input.fetched.audioArtifactStatus !== 404 ||
    probe.homePath !== homePath(input.projection.reader)
  ) {
    throw new TypeError("Publisher theme proof payload identity drifted.");
  }
  const selectedTheme = asRecord(probe.selectedTheme, "selected Publisher theme");
  assertExactKeys(selectedTheme, ["config", "package", "version"], "selected Publisher theme");
  if (
    selectedTheme.package !== EXPECTED_THEME_PACKAGE ||
    selectedTheme.version !== EXPECTED_THEME_VERSION
  ) {
    throw new TypeError("Publisher application did not select the Coherence theme.");
  }
  const applicationManifest = asRecord(
    probe.applicationManifest,
    "Publisher application manifest",
  );
  assertExactKeys(
    applicationManifest,
    [
      "$schema",
      "artifact",
      "buildId",
      "continuity",
      "engineVersion",
      "extensions",
      "publicationId",
      "readerStateBootstrap",
      "rendererVersion",
      "schemaVersion",
      "source",
      "sync",
      "theme",
      "updates",
    ],
    "Publisher application manifest",
  );
  if (
    applicationManifest.$schema !== PUBLISHER_NEXT_APPLICATION_SCHEMA_URL ||
    applicationManifest.schemaVersion !== PUBLISHER_NEXT_APPLICATION_SCHEMA_VERSION ||
    applicationManifest.publicationId !== input.projection.reader.publicationId ||
    applicationManifest.engineVersion !== EXPECTED_RENDERER_VERSION ||
    applicationManifest.rendererVersion !== EXPECTED_RENDERER_VERSION
  ) {
    throw new TypeError("Publisher application manifest identity drifted.");
  }
  const applicationContinuity = asRecord(
    applicationManifest.continuity,
    "Publisher application continuity manifest",
  );
  assertExactKeys(
    applicationContinuity,
    ["canonicalSlashRedirectCount", "explicitRedirectCount", "mode"],
    "Publisher application continuity manifest",
  );
  if (
    applicationContinuity.mode !== "proxy" ||
    applicationContinuity.explicitRedirectCount !==
      input.projection.explicitRedirectCount ||
    applicationContinuity.canonicalSlashRedirectCount !==
      input.projection.canonicalSlashRedirectCount
  ) {
    throw new TypeError("Publisher application continuity manifest drifted.");
  }
  if (
    applicationManifest.sync !== null ||
    applicationManifest.updates !== null ||
    applicationManifest.readerStateBootstrap !== null
  ) {
    throw new TypeError(
      "Publisher isolated application injected bootstrap, Updates, or sync state.",
    );
  }
  if (!isDeepStrictEqual(
    applicationManifest.extensions,
    input.projection.isolatedExtensionManifest,
  )) {
    throw new TypeError(
      "Publisher isolated application migration extension manifest drifted.",
    );
  }
  const applicationDescriptor = asRecord(
    applicationManifest.artifact,
    "Publisher application artifact descriptor",
  );
  assertExactKeys(
    applicationDescriptor,
    ["kind", "mediaType", "relativePath"],
    "Publisher application artifact descriptor",
  );
  if (
    applicationDescriptor.kind !== PUBLISHER_NEXT_APPLICATION_ARTIFACT_KIND ||
    applicationDescriptor.mediaType !==
      PUBLISHER_NEXT_APPLICATION_ARTIFACT_MEDIA_TYPE ||
    applicationDescriptor.relativePath !==
      PUBLISHER_NEXT_APPLICATION_ARTIFACT_RELATIVE_PATH
  ) {
    throw new TypeError("Publisher application artifact descriptor drifted.");
  }
  const applicationSource = asRecord(
    applicationManifest.source,
    "Publisher application source",
  );
  assertExactKeys(
    applicationSource,
    ["audience", "readerBuildId", "readerSchemaVersion"],
    "Publisher application source",
  );
  if (
    applicationSource.readerBuildId !== input.projection.reader.buildId ||
    applicationSource.readerSchemaVersion !==
      input.projection.reader.schemaVersion ||
    applicationSource.audience !== input.projection.reader.audience
  ) {
    throw new TypeError("Publisher application source identity drifted.");
  }
  const manifestTheme = asRecord(
    applicationManifest.theme,
    "Publisher application theme manifest",
  );
  assertExactKeys(
    manifestTheme,
    [
      "apiVersion",
      "configHash",
      "package",
      "rendererCompatibility",
      "tokensHash",
      "version",
    ],
    "Publisher application theme manifest",
  );
  if (
    manifestTheme.package !== EXPECTED_THEME_PACKAGE ||
    manifestTheme.version !== EXPECTED_THEME_VERSION ||
    manifestTheme.rendererCompatibility !==
      EXPECTED_THEME_RENDERER_COMPATIBILITY ||
    manifestTheme.apiVersion !== "2.0"
  ) {
    throw new TypeError("Publisher application theme manifest drifted.");
  }
  if (
    !isDeepStrictEqual(probe.applicationTokens, probe.configuredTokens) ||
    !isDeepStrictEqual(probe.applicationTokens, probe.errorIdentityTokens)
  ) {
    throw new TypeError("Publisher application and error theme tokens diverged.");
  }
  const applicationTokens = asRecord(
    probe.applicationTokens,
    "Publisher application theme tokens",
  );
  const typography = asRecord(
    applicationTokens.typography,
    "Publisher application typography",
  );
  const readerFontFamilies = typography.readerFontFamilies;
  if (!Array.isArray(readerFontFamilies)) {
    throw new TypeError("Publisher application typography omitted Reader font families.");
  }
  const fontRows = readerFontFamilies.map((item) =>
    asRecord(item, "Publisher Reader font family"),
  );
  if (
    !isDeepStrictEqual(
      fontRows.map(({ id }) => id),
      PUBLISHER_THEME_READER_FONT_IDS,
    ) ||
    typography.defaultReaderFontFamilyId !== "literata"
  ) {
    throw new TypeError("Publisher Reader font policy drifted.");
  }
  const expectedConfigHash = hashJson(selectedTheme.config as JSONValue);
  const expectedTokensHash = hashJson(applicationTokens as JSONValue);
  if (
    manifestTheme.configHash !== expectedConfigHash ||
    manifestTheme.tokensHash !== expectedTokensHash
  ) {
    throw new TypeError("Publisher theme manifest hashes do not match the served values.");
  }
  verifyRenderedThemeStyles(input.fetched.homeHtml, applicationTokens);
  const fontEvidence = verifyPublisherThemeFontArtifacts({
    homeHtml: input.fetched.homeHtml,
    homeStylesheets: input.fetched.homeStylesheets,
    homeFonts: input.fetched.homeFonts,
    nextRoot: input.nextRoot,
    readerFontFamilies: fontRows.map((row) => ({
      id: requiredString(row, "id", "Publisher Reader font family"),
      family: requiredString(row, "family", "Publisher Reader font family"),
    })),
  });
  const artifact = asRecord(probe.applicationArtifact, "Publisher application artifact");
  assertExactKeys(artifact, ["hash", "text"], "Publisher application artifact");
  const applicationArtifactHash = requiredSha256(
    artifact,
    "hash",
    "Publisher application artifact",
  );
  const applicationArtifactText = requiredString(
    artifact,
    "text",
    "Publisher application artifact",
  );
  if (sha256Bytes(applicationArtifactText) !== applicationArtifactHash) {
    throw new TypeError("Publisher application artifact hash does not match its text.");
  }
  const parsedArtifactManifest = asRecord(
    JSON.parse(applicationArtifactText),
    "Publisher application artifact text",
  );
  if (
    `${canonicalizeJson(parsedArtifactManifest as unknown as JSONValue)}\n` !==
      applicationArtifactText ||
    !isDeepStrictEqual(parsedArtifactManifest, applicationManifest)
  ) {
    throw new TypeError(
      "Publisher application artifact text does not encode the served manifest.",
    );
  }
  const applicationBuildId = requiredSha256(
    applicationManifest,
    "buildId",
    "Publisher application manifest",
  );
  const {
    $schema: ignoredSchema,
    buildId: ignoredBuildId,
    ...applicationBuildBasis
  } = applicationManifest;
  void ignoredSchema;
  void ignoredBuildId;
  if (hashJson(applicationBuildBasis as JSONValue) !== applicationBuildId) {
    throw new TypeError("Publisher application build identity does not match its basis.");
  }
  const contentVerification = verifyPublisherThemeLinkfulHostPages({
    fetched: input.fetched,
    projection: input.projection,
  });
  return Object.freeze({
    applicationBuildId,
    applicationArtifactHash,
    configHash: expectedConfigHash,
    tokensHash: expectedTokensHash,
    payloadHash: hashJson(probe as unknown as JSONValue),
    liveContentProjectionHash: contentVerification.projectionHash,
    offlineAudioEnvelopeResourceCount: 0 as const,
    verifiedHostPaths: contentVerification.verifiedPaths,
    verifiedHostPageEvidence: contentVerification.pageEvidence,
    fontEvidence,
  });
}

function assertGitIgnored(
  publicationRoot: string,
  prospectiveRunRoot: string,
): void {
  if (!fs.existsSync(GIT_PATH)) {
    throw new TypeError("Publisher theme compiler proof requires /usr/bin/git.");
  }
  const relative = path
    .relative(publicationRoot, prospectiveRunRoot)
    .split(path.sep)
    .join("/");
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  ) {
    throw new TypeError(
      "Publisher theme proof prospective run escaped the publication root.",
    );
  }
  const result = spawnSync(
    GIT_PATH,
    ["-C", publicationRoot, "check-ignore", "--quiet", "--", relative],
    {
      encoding: "utf8",
      env: publisherThemeGitEnvironment(),
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new TypeError(
      "Publisher theme proof prospective run must be ignored by Git.",
    );
  }
}

function publisherThemeGitEnvironment(): NodeJS.ProcessEnv {
  return {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    PATH: "/usr/bin:/bin",
  };
}

function runReadOnlyGit(args: readonly string[], label: string): Buffer {
  const result = spawnSync(
    GIT_PATH,
    ["-C", repoRoot, ...args],
    {
      encoding: "buffer",
      env: publisherThemeGitEnvironment(),
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new TypeError(`Publisher theme compiler proof could not inspect ${label}.`);
  }
  return result.stdout;
}

function ignoredRootProjection(
  absoluteRoot: string,
  relativeRoot: string,
  hashContents: boolean,
): JSONValue {
  if (!fs.existsSync(absoluteRoot)) {
    return { path: relativeRoot, state: "absent" };
  }
  const rootIdentity = directoryIdentity(
    absoluteRoot,
    `ignored Publisher theme authority ${relativeRoot}`,
  );
  if (hashContents) {
    return {
      path: relativeRoot,
      state: "present",
      files: fileProjection(absoluteRoot, walkFiles(absoluteRoot)),
    };
  }
  const entries: JSONValue[] = [];
  const visit = (directory: string, relativeDirectory: string): void => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolutePath, { bigint: true });
      if (stat.isSymbolicLink()) {
        throw new TypeError(
          `Ignored Publisher theme authority ${relativeRoot} contains a symbolic link.`,
        );
      }
      const base = {
        path: relativePath,
        device: stat.dev.toString(),
        inode: stat.ino.toString(),
        mode: stat.mode.toString(),
        links: stat.nlink.toString(),
        size: stat.size.toString(),
        modifiedNanoseconds: stat.mtimeNs.toString(),
        changedNanoseconds: stat.ctimeNs.toString(),
      };
      if (stat.isDirectory()) {
        entries.push({ ...base, kind: "directory" });
        visit(absolutePath, relativePath);
      } else if (stat.isFile() && stat.nlink.toString() === "1") {
        entries.push({ ...base, kind: "file" });
      } else {
        throw new TypeError(
          `Ignored Publisher theme authority ${relativeRoot} contains an unsupported entry.`,
        );
      }
    }
  };
  visit(rootIdentity.path, "");
  return {
    path: relativeRoot,
    state: "present",
    root: {
      device: String(rootIdentity.device),
      inode: String(rootIdentity.inode),
    },
    entries,
  };
}

export function assertPublisherThemeRuntimeArtifactEvidence(
  value: unknown,
): asserts value is readonly PublisherThemeRuntimeArtifactEvidence[] {
  if (!Array.isArray(value) || value.length !== 7) {
    throw new TypeError(
      "Publisher theme runtime artifact evidence must contain seven rows.",
    );
  }
  let totalBytes = 0;
  for (const [index, row] of value.entries()) {
    const record = asRecord(row, "Publisher theme runtime artifact evidence row");
    if (
      record.path !== PUBLISHER_THEME_RUNTIME_ARTIFACT_PATHS[index] ||
      (record.state !== "absent" && record.state !== "present")
    ) {
      throw new TypeError("Publisher theme runtime artifact evidence drifted.");
    }
    if (record.state === "absent") {
      assertExactKeys(
        record,
        ["path", "state"],
        "Publisher theme runtime artifact evidence row",
      );
      continue;
    }
    assertExactKeys(
      record,
      ["path", "state", "bytes", "hash"],
      "Publisher theme runtime artifact evidence row",
    );
    if (
      !Number.isSafeInteger(record.bytes) ||
      (record.bytes as number) < 0 ||
      (record.bytes as number) > MAXIMUM_RUNTIME_ARTIFACT_BYTES ||
      typeof record.hash !== "string" ||
      !/^sha256:[a-f0-9]{64}$/u.test(record.hash)
    ) {
      throw new TypeError("Publisher theme runtime artifact evidence drifted.");
    }
    totalBytes += record.bytes as number;
    if (totalBytes > MAXIMUM_RUNTIME_ARTIFACT_TOTAL_BYTES) {
      throw new TypeError(
        "Publisher theme runtime artifact evidence exceeded its aggregate limit.",
      );
    }
  }
}

function snapshotRuntimeArtifactParentChain(
  absoluteParent: string,
): readonly RuntimeArtifactParentIdentity[] {
  const absoluteRoot = path.resolve(repoRoot);
  const canonicalParent = path.resolve(absoluteParent);
  if (!isInside(canonicalParent, absoluteRoot)) {
    throw new TypeError(
      "Publisher theme runtime artifact parent escaped its authority root.",
    );
  }
  const relativeParent = path.relative(absoluteRoot, canonicalParent);
  const segments = relativeParent.split(path.sep).filter(Boolean);
  const candidates = [
    absoluteRoot,
    ...segments.map((_, index) =>
      path.join(absoluteRoot, ...segments.slice(0, index + 1))
    ),
  ];
  let missingAncestor = false;
  return Object.freeze(candidates.map((candidate) => {
    const relativePath = path.relative(absoluteRoot, candidate);
    const evidencePath = relativePath === ""
      ? "."
      : relativePath.split(path.sep).join("/");
    if (missingAncestor) {
      return Object.freeze({
        path: evidencePath,
        state: "absent" as const,
      });
    }
    let stat: fs.BigIntStats;
    try {
      stat = fs.lstatSync(candidate, { bigint: true });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        missingAncestor = true;
        return Object.freeze({
          path: evidencePath,
          state: "absent" as const,
        });
      }
      throw error;
    }
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      fs.realpathSync(candidate) !== candidate
    ) {
      throw new TypeError(
        "Publisher theme runtime artifact parent chain drifted.",
      );
    }
    return Object.freeze({
      path: evidencePath,
      state: "present" as const,
      device: stat.dev.toString(),
      inode: stat.ino.toString(),
      modifiedNanoseconds: stat.mtimeNs.toString(),
      changedNanoseconds: stat.ctimeNs.toString(),
    });
  }));
}

function readPublisherThemeRuntimeArtifact(
  absolutePath: string,
  expected: fs.BigIntStats,
): Readonly<{ bytes: Buffer; descriptorAfter: fs.BigIntStats }> {
  const descriptor = fs.openSync(
    absolutePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile() ||
      before.nlink.toString() !== "1" ||
      before.dev !== expected.dev ||
      before.ino !== expected.ino ||
      before.size !== expected.size ||
      before.mtimeNs !== expected.mtimeNs ||
      before.ctimeNs !== expected.ctimeNs ||
      before.size > BigInt(MAXIMUM_RUNTIME_ARTIFACT_BYTES) ||
      before.size > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new TypeError(
        "Publisher theme runtime artifact changed before it could be read.",
      );
    }
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const bytesRead = fs.readSync(
        descriptor,
        bytes,
        offset,
        Math.min(64 * 1024, bytes.byteLength - offset),
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const trailing = Buffer.alloc(1);
    const trailingBytesRead = fs.readSync(
      descriptor,
      trailing,
      0,
      1,
      bytes.byteLength,
    );
    const descriptorAfter = fs.fstatSync(descriptor, { bigint: true });
    if (
      offset !== bytes.byteLength ||
      trailingBytesRead !== 0 ||
      descriptorAfter.dev !== before.dev ||
      descriptorAfter.ino !== before.ino ||
      descriptorAfter.size !== before.size ||
      descriptorAfter.mtimeNs !== before.mtimeNs ||
      descriptorAfter.ctimeNs !== before.ctimeNs ||
      descriptorAfter.nlink !== before.nlink
    ) {
      throw new TypeError(
        "Publisher theme runtime artifact changed while it was read.",
      );
    }
    return Object.freeze({ bytes, descriptorAfter });
  } finally {
    fs.closeSync(descriptor);
  }
}

function snapshotRuntimeArtifacts(): RuntimeArtifactSnapshot {
  const evidence: PublisherThemeRuntimeArtifactEvidence[] = [];
  const ownership: RuntimeArtifactOwnership[] = [];
  let totalBytes = 0;
  for (const relativePath of PUBLISHER_THEME_RUNTIME_ARTIFACT_PATHS) {
    if (
      path.posix.isAbsolute(relativePath) ||
      relativePath.includes("\\") ||
      relativePath.split("/").some((segment) =>
        segment.length === 0 || segment === "." || segment === ".."
      )
    ) {
      throw new TypeError("Publisher theme runtime artifact path drifted.");
    }
    const absolutePath = path.join(repoRoot, ...relativePath.split("/"));
    const parentPath = path.posix.dirname(relativePath);
    const absoluteParent = path.dirname(absolutePath);
    requireDirectoryPathWithoutSymbols(
      repoRoot,
      absoluteParent,
      "Publisher theme runtime artifact",
    );
    const parentChainBefore = snapshotRuntimeArtifactParentChain(
      absoluteParent,
    );
    let fileBefore: fs.BigIntStats;
    try {
      fileBefore = fs.lstatSync(absolutePath, { bigint: true });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        const parentChainAfter = snapshotRuntimeArtifactParentChain(
          absoluteParent,
        );
        if (!isDeepStrictEqual(parentChainBefore, parentChainAfter)) {
          throw new TypeError(
            "Publisher theme runtime artifact parent changed while absence was inspected.",
          );
        }
        evidence.push(Object.freeze({
          path: relativePath,
          state: "absent" as const,
        }));
        ownership.push(Object.freeze({
          path: relativePath,
          state: "absent" as const,
          parentChain: parentChainAfter,
        }));
        continue;
      }
      throw error;
    }
    if (fs.realpathSync(absoluteParent) !== absoluteParent) {
      throw new TypeError(
        "Publisher theme runtime artifact parent identity drifted.",
      );
    }
    const parentBefore = fs.lstatSync(absoluteParent, { bigint: true });
    if (
      !parentBefore.isDirectory() ||
      parentBefore.isSymbolicLink() ||
      !fileBefore.isFile() ||
      fileBefore.isSymbolicLink() ||
      fileBefore.nlink.toString() !== "1"
    ) {
      throw new TypeError("Publisher theme runtime artifact ownership drifted.");
    }
    const { bytes, descriptorAfter } = readPublisherThemeRuntimeArtifact(
      absolutePath,
      fileBefore,
    );
    const fileAfter = fs.lstatSync(absolutePath, { bigint: true });
    const parentAfter = fs.lstatSync(absoluteParent, { bigint: true });
    const parentChainAfter = snapshotRuntimeArtifactParentChain(
      absoluteParent,
    );
    if (
      fileBefore.dev !== fileAfter.dev ||
      fileBefore.ino !== fileAfter.ino ||
      fileBefore.size !== fileAfter.size ||
      fileBefore.mtimeNs !== fileAfter.mtimeNs ||
      fileBefore.ctimeNs !== fileAfter.ctimeNs ||
      descriptorAfter.dev !== fileAfter.dev ||
      descriptorAfter.ino !== fileAfter.ino ||
      descriptorAfter.size !== fileAfter.size ||
      descriptorAfter.mtimeNs !== fileAfter.mtimeNs ||
      descriptorAfter.ctimeNs !== fileAfter.ctimeNs ||
      parentBefore.dev !== parentAfter.dev ||
      parentBefore.ino !== parentAfter.ino ||
      !isDeepStrictEqual(parentChainBefore, parentChainAfter)
    ) {
      throw new TypeError(
        "Publisher theme runtime artifact changed while it was inspected.",
      );
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAXIMUM_RUNTIME_ARTIFACT_TOTAL_BYTES) {
      throw new TypeError(
        "Publisher theme runtime artifact transaction exceeded its limit.",
      );
    }
    evidence.push(Object.freeze({
      path: relativePath,
      state: "present" as const,
      bytes: bytes.byteLength,
      hash: sha256Bytes(bytes),
    }));
    ownership.push(Object.freeze({
      path: relativePath,
      state: "present" as const,
      parentChain: parentChainAfter,
      fileDevice: fileAfter.dev.toString(),
      fileInode: fileAfter.ino.toString(),
      fileModifiedNanoseconds: fileAfter.mtimeNs.toString(),
      fileChangedNanoseconds: fileAfter.ctimeNs.toString(),
      parentPath,
      parentDevice: parentAfter.dev.toString(),
      parentInode: parentAfter.ino.toString(),
    }));
  }
  assertPublisherThemeRuntimeArtifactEvidence(evidence);
  return Object.freeze({
    evidence: Object.freeze(evidence),
    evidenceHash: hashJson(evidence as unknown as JSONValue),
    ownership: Object.freeze(ownership),
  });
}

function gitSourceState(): Buffer {
  const head = runReadOnlyGit(
    ["rev-parse", "--verify", "HEAD"],
    "the Git HEAD identity",
  );
  const tree = runReadOnlyGit(
    ["rev-parse", "--verify", "HEAD^{tree}"],
    "the Git tree identity",
  );
  const symbolicRef = runReadOnlyGit(
    ["rev-parse", "--symbolic-full-name", "HEAD"],
    "the Git symbolic ref",
  );
  const status = runReadOnlyGit(
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    "Git status",
  );
  const unstaged = runReadOnlyGit(
    ["diff", "--binary", "--no-ext-diff", "--no-textconv", "--", "."],
    "the unstaged Git diff",
  );
  const staged = runReadOnlyGit(
    [
      "diff",
      "--cached",
      "--binary",
      "--no-ext-diff",
      "--no-textconv",
      "--",
      ".",
    ],
    "the staged Git diff",
  );
  const untrackedList = runReadOnlyGit(
    ["ls-files", "--others", "--exclude-standard", "-z"],
    "untracked source files",
  );
  const untrackedPaths = untrackedList
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  const untracked = untrackedPaths.map((relativePath) => {
    if (
      path.posix.isAbsolute(relativePath) ||
      relativePath.includes("\\") ||
      relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
    ) {
      throw new TypeError("Publisher theme proof found an unsafe untracked path.");
    }
    const bytes = readStableRegularFile(
      path.join(repoRoot, ...relativePath.split("/")),
      "untracked Publisher theme source",
      repoRoot,
    );
    return Object.freeze({
      path: relativePath,
      bytes: bytes.byteLength,
      hash: sha256Bytes(bytes),
    });
  });
  return Buffer.from(
    canonicalizeJson({
      staged: { bytes: staged.byteLength, hash: sha256Bytes(staged) },
      head: { bytes: head.byteLength, hash: sha256Bytes(head) },
      ignored: [
        ignoredRootProjection(
          path.join(generatedPublisherRoot, "host"),
          "generated/publisher/host",
          true,
        ),
      ],
      status: { bytes: status.byteLength, hash: sha256Bytes(status) },
      symbolicRef: {
        bytes: symbolicRef.byteLength,
        hash: sha256Bytes(symbolicRef),
      },
      tree: { bytes: tree.byteLength, hash: sha256Bytes(tree) },
      unstaged: { bytes: unstaged.byteLength, hash: sha256Bytes(unstaged) },
      untracked,
    }),
    "utf8",
  );
}

function authorityProjection(): JSONValue {
  const rows: JSONValue[] = [];
  for (const relativePath of PUBLISHER_THEME_SOURCE_AUTHORITY_PATHS) {
    const absolutePath = path.join(repoRoot, ...relativePath.split("/"));
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new TypeError("Publisher theme source authority must not be a symbolic link.");
    }
    if (stat.isFile()) {
      const bytes = readStableRegularFile(
        absolutePath,
        "Publisher theme source authority",
        repoRoot,
      );
      rows.push({ path: relativePath, bytes: bytes.byteLength, hash: sha256Bytes(bytes) });
    } else if (stat.isDirectory()) {
      rows.push({
        path: relativePath,
        files: fileProjection(absolutePath, walkFiles(absolutePath)),
      });
    } else {
      throw new TypeError("Publisher theme source authority must be a file or directory.");
    }
  }
  return rows;
}

function snapshotExternalState(themeSourcePath: string): ExternalStateSnapshot {
  const sourceState = gitSourceState();
  const runtimeArtifacts = snapshotRuntimeArtifacts();
  const themeBytes = readStableRegularFile(
    themeSourcePath,
    "Coherence Publisher theme source",
    repoRoot,
  );
  return Object.freeze({
    authorityHash: hashJson(authorityProjection()),
    gitSourceState: sourceState,
    gitSourceStateHash: sha256Bytes(sourceState),
    ignoredState: Buffer.from(
      canonicalizeJson([
        ignoredRootProjection(path.join(repoRoot, ".next"), ".next", false),
        ignoredRootProjection(
          path.join(generatedPublisherRoot, "host"),
          "generated/publisher/host",
          false,
        ),
      ]),
      "utf8",
    ),
    runtimeArtifacts,
    themeSourceHash: sha256Bytes(themeBytes),
  });
}

function assertExternalStateUnchanged(
  before: ExternalStateSnapshot,
  after: ExternalStateSnapshot,
): void {
  if (
    before.authorityHash !== after.authorityHash ||
    before.themeSourceHash !== after.themeSourceHash ||
    !before.ignoredState.equals(after.ignoredState) ||
    !before.gitSourceState.equals(after.gitSourceState) ||
    !isDeepStrictEqual(
      before.runtimeArtifacts,
      after.runtimeArtifacts,
    )
  ) {
    throw new TypeError("Publisher theme compiler proof changed repository source state.");
  }
}

type DirectoryIdentity = Readonly<{
  path: string;
  realPath: string;
  device: number;
  inode: number;
}>;

function directoryIdentity(directory: string, label: string): DirectoryIdentity {
  const absolutePath = path.resolve(directory);
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new TypeError(`${label} must remain one real directory.`);
  }
  return Object.freeze({
    path: absolutePath,
    realPath: fs.realpathSync(absolutePath),
    device: stat.dev,
    inode: stat.ino,
  });
}

function assertDirectoryIdentityCurrent(
  expected: DirectoryIdentity,
  label: string,
): void {
  const actual = directoryIdentity(expected.path, label);
  if (
    actual.realPath !== expected.realPath ||
    actual.device !== expected.device ||
    actual.inode !== expected.inode
  ) {
    throw new TypeError(`${label} changed identity.`);
  }
}

function removeExactRunRoot(
  run: DirectoryIdentity,
  proof: DirectoryIdentity,
): void {
  const absoluteRunRoot = run.path;
  const absoluteProofRoot = proof.path;
  if (
    path.dirname(absoluteRunRoot) !== absoluteProofRoot ||
    !/^run-[a-z0-9]+$/u.test(path.basename(absoluteRunRoot))
  ) {
    throw new TypeError("Publisher theme proof refused an unsafe cleanup target.");
  }
  assertDirectoryIdentityCurrent(proof, "Publisher theme proof root");
  assertDirectoryIdentityCurrent(run, "Publisher theme proof run root");
  if (!isStrictlyInside(run.realPath, proof.realPath)) {
    throw new TypeError("Publisher theme proof cleanup target escaped its root.");
  }
  fs.rmSync(absoluteRunRoot, { force: true, recursive: true });
}

export async function withDisposablePublisherThemeHost<T>(input: Readonly<{
  boundary: PublisherThemeHostProofBoundary;
  operation: (
    roots: Readonly<{
      hostRoot: string;
      runRoot: string;
      runtimeRoot: string;
    }>,
  ) => Promise<T> | T;
}>): Promise<T> {
  assertPublisherThemeHostProofBoundary(input.boundary);
  const runRoot = path.join(
    input.boundary.proofRoot,
    `run-${randomBytes(12).toString("hex")}`,
  );
  assertGitIgnored(input.boundary.publicationRoot, runRoot);
  fs.mkdirSync(input.boundary.proofRoot, { mode: 0o700, recursive: true });
  assertPublisherThemeHostProofBoundary(input.boundary);
  const proofIdentity = directoryIdentity(
    input.boundary.proofRoot,
    "Publisher theme proof root",
  );
  let runIdentity: DirectoryIdentity | undefined;
  try {
    fs.mkdirSync(runRoot, { mode: 0o700 });
    fs.chmodSync(runRoot, 0o700);
    runIdentity = directoryIdentity(runRoot, "Publisher theme proof run root");
    if (!isStrictlyInside(runIdentity.realPath, proofIdentity.realPath)) {
      throw new TypeError("Publisher theme proof run root escaped its dedicated root.");
    }
    const hostRoot = path.join(runRoot, "host");
    const runtimeRoot = path.join(runRoot, "runtime");
    fs.mkdirSync(hostRoot, { mode: 0o700 });
    fs.mkdirSync(path.join(runtimeRoot, "home"), { mode: 0o700, recursive: true });
    fs.mkdirSync(path.join(runtimeRoot, "tmp"), { mode: 0o700 });
    fs.mkdirSync(path.join(runtimeRoot, "cache"), { mode: 0o700 });
    return await input.operation(
      Object.freeze({ hostRoot, runRoot, runtimeRoot }),
    );
  } finally {
    if (runIdentity !== undefined) {
      removeExactRunRoot(runIdentity, proofIdentity);
    }
  }
}

function preparePublisherThemeProofRoot(
  boundary: PublisherThemeHostProofBoundary,
): void {
  assertPublisherThemeHostProofBoundary(boundary);
  assertGitIgnored(
    boundary.publicationRoot,
    path.join(boundary.proofRoot, "run-authority-probe"),
  );
  fs.mkdirSync(boundary.proofRoot, { mode: 0o700, recursive: true });
  assertPublisherThemeHostProofBoundary(boundary);
  directoryIdentity(boundary.proofRoot, "Publisher theme proof root");
}

async function withPublisherThemeProofInterruption<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const interrupt = (): void => {
    controller.abort(new Error("Publisher theme compiler proof was interrupted."));
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    return await operation(controller.signal);
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}

function expectedReaderArtifactPaths(): readonly string[] {
  return Object.freeze([
    PUBLISHER_NEXT_READER_DATA_PATH,
    PUBLISHER_NEXT_SEARCH_DATA_PATH,
    PUBLISHER_NEXT_PROGRESS_DATA_PATH,
    PUBLISHER_NEXT_PUBLIC_IDENTITY_DATA_PATH,
  ]);
}

export function assertPublisherThemeCurrentTransitionBoundary(
  application: CoherencePublisherContentProof["application"],
): PublisherThemeCurrentTransitionBoundary {
  const facade = createCoherencePublisherTransitionPreviewApplication(
    application,
  );
  const exposedApplicationKeys = Reflect.ownKeys(facade);
  if (
    !Object.isFrozen(coherencePublisherTransitionPreviewBoundary) ||
    !Object.isFrozen(
      coherencePublisherTransitionPreviewBoundary.exposedApplicationKeys,
    ) ||
    !Object.isFrozen(facade) ||
    !isDeepStrictEqual(
      exposedApplicationKeys,
      coherencePublisherTransitionPreviewBoundary.exposedApplicationKeys,
    ) ||
    Object.hasOwn(facade, "ReaderPrepaint") ||
    Object.hasOwn(facade, "ReaderProviders") ||
    Object.hasOwn(facade, "RootLayout") ||
    Object.hasOwn(facade, "RootPage") ||
    Object.hasOwn(facade, "renderPage") ||
    facade.renderEmbeddedPage !== application.renderEmbeddedPage ||
    facade.resolveRoute !== application.resolveRoute
  ) {
    throw new TypeError(
      "Publisher current transition preview boundary drifted.",
    );
  }
  return Object.freeze({
    proofScope: "current Coherence Publisher transition preview facade" as const,
    exposedApplicationKeys:
      coherencePublisherTransitionPreviewBoundary.exposedApplicationKeys,
    facadeFrozen: true as const,
    readerProvidersExposed:
      coherencePublisherTransitionPreviewBoundary.readerProvidersExposed,
    rootLayoutExposed:
      coherencePublisherTransitionPreviewBoundary.rootLayoutExposed,
    providerComposition: "excluded-by-transition-facade" as const,
    isolatedHostEvidenceUsed: false as const,
  });
}

function publisherThemeUpdatesDormancyEvidence(
  reader: PublicationReaderEnvelope,
): PublisherThemeUpdatesDormancyEvidence {
  const proof = verifyCoherencePublisherUpdatesDormancy(reader);
  if (
    proof.identities.catalogTextSha256 !==
      EXPECTED_UPDATES_CATALOG_TEXT_HASH ||
    proof.identities.updatesDataTextSha256 !==
      EXPECTED_UPDATES_DATA_TEXT_HASH
  ) {
    throw new TypeError("Publisher dormant Updates identity drifted.");
  }
  return Object.freeze({
    catalogTextHash: proof.identities.catalogTextSha256,
    updatesDataTextHash: proof.identities.updatesDataTextSha256,
    ...proof.boundary,
    injectedIntoIsolatedHost: false as const,
  });
}

function publisherThemeSectionHref(
  section: PublicationReaderEnvelope["works"][number]["sections"][number],
): string {
  if (section.readerAddress === null) {
    throw new TypeError(
      `Publisher theme section '${section.id}' has no Reader address.`,
    );
  }
  const { path: sectionPath, anchor } = section.readerAddress;
  return `${sectionPath}${anchor === undefined ? "" : `#${anchor}`}`;
}

function assertPublisherThemeFrozenContentEvidence(
  proof: CoherencePublisherContentProof,
): void {
  const { evidence } = proof;
  const { evidenceSha256, ...currentEvidenceBasis } = evidence;
  if (
    hashJson(currentEvidenceBasis as unknown as JSONValue) !== evidenceSha256 ||
    evidence.integration.proofOnly !== true ||
    evidence.integration.wiredToHostRoutes !== false ||
    evidence.integration.appWiringApproved !== false
  ) {
    throw new TypeError(
      "Publisher theme host received drifted standalone content evidence.",
    );
  }
  if (
    proof.content.buildId !== evidence.identities.finalContentBuildId ||
    proof.reader.buildId !== evidence.identities.finalReaderBuildId ||
    proof.application.manifest.buildId !==
      evidence.identities.finalApplicationBuildId ||
    proof.application.reader.buildId !== proof.reader.buildId ||
    proof.content.buildId !== EXPECTED_CONTENT_BUILD_ID ||
    proof.reader.buildId !== EXPECTED_READER_BUILD_ID
  ) {
    throw new TypeError(
      "Publisher theme host received inconsistent adapted build identities.",
    );
  }
  if (
    proof.application.manifest.buildId !==
      EXPECTED_CURRENT_ADAPTED_APPLICATION_BUILD_ID ||
    evidenceSha256 !== EXPECTED_CURRENT_CONTENT_EVIDENCE_HASH
  ) {
    throw new TypeError(
      "Publisher theme host received drifted current content evidence tuple.",
    );
  }

  /* The current candidate supplies the transition functions, while the real
     compiled host receipt remains the earlier reviewed artifact. Project only
     the candidate's self-identifying application build field back to that
     frozen receipt, then require every other evidence byte to reproduce it. */
  const frozenEvidenceBasis = Object.freeze({
    ...currentEvidenceBasis,
    identities: Object.freeze({
      ...currentEvidenceBasis.identities,
      finalApplicationBuildId:
        EXPECTED_HISTORICAL_ADAPTED_APPLICATION_BUILD_ID,
    }),
  });
  if (
    hashJson(frozenEvidenceBasis as unknown as JSONValue) !==
      EXPECTED_HISTORICAL_CONTENT_EVIDENCE_HASH
  ) {
    throw new TypeError(
      "Publisher theme host received drifted frozen content evidence.",
    );
  }
}

export function createPublisherThemeHostReaderProjection(
  proof: CoherencePublisherContentProof,
): PublisherThemeHostReaderProjection {
  assertPublisherThemeFrozenContentEvidence(proof);
  const { evidence } = proof;
  const readerActivePaths = proof.reader.routes.active.map(
    ({ path: routePath }) => routePath,
  );
  if (
    evidence.routes.finalAbsentReaderBasePathCount !==
      EXPECTED_ABSENT_READER_BASE_PATH_COUNT ||
    evidence.routes.finalMissingReaderFragmentHrefCount !==
      EXPECTED_MISSING_READER_FRAGMENT_HREF_COUNT ||
    evidence.routes.baseRoutePresence !== true ||
    evidence.routes.aggregateChapterPageParity !== true ||
    evidence.routes.nestedFragmentParity !== false ||
    evidence.routes.durableFragmentParity !== false ||
    evidence.routes.fullReaderRouteParity !== false ||
    evidence.routes.finalActiveRouteCount !== EXPECTED_ACTIVE_ROUTE_COUNT ||
    evidence.routes.redirectCount !== EXPECTED_EXPLICIT_REDIRECT_COUNT ||
    evidence.projections.routePlanStaticParamCount !==
      EXPECTED_ROUTE_PLAN_STATIC_PARAM_COUNT ||
    evidence.projections.applicationStaticParamCount !==
      EXPECTED_APPLICATION_STATIC_PARAM_COUNT ||
    evidence.projections.explicitRedirectCount !==
      EXPECTED_EXPLICIT_REDIRECT_COUNT ||
    evidence.projections.canonicalSlashRedirectCount !==
      EXPECTED_CANONICAL_SLASH_REDIRECT_COUNT ||
    evidence.projections.routePlanActivePathsSha256 !==
      EXPECTED_ROUTE_PLAN_ACTIVE_PATHS_HASH ||
    evidence.projections.routePlanStaticParamsSha256 !==
      EXPECTED_ROUTE_PLAN_STATIC_PARAMS_HASH ||
    evidence.projections.applicationStaticParamsSha256 !==
      EXPECTED_APPLICATION_STATIC_PARAMS_HASH ||
    proof.routePlan.staticParams.length !==
      EXPECTED_ROUTE_PLAN_STATIC_PARAM_COUNT ||
    proof.application.staticParams.length !==
      EXPECTED_APPLICATION_STATIC_PARAM_COUNT ||
    proof.reader.routes.active.length !==
      EXPECTED_ACTIVE_ROUTE_COUNT ||
    proof.reader.routes.redirects.length !==
      EXPECTED_EXPLICIT_REDIRECT_COUNT ||
    !isDeepStrictEqual(readerActivePaths, proof.routePlan.activePaths) ||
    hashJson(readerActivePaths as unknown as JSONValue) !==
      EXPECTED_ROUTE_PLAN_ACTIVE_PATHS_HASH ||
    hashJson(proof.reader.routes.active as unknown as JSONValue) !==
      EXPECTED_READER_ACTIVE_ROUTES_HASH ||
    proof.application.manifest.continuity.explicitRedirectCount !==
      EXPECTED_EXPLICIT_REDIRECT_COUNT ||
    proof.application.manifest.continuity.canonicalSlashRedirectCount !==
      EXPECTED_CANONICAL_SLASH_REDIRECT_COUNT ||
    hashJson(proof.routePlan.activePaths as unknown as JSONValue) !==
      EXPECTED_ROUTE_PLAN_ACTIVE_PATHS_HASH ||
    hashJson(proof.routePlan.staticParams as unknown as JSONValue) !==
      EXPECTED_ROUTE_PLAN_STATIC_PARAMS_HASH ||
    hashJson(proof.application.staticParams as unknown as JSONValue) !==
      EXPECTED_APPLICATION_STATIC_PARAMS_HASH ||
    hashJson(proof.reader.routes.redirects as unknown as JSONValue) !==
      EXPECTED_REDIRECT_TUPLES_HASH
  ) {
    throw new TypeError(
      "Publisher theme host received drifted adapted route evidence.",
    );
  }
  if (!isDeepStrictEqual(
    evidence.routes.currentCatalogFragmentCoverage,
    {
      proofScope: "adapted-reader-current-catalog-section-fragments",
      status: "verified",
      baselineMissingReaderFragmentHrefCount: 153,
      assignedCatalogFragmentAddressCount: 153,
      finalMissingReaderFragmentHrefCount: 0,
      chapterOwnerPageCount: 46,
      ownerSectionCount: 46,
      directDescendantSectionCount: 107,
      serverRenderedDomIdCount: 153,
      assignedCatalogFragmentAddressesSha256:
        "sha256:276f0d71904e0a394e12db1222ebfb12b739c1951a7d6d13b654f41c957dd5b0",
      serverRenderedCatalogFragmentAddressesSha256:
        "sha256:438370bb39c3e66f67f8f63a4849bf08e958ae1a365bda98b8e016e33ee341ba",
      excludedClaims: [
        "durable-continuity",
        "aggregate-index-routes",
        "current-host-wiring",
        "legacy-aliases-and-fragments",
        "browser-fragment-scroll",
        "offline-all-work-behavior",
        "ux-and-content-parity",
      ],
    },
  )) {
    throw new TypeError(
      "Publisher theme host received drifted current catalog fragment coverage.",
    );
  }
  const sectionIndexPaths = evidence.routes.sectionIndexes.map(
    ({ path: sectionIndexPath }) => sectionIndexPath,
  );
  if (
    evidence.routes.sectionIndexCount !== EXPECTED_SECTION_INDEX_COUNT ||
    evidence.routes.sectionIndexReferenceCount !==
      EXPECTED_SECTION_INDEX_REFERENCE_COUNT ||
    evidence.routes.sectionIndexes.length !== EXPECTED_SECTION_INDEX_COUNT ||
    evidence.routes.sectionIndexesSha256 !== EXPECTED_SECTION_INDEXES_HASH ||
    hashJson(evidence.routes.sectionIndexes as unknown as JSONValue) !==
      EXPECTED_SECTION_INDEXES_HASH ||
    !isDeepStrictEqual(sectionIndexPaths, EXPECTED_SECTION_INDEX_PATHS) ||
    hashJson(sectionIndexPaths as unknown as JSONValue) !==
      EXPECTED_SECTION_INDEX_PATHS_HASH
  ) {
    throw new TypeError(
      "Publisher theme host received drifted section index evidence.",
    );
  }
  const sectionIndexes = evidence.routes.sectionIndexes.map((index) => {
    const route = proof.reader.routes.active.find(
      ({ path: routePath }) => routePath === index.path,
    );
    const work = proof.reader.works.find(({ id }) => id === index.workId);
    const sections = index.sectionIds.map((sectionId) =>
      work?.sections.find(({ id }) => id === sectionId)
    );
    const resolution = proof.application.resolveRoute(
      index.path.slice(1, -1).split("/"),
    );
    if (
      route === undefined ||
      !isDeepStrictEqual(route.target, {
        kind: "section-index",
        id: index.id,
        title: index.title,
        workId: index.workId,
        sectionIds: index.sectionIds,
      }) ||
      work === undefined ||
      sections.some((section) => section === undefined) ||
      resolution.status !== "resolved" ||
      resolution.page.kind !== "section-index" ||
      resolution.page.id !== index.id ||
      resolution.page.title !== index.title ||
      resolution.page.path !== index.path ||
      resolution.page.work.id !== index.workId ||
      !isDeepStrictEqual(
        resolution.page.sections.map(({ id }) => id),
        index.sectionIds,
      )
    ) {
      throw new TypeError(
        `Publisher theme host could not bind section index '${index.id}'.`,
      );
    }
    return Object.freeze({
      id: index.id,
      title: index.title,
      path: index.path,
      workId: index.workId,
      sections: Object.freeze(sections.map((section) => {
        if (section === undefined) {
          throw new TypeError(
            `Publisher theme host section index '${index.id}' lost a section.`,
          );
        }
        return Object.freeze({
          id: section.id,
          title: section.title,
          href: publisherThemeSectionHref(section),
        });
      })),
    });
  });
  const linkById = new Map(proof.reader.links.map((link) => [link.id, link]));
  const semanticLinks = evidence.semanticOverlay.blockGroups.flatMap((group) =>
    group.linkIds.map((id): PublisherThemeHostLinkProjection => {
      const link = linkById.get(id);
      if (
        link === undefined ||
        link.source.kind !== "block-markdown" ||
        link.source.workId !== group.workId ||
        link.source.sectionId !== group.sectionId ||
        link.source.blockId !== group.blockId ||
        typeof link.label !== "string"
      ) {
        throw new TypeError(
          `Publisher theme host could not bind semantic link '${id}' to its exact source block.`,
        );
      }
      return Object.freeze({
        id: link.id,
        workId: link.source.workId,
        sectionId: link.source.sectionId,
        blockId: link.source.blockId,
        href: link.href,
        label: link.label,
        sourceStart: link.source.range.start,
      });
    }),
  );
  const sourceWorkId = evidence.semanticOverlay.sourceWorkPageWorkId;
  const sourceWorkPath = evidence.semanticOverlay.sourceWorkPagePath;
  const linkIds = semanticLinks.map(({ id }) => id).sort();
  if (
    semanticLinks.length !== EXPECTED_SEMANTIC_LINK_COUNT ||
    evidence.semanticOverlay.blockGroupCount !==
      EXPECTED_SEMANTIC_LINK_BLOCK_GROUP_COUNT ||
    new Set(
      semanticLinks.map(
        ({ workId, sectionId, blockId }) =>
          `${workId}\u0000${sectionId}\u0000${blockId}`,
      ),
    ).size !== EXPECTED_SEMANTIC_LINK_BLOCK_GROUP_COUNT ||
    !isDeepStrictEqual(linkIds, [...evidence.semanticOverlay.linkIds].sort()) ||
    semanticLinks.some(({ workId }) => workId !== sourceWorkId) ||
    sourceWorkId !== EXPECTED_SOURCE_WORK_ID ||
    sourceWorkPath !== EXPECTED_SOURCE_WORK_PATH
  ) {
    throw new TypeError(
      "Publisher theme host received an incomplete semantic link projection.",
    );
  }
  const ownerGroups = evidence.routes.catalogChapterRootOwnerGroups;
  if (
    evidence.routes.catalogChapterRootOwnerGroupCount !==
      EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_COUNT ||
    evidence.routes.catalogChapterRootOwnerChildCount !==
      EXPECTED_CATALOG_CHAPTER_ROOT_CHILD_COUNT ||
    ownerGroups.length !== EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_COUNT ||
    evidence.routes.ownedCatalogFragmentAddressCount !==
      EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_COUNT +
        EXPECTED_CATALOG_CHAPTER_ROOT_CHILD_COUNT ||
    evidence.routes.ownedCatalogFragmentAddresses.length !==
      EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_COUNT +
        EXPECTED_CATALOG_CHAPTER_ROOT_CHILD_COUNT ||
    evidence.routes.catalogRootRouteAdditionCount !==
      EXPECTED_CATALOG_ROOT_ROUTE_ADDITION_COUNT ||
    evidence.routes.catalogRootRouteAdditions.length !==
      EXPECTED_CATALOG_ROOT_ROUTE_ADDITION_COUNT ||
    evidence.routes.catalogRootRouteAdditionsSha256 !==
      EXPECTED_CATALOG_ROOT_ROUTE_ADDITIONS_HASH ||
    hashJson(
      evidence.routes.catalogRootRouteAdditions as unknown as JSONValue,
    ) !== EXPECTED_CATALOG_ROOT_ROUTE_ADDITIONS_HASH ||
    evidence.routes.catalogChapterRootOwnerGroupsSha256 !==
      EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_GROUPS_HASH ||
    evidence.routes.catalogChapterRootOwnerIdsSha256 !==
      EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_IDS_HASH ||
    evidence.routes.catalogChapterRootChildIdsSha256 !==
      EXPECTED_CATALOG_CHAPTER_ROOT_CHILD_IDS_HASH ||
    evidence.routes.catalogChapterRootOwnerPathsSha256 !==
      EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_PATHS_HASH ||
    hashJson(ownerGroups as unknown as JSONValue) !==
      EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_GROUPS_HASH ||
    hashJson(
      ownerGroups.map(({ sectionId }) => sectionId) as unknown as JSONValue,
    ) !== EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_IDS_HASH ||
    hashJson(
      ownerGroups.flatMap(({ childIds }) => childIds) as unknown as JSONValue,
    ) !== EXPECTED_CATALOG_CHAPTER_ROOT_CHILD_IDS_HASH ||
    hashJson(
      ownerGroups.map(({ path: ownerPath }) => ownerPath) as unknown as JSONValue,
    ) !== EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_PATHS_HASH
  ) {
    throw new TypeError(
      "Publisher theme host received drifted catalog chapter owner evidence.",
    );
  }
  const ownerIds = ownerGroups.map(({ sectionId }) => sectionId);
  const childIds = ownerGroups.flatMap(({ childIds: groupChildIds }) =>
    groupChildIds,
  );
  const ownerIdSet = new Set(ownerIds);
  const childIdSet = new Set(childIds);
  if (
    ownerIdSet.size !== EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_COUNT ||
    childIdSet.size !== EXPECTED_CATALOG_CHAPTER_ROOT_CHILD_COUNT ||
    childIds.some((sectionId) => ownerIdSet.has(sectionId))
  ) {
    throw new TypeError(
      "Publisher theme host received overlapping or duplicate catalog ownership.",
    );
  }
  const addressBySectionId = new Map(
    evidence.routes.ownedCatalogFragmentAddresses.map((address) => [
      address.sectionId,
      address,
    ]),
  );
  const activeRouteByPath = new Map(
    proof.reader.routes.active.map((route) => [route.path, route]),
  );
  const catalogRootRouteAdditionKeys = new Set(
    evidence.routes.catalogRootRouteAdditions.map(
      ({ sectionId, path: routePath }) => `${sectionId}\u0000${routePath}`,
    ),
  );
  const semanticTargetRouteKeys = new Set(
    evidence.routes.semanticTargetRoutes.map(
      ({ sectionId, path: routePath }) => `${sectionId}\u0000${routePath}`,
    ),
  );
  const readerWorkById = new Map(
    proof.reader.works.map((work) => [work.id, work]),
  );
  const fragmentOwners = ownerGroups.map((group) => {
    const address = addressBySectionId.get(group.sectionId);
    const route = activeRouteByPath.get(group.path);
    const readerWork = readerWorkById.get(group.workId);
    const ownerSection = readerWork?.sections.find(
      ({ id }) => id === group.sectionId,
    );
    const ownerRouteKey = `${group.sectionId}\u0000${group.path}`;
    const expectedActiveRouteName = catalogRootRouteAdditionKeys.has(
      ownerRouteKey,
    )
      ? "catalog-root"
      : semanticTargetRouteKeys.has(ownerRouteKey)
        ? "semantic-target"
        : undefined;
    if (
      address === undefined ||
      address.serverRendered !== true ||
      address.path !== group.path ||
      address.anchor !== group.anchor ||
      address.href !== group.href ||
      expectedActiveRouteName === undefined ||
      address.activeRouteName !== expectedActiveRouteName ||
      route?.target.kind !== "section" ||
      route.target.routeName !== address.activeRouteName ||
      route.target.workId !== group.workId ||
      route.target.sectionId !== group.sectionId ||
      readerWork === undefined ||
      ownerSection === undefined ||
      ownerSection.depth !== 0 ||
      ownerSection.role !== "chapter" ||
      ownerSection.parentId !== null ||
      !isDeepStrictEqual(ownerSection.childIds, group.childIds) ||
      ownerSection.domId !== group.anchor ||
      !isDeepStrictEqual(ownerSection.readerAddress, {
        path: group.path,
        anchor: group.anchor,
      }) ||
      !isDeepStrictEqual(ownerSection.routes["catalog-fragment"], {
        path: group.path,
        anchor: group.anchor,
      }) ||
      !isDeepStrictEqual(group.catalogSectionIds, [
        group.sectionId,
        ...group.childIds,
      ])
    ) {
      throw new TypeError(
        `Publisher theme host could not bind catalog owner '${group.sectionId}' to its exact active route.`,
      );
    }
    for (const childId of group.childIds) {
      const childSection = readerWork.sections.find(({ id }) => id === childId);
      const childAddress = addressBySectionId.get(childId);
      if (
        childSection === undefined ||
        childAddress === undefined ||
        childAddress.serverRendered !== true ||
        childAddress.path !== group.path ||
        childAddress.anchor !== childId ||
        childAddress.href !== `${group.path}#${childId}` ||
        childAddress.activeRouteName !== expectedActiveRouteName ||
        childSection.depth !== 1 ||
        childSection.role !== "section" ||
        childSection.parentId !== group.sectionId ||
        childSection.childIds.length !== 0 ||
        childSection.domId !== childId ||
        !isDeepStrictEqual(childSection.readerAddress, {
          path: group.path,
          anchor: childId,
        }) ||
        !isDeepStrictEqual(childSection.routes["catalog-fragment"], {
          path: group.path,
          anchor: childId,
        })
      ) {
        throw new TypeError(
          `Publisher theme host could not bind catalog child '${childId}' to its exact Reader hierarchy and fragment.`,
        );
      }
    }
    return Object.freeze({
      workId: group.workId,
      sectionId: group.sectionId,
      path: group.path,
      anchor: group.anchor,
      href: group.href,
      childIds: Object.freeze([...group.childIds]),
      catalogSectionIds: Object.freeze([...group.catalogSectionIds]),
    });
  });
  const liveContentPaths = Object.freeze([
    sourceWorkPath,
    ...fragmentOwners.map(({ path: ownerPath }) => ownerPath),
  ]);
  if (
    liveContentPaths.length !== EXPECTED_LIVE_CONTENT_PATH_COUNT ||
    new Set(liveContentPaths).size !== EXPECTED_LIVE_CONTENT_PATH_COUNT ||
    hashJson(liveContentPaths as unknown as JSONValue) !==
      EXPECTED_LIVE_CONTENT_PATHS_HASH
  ) {
    throw new TypeError(
      "Publisher theme host received a drifted live content path order.",
    );
  }
  const stateMigrationArtifact = proof.stateMigrationArtifact;
  const stateMigrationProjection = proof.extensionData.extensions[0]?.clientData;
  assertCoherenceReaderStateMigrationProjection(stateMigrationProjection);
  const expectedStateMigrationProjection = Object.freeze({
    schemaVersion: stateMigrationArtifact.artifact.schemaVersion,
    publicationId: proof.reader.publicationId,
    artifact: Object.freeze({
      href: COHERENCE_READER_STATE_MIGRATION_HREF,
      readerBuildId: proof.reader.buildId,
      buildId: stateMigrationArtifact.artifact.buildId,
      byteSize: stateMigrationArtifact.byteSize,
      sha256: stateMigrationArtifact.sha256,
    }),
  });
  const extensionEntry = proof.extensionData.extensions[0];
  const applicationExtensions = proof.application.manifest.extensions;
  if (applicationExtensions === null) {
    throw new TypeError(
      "Publisher theme host requires the Reader state migration extension manifest.",
    );
  }
  const applicationExtensionEntry = applicationExtensions.entries[0];
  const { buildId: extensionBuildId, ...extensionDataBasis } = proof.extensionData;
  if (
    Buffer.byteLength(stateMigrationArtifact.text, "utf8") !==
      stateMigrationArtifact.byteSize ||
    sha256Bytes(stateMigrationArtifact.text) !== stateMigrationArtifact.sha256 ||
    !isDeepStrictEqual(
      JSON.parse(stateMigrationArtifact.text),
      stateMigrationArtifact.artifact,
    ) ||
    stateMigrationArtifact.artifact.publicationId !== proof.reader.publicationId ||
    stateMigrationArtifact.artifact.readerBuildId !== proof.reader.buildId ||
    stateMigrationArtifact.artifact.href !== COHERENCE_READER_STATE_MIGRATION_HREF ||
    proof.extensionData.publicationId !== proof.reader.publicationId ||
    proof.extensionData.readerBuildId !== proof.reader.buildId ||
    proof.extensionData.extensions.length !== 1 ||
    hashCanonicalJson(extensionDataBasis as unknown as JSONValue) !== extensionBuildId ||
    !isDeepStrictEqual(extensionEntry, {
      id: COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
      package: COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE,
      version: COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION,
      capabilities: COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
      config: {},
      clientData: expectedStateMigrationProjection,
      offlineResources: [{
        href: COHERENCE_READER_STATE_MIGRATION_HREF,
        kind: "data",
        byteSize: stateMigrationArtifact.byteSize,
      }],
    }) ||
    applicationExtensions.entries.length !== 1 ||
    applicationExtensionEntry?.id !== COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID ||
    applicationExtensionEntry.package !== COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE ||
    applicationExtensionEntry.version !== COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION ||
    !isDeepStrictEqual(
      applicationExtensionEntry.capabilities,
      COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
    ) ||
    applicationExtensionEntry.projectionHash !==
      hashCanonicalJson(extensionEntry as unknown as JSONValue) ||
    applicationExtensionEntry.rendererApiVersion !== "1.0" ||
    applicationExtensionEntry.rendererCompatibility !==
      ">=0.1.0-alpha.0 <0.2.0" ||
    applicationExtensionEntry.hostApiVersion !== null ||
    applicationExtensionEntry.hostCompatibility !== null
  ) {
    throw new TypeError(
      "Publisher theme host received drifted Reader state migration extension evidence.",
    );
  }
  const artifacts = createPublisherReaderArtifacts({
    reader: proof.reader,
    search: proof.search,
    progress: proof.progress,
  });
  if (
    artifacts.length !== EXPECTED_READER_ARTIFACT_COUNT ||
    !isDeepStrictEqual(
      artifacts.map(({ hostRelativePath }) => hostRelativePath),
      expectedReaderArtifactPaths(),
    ) ||
    artifacts.some(
      ({ hostRelativePath }) =>
        hostRelativePath === PUBLISHER_NEXT_AUDIO_DATA_PATH,
    )
  ) {
    throw new TypeError(
      "Publisher theme host requires exactly four normal Reader artifacts.",
    );
  }
  const updatesDormancy = publisherThemeUpdatesDormancyEvidence(proof.reader);
  return Object.freeze({
    reader: proof.reader,
    artifacts,
    extensionData: proof.extensionData,
    isolatedExtensionManifest: applicationExtensions,
    stateMigrationArtifact,
    stateMigrationProjection,
    contentBuildId: proof.content.buildId,
    adaptedApplicationBuildId:
      EXPECTED_HISTORICAL_ADAPTED_APPLICATION_BUILD_ID,
    contentEvidenceHash: EXPECTED_HISTORICAL_CONTENT_EVIDENCE_HASH,
    activeRouteCount: EXPECTED_ACTIVE_ROUTE_COUNT,
    explicitRedirectCount: EXPECTED_EXPLICIT_REDIRECT_COUNT,
    canonicalSlashRedirectCount: EXPECTED_CANONICAL_SLASH_REDIRECT_COUNT,
    activePathsHash: EXPECTED_ROUTE_PLAN_ACTIVE_PATHS_HASH,
    activeRoutesHash: EXPECTED_READER_ACTIVE_ROUTES_HASH,
    routePlanStaticParamsHash: EXPECTED_ROUTE_PLAN_STATIC_PARAMS_HASH,
    applicationStaticParamsHash: EXPECTED_APPLICATION_STATIC_PARAMS_HASH,
    redirectTuplesHash: EXPECTED_REDIRECT_TUPLES_HASH,
    absentReaderBasePathCount: EXPECTED_ABSENT_READER_BASE_PATH_COUNT,
    missingReaderFragmentHrefCount:
      EXPECTED_MISSING_READER_FRAGMENT_HREF_COUNT,
    currentCatalogFragmentCoverage:
      evidence.routes.currentCatalogFragmentCoverage,
    sourceWorkId,
    sourceWorkPath,
    semanticLinks: Object.freeze(semanticLinks),
    semanticLinkBlockGroupCount: evidence.semanticOverlay.blockGroupCount,
    routePlanStaticParamCount: EXPECTED_ROUTE_PLAN_STATIC_PARAM_COUNT,
    applicationStaticParamCount: EXPECTED_APPLICATION_STATIC_PARAM_COUNT,
    sectionIndexes: Object.freeze(sectionIndexes),
    sectionIndexCount: EXPECTED_SECTION_INDEX_COUNT,
    sectionIndexReferenceCount: EXPECTED_SECTION_INDEX_REFERENCE_COUNT,
    sectionIndexesHash: EXPECTED_SECTION_INDEXES_HASH,
    sectionIndexPaths: Object.freeze(sectionIndexPaths),
    sectionIndexPathsHash: EXPECTED_SECTION_INDEX_PATHS_HASH,
    fragmentOwners: Object.freeze(fragmentOwners),
    fragmentOwnerChildIds: Object.freeze(childIds),
    catalogChapterRootOwnerGroupsHash:
      evidence.routes.catalogChapterRootOwnerGroupsSha256,
    catalogChapterRootOwnerIdsHash:
      evidence.routes.catalogChapterRootOwnerIdsSha256,
    catalogChapterRootChildIdsHash:
      evidence.routes.catalogChapterRootChildIdsSha256,
    catalogChapterRootOwnerPathsHash:
      evidence.routes.catalogChapterRootOwnerPathsSha256,
    liveContentPaths,
    liveContentPathsHash: EXPECTED_LIVE_CONTENT_PATHS_HASH,
    updatesDormancy,
    baseRoutePresence: true as const,
    aggregateChapterPageParity: true as const,
    nestedFragmentParity: false as const,
    durableFragmentParity: false as const,
    fullReaderRouteParity: false as const,
  });
}

function assertPublisherThemeInactiveArtifactsAbsent(hostRoot: string): void {
  for (const hostRelativePath of [
    PUBLISHER_NEXT_AUDIO_DATA_PATH,
    PUBLISHER_NEXT_SYNC_DATA_PATH,
    PUBLISHER_NEXT_UPDATES_DATA_PATH,
  ]) {
    const artifactPath = path.join(
      hostRoot,
      ...hostRelativePath.split("/"),
    );
    try {
      fs.lstatSync(artifactPath);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
    throw new TypeError(
      `Publisher theme host must not receive inactive artifact '${hostRelativePath}'.`,
    );
  }
}

function materializePublisherThemeReaderArtifacts(
  hostRoot: string,
  artifacts: readonly PublisherReaderArtifact[],
): void {
  if (
    artifacts.length !== EXPECTED_READER_ARTIFACT_COUNT ||
    !isDeepStrictEqual(
      artifacts.map(({ hostRelativePath }) => hostRelativePath),
      expectedReaderArtifactPaths(),
    )
  ) {
    throw new TypeError(
      "Publisher theme host refused a nonstandard Reader artifact set.",
    );
  }
  for (const artifact of artifacts) {
    const destination = resolveArtifactDestination({
      hostRoot,
      declaredArtifactPath: artifact.hostRelativePath,
      rendererManagedPaths: Object.freeze([]),
    });
    const result = writeHostArtifact({ destination, text: artifact.text });
    if (result.outcome !== "written") {
      throw new TypeError(
        "Publisher theme host Reader artifact unexpectedly existed before materialization.",
      );
    }
  }
  assertPublisherThemeInactiveArtifactsAbsent(hostRoot);
}

function materializePublisherThemeExtensionArtifacts(
  hostRoot: string,
  projection: PublisherThemeHostReaderProjection,
): void {
  const extensionDataText = canonicalizeJson(
    projection.extensionData as unknown as JSONValue,
  );
  const artifacts = Object.freeze([
    Object.freeze({
      path: PUBLISHER_NEXT_EXTENSION_DATA_PATH,
      text: extensionDataText,
    }),
    Object.freeze({
      path: STATE_MIGRATION_HOST_RELATIVE_PATH,
      text: projection.stateMigrationArtifact.text,
    }),
  ]);
  for (const artifact of artifacts) {
    const destination = resolveArtifactDestination({
      hostRoot,
      declaredArtifactPath: artifact.path,
      rendererManagedPaths: Object.freeze([]),
    });
    const result = writeHostArtifact({ destination, text: artifact.text });
    if (result.outcome !== "written") {
      throw new TypeError(
        "Publisher theme host extension artifact unexpectedly existed before materialization.",
      );
    }
  }
}

function extensionArtifactEvidence(
  projection: PublisherThemeHostReaderProjection,
): Readonly<{
  extensionDataArtifact: Readonly<{
    path: string;
    bytes: number;
    hash: string;
  }>;
  stateMigrationArtifact: Readonly<{
    path: string;
    bytes: number;
    hash: string;
    buildId: string;
  }>;
}> {
  const extensionDataText = canonicalizeJson(
    projection.extensionData as unknown as JSONValue,
  );
  return Object.freeze({
    extensionDataArtifact: Object.freeze({
      path: PUBLISHER_NEXT_EXTENSION_DATA_PATH,
      bytes: Buffer.byteLength(extensionDataText, "utf8"),
      hash: sha256Bytes(extensionDataText),
    }),
    stateMigrationArtifact: Object.freeze({
      path: STATE_MIGRATION_HOST_RELATIVE_PATH,
      bytes: projection.stateMigrationArtifact.byteSize,
      hash: projection.stateMigrationArtifact.sha256,
      buildId: projection.stateMigrationArtifact.artifact.buildId,
    }),
  });
}

function readerArtifactEvidence(
  artifacts: readonly PublisherReaderArtifact[],
): readonly Readonly<{ path: string; bytes: number; hash: string }>[] {
  return Object.freeze(
    [...artifacts]
      .sort((left, right) =>
        left.hostRelativePath.localeCompare(right.hostRelativePath),
      )
      .map(({ hostRelativePath, text }) =>
        Object.freeze({
        path: hostRelativePath,
        bytes: Buffer.byteLength(text, "utf8"),
        hash: sha256Bytes(text),
        }),
      ),
  );
}

function readerArtifactsHash(
  evidence: readonly Readonly<{ path: string; bytes: number; hash: string }>[],
): string {
  return hashJson(evidence as unknown as JSONValue);
}

function homePath(reader: PublicationReaderEnvelope): string {
  const route = reader.routes.active.find(
    ({ target }) => target.kind === "home",
  );
  if (route === undefined) {
    throw new TypeError("Publisher theme compiler proof Reader has no home route.");
  }
  return route.path;
}

export function assertPublisherThemeProofRouteUnowned(
  reader: PublicationReaderEnvelope,
): void {
  const proofPaths = new Set([`/${PROBE_ROUTE_NAME}`, `/${PROBE_ROUTE_NAME}/`]);
  const activeCollision = reader.routes.active.some(({ path: routePath }) =>
    proofPaths.has(routePath),
  );
  const redirectCollision = reader.routes.redirects.some(
    ({ from }) => proofPaths.has(from),
  );
  if (activeCollision || redirectCollision) {
    throw new TypeError(
      "Publisher theme proof route collides with declared publication authority.",
    );
  }
}

export async function runPublisherThemeHostProof({
  buildRunner = runPublisherThemeNextBuild,
  fetchRunner = fetchPublisherThemeBuiltHost,
  liveHostObserver,
  paths = defaultPublisherThemeHostProofPaths,
}: {
  buildRunner?: PublisherThemeHostBuildRunner;
  fetchRunner?: PublisherThemeHostFetchRunner;
  liveHostObserver?: PublisherThemeHostLiveObserver;
  paths?: PublisherThemeHostProofPaths;
} = {}): Promise<PublisherThemeHostProofSummary> {
  const requiresReviewedThemeOutput =
    buildRunner === runPublisherThemeNextBuild &&
    fetchRunner === fetchPublisherThemeBuiltHost;
  if (liveHostObserver !== undefined && !requiresReviewedThemeOutput) {
    throw new TypeError(
      "Publisher theme live host observer requires the exact reviewed build and fetch runners.",
    );
  }
  if (
    path.resolve(paths.publicationRoot) !== path.resolve(repoRoot) ||
    path.resolve(paths.generatedRoot) !==
      path.resolve(defaultPublisherThemeHostProofPaths.generatedRoot) ||
    path.resolve(paths.proofRoot) !==
      path.resolve(defaultPublisherThemeHostProofPaths.proofRoot) ||
    path.resolve(paths.nextCliPath) !==
      path.resolve(defaultPublisherThemeHostProofPaths.nextCliPath) ||
    path.resolve(paths.themeSourcePath) !==
      path.resolve(defaultPublisherThemeHostProofPaths.themeSourcePath) ||
    !isDeepStrictEqual(
      paths.protectedRoots.map((value) => path.resolve(value)),
      defaultPublisherThemeHostProofPaths.protectedRoots.map((value) =>
        path.resolve(value),
      ),
    )
  ) {
    throw new TypeError(
      "Publisher theme compiler proof must use the fixed checked-in publication, theme, dependency, and output authorities.",
    );
  }
  const rootManifest = readJsonRecord(
    path.join(repoRoot, "package.json"),
    "publication package manifest",
  );
  const npmVersion = assertExactRuntime(rootManifest);
  assertPublisherThemeCurrentSourceAuthority();
  assertFontkitInstallAuthority();
  const templateEvidence = createPublisherThemeHostTemplateEvidence();
  const proofHostFiles = createPublisherThemeProofHostFiles(
    templateEvidence.template,
  );
  const proofConfig = proofHostFiles.find(
    ({ path: filePath }) => filePath === "next.config.mjs",
  );
  if (proofConfig === undefined) {
    throw new TypeError("Publisher theme proof host omitted its Next configuration.");
  }
  const proofTemplateFilesHash = hashJson(
    templateFileProjection(proofHostFiles) as unknown as JSONValue,
  );
  const proofConfigHash = sha256Bytes(proofConfig.contents);
  preparePublisherThemeProofRoot(paths);
  const before = snapshotExternalState(paths.themeSourcePath);
  const themeSourceText = readStableRegularFile(
    paths.themeSourcePath,
    "Coherence Publisher theme source",
    repoRoot,
  ).toString("utf8");
  const themeContractSourceText = readStableRegularFile(
    path.join(repoRoot, ...LOCAL_THEME_CONTRACT_SOURCE_PATH.split("/")),
    "Coherence Publisher theme contract source",
    repoRoot,
    EXPECTED_LOCAL_THEME_CONTRACT_SOURCE_BYTES,
  ).toString("utf8");
  const stateMigrationSourceFiles =
    readPublisherThemeStateMigrationSourceFiles();

  let result:
    | Readonly<{
        projection: PublisherThemeHostReaderProjection;
        currentTransition: PublisherThemeCurrentTransitionBoundary;
        verification: PublisherThemeHostVerification;
        readerArtifactEvidence: readonly Readonly<{
          path: string;
          bytes: number;
          hash: string;
        }>[];
        readerArtifactsHash: string;
        extensionDataArtifact: Readonly<{
          path: string;
          bytes: number;
          hash: string;
        }>;
        stateMigrationArtifact: Readonly<{
          path: string;
          bytes: number;
          hash: string;
          buildId: string;
        }>;
        hostSourcesHash: string;
        scaffoldingHash: string;
      }>
    | undefined;
  let operationError: unknown;
  try {
    result = await withPublisherThemeProofInterruption(async (signal) => {
      const authorities = await loadCoherencePublisherContentAuthorities();
      if (authorities.loaded.publication.audio !== undefined) {
        throw new TypeError(
          "Publisher theme host proof requires an undeclared audio source boundary.",
        );
      }
      const contentProof = await adaptCoherencePublisherContent(authorities);
      const currentTransition = assertPublisherThemeCurrentTransitionBoundary(
        contentProof.application,
      );
      const projection = createPublisherThemeHostReaderProjection(contentProof);
      const scaffolding = createPublisherThemeHostScaffolding({
        themeSourceText,
        themeContractSourceText,
        stateMigrationProjection: projection.stateMigrationProjection,
        stateMigrationSourceFiles,
      });
      const scaffoldingHash = hashJson(
        templateFileProjection(scaffolding) as unknown as JSONValue,
      );
      const artifactEvidence = readerArtifactEvidence(projection.artifacts);
      const migrationEvidence = extensionArtifactEvidence(projection);
      return await withDisposablePublisherThemeHost({
        boundary: paths,
        operation: async ({ hostRoot, runtimeRoot }) => {
          signal.throwIfAborted();
          materializePublisherThemeHostSources({
            hostRoot,
            files: Object.freeze([...proofHostFiles, ...scaffolding]),
          });
          const copiedThemeHash = sha256Bytes(
            readStableRegularFile(
              path.join(hostRoot, LOCAL_THEME_SOURCE_PATH),
              "copied Coherence Publisher theme",
              hostRoot,
            ),
          );
          if (copiedThemeHash !== before.themeSourceHash) {
            throw new TypeError(
              "Publisher theme source copy does not match its authority.",
            );
          }
          const copiedThemeContractHash = sha256Bytes(
            readStableRegularFile(
              path.join(
                hostRoot,
                ...LOCAL_THEME_CONTRACT_SOURCE_PATH.split("/"),
              ),
              "copied Coherence Publisher theme contract",
              hostRoot,
              EXPECTED_LOCAL_THEME_CONTRACT_SOURCE_BYTES,
            ),
          );
          if (
            copiedThemeContractHash !==
            EXPECTED_LOCAL_THEME_CONTRACT_SOURCE_HASH
          ) {
            throw new TypeError(
              "Publisher theme contract copy does not match its authority.",
            );
          }
          materializePublisherThemeReaderArtifacts(
            hostRoot,
            projection.artifacts,
          );
          materializePublisherThemeExtensionArtifacts(hostRoot, projection);
          signal.throwIfAborted();
          assertPublisherThemeProofRouteUnowned(projection.reader);
          const expectedSources = snapshotPublisherThemeHostSources(hostRoot);
          const hostSourcesHash = hashJson(
            expectedSources as unknown as JSONValue,
          );
          await buildRunner({
            hostRoot,
            nextCliPath: paths.nextCliPath,
            runtimeRoot,
            signal,
          });
          signal.throwIfAborted();
          assertPublisherThemeInactiveArtifactsAbsent(hostRoot);
          assertPublisherThemeHostSourcesCurrent({
            expected: expectedSources,
            actual: snapshotPublisherThemeHostSources(hostRoot),
          });
          const fetched = await fetchRunner({
            homePath: homePath(projection.reader),
            hostRoot,
            nextCliPath: paths.nextCliPath,
            ...(liveHostObserver === undefined
              ? {}
              : {
                  liveHostObserver,
                  liveHostObserverProjection: projection,
                }),
            routePaths: Object.freeze([
              ...projection.liveContentPaths,
              ...projection.sectionIndexPaths,
            ]),
            runtimeRoot,
            signal,
          });
          signal.throwIfAborted();
          assertPublisherThemeInactiveArtifactsAbsent(hostRoot);
          assertPublisherThemeHostSourcesCurrent({
            expected: expectedSources,
            actual: snapshotPublisherThemeHostSources(hostRoot),
          });
          const verification = verifyPublisherThemeHostRuntime({
            fetched,
            nextRoot: path.join(hostRoot, ".next"),
            projection,
          });
          if (requiresReviewedThemeOutput) {
            assertReviewedPublisherThemeFontEvidence(verification.fontEvidence);
          }
          return Object.freeze({
            projection,
            currentTransition,
            readerArtifactEvidence: artifactEvidence,
            readerArtifactsHash: readerArtifactsHash(artifactEvidence),
            extensionDataArtifact: migrationEvidence.extensionDataArtifact,
            stateMigrationArtifact: migrationEvidence.stateMigrationArtifact,
            hostSourcesHash,
            scaffoldingHash,
            verification,
          });
        },
      });
    });
  } catch (error) {
    operationError = error;
  }
  let stateError: unknown;
  try {
    const after = snapshotExternalState(paths.themeSourcePath);
    assertExternalStateUnchanged(before, after);
  } catch (error) {
    stateError = error;
  }
  if (operationError !== undefined && stateError !== undefined) {
    throw new AggregateError(
      [operationError, stateError],
      "Publisher theme proof failed and changed source state.",
    );
  }
  if (stateError !== undefined) throw stateError;
  if (operationError !== undefined) throw operationError;
  if (result === undefined) {
    throw new TypeError("Publisher theme compiler proof produced no result.");
  }

  return Object.freeze({
    proofScope: "isolated Next linkful theme compiler host" as const,
    contentParity: "not asserted" as const,
    adaptedReaderHostVerified: true as const,
    currentPublicRoutes: "untouched" as const,
    publicationId: result.projection.reader.publicationId,
    contentBuildId: result.projection.contentBuildId,
    contentEvidenceHash: result.projection.contentEvidenceHash,
    absentReaderBasePathCount: result.projection.absentReaderBasePathCount,
    missingReaderFragmentHrefCount:
      result.projection.missingReaderFragmentHrefCount,
    currentCatalogFragmentCoverage:
      result.projection.currentCatalogFragmentCoverage,
    activeRouteCount: result.projection.activeRouteCount,
    explicitRedirectCount: result.projection.explicitRedirectCount,
    canonicalSlashRedirectCount:
      result.projection.canonicalSlashRedirectCount,
    activePathsHash: result.projection.activePathsHash,
    activeRoutesHash: result.projection.activeRoutesHash,
    routePlanStaticParamsHash:
      result.projection.routePlanStaticParamsHash,
    applicationStaticParamsHash:
      result.projection.applicationStaticParamsHash,
    redirectTuplesHash: result.projection.redirectTuplesHash,
    baseRoutePresence: result.projection.baseRoutePresence,
    aggregateChapterPageParity:
      result.projection.aggregateChapterPageParity,
    nestedFragmentParity: result.projection.nestedFragmentParity,
    durableFragmentParity: result.projection.durableFragmentParity,
    fullReaderRouteParity: result.projection.fullReaderRouteParity,
    readerBuildId: result.projection.reader.buildId,
    adaptedApplicationBuildId:
      result.projection.adaptedApplicationBuildId,
    applicationBuildId: result.verification.applicationBuildId,
    applicationArtifactHash: result.verification.applicationArtifactHash,
    hostContractVersion: templateEvidence.template.contractVersion,
    renderer: templateEvidence.template.renderer,
    rendererVersion: templateEvidence.template.rendererVersion,
    publisherContentVersion: installedPackageVersion(
      "@genii-foundation/publisher-content",
    ),
    publisherReaderVersion: installedPackageVersion(
      "@genii-foundation/publisher-reader",
    ),
    publisherSchemaVersion: installedPackageVersion(
      "@genii-foundation/publisher-schema",
    ),
    themePackage: EXPECTED_THEME_PACKAGE,
    themeVersion: EXPECTED_THEME_VERSION,
    themeConfigHash: result.verification.configHash,
    themeTokensHash: result.verification.tokensHash,
    themeSourceHash: before.themeSourceHash,
    templateInputHash: templateEvidence.inputHash,
    templateFilesHash: templateEvidence.filesHash,
    proofTemplateFilesHash,
    proofConfigHash,
    hostSourcesHash: result.hostSourcesHash,
    scaffoldingHash: result.scaffoldingHash,
    readerArtifactsHash: result.readerArtifactsHash,
    readerArtifactEvidence: result.readerArtifactEvidence,
    readerArtifactCount: EXPECTED_READER_ARTIFACT_COUNT,
    readerArtifactPaths: expectedReaderArtifactPaths(),
    extensionDataArtifact: result.extensionDataArtifact,
    stateMigrationArtifact: result.stateMigrationArtifact,
    semanticLinkCount: EXPECTED_SEMANTIC_LINK_COUNT,
    semanticLinkBlockGroupCount:
      EXPECTED_SEMANTIC_LINK_BLOCK_GROUP_COUNT,
    routePlanStaticParamCount: EXPECTED_ROUTE_PLAN_STATIC_PARAM_COUNT,
    applicationStaticParamCount: EXPECTED_APPLICATION_STATIC_PARAM_COUNT,
    sectionIndexCount: result.projection.sectionIndexCount,
    sectionIndexReferenceCount:
      result.projection.sectionIndexReferenceCount,
    sectionIndexesHash: result.projection.sectionIndexesHash,
    sectionIndexPaths: result.projection.sectionIndexPaths,
    sectionIndexPathsHash: result.projection.sectionIndexPathsHash,
    catalogChapterRootOwnerCount:
      EXPECTED_CATALOG_CHAPTER_ROOT_OWNER_COUNT,
    catalogChapterRootChildCount:
      EXPECTED_CATALOG_CHAPTER_ROOT_CHILD_COUNT,
    catalogChapterRootOwnerGroupsHash:
      result.projection.catalogChapterRootOwnerGroupsHash,
    catalogChapterRootOwnerIdsHash:
      result.projection.catalogChapterRootOwnerIdsHash,
    catalogChapterRootChildIdsHash:
      result.projection.catalogChapterRootChildIdsHash,
    catalogChapterRootOwnerPathsHash:
      result.projection.catalogChapterRootOwnerPathsHash,
    liveContentPathCount: EXPECTED_LIVE_CONTENT_PATH_COUNT,
    liveContentPathsHash: result.projection.liveContentPathsHash,
    fragmentOwnerSectionIds: Object.freeze(
      result.projection.fragmentOwners.map(({ sectionId }) => sectionId),
    ),
    fragmentOwnerChildSectionIds:
      result.projection.fragmentOwnerChildIds,
    fragmentOwnerAddresses: result.projection.fragmentOwners,
    verifiedHostPaths: result.verification.verifiedHostPaths,
    verifiedHostPageEvidence:
      result.verification.verifiedHostPageEvidence,
    currentTransition: result.currentTransition,
    isolatedMigrationExtension: "mounted" as const,
    migrationExecution:
      liveHostObserver === undefined
        ? ("not-exercised" as const)
        : ("delegated-to-live-observer" as const),
    updatesDormancy: result.projection.updatesDormancy,
    isolatedUpdates: "absent" as const,
    isolatedSync: "absent" as const,
    audioDeclaration: "absent" as const,
    audioArtifact: "absent" as const,
    offlineAudioEnvelopeResourceCount:
      result.verification.offlineAudioEnvelopeResourceCount,
    liveContentProjectionHash:
      result.verification.liveContentProjectionHash,
    applicationPayloadHash: result.verification.payloadHash,
    compiledCssHash: result.verification.fontEvidence.cssHash,
    fontEvidenceHash: result.verification.fontEvidence.evidenceHash,
    defaultReaderFontFamilyId: "literata" as const,
    readerFontFamilyCount: PUBLISHER_THEME_READER_FONT_IDS.length,
    compiledNextFontCount: result.verification.fontEvidence.familyCount,
    compiledFontAssetCount: result.verification.fontEvidence.assetCount,
    nodeVersion: process.versions.node,
    npmVersion,
    nextVersion: installedPackageVersion("next"),
    reactVersion: installedPackageVersion("react"),
    reactDomVersion: installedPackageVersion("react-dom"),
    typescriptVersion: installedPackageVersion("typescript"),
    sourceAuthorityHash: before.authorityHash,
    gitSourceStateHash: before.gitSourceStateHash,
    runtimeArtifactEvidence: before.runtimeArtifacts.evidence,
    runtimeArtifactStateHash: before.runtimeArtifacts.evidenceHash,
    runtimeArtifactsUnchanged: true as const,
    generatedHostCleanup: "completed" as const,
  });
}

function assertNoCliArguments(args: readonly string[]): void {
  if (args.length !== 0) throw new TypeError("Usage: theme-host-proof.ts");
}

async function main(): Promise<void> {
  assertNoCliArguments(process.argv.slice(2));
  const summary = await runPublisherThemeHostProof();
  console.log(JSON.stringify(summary, null, 2));
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch(() => {
    console.error(
      "Publisher theme compiler proof failed. Run its focused test for bounded diagnostics.",
    );
    process.exitCode = 1;
  });
}
