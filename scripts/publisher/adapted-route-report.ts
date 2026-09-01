import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashCanonicalJson } from "@genii-foundation/publisher-content";
import type { JSONValue } from "@genii-foundation/publisher-schema";

import {
  adaptCoherencePublisherContent,
  loadCoherencePublisherContentAuthorities,
  type CoherencePublisherContentProof,
} from "./content-adapter";
import {
  REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE,
  assertReviewedPublisherRouteAudit,
  createPublisherRouteOwnershipAuditForReader,
  defaultPublisherRouteReportPaths,
  runPublisherRouteReport,
  type CreatedPublisherRouteOwnershipAudit,
  type PublisherRouteAuditBaseline,
  type PublisherRouteReportPaths,
  type PublisherRouteReportResult,
} from "./route-report";

const EXPECTED_CONTENT_EVIDENCE_SHA256 =
  "sha256:7a4de33169f6f21e799acf97ddb702bcf84bd2df341fa2e542096cc6be6c5f37";
const EXPECTED_ADAPTED_CONTENT_BUILD_ID =
  "sha256:875982935232aa71f0a615cf94f07323a2adb18cc648e213d0fd06e5579e0b17";
const EXPECTED_ADAPTED_READER_BUILD_ID =
  "sha256:77f94de86e3fe3462a4f905ad2884207aa11f8b9137dcf90486031a214af7d03";
const EXPECTED_ADAPTED_APPLICATION_BUILD_ID =
  "sha256:088a25ba74bf51995d9dc61fe67473b94f74181b6051fa614c6756588a3fb547";
const EXPECTED_RAW_ACTIVE_ROUTE_COUNT = 535;
const EXPECTED_ACTIVE_ROUTE_COUNT = 586;
const EXPECTED_ADDED_ACTIVE_ROUTE_COUNT = 51;
const EXPECTED_MANIFEST_REDIRECT_COUNT = 518;
const EXPECTED_RESOLVED_ROUTE_ALIAS_SOURCE_COUNT = 33;
const EXPECTED_RESOLVED_ROUTE_ALIAS_REDIRECT_COUNT = 66;
const EXPECTED_ADAPTED_REDIRECT_COUNT = 584;
const EXPECTED_ROUTE_PLAN_STATIC_PARAM_COUNT = 586;
const EXPECTED_APPLICATION_STATIC_PARAM_COUNT = 585;
const EXPECTED_SEMANTIC_TARGET_ROUTE_COUNT = 4;
const EXPECTED_CATALOG_ROOT_ROUTE_ADDITION_COUNT = 44;
const EXPECTED_SECTION_INDEX_COUNT = 3;
const EXPECTED_SECTION_INDEX_REFERENCE_COUNT = 57;
const EXPECTED_ROUTE_PLAN_ACTIVE_PATHS_SHA256 =
  "sha256:62d07fd9d597dd4f86ca53dedaff583efd155aabc421caef578cefa38a648991";
const EXPECTED_ROUTE_PLAN_STATIC_PARAMS_SHA256 =
  "sha256:7268c8b6dfdd6436088d8aa7a900c3d951d1cff8c22d6f6de084c5de1ffeb146";
const EXPECTED_APPLICATION_STATIC_PARAMS_SHA256 =
  "sha256:dcf4d19e4173927dc88c43b4908d146537ca820d660e4af30a5f2d134a6e067e";
const EXPECTED_ADAPTED_REDIRECTS_SHA256 =
  "sha256:8193048bfc8ece56bf2d2349d7e6468d07ec7e9a663961aedffb77ff40be3948";
const EXPECTED_RESOLVED_ROUTE_ALIAS_SOURCES_SHA256 =
  "sha256:3c93ac3efe2fcc79cd0fca9c0e955af3dbab19badecd6fa124c144d3f897a7d0";
const EXPECTED_RESOLVED_ROUTE_ALIAS_REDIRECTS_SHA256 =
  "sha256:cbae5863333e4f21e7fa86c8bae2c4b9506ebc8e147a24ea446395c0d04ed5a9";
const EXPECTED_SEMANTIC_TARGET_ROUTES_SHA256 =
  "sha256:16981ac76a2020fca276f0fa489055e542002948dc9387ebb41d9bbe707b6538";
const EXPECTED_CATALOG_ROOT_ROUTE_ADDITIONS_SHA256 =
  "sha256:9ac78c1a980f76a230e449b3a5e9760f2e52d2ea51ba366c7113b36f254edbe2";
const EXPECTED_SECTION_INDEXES_SHA256 =
  "sha256:1bbe96438b6c2b4f772b5c2bde098108f9cd7a82ad58b7307ee70a1bc365e25c";
const EXPECTED_CURRENT_NESTED_FRAGMENT_HREF_COUNT = 107;
const EXPECTED_CURRENT_NESTED_FRAGMENT_HREFS_SHA256 =
  "sha256:ebf2dfdc34eaf7d8b9fbacd170e3b3074b516e72ba01a07968da2eaae16c8895";
const EXPECTED_REMAINING_CURRENT_NESTED_FRAGMENT_GAP_COUNT = 0;
const EXPECTED_REMAINING_CURRENT_NESTED_FRAGMENT_GAPS_SHA256 =
  "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945";
const EXPECTED_CURRENT_NESTED_FRAGMENT_SOURCES = Object.freeze([
  "catalog-current-section",
  "route-ledger",
]);

export const EXPECTED_ADAPTED_PUBLISHER_ROUTE_AUDIT = Object.freeze({
  identity: Object.freeze({
    authorities: REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE.identity.authorities,
    publisherCommit:
      REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE.identity.publisherCommit,
    readerBuildId: EXPECTED_ADAPTED_READER_BUILD_ID,
  }),
  counts: Object.freeze({
    routeLedgerEntryCount: 11_459,
    durableHrefCount: 6_975,
    durablePathnameCount: 6_390,
    durableQueryHrefCount: 0,
    durableFragmentEntryCount: 591,
    durableFragmentHrefCount: 585,
    publisherActiveRouteCount: 586,
    publisherActivePathCount: 586,
    publisherActiveWorkPathCount: 9,
    publisherActiveSectionPathCount: 573,
    publisherActiveOtherPathCount: 4,
    publisherExplicitRedirectCount: 584,
    publisherDerivedSlashRedirectCount: 585,
    publisherRendererResourceCount: 6,
    publisherSyncMethodPathCount: 8,
    publisherSyncPathCount: 6,
    currentCoherenceExactPathCount: 14,
    retainedCoherenceExactPathCount: 11,
    retainedCoherencePrefixCount: 6,
    catalogPartPathCount: 47,
    catalogChapterPathCount: 386,
    unownedPartPathCount: 42,
    unownedChapterPathCount: 15,
    exactPathCollisionCount: 3,
    decodedRouteCollisionCount: 0,
    pathCollisionCount: 3,
    unclassifiedDurablePathnameCount: 5_513,
    readerFragmentAddressCount: 3_639,
    requiredFragmentHrefCount: 988,
    fragmentTranslationCount: 0,
    fragmentGapCount: 810,
    issueCount: 6_383,
  }),
  issueCodeCounts: Object.freeze({
    "aggregate-chapter-unowned": 15,
    "aggregate-part-unowned": 42,
    collision: 3,
    "fragment-gap": 810,
    "unclassified-durable-path": 5_513,
  }),
  reportSha256:
    "sha256:94c170dd40b2a23bb77b82f1a3bf64d9ce75de79cd926022b8d698b877c8c7da",
}) satisfies PublisherRouteAuditBaseline;

export type AdaptedPublisherRouteAuditResult = Readonly<{
  raw: PublisherRouteReportResult;
  adapted: CreatedPublisherRouteOwnershipAudit & Readonly<{
    audit: PublisherRouteAuditBaseline;
  }>;
  currentNestedFragmentHrefs: readonly string[];
  remainingCurrentNestedFragmentGapHrefs: readonly string[];
}>;

export type AdaptedPublisherRouteAuditCliSummary = Readonly<{
  schemaVersion: 2;
  status: "verified";
  proofKind: "coherence-adapted-route-audit";
  comparisonKind: "derived-adapted-comparison";
  replacesRawBaseline: false;
  contentEvidenceSha256: string;
  identities: Readonly<{
    publisherCommit: string;
    routeAuthorities: PublisherRouteAuditBaseline["identity"]["authorities"];
    rawReaderBuildId: string;
    rawReportSha256: string;
    adaptedReaderBuildId: string;
    adaptedReportSha256: string;
  }>;
  projections: Readonly<{
    activeRoutes: number;
    routePlanStaticParams: number;
    applicationStaticParams: number;
  }>;
  routeAudit: Readonly<{
    rawIssueCount: number;
    adaptedIssueCount: number;
    resolvedIssueCount: number;
    issueCodeCounts: PublisherRouteAuditBaseline["issueCodeCounts"];
    durableFragmentGapCount: number;
    currentCatalogNestedFragmentCoverage: Readonly<{
      requiredCount: number;
      requiredHrefsSha256: string;
      remainingGapCount: number;
      remainingGapHrefsSha256: string;
      contentProofScope: string;
      sources: readonly string[];
    }>;
  }>;
}>;

function exact(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label} drifted. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function exactJson(actual: unknown, expected: unknown, label: string): void {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(
      `${label} drifted. Expected ${expectedText}, received ${actualText}.`,
    );
  }
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function assertAdaptedPublisherContentProof(
  proof: CoherencePublisherContentProof,
): void {
  const { evidenceSha256, ...evidenceBasis } = proof.evidence;
  exact(
    hashCanonicalJson(evidenceBasis as unknown as JSONValue),
    evidenceSha256,
    "Adapted content evidence basis identity",
  );
  exact(
    evidenceSha256,
    EXPECTED_CONTENT_EVIDENCE_SHA256,
    "Adapted content evidence identity",
  );
  exact(proof.evidence.integration.proofOnly, true, "Adapted proof-only flag");
  exact(
    proof.evidence.integration.wiredToHostRoutes,
    false,
    "Adapted host wiring flag",
  );
  exact(
    proof.evidence.integration.appWiringApproved,
    false,
    "Adapted application wiring approval flag",
  );
  exact(
    proof.content.buildId,
    EXPECTED_ADAPTED_CONTENT_BUILD_ID,
    "Adapted content identity",
  );
  exact(
    proof.evidence.identities.finalContentBuildId,
    EXPECTED_ADAPTED_CONTENT_BUILD_ID,
    "Adapted content evidence identity",
  );
  exact(
    proof.evidence.identities.baselineReaderBuildId,
    REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE.identity.readerBuildId,
    "Raw Reader evidence identity",
  );
  exact(
    proof.evidence.identities.finalReaderBuildId,
    EXPECTED_ADAPTED_READER_BUILD_ID,
    "Adapted content evidence Reader identity",
  );
  exact(
    proof.reader.buildId,
    EXPECTED_ADAPTED_READER_BUILD_ID,
    "Adapted Reader identity",
  );
  exact(
    proof.application.reader.buildId,
    proof.reader.buildId,
    "Adapted application Reader relationship",
  );
  exact(
    hashCanonicalJson(proof.application.reader as unknown as JSONValue),
    hashCanonicalJson(proof.reader as unknown as JSONValue),
    "Adapted application Reader payload identity",
  );
  exact(
    proof.application.manifest.buildId,
    EXPECTED_ADAPTED_APPLICATION_BUILD_ID,
    "Adapted application identity",
  );
  exact(
    proof.evidence.identities.finalApplicationBuildId,
    EXPECTED_ADAPTED_APPLICATION_BUILD_ID,
    "Adapted application evidence identity",
  );
  exact(
    proof.evidence.routes.finalActiveRouteCount,
    EXPECTED_ACTIVE_ROUTE_COUNT,
    "Adapted content active route count",
  );
  exact(
    proof.reader.routes.active.length,
    EXPECTED_ACTIVE_ROUTE_COUNT,
    "Adapted Reader active route count",
  );
  exact(
    proof.evidence.projections.routePlanStaticParamCount,
    EXPECTED_ROUTE_PLAN_STATIC_PARAM_COUNT,
    "Adapted content route plan static parameter count",
  );
  exact(
    proof.routePlan.staticParams.length,
    EXPECTED_ROUTE_PLAN_STATIC_PARAM_COUNT,
    "Adapted route plan static parameter count",
  );
  exact(
    proof.evidence.projections.routePlanActivePathsSha256,
    EXPECTED_ROUTE_PLAN_ACTIVE_PATHS_SHA256,
    "Adapted route plan active path evidence identity",
  );
  exact(
    hashCanonicalJson(proof.routePlan.activePaths as unknown as JSONValue),
    EXPECTED_ROUTE_PLAN_ACTIVE_PATHS_SHA256,
    "Adapted route plan active path identity",
  );
  exactJson(
    proof.routePlan.activePaths,
    proof.reader.routes.active.map(({ path: routePath }) => routePath),
    "Adapted Reader and route plan active paths",
  );
  exact(
    proof.evidence.projections.routePlanStaticParamsSha256,
    EXPECTED_ROUTE_PLAN_STATIC_PARAMS_SHA256,
    "Adapted route plan static parameter evidence identity",
  );
  exact(
    hashCanonicalJson(proof.routePlan.staticParams as unknown as JSONValue),
    EXPECTED_ROUTE_PLAN_STATIC_PARAMS_SHA256,
    "Adapted route plan static parameter identity",
  );
  exact(
    proof.evidence.projections.applicationStaticParamCount,
    EXPECTED_APPLICATION_STATIC_PARAM_COUNT,
    "Adapted content application static parameter count",
  );
  exact(
    proof.application.staticParams.length,
    EXPECTED_APPLICATION_STATIC_PARAM_COUNT,
    "Adapted application static parameter count",
  );
  exact(
    proof.evidence.projections.applicationStaticParamsSha256,
    EXPECTED_APPLICATION_STATIC_PARAMS_SHA256,
    "Adapted application static parameter evidence identity",
  );
  exact(
    hashCanonicalJson(proof.application.staticParams as unknown as JSONValue),
    EXPECTED_APPLICATION_STATIC_PARAMS_SHA256,
    "Adapted application static parameter identity",
  );
  exact(
    proof.evidence.routes.baselineActiveRouteCount,
    EXPECTED_RAW_ACTIVE_ROUTE_COUNT,
    "Raw content active route count",
  );
  exact(
    proof.evidence.routes.finalActiveRouteCount -
      proof.evidence.routes.baselineActiveRouteCount,
    EXPECTED_ADDED_ACTIVE_ROUTE_COUNT,
    "Adapted added active route count",
  );
  exact(
    proof.evidence.routes.redirectCount,
    EXPECTED_ADAPTED_REDIRECT_COUNT,
    "Adapted content redirect count",
  );
  exact(
    proof.reader.routes.redirects.length,
    EXPECTED_ADAPTED_REDIRECT_COUNT,
    "Adapted Reader redirect count",
  );
  exact(
    proof.application.manifest.continuity.explicitRedirectCount,
    EXPECTED_ADAPTED_REDIRECT_COUNT,
    "Adapted application redirect count",
  );
  exact(
    proof.evidence.routes.manifestRedirectCount,
    EXPECTED_MANIFEST_REDIRECT_COUNT,
    "Raw manifest redirect count",
  );
  exact(
    proof.evidence.routes.resolvedRouteAliasSourceCount,
    EXPECTED_RESOLVED_ROUTE_ALIAS_SOURCE_COUNT,
    "Resolved route alias source count",
  );
  exact(
    hashCanonicalJson(
      proof.evidence.routes.resolvedRouteAliasSources as unknown as JSONValue,
    ),
    EXPECTED_RESOLVED_ROUTE_ALIAS_SOURCES_SHA256,
    "Resolved route alias source identity",
  );
  exact(
    proof.evidence.routes.resolvedRouteAliasRedirectCount,
    EXPECTED_RESOLVED_ROUTE_ALIAS_REDIRECT_COUNT,
    "Resolved route alias redirect count",
  );
  exact(
    proof.evidence.routes.resolvedRouteAliasRedirectsSha256,
    EXPECTED_RESOLVED_ROUTE_ALIAS_REDIRECTS_SHA256,
    "Resolved route alias redirect identity",
  );
  exact(
    proof.evidence.routes.unresolvedRouteAliasSourceCount,
    0,
    "Unresolved route alias source count",
  );
  exactJson(
    proof.evidence.routes.unresolvedRouteAliasSources,
    [],
    "Unresolved route alias sources",
  );
  exact(
    hashCanonicalJson(
      proof.content.routes.redirects as unknown as JSONValue,
    ),
    EXPECTED_ADAPTED_REDIRECTS_SHA256,
    "Adapted content redirect tuple identity",
  );
  exact(
    hashCanonicalJson(
      proof.reader.routes.redirects as unknown as JSONValue,
    ),
    EXPECTED_ADAPTED_REDIRECTS_SHA256,
    "Adapted Reader redirect tuple identity",
  );
  exact(
    proof.evidence.routes.semanticTargetRouteCount,
    EXPECTED_SEMANTIC_TARGET_ROUTE_COUNT,
    "Semantic target route count",
  );
  exact(
    hashCanonicalJson(
      proof.evidence.routes.semanticTargetRoutes as unknown as JSONValue,
    ),
    EXPECTED_SEMANTIC_TARGET_ROUTES_SHA256,
    "Semantic target route identity",
  );
  exact(
    proof.evidence.routes.catalogRootRouteAdditionCount,
    EXPECTED_CATALOG_ROOT_ROUTE_ADDITION_COUNT,
    "Catalog root route addition count",
  );
  exact(
    proof.evidence.routes.catalogRootRouteAdditionsSha256,
    EXPECTED_CATALOG_ROOT_ROUTE_ADDITIONS_SHA256,
    "Catalog root route addition identity",
  );
  exact(
    proof.evidence.routes.sectionIndexCount,
    EXPECTED_SECTION_INDEX_COUNT,
    "Section index route count",
  );
  exact(
    proof.evidence.routes.sectionIndexReferenceCount,
    EXPECTED_SECTION_INDEX_REFERENCE_COUNT,
    "Section index reference count",
  );
  exact(
    proof.evidence.routes.sectionIndexesSha256,
    EXPECTED_SECTION_INDEXES_SHA256,
    "Section index identity",
  );
  exact(
    proof.evidence.routes.semanticTargetRouteCount +
      proof.evidence.routes.catalogRootRouteAdditionCount +
      proof.evidence.routes.sectionIndexCount,
    EXPECTED_ADDED_ACTIVE_ROUTE_COUNT,
    "Adapted active route provenance count",
  );
  exact(
    proof.evidence.routes.finalMissingReaderFragmentHrefCount,
    EXPECTED_REMAINING_CURRENT_NESTED_FRAGMENT_GAP_COUNT,
    "Remaining current catalog fragment href count",
  );
  exact(
    proof.evidence.routes.finalMissingReaderFragmentHrefsSha256,
    EXPECTED_REMAINING_CURRENT_NESTED_FRAGMENT_GAPS_SHA256,
    "Remaining current catalog fragment content evidence identity",
  );
  exactJson(
    proof.evidence.routes.currentCatalogFragmentCoverage,
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
    "Current catalog fragment coverage evidence",
  );
}

function deriveCurrentNestedFragmentHrefs(
  proof: CoherencePublisherContentProof,
): readonly string[] {
  const hrefs = proof.evidence.routes.catalogChapterRootOwnerGroups
    .flatMap(({ path: ownerPath, childIds }) =>
      childIds.map((sectionId) => `${ownerPath}#${sectionId}`),
    )
    .sort((left, right) => left.localeCompare(right));
  exact(
    hrefs.length,
    EXPECTED_CURRENT_NESTED_FRAGMENT_HREF_COUNT,
    "Derived current nested fragment href count",
  );
  exact(
    new Set(hrefs).size,
    EXPECTED_CURRENT_NESTED_FRAGMENT_HREF_COUNT,
    "Unique current nested fragment href count",
  );
  exact(
    sha256Json(hrefs),
    EXPECTED_CURRENT_NESTED_FRAGMENT_HREFS_SHA256,
    "Current nested fragment href identity",
  );
  return Object.freeze(hrefs);
}

function assertCurrentNestedFragmentCoverage(
  currentNestedFragmentHrefs: readonly string[],
  adapted: CreatedPublisherRouteOwnershipAudit,
): readonly string[] {
  exact(
    adapted.report.fragments.gaps.length,
    EXPECTED_ADAPTED_PUBLISHER_ROUTE_AUDIT.counts.fragmentGapCount,
    "Adapted durable fragment gap count",
  );
  const currentNestedHrefSet = new Set(currentNestedFragmentHrefs);
  const matchingGaps = adapted.report.fragments.gaps.filter(({ href }) =>
    currentNestedHrefSet.has(href),
  );
  exact(
    matchingGaps.length,
    EXPECTED_REMAINING_CURRENT_NESTED_FRAGMENT_GAP_COUNT,
    "Remaining current nested fragment gap count",
  );
  const remainingHrefs = matchingGaps
    .map(({ href }) => href)
    .sort((left, right) => left.localeCompare(right));
  exact(
    sha256Json(remainingHrefs),
    EXPECTED_REMAINING_CURRENT_NESTED_FRAGMENT_GAPS_SHA256,
    "Remaining current nested fragment gap identity",
  );
  const matchingIssues = adapted.report.issues.filter(
    ({ code, path: issuePath }) =>
      code === "fragment-gap" && currentNestedHrefSet.has(issuePath),
  );
  exact(
    matchingIssues.length,
    EXPECTED_REMAINING_CURRENT_NESTED_FRAGMENT_GAP_COUNT,
    "Remaining current nested fragment issue count",
  );
  return Object.freeze(remainingHrefs);
}

export async function createAdaptedPublisherRouteAudit(
  proof: CoherencePublisherContentProof,
  paths: PublisherRouteReportPaths = defaultPublisherRouteReportPaths,
): Promise<AdaptedPublisherRouteAuditResult> {
  assertAdaptedPublisherContentProof(proof);
  const raw = await runPublisherRouteReport({ paths, mode: "audit" });
  exactJson(
    raw.audit,
    REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE,
    "Independent raw route audit",
  );
  const adapted = await createPublisherRouteOwnershipAuditForReader(
    proof.reader,
    paths,
  );
  exactJson(
    adapted.identity.authorities,
    raw.identity.authorities,
    "Raw and adapted route authority identities",
  );
  const audit = assertReviewedPublisherRouteAudit(
    adapted.report,
    adapted.identity,
    EXPECTED_ADAPTED_PUBLISHER_ROUTE_AUDIT,
  );
  const currentNestedFragmentHrefs =
    deriveCurrentNestedFragmentHrefs(proof);
  const remainingCurrentNestedFragmentGapHrefs =
    assertCurrentNestedFragmentCoverage(currentNestedFragmentHrefs, adapted);
  return Object.freeze({
    raw,
    adapted: Object.freeze({ ...adapted, audit }),
    currentNestedFragmentHrefs,
    remainingCurrentNestedFragmentGapHrefs,
  });
}

export async function runAdaptedPublisherRouteAudit(): Promise<
  AdaptedPublisherRouteAuditResult
> {
  const authorities = await loadCoherencePublisherContentAuthorities();
  const proof = await adaptCoherencePublisherContent(authorities);
  return createAdaptedPublisherRouteAudit(proof);
}

export function adaptedPublisherRouteAuditCliSummary(
  result: AdaptedPublisherRouteAuditResult,
): AdaptedPublisherRouteAuditCliSummary {
  return Object.freeze({
    schemaVersion: 2 as const,
    status: "verified" as const,
    proofKind: "coherence-adapted-route-audit" as const,
    comparisonKind: "derived-adapted-comparison" as const,
    replacesRawBaseline: false as const,
    contentEvidenceSha256: EXPECTED_CONTENT_EVIDENCE_SHA256,
    identities: Object.freeze({
      publisherCommit: result.adapted.audit.identity.publisherCommit,
      routeAuthorities: result.adapted.audit.identity.authorities,
      rawReaderBuildId: result.raw.audit.identity.readerBuildId,
      rawReportSha256: result.raw.audit.reportSha256,
      adaptedReaderBuildId: result.adapted.audit.identity.readerBuildId,
      adaptedReportSha256: result.adapted.audit.reportSha256,
    }),
    projections: Object.freeze({
      activeRoutes: EXPECTED_ACTIVE_ROUTE_COUNT,
      routePlanStaticParams: EXPECTED_ROUTE_PLAN_STATIC_PARAM_COUNT,
      applicationStaticParams: EXPECTED_APPLICATION_STATIC_PARAM_COUNT,
    }),
    routeAudit: Object.freeze({
      rawIssueCount: result.raw.audit.counts.issueCount,
      adaptedIssueCount: result.adapted.audit.counts.issueCount,
      resolvedIssueCount:
        result.raw.audit.counts.issueCount -
        result.adapted.audit.counts.issueCount,
      issueCodeCounts: result.adapted.audit.issueCodeCounts,
      durableFragmentGapCount:
        result.adapted.audit.counts.fragmentGapCount,
      currentCatalogNestedFragmentCoverage: Object.freeze({
        requiredCount: result.currentNestedFragmentHrefs.length,
        requiredHrefsSha256: EXPECTED_CURRENT_NESTED_FRAGMENT_HREFS_SHA256,
        remainingGapCount:
          result.remainingCurrentNestedFragmentGapHrefs.length,
        remainingGapHrefsSha256:
          EXPECTED_REMAINING_CURRENT_NESTED_FRAGMENT_GAPS_SHA256,
        contentProofScope:
          "adapted-reader-current-catalog-section-fragments",
        sources: EXPECTED_CURRENT_NESTED_FRAGMENT_SOURCES,
      }),
    }),
  });
}

function assertNoCliArguments(args: readonly string[]): void {
  if (args.length !== 0) {
    throw new TypeError("Usage: adapted-route-report.ts");
  }
}

async function main(args: readonly string[]): Promise<void> {
  assertNoCliArguments(args);
  const result = await runAdaptedPublisherRouteAudit();
  console.log(
    JSON.stringify(adaptedPublisherRouteAuditCliSummary(result), null, 2),
  );
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
