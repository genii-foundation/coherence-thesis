import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import type { BuiltPublicationReader } from "@genii-foundation/publisher/node";

import {
  aliasConfigPath,
  editorialRoot,
  generatedCatalogPath,
  generatedPublisherReportsRoot,
  publisherConfigurationRoot,
  publisherPublicationManifestPath,
  publishingRoot,
  repoRoot,
  routeAliasConfigPath,
  routeLedgerPath,
} from "../repository/paths";
import {
  auditPublisherCandidate,
  formatPublisherCandidateFailure,
} from "../repository/publisher-candidate";
import {
  createPublisherReaderBuild,
  defaultPublisherReaderBuildPaths,
} from "./reader-build";
import {
  buildPublisherRouteOwnershipReport,
  type CoherenceCatalogRouteInput,
  type CoherenceRouteAliasesInput,
  type CoherenceRouteLedgerInput,
  type CoherenceSectionAliasesInput,
  type PublisherReaderRouteEnvelope,
  type PublisherRouteOwnershipCounts,
  type PublisherRouteOwnershipIssueCode,
  type PublisherRouteOwnershipReport,
} from "./route-ownership";

type JsonRecord = Record<string, unknown>;

export type PublisherRouteReportPaths = {
  publicationRoot: string;
  catalogPath: string;
  routeLedgerPath: string;
  routeAliasesPath: string;
  sectionAliasesPath: string;
};

export type PublisherRouteReportMode = "audit" | "write";

export type PublisherRouteReportWriteResult = {
  readonly absolutePath: string;
  readonly byteLength: number;
  readonly outcome: "current" | "written";
  readonly relativePath: string;
};

export type PublisherRouteAuditIssueCounts = Readonly<
  Partial<Record<PublisherRouteOwnershipIssueCode, number>>
>;

export type PublisherRouteAuditBaseline = {
  readonly identity: PublisherRouteAuditIdentity;
  readonly counts: Readonly<PublisherRouteOwnershipCounts>;
  readonly issueCodeCounts: PublisherRouteAuditIssueCounts;
  readonly reportSha256: string;
};

export type PublisherRouteAuthorityIdentity = {
  readonly catalogRouteProjectionSha256: string;
  readonly routeLedgerSha256: string;
  readonly routeAliasesSha256: string;
  readonly sectionAliasesSha256: string;
};

export type PublisherRouteAuditIdentity = {
  readonly authorities: PublisherRouteAuthorityIdentity;
  readonly publisherCommit: string;
  readonly readerBuildId: string;
};

export type CreatedPublisherRouteOwnershipAudit = {
  readonly identity: PublisherRouteAuditIdentity;
  readonly report: PublisherRouteOwnershipReport;
};

export type PublisherRouteReportResult = {
  readonly identity: PublisherRouteAuditIdentity;
  readonly report: PublisherRouteOwnershipReport;
  readonly audit: PublisherRouteAuditBaseline;
  readonly summary: string;
  readonly write: PublisherRouteReportWriteResult | null;
};

export type PublisherRouteReportArtifact = {
  readonly schemaVersion: 1;
  readonly identity: PublisherRouteAuditIdentity;
  readonly reviewedBaseline: PublisherRouteAuditBaseline;
  readonly report: PublisherRouteOwnershipReport;
};

export const PUBLISHER_ROUTE_REPORT_FILE_NAME =
  "publisher-route-ownership.json";

export const defaultPublisherRouteReportOutputPath = path.join(
  generatedPublisherReportsRoot,
  PUBLISHER_ROUTE_REPORT_FILE_NAME,
);

export const defaultPublisherRouteReportPaths: PublisherRouteReportPaths =
  Object.freeze({
    publicationRoot: repoRoot,
    catalogPath: generatedCatalogPath,
    routeLedgerPath,
    routeAliasesPath: routeAliasConfigPath,
    sectionAliasesPath: aliasConfigPath,
  });

export const REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE = Object.freeze({
  identity: Object.freeze({
    authorities: Object.freeze({
      catalogRouteProjectionSha256:
        "sha256:bb6a17d06120c3dfbd3a80b291d79a5804f9ace65039071f3230a00a4139ae10",
      routeLedgerSha256:
        "sha256:7da903e2be45cc98ce9aab3420394a291b4db134abcf2eb826ecd7f2d032a712",
      routeAliasesSha256:
        "sha256:d3b1139db51981106a42103087743d95d2773aed557a85e6d24f86618ae304b4",
      sectionAliasesSha256:
        "sha256:4997bd0181607e15079a7a9d130a419f41a2ea1c4db650685b98c68a7b39a30c",
    }),
    publisherCommit: "4e4960628165ea5fa13077c430e908865ff96c7c",
    readerBuildId:
      "sha256:0e60cce59afd291f141b34ca11f7e405099fb00f0752dafa308b22efba5f9da3",
  }),
  counts: Object.freeze({
    routeLedgerEntryCount: 11_459,
    durableHrefCount: 6_975,
    durablePathnameCount: 6_390,
    durableQueryHrefCount: 0,
    durableFragmentEntryCount: 591,
    durableFragmentHrefCount: 585,
    publisherActiveRouteCount: 535,
    publisherActivePathCount: 535,
    publisherActiveWorkPathCount: 9,
    publisherActiveSectionPathCount: 525,
    publisherActiveOtherPathCount: 1,
    publisherExplicitRedirectCount: 0,
    publisherDerivedSlashRedirectCount: 534,
    publisherRendererResourceCount: 6,
    publisherSyncMethodPathCount: 8,
    publisherSyncPathCount: 6,
    currentCoherenceExactPathCount: 14,
    retainedCoherenceExactPathCount: 11,
    retainedCoherencePrefixCount: 6,
    catalogPartPathCount: 47,
    catalogChapterPathCount: 386,
    unownedPartPathCount: 45,
    unownedChapterPathCount: 63,
    exactPathCollisionCount: 3,
    decodedRouteCollisionCount: 0,
    pathCollisionCount: 3,
    unclassifiedDurablePathnameCount: 5_856,
    readerFragmentAddressCount: 3_485,
    requiredFragmentHrefCount: 988,
    fragmentTranslationCount: 0,
    fragmentGapCount: 988,
    issueCount: 7_247,
  }),
  issueCodeCounts: Object.freeze({
    "aggregate-chapter-unowned": 63,
    "aggregate-part-unowned": 45,
    collision: 3,
    "fragment-gap": 988,
    "route-alias-unowned": 156,
    "section-alias-unowned": 136,
    "unclassified-durable-path": 5_856,
  }),
  reportSha256:
    "sha256:e3f7926dfdb6220256db4a100c00bb6422d7aed4b3ca42ea445a55acea0760e0",
}) satisfies PublisherRouteAuditBaseline;

function requireRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object.`);
  }
  return value as JsonRecord;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON array.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  return requireArray(value, label).map((entry, index) =>
    requireString(entry, `${label}[${index}]`),
  );
}

function optionalString(
  value: unknown,
  label: string,
): string | undefined {
  return value === undefined ? undefined : requireString(value, label);
}

function requireVersion(
  document: JsonRecord,
  expected: number,
  label: string,
): void {
  if (document.version !== expected) {
    throw new TypeError(`${label}.version must equal ${expected}.`);
  }
}

type ReadRouteAuthority = {
  readonly sha256: string;
  readonly value: unknown;
};

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function assertRouteAuthorityFile(filePath: string, label: string): string {
  const resolved = path.resolve(filePath);
  if (!isWithin(resolved, repoRoot)) {
    throw new Error(`${label} must remain inside the repository.`);
  }

  const parsed = path.parse(resolved);
  let current = parsed.root;
  let finalStats: fs.Stats | undefined;
  for (const segment of resolved.slice(parsed.root.length).split(path.sep)) {
    if (segment.length === 0) continue;
    current = path.join(current, segment);
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(current);
    } catch {
      throw new Error(`${label} must exist as a repository file.`);
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} must not contain symbolic path segments.`);
    }
    finalStats = stats;
  }
  if (finalStats === undefined || !finalStats.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }

  let realPath: string;
  try {
    realPath = fs.realpathSync(resolved);
  } catch {
    throw new Error(`${label} must resolve to a repository file.`);
  }
  if (!isWithin(realPath, fs.realpathSync(repoRoot))) {
    throw new Error(`${label} must resolve inside the repository.`);
  }
  return resolved;
}

function readRouteAuthority(
  filePath: string,
  label: string,
): ReadRouteAuthority {
  const resolved = assertRouteAuthorityFile(filePath, label);
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(resolved);
  } catch {
    throw new Error(`Cannot read ${label}.`);
  }
  assertRouteAuthorityFile(resolved, label);
  try {
    return Object.freeze({
      sha256: sha256(bytes),
      value: JSON.parse(bytes.toString("utf8")) as unknown,
    });
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

export function adaptCoherenceCatalog(
  value: unknown,
): CoherenceCatalogRouteInput {
  const document = requireRecord(value, "catalog");
  const volumes = requireArray(document.volumes, "catalog.volumes").map(
    (volumeValue, volumeIndex) => {
      const volume = requireRecord(
        volumeValue,
        `catalog.volumes[${volumeIndex}]`,
      );
      return {
        href: requireString(
          volume.href,
          `catalog.volumes[${volumeIndex}].href`,
        ),
        parts: requireArray(
          volume.parts,
          `catalog.volumes[${volumeIndex}].parts`,
        ).map((partValue, partIndex) => {
          const part = requireRecord(
            partValue,
            `catalog.volumes[${volumeIndex}].parts[${partIndex}]`,
          );
          return {
            href: requireString(
              part.href,
              `catalog.volumes[${volumeIndex}].parts[${partIndex}].href`,
            ),
            chapters: requireArray(
              part.chapters,
              `catalog.volumes[${volumeIndex}].parts[${partIndex}].chapters`,
            ).map((chapterValue, chapterIndex) => {
              const chapter = requireRecord(
                chapterValue,
                `catalog.volumes[${volumeIndex}].parts[${partIndex}].chapters[${chapterIndex}]`,
              );
              return {
                href: requireString(
                  chapter.href,
                  `catalog.volumes[${volumeIndex}].parts[${partIndex}].chapters[${chapterIndex}].href`,
                ),
              };
            }),
          };
        }),
      };
    },
  );
  const sections = requireArray(document.sections, "catalog.sections").map(
    (sectionValue, sectionIndex) => {
      const section = requireRecord(
        sectionValue,
        `catalog.sections[${sectionIndex}]`,
      );
      return {
        sectionId: requireString(
          section.sectionId,
          `catalog.sections[${sectionIndex}].sectionId`,
        ),
        href: requireString(
          section.href,
          `catalog.sections[${sectionIndex}].href`,
        ),
        readerHref: requireString(
          section.readerHref,
          `catalog.sections[${sectionIndex}].readerHref`,
        ),
        legacySectionIds: requireStringArray(
          section.legacySectionIds,
          `catalog.sections[${sectionIndex}].legacySectionIds`,
        ),
        paragraphs: requireArray(
          section.paragraphs,
          `catalog.sections[${sectionIndex}].paragraphs`,
        ).map((paragraphValue, paragraphIndex) => {
          const paragraph = requireRecord(
            paragraphValue,
            `catalog.sections[${sectionIndex}].paragraphs[${paragraphIndex}]`,
          );
          return {
            anchor: requireString(
              paragraph.anchor,
              `catalog.sections[${sectionIndex}].paragraphs[${paragraphIndex}].anchor`,
            ),
          };
        }),
      };
    },
  );
  return { volumes, sections };
}

function catalogRouteProjectionSha256(
  catalog: CoherenceCatalogRouteInput,
): string {
  return sha256(
    JSON.stringify(
      canonicalizeJson(catalog, "catalog route projection"),
    ),
  );
}

export function createPublisherCatalogRouteProjectionSha256(
  value: unknown,
): string {
  return catalogRouteProjectionSha256(adaptCoherenceCatalog(value));
}

export function adaptCoherenceRouteLedger(
  value: unknown,
): CoherenceRouteLedgerInput {
  const document = requireRecord(value, "route ledger");
  requireVersion(document, 2, "route ledger");
  return {
    routes: requireArray(document.routes, "route ledger.routes").map(
      (routeValue, index) => {
        const route = requireRecord(routeValue, `route ledger.routes[${index}]`);
        return {
          href: requireString(route.href, `route ledger.routes[${index}].href`),
          kind: requireString(route.kind, `route ledger.routes[${index}].kind`),
          targetContinuityIds: requireStringArray(
            route.targetContinuityIds,
            `route ledger.routes[${index}].targetContinuityIds`,
          ),
        };
      },
    ),
  };
}

export function adaptCoherenceRouteAliases(
  value: unknown,
): CoherenceRouteAliasesInput {
  const document = requireRecord(value, "route aliases");
  requireVersion(document, 1, "route aliases");
  return {
    aliases: requireArray(document.aliases, "route aliases.aliases").map(
      (aliasValue, index) => {
        const alias = requireRecord(aliasValue, `route aliases.aliases[${index}]`);
        return {
          sourceHref: requireString(
            alias.sourceHref,
            `route aliases.aliases[${index}].sourceHref`,
          ),
          targetHref: requireString(
            alias.targetHref,
            `route aliases.aliases[${index}].targetHref`,
          ),
        };
      },
    ),
  };
}

export function adaptCoherenceSectionAliases(
  value: unknown,
): CoherenceSectionAliasesInput {
  const document = requireRecord(value, "section aliases");
  requireVersion(document, 1, "section aliases");
  return {
    aliases: requireArray(document.aliases, "section aliases.aliases").map(
      (aliasValue, index) => {
        const alias = requireRecord(
          aliasValue,
          `section aliases.aliases[${index}]`,
        );
        const targetHref = optionalString(
          alias.targetHref,
          `section aliases.aliases[${index}].targetHref`,
        );
        return {
          sourceHref: requireString(
            alias.sourceHref,
            `section aliases.aliases[${index}].sourceHref`,
          ),
          targetSectionId: requireString(
            alias.targetSectionId,
            `section aliases.aliases[${index}].targetSectionId`,
          ),
          ...(targetHref === undefined ? {} : { targetHref }),
        };
      },
    ),
  };
}

export function adaptPublisherReader(
  built: BuiltPublicationReader,
): PublisherReaderRouteEnvelope {
  if (built.reader.routes.redirects.length !== 0) {
    throw new Error(
      "The reviewed migration route audit requires a Publisher Reader with no explicit redirects.",
    );
  }
  if (built.extensions !== undefined || built.sync !== undefined) {
    throw new Error(
      "The reviewed migration route audit requires no Publisher extension or sync artifact.",
    );
  }
  return {
    routes: {
      active: built.reader.routes.active.map(({ path: routePath, target }) => ({
        path: routePath,
        target: { kind: target.kind },
      })),
      redirects: [],
    },
    works: built.reader.works.map((work) => ({
      sections: work.sections.map((section) => ({
        readerAddress: section.readerAddress,
        domId: section.domId,
        blocks: section.blocks.map((block) => ({
          readerAddress: block.readerAddress,
          domId: block.domId,
        })),
      })),
    })),
  };
}

export function createPublisherRouteAuditBaseline(
  report: PublisherRouteOwnershipReport,
  identity: PublisherRouteAuditIdentity,
): PublisherRouteAuditBaseline {
  const issueCodeCounts: Partial<
    Record<PublisherRouteOwnershipIssueCode, number>
  > = {};
  for (const issue of report.issues) {
    issueCodeCounts[issue.code] = (issueCodeCounts[issue.code] ?? 0) + 1;
  }
  const sortedIssueCodeCounts = Object.fromEntries(
    Object.entries(issueCodeCounts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ) as Partial<Record<PublisherRouteOwnershipIssueCode, number>>;
  return Object.freeze({
    identity: Object.freeze({
      ...identity,
      authorities: Object.freeze({ ...identity.authorities }),
    }),
    counts: Object.freeze({ ...report.counts }),
    issueCodeCounts: Object.freeze(sortedIssueCodeCounts),
    reportSha256: sha256(
      JSON.stringify(canonicalizeJson(report, "route ownership report")),
    ),
  });
}

function stableBaselineText(baseline: PublisherRouteAuditBaseline): string {
  const counts = Object.fromEntries(
    Object.entries(baseline.counts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  const issueCodeCounts = Object.fromEntries(
    Object.entries(baseline.issueCodeCounts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  return JSON.stringify({
    identity: baseline.identity,
    counts,
    issueCodeCounts,
    reportSha256: baseline.reportSha256,
  });
}

export function assertReviewedPublisherRouteAudit(
  report: PublisherRouteOwnershipReport,
  identity: PublisherRouteAuditIdentity,
  expected: PublisherRouteAuditBaseline = REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE,
): PublisherRouteAuditBaseline {
  const actual = createPublisherRouteAuditBaseline(report, identity);
  if (stableBaselineText(actual) !== stableBaselineText(expected)) {
    throw new Error(
      [
        "Publisher route audit drifted from the reviewed known-gap baseline.",
        `Expected: ${stableBaselineText(expected)}`,
        `Actual: ${stableBaselineText(actual)}`,
      ].join("\n"),
    );
  }
  return actual;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatPublisherRouteAuditSummary(
  report: PublisherRouteOwnershipReport,
  audit: PublisherRouteAuditBaseline,
): string {
  const codeSummary = Object.entries(audit.issueCodeCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => `${code}=${formatCount(count)}`)
    .join(", ");
  const collisionSummary = report.exactPathCollisions
    .map(({ owners, path: collisionPath }) =>
      `${collisionPath} (${owners.join(" + ")})`,
    )
    .join(", ");
  return [
    `Publisher route audit matches the reviewed baseline: ${formatCount(report.counts.issueCount)} known issues across ${formatCount(Object.keys(audit.issueCodeCounts).length)} codes, ${formatCount(report.counts.publisherActivePathCount)} active paths, and ${formatCount(report.counts.durablePathnameCount)} durable pathnames.`,
    `Known issue codes: ${codeSummary}.`,
    `Current owner collisions: ${collisionSummary}.`,
    `Bound identity: Publisher ${audit.identity.publisherCommit}, Reader ${audit.identity.readerBuildId}.`,
  ].join("\n");
}

function isWithin(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function assertNoSymlinkComponents(candidate: string): void {
  const resolved = path.resolve(candidate);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const segment of resolved.slice(parsed.root.length).split(path.sep)) {
    if (segment.length === 0) continue;
    current = path.join(current, segment);
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(current);
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Publisher route report output refuses symbolic link component ${current}.`,
      );
    }
  }
}

export function resolvePublisherRouteReportDestination(
  outputRoot: string = generatedPublisherReportsRoot,
): string {
  const resolvedRoot = path.resolve(outputRoot);
  const allowedRoot = path.resolve(generatedPublisherReportsRoot);
  if (!isWithin(resolvedRoot, allowedRoot)) {
    throw new Error(
      `Publisher route report output must stay inside ${allowedRoot}.`,
    );
  }
  const destination = path.join(
    resolvedRoot,
    PUBLISHER_ROUTE_REPORT_FILE_NAME,
  );
  for (const protectedPath of [
    editorialRoot,
    publishingRoot,
    publisherConfigurationRoot,
    publisherPublicationManifestPath,
  ]) {
    if (
      isWithin(destination, protectedPath) ||
      isWithin(protectedPath, destination)
    ) {
      throw new Error(
        `Publisher route report output must be disjoint from protected authority ${protectedPath}.`,
      );
    }
  }
  assertNoSymlinkComponents(resolvedRoot);
  assertNoSymlinkComponents(destination);
  return destination;
}

function canonicalizeJson(value: unknown, label: string): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      canonicalizeJson(entry, `${label}[${index}]`),
    );
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [
          key,
          canonicalizeJson(entry, `${label}.${key}`),
        ]),
    );
  }
  throw new TypeError(`${label} contains a value that JSON cannot represent.`);
}

export function serializePublisherRouteReportArtifact(
  artifact: PublisherRouteReportArtifact,
): string {
  return `${JSON.stringify(canonicalizeJson(artifact, "route report"), null, 2)}\n`;
}

export function materializePublisherRouteReport({
  identity,
  report,
  baseline = REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE,
  outputRoot = generatedPublisherReportsRoot,
}: {
  identity: PublisherRouteAuditIdentity;
  report: PublisherRouteOwnershipReport;
  baseline?: PublisherRouteAuditBaseline;
  outputRoot?: string;
}): PublisherRouteReportWriteResult {
  const reviewedBaseline = assertReviewedPublisherRouteAudit(
    report,
    identity,
    baseline,
  );
  const destination = resolvePublisherRouteReportDestination(outputRoot);
  const text = serializePublisherRouteReportArtifact({
    schemaVersion: 1,
    identity,
    reviewedBaseline,
    report,
  });

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  assertNoSymlinkComponents(path.dirname(destination));
  assertNoSymlinkComponents(destination);
  if (fs.existsSync(destination)) {
    const stats = fs.lstatSync(destination);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(
        `Publisher route report destination must be a regular file: ${destination}.`,
      );
    }
    if (fs.readFileSync(destination, "utf8") === text) {
      return Object.freeze({
        absolutePath: destination,
        byteLength: Buffer.byteLength(text),
        outcome: "current",
        relativePath: path.relative(repoRoot, destination).split(path.sep).join("/"),
      });
    }
  }

  const stagedPath = path.join(
    path.dirname(destination),
    `.${PUBLISHER_ROUTE_REPORT_FILE_NAME}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(stagedPath, "wx", 0o600);
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    assertNoSymlinkComponents(path.dirname(destination));
    assertNoSymlinkComponents(destination);
    fs.renameSync(stagedPath, destination);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(stagedPath);
    } catch (cleanupError) {
      if (
        cleanupError === null ||
        typeof cleanupError !== "object" ||
        !("code" in cleanupError) ||
        cleanupError.code !== "ENOENT"
      ) {
        throw cleanupError;
      }
    }
    throw error;
  }

  return Object.freeze({
    absolutePath: destination,
    byteLength: Buffer.byteLength(text),
    outcome: "written",
    relativePath: path.relative(repoRoot, destination).split(path.sep).join("/"),
  });
}

export async function createPublisherRouteOwnershipAudit(
  paths: PublisherRouteReportPaths = defaultPublisherRouteReportPaths,
): Promise<CreatedPublisherRouteOwnershipAudit> {
  const catalogAuthority = readRouteAuthority(
    paths.catalogPath,
    "Generated manuscript catalog authority",
  );
  const routeLedgerAuthority = readRouteAuthority(
    paths.routeLedgerPath,
    "Route ledger authority",
  );
  const routeAliasesAuthority = readRouteAuthority(
    paths.routeAliasesPath,
    "Route aliases authority",
  );
  const sectionAliasesAuthority = readRouteAuthority(
    paths.sectionAliasesPath,
    "Section aliases authority",
  );
  const candidateAudit = auditPublisherCandidate();
  if (candidateAudit.issues.length > 0) {
    throw new Error(formatPublisherCandidateFailure(candidateAudit));
  }
  if (candidateAudit.candidateCommit === undefined) {
    throw new Error(
      "Publisher candidate validation did not resolve a selected commit.",
    );
  }
  const readerBuild = await createPublisherReaderBuild({
    ...defaultPublisherReaderBuildPaths,
    publicationRoot: paths.publicationRoot,
  });
  const reader = adaptPublisherReader(readerBuild.built);
  const catalog = adaptCoherenceCatalog(
    catalogAuthority.value,
  );
  const routeLedger = adaptCoherenceRouteLedger(
    routeLedgerAuthority.value,
  );
  const routeAliases = adaptCoherenceRouteAliases(
    routeAliasesAuthority.value,
  );
  const sectionAliases = adaptCoherenceSectionAliases(
    sectionAliasesAuthority.value,
  );

  const report = buildPublisherRouteOwnershipReport({
    reader,
    catalog,
    routeLedger,
    routeAliases,
    sectionAliases,
    fragmentTranslations: [],
  });
  return Object.freeze({
    identity: Object.freeze({
      authorities: Object.freeze({
        catalogRouteProjectionSha256:
          catalogRouteProjectionSha256(catalog),
        routeLedgerSha256: routeLedgerAuthority.sha256,
        routeAliasesSha256: routeAliasesAuthority.sha256,
        sectionAliasesSha256: sectionAliasesAuthority.sha256,
      }),
      publisherCommit: candidateAudit.candidateCommit,
      readerBuildId: readerBuild.built.reader.buildId,
    }),
    report,
  });
}

export async function runPublisherRouteReport({
  paths = defaultPublisherRouteReportPaths,
  baseline = REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE,
  mode = "audit",
  outputRoot = generatedPublisherReportsRoot,
}: {
  paths?: PublisherRouteReportPaths;
  baseline?: PublisherRouteAuditBaseline;
  mode?: PublisherRouteReportMode;
  outputRoot?: string;
} = {}): Promise<PublisherRouteReportResult> {
  if (mode !== "audit" && mode !== "write") {
    throw new Error(`Unsupported Publisher route report mode ${JSON.stringify(mode)}.`);
  }
  if (mode === "write") resolvePublisherRouteReportDestination(outputRoot);
  const created = await createPublisherRouteOwnershipAudit(paths);
  const { identity, report } = created;
  const audit = assertReviewedPublisherRouteAudit(report, identity, baseline);
  const write = mode === "write"
    ? materializePublisherRouteReport({
        identity,
        report,
        baseline,
        outputRoot,
      })
    : null;
  return Object.freeze({
    identity,
    report,
    audit,
    summary: formatPublisherRouteAuditSummary(report, audit),
    write,
  });
}

function parseMode(args: readonly string[]): PublisherRouteReportMode {
  if (args.length === 0) return "audit";
  if (args.length === 1 && args[0] === "--write") return "write";
  throw new Error("Usage: route-report.ts [--write]");
}

async function main(): Promise<void> {
  const result = await runPublisherRouteReport({
    mode: parseMode(process.argv.slice(2)),
  });
  console.log(result.summary);
  if (result.write !== null) {
    console.log(`${result.write.outcome}: ${result.write.relativePath}`);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
