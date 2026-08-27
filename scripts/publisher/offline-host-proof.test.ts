import { createHash } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalizeJson } from "@genii-foundation/publisher-content";
import { createPublisherNextHostTemplate } from "@genii-foundation/publisher-next/host";
import {
  createReaderOfflineCatalog,
  serializeReaderOfflineCatalog,
  type ReaderOfflineCatalog,
  type ReaderOfflinePackage,
} from "@genii-foundation/publisher-reader/offline";
import type { JSONValue, PublicationReaderEnvelope } from "@genii-foundation/publisher-schema";
import { transformSync } from "esbuild";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  adaptCoherencePublisherContent,
  loadCoherencePublisherContentAuthorities,
} from "./content-adapter";
import {
  createPublisherThemeHostReaderProjection,
  type PublisherThemeHostProofSummary,
  type PublisherThemeHostReaderProjection,
} from "./theme-host-proof";
import {
  PUBLISHER_OFFLINE_CATALOG_HREF,
  PUBLISHER_OFFLINE_EXPECTED_APPLICATION_ARTIFACT_HASH,
  PUBLISHER_OFFLINE_EXPECTED_BROWSER_VERSION,
  PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH,
  PUBLISHER_OFFLINE_EXPECTED_DORMANT_AUDIO_SHELL_HASH,
  PUBLISHER_OFFLINE_EXPECTED_CARDINAL_HREF_ORDER_HASH,
  PUBLISHER_OFFLINE_EXPECTED_CARDINAL_RESOURCES_HASH,
  PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES,
  PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH,
  PUBLISHER_OFFLINE_EXPECTED_CATALOG_STRUCTURE_HASH,
  PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE,
  PUBLISHER_OFFLINE_EXPECTED_PACKAGES,
  PUBLISHER_OFFLINE_EXPECTED_PLAYWRIGHT_VERSION,
  PUBLISHER_OFFLINE_EXPECTED_PROGRESS_BYTES,
  PUBLISHER_OFFLINE_EXPECTED_PROGRESS_HASH,
  PUBLISHER_OFFLINE_EXPECTED_READER_RAIL_HASH,
  PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID,
  PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID,
  PUBLISHER_OFFLINE_EXPECTED_ROOT_THEME_STYLE_HASH,
  PUBLISHER_OFFLINE_EXPECTED_SEARCH_BYTES,
  PUBLISHER_OFFLINE_EXPECTED_SEARCH_HASH,
  PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_CONTENT_TYPE,
  PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS,
  PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH,
  PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH,
  PUBLISHER_OFFLINE_EXPECTED_WORKER_BYTES,
  PUBLISHER_OFFLINE_EXPECTED_WORKER_CACHE_CONTROL,
  PUBLISHER_OFFLINE_EXPECTED_WORKER_CONTENT_TYPE,
  PUBLISHER_OFFLINE_EXPECTED_WORKER_HASH,
  PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES,
  PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES,
  assertPublisherOfflineBrowserEvidence,
  assertPublisherOfflineBrowserPackageStateUnchanged,
  assertPublisherOfflineCacheSnapshotUnchanged,
  assertPublisherOfflineCatalogResponse,
  assertPublisherOfflineCatalogStructure,
  assertPublisherOfflineCliArguments,
  assertPublisherOfflineColdDocumentState,
  assertPublisherOfflineDocumentSemanticProjection,
  assertPublisherOfflineInFlightPackageStateUnchanged,
  assertPublisherOfflineMarkdownParserAuthority,
  assertPublisherOfflineMarkdownParserEvidence,
  assertPublisherOfflineOnlyInstalledVersionChanged,
  assertPublisherOfflinePlaywrightAuthority,
  assertPublisherOfflinePreInstallState,
  assertPublisherOfflineSearchTargetState,
  assertPublisherOfflineSerializableBrowserCallback,
  assertPublisherOfflineServiceWorkerState,
  assertPublisherOfflineWorkerResponse,
  composePublisherOfflineHostProofSummary,
  createPublisherOfflineDocumentSemanticAuthorities,
  publisherOfflineChromiumLaunchOptions,
  publisherOfflineDurableBrowserEvidenceBasis,
  publisherOfflineDurableCacheReceiptBasis,
  projectPublisherOfflineDocumentTree,
  projectPublisherOfflineDocumentHostStyle,
  runPublisherOfflineHostProof,
  type PublisherOfflineBrowserEvidence,
  type PublisherOfflineBrowserPackageState,
  type PublisherOfflineByteReceiptRow,
  type PublisherOfflineCacheReceipt,
  type PublisherOfflineCacheReceiptRow,
  type PublisherOfflineCacheSnapshot,
  type PublisherOfflineColdDocumentState,
  type PublisherOfflineDocumentDomProjection,
  type PublisherOfflineDocumentSemanticAuthority,
  type PublisherOfflineHtmlDocumentTree,
  type PublisherOfflineHtmlTreeElementNode,
  type PublisherOfflineHtmlTreeNode,
  type PublisherOfflineInlineSemanticNode,
  type PublisherOfflineSemanticReceiptRow,
} from "./offline-host-proof";

type Mutable<T> = T extends readonly unknown[]
  ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashJson(value: unknown): string {
  return sha256(canonicalizeJson(value as JSONValue));
}

function fixtureHash(label: string): `sha256:${string}` {
  return sha256(`publisher-offline-fixture:${label}`) as `sha256:${string}`;
}

function mutableClone<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

let projection: PublisherThemeHostReaderProjection;
let catalog: ReaderOfflineCatalog;
let cardinalPackage: ReaderOfflinePackage;
let documentAuthorities: readonly PublisherOfflineDocumentSemanticAuthority[];

beforeAll(async () => {
  const proof = await adaptCoherencePublisherContent(
    await loadCoherencePublisherContentAuthorities(),
  );
  projection = createPublisherThemeHostReaderProjection(proof);
  catalog = createReaderOfflineCatalog({
    reader: projection.reader,
    rendererBuildId: PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID,
    catalogHref: PUBLISHER_OFFLINE_CATALOG_HREF,
    sharedResources: Object.freeze([
      Object.freeze({
        href: "/publication-reader-search.json",
        kind: "data" as const,
      }),
      Object.freeze({
        href: "/publication-reader-progress.json",
        kind: "data" as const,
      }),
    ]),
  });
  const selected = catalog.packages.find(({ workId }) =>
    workId === "cardinal-scale"
  );
  if (selected === undefined) {
    throw new TypeError("Cardinal Scale offline package fixture is absent.");
  }
  cardinalPackage = selected;
  documentAuthorities = createPublisherOfflineDocumentSemanticAuthorities(
    projection.reader,
    cardinalPackage,
  );
}, 60_000);

function authorityFor(href: string): PublisherOfflineDocumentSemanticAuthority {
  const authority = documentAuthorities.find((candidate) =>
    candidate.href === href
  );
  if (authority === undefined) {
    throw new TypeError(`No semantic authority for ${href}.`);
  }
  return authority;
}

function semanticRow(
  authority: PublisherOfflineDocumentSemanticAuthority,
  index: number,
  byteAdjustment = 0,
): PublisherOfflineSemanticReceiptRow {
  const targetKind = authority.routeTarget.kind;
  if (targetKind !== "home" && targetKind !== "work" && targetKind !== "section") {
    throw new TypeError("Semantic fixture route target drifted.");
  }
  return Object.freeze({
    href: authority.href,
    kind: "document" as const,
    bytes: 10_000 + index + byteAdjustment,
    status: 200,
    contentType: "text/html; charset=utf-8",
    responseHref: authority.href,
    redirected: false as const,
    identity: "semantic-dom" as const,
    resolvedHref: authority.resolvedHref,
    routeTargetKind: targetKind,
    workId: targetKind === "home"
      ? null
      : authority.routeTarget.workId ?? null,
    sectionId: targetKind === "section"
      ? authority.routeTarget.sectionId ?? null
      : null,
    blockCount: authority.expectedDom.blocks.length,
    linkCount: authority.expectedDom.links.length,
    semanticHash: assertPublisherOfflineDocumentSemanticProjection(
      authority,
      authority.expectedDom,
    ),
  });
}

function byteRow(input: Readonly<{
  href: string;
  kind: "data" | "discovered";
  bytes: number;
  hash: string;
  contentType: string;
}>): PublisherOfflineByteReceiptRow {
  return Object.freeze({
    ...input,
    status: 200,
    responseHref: input.href,
    redirected: false as const,
    identity: "bytes" as const,
  });
}

function dataRow(href: string): PublisherOfflineByteReceiptRow {
  if (href === PUBLISHER_OFFLINE_CATALOG_HREF) {
    return byteRow({
      href,
      kind: "data",
      bytes: PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES,
      hash: PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH,
      contentType:
        "application/vnd.genii.publisher.reader-offline+json; charset=utf-8",
    });
  }
  if (href === "/publication-reader-search.json") {
    return byteRow({
      href,
      kind: "data",
      bytes: PUBLISHER_OFFLINE_EXPECTED_SEARCH_BYTES,
      hash: PUBLISHER_OFFLINE_EXPECTED_SEARCH_HASH,
      contentType: "application/json; charset=utf-8",
    });
  }
  if (href === "/publication-reader-progress.json") {
    return byteRow({
      href,
      kind: "data",
      bytes: PUBLISHER_OFFLINE_EXPECTED_PROGRESS_BYTES,
      hash: PUBLISHER_OFFLINE_EXPECTED_PROGRESS_HASH,
      contentType: "application/json; charset=utf-8",
    });
  }
  throw new TypeError(`Unexpected data fixture ${href}.`);
}

function cacheReceiptFixture(
  firstDocumentByteAdjustment = 0,
): PublisherOfflineCacheReceipt {
  const authorityByHref = new Map(
    documentAuthorities.map((authority) => [authority.href, authority]),
  );
  const rows: PublisherOfflineCacheReceiptRow[] = cardinalPackage.resources.map(
    (resource, index) => {
      if (resource.kind === "data") return dataRow(resource.href);
      if (resource.kind !== "document") {
        throw new TypeError("Cardinal fixture contains a prohibited resource kind.");
      }
      const authority = authorityByHref.get(resource.href);
      if (authority === undefined) {
        throw new TypeError("Cardinal fixture document has no semantic authority.");
      }
      return semanticRow(
        authority,
        index,
        index === 3 ? firstDocumentByteAdjustment : 0,
      );
    },
  );
  rows.push(...FIXTURE_STYLESHEETS.map((stylesheet) => byteRow({
    href: stylesheet.href,
    kind: "discovered",
    bytes: stylesheet.bytes,
    hash: stylesheet.hash,
    contentType: stylesheet.contentType,
  })));
  const declaredResourceHrefs = cardinalPackage.resources.map(({ href }) => href);
  const discoveredResourceHrefs = rows
    .slice(declaredResourceHrefs.length)
    .map(({ href }) => href);
  const basis: Omit<PublisherOfflineCacheReceipt, "hash"> = {
    responseCount: rows.length,
    declaredResourceCount: 17,
    discoveredResourceCount: discoveredResourceHrefs.length,
    declaredResourceHrefs: Object.freeze([...declaredResourceHrefs]),
    discoveredResourceHrefs: Object.freeze([...discoveredResourceHrefs]),
    totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    maximumResponseBytes: PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES,
    maximumTotalBytes: PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES,
    rawHtmlHashCount: 0,
    semanticDocumentCount: 14,
    themeTokensHash: PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH,
    rootThemeStyleHash: PUBLISHER_OFFLINE_EXPECTED_ROOT_THEME_STYLE_HASH,
    stylesheetCount: FIXTURE_STYLESHEETS.length,
    stylesheetHrefs: Object.freeze(
      FIXTURE_STYLESHEETS.map(({ href }) => href),
    ),
    stylesheetHrefsHash: PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH,
    compiledCssHash: PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH,
    rows: Object.freeze(rows),
  };
  return Object.freeze({
    ...basis,
    hash: hashJson(publisherOfflineDurableCacheReceiptBasis(basis)),
  });
}

function rehashReceipt(
  input: Omit<PublisherOfflineCacheReceipt, "hash"> & Readonly<{ hash?: string }>,
): PublisherOfflineCacheReceipt {
  const basis = { ...input };
  delete basis.hash;
  return Object.freeze({
    ...basis,
    hash: hashJson(publisherOfflineDurableCacheReceiptBasis(basis)),
  }) as PublisherOfflineCacheReceipt;
}

function browserEvidenceFixture(
  receipt = cacheReceiptFixture(),
): PublisherOfflineBrowserEvidence {
  return Object.freeze({
    proofSchemaVersion: "1.0",
    browserEngine: "chromium",
    playwrightVersion: PUBLISHER_OFFLINE_EXPECTED_PLAYWRIGHT_VERSION,
    browserVersion: PUBLISHER_OFFLINE_EXPECTED_BROWSER_VERSION,
    browserSource: "bundled Playwright Chromium",
    serviceWorkers: "allow",
    persistentProfile: false,
    preRegistrationCount: 0,
    preInstallCleanBoundaryCount: 2,
    preInstallMetadataRequestCount: 0,
    preInstallPackageCacheCount: 0,
    preInstallCurrentRuntimeCacheCount: 0,
    preInstallSeededCoherenceCacheCount: 5,
    preInstallSeededStaleRuntimeCacheCount: 2,
    controlledRegistrationCount: 1,
    serviceWorkerScopeRoot: true,
    serviceWorkerActiveState: "activated",
    serviceWorkerControllerState: "activated",
    serviceWorkerInstallingState: "absent",
    serviceWorkerWaitingState: "absent",
    serviceWorkerControllerIsActiveWorker: true,
    publisherRegistrationCount: 0,
    publisherCacheCount: 0,
    contextClosed: true,
    browserClosed: true,
    catalog: Object.freeze({
      href: PUBLISHER_OFFLINE_CATALOG_HREF,
      mediaType: "application/vnd.genii.publisher.reader-offline+json",
      cacheControl: "public, max-age=0, must-revalidate",
      bytes: PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES,
      hash: PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH,
      structureHash: PUBLISHER_OFFLINE_EXPECTED_CATALOG_STRUCTURE_HASH,
      cardinalResourcesHash: PUBLISHER_OFFLINE_EXPECTED_CARDINAL_RESOURCES_HASH,
      cardinalHrefOrderHash: PUBLISHER_OFFLINE_EXPECTED_CARDINAL_HREF_ORDER_HASH,
      packageCount: 9,
      resourceDeclarationCount: 618,
      uniqueResourceCount: 586,
      documentResourceCount: 583,
      dataResourceCount: 3,
      assetResourceCount: 0,
      audioResourceCount: 0,
      timingResourceCount: 0,
      audioClipCount: 0,
      cardinalScaleResourceCount: 17,
      packageEvidence: PUBLISHER_OFFLINE_EXPECTED_PACKAGES,
    }),
    worker: Object.freeze({
      path: "/offline-sw.js",
      bytes: PUBLISHER_OFFLINE_EXPECTED_WORKER_BYTES,
      hash: PUBLISHER_OFFLINE_EXPECTED_WORKER_HASH,
      contentType: PUBLISHER_OFFLINE_EXPECTED_WORKER_CONTENT_TYPE,
      cacheControl: PUBLISHER_OFFLINE_EXPECTED_WORKER_CACHE_CONTROL,
      doesNotCache206: true,
      excludesRange: true,
      excludesApi: true,
      excludesAuth: true,
      excludesRsc: true,
      excludesPrefetch: true,
      excludesStateTree: true,
      excludesWorker: true,
    }),
    markdownParser: PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE,
    installedWorkId: "cardinal-scale",
    installedRoute: cardinalPackage.route,
    declaredInstalledResourceCount: 17,
    failedReplacementPreservedPointer: true,
    failedReplacementPreservedCache: true,
    failedReplacementRemovedStagingCache: true,
    inFlightReplacementPreservedPointer: true,
    inFlightReplacementPreservedCache: true,
    inFlightStagingCacheCount: 1,
    replacementFailureHitCount: 1,
    replacementFailurePromiseReleased: true,
    replacementFailureFetchRestored: true,
    replacementFailureHref: receipt.rows.at(-1)?.href ?? "",
    successfulReplacementSwitchedPointer: true,
    successfulReplacementDeletedPriorCache: true,
    coherenceCacheNames: Object.freeze([
      "coherence-offline-metadata-v2",
      "coherence-offline-pack-v2-sentinel",
      "coherence-offline-runtime-v1",
      "coherence-offline-runtime-v2",
      "coherence-offline-v1",
    ]),
    coherenceCacheSnapshotHash: fixtureHash("coherence"),
    coherenceCachesPreserved: true,
    coherenceCachesPreservedAfterCleanup: true,
    coherenceSnapshotBoundaryCount: 6,
    activePackageStateBoundaryCount: 3,
    packageStateMaximumResponseBytes:
      PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES,
    packageStateMaximumAggregateBytes:
      PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES,
    metadataSharesPackageStateAggregate: true,
    postBehaviorPackageStatePreserved: true,
    postColdPackageStatePreserved: true,
    stalePublisherRuntimeCachesDeleted: true,
    browserHttpCacheCleared: true,
    browserHttpCacheClearedBeforeOfflineCutoff: true,
    runtimeCacheEntryCountBeforeCold: 0,
    runtimeCacheEntryCountAfterCold: 0,
    coldOfflineFreshPage: true,
    offlineReaderTextPresent: true,
    coldTextVisibilityBoundaryCount: 2,
    allColdBlockTextNodesVisible: true,
    allColdBlockTextNodesPositiveGeometry: true,
    dormantAudioShellBoundaryCount: 2,
    dormantAudioShellVerified: true,
    unexpectedColdMediaElementCount: 0,
    offlineSearchResultCount: 4,
    offlineSameOriginFullNavigation: true,
    excludedRequestCount: 8,
    excludedRequestsRejected: true,
    offlineRangeInstalledRequestRejected: true,
    rangeResponseStatus: 206,
    rangeResponseBytes: 32,
    rangeResponseNotRuntimeCached: true,
    cacheReceipt: receipt,
    publishedAudio: "absent",
    dormantAudioRuntime: "present-inert",
    audioActivation: "not exercised",
    nativeInstallability: "not asserted",
    currentPublicRoutes: "untouched",
  });
}

function themeSummaryFixture(): PublisherThemeHostProofSummary {
  return {
    proofScope: "isolated Next linkful theme compiler host",
    contentParity: "not asserted",
    adaptedReaderHostVerified: true,
    currentPublicRoutes: "untouched",
    publicationId: "coherence-thesis",
    readerBuildId: PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID,
    contentBuildId: projection.contentBuildId,
    contentEvidenceHash: projection.contentEvidenceHash,
    adaptedApplicationBuildId: projection.adaptedApplicationBuildId,
    applicationBuildId: PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID,
    applicationArtifactHash:
      PUBLISHER_OFFLINE_EXPECTED_APPLICATION_ARTIFACT_HASH,
    routePlanStaticParamCount: 583,
    applicationStaticParamCount: 582,
    readerArtifactCount: 4,
    semanticLinkCount: 21,
    semanticLinkBlockGroupCount: 17,
    catalogChapterRootOwnerCount: 46,
    catalogChapterRootChildCount: 107,
    liveContentPathCount: 47,
    audioDeclaration: "absent",
    audioArtifact: "absent",
    offlineAudioEnvelopeResourceCount: 0,
    baseRoutePresence: true,
    aggregateChapterPageParity: false,
    nestedFragmentParity: false,
    durableFragmentParity: false,
    fullReaderRouteParity: false,
    generatedHostCleanup: "completed",
    themeTokensHash: PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH,
    compiledCssHash: PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH,
  } as PublisherThemeHostProofSummary;
}

function driftEvidence(
  evidence: PublisherOfflineBrowserEvidence,
  patch: Record<string, unknown>,
): PublisherOfflineBrowserEvidence {
  return { ...evidence, ...patch } as PublisherOfflineBrowserEvidence;
}

function driftDom(
  authority: PublisherOfflineDocumentSemanticAuthority,
  mutate: (dom: Mutable<PublisherOfflineDocumentDomProjection>) => void,
): PublisherOfflineDocumentDomProjection {
  const dom = mutableClone(authority.expectedDom);
  mutate(dom);
  return dom as PublisherOfflineDocumentDomProjection;
}

function expectSemanticDrift(
  authority: PublisherOfflineDocumentSemanticAuthority,
  mutate: (dom: Mutable<PublisherOfflineDocumentDomProjection>) => void,
): void {
  expect(() => assertPublisherOfflineDocumentSemanticProjection(
    authority,
    driftDom(authority, mutate),
  )).toThrow(/exact Reader projection/u);
}

function packageStateFixture(input: Readonly<{
  workContentHash?: string;
  cacheName?: string;
  cacheNames?: readonly string[];
  recordHash?: string;
}> = {}): PublisherOfflineBrowserPackageState {
  const cacheName = input.cacheName ??
    "genii-publisher-offline-package-v1-active";
  const resourceHrefs = Object.freeze([
    cardinalPackage.route,
    "/_next/static/chunks/publisher-offline-proof.js",
  ]);
  const record = Object.freeze({
    schemaVersion: 1,
    publicationId: "coherence-thesis",
    workId: "cardinal-scale",
    route: cardinalPackage.route,
    version: Object.freeze({
      readerBuildId: PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID,
      rendererBuildId: PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID,
      workContentHash: input.workContentHash ?? cardinalPackage.version.workContentHash,
      narrationCatalogHash: null,
    }),
    cacheName,
    resourceHrefs,
    savedAt: "2026-08-20T12:00:00.000Z",
  });
  const packageCacheEntries = Object.freeze(resourceHrefs.map((href) =>
    Object.freeze({
      method: "GET",
      href,
      headers: Object.freeze([]),
      responseHref: href,
      redirected: false,
      responseType: "basic",
    })
  ));
  return Object.freeze({
    record,
    recordHash: input.recordHash ?? hashJson(record),
    recordResponseBytes: JSON.stringify(record).length,
    recordResponseStatus: 200,
    recordResponseStatusText: "",
    recordResponseHeaders: Object.freeze([
      Object.freeze(["content-type", "application/json"] as const),
    ]),
    recordResponseHref: "",
    recordResponseRedirected: false,
    recordResponseType: "default",
    metadataCacheRequests: Object.freeze([Object.freeze({
      method: "GET",
      href:
        "https://publisher.invalid/__offline-package__/coherence-thesis/cardinal-scale",
      headers: Object.freeze([]),
    })]),
    cacheName,
    cacheNames: Object.freeze([...(input.cacheNames ?? [cacheName])]),
    packageCacheHash: hashJson(packageCacheEntries),
    packageCacheEntryCount: resourceHrefs.length,
    packageCacheHrefs: resourceHrefs,
    packageCacheEntries,
  });
}

function cacheSnapshotFixture(): PublisherOfflineCacheSnapshot {
  const rows = Object.freeze([Object.freeze({
    cacheName: "coherence-offline-pack-v2-sentinel",
    method: "GET",
    href: "/__coherence-cache-proof__/0",
    requestHeaders: Object.freeze([
      Object.freeze(["accept", "application/octet-stream"] as const),
    ]),
    status: 200,
    statusText: "",
    responseHeaders: Object.freeze([
      Object.freeze(["cache-control", "private, max-age=0"] as const),
      Object.freeze(["x-proof-cache", "coherence-offline-pack-v2-sentinel"] as const),
    ]),
    responseHref: "",
    responseRedirected: false,
    responseType: "default",
    bytes: 32,
    hash: fixtureHash("cache-row"),
  })]);
  return Object.freeze({
    names: Object.freeze(["coherence-offline-pack-v2-sentinel"]),
    hash: hashJson(rows),
    entries: rows,
  });
}

function serviceWorkerStateFixture(): Parameters<
  typeof assertPublisherOfflineServiceWorkerState
>[0] {
  return Object.freeze({
    count: 1,
    origin: "https://publisher.invalid",
    scope: "https://publisher.invalid/",
    activeScript: "https://publisher.invalid/offline-sw.js",
    activeState: "activated",
    installingScript: null,
    waitingScript: null,
    controllerScript: "https://publisher.invalid/offline-sw.js",
    controllerState: "activated",
    controllerIsActive: true,
  });
}

function coldStateFixture(): PublisherOfflineColdDocumentState {
  return Object.freeze({
    online: false,
    controlled: true,
    rootCount: 1,
    pageKind: "section",
    articleCount: 1,
    title: "A Note on the Register",
    rootBlockCount: 1,
    manuscriptBlockCount: 1,
    blockId: "proof-block",
    blockVisibleText: "Visible Cardinal prose with more than eight exact words.",
    blockVisible: true,
    blockHasPositiveArea: true,
    blockTextHasPositiveArea: true,
    allBlockTextNodesVisible: true,
    dormantAudioShellVerified: true,
    unexpectedMediaElementCount: 0,
  });
}

function cacheReceiptWithTwoDiscoveredRows(): PublisherOfflineCacheReceipt {
  const receipt = mutableClone(cacheReceiptFixture());
  const second = byteRow({
    href: "/_next/static/chunks/publisher-offline-proof.js",
    kind: "discovered",
    bytes: 2_048,
    hash: fixtureHash("second-discovered"),
    contentType: "application/javascript; charset=utf-8",
  });
  receipt.rows.push(second);
  receipt.discoveredResourceHrefs.push(second.href);
  receipt.discoveredResourceCount += 1;
  receipt.responseCount += 1;
  receipt.totalBytes += second.bytes;
  return rehashReceipt(receipt);
}

const FIXTURE_STYLESHEETS = Object.freeze([
  Object.freeze({
    href: PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS[0]!,
    path: "static/chunks/080ejmdzsivw2.css",
    bytes: 24_729,
    hash:
      "sha256:92d686386036bc4ac737089e56f319d58844e04f732bcd66618d0d83a8f9f7f4",
    contentType: PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_CONTENT_TYPE,
  }),
  Object.freeze({
    href: PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS[1]!,
    path: "static/chunks/3ghbvhw9w0d8l.css",
    bytes: 15_499,
    hash:
      "sha256:1091eb7aa75e4c08df3f0126a0b7043ef73e21a3f96ed7efa0f6af48b946f491",
    contentType: PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_CONTENT_TYPE,
  }),
]);
const FIXTURE_STYLESHEET_HREF = FIXTURE_STYLESHEETS[0]!.href;
const FIXTURE_THEME_STYLE_DECLARATIONS = Object.freeze([
  ["--publisher-color-canvas", "#F4EAD7"],
  ["--publisher-color-surface", "#FBF6EB"],
  ["--publisher-color-text", "#13202A"],
  ["--publisher-color-muted-text", "#5A666C"],
  ["--publisher-color-accent", "#77542A"],
  ["--publisher-color-focus", "#60796D"],
  ["--publisher-color-border", "#E3D1AD"],
  ["--publisher-font-body", "'Literata', 'Literata Fallback'"],
  ["--publisher-font-heading", "'Literata', 'Literata Fallback'"],
  [
    "--publisher-font-mono",
    "SFMono-Regular, Consolas, Liberation Mono, monospace",
  ],
  [
    "--publisher-reader-default-font-family",
    "'Literata', 'Literata Fallback'",
  ],
  ["--publisher-font-size", "1.12rem"],
  ["--publisher-line-height", "1.78"],
  ["--publisher-reading-measure", "48rem"],
  ["--publisher-page-gutter", "1.5rem"],
  ["--publisher-section-gap", "3rem"],
  ["--publisher-control-radius", "8px"],
].map((row) => Object.freeze([row[0]!, row[1]!] as const)));

function fixtureThemeStyle(): string {
  return FIXTURE_THEME_STYLE_DECLARATIONS
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

function htmlText(value: string): PublisherOfflineHtmlTreeNode {
  return Object.freeze({ type: "text" as const, value });
}

function htmlElement(
  tagName: string,
  attributes: Readonly<Record<string, string>> = {},
  children: readonly PublisherOfflineHtmlTreeNode[] = [],
): PublisherOfflineHtmlTreeElementNode {
  return Object.freeze({
    type: "element" as const,
    tagName,
    attributes: Object.freeze(Object.entries(attributes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => Object.freeze([name, value] as const))),
    children: Object.freeze([...children]),
  });
}

function htmlDocumentTree(
  root: PublisherOfflineHtmlTreeElementNode,
): PublisherOfflineHtmlDocumentTree {
  let nodeCount = 0;
  let maximumDepth = 0;
  let attributeCount = 0;
  let attributeCodeUnits = 0;
  let textCodeUnits = 0;
  const visit = (node: PublisherOfflineHtmlTreeNode, depth: number): void => {
    nodeCount += 1;
    maximumDepth = Math.max(maximumDepth, depth);
    if (node.type === "text") {
      textCodeUnits += node.value.length;
      return;
    }
    attributeCount += node.attributes.length;
    attributeCodeUnits += node.attributes.reduce(
      (sum, [name, value]) => sum + name.length + value.length,
      0,
    );
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(root, 1);
  return Object.freeze({
    root,
    nodeCount,
    maximumDepth,
    attributeCount,
    attributeCodeUnits,
    textCodeUnits,
  });
}

function cardinalOwnedDomIds(): readonly string[] {
  const cardinal = projection.reader.works.find(({ id }) =>
    id === "cardinal-scale"
  );
  if (cardinal === undefined) {
    throw new TypeError("Cardinal Reader fixture is absent.");
  }
  return Object.freeze(cardinal.sections.flatMap((section) => [
    section.domId,
    ...section.blocks.map(({ domId }) => domId),
  ]).filter((value): value is string => value !== null));
}

function projectFixtureTree(
  tree: PublisherOfflineHtmlDocumentTree,
): PublisherOfflineDocumentDomProjection {
  const input = { cardinalOwnedDomIds: cardinalOwnedDomIds() };
  projectPublisherOfflineDocumentHostStyle(tree, input);
  return projectPublisherOfflineDocumentTree(tree, input);
}

function headingWrapperTree(
  wrapper: PublisherOfflineDocumentDomProjection["titleWrappers"][number],
  heading: PublisherOfflineHtmlTreeElementNode,
): PublisherOfflineHtmlTreeElementNode {
  const action = wrapper.actions[0];
  if (action === undefined) {
    throw new TypeError("Heading wrapper action fixture is absent.");
  }
  return htmlElement("div", { class: wrapper.className }, [
    heading,
    htmlElement("button", {
      "aria-label": action.ariaLabel,
      class: action.className,
      "data-publisher-heading-href": action.href,
      "data-publisher-reader-transient-ui": action.transient,
      hidden: "",
      title: action.title,
      type: action.buttonType,
    }, [htmlElement("svg", { viewBox: "0 0 24 24" })]),
  ]);
}

function inlineSemanticTree(
  node: PublisherOfflineInlineSemanticNode,
): PublisherOfflineHtmlTreeNode {
  if (node.type === "text") return htmlText(node.value);
  const children = node.children.map(inlineSemanticTree);
  const hasBlockChildren = children.some((child) =>
    child.type === "element" && [
      "p",
      "blockquote",
      "ul",
      "ol",
    ].includes(child.tagName)
  );
  const formattedChildren = node.tagName === "ul" || node.tagName === "ol" ||
      node.tagName === "blockquote" ||
      (node.tagName === "li" && hasBlockChildren)
    ? [htmlText("\n"), ...children.flatMap((child) => [
        child,
        htmlText("\n"),
      ])]
    : children;
  return htmlElement(
    node.tagName,
    Object.fromEntries(node.attributes),
    formattedChildren,
  );
}

function inlineSemanticHasTag(
  node: PublisherOfflineInlineSemanticNode,
  tagName: string,
): boolean {
  return node.type === "element" && (
    node.tagName === tagName ||
    node.children.some((child) => inlineSemanticHasTag(child, tagName))
  );
}

function inlineSemanticChildren(
  node: PublisherOfflineDocumentDomProjection["blocks"][number]["inlineSemantics"],
): readonly PublisherOfflineHtmlTreeNode[] {
  return node.children.map(inlineSemanticTree);
}

function readerBlockTree(
  block: PublisherOfflineDocumentDomProjection["blocks"][number],
): PublisherOfflineHtmlTreeElementNode {
  const attributes: Record<string, string> = {
    "data-publisher-block": block.id,
  };
  if (block.domId !== null) attributes.id = block.domId;
  if (block.tagName === "div") attributes.class = "publisher-markdown";
  let children: readonly PublisherOfflineHtmlTreeNode[];
  if (/^h[1-6]$/u.test(block.tagName)) {
    if (block.inlineSemantics.tagName !== block.tagName) {
      throw new TypeError("Owning heading inline fixture drifted.");
    }
    children = inlineSemanticChildren(block.inlineSemantics);
  } else {
    const semanticRoot = inlineSemanticTree(block.inlineSemantics);
    if (semanticRoot.type !== "element") {
      throw new TypeError("Block inline fixture root drifted.");
    }
    const wrapper = block.headingWrappers[0];
    children = [wrapper === undefined
      ? semanticRoot
      : headingWrapperTree(wrapper, semanticRoot)];
  }
  if (block.className !== "") attributes.class = block.className;
  return htmlElement(block.tagName, attributes, children);
}

function routeHeadingTree(
  authority: PublisherOfflineDocumentSemanticAuthority,
): PublisherOfflineHtmlTreeElementNode {
  const routeBlock = authority.expectedDom.blocks.find((block) =>
    block.tagName === "h1" && block.kind === "heading"
  );
  const attributes: Record<string, string> = {};
  if (routeBlock !== undefined) {
    attributes["data-publisher-block"] = routeBlock.id;
    if (routeBlock.domId !== null) attributes.id = routeBlock.domId;
  }
  const heading = htmlElement("h1", attributes, [
    ...(routeBlock === undefined
      ? [htmlText(authority.expectedDom.title)]
      : inlineSemanticChildren(routeBlock.inlineSemantics)),
  ]);
  const wrapper = authority.expectedDom.titleWrappers[0];
  return wrapper === undefined ? heading : headingWrapperTree(wrapper, heading);
}

function sectionOwnerTree(
  authority: PublisherOfflineDocumentSemanticAuthority,
  owner: PublisherOfflineDocumentDomProjection["sectionOwners"][number],
): PublisherOfflineHtmlTreeElementNode {
  const blockById = new Map(authority.expectedDom.blocks.map((block) => [
    block.id,
    block,
  ]));
  const children = owner.directChildren.map((child) => {
    if (child.className === "publisher-linkable-heading") {
      const title = owner.titleHeading;
      const wrapper = title?.wrappers[0];
      const block = title?.blockId === null || title?.blockId === undefined
        ? undefined
        : blockById.get(title.blockId);
      if (title === null || title === undefined || wrapper === undefined) {
        throw new TypeError("Wrapped section title fixture drifted.");
      }
      const headingAttributes: Record<string, string> = {
        class: "publisher-section-title",
      };
      if (block !== undefined) {
        headingAttributes["data-publisher-block"] = block.id;
        if (block.domId !== null) headingAttributes.id = block.domId;
      }
      return headingWrapperTree(
        wrapper,
        htmlElement(
          title.tagName,
          headingAttributes,
          block === undefined
            ? [htmlText(title.text)]
            : inlineSemanticChildren(block.inlineSemantics),
        ),
      );
    }
    if (child.className === "publisher-section-title") {
      const title = owner.titleHeading;
      if (title === null) {
        throw new TypeError("Direct section title fixture drifted.");
      }
      return htmlElement(title.tagName, {
        class: "publisher-section-title",
      }, [htmlText(title.text)]);
    }
    const blockId = child.ownedBlockIds[0];
    const block = blockId === undefined ? undefined : blockById.get(blockId);
    if (block === undefined) {
      throw new TypeError("Section block fixture drifted.");
    }
    return readerBlockTree(block);
  });
  return htmlElement("section", {
    class: "publisher-manuscript-section",
    "data-publisher-section": owner.id,
    ...(owner.domId === null ? {} : { id: owner.domId }),
  }, children);
}

function breadcrumbTree(
  breadcrumb: PublisherOfflineDocumentDomProjection["breadcrumbs"][number],
): PublisherOfflineHtmlTreeElementNode {
  return htmlElement("nav", {
    "aria-label": breadcrumb.ariaLabel,
    class: breadcrumb.className,
  }, [htmlElement("ol", {}, breadcrumb.items.map((item) =>
    htmlElement("li", {}, [item.tagName === "a"
      ? htmlElement("a", { href: item.href ?? "" }, [htmlText(item.text)])
      : htmlElement("span", { "aria-current": item.ariaCurrent ?? "" }, [
          htmlText(item.text),
        ])]))) ]);
}

function sectionNavigationTree(
  navigation:
    PublisherOfflineDocumentDomProjection["sectionNavigations"][number],
): PublisherOfflineHtmlTreeElementNode {
  return htmlElement("nav", {
    "aria-label": navigation.ariaLabel,
    class: navigation.className,
    lang: navigation.language,
  }, navigation.slots.map((slot) => {
    if (slot.tagName === "span") return htmlElement("span");
    const prefix = slot.title === null
      ? slot.text
      : slot.text.slice(0, -slot.title.length);
    return htmlElement("a", { href: slot.href ?? "" }, [
      htmlText(prefix),
      ...(slot.title === null
        ? []
        : [htmlElement("span", { lang: slot.titleLanguage ?? "" }, [
            htmlText(slot.title),
          ])]),
    ]);
  }));
}

const FIXTURE_READER_RAIL_BUTTONS = Object.freeze([
  Object.freeze({
    label: "Contents",
    icons: Object.freeze([
      Object.freeze({ tagName: "path", attributes: Object.freeze({
        d: "M5 6h14M5 12h14M5 18h14",
      }) }),
    ]),
  }),
  Object.freeze({
    label: "Progress",
    icons: Object.freeze([
      Object.freeze({ tagName: "path", attributes: Object.freeze({
        d: "M12 3a9 9 0 1 1-9 9",
      }) }),
      Object.freeze({ tagName: "path", attributes: Object.freeze({
        d: "M12 7v5l3 2",
      }) }),
    ]),
  }),
  Object.freeze({
    label: "Listen",
    icons: Object.freeze([
      Object.freeze({ tagName: "path", attributes: Object.freeze({
        d: "M5 10v4h3l4 3V7L8 10Z",
      }) }),
      Object.freeze({ tagName: "path", attributes: Object.freeze({
        d: "M16 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12",
      }) }),
    ]),
  }),
  Object.freeze({
    label: "Search",
    icons: Object.freeze([
      Object.freeze({ tagName: "circle", attributes: Object.freeze({
        cx: "11",
        cy: "11",
        r: "6",
      }) }),
      Object.freeze({ tagName: "path", attributes: Object.freeze({
        d: "m16 16 4 4",
      }) }),
    ]),
  }),
  Object.freeze({
    label: "Offline",
    icons: Object.freeze([
      Object.freeze({ tagName: "path", attributes: Object.freeze({
        d: "M7 17a4 4 0 0 1 0-8 5 5 0 0 1 9.6 1.4A3.5 3.5 0 1 1 17.5 17Z",
      }) }),
      Object.freeze({ tagName: "path", attributes: Object.freeze({
        d: "M12 10v7M9.5 14.5 12 17l2.5-2.5",
      }) }),
    ]),
  }),
  Object.freeze({
    label: "Bookmarks",
    icons: Object.freeze([
      Object.freeze({ tagName: "path", attributes: Object.freeze({
        d: "M7 4h10v16l-5-3-5 3Z",
      }) }),
    ]),
  }),
  Object.freeze({
    label: "Settings",
    icons: Object.freeze([
      Object.freeze({ tagName: "path", attributes: Object.freeze({
        d: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6",
      }) }),
    ]),
  }),
]);

function readerRailTree(
  progressAriaLabel: "Publication tools" | "0% read",
): PublisherOfflineHtmlTreeElementNode {
  const sharedPanelId = "_R_3e_";
  const narrationPanelId = "_R_2_";
  return htmlElement("aside", {
    "aria-label": "Reader tools",
    class: "publisher-reader-rail",
  }, [
    htmlElement("div", {
      "aria-label": progressAriaLabel,
      class: "publisher-reader-rail-progress",
    }, [htmlElement("span", { "aria-hidden": "true" }, [htmlText("§")])]),
    htmlElement("div", { class: "publisher-reader-rail-actions" },
      FIXTURE_READER_RAIL_BUTTONS.map((button) => htmlElement("button", {
        "aria-controls": button.label === "Listen"
          ? narrationPanelId
          : sharedPanelId,
        "aria-expanded": "false",
        type: "button",
      }, [
        htmlElement("svg", {
          "aria-hidden": "true",
          viewBox: "0 0 24 24",
        }, button.icons.map((icon) => htmlElement(
          icon.tagName,
          icon.attributes,
        ))),
        htmlElement("span", {}, [htmlText(button.label)]),
      ]))),
  ]);
}

function dormantNarrationAudioHostTree(): PublisherOfflineHtmlTreeElementNode {
  return htmlElement("div", {
    class: "publisher-reader-audio-host",
    style: fixtureThemeStyle(),
  }, [htmlElement("audio", { preload: "metadata" })]);
}

function nextStreamingPlaceholderTree(): PublisherOfflineHtmlTreeElementNode {
  return htmlElement("div", { hidden: "" });
}

function publisherShellTree(
  authority: PublisherOfflineDocumentSemanticAuthority,
  main: PublisherOfflineHtmlTreeElementNode,
): PublisherOfflineHtmlDocumentTree {
  const root = htmlElement("div", {
    class: "publisher-root",
    "data-publisher-page": authority.expectedDom.pageKind,
    style: fixtureThemeStyle(),
  }, [
    htmlElement("a", {
      class: "publisher-skip-link",
      href: "#publisher:main",
      lang: "en",
    }, [htmlText("Skip to content")]),
    htmlElement("header", { class: "publisher-site-header" }),
    readerRailTree(authority.expectedDom.readerRailProgressAriaLabel),
    main,
    htmlElement("footer", {
      class: "publisher-attribution",
      "data-publisher-attribution": "required",
      lang: "en",
    }),
  ]);
  return htmlDocumentTree(htmlElement("html", {
    lang: authority.expectedDom.documentLanguage,
  }, [
    htmlElement("head", {}, FIXTURE_STYLESHEETS.map(({ href }) =>
      htmlElement("link", { href, rel: "stylesheet" })
    )),
    htmlElement("body", {}, [
      nextStreamingPlaceholderTree(),
      root,
      dormantNarrationAudioHostTree(),
    ]),
  ]));
}

function homeDocumentTree(
  authority: PublisherOfflineDocumentSemanticAuthority,
): PublisherOfflineHtmlDocumentTree {
  const home = authority.expectedDom;
  const works = home.homeWorksSections[0];
  if (works === undefined) {
    throw new TypeError("Home Works fixture is absent.");
  }
  const cards = works.cards.map((card) => htmlElement("li", {
    lang: card.language,
  }, [
    htmlElement("h3", {}, [htmlElement("a", { href: card.route }, [
      htmlText(card.title),
    ])]),
    ...card.details.map((detail) => htmlElement("p", {}, [htmlText(detail)])),
    htmlElement("p", {
      class: "publisher-reading-stat",
      lang: card.readingStatLanguage,
    }, [htmlText(card.readingStat)]),
  ]));
  const main = htmlElement("main", { id: "publisher:main" }, [
    htmlElement("h1", {}, [htmlText(home.title)]),
    ...(home.publicationDescription === null
      ? []
      : [htmlElement("p", {
          class: "publisher-publication-description",
        }, [htmlText(home.publicationDescription)])]),
    htmlElement("section", {
      "aria-labelledby": works.ariaLabelledBy,
    }, [
      htmlElement("h2", {
        id: works.heading.id,
        lang: works.heading.language,
      }, [htmlText(works.heading.text)]),
      htmlElement("ol", { class: works.listClassName }, cards),
    ]),
  ]);
  return publisherShellTree(authority, main);
}

function ownedDocumentTree(
  authority: PublisherOfflineDocumentSemanticAuthority,
): PublisherOfflineHtmlDocumentTree {
  const dom = authority.expectedDom;
  const owner = dom.workOwners[0];
  if (owner === undefined) {
    throw new TypeError("Owned document fixture has no work owner.");
  }
  const headerChildren: PublisherOfflineHtmlTreeNode[] = [];
  if (dom.pageKind === "section") {
    const breadcrumb = dom.breadcrumbs[0];
    if (breadcrumb === undefined) {
      throw new TypeError("Section breadcrumb fixture is absent.");
    }
    headerChildren.push(breadcrumbTree(breadcrumb));
  }
  headerChildren.push(routeHeadingTree(authority));
  if (owner.subtitle !== null) {
    headerChildren.push(htmlElement("p", {
      class: "publisher-work-subtitle",
    }, [htmlText(owner.subtitle)]));
  }
  if (owner.summary !== null) {
    headerChildren.push(htmlElement("p", {}, [htmlText(owner.summary)]));
  }
  const manuscript = htmlElement("div", { class: "publisher-manuscript" },
    dom.sectionOwners.map((section) => sectionOwnerTree(authority, section)));
  const articleChildren: PublisherOfflineHtmlTreeNode[] = [
    htmlElement("header", {}, headerChildren),
    manuscript,
  ];
  const navigation = dom.sectionNavigations[0];
  if (navigation !== undefined) {
    articleChildren.push(sectionNavigationTree(navigation));
  }
  const article = htmlElement("article", {
    "data-publisher-work": owner.id,
    lang: owner.language,
  }, articleChildren);
  const main = htmlElement("main", { id: "publisher:main" }, [article]);
  return publisherShellTree(authority, main);
}

function documentTreeFixture(
  authority: PublisherOfflineDocumentSemanticAuthority,
): PublisherOfflineHtmlDocumentTree {
  return authority.expectedDom.pageKind === "home"
    ? homeDocumentTree(authority)
    : ownedDocumentTree(authority);
}

function mutableTreeFixture(
  authority: PublisherOfflineDocumentSemanticAuthority,
): Mutable<PublisherOfflineHtmlDocumentTree> {
  return mutableClone(documentTreeFixture(authority));
}

function treeElements(
  tree: PublisherOfflineHtmlDocumentTree,
): PublisherOfflineHtmlTreeElementNode[] {
  const output: PublisherOfflineHtmlTreeElementNode[] = [];
  const visit = (node: PublisherOfflineHtmlTreeNode): void => {
    if (node.type === "text") return;
    output.push(node);
    for (const child of node.children) visit(child);
  };
  visit(tree.root);
  return output;
}

function treeAttribute(
  element: PublisherOfflineHtmlTreeElementNode,
  name: string,
): string | null {
  return element.attributes.find(([candidate]) => candidate === name)?.[1] ??
    null;
}

function refinalizeTree(
  tree: Mutable<PublisherOfflineHtmlDocumentTree>,
): PublisherOfflineHtmlDocumentTree {
  return htmlDocumentTree(
    tree.root as PublisherOfflineHtmlTreeElementNode,
  );
}

function findTreeElement(
  tree: PublisherOfflineHtmlDocumentTree,
  predicate: (element: PublisherOfflineHtmlTreeElementNode) => boolean,
): PublisherOfflineHtmlTreeElementNode {
  const result = treeElements(tree).find(predicate);
  if (result === undefined) {
    throw new TypeError("Rendered tree fixture element is absent.");
  }
  return result;
}

function findMutableTreeElement(
  tree: Mutable<PublisherOfflineHtmlDocumentTree>,
  predicate: (element: PublisherOfflineHtmlTreeElementNode) => boolean,
): Mutable<PublisherOfflineHtmlTreeElementNode> {
  return findTreeElement(
    tree as PublisherOfflineHtmlDocumentTree,
    predicate,
  ) as Mutable<PublisherOfflineHtmlTreeElementNode>;
}

function setTreeAttribute(
  element: Mutable<PublisherOfflineHtmlTreeElementNode>,
  name: string,
  value: string | null,
): void {
  const index = element.attributes.findIndex(([candidate]) => candidate === name);
  if (value === null) {
    if (index >= 0) element.attributes.splice(index, 1);
  } else if (index >= 0) {
    element.attributes[index] = [name, value];
  } else {
    element.attributes.push([name, value]);
  }
  element.attributes.sort(([left], [right]) => left.localeCompare(right));
}

function replaceFirstTreeText(
  element: Mutable<PublisherOfflineHtmlTreeElementNode>,
  value: string,
): void {
  const visit = (node: Mutable<PublisherOfflineHtmlTreeNode>): boolean => {
    if (node.type === "text") {
      node.value = value;
      return true;
    }
    return node.children.some(visit);
  };
  if (!element.children.some(visit)) {
    throw new TypeError("Rendered tree fixture text is absent.");
  }
}

function wrapFirstTreeText(
  element: Mutable<PublisherOfflineHtmlTreeElementNode>,
  tagName: string,
  attributes: Record<string, string> = {},
): void {
  const visit = (node: Mutable<PublisherOfflineHtmlTreeNode>): boolean => {
    if (node.type === "text") return false;
    const index = node.children.findIndex((child) => child.type === "text");
    if (index >= 0) {
      const textNode = node.children[index];
      if (textNode?.type !== "text") {
        throw new TypeError("Rendered tree text fixture drifted.");
      }
      node.children.splice(
        index,
        1,
        htmlElement(tagName, attributes, [htmlText(textNode.value)]) as
          Mutable<PublisherOfflineHtmlTreeNode>,
      );
      return true;
    }
    return node.children.some(visit);
  };
  if (!visit(element)) {
    throw new TypeError("Rendered tree fixture text is absent.");
  }
}

function findMutableTreeDescendant(
  element: Mutable<PublisherOfflineHtmlTreeElementNode>,
  predicate: (candidate: Mutable<PublisherOfflineHtmlTreeElementNode>) => boolean,
): Mutable<PublisherOfflineHtmlTreeElementNode> {
  const visit = (
    node: Mutable<PublisherOfflineHtmlTreeNode>,
  ): Mutable<PublisherOfflineHtmlTreeElementNode> | undefined => {
    if (node.type === "text") return undefined;
    if (node !== element && predicate(node)) return node;
    for (const child of node.children) {
      const result = visit(child);
      if (result !== undefined) return result;
    }
    return undefined;
  };
  const result = visit(element);
  if (result === undefined) {
    throw new TypeError("Rendered tree descendant fixture is absent.");
  }
  return result;
}

function replaceTreeElementWithChildren(
  tree: Mutable<PublisherOfflineHtmlDocumentTree>,
  target: Mutable<PublisherOfflineHtmlTreeElementNode>,
): void {
  const visit = (node: Mutable<PublisherOfflineHtmlTreeNode>): boolean => {
    if (node.type === "text") return false;
    const index = node.children.indexOf(target);
    if (index >= 0) {
      node.children.splice(index, 1, ...target.children);
      return true;
    }
    return node.children.some(visit);
  };
  if (!visit(tree.root)) {
    throw new TypeError("Rendered tree fixture parent is absent.");
  }
}

function removeTreeElement(
  tree: Mutable<PublisherOfflineHtmlDocumentTree>,
  target: Mutable<PublisherOfflineHtmlTreeElementNode>,
): void {
  const visit = (node: Mutable<PublisherOfflineHtmlTreeNode>): boolean => {
    if (node.type === "text") return false;
    const index = node.children.indexOf(target);
    if (index >= 0) {
      node.children.splice(index, 1);
      return true;
    }
    return node.children.some(visit);
  };
  if (!visit(tree.root)) {
    throw new TypeError("Rendered tree fixture parent is absent.");
  }
}

function expectRenderedTreeDrift(
  authority: PublisherOfflineDocumentSemanticAuthority,
  mutate: (tree: Mutable<PublisherOfflineHtmlDocumentTree>) => void,
): void {
  const tree = mutableTreeFixture(authority);
  mutate(tree);
  const projection = projectFixtureTree(refinalizeTree(tree));
  expect(() => assertPublisherOfflineDocumentSemanticProjection(
    authority,
    projection,
  )).toThrow(/exact Reader projection/u);
}

function expectRenderedTreeRejected(
  authority: PublisherOfflineDocumentSemanticAuthority,
  mutate: (tree: Mutable<PublisherOfflineHtmlDocumentTree>) => void,
): void {
  expect(() => {
    const tree = mutableTreeFixture(authority);
    mutate(tree);
    const projection = projectFixtureTree(refinalizeTree(tree));
    assertPublisherOfflineDocumentSemanticProjection(authority, projection);
  }).toThrow();
}

function expectReceiptEvidenceDrift(
  mutate: (receipt: Mutable<PublisherOfflineCacheReceipt>) => void,
  receipt: PublisherOfflineCacheReceipt = cacheReceiptFixture(),
): void {
  const forged = mutableClone(receipt);
  mutate(forged);
  const rehashed = rehashReceipt(forged);
  expect(() => assertPublisherOfflineBrowserEvidence(
    browserEvidenceFixture(rehashed),
  )).toThrow();
}

const serializedCallbackIndexByMethod = new Map<string, number>([
  ["addInitScript", 0],
  ["evaluate", 0],
  ["evaluateAll", 0],
  ["evaluateHandle", 0],
  ["waitForFunction", 0],
  ["$eval", 1],
  ["$$eval", 1],
]);

type BrowserCallbackInspection = Readonly<{
  count: number;
  unguarded: readonly number[];
  transformLeaks: readonly number[];
  captures: readonly Readonly<{ line: number; name: string }>[];
}>;

function inspectSerializedBrowserCallbacks(
  source: string,
): BrowserCallbackInspection {
  const transformed = transformSync(source, {
    format: "esm",
    keepNames: true,
    loader: "ts",
    sourcemap: false,
    target: "node22",
  }).code;
  const fileName = "/virtual/offline-host-proof.transformed.js";
  const options: ts.CompilerOptions = {
    allowJs: true,
    checkJs: false,
    module: ts.ModuleKind.ESNext,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.ESNext,
  };
  const syntax = ts.createSourceFile(
    fileName,
    transformed,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const baseHost = ts.createCompilerHost(options, true);
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: (candidate) => candidate === fileName ||
      baseHost.fileExists(candidate),
    getSourceFile: (candidate, languageVersion, onError, shouldCreateNew) =>
      candidate === fileName
        ? syntax
        : baseHost.getSourceFile(
          candidate,
          languageVersion,
          onError,
          shouldCreateNew,
        ),
    readFile: (candidate) => candidate === fileName
      ? transformed
      : baseHost.readFile(candidate),
  };
  const program = ts.createProgram([fileName], options, host);
  const sourceFile = program.getSourceFile(fileName);
  if (sourceFile === undefined) {
    throw new TypeError("Transformed Publisher proof source is absent.");
  }
  const checker = program.getTypeChecker();
  let count = 0;
  const unguarded: number[] = [];
  const transformLeaks: number[] = [];
  const captures: Array<{ line: number; name: string }> = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const callbackIndex = serializedCallbackIndexByMethod.get(
        node.expression.name.text,
      );
      if (callbackIndex !== undefined) {
        count += 1;
        const argument = node.arguments[callbackIndex];
        const line = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        ).line + 1;
        const guarded = argument !== undefined &&
          ts.isCallExpression(argument) &&
          ts.isIdentifier(argument.expression) &&
          argument.expression.text ===
            "assertPublisherOfflineSerializableBrowserCallback" &&
          argument.arguments.length === 1;
        if (!guarded) {
          unguarded.push(line);
        } else {
          const callback = argument.arguments[0];
          if (callback === undefined) {
            throw new TypeError("Guarded Publisher browser callback is absent.");
          }
          const callbackStart = callback.getStart(sourceFile);
          const callbackEnd = callback.getEnd();
          const inspectCallback = (child: ts.Node): void => {
            if (ts.isIdentifier(child)) {
              if (child.text === "__name") transformLeaks.push(line);
              const symbol = checker.getSymbolAtLocation(child);
              const sameSourceDeclarations = (symbol?.declarations ?? [])
                .filter((declaration) =>
                  declaration.getSourceFile() === sourceFile
                );
              const declaredInsideCallback = sameSourceDeclarations.some(
                (declaration) =>
                  declaration.getStart(sourceFile) >= callbackStart &&
                  declaration.getEnd() <= callbackEnd,
              );
              if (
                sameSourceDeclarations.length > 0 &&
                !declaredInsideCallback
              ) {
                captures.push({ line, name: child.text });
              }
            }
            ts.forEachChild(child, inspectCallback);
          };
          inspectCallback(callback);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return {
    count,
    unguarded: Object.freeze([...new Set(unguarded)]),
    transformLeaks: Object.freeze([...new Set(transformLeaks)]),
    captures: Object.freeze([
      ...new Map(
        captures.map((row) => [`${row.line}:${row.name}`, row]),
      ).values(),
    ]),
  };
}

describe("Publisher isolated offline host proof", () => {
  it("accepts the exact official 9-package, 618-declaration catalog", () => {
    const evidence = assertPublisherOfflineCatalogStructure(
      catalog,
      projection.reader,
    );
    expect(evidence).toMatchObject({
      packageCount: 9,
      resourceDeclarationCount: 618,
      uniqueResourceCount: 586,
      documentResourceCount: 583,
      dataResourceCount: 3,
      audioResourceCount: 0,
      timingResourceCount: 0,
      cardinalScaleResourceCount: 17,
    });
    expect(hashJson(catalog)).toBe(
      PUBLISHER_OFFLINE_EXPECTED_CATALOG_STRUCTURE_HASH,
    );
    expect(hashJson(cardinalPackage.resources)).toBe(
      PUBLISHER_OFFLINE_EXPECTED_CARDINAL_RESOURCES_HASH,
    );
    expect(hashJson(cardinalPackage.resources.map(({ href }) => href))).toBe(
      PUBLISHER_OFFLINE_EXPECTED_CARDINAL_HREF_ORDER_HASH,
    );
    expect(cardinalPackage.resources.map(({ href }) => href)).toEqual([
      PUBLISHER_OFFLINE_CATALOG_HREF,
      "/publication-reader-search.json",
      "/publication-reader-progress.json",
      cardinalPackage.route,
      "/",
      ...cardinalPackage.resources.slice(5).map(({ href }) => href),
    ]);
  });

  it("rejects same-count catalog route swaps, order drift, and kind drift", () => {
    const swap = mutableClone(catalog);
    const firstResources = swap.packages[0]?.resources;
    const secondResources = swap.packages[1]?.resources;
    if (firstResources === undefined || secondResources === undefined) {
      throw new TypeError("Catalog fixture packages are absent.");
    }
    const firstDocument = firstResources.findIndex(({ kind }) =>
      kind === "document"
    );
    const secondDocument = secondResources.findIndex(({ kind }) =>
      kind === "document"
    );
    const first = firstResources[firstDocument];
    const second = secondResources[secondDocument];
    if (first === undefined || second === undefined) {
      throw new TypeError("Catalog fixture documents are absent.");
    }
    firstResources[firstDocument] = { ...first, href: second.href };
    secondResources[secondDocument] = { ...second, href: first.href };

    const reordered = mutableClone(catalog);
    const cardinalResources = reordered.packages.at(-1)?.resources;
    if (cardinalResources === undefined) {
      throw new TypeError("Cardinal resources are absent.");
    }
    [cardinalResources[0], cardinalResources[1]] = [
      cardinalResources[1]!,
      cardinalResources[0]!,
    ];

    const relabeled = mutableClone(catalog);
    const relabeledCardinal = relabeled.packages.at(-1)?.resources;
    if (relabeledCardinal?.[3] === undefined) {
      throw new TypeError("Cardinal document is absent.");
    }
    relabeledCardinal[3] = { ...relabeledCardinal[3], kind: "data" };

    for (const forged of [swap, reordered, relabeled]) {
      expect(() => assertPublisherOfflineCatalogStructure(
        forged as ReaderOfflineCatalog,
        projection.reader,
      )).toThrow(/official Reader projection/u);
    }
  });

  it("binds canonical catalog bytes and response headers", () => {
    const body = new TextEncoder().encode(serializeReaderOfflineCatalog(catalog));
    expect(body.byteLength).toBe(PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES);
    expect(sha256(body)).toBe(PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH);
    expect(() => assertPublisherOfflineCatalogResponse({
      body,
      cacheControl: "public, max-age=0, must-revalidate",
      contentType:
        "application/vnd.genii.publisher.reader-offline+json; charset=utf-8",
      reader: projection.reader,
    })).not.toThrow();
    for (const drift of [
      { cacheControl: "no-store" },
      { contentType: "application/json" },
    ]) {
      expect(() => assertPublisherOfflineCatalogResponse({
        body,
        cacheControl: "public, max-age=0, must-revalidate",
        contentType:
          "application/vnd.genii.publisher.reader-offline+json; charset=utf-8",
        reader: projection.reader,
        ...drift,
      })).toThrow(/catalog response identity drifted/u);
    }
  });

  it("pins the generated worker, early Range refusal, and exact headers", () => {
    const template = createPublisherNextHostTemplate({
      hostPackageName: "publisher-offline-proof-unit",
      dependencies: {},
      devDependencies: {},
      overrides: {},
    });
    const workers = template.files.filter(
      ({ path }) => path === "public/offline-sw.js",
    );
    expect(workers).toHaveLength(1);
    const worker = workers[0];
    if (worker === undefined) {
      throw new TypeError("Publisher host template has no offline worker.");
    }
    const body = new TextEncoder().encode(worker.contents);
    expect(body.byteLength).toBe(PUBLISHER_OFFLINE_EXPECTED_WORKER_BYTES);
    expect(sha256(body)).toBe(PUBLISHER_OFFLINE_EXPECTED_WORKER_HASH);
    expect(() => assertPublisherOfflineWorkerResponse({
      body,
      cacheControl: PUBLISHER_OFFLINE_EXPECTED_WORKER_CACHE_CONTROL,
      contentType: PUBLISHER_OFFLINE_EXPECTED_WORKER_CONTENT_TYPE,
    })).not.toThrow();
    expect(worker.contents.indexOf(
      'if (request.headers.has("range")) return false;',
    )).toBeLessThan(worker.contents.indexOf("const url = new URL(request.url);"));
    for (const drift of [
      { cacheControl: "no-store" },
      { contentType: "text/javascript" },
      { body: new TextEncoder().encode(worker.contents.replace(
        'if (request.headers.has("range")) return false;',
        "",
      )) },
    ]) {
      expect(() => assertPublisherOfflineWorkerResponse({
        body,
        cacheControl: PUBLISHER_OFFLINE_EXPECTED_WORKER_CACHE_CONTROL,
        contentType: PUBLISHER_OFFLINE_EXPECTED_WORKER_CONTENT_TYPE,
        ...drift,
      })).toThrow(/service worker identity drifted/u);
    }
  });

  it("pins bundled Chromium and keeps the accepted entry point no-argument", () => {
    expect(publisherOfflineChromiumLaunchOptions()).toEqual({ headless: true });
    expect(Object.keys(publisherOfflineChromiumLaunchOptions())).toEqual([
      "headless",
    ]);
    expect(() => assertPublisherOfflinePlaywrightAuthority({
      playwrightVersion: PUBLISHER_OFFLINE_EXPECTED_PLAYWRIGHT_VERSION,
      browserEngine: "chromium",
      browserVersion: PUBLISHER_OFFLINE_EXPECTED_BROWSER_VERSION,
    })).not.toThrow();
    expect(() => assertPublisherOfflinePlaywrightAuthority({
      playwrightVersion: "1.61.2",
      browserEngine: "chromium",
      browserVersion: PUBLISHER_OFFLINE_EXPECTED_BROWSER_VERSION,
    })).toThrow(/exact bundled Playwright Chromium/u);
    expect(runPublisherOfflineHostProof.length).toBe(0);
    expect(() => assertPublisherOfflineCliArguments([])).not.toThrow();
    expect(() => assertPublisherOfflineCliArguments(["proof"])).toThrow(
      "Usage: offline-host-proof.ts",
    );
  });

  it("pins the full Markdown closure before its first semantic use", () => {
    expect(assertPublisherOfflineMarkdownParserAuthority()).toEqual(
      PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE,
    );
    expect(() => assertPublisherOfflineMarkdownParserEvidence(
      PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE,
    )).not.toThrow();
    expect(PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE).toMatchObject({
      dependencyClosure: {
        packageCount: 34,
        fileCount: 475,
        totalBytes: 1_161_651,
        canonicalBytes: 71_633,
      },
      readerLinkApplication: {
        bytes: 18_254,
        sourceClosure: {
          fileCount: 3,
          totalBytes: 30_762,
          canonicalBytes: 480,
        },
        dependencyClosure: {
          packageCount: 34,
          fileCount: 475,
          totalBytes: 1_161_651,
          canonicalBytes: 96_065,
        },
      },
      themeHostRunner: { bytes: 180_363 },
      cardinalNodeCensus: {
        root: 83,
        emphasis: 33,
        strong: 56,
        text: 217,
      },
    });
    expect(
      PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE
        .readerLinkApplication.sourceClosure,
    ).toEqual({
      fileCount: 3,
      totalBytes: 30_762,
      canonicalBytes: 480,
      hash:
        "sha256:ce3f7efe6ef6db682df40f49a53de649b4bfce98cab69b996884145c3dc8cb26",
      files: [
        {
          path: "@genii-foundation/publisher-reader/dist/markdown.js",
          bytes: 18_254,
          hash:
            "sha256:d9a8dfbc3c83eb883f93a317b5fad8744ac159c3a41ae06af86005850491d25d",
        },
        {
          path: "@genii-foundation/publisher-reader/dist/diagnostics.js",
          bytes: 6_816,
          hash:
            "sha256:87573c0a34ed343fcdfb04ae7a0a2af71486ec7354cd407011088b1eb8d6e1dc",
        },
        {
          path: "@genii-foundation/publisher-reader/dist/immutability.js",
          bytes: 5_692,
          hash:
            "sha256:542e62139817b8973c52707139b0d71600f876c844cb68a8dff4baf6841681fd",
        },
      ],
    });
    const mutations: Array<(
      evidence: Mutable<
        typeof PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE
      >,
    ) => void> = [
      (evidence) => {
        evidence.dependencyClosure.hash = fixtureHash("parser-closure") as
          typeof evidence.dependencyClosure.hash;
      },
      (evidence) => {
        evidence.readerLinkApplication.sourceClosure.files[0]!.hash =
          fixtureHash("reader-helper") as
            typeof evidence.readerLinkApplication.sourceClosure
              .files[number]["hash"];
      },
      (evidence) => {
        evidence.readerLinkApplication.dependencyClosure.hash =
          fixtureHash("reader-parser-closure") as
            typeof evidence.readerLinkApplication.dependencyClosure.hash;
      },
      (evidence) => {
        evidence.themeHostRunner.hash = fixtureHash("theme-runner") as
          typeof evidence.themeHostRunner.hash;
      },
      (evidence) => {
        evidence.packages[0]!.name = "forged-publisher-next" as
          typeof evidence.packages[0]["name"];
      },
      (evidence) => {
        evidence.packages[1]!.version = "10.1.1" as
          typeof evidence.packages[1]["version"];
      },
      (evidence) => {
        evidence.packages[2]!.integrity = "sha512-forged" as
          typeof evidence.packages[2]["integrity"];
      },
      (evidence) => {
        evidence.readerLinkApplication.sourceClosure.files[1]!.path =
          "@genii-foundation/publisher-reader/dist/forged.js" as
            typeof evidence.readerLinkApplication.sourceClosure
              .files[1]["path"];
      },
      (evidence) => {
        evidence.readerLinkApplication.sourceClosure.files[2]!.bytes =
          5_693 as typeof evidence.readerLinkApplication.sourceClosure
            .files[2]["bytes"];
      },
    ];
    for (const mutate of mutations) {
      const evidence = mutableClone(
        PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE,
      );
      mutate(evidence);
      expect(() => assertPublisherOfflineMarkdownParserEvidence(evidence))
        .toThrow(/Markdown parser evidence drifted/u);
    }
  });

  it("locks the rendered UI, deferred fault, cold-cache, and cleanup sequence", () => {
    const source = fs.readFileSync(
      fileURLToPath(new URL("./offline-host-proof.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toContain(
      "export async function runPublisherOfflineHostProof():",
    );
    expect(source).toContain(".publisher-root[data-publisher-page");
    expect(source).toContain(
      "section.publisher-reader-panel[aria-label='Offline reading']",
    );
    expect(source).toContain(
      ".publisher-reader-offline-packages > li[data-work-id=",
    );
    expect(source).not.toContain("navigator.serviceWorker.register(");
    expect(source).not.toContain("installPublisherReaderOfflinePackage");
    expect(source).not.toMatch(/\.skip\s*\(/u);
    expect(source).not.toMatch(/channel\s*:/u);
    expect(source).not.toMatch(/executablePath\s*:/u);
    expect(source).toContain('browser.newContext({ serviceWorkers: "allow" })');

    const firstInstallClick = source.indexOf(
      "await clickOfflinePackageAndWaitForSuccess(page);",
    );
    const beforeFirstInstall = source.slice(0, firstInstallClick);
    expect(firstInstallClick).toBeGreaterThan(0);
    expect(beforeFirstInstall.match(
      /await assertNoOfflineRegistrationOrCacheState\(page, "clean"\);/gu,
    )).toHaveLength(2);
    expect(beforeFirstInstall.match(
      /await assertNoOfflineRegistrationOrCacheState\(page, "seeded"\);/gu,
    )).toHaveLength(1);
    const coldReaderStart = source.indexOf(
      "async function exerciseColdOfflineReader(",
    );
    const coldReaderEnd = source.indexOf(
      "async function assertCoherenceCachesUnchanged(",
      coldReaderStart,
    );
    expect(coldReaderStart).toBeGreaterThan(0);
    expect(coldReaderEnd).toBeGreaterThan(coldReaderStart);
    const coldReaderSource = source.slice(coldReaderStart, coldReaderEnd);
    expect(coldReaderSource.match(
      /document\.createTreeWalker\(block, NodeFilter\.SHOW_TEXT\)/gu,
    )).toHaveLength(3);
    expect(coldReaderSource.match(/range\.selectNode\(textNode\);/gu))
      .toHaveLength(3);
    expect(coldReaderSource.match(
      /document\.querySelectorAll\("\*"\)/gu,
    )).toHaveLength(3);
    expect(coldReaderSource.match(
      /\["src", "href", "data"\]\.some\(\(name\) =>/gu,
    )).toHaveLength(3);
    expect(coldReaderSource.match(
      /\^\[\\u0009\\u000A\\u000C\\u000D\\u0020\]\+\|\[\\u0009\\u000A\\u000C\\u000D\\u0020\]\+\$/gu,
    )).toHaveLength(3);
    expect(coldReaderSource.match(
      /\^\(\?:blob:\|data:\(\?:audio\|video\)\\\/\)\/iu/gu,
    )).toHaveLength(3);
    expect(coldReaderSource.match(/includes\("publication-audio"\)/gu))
      .toHaveLength(3);
    expect(coldReaderSource.match(
      /const dormantAudioShellVerified = roots\.length === 1/gu,
    )).toHaveLength(3);
    expect(coldReaderSource.match(
      /document\.querySelectorAll\(\s*"\.publisher-reader-audio-host",\s*\)/gu,
    )).toHaveLength(3);
    expect(coldReaderSource.match(/audio\.currentSrc === ""/gu))
      .toHaveLength(3);
    expect(coldReaderSource.match(/audio\.paused/gu)).toHaveLength(3);
    expect(coldReaderSource.match(
      /mediaState\.dormantAudioShellVerified/gu,
    )).toHaveLength(3);
    expect(coldReaderSource.match(
      /mediaState\.unexpectedMediaElementCount === 0/gu,
    )).toHaveLength(2);
    expect(coldReaderSource).toMatch(
      /unexpectedMediaElementCount:\s*mediaState\.unexpectedMediaElementCount/gu,
    );
    expect(coldReaderSource).toContain(
      "dormantAudioShellBoundaryCount: 2 as const",
    );
    expect(coldReaderSource).not.toContain("const activeMedia =");
    expect(coldReaderSource).not.toContain("[src^='blob:']");

    const runtimeDelete = source.indexOf(
      "await caches.delete(runtimeCacheName);",
    );
    const clearHttp = source.indexOf(
      'await cdp.send("Network.clearBrowserCache");',
    );
    const offlineCutoff = source.indexOf(
      "await context.setOffline(true);",
      clearHttp,
    );
    const detach = source.indexOf("await cdp.detach();", offlineCutoff);
    expect(runtimeDelete).toBeGreaterThan(0);
    expect(clearHttp).toBeGreaterThan(runtimeDelete);
    expect(offlineCutoff).toBeGreaterThan(clearHttp);
    expect(detach).toBeGreaterThan(offlineCutoff);

    const lastPointerHref = source.indexOf(
      "const failedHref = firstPointer.resourceHrefs.at(-1);",
    );
    const deferredInstall = source.indexOf(
      "await installDeferredFetchFailure(page, failedHref);",
      lastPointerHref,
    );
    const held = source.indexOf(
      "await waitForDeferredFetchFailure(page);",
      deferredInstall,
    );
    const inFlight = source.indexOf(
      "assertPublisherOfflineInFlightPackageStateUnchanged(",
      held,
    );
    const rejection = source.indexOf(
      "await rejectDeferredFetchFailure(page);",
      inFlight,
    );
    expect(lastPointerHref).toBeGreaterThan(0);
    expect(deferredInstall).toBeGreaterThan(lastPointerHref);
    expect(held).toBeGreaterThan(deferredInstall);
    expect(inFlight).toBeGreaterThan(held);
    expect(rejection).toBeGreaterThan(inFlight);

    const cleanupStart = source.indexOf("async function cleanupBrowserProofState");
    const cleanupEnd = source.indexOf(
      "function cardinalSectionBrowserProofInput",
      cleanupStart,
    );
    const cleanupSource = source.slice(cleanupStart, cleanupEnd);
    expect(cleanupSource).toContain(
      'name.startsWith(input.publisherPrefix)',
    );
    expect(cleanupSource).toContain(
      "sorted(SEEDED_COHERENCE_CACHE_NAMES)",
    );
    expect(cleanupSource).not.toMatch(
      /remainingNames\.map[\s\S]*caches\.delete/u,
    );

    const packageStateStart = source.indexOf(
      "async function readBrowserPackageState",
    );
    const packageStateEnd = source.indexOf(
      "export function assertPublisherOfflineOnlyInstalledVersionChanged",
      packageStateStart,
    );
    const packageStateSource = source.slice(packageStateStart, packageStateEnd);
    expect(packageStateSource).toContain(
      "let usedBytes = boundedRecord.usedBytes;",
    );
    expect(packageStateSource).not.toContain("let usedBytes = 0;");
  });

  it("binds clean and seeded pre-install cache causality", () => {
    const clean = {
      registrationCount: 0,
      controller: false,
      caches: [{
        name: "genii-publisher-offline-metadata-v1",
        keyCount: 0,
      }],
    } as const;
    const seeded = {
      registrationCount: 0,
      controller: false,
      caches: [
        "coherence-offline-metadata-v2",
        "coherence-offline-pack-v2-sentinel",
        "coherence-offline-runtime-v1",
        "coherence-offline-runtime-v2",
        "coherence-offline-v1",
        "genii-publisher-offline-metadata-v1",
        "genii-publisher-offline-runtime-v0",
        "genii-publisher-offline-runtime-v999",
      ].sort((left, right) => left.localeCompare(right)).map((name) => ({
        name,
        keyCount: name === "genii-publisher-offline-metadata-v1" ? 0 : 1,
      })),
    } as const;
    expect(() => assertPublisherOfflinePreInstallState(clean, "clean"))
      .not.toThrow();
    expect(() => assertPublisherOfflinePreInstallState({
      ...clean,
      caches: [],
    }, "clean")).not.toThrow();
    expect(() => assertPublisherOfflinePreInstallState(seeded, "seeded"))
      .not.toThrow();
    const rejectedCleanStates = [
      { ...clean, registrationCount: 1 },
      { ...clean, controller: true },
      { ...clean, caches: [{
        name: "genii-publisher-offline-metadata-v1",
        keyCount: 1,
      }] },
      { ...clean, caches: [{
        name: "genii-publisher-offline-package-v1-forged",
        keyCount: 0,
      }] },
      { ...clean, caches: [{
        name: "genii-publisher-offline-runtime-v1",
        keyCount: 0,
      }] },
    ];
    for (const state of rejectedCleanStates) {
      expect(() => assertPublisherOfflinePreInstallState(state, "clean"))
        .toThrow(/pre-install state drifted/u);
    }
    expect(() => assertPublisherOfflinePreInstallState({
      ...seeded,
      caches: seeded.caches.slice(1),
    }, "seeded")).toThrow(/pre-install state drifted/u);
    expect(() => assertPublisherOfflinePreInstallState({
      ...seeded,
      caches: seeded.caches.map((cache, index) =>
        index === 0 ? { ...cache, keyCount: 2 } : cache
      ),
    }, "seeded")).toThrow(/pre-install state drifted/u);
    expect(() => assertPublisherOfflinePreInstallState({
      ...seeded,
      caches: [...seeded.caches, {
        name: "genii-publisher-offline-runtime-v1",
        keyCount: 1,
      }].sort((left, right) => left.name.localeCompare(right.name)),
    }, "seeded")).toThrow(/pre-install state drifted/u);
  });

  it("binds every Coherence request and response envelope field", () => {
    const expected = cacheSnapshotFixture();
    expect(() => assertPublisherOfflineCacheSnapshotUnchanged(
      expected,
      structuredClone(expected),
      "fixture",
    )).not.toThrow();
    const mutations: Array<
      (snapshot: Mutable<PublisherOfflineCacheSnapshot>) => void
    > = [
      (snapshot) => {
        snapshot.entries[0]!.requestHeaders[0]![1] = "text/html";
      },
      (snapshot) => {
        snapshot.entries[0]!.statusText = "OK";
      },
      (snapshot) => {
        snapshot.entries[0]!.responseHeaders[0]![1] = "public";
      },
      (snapshot) => {
        snapshot.entries[0]!.responseHref = "/redirected";
      },
      (snapshot) => {
        snapshot.entries[0]!.responseRedirected = true;
      },
      (snapshot) => {
        snapshot.entries[0]!.responseType = "basic";
      },
    ];
    for (const mutate of mutations) {
      const actual = mutableClone(expected);
      mutate(actual);
      expect(() => assertPublisherOfflineCacheSnapshotUnchanged(
        expected,
        actual as PublisherOfflineCacheSnapshot,
        "fixture",
      )).toThrow(/changed cache response state/u);
    }
  });

  it("binds the complete package pointer, metadata cache, and response state", () => {
    const expected = packageStateFixture();
    expect(() => assertPublisherOfflineBrowserPackageStateUnchanged(
      expected,
      structuredClone(expected),
      "fixture",
    )).not.toThrow();

    const inFlight = mutableClone(expected);
    inFlight.cacheNames.push(
      "genii-publisher-offline-package-v1-staging",
    );
    expect(() => assertPublisherOfflineInFlightPackageStateUnchanged(
      expected,
      inFlight as PublisherOfflineBrowserPackageState,
    )).not.toThrow();

    const transientPointer = mutableClone(inFlight);
    if (transientPointer.record === null) {
      throw new TypeError("Package fixture record is absent.");
    }
    transientPointer.record.cacheName =
      "genii-publisher-offline-package-v1-staging";
    expect(() => assertPublisherOfflineInFlightPackageStateUnchanged(
      expected,
      transientPointer as PublisherOfflineBrowserPackageState,
    )).toThrow(/In-flight Publisher replacement/u);
    const extraStaging = mutableClone(inFlight);
    extraStaging.cacheNames.push(
      "genii-publisher-offline-package-v1-second-staging",
    );
    expect(() => assertPublisherOfflineInFlightPackageStateUnchanged(
      expected,
      extraStaging as PublisherOfflineBrowserPackageState,
    )).toThrow(/In-flight Publisher replacement/u);
    const activeBytesDrift = mutableClone(inFlight);
    activeBytesDrift.packageCacheHash = fixtureHash("in-flight-active-drift");
    expect(() => assertPublisherOfflineInFlightPackageStateUnchanged(
      expected,
      activeBytesDrift as PublisherOfflineBrowserPackageState,
    )).toThrow(/In-flight Publisher replacement/u);

    const envelopeMutations: Array<
      (state: Mutable<PublisherOfflineBrowserPackageState>) => void
    > = [
      (state) => {
        state.recordResponseHeaders[0]![1] = "text/plain";
      },
      (state) => {
        state.recordResponseHref = "/forged";
      },
      (state) => {
        state.recordResponseType = "basic";
      },
      (state) => {
        state.metadataCacheRequests.push({
          method: "GET",
          href: "https://publisher.invalid/__offline-package__/extra",
          headers: [],
        });
      },
      (state) => {
        state.packageCacheEntries[0]!.headers.push(["rsc", "1"]);
      },
      (state) => {
        state.packageCacheEntries[0]!.responseHref =
          "https://outside.invalid/forged";
      },
      (state) => {
        state.packageCacheEntries[0]!.responseType = "default";
      },
    ];
    for (const mutate of envelopeMutations) {
      const actual = mutableClone(expected);
      mutate(actual);
      expect(() => assertPublisherOfflineBrowserPackageStateUnchanged(
        expected,
        actual as PublisherOfflineBrowserPackageState,
        "fixture",
      )).toThrow(/active Publisher package state/u);
    }
  });

  it("permits only the synthetic version hash to change before rollback", () => {
    const before = packageStateFixture();
    const after = packageStateFixture({
      workContentHash:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      recordHash: fixtureHash("stale-record"),
    });
    expect(() => assertPublisherOfflineOnlyInstalledVersionChanged(
      before,
      after,
    )).not.toThrow();
    const envelopeDrift = mutableClone(after);
    envelopeDrift.recordResponseHeaders[0]![1] = "text/plain";
    expect(() => assertPublisherOfflineOnlyInstalledVersionChanged(
      before,
      envelopeDrift as PublisherOfflineBrowserPackageState,
    )).toThrow(/more than its version identity/u);
  });

  it("requires one exact activated worker and identical active controller", () => {
    const exact = serviceWorkerStateFixture();
    expect(() => assertPublisherOfflineServiceWorkerState(exact)).not.toThrow();
    const forgeries = [
      { waitingScript: "https://publisher.invalid/offline-sw.js" },
      { activeState: "activating" },
      { controllerState: "redundant" },
      { controllerIsActive: false },
      { controllerScript: "https://publisher.invalid/stale-worker.js" },
      { activeScript: "https://publisher.invalid/offline-sw.js?v=2" },
    ];
    for (const patch of forgeries) {
      expect(() => assertPublisherOfflineServiceWorkerState({
        ...exact,
        ...patch,
      })).toThrow(/service worker registration drifted/u);
    }
  });

  it("requires visible Reader prose, an inert audio shell, and a search target", () => {
    const state = coldStateFixture();
    const expected = {
      pageKind: "section" as const,
      pageTitle: state.title,
      blockId: state.blockId,
      bodyText: state.blockVisibleText,
    };
    expect(() => assertPublisherOfflineColdDocumentState(
      state,
      expected,
    )).not.toThrow();
    for (const patch of [
      { blockVisible: false },
      { blockHasPositiveArea: false },
      { blockTextHasPositiveArea: false },
      { allBlockTextNodesVisible: false },
      { dormantAudioShellVerified: false },
      { blockVisibleText: "" },
      { unexpectedMediaElementCount: 1 },
      { controlled: false },
    ]) {
      expect(() => assertPublisherOfflineColdDocumentState(
        { ...state, ...patch },
        expected,
      )).toThrow(/semantic state drifted/u);
    }
    expect(() => assertPublisherOfflineSearchTargetState(
      { visible: true, href: "/manuscripts/9/contents/closing/" },
      "/manuscripts/9/contents/closing/",
    )).not.toThrow();
    expect(() => assertPublisherOfflineSearchTargetState(
      { visible: false, href: "/manuscripts/9/contents/closing/" },
      "/manuscripts/9/contents/closing/",
    )).toThrow(/visibly owned/u);
  });

  it("projects the exact rendered tree for all 14 Cardinal documents", () => {
    expect(documentAuthorities).toHaveLength(14);
    for (const authority of documentAuthorities) {
      const tree = documentTreeFixture(authority);
      const actual = projectFixtureTree(tree);
      expect(actual).toEqual(authority.expectedDom);
      expect(() => assertPublisherOfflineDocumentSemanticProjection(
        authority,
        actual,
      )).not.toThrow();
    }
    const svg = treeElements(documentTreeFixture(
      documentAuthorities.find(({ expectedDom }) =>
        expectedDom.titleWrapperCount === 1
      ) ?? documentAuthorities[0]!,
    )).find(({ tagName }) => tagName === "svg");
    expect(svg?.attributes).toContainEqual(["viewBox", "0 0 24 24"]);

    const owningHeadingAuthority = documentAuthorities.find(({ expectedDom }) =>
      expectedDom.blocks.some((block) =>
        /^h[1-6]$/u.test(block.tagName)
      )
    );
    const owningHeadingBlock = owningHeadingAuthority?.expectedDom.blocks.find(
      (block) => /^h[1-6]$/u.test(block.tagName),
    );
    if (owningHeadingAuthority === undefined || owningHeadingBlock === undefined) {
      throw new TypeError("Owning heading focus fixture is absent.");
    }
    const focusedTree = mutableTreeFixture(owningHeadingAuthority);
    const focusedHeading = findMutableTreeElement(focusedTree, (element) =>
      treeAttribute(element, "data-publisher-block") === owningHeadingBlock.id
    );
    wrapFirstTreeText(focusedHeading, "span", {
      class: "publisher-focus-word",
    });
    expect(projectFixtureTree(refinalizeTree(focusedTree))).toEqual(
      owningHeadingAuthority.expectedDom,
    );
  });

  it("reports one bounded redacted semantic projection divergence", () => {
    const authority = authorityFor(cardinalPackage.route);
    const diagnostic = (
      actual: PublisherOfflineDocumentDomProjection,
    ): string => {
      try {
        assertPublisherOfflineDocumentSemanticProjection(authority, actual);
      } catch (error) {
        if (error instanceof TypeError) return error.message;
        throw error;
      }
      throw new TypeError("Semantic diagnostic fixture did not diverge.");
    };
    const privateValue =
      "<html>FORGED</html> /Users/private/publication " + "x".repeat(20_000);
    const nested = mutableClone(authority.expectedDom);
    const nestedBlock = nested.blocks[0];
    if (nestedBlock === undefined) {
      throw new TypeError("Semantic diagnostic block fixture is absent.");
    }
    nestedBlock.text = privateValue;
    const nestedMessage = diagnostic(
      nested as PublisherOfflineDocumentDomProjection,
    );
    expect(nestedMessage).toContain(
      `at ${authority.href} /blocks/0/text; expected string:`,
    );
    expect(nestedMessage).toContain(`actual string:${privateValue.length}:`);
    expect(nestedMessage).toMatch(/sha256:[0-9a-f]{64}\.$/u);
    expect(nestedMessage).not.toContain("<html>");
    expect(nestedMessage).not.toContain("/Users/private");
    expect(nestedMessage.length).toBeLessThanOrEqual(1_024);
    expect(diagnostic(
      nested as PublisherOfflineDocumentDomProjection,
    )).toBe(nestedMessage);

    const missing = mutableClone(authority.expectedDom);
    const missingBlock = missing.blocks[0];
    if (missingBlock === undefined) {
      throw new TypeError("Semantic diagnostic missing-key fixture is absent.");
    }
    delete (missingBlock as Record<string, unknown>).text;
    expect(diagnostic(
      missing as PublisherOfflineDocumentDomProjection,
    )).toMatch(
      /\/blocks\/0\/text; expected string:[0-9]+:sha256:[0-9a-f]{64}; actual missing:0:sha256:[0-9a-f]{64}\.$/u,
    );

    const shorter = mutableClone(authority.expectedDom);
    shorter.blocks.pop();
    expect(diagnostic(
      shorter as PublisherOfflineDocumentDomProjection,
    )).toMatch(
      /\/blocks; expected array:[0-9]+:sha256:[0-9a-f]{64}; actual array:[0-9]+:sha256:[0-9a-f]{64}\.$/u,
    );

    const excessivePointer = mutableClone(authority.expectedDom) as unknown as
      Record<string, unknown>;
    excessivePointer[`z${"private-path".repeat(100)}`] = true;
    const boundedMessage = diagnostic(
      excessivePointer as PublisherOfflineDocumentDomProjection,
    );
    expect(boundedMessage).toContain("/@sha256:");
    expect(boundedMessage).not.toContain("private-path");
    expect(boundedMessage.length).toBeLessThanOrEqual(1_024);
  });

  it("binds the exact seven-button Reader tools rail and only its icons", () => {
    const home = authorityFor("/");
    const section = documentAuthorities.find(({ expectedDom }) =>
      expectedDom.pageKind === "section"
    );
    if (section === undefined) {
      throw new TypeError("Reader rail section fixture is absent.");
    }
    const railButton = (
      tree: Mutable<PublisherOfflineHtmlDocumentTree>,
      index: number,
    ): Mutable<PublisherOfflineHtmlTreeElementNode> => {
      const actions = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reader-rail-actions"
      );
      const button = actions.children[index];
      if (button?.type !== "element") {
        throw new TypeError("Reader rail button fixture is absent.");
      }
      return button;
    };
    expect(home.expectedDom.readerRailCount).toBe(1);
    expect(home.expectedDom.readerRailActionCount).toBe(1);
    expect(home.expectedDom.readerRailProgressAriaLabel).toBe(
      "Publication tools",
    );
    expect(section.expectedDom.readerRailProgressAriaLabel).toBe("0% read");
    expect(home.expectedDom.readerRailProgressText).toBe("§");
    expect(section.expectedDom.readerRailProgressText).toBe("§");
    expect(home.expectedDom.readerRailStructuralDriftCount).toBe(0);
    expect(home.expectedDom.readerRailProjectionHash).toBe(
      PUBLISHER_OFFLINE_EXPECTED_READER_RAIL_HASH,
    );

    expectRenderedTreeDrift(home, (tree) => {
      const rail = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reader-rail"
      );
      rail.children.push(htmlElement("svg", {
        "aria-hidden": "true",
        viewBox: "0 0 24 24",
      }) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const progress = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reader-rail-progress"
      );
      setTreeAttribute(progress, "aria-label", "0% read");
    });
    expectRenderedTreeDrift(section, (tree) => {
      const progress = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reader-rail-progress"
      );
      setTreeAttribute(progress, "aria-label", "Publication tools");
    });
    expectRenderedTreeDrift(section, (tree) => {
      const progress = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reader-rail-progress"
      );
      const label = findMutableTreeDescendant(
        progress,
        ({ tagName }) => tagName === "span",
      );
      label.children.splice(0, label.children.length, htmlText("0") as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const rail = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reader-rail"
      );
      rail.children.push(htmlText("FORGED") as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const actions = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reader-rail-actions"
      );
      actions.children.push(htmlText("FORGED") as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const button = railButton(tree, 0);
      const path = findMutableTreeDescendant(
        button,
        ({ tagName }) => tagName === "path",
      );
      setTreeAttribute(path, "d", "M0 0h24v24Z");
    });
    expectRenderedTreeDrift(home, (tree) => {
      const actions = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reader-rail-actions"
      );
      const first = actions.children[0];
      const second = actions.children[1];
      if (first === undefined || second === undefined) {
        throw new TypeError("Reader rail order fixture is absent.");
      }
      actions.children.splice(0, 2, second, first);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const button = railButton(tree, 0);
      const label = findMutableTreeDescendant(
        button,
        ({ tagName }) => tagName === "span",
      );
      label.children.splice(0, label.children.length, htmlText("Index") as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      setTreeAttribute(railButton(tree, 0), "aria-controls", "_R_4_");
    });
    expectRenderedTreeDrift(home, (tree) => {
      setTreeAttribute(railButton(tree, 2), "aria-controls", "_R_3e_");
    });
    expectRenderedTreeDrift(home, (tree) => {
      setTreeAttribute(railButton(tree, 0), "aria-controls", "_R_w_");
    });
    expectRenderedTreeDrift(home, (tree) => {
      const overlongId = `_R_${"a".repeat(125)}_`;
      for (const index of [0, 1, 3, 4, 5, 6]) {
        setTreeAttribute(railButton(tree, index), "aria-controls", overlongId);
      }
    });
    expectRenderedTreeDrift(home, (tree) => {
      setTreeAttribute(railButton(tree, 2), "disabled", "");
    });
  });

  it("allows only the exact first-body Next streaming placeholder", () => {
    const home = authorityFor("/");
    const placeholder = (
      tree: Mutable<PublisherOfflineHtmlDocumentTree>,
    ): Readonly<{
      body: Mutable<PublisherOfflineHtmlTreeElementNode>;
      element: Mutable<PublisherOfflineHtmlTreeElementNode>;
      index: number;
    }> => {
      const body = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "body"
      );
      const index = body.children.findIndex((child) =>
        child.type === "element" && child.tagName === "div" &&
        treeAttribute(child, "hidden") !== null
      );
      const element = body.children[index];
      if (index < 0 || element?.type !== "element") {
        throw new TypeError("Next streaming placeholder fixture is absent.");
      }
      return { body, element, index };
    };
    expect(home.expectedDom.nextStreamingPlaceholderCount).toBe(1);
    expect(home.expectedDom.nextStreamingPlaceholderTagName).toBe("div");
    expect(home.expectedDom.nextStreamingPlaceholderIsDirectFirstBodyElement)
      .toBe(true);
    expect(home.expectedDom.nextStreamingPlaceholderAttributes).toEqual([
      ["hidden", ""],
    ]);
    expect(home.expectedDom.nextStreamingPlaceholderSerializedChildCount)
      .toBe(0);
    expect(home.expectedDom.nextStreamingPlaceholderStructuralDriftCount)
      .toBe(0);

    expectRenderedTreeDrift(home, (tree) => {
      const target = placeholder(tree);
      target.body.children.splice(target.index, 1);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const target = placeholder(tree);
      target.body.children.push(nextStreamingPlaceholderTree() as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const target = placeholder(tree);
      target.body.children.splice(target.index, 1);
      target.body.children.splice(1, 0, target.element);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const target = placeholder(tree);
      target.body.children.splice(target.index, 1);
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-root"
      );
      root.children.unshift(target.element);
    });
    expectRenderedTreeDrift(home, (tree) => {
      placeholder(tree).element.tagName = "section";
    });
    expectRenderedTreeDrift(home, (tree) => {
      setTreeAttribute(placeholder(tree).element, "hidden", "hidden");
    });
    expectRenderedTreeDrift(home, (tree) => {
      setTreeAttribute(placeholder(tree).element, "data-forged", "true");
    });
    expectRenderedTreeDrift(home, (tree) => {
      placeholder(tree).element.children.push(htmlText("FORGED") as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      placeholder(tree).element.children.push(htmlElement("span") as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
  });

  it("allows only the exact inert narration audio shell", () => {
    const home = authorityFor("/");
    expect(home.expectedDom.dormantNarrationAudioHostCount).toBe(1);
    expect(home.expectedDom.dormantNarrationAudioElementCount).toBe(1);
    expect(home.expectedDom.dormantNarrationAudioStructuralDriftCount).toBe(0);
    expect(home.expectedDom.dormantNarrationAudioHostStyleMatchesRoot).toBe(
      true,
    );
    expect(home.expectedDom.dormantNarrationAudioProjectionHash).toBe(
      PUBLISHER_OFFLINE_EXPECTED_DORMANT_AUDIO_SHELL_HASH,
    );
    for (const [name, value] of [
      ["preload", "none"],
      ["src", "/publication-audio/example.mp3"],
      ["controls", ""],
      ["autoplay", ""],
      ["loop", ""],
      ["muted", ""],
    ] as const) {
      expectRenderedTreeDrift(home, (tree) => {
        setTreeAttribute(
          findMutableTreeElement(tree, ({ tagName }) => tagName === "audio"),
          name,
          value,
        );
      });
    }
    expectRenderedTreeDrift(home, (tree) => {
      const audio = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "audio"
      );
      audio.children.push(htmlElement("source", {
        src: "/publication-audio/example.mp3",
      }) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const host = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reader-audio-host"
      );
      setTreeAttribute(
        host,
        "style",
        fixtureThemeStyle().replace("#F4EAD7", "#000000"),
      );
    });
    expectRenderedTreeDrift(home, (tree) => {
      const body = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "body"
      );
      body.children.push(dormantNarrationAudioHostTree() as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
  });

  it("binds guarded Markdown inline semantics and plain JSX text owners", () => {
    const work = authorityFor(cardinalPackage.route);
    const home = authorityFor("/");
    const emphasisBlock = work.expectedDom.blocks.find((block) =>
      inlineSemanticHasTag(block.inlineSemantics, "em")
    );
    const strongBlock = work.expectedDom.blocks.find((block) =>
      inlineSemanticHasTag(block.inlineSemantics, "strong")
    );
    const listStrongBlock = work.expectedDom.blocks.find((block) =>
      block.kind === "list" &&
      inlineSemanticHasTag(block.inlineSemantics, "strong")
    );
    if (
      emphasisBlock === undefined || strongBlock === undefined ||
      listStrongBlock === undefined
    ) {
      throw new TypeError("Cardinal inline semantics fixtures are absent.");
    }
    for (const [block, tagName] of [
      [emphasisBlock, "em"],
      [strongBlock, "strong"],
    ] as const) {
      expectRenderedTreeDrift(work, (tree) => {
        const owner = findMutableTreeElement(tree, (element) =>
          treeAttribute(element, "data-publisher-block") === block.id
        );
        const inline = findMutableTreeDescendant(
          owner,
          ({ tagName: candidate }) => candidate === tagName,
        );
        replaceTreeElementWithChildren(tree, inline);
      });
    }
    expectRenderedTreeDrift(work, (tree) => {
      const owner = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === strongBlock.id
      );
      findMutableTreeDescendant(owner, ({ tagName }) => tagName === "strong")
        .tagName = "em";
    });
    for (const tagName of ["mark", "sup"]) {
      expectRenderedTreeRejected(work, (tree) => {
        const owner = findMutableTreeElement(tree, (element) =>
          treeAttribute(element, "data-publisher-block") === emphasisBlock.id
        );
        wrapFirstTreeText(owner, tagName);
      });
    }
    expectRenderedTreeDrift(work, (tree) => {
      const owner = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === listStrongBlock.id
      );
      findMutableTreeDescendant(owner, ({ tagName }) => tagName === "strong")
        .tagName = "em";
    });

    expectRenderedTreeDrift(home, (tree) => {
      wrapFirstTreeText(
        findMutableTreeElement(tree, ({ tagName }) => tagName === "h1"),
        "strong",
      );
    });
    expectRenderedTreeDrift(home, (tree) => {
      wrapFirstTreeText(
        findMutableTreeElement(tree, ({ tagName }) => tagName === "h1"),
        "a",
      );
    });
    expectRenderedTreeDrift(home, (tree) => {
      const cardHeading = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "h3"
      );
      const anchor = findMutableTreeDescendant(
        cardHeading,
        ({ tagName }) => tagName === "a",
      );
      setTreeAttribute(anchor, "download", "");
    });
    expectRenderedTreeDrift(home, (tree) => {
      const detail = findMutableTreeElement(tree, (element) =>
        element.tagName === "p" &&
        treeAttribute(element, "class") !== "publisher-reading-stat"
      );
      wrapFirstTreeText(detail, "sup");
    });
    expectRenderedTreeDrift(work, (tree) => {
      const subtitle = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-work-subtitle"
      );
      wrapFirstTreeText(subtitle, "mark");
    });

    const section = documentAuthorities.find(({ expectedDom }) =>
      expectedDom.breadcrumbNavigationCount === 1 &&
      expectedDom.sectionNavigationCount === 1
    );
    if (section === undefined) {
      throw new TypeError("Cardinal navigation inline fixture is absent.");
    }
    expectRenderedTreeDrift(section, (tree) => {
      const breadcrumb = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-breadcrumbs"
      );
      const anchor = findMutableTreeDescendant(
        breadcrumb,
        ({ tagName }) => tagName === "a",
      );
      setTreeAttribute(anchor, "target", "_blank");
    });
    expectRenderedTreeDrift(section, (tree) => {
      const breadcrumb = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-breadcrumbs"
      );
      wrapFirstTreeText(breadcrumb, "span");
    });
    expectRenderedTreeDrift(section, (tree) => {
      const navigation = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-section-navigation"
      );
      const titleSpan = findMutableTreeDescendant(
        navigation,
        (element) => element.tagName === "span" && element.children.length > 0,
      );
      wrapFirstTreeText(titleSpan, "strong");
    });
    expectRenderedTreeDrift(home, (tree) => {
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") === "home"
      );
      setTreeAttribute(root, "href", "\tdata:audio/wav,forged");
    });
  });

  it("rejects unsafe shell, style, class, aria, and interaction drift in trees", () => {
    const home = authorityFor("/");
    const work = authorityFor(cardinalPackage.route);
    const section = documentAuthorities.find(({ expectedDom }) =>
      expectedDom.pageKind === "section" &&
      expectedDom.breadcrumbNavigationCount === 1
    );
    if (section === undefined) {
      throw new TypeError("Section shell fixture is absent.");
    }
    const rejectHome = (
      mutate: (tree: Mutable<PublisherOfflineHtmlDocumentTree>) => void,
    ) => expectRenderedTreeRejected(home, mutate);
    rejectHome((tree) => {
      findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") === "home"
      ).tagName = "section";
    });
    rejectHome((tree) => setTreeAttribute(tree.root, "lang", "fr"));
    rejectHome((tree) => setTreeAttribute(tree.root, "dir", "rtl"));
    rejectHome((tree) => setTreeAttribute(
      tree.root,
      "class",
      "publisher-skip-link",
    ));
    rejectHome((tree) => setTreeAttribute(
      findMutableTreeElement(tree, ({ tagName }) => tagName === "body"),
      "class",
      "publisher-skip-link",
    ));
    rejectHome((tree) => setTreeAttribute(
      findMutableTreeElement(tree, ({ tagName }) => tagName === "body"),
      "onpageshow",
      "document.body.hidden=true",
    ));
    rejectHome((tree) => setTreeAttribute(
      findMutableTreeElement(tree, ({ tagName }) => tagName === "body"),
      "dir",
      "rtl",
    ));
    rejectHome((tree) => setTreeAttribute(
      findMutableTreeElement(tree, ({ tagName }) => tagName === "body"),
      "lang",
      "fr",
    ));
    rejectHome((tree) => setTreeAttribute(
      findMutableTreeElement(tree, ({ tagName }) => tagName === "body"),
      "role",
      "application",
    ));
    for (const [name, value] of [["dir", "rtl"], ["lang", "fr"]] as const) {
      rejectHome((tree) => setTreeAttribute(
        findMutableTreeElement(tree, (element) =>
          treeAttribute(element, "data-publisher-page") === "home"
        ),
        name,
        value,
      ));
    }
    for (const name of ["contenteditable", "tabindex"] as const) {
      rejectHome((tree) => setTreeAttribute(
        findMutableTreeElement(tree, (element) =>
          treeAttribute(element, "data-publisher-page") === "home"
        ),
        name,
        name === "contenteditable" ? "true" : "0",
      ));
    }
    rejectHome((tree) => {
      findMutableTreeElement(tree, ({ tagName }) => tagName === "head")
        .tagName = "div";
    });
    rejectHome((tree) => {
      findMutableTreeElement(tree, ({ tagName }) => tagName === "body")
        .tagName = "div";
    });
    rejectHome((tree) => {
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") === "home"
      );
      setTreeAttribute(root, "class", "publisher-root forged-root");
    });
    rejectHome((tree) => {
      setTreeAttribute(
        findMutableTreeElement(tree, ({ tagName }) => tagName === "main"),
        "class",
        "forged-main",
      );
    });
    rejectHome((tree) => {
      const body = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "body"
      );
      body.children.push(htmlElement("p", {}, [htmlText("FORGED")]) as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    rejectHome((tree) => {
      const body = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "body"
      );
      body.children.push(htmlElement("noscript", {}, [
        htmlElement("p", {}, [htmlText("FORGED")]),
      ]) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    rejectHome((tree) => {
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") === "home"
      );
      root.children.push(htmlElement("p", {}, [htmlText("FORGED")]) as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    rejectHome((tree) => {
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") === "home"
      );
      root.children.push(htmlText("FORGED") as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    rejectHome((tree) => {
      const header = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-site-header"
      );
      setTreeAttribute(header, "id", "publisher:main");
    });
    rejectHome((tree) => {
      const title = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "h1"
      );
      setTreeAttribute(title, "id", "publisher-works-heading");
    });
    for (const [selector, name, value] of [
      ["html", "style", "color:transparent"],
      ["body", "style", "font-size:0"],
      ["main", "style", "color:transparent"],
    ] as const) {
      rejectHome((tree) => setTreeAttribute(
        findMutableTreeElement(tree, ({ tagName }) => tagName === selector),
        name,
        value,
      ));
    }
    rejectHome((tree) => {
      const header = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-site-header"
      );
      setTreeAttribute(
        header,
        "style",
        "position:fixed;inset:0;z-index:999;background:black",
      );
    });
    rejectHome((tree) => {
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") === "home"
      );
      setTreeAttribute(
        root,
        "style",
        fixtureThemeStyle().replace("#F4EAD7", "#000000"),
      );
    });
    rejectHome((tree) => {
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") === "home"
      );
      const declarations = fixtureThemeStyle().split(";");
      [declarations[0], declarations[1]] = [
        declarations[1]!,
        declarations[0]!,
      ];
      setTreeAttribute(root, "style", declarations.join(";"));
    });
    rejectHome((tree) => {
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") === "home"
      );
      setTreeAttribute(
        root,
        "style",
        `${fixtureThemeStyle()};--publisher-forged:value`,
      );
    });
    rejectHome((tree) => {
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") === "home"
      );
      setTreeAttribute(
        root,
        "style",
        `${fixtureThemeStyle()};--publisher-color-canvas:#F4EAD7`,
      );
    });
    rejectHome((tree) => {
      const header = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-site-header"
      );
      header.children.push(htmlElement("div", {
        class: "publisher-root",
      }) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    rejectHome((tree) => {
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") === "home"
      );
      setTreeAttribute(root, "hidden", "");
    });
    rejectHome((tree) => {
      const works = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-labelledby") === "publisher-works-heading"
      );
      setTreeAttribute(works, "inert", "");
    });
    rejectHome((tree) => {
      const title = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "h1"
      );
      setTreeAttribute(title, "role", "presentation");
    });
    rejectHome((tree) => {
      const title = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "h1"
      );
      setTreeAttribute(title, "aria-label", "Forged title");
    });
    rejectHome((tree) => {
      const title = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "h1"
      );
      title.children.push(htmlElement("img", {
        alt: "",
        src: "/forged.png",
      }) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    rejectHome((tree) => {
      const title = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "h1"
      );
      title.children = [htmlElement("svg", {}, [
        htmlElement("defs", {}, [
          htmlElement("text", {}, [htmlText(home.expectedDom.title)]),
        ]),
      ])] as Mutable<PublisherOfflineHtmlTreeNode[]>;
    });
    rejectHome((tree) => {
      const title = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "h1"
      );
      title.children = [htmlElement("math", {}, [
        htmlElement("semantics", {}, [
          htmlElement("mrow"),
          htmlElement("annotation", {}, [htmlText(home.expectedDom.title)]),
        ]),
      ])] as Mutable<PublisherOfflineHtmlTreeNode[]>;
    });
    rejectHome((tree) => {
      const title = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "h1"
      );
      title.children = [htmlElement("span", {
        class: "publisher-skip-link",
      }, [htmlText(home.expectedDom.title)])] as Mutable<
        PublisherOfflineHtmlTreeNode[]
      >;
    });
    rejectHome((tree) => {
      const cardDetail = findMutableTreeElement(tree, (element) =>
        element.tagName === "p" &&
        treeAttribute(element, "class") !== "publisher-reading-stat" &&
        element.children.some((node) => node.type === "text")
      );
      const detail = cardDetail.children[0];
      if (detail?.type !== "text") throw new TypeError("Card detail drifted.");
      cardDetail.children = [htmlElement("span", {
        class: "publisher-skip-link",
      }, [htmlText(detail.value)])] as Mutable<PublisherOfflineHtmlTreeNode[]>;
    });
    rejectHome((tree) => {
      const detail = findMutableTreeElement(tree, (element) =>
        element.tagName === "p" &&
        treeAttribute(element, "class") !== "publisher-reading-stat"
      );
      detail.children = [htmlElement("button", {}, [
        ...detail.children,
      ])] as Mutable<PublisherOfflineHtmlTreeNode[]>;
    });
    for (const headChild of [
      htmlElement("style", {}, [htmlText(".publisher-root{display:none}")]),
      htmlElement("base", { href: "https://outside.invalid/" }),
      htmlElement("base", { target: "_blank" }),
      htmlElement("meta", { "http-equiv": "refresh", content: "0;/forged" }),
    ]) {
      rejectHome((tree) => {
        findMutableTreeElement(tree, ({ tagName }) => tagName === "head")
          .children.push(mutableClone(headChild));
      });
    }
    for (const patch of [
      { href: "data:text/css,.publisher-root{display:none}" },
      { media: "not all" },
      { disabled: "" },
      { type: "text/plain" },
    ]) {
      rejectHome((tree) => {
        const link = findMutableTreeElement(tree, ({ tagName }) =>
          tagName === "link"
        );
        for (const [name, value] of Object.entries(patch)) {
          setTreeAttribute(link, name, value);
        }
      });
    }
    rejectHome((tree) => {
      const link = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "link"
      );
      removeTreeElement(tree, link);
      findMutableTreeElement(tree, ({ tagName }) => tagName === "body")
        .children.push(link);
    });
    rejectHome((tree) => {
      const head = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "head"
      );
      head.children.reverse();
    });
    rejectHome((tree) => {
      const head = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "head"
      );
      head.children.push(htmlElement("link", {
        href: "/_next/static/chunks/forged.css",
        rel: "stylesheet",
      }) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeRejected(work, (tree) => {
      const article = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-work") === "cardinal-scale"
      );
      setTreeAttribute(article, "hidden", "");
    });
    expectRenderedTreeRejected(work, (tree) => {
      const manuscript = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-manuscript"
      );
      setTreeAttribute(manuscript, "inert", "");
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") !== null &&
        element.tagName === "div" && element.children.some((node) =>
          node.type === "element" && node.tagName === "p"
        )
      );
      const primary = block.children.find((node) =>
        node.type === "element" && node.tagName === "p"
      );
      if (primary?.type !== "element") {
        throw new TypeError("Paragraph block fixture is absent.");
      }
      setTreeAttribute(primary, "style", "color:transparent");
    });
    expectRenderedTreeRejected(section, (tree) => {
      const nav = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-label") === "Breadcrumb"
      );
      const span = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-current") === "page"
      );
      const original = span.children[0];
      if (original?.type !== "text") {
        throw new TypeError("Breadcrumb text fixture is absent.");
      }
      span.children = [htmlElement("span", {
        class: "publisher-skip-link",
      }, [htmlText(original.value)])] as Mutable<PublisherOfflineHtmlTreeNode[]>;
      setTreeAttribute(nav, "aria-label", "Breadcrumb");
    });
    expectRenderedTreeRejected(section, (tree) => {
      const action = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-heading-action"
      );
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") !== null &&
        element.tagName === "div"
      );
      block.children.push(mutableClone(action));
    });
    expectRenderedTreeRejected(section, (tree) => {
      const action = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-heading-action"
      );
      const icon = action.children.find((node) =>
        node.type === "element" && node.tagName === "svg"
      );
      if (icon?.type !== "element") throw new TypeError("Action icon drifted.");
      icon.tagName = "img";
    });
  });

  it("rejects route swaps, owner tags, DOM IDs, and root ownership in trees", () => {
    const bySection = new Map<string, PublisherOfflineDocumentSemanticAuthority[]>();
    for (const authority of documentAuthorities) {
      const sectionId = authority.routeTarget.sectionId;
      if (authority.routeTarget.kind !== "section" || sectionId === undefined) {
        continue;
      }
      const current = bySection.get(sectionId) ?? [];
      current.push(authority);
      bySection.set(sectionId, current);
    }
    const pairs = [...bySection.values()].filter((items) => items.length === 2);
    expect(pairs).toHaveLength(2);
    for (const pair of pairs) {
      const catalogRoot = pair.find(({ routeTarget }) =>
        routeTarget.routeName === "catalog-root"
      );
      const start = pair.find(({ routeTarget }) =>
        routeTarget.routeName !== "catalog-root"
      );
      if (catalogRoot === undefined || start === undefined) {
        throw new TypeError("Duplicate-target tree fixtures are absent.");
      }
      expect(() => assertPublisherOfflineDocumentSemanticProjection(
        catalogRoot,
        projectFixtureTree(documentTreeFixture(start)),
      )).toThrow(/exact Reader projection/u);
      expect(() => assertPublisherOfflineDocumentSemanticProjection(
        start,
        projectFixtureTree(documentTreeFixture(catalogRoot)),
      )).toThrow(/exact Reader projection/u);
    }
    const catalogRoot = pairs[0]?.find(({ routeTarget }) =>
      routeTarget.routeName === "catalog-root"
    );
    if (catalogRoot === undefined) {
      throw new TypeError("Catalog-root tree fixture is absent.");
    }

    expectRenderedTreeDrift(catalogRoot, (tree) => {
      findMutableTreeElement(tree, ({ tagName }) => tagName === "main")
        .tagName = "div";
    });
    expectRenderedTreeDrift(catalogRoot, (tree) => {
      findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-work") === "cardinal-scale"
      ).tagName = "div";
    });
    expectRenderedTreeDrift(catalogRoot, (tree) => {
      findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-section") !== null
      ).tagName = "div";
    });
    expectRenderedTreeDrift(catalogRoot, (tree) => {
      const section = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-section") !== null
      );
      setTreeAttribute(section, "id", null);
    });
    expectRenderedTreeDrift(catalogRoot, (tree) => {
      const body = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "body"
      );
      const main = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "main"
      );
      const root = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-page") !== null
      );
      const mainIndex = root.children.indexOf(main);
      root.children.splice(mainIndex, 1);
      body.children.push(main);
    });
  });

  it("rejects heading, list, text, transient, and media substitutions in trees", () => {
    const work = authorityFor(cardinalPackage.route);
    const listBlock = work.expectedDom.blocks.find(({ kind }) => kind === "list");
    const headingBlock = work.expectedDom.blocks.find((block) =>
      block.kind === "heading" && block.tagName === "div"
    );
    const paragraphBlock = work.expectedDom.blocks.find(({ kind }) =>
      kind === "paragraph"
    );
    const blockquoteBlock = work.expectedDom.blocks.find(({ kind }) =>
      kind === "blockquote"
    );
    if (
      listBlock === undefined || headingBlock === undefined ||
      paragraphBlock === undefined || blockquoteBlock === undefined
    ) {
      throw new TypeError("Cardinal block tree fixtures are absent.");
    }
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === listBlock.id
      );
      const list = block.children.find((node) =>
        node.type === "element" && node.tagName === "ul"
      );
      if (list?.type !== "element") throw new TypeError("List fixture drifted.");
      list.tagName = "ol";
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === listBlock.id
      );
      const list = block.children.find((node) =>
        node.type === "element" && node.tagName === "ul"
      );
      if (list?.type !== "element") throw new TypeError("List fixture drifted.");
      list.children.reverse();
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === listBlock.id
      );
      const list = block.children.find((node) =>
        node.type === "element" && node.tagName === "ul"
      );
      if (list?.type !== "element") throw new TypeError("List fixture drifted.");
      setTreeAttribute(list, "type", "square");
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === listBlock.id
      );
      const list = block.children.find((node) =>
        node.type === "element" && node.tagName === "ul"
      );
      const listItem = list?.type === "element"
        ? list.children.find((node) =>
            node.type === "element" && node.tagName === "li"
          )
        : undefined;
      if (listItem?.type !== "element") {
        throw new TypeError("List item fixture drifted.");
      }
      setTreeAttribute(listItem, "value", "7");
    });
    expectRenderedTreeDrift(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === listBlock.id
      );
      block.children.push(htmlElement("p", {}, [htmlText("FORGED")]) as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    for (const semanticBlock of [paragraphBlock, blockquoteBlock]) {
      expectRenderedTreeDrift(work, (tree) => {
        const block = findMutableTreeElement(tree, (element) =>
          treeAttribute(element, "data-publisher-block") === semanticBlock.id
        );
        const primary = block.children.find((node) =>
          node.type === "element" &&
          node.tagName === (semanticBlock.kind === "paragraph"
            ? "p"
            : "blockquote")
        );
        if (primary?.type !== "element") {
          throw new TypeError("Primary semantic child fixture drifted.");
        }
        primary.children = [];
        block.children.push(htmlElement("span", {}, [
          htmlText(semanticBlock.text),
        ]) as Mutable<PublisherOfflineHtmlTreeNode>);
      });
    }
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      block.children.push(htmlElement("img", {
        alt: "",
        src: "/_next/static/media/forged.png",
      }) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      const primary = block.children.find((node) =>
        node.type === "element" && node.tagName === "p"
      );
      if (primary?.type !== "element") {
        throw new TypeError("Paragraph fixture drifted.");
      }
      primary.children.push(htmlElement("img", {
        alt: "",
        src: "/_next/static/media/forged.png",
      }) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      setTreeAttribute(block, "class", "publisher-markdown forged-class");
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      const primary = block.children.find((node) =>
        node.type === "element" && node.tagName === "p"
      );
      if (primary?.type !== "element") {
        throw new TypeError("Paragraph fixture drifted.");
      }
      const textNode = primary.children[0];
      if (textNode?.type !== "text") {
        throw new TypeError("Paragraph text fixture drifted.");
      }
      primary.children = [htmlElement("span", {
        class: "publisher-skip-link",
      }, [htmlText(textNode.value)])] as Mutable<PublisherOfflineHtmlTreeNode[]>;
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      const primary = block.children.find((node) =>
        node.type === "element" && node.tagName === "p"
      );
      if (primary?.type !== "element") {
        throw new TypeError("Paragraph fixture drifted.");
      }
      primary.children = [htmlElement("font", {
        color: "#FBF6EB",
      }, [...primary.children])] as Mutable<PublisherOfflineHtmlTreeNode[]>;
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      const primary = block.children.find((node) =>
        node.type === "element" && node.tagName === "p"
      );
      if (primary?.type !== "element") {
        throw new TypeError("Paragraph fixture drifted.");
      }
      setTreeAttribute(primary, "onclick", "this.hidden=true");
    });
    expectRenderedTreeDrift(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      const primary = block.children.find((node) =>
        node.type === "element" && node.tagName === "p"
      );
      const textNode = primary?.type === "element" ? primary.children[0] : null;
      if (textNode?.type !== "text" || !textNode.value.includes(" ")) {
        throw new TypeError("Paragraph whitespace fixture drifted.");
      }
      textNode.value = textNode.value.replace(" ", "\u2003\u2003");
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      const primary = block.children.find((node) =>
        node.type === "element" && node.tagName === "p"
      );
      if (primary?.type !== "element") {
        throw new TypeError("Paragraph fixture drifted.");
      }
      primary.children = [htmlElement("bdo", { dir: "rtl" }, [
        ...primary.children,
      ])] as Mutable<PublisherOfflineHtmlTreeNode[]>;
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      const primary = block.children.find((node) =>
        node.type === "element" && node.tagName === "p"
      );
      if (primary?.type !== "element") {
        throw new TypeError("Paragraph fixture drifted.");
      }
      setTreeAttribute(primary, "lang", "fr");
    });
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      const primary = block.children.find((node) =>
        node.type === "element" && node.tagName === "p"
      );
      if (primary?.type !== "element") {
        throw new TypeError("Paragraph fixture drifted.");
      }
      primary.children.unshift(htmlElement("template", {
        shadowrootmode: "open",
      }) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    for (const tagName of ["datalist", "rp"] as const) {
      expectRenderedTreeRejected(work, (tree) => {
        const block = findMutableTreeElement(tree, (element) =>
          treeAttribute(element, "data-publisher-block") === paragraphBlock.id
        );
        const primary = block.children.find((node) =>
          node.type === "element" && node.tagName === "p"
        );
        if (primary?.type !== "element") {
          throw new TypeError("Paragraph fixture drifted.");
        }
        primary.children = [htmlElement(tagName, {}, [
          ...primary.children,
        ])] as Mutable<PublisherOfflineHtmlTreeNode[]>;
      });
    }
    expectRenderedTreeRejected(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === paragraphBlock.id
      );
      const primary = block.children.find((node) =>
        node.type === "element" && node.tagName === "p"
      );
      if (primary?.type !== "element") {
        throw new TypeError("Paragraph fixture drifted.");
      }
      primary.children = [htmlElement("progress", {}, [
        ...primary.children,
      ])] as Mutable<PublisherOfflineHtmlTreeNode[]>;
    });
    expectRenderedTreeDrift(work, (tree) => {
      findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === listBlock.id
      ).tagName = "section";
    });
    const thematicBlock = work.expectedDom.blocks.find(({ kind }) =>
      kind === "thematic-break"
    );
    if (thematicBlock === undefined) {
      throw new TypeError("Cardinal thematic block fixture is absent.");
    }
    expectRenderedTreeDrift(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === thematicBlock.id
      );
      removeTreeElement(tree, block);
    });
    expectRenderedTreeDrift(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === listBlock.id
      );
      setTreeAttribute(block, "data-publisher-block", "forged-block-id");
    });
    expectRenderedTreeDrift(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === headingBlock.id
      );
      const wrapper = block.children.find((node) =>
        node.type === "element" &&
        treeAttribute(node, "class") === "publisher-linkable-heading"
      );
      const heading = wrapper?.type === "element"
        ? wrapper.children.find((node) =>
            node.type === "element" && /^h[1-6]$/u.test(node.tagName)
          )
        : undefined;
      if (heading?.type !== "element") {
        throw new TypeError("Heading fixture drifted.");
      }
      heading.tagName = heading.tagName === "h1" ? "h2" : "h1";
    });
    expectRenderedTreeDrift(work, (tree) => {
      findMutableTreeElement(tree, ({ tagName }) => tagName === "h1").tagName =
        "h2";
    });
    const domIdAuthority = documentAuthorities.find((authority) =>
      authority.expectedDom.blocks.some(({ domId }) => domId !== null)
    );
    const domIdBlock = domIdAuthority?.expectedDom.blocks.find(({ domId }) =>
      domId !== null
    );
    if (domIdAuthority === undefined || domIdBlock?.domId === null ||
      domIdBlock === undefined) {
      throw new TypeError("Cardinal block DOM id fixture is absent.");
    }
    expectRenderedTreeDrift(domIdAuthority, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === domIdBlock.id
      );
      setTreeAttribute(block, "id", "forged-block-dom-id");
    });
    expectRenderedTreeDrift(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === listBlock.id
      );
      block.children.push(htmlElement("span", {
        "data-publisher-reader-transient-ui": "true",
      }, [htmlText("FORGED")]) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(work, (tree) => {
      const block = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-block") === listBlock.id
      );
      block.children.push(htmlElement("span", {
        "aria-hidden": "true",
      }, [htmlText("FORGED")]) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(work, (tree) => {
      const body = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "body"
      );
      body.children.push(htmlElement("audio", { src: "/extensionless" }) as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    for (const forbidden of [
      htmlElement("embed", { src: "data:audio/wav;base64,AAAA" }),
      htmlElement("object", { data: "data:audio/ogg;base64,AAAA" }),
      htmlElement("iframe", { srcdoc: "<audio src='/forged'></audio>" }),
      htmlElement("span", { href: "blob:https://publisher.invalid/forged" }),
    ]) {
      expectRenderedTreeDrift(work, (tree) => {
        const body = findMutableTreeElement(tree, ({ tagName }) =>
          tagName === "body"
        );
        body.children.push(mutableClone(forbidden));
      });
    }
  });

  it("rejects work header and synthetic section-title substitutions in trees", () => {
    const work = authorityFor(cardinalPackage.route);
    expectRenderedTreeDrift(work, (tree) => {
      const article = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-work") === "cardinal-scale"
      );
      setTreeAttribute(article, "lang", "fr");
    });
    expectRenderedTreeDrift(work, (tree) => {
      const subtitle = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-work-subtitle"
      );
      replaceFirstTreeText(subtitle, "Forged subtitle");
    });
    expectRenderedTreeDrift(work, (tree) => {
      const subtitle = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-work-subtitle"
      );
      removeTreeElement(tree, subtitle);
    });
    expectRenderedTreeDrift(work, (tree) => {
      const header = findMutableTreeElement(tree, (element) =>
        element.tagName === "header" && element.children.some((node) =>
          node.type === "element" &&
          treeAttribute(node, "class") === "publisher-work-subtitle"
        )
      );
      header.children.push(htmlElement("p", {}, [htmlText("Forged summary")]) as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });

    const syntheticOwner = work.expectedDom.sectionOwners.find((owner) =>
      owner.titleHeading?.blockId === null
    );
    if (syntheticOwner === undefined || syntheticOwner.titleHeading === null) {
      throw new TypeError("Synthetic section title fixture is absent.");
    }
    const syntheticTitle = syntheticOwner.titleHeading;
    expectRenderedTreeDrift(work, (tree) => {
      const section = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-section") === syntheticOwner.id
      );
      const title = section.children.find((node) =>
        node.type === "element" &&
        treeAttribute(node, "class") === "publisher-section-title"
      );
      if (title?.type !== "element") {
        throw new TypeError("Synthetic title tree fixture drifted.");
      }
      removeTreeElement(tree, title);
    });
    expectRenderedTreeDrift(work, (tree) => {
      const section = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-section") === syntheticOwner.id
      );
      const title = section.children.find((node) =>
        node.type === "element" &&
        treeAttribute(node, "class") === "publisher-section-title"
      );
      if (title?.type !== "element") {
        throw new TypeError("Synthetic title tree fixture drifted.");
      }
      replaceFirstTreeText(title, "Forged synthetic title");
    });
    expectRenderedTreeDrift(work, (tree) => {
      const section = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-section") === syntheticOwner.id
      );
      const title = section.children.find((node) =>
        node.type === "element" &&
        treeAttribute(node, "class") === "publisher-section-title"
      );
      if (title?.type !== "element") {
        throw new TypeError("Synthetic title tree fixture drifted.");
      }
      title.tagName = syntheticTitle.tagName === "h2" ? "h3" : "h2";
    });
  });

  it("rejects home card, breadcrumb, navigation, and wrapper substitutions", () => {
    const home = authorityFor("/");
    expectRenderedTreeDrift(home, (tree) => {
      const list = findMutableTreeElement(tree, (element) =>
        element.tagName === "ol" &&
        treeAttribute(element, "class") === "publisher-catalog"
      );
      list.children.reverse();
    });
    expectRenderedTreeDrift(home, (tree) => {
      const card = findMutableTreeElement(tree, (element) =>
        element.tagName === "li" && element.children.some((node) =>
          node.type === "element" && node.tagName === "p" &&
          treeAttribute(node, "class") !== "publisher-reading-stat"
        )
      );
      card.children.push(htmlElement("div", {}, [htmlText("FORGED")]) as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const card = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "li"
      );
      setTreeAttribute(card, "lang", "fr");
    });
    expectRenderedTreeDrift(home, (tree) => {
      const heading = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "h3"
      );
      const route = heading.children.find((node) =>
        node.type === "element" && node.tagName === "a"
      );
      if (route?.type !== "element") {
        throw new TypeError("Home route fixture is absent.");
      }
      setTreeAttribute(route, "href", "/forged/");
    });
    expectRenderedTreeDrift(home, (tree) => {
      const card = findMutableTreeElement(tree, (element) =>
        element.tagName === "li" && element.children.some((node) =>
          node.type === "element" && node.tagName === "p" &&
          treeAttribute(node, "class") !== "publisher-reading-stat"
        )
      );
      const detail = card.children.find((node) =>
        node.type === "element" && node.tagName === "p" &&
        treeAttribute(node, "class") !== "publisher-reading-stat"
      );
      if (detail?.type !== "element") {
        throw new TypeError("Home detail tree fixture is absent.");
      }
      replaceFirstTreeText(detail, "Forged home detail");
    });
    expectRenderedTreeDrift(home, (tree) => {
      const stat = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reading-stat"
      );
      replaceFirstTreeText(stat, "1 word, 1 minute read");
    });
    expectRenderedTreeDrift(home, (tree) => {
      const stat = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-reading-stat"
      );
      setTreeAttribute(stat, "lang", "fr");
    });
    expectRenderedTreeDrift(home, (tree) => {
      const description = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") ===
          "publisher-publication-description"
      );
      replaceFirstTreeText(description, "Forged publication description");
    });
    expectRenderedTreeDrift(home, (tree) => {
      const heading = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "h3"
      );
      heading.children.push(htmlElement("span", {}, [htmlText("FORGED")]) as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      const main = findMutableTreeElement(tree, ({ tagName }) =>
        tagName === "main"
      );
      main.children.push(htmlElement("section", {
        "aria-labelledby": "publisher-collections-heading",
      }) as Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      findMutableTreeElement(tree, ({ tagName }) => tagName === "main")
        .children.push(htmlText("FORGED") as
          Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(home, (tree) => {
      findMutableTreeElement(tree, ({ tagName }) => tagName === "li")
        .children.push(htmlText("FORGED") as
          Mutable<PublisherOfflineHtmlTreeNode>);
    });

    const section = documentAuthorities.find(({ expectedDom }) =>
      expectedDom.pageKind === "section" &&
      expectedDom.sectionNavigations.length === 1 &&
      expectedDom.titleWrapperCount === 1
    );
    if (section === undefined) {
      throw new TypeError("Wrapped section tree fixture is absent.");
    }
    expectRenderedTreeDrift(section, (tree) => {
      const nav = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-label") === "Breadcrumb"
      );
      const list = nav.children.find((node) =>
        node.type === "element" && node.tagName === "ol"
      );
      if (list?.type !== "element") {
        throw new TypeError("Breadcrumb list fixture drifted.");
      }
      list.tagName = "div";
    });
    expectRenderedTreeDrift(section, (tree) => {
      const nav = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-label") === "Breadcrumb"
      );
      const list = nav.children.find((node) =>
        node.type === "element" && node.tagName === "ol"
      );
      const item = list?.type === "element"
        ? list.children.find((node) => node.type === "element")
        : undefined;
      const anchor = item?.type === "element"
        ? item.children.find((node) =>
            node.type === "element" && node.tagName === "a"
          )
        : undefined;
      if (item?.type !== "element" || anchor?.type !== "element") {
        throw new TypeError("Breadcrumb anchor fixture drifted.");
      }
      item.children.splice(item.children.indexOf(anchor), 1);
      findMutableTreeElement(tree, ({ tagName }) => tagName === "header")
        .children.push(anchor);
    });
    expectRenderedTreeDrift(section, (tree) => {
      const nav = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-label") === "Breadcrumb"
      );
      const list = nav.children.find((node) =>
        node.type === "element" && node.tagName === "ol"
      );
      const currentItem = list?.type === "element"
        ? list.children.find((node) =>
            node.type === "element" && node.children.some((child) =>
              child.type === "element" &&
              treeAttribute(child, "aria-current") === "page"
            )
          )
        : undefined;
      const current = currentItem?.type === "element"
        ? currentItem.children.find((node) =>
            node.type === "element" &&
            treeAttribute(node, "aria-current") === "page"
          )
        : undefined;
      if (currentItem?.type !== "element" || current?.type !== "element") {
        throw new TypeError("Current breadcrumb fixture drifted.");
      }
      currentItem.children.splice(currentItem.children.indexOf(current), 1);
      nav.children.push(current);
    });
    expectRenderedTreeDrift(section, (tree) => {
      const current = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-current") === "page"
      );
      replaceFirstTreeText(current, "Forged current section");
    });
    expectRenderedTreeDrift(section, (tree) => {
      const current = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-current") === "page"
      );
      setTreeAttribute(current, "aria-current", null);
    });
    expectRenderedTreeDrift(section, (tree) => {
      const anchor = findMutableTreeElement(tree, (element) =>
        element.tagName === "a" &&
        treeAttribute(element, "href")?.startsWith("/manuscripts/9/") === true
      );
      setTreeAttribute(
        anchor,
        "href",
        `${treeAttribute(anchor, "href") ?? ""}#forged`,
      );
    });
    expectRenderedTreeDrift(section, (tree) => {
      const nav = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-label") === "Section navigation"
      );
      nav.children.reverse();
    });
    expectRenderedTreeDrift(section, (tree) => {
      findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-label") === "Breadcrumb"
      ).children.push(htmlText("FORGED") as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(section, (tree) => {
      findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-label") === "Section navigation"
      ).children.push(htmlText("FORGED") as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(section, (tree) => {
      const nav = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-label") === "Section navigation"
      );
      const link = nav.children.find((node) =>
        node.type === "element" && node.tagName === "a"
      );
      if (link?.type !== "element") {
        throw new TypeError("Section navigation link fixture drifted.");
      }
      nav.children.splice(nav.children.indexOf(link), 1);
      findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "data-publisher-work") === "cardinal-scale"
      ).children.push(link);
    });
    expectRenderedTreeDrift(section, (tree) => {
      const nav = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-label") === "Section navigation"
      );
      const link = nav.children.find((node) =>
        node.type === "element" && node.tagName === "a"
      );
      if (link?.type !== "element") {
        throw new TypeError("Section navigation link fixture drifted.");
      }
      replaceFirstTreeText(link, "Forged navigation label");
    });
    expectRenderedTreeDrift(section, (tree) => {
      const nav = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "aria-label") === "Section navigation"
      );
      const title = nav.children.flatMap((slot) =>
        slot.type === "element" ? slot.children : []
      ).find((element) =>
        element.type === "element" && element.tagName === "span" &&
        treeAttribute(element, "lang") === "en"
      );
      if (title?.type !== "element") {
        throw new TypeError("Section navigation title fixture drifted.");
      }
      setTreeAttribute(title, "lang", "fr");
    });
    expectRenderedTreeDrift(section, (tree) => {
      const wrapper = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-linkable-heading"
      );
      wrapper.children.push(htmlElement("span", {}, [htmlText("FORGED")]) as
        Mutable<PublisherOfflineHtmlTreeNode>);
    });
    expectRenderedTreeDrift(section, (tree) => {
      const action = findMutableTreeElement(tree, (element) =>
        treeAttribute(element, "class") === "publisher-heading-action"
      );
      setTreeAttribute(action, "hidden", null);
    });
  });

  it("rejects malformed, aliased, cyclic, and over-depth tree envelopes", () => {
    const homeTree = mutableTreeFixture(authorityFor("/"));
    homeTree.nodeCount += 1;
    expect(() => projectFixtureTree(
      homeTree as PublisherOfflineHtmlDocumentTree,
    )).toThrow(/tree census drifted/u);

    const unsorted = mutableTreeFixture(authorityFor("/"));
    unsorted.root.attributes.push(["z", "1"], ["a", "2"]);
    expect(() => projectFixtureTree(refinalizeTree(unsorted))).toThrow(
      /attributes exceed authority/u,
    );
    const duplicate = mutableTreeFixture(authorityFor("/"));
    duplicate.root.attributes.push(["proof", "1"], ["proof", "2"]);
    duplicate.root.attributes.sort(([left], [right]) =>
      left.localeCompare(right)
    );
    expect(() => projectFixtureTree(refinalizeTree(duplicate))).toThrow(
      /attributes exceed authority/u,
    );
    const malformed = mutableTreeFixture(authorityFor("/"));
    malformed.root.attributes.push(["bad name", "1"]);
    expect(() => projectFixtureTree(refinalizeTree(malformed))).toThrow(
      /attribute row drifted/u,
    );
    const extraKey = Object.assign({}, documentTreeFixture(authorityFor("/")), {
      rawHtmlHash: fixtureHash("tree-raw-html"),
    });
    expect(() => projectPublisherOfflineDocumentTree(extraKey, {
      cardinalOwnedDomIds: cardinalOwnedDomIds(),
    })).toThrow(/document tree fields drifted/u);

    const cyclicRoot = mutableClone(htmlElement("html"));
    cyclicRoot.children.push(cyclicRoot);
    expect(() => projectPublisherOfflineDocumentTree({
      root: cyclicRoot,
      nodeCount: 2,
      maximumDepth: 2,
      attributeCount: 0,
      attributeCodeUnits: 0,
      textCodeUnits: 0,
    }, { cardinalOwnedDomIds: [] })).toThrow(/cycle or alias/u);

    const shared = mutableClone(htmlText("shared"));
    const aliasRoot = htmlElement("html", {}, [
      htmlElement("p", {}, [shared]),
      htmlElement("p", {}, [shared]),
    ]);
    expect(() => projectPublisherOfflineDocumentTree({
      root: aliasRoot,
      nodeCount: 5,
      maximumDepth: 3,
      attributeCount: 0,
      attributeCodeUnits: 0,
      textCodeUnits: 12,
    }, { cardinalOwnedDomIds: [] })).toThrow(/cycle or alias/u);

    let deep: PublisherOfflineHtmlTreeElementNode = htmlElement("span");
    for (let index = 0; index < 257; index += 1) {
      deep = htmlElement("div", {}, [deep]);
    }
    const deepTree = htmlDocumentTree(deep);
    expect(() => projectPublisherOfflineDocumentTree(deepTree, {
      cardinalOwnedDomIds: [],
    })).toThrow(/node cap/u);
  });

  it("derives all 14 Cardinal document authorities from the exact Reader", () => {
    expect(documentAuthorities).toHaveLength(14);
    expect(new Set(documentAuthorities.map(({ href }) => href)).size).toBe(14);
    const home = authorityFor("/");
    const work = authorityFor(cardinalPackage.route);
    expect(home.readerHomeWorkCards).toHaveLength(9);
    expect(home.expectedDom).toMatchObject({
      pageKind: "home",
      mainId: "publisher:main",
      mainIsDirectRootChild: true,
      homeCollectionSectionCount: 0,
      homeCollectionCardCount: 0,
      homeWorksSectionCount: 1,
      breadcrumbNavigationCount: 0,
      sectionNavigationCount: 0,
    });
    expect(home.expectedDom.homeWorksSections[0]?.cards).toHaveLength(9);
    expect(home.expectedDom.links).toHaveLength(9);
    expect(work.expectedDom.workOwners).toEqual([
      expect.objectContaining({
        id: "cardinal-scale",
        tagName: "article",
        language: "en",
        subtitle: "The First of Many ICONS",
        summary: null,
      }),
    ]);
    expect(work.expectedDom.sectionOwners).toHaveLength(10);
    expect(work.expectedDom.blocks).toHaveLength(83);
    expect(work.expectedDom.links).toHaveLength(0);
    expect(work.expectedDom.mainDirectChildren).toEqual([
      expect.objectContaining({ tagName: "article" }),
    ]);

    const owningSection = documentAuthorities.find((authority) =>
      authority.expectedDom.pageKind === "section" &&
      authority.expectedDom.blocks.some((block) =>
        block.kind === "heading" &&
        block.tagName === "h1" &&
        block.headingLevel === 1
      )
    );
    expect(owningSection).toBeDefined();
    const noteAuthority = documentAuthorities.find((authority) =>
      authority.expectedDom.blocks.some((block) =>
        block.kind === "heading" &&
        block.tagName === "div" &&
        block.headingLevel === 1
      )
    );
    expect(noteAuthority).toBeDefined();
    expect(work.expectedDom.blocks.some((block) =>
      block.kind === "heading" &&
      block.tagName === "div" &&
      block.headingLevel === 1
    )).toBe(true);
    expect(work.expectedDom.blocks.some((block) =>
      block.kind === "list" && block.listTagName === "ul"
    )).toBe(true);
    expect(work.expectedDom.sectionOwners.some((owner) =>
      owner.titleHeading?.blockId === null
    )).toBe(true);
  });

  it("distinguishes duplicate-target catalog roots from their start routes", () => {
    const bySection = new Map<string, PublisherOfflineDocumentSemanticAuthority[]>();
    for (const authority of documentAuthorities) {
      if (authority.routeTarget.kind !== "section") continue;
      const sectionId = authority.routeTarget.sectionId;
      if (sectionId === undefined) continue;
      const current = bySection.get(sectionId) ?? [];
      current.push(authority);
      bySection.set(sectionId, current);
    }
    const duplicateTargetPairs = [...bySection.values()].filter((items) =>
      items.length === 2
    );
    expect(duplicateTargetPairs).toHaveLength(2);
    for (const pair of duplicateTargetPairs) {
      const catalogRoot = pair.find((authority) =>
        authority.routeTarget.routeName === "catalog-root"
      );
      const start = pair.find((authority) =>
        authority.routeTarget.routeName !== "catalog-root"
      );
      if (catalogRoot === undefined || start === undefined) {
        throw new TypeError("Duplicate target route polarity drifted.");
      }
      expect(catalogRoot.expectedDom.ownedDomIdOccurrences.length)
        .toBeGreaterThan(0);
      expect(start.expectedDom.ownedDomIdOccurrences).toHaveLength(0);
      expect(() => assertPublisherOfflineDocumentSemanticProjection(
        catalogRoot,
        start.expectedDom,
      )).toThrow(/exact Reader projection/u);
      expect(() => assertPublisherOfflineDocumentSemanticProjection(
        start,
        catalogRoot.expectedDom,
      )).toThrow(/exact Reader projection/u);
    }
  });

  it("rejects unowned prose, owner, title, and direct-child substitutions", () => {
    const home = authorityFor("/");
    const work = authorityFor(cardinalPackage.route);
    const section = documentAuthorities.find((authority) =>
      authority.expectedDom.pageKind === "section" &&
      authority.expectedDom.breadcrumbs.length === 1
    );
    if (section === undefined) {
      throw new TypeError("Section semantic fixture is absent.");
    }
    const mutations: Array<readonly [
      PublisherOfflineDocumentSemanticAuthority,
      (dom: Mutable<PublisherOfflineDocumentDomProjection>) => void,
    ]> = [
      [home, (dom) => {
        dom.mainIsDirectRootChild = false as true;
      }],
      [home, (dom) => {
        dom.mainId = "forged-main" as "publisher:main";
      }],
      [home, (dom) => {
        dom.unownedDirectText.push("FORGED");
      }],
      [home, (dom) => {
        dom.mainDirectChildren.push({
          tagName: "p",
          className: "",
          ownedBlockIds: [],
        });
      }],
      [home, (dom) => {
        dom.publicationDescription = "Forged description";
      }],
      [home, (dom) => {
        dom.publicationDescriptionTagName = "div" as "p";
      }],
      [home, (dom) => {
        dom.homeWorksSections[0]!.cards.reverse();
      }],
      [home, (dom) => {
        dom.homeWorksSections[0]!.cards[0]!.details.push("Forged summary");
      }],
      [home, (dom) => {
        dom.homeWorksSections[0]!.cards[0]!.readingMinutes += 1;
      }],
      [home, (dom) => {
        dom.homeWorksSections[0]!.cards[0]!.directChildren.push({
          tagName: "div",
          className: "",
          ownedBlockIds: [],
        });
      }],
      [work, (dom) => {
        dom.workOwners[0]!.tagName = "div" as "article";
      }],
      [work, (dom) => {
        dom.workOwners[0]!.language = "fr";
      }],
      [work, (dom) => {
        dom.workOwners[0]!.subtitle = "Forged subtitle";
      }],
      [work, (dom) => {
        dom.workOwners[0]!.articleDirectChildren.push({
          tagName: "p",
          className: "",
          ownedBlockIds: [],
        });
      }],
      [work, (dom) => {
        dom.workOwners[0]!.manuscriptDirectChildren.push({
          tagName: "p",
          className: "",
          ownedBlockIds: [],
        });
      }],
      [work, (dom) => {
        dom.sectionOwners[1]!.tagName = "div" as "section";
      }],
      [work, (dom) => {
        const title = dom.sectionOwners.find((owner) =>
          owner.titleHeading !== null
        )?.titleHeading;
        if (title !== null && title !== undefined) title.text = "Forged";
      }],
      [work, (dom) => {
        dom.sectionOwners[0]!.directChildren.push({
          tagName: "p",
          className: "",
          ownedBlockIds: [],
        });
      }],
      [section, (dom) => {
        dom.allOwnedByMain = false as true;
      }],
      [section, (dom) => {
        dom.titleCount = 2 as 1;
      }],
    ];
    for (const [authority, mutate] of mutations) {
      expectSemanticDrift(authority, mutate);
    }
  });

  it("rejects block kind, tag, level, list, text, order, id, and link drift", () => {
    const work = authorityFor(cardinalPackage.route);
    const listIndex = work.expectedDom.blocks.findIndex((block) =>
      block.kind === "list"
    );
    const headingIndex = work.expectedDom.blocks.findIndex((block) =>
      block.kind === "heading" && block.tagName === "div"
    );
    const thematicIndex = work.expectedDom.blocks.findIndex((block) =>
      block.kind === "thematic-break"
    );
    expect(listIndex).toBeGreaterThanOrEqual(0);
    expect(headingIndex).toBeGreaterThanOrEqual(0);
    expect(thematicIndex).toBeGreaterThanOrEqual(0);

    const mutations: Array<
      (dom: Mutable<PublisherOfflineDocumentDomProjection>) => void
    > = [
      (dom) => {
        dom.blocks[0]!.text = "Same-count forged prose";
      },
      (dom) => {
        [dom.blocks[0], dom.blocks[1]] = [dom.blocks[1]!, dom.blocks[0]!];
      },
      (dom) => {
        dom.blocks[listIndex]!.kind = "paragraph";
      },
      (dom) => {
        dom.blocks[listIndex]!.listTagName = "ol";
      },
      (dom) => {
        dom.blocks[listIndex]!.textSegments = [dom.blocks[listIndex]!.text];
      },
      (dom) => {
        dom.blocks[listIndex]!.text += " FORGED";
      },
      (dom) => {
        dom.blocks[headingIndex]!.headingLevel =
          dom.blocks[headingIndex]!.headingLevel === 1 ? 2 : 1;
      },
      (dom) => {
        dom.blocks[headingIndex]!.tagName = "h2";
      },
      (dom) => {
        dom.blocks.splice(thematicIndex, 1);
      },
      (dom) => {
        dom.blocks[0]!.domId = "forged-dom-id";
      },
      (dom) => {
        dom.ownedDomIdOccurrences.push("forged-owned-dom-id");
      },
      (dom) => {
        dom.blocks[0]!.links.push({ href: "/forged", label: "Forged" });
      },
      (dom) => {
        dom.unexpectedMediaElementCount = 1 as 0;
      },
    ];
    for (const mutate of mutations) expectSemanticDrift(work, mutate);

    const section = documentAuthorities.find((authority) =>
      authority.expectedDom.links.length >= 2
    );
    if (section === undefined) {
      throw new TypeError("Section link fixture is absent.");
    }
    expectSemanticDrift(section, (dom) => {
      dom.links[0]!.label = "Forged breadcrumb";
    });
    expectSemanticDrift(section, (dom) => {
      dom.links.reverse();
    });
  });

  it("binds full breadcrumb and previous-next navigation ownership", () => {
    const section = documentAuthorities.find((authority) =>
      authority.expectedDom.pageKind === "section" &&
      authority.expectedDom.sectionNavigations.length === 1
    );
    if (section === undefined) {
      throw new TypeError("Section navigation fixture is absent.");
    }
    expect(section.expectedDom.breadcrumbs).toHaveLength(1);
    expect(section.expectedDom.breadcrumbs[0]).toMatchObject({
      tagName: "nav",
      className: "publisher-breadcrumbs",
      ariaLabel: "Breadcrumb",
      listCount: 1,
      listTagName: "ol",
    });
    expect(section.expectedDom.breadcrumbs[0]?.items.at(-1)).toMatchObject({
      tagName: "span",
      href: null,
      ariaCurrent: "page",
    });
    expectSemanticDrift(section, (dom) => {
      dom.breadcrumbs[0]!.items.at(-1)!.ariaCurrent = null;
    });
    expectSemanticDrift(section, (dom) => {
      dom.breadcrumbs[0]!.items[0]!.href = "/forged";
    });
    expectSemanticDrift(section, (dom) => {
      dom.breadcrumbs[0]!.listTagName = "div" as "ol";
    });
    expectSemanticDrift(section, (dom) => {
      dom.sectionNavigations[0]!.slots.reverse();
    });
    expectSemanticDrift(section, (dom) => {
      dom.sectionNavigations[0]!.slots[0]!.titleLanguage = "fr";
    });
  });

  it("rejects duplicate, cyclic, and missing Reader route authorities", () => {
    const duplicateActive = mutableClone(projection.reader);
    duplicateActive.routes.active.push(duplicateActive.routes.active[0]!);
    expect(() => createPublisherOfflineDocumentSemanticAuthorities(
      duplicateActive as PublicationReaderEnvelope,
      cardinalPackage,
    )).toThrow(/active route is duplicated/u);

    const missing = mutableClone(projection.reader);
    const replacedPackage = mutableClone(cardinalPackage);
    const documentIndex = replacedPackage.resources.findIndex(({ kind }) =>
      kind === "document"
    );
    replacedPackage.resources[documentIndex] = {
      ...replacedPackage.resources[documentIndex]!,
      href: "/proof-missing-route/",
    };
    expect(() => createPublisherOfflineDocumentSemanticAuthorities(
      missing as PublicationReaderEnvelope,
      replacedPackage as ReaderOfflinePackage,
    )).toThrow(/no active Reader target/u);

    const cyclic = mutableClone(projection.reader);
    cyclic.routes.redirects.push(
      { from: "/proof-a/", to: "/proof-b/", status: 308 },
      { from: "/proof-b/", to: "/proof-a/", status: 308 },
    );
    replacedPackage.resources[documentIndex] = {
      ...replacedPackage.resources[documentIndex]!,
      href: "/proof-a/",
    };
    expect(() => createPublisherOfflineDocumentSemanticAuthorities(
      cyclic as PublicationReaderEnvelope,
      replacedPackage as ReaderOfflinePackage,
    )).toThrow(/contains a cycle/u);
  });

  it("accepts one exact ordered cache receipt and browser evidence envelope", () => {
    const receipt = cacheReceiptFixture();
    const evidence = browserEvidenceFixture(receipt);
    expect(() => assertPublisherOfflineBrowserEvidence(evidence)).not.toThrow();
    expect(receipt.rows.slice(0, 17).map(({ href, kind }) => ({ href, kind })))
      .toEqual(cardinalPackage.resources.map(({ href, kind }) => ({
        href,
        kind,
      })));
    expect(receipt.rows.slice(17).every(({ kind }) => kind === "discovered"))
      .toBe(true);
    expect(receipt.rows.at(-1)?.href).toBe(evidence.replacementFailureHref);
    expect(receipt.totalBytes).toBe(
      receipt.rows.reduce((sum, row) => sum + row.bytes, 0),
    );
  });

  it("rejects declared and discovered receipt order drift", () => {
    expectReceiptEvidenceDrift((receipt) => {
      [receipt.rows[0], receipt.rows[1]] = [
        receipt.rows[1]!,
        receipt.rows[0]!,
      ];
    });

    const twoDiscovered = cacheReceiptWithTwoDiscoveredRows();
    expect(() => assertPublisherOfflineBrowserEvidence(
      browserEvidenceFixture(twoDiscovered),
    )).not.toThrow();
    expectReceiptEvidenceDrift((receipt) => {
      receipt.discoveredResourceHrefs.reverse();
    }, twoDiscovered);
    expectReceiptEvidenceDrift((receipt) => {
      const firstTail = receipt.declaredResourceCount;
      [receipt.rows[firstTail], receipt.rows[firstTail + 1]] = [
        receipt.rows[firstTail + 1]!,
        receipt.rows[firstTail]!,
      ];
    }, twoDiscovered);
  });

  it("rejects receipt identity, classifier, provenance, and digest drift", () => {
    const mutations: Array<
      (receipt: Mutable<PublisherOfflineCacheReceipt>) => void
    > = [
      (receipt) => {
        receipt.rows[3]!.identity = "forged" as "semantic-dom";
      },
      (receipt) => {
        receipt.rows[3]!.contentType = "text/plain; charset=utf-8";
      },
      (receipt) => {
        receipt.rows[3]!.contentType = "application/x-forged;text/html";
      },
      (receipt) => {
        receipt.rows[3]!.contentType = "text/html-bogus";
      },
      (receipt) => {
        receipt.rows[0]!.contentType = "text/html; charset=utf-8";
      },
      (receipt) => {
        receipt.rows.at(-1)!.contentType = "text/html";
      },
      (receipt) => {
        receipt.rows.at(-1)!.contentType = "text/html;charset=utf-8";
      },
      (receipt) => {
        receipt.rows.at(-1)!.contentType = "Text/HTML; Charset=UTF-8";
      },
      (receipt) => {
        receipt.rows[3]!.responseHref = "";
      },
      (receipt) => {
        receipt.rows[3]!.responseHref = "https://outside.invalid/forged";
      },
      (receipt) => {
        receipt.rows[3]!.redirected = true as false;
      },
      (receipt) => {
        const catalogRow = receipt.rows[0];
        if (catalogRow?.identity === "bytes") {
          catalogRow.hash = fixtureHash("catalog-drift");
        }
      },
      (receipt) => {
        receipt.rows.at(-1)!.contentType = "audio/mpeg";
      },
      (receipt) => {
        receipt.rows.at(-1)!.contentType = "text/plain; charset=utf-8";
      },
      (receipt) => {
        receipt.rows.at(-1)!.href = "/_next/static/media/proof.mp3";
        receipt.rows.at(-1)!.responseHref =
          "/_next/static/media/proof.mp3";
        receipt.discoveredResourceHrefs[0] =
          "/_next/static/media/proof.mp3";
      },
    ];
    for (const mutate of mutations) expectReceiptEvidenceDrift(mutate);
  });

  it("binds the exact theme root and compiled stylesheet receipt authority", () => {
    expect(hashJson(FIXTURE_THEME_STYLE_DECLARATIONS)).toBe(
      PUBLISHER_OFFLINE_EXPECTED_ROOT_THEME_STYLE_HASH,
    );
    expect(hashJson(FIXTURE_STYLESHEETS.map(({ path, bytes, hash }) => ({
      path,
      bytes,
      hash,
    })))).toBe(PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH);
    expect(hashJson(FIXTURE_STYLESHEETS.map(({ href }) => href))).toBe(
      PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH,
    );
    expect(hashJson(FIXTURE_STYLESHEETS.map(({ href, bytes, hash }) => ({
      path: href,
      bytes,
      hash,
    })))).not.toBe(PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH);
    expectReceiptEvidenceDrift((receipt) => {
      receipt.rootThemeStyleHash = fixtureHash("forged-root-style") as
        typeof PUBLISHER_OFFLINE_EXPECTED_ROOT_THEME_STYLE_HASH;
    });
    expectReceiptEvidenceDrift((receipt) => {
      receipt.themeTokensHash = fixtureHash("forged-theme-tokens") as
        typeof PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH;
    });
    expectReceiptEvidenceDrift((receipt) => {
      const css = receipt.rows.find(({ href }) =>
        href === FIXTURE_STYLESHEET_HREF
      );
      if (css === undefined || css.identity !== "bytes") {
        throw new TypeError("Stylesheet receipt fixture is absent.");
      }
      css.hash = fixtureHash("forged-stylesheet");
    });
    expectReceiptEvidenceDrift((receipt) => {
      const css = receipt.rows.find(({ href }) =>
        href === FIXTURE_STYLESHEET_HREF
      );
      if (css === undefined) {
        throw new TypeError("Stylesheet receipt fixture is absent.");
      }
      css.bytes += 1;
      receipt.totalBytes += 1;
    });
    expectReceiptEvidenceDrift((receipt) => {
      receipt.stylesheetHrefs[0] =
        "/_next/static/css/substituted-offline-proof.css";
      receipt.stylesheetHrefsHash = hashJson(receipt.stylesheetHrefs) as
        typeof PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH;
    });
    expectReceiptEvidenceDrift((receipt) => {
      receipt.stylesheetHrefs.reverse();
      receipt.stylesheetHrefsHash = hashJson(receipt.stylesheetHrefs) as
        typeof PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH;
    });
  });

  it("rejects receipt byte census and cap forgeries", () => {
    expectReceiptEvidenceDrift((receipt) => {
      receipt.totalBytes -= 1;
    });
    expectReceiptEvidenceDrift((receipt) => {
      for (const row of receipt.rows) {
        row.bytes = PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES;
      }
      receipt.totalBytes = receipt.rows.reduce(
        (sum, row) => sum + row.bytes,
        0,
      );
    });
    expectReceiptEvidenceDrift((receipt) => {
      receipt.rows[3]!.bytes =
        PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES + 1;
      receipt.totalBytes = receipt.rows.reduce(
        (sum, row) => sum + row.bytes,
        0,
      );
    });
  });

  it("rejects receipt row and top-level raw HTML smuggling", () => {
    const receipt = cacheReceiptFixture();
    const semantic = receipt.rows.find(({ identity }) =>
      identity === "semantic-dom"
    );
    if (semantic === undefined) {
      throw new TypeError("Semantic receipt fixture is absent.");
    }
    const rowForgery = mutableClone(receipt) as Mutable<
      PublisherOfflineCacheReceipt
    > & { rows: Array<Record<string, unknown>> };
    const semanticIndex = rowForgery.rows.findIndex(({ identity }) =>
      identity === "semantic-dom"
    );
    rowForgery.rows[semanticIndex]!.rawHtmlHash = fixtureHash("raw-html");
    expect(() => assertPublisherOfflineBrowserEvidence(
      browserEvidenceFixture(rowForgery as unknown as PublisherOfflineCacheReceipt),
    )).toThrow(/row evidence fields drifted/u);

    const receiptForgery = Object.assign({}, receipt, {
      rawHtmlHashes: [fixtureHash("raw-html")],
    }) as PublisherOfflineCacheReceipt;
    expect(() => assertPublisherOfflineBrowserEvidence(
      browserEvidenceFixture(receiptForgery),
    )).toThrow(/receipt evidence fields drifted/u);
  });

  it("keeps volatile HTML byte observations out of durable identity", () => {
    const first = cacheReceiptFixture();
    const drifted = cacheReceiptFixture(1);
    expect(first.totalBytes).not.toBe(drifted.totalBytes);
    const firstSemantic = first.rows.find(({ identity }) =>
      identity === "semantic-dom"
    );
    const driftedSemantic = drifted.rows.find(({ identity }) =>
      identity === "semantic-dom"
    );
    expect(firstSemantic?.bytes).not.toBe(driftedSemantic?.bytes);
    expect(first.hash).toBe(drifted.hash);
    expect(hashJson(publisherOfflineDurableBrowserEvidenceBasis(
      browserEvidenceFixture(first),
    ))).toBe(hashJson(publisherOfflineDurableBrowserEvidenceBasis(
      browserEvidenceFixture(drifted),
    )));
    expect(JSON.stringify(publisherOfflineDurableCacheReceiptBasis(first)))
      .not.toContain('"bytes":10003');
  });

  it("rejects browser lifecycle, in-flight, cold-cache, and cleanup forgeries", () => {
    const evidence = browserEvidenceFixture();
    const patches: ReadonlyArray<Record<string, unknown>> = [
      { preInstallCleanBoundaryCount: 1 },
      { preInstallMetadataRequestCount: 1 },
      { preInstallPackageCacheCount: 1 },
      { preInstallCurrentRuntimeCacheCount: 1 },
      { preInstallSeededCoherenceCacheCount: 4 },
      { preInstallSeededStaleRuntimeCacheCount: 1 },
      { preRegistrationCount: 1 },
      { controlledRegistrationCount: 0 },
      { serviceWorkerScopeRoot: false },
      { serviceWorkerActiveState: "installing" },
      { serviceWorkerControllerState: "redundant" },
      { serviceWorkerInstallingState: "present" },
      { serviceWorkerWaitingState: "present" },
      { serviceWorkerControllerIsActiveWorker: false },
      { publisherRegistrationCount: 1 },
      { publisherCacheCount: 1 },
      { contextClosed: false },
      { browserClosed: false },
      { failedReplacementPreservedPointer: false },
      { failedReplacementPreservedCache: false },
      { failedReplacementRemovedStagingCache: false },
      { inFlightReplacementPreservedPointer: false },
      { inFlightReplacementPreservedCache: false },
      { inFlightStagingCacheCount: 0 },
      { replacementFailureHitCount: 0 },
      { replacementFailurePromiseReleased: false },
      { replacementFailureFetchRestored: false },
      { replacementFailureHref: evidence.installedRoute },
      { successfulReplacementSwitchedPointer: false },
      { successfulReplacementDeletedPriorCache: false },
      { coherenceCachesPreserved: false },
      { coherenceCachesPreservedAfterCleanup: false },
      { coherenceSnapshotBoundaryCount: 5 },
      { activePackageStateBoundaryCount: 2 },
      { packageStateMaximumResponseBytes: 1 },
      { packageStateMaximumAggregateBytes: 1 },
      { metadataSharesPackageStateAggregate: false },
      { postBehaviorPackageStatePreserved: false },
      { postColdPackageStatePreserved: false },
      { stalePublisherRuntimeCachesDeleted: false },
      { browserHttpCacheCleared: false },
      { browserHttpCacheClearedBeforeOfflineCutoff: false },
      { runtimeCacheEntryCountBeforeCold: 1 },
      { runtimeCacheEntryCountAfterCold: 1 },
      { coldOfflineFreshPage: false },
      { offlineReaderTextPresent: false },
      { coldTextVisibilityBoundaryCount: 1 },
      { allColdBlockTextNodesVisible: false },
      { allColdBlockTextNodesPositiveGeometry: false },
      { dormantAudioShellBoundaryCount: 1 },
      { dormantAudioShellVerified: false },
      { unexpectedColdMediaElementCount: 1 },
      { offlineSearchResultCount: 0 },
      { offlineSameOriginFullNavigation: false },
      { excludedRequestsRejected: false },
      { offlineRangeInstalledRequestRejected: false },
      { rangeResponseNotRuntimeCached: false },
      { publishedAudio: "present" },
      { dormantAudioRuntime: "absent" },
      { audioActivation: "exercised" },
    ];
    for (const patch of patches) {
      expect(() => assertPublisherOfflineBrowserEvidence(
        driftEvidence(evidence, patch),
      )).toThrow(/browser evidence drifted/u);
    }

    const rawHashForgery = Object.assign({}, evidence, {
      rawHtmlHash: fixtureHash("raw-html-browser"),
    }) as PublisherOfflineBrowserEvidence;
    expect(() => assertPublisherOfflineBrowserEvidence(rawHashForgery))
      .toThrow(/browser evidence fields drifted/u);

    const parserForgery = mutableClone(evidence);
    parserForgery.markdownParser.readerLinkApplication.sourceClosure.hash =
      fixtureHash("forged-parser-evidence") as
        typeof parserForgery.markdownParser.readerLinkApplication
          .sourceClosure.hash;
    expect(() => assertPublisherOfflineBrowserEvidence(parserForgery))
      .toThrow(/Markdown parser evidence drifted/u);
  });

  it("binds declared kinds and Reader semantic hashes at composition time", () => {
    const exactEvidence = browserEvidenceFixture();
    const summary = composePublisherOfflineHostProofSummary({
      themeSummary: themeSummaryFixture(),
      projection,
      browserEvidence: exactEvidence,
    });
    expect(summary).toMatchObject({
      proofScope: "isolated Publisher offline browser host",
      markdownParser: PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE,
      publishedAudio: "absent",
      dormantAudioRuntime: "present-inert",
      audioActivation: "not exercised",
      explicitInstallCausalityVerified: true,
      serviceWorkerLifecycleVerified: true,
      rollbackVerified: true,
      inFlightAtomicPointerVerified: true,
      atomicReplacementVerified: true,
      coherenceCachesPreserved: true,
      coldOfflineReaderVerified: true,
      coldOfflineTextVisibilityVerified: true,
      packageStateDurabilityVerified: true,
      offlineSearchVerified: true,
      offlineSameOriginNavigationVerified: true,
      excludedRequestsVerified: true,
      rangeAnd206CachingVerified: true,
      generatedHostCleanup: "completed",
    });

    const semanticForgery = mutableClone(cacheReceiptFixture());
    const semanticRow = semanticForgery.rows.find((row) =>
      row.identity === "semantic-dom"
    );
    if (semanticRow?.identity !== "semantic-dom") {
      throw new TypeError("Semantic receipt fixture is absent.");
    }
    semanticRow.semanticHash = fixtureHash("forged-semantic");
    const rehashedSemanticForgery = rehashReceipt(semanticForgery);
    expect(() => assertPublisherOfflineBrowserEvidence(
      browserEvidenceFixture(rehashedSemanticForgery),
    )).not.toThrow();
    expect(() => composePublisherOfflineHostProofSummary({
      themeSummary: themeSummaryFixture(),
      projection,
      browserEvidence: browserEvidenceFixture(rehashedSemanticForgery),
    })).toThrow(/semantic row diverged/u);

    const kindForgery = mutableClone(cacheReceiptFixture());
    const documentRow = kindForgery.rows.find((row) =>
      row.kind === "document" && row.href !== cardinalPackage.route
    );
    if (documentRow === undefined) {
      throw new TypeError("Declared document receipt fixture is absent.");
    }
    documentRow.kind = "data";
    const rehashedKindForgery = rehashReceipt(kindForgery);
    expect(() => assertPublisherOfflineBrowserEvidence(
      browserEvidenceFixture(rehashedKindForgery),
    )).not.toThrow();
    expect(() => composePublisherOfflineHostProofSummary({
      themeSummary: themeSummaryFixture(),
      projection,
      browserEvidence: browserEvidenceFixture(rehashedKindForgery),
    })).toThrow(/receipt catalog authority drifted/u);
  });

  it("rejects forged Reader content and accepted theme identities", () => {
    const forgedProjection = mutableClone(projection);
    const cardinal = forgedProjection.reader.works.find(({ id }) =>
      id === "cardinal-scale"
    );
    const block = cardinal?.sections[0]?.blocks[0];
    if (block === undefined) {
      throw new TypeError("Cardinal Reader block fixture is absent.");
    }
    block.text = `${block.text} forged`;
    expect(() => composePublisherOfflineHostProofSummary({
      themeSummary: themeSummaryFixture(),
      projection: forgedProjection as PublisherThemeHostReaderProjection,
      browserEvidence: browserEvidenceFixture(),
    })).toThrow(/Reader authority is invalid/u);

    const themeDrift = {
      ...themeSummaryFixture(),
      semanticLinkCount: 20,
    } as unknown as PublisherThemeHostProofSummary;
    expect(() => composePublisherOfflineHostProofSummary({
      themeSummary: themeDrift,
      projection,
      browserEvidence: browserEvidenceFixture(),
    })).toThrow(/accepted theme proof identity drifted/u);
  });

  it("guards every transformed browser callback against host leakage", () => {
    expect(assertPublisherOfflineSerializableBrowserCallback(
      (value: string) => value,
    )("serializable")).toBe("serializable");
    expect(() => assertPublisherOfflineSerializableBrowserCallback(() => {
      const __name = "forged transform helper";
      return __name;
    })).toThrow(/unresolved transform helper/u);

    const source = fs.readFileSync(
      fileURLToPath(new URL("./offline-host-proof.ts", import.meta.url)),
      "utf8",
    );
    expect(inspectSerializedBrowserCallbacks(source)).toEqual({
      count: 33,
      unguarded: [],
      transformLeaks: [],
      captures: [],
    });

    const hostCapture = inspectSerializedBrowserCallbacks(`
      function invoke(page) {
        const hostOnlyHelper = () => true;
        return page.evaluate(
          assertPublisherOfflineSerializableBrowserCallback(
            () => hostOnlyHelper(),
          ),
        );
      }
    `);
    expect(hostCapture.count).toBe(1);
    expect(hostCapture.unguarded).toEqual([]);
    expect(hostCapture.transformLeaks).toEqual([]);
    expect(hostCapture.captures.map((row) => row.name)).toEqual([
      "hostOnlyHelper",
    ]);

    const localShadow = inspectSerializedBrowserCallbacks(`
      const sameName = () => false;
      page.evaluate(
        assertPublisherOfflineSerializableBrowserCallback(
          (sameName) => sameName,
        ),
      );
    `);
    expect(localShadow).toEqual({
      count: 1,
      unguarded: [],
      transformLeaks: [],
      captures: [],
    });

    const transformedHelper = inspectSerializedBrowserCallbacks(`
      page.evaluate(
        assertPublisherOfflineSerializableBrowserCallback(() => {
          const namedLocal = () => true;
          return namedLocal();
        }),
      );
    `);
    expect(transformedHelper.count).toBe(1);
    expect(transformedHelper.unguarded).toEqual([]);
    expect(transformedHelper.transformLeaks).not.toEqual([]);
    expect(transformedHelper.captures.map((row) => row.name)).toContain(
      "__name",
    );
  });

  it("keeps import, cleanup, and accepted execution fail closed", () => {
    const source = fs.readFileSync(
      fileURLToPath(new URL("./offline-host-proof.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toContain(
      "throw errors.length === 1\n        ? errors[0]\n        : new AggregateError(",
    );
    expect(source).toContain(
      'new TypeError("Publisher offline browser proof did not close cleanly.")',
    );
    const parserGuard = source.indexOf(
      "const initialMarkdownParserAuthority =",
    );
    const parserImport = source.indexOf(
      "pathToFileURL(initialMarkdownParserAuthority.entryPath).href",
    );
    const readerMarkdownImport = source.indexOf(
      "pathToFileURL(initialMarkdownParserAuthority.readerMarkdownEntryPath).href",
    );
    const themeImport = source.indexOf(
      "await import(pathToFileURL(themeHostProofPath).href)",
    );
    expect(parserGuard).toBeGreaterThan(-1);
    expect(parserImport).toBeGreaterThan(parserGuard);
    expect(readerMarkdownImport).toBeGreaterThan(parserImport);
    expect(themeImport).toBeGreaterThan(readerMarkdownImport);
    const parserInspectionStart = source.indexOf(
      "function inspectPublisherOfflineMarkdownParserAuthority()",
    );
    const parserInspectionEnd = source.indexOf(
      "export function assertPublisherOfflineMarkdownParserEvidence(",
      parserInspectionStart,
    );
    expect(parserInspectionStart).toBeGreaterThan(-1);
    expect(parserInspectionEnd).toBeGreaterThan(parserInspectionStart);
    const parserInspection = source.slice(
      parserInspectionStart,
      parserInspectionEnd,
    );
    expect(parserInspection).toContain(
      "mdastConditionalEntry !== proofMdastConditionalEntry",
    );
    expect(parserInspection).toContain(
      "mdastConditionalEntry === mdastEntry",
    );
    expect(parserInspection).toContain(
      "proofMdastConditionalEntry === mdastEntry",
    );
    expect(parserInspection).toContain(
      "mdastConditionalEntry === readerBundledMdastEntry",
    );
    expect(parserInspection).toContain(
      "proofMdastConditionalEntry === readerBundledMdastEntry",
    );
    expect(parserInspection).toContain(
      "readerBundledMdastEntry === mdastEntry",
    );
    expect(parserInspection).toContain(
      "!reviewedReaderBundledEntries.includes(readerBundledMdastEntry)",
    );
    expect(parserInspection).toContain(
      "@genii-foundation/publisher-reader/node_modules/mdast-util-from-markdown/index.js",
    );
    expect(parserInspection).toContain(
      "@genii-foundation/publisher-reader/node_modules/mdast-util-from-markdown/dev/index.js",
    );
    expect(source).not.toContain(
      'applyReaderLinksToMarkdown,\n} from "@genii-foundation/publisher-reader/markdown"',
    );
    expect(source).not.toContain(
      'import { fromMarkdown } from "mdast-util-from-markdown"',
    );
    expect(source).not.toContain("runPublisherThemeHostProof,");
    expect(source).toContain(
      "const themeSummary = await (runThemeHostProof as (",
    );
    expect(source).toContain(
      "browserEvidence = await runPublisherOfflineBrowserSession(input);",
    );
    const compositionStart = source.indexOf(
      "export function composePublisherOfflineHostProofSummary(",
    );
    const runAttemptStart = source.indexOf(
      "async function runPublisherOfflineHostProofAttempt(",
      compositionStart,
    );
    const compositionSource = source.slice(compositionStart, runAttemptStart);
    expect(compositionSource).toContain(
      "assertPublisherOfflineMarkdownParserAuthority()",
    );
    const acceptedRunnerStart = source.indexOf(
      "export async function runPublisherOfflineHostProof():",
      runAttemptStart,
    );
    const acceptedRunnerEnd = source.indexOf(
      "export function assertPublisherOfflineCliArguments(",
      acceptedRunnerStart,
    );
    const acceptedRunnerSource = source.slice(
      acceptedRunnerStart,
      acceptedRunnerEnd,
    );
    expect(acceptedRunnerSource).toContain("finally {");
    expect(acceptedRunnerSource.match(
      /assertPublisherOfflineMarkdownParserAuthority\(\);/gu,
    )).toHaveLength(2);
    expect(acceptedRunnerSource).toContain(
      "new AggregateError(\n        [runFailure, authorityError]",
    );
    expect(source).toContain(
      "path.resolve(process.argv[1]) === scriptPath",
    );
    expect(source).not.toContain("catch(() => true)");
    expect(source).not.toContain("browserRunner");
    expect(source).not.toContain("themeProofRunner");
  });
});
