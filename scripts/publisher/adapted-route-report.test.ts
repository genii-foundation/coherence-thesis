import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BuiltPublicationReader } from "@genii-foundation/publisher/node";
import type { PublicationReaderEnvelope } from "@genii-foundation/publisher-schema";

import {
  adaptCoherencePublisherContent,
  loadCoherencePublisherContentAuthorities,
  type CoherencePublisherContentAuthorities,
  type CoherencePublisherContentProof,
} from "./content-adapter";
import {
  adaptedPublisherRouteAuditCliSummary,
  assertAdaptedPublisherContentProof,
  createAdaptedPublisherRouteAudit,
  EXPECTED_ADAPTED_PUBLISHER_ROUTE_AUDIT,
  type AdaptedPublisherRouteAuditResult,
} from "./adapted-route-report";
import {
  adaptPublisherReaderEnvelope,
  REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE,
  createPublisherRouteOwnershipAuditForReader,
  assertReviewedPublisherRouteAudit,
  createPublisherRouteAuditBaseline,
  defaultPublisherRouteReportOutputPath,
  defaultPublisherRouteReportPaths,
} from "./route-report";
import {
  generatedPublisherReportsRoot,
  repoRoot,
} from "../repository/paths";
import { acquirePublisherRepositorySourceTestLock } from "./test-worktree-lock.mjs";

const adaptedRouteReportPath = path.join(
  repoRoot,
  "scripts",
  "publisher",
  "adapted-route-report.ts",
);
const rawRouteReportPath = path.join(
  repoRoot,
  "scripts",
  "publisher",
  "route-report.ts",
);

const expectedRawCli = [
  "Publisher route audit matches the reviewed baseline: 6,729 known issues across 6 codes, 535 active paths, and 6,390 durable pathnames.",
  "Known issue codes: aggregate-chapter-unowned=63, aggregate-part-unowned=45, collision=3, fragment-gap=988, route-alias-unowned=33, unclassified-durable-path=5,597.",
  "Current owner collisions: /api/account (coherence-current-exact + publisher-sync-route), /auth/callback (coherence-current-exact + publisher-sync-route), /offline-sw.js (coherence-current-exact + publisher-renderer-resource).",
  "Bound identity: Publisher ab4c5733764ee3a24ad9bcbe9bf2d85b61c032ba, Reader sha256:3f301ec319cb4f18441d2a0019a523d6d7c7ddf7153bd88e0c79ba24812982b4.",
].join("\n");

function sha256Json(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

type ReaderRedirect =
  BuiltPublicationReader["reader"]["routes"]["redirects"][number];

function driftContentEvidence(
  proof: CoherencePublisherContentProof,
): CoherencePublisherContentProof {
  return {
    ...proof,
    evidence: {
      ...proof.evidence,
      evidenceSha256: "sha256:unexpected-content-evidence",
    },
  };
}

function driftReaderIdentity(
  proof: CoherencePublisherContentProof,
): CoherencePublisherContentProof {
  return {
    ...proof,
    reader: {
      ...proof.reader,
      buildId: "sha256:unexpected-reader",
    },
  };
}

function substituteContentEvidence(
  proof: CoherencePublisherContentProof,
): CoherencePublisherContentProof {
  return {
    ...proof,
    evidence: {
      ...proof.evidence,
      currentShape: {
        ...proof.evidence.currentShape,
        workIds: proof.evidence.currentShape.workIds.map((workId, index) =>
          index === 0 ? `${workId}-same-count-substitution` : workId,
        ),
      },
    },
  };
}

function repositoryWorktreeBytesSha256(): string {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (listed.status !== 0) {
    throw new Error(`Could not list worktree files: ${listed.stderr}`);
  }
  const digest = createHash("sha256");
  for (const relativePath of listed.stdout
    .split("\0")
    .filter((entry) => entry.length > 0)
    .sort((left, right) => left.localeCompare(right))) {
    const absolutePath = path.join(repoRoot, relativePath);
    const stats = fs.lstatSync(absolutePath);
    digest.update(relativePath);
    digest.update("\0");
    digest.update(
      stats.isSymbolicLink()
        ? fs.readlinkSync(absolutePath)
        : fs.readFileSync(absolutePath),
    );
    digest.update("\0");
  }
  return `sha256:${digest.digest("hex")}`;
}

function fileState(absolutePath: string): string {
  if (!fs.existsSync(absolutePath)) return "absent";
  const stats = fs.lstatSync(absolutePath);
  if (!stats.isFile()) return `non-file:${stats.mode}`;
  return `file:${stats.size}:sha256:${createHash("sha256")
    .update(fs.readFileSync(absolutePath))
    .digest("hex")}`;
}

function ownedRouteReportState(): string {
  const directory = path.dirname(defaultPublisherRouteReportOutputPath);
  if (!fs.existsSync(directory)) return "directory-absent";
  const outputName = path.basename(defaultPublisherRouteReportOutputPath);
  const stagingPrefix = `.${outputName}.`;
  const entries = fs.readdirSync(directory)
    .filter((name) =>
      name === outputName ||
      (name.startsWith(stagingPrefix) && name.endsWith(".tmp"))
    )
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const absolutePath = path.join(directory, name);
      const stats = fs.lstatSync(absolutePath);
      if (stats.isSymbolicLink()) {
        return { name, kind: "symbolic-link", target: fs.readlinkSync(absolutePath) };
      }
      if (stats.isFile()) {
        return {
          name,
          kind: "file",
          bytes: stats.size,
          sha256: createHash("sha256")
            .update(fs.readFileSync(absolutePath))
            .digest("hex"),
        };
      }
      return { name, kind: "non-file", mode: stats.mode };
    });
  return JSON.stringify(entries);
}

function substituteFirstEntry<T>(entries: readonly T[]): readonly T[] {
  if (entries.length < 2) {
    throw new Error("Same-count substitution fixture needs two entries.");
  }
  return [entries[1] as T, ...entries.slice(1)];
}

describe("adapted Publisher route report", () => {
  let authorities: CoherencePublisherContentAuthorities;
  let proof: CoherencePublisherContentProof;
  let result: AdaptedPublisherRouteAuditResult;
  let temporaryRoot: string;

  beforeAll(async () => {
    fs.mkdirSync(generatedPublisherReportsRoot, { recursive: true });
    temporaryRoot = fs.mkdtempSync(
      path.join(generatedPublisherReportsRoot, "adapted-route-report-test-"),
    );
    authorities = await loadCoherencePublisherContentAuthorities();
    proof = await adaptCoherencePublisherContent(authorities);
    result = await createAdaptedPublisherRouteAudit(proof);
  }, 45_000);

  afterAll(() => {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it("keeps the reviewed raw audit separate from the exact adapted comparison", () => {
    expect(result.raw.audit).toEqual(REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE);
    expect(result.adapted.audit).toEqual(
      EXPECTED_ADAPTED_PUBLISHER_ROUTE_AUDIT,
    );
    expect(result.raw.audit.reportSha256).toBe(
      "sha256:456161eb02ae0b6453a24dd84c88d11ede4f0e8d8a4cf1468d73fa9b244afca9",
    );
    expect(result.adapted.audit.reportSha256).toBe(
      "sha256:94c170dd40b2a23bb77b82f1a3bf64d9ce75de79cd926022b8d698b877c8c7da",
    );
    expect(result.raw.audit.counts.issueCount).toBe(6_729);
    expect(result.adapted.audit.counts.issueCount).toBe(6_383);
    expect(result.raw.identity.authorities).toEqual(
      result.adapted.identity.authorities,
    );
    expect(result.raw.identity.readerBuildId).not.toBe(
      result.adapted.identity.readerBuildId,
    );
    expect(proof.evidence.identities).toMatchObject({
      baselineContentBuildId:
        "sha256:6d077c4ab99ef9e8e6be569fdd20d8aa53c199ca6f1b773d7b2d89ed08b38eab",
      baselineReaderBuildId:
        "sha256:3f301ec319cb4f18441d2a0019a523d6d7c7ddf7153bd88e0c79ba24812982b4",
      finalContentBuildId:
        "sha256:875982935232aa71f0a615cf94f07323a2adb18cc648e213d0fd06e5579e0b17",
      finalReaderBuildId:
        "sha256:77f94de86e3fe3462a4f905ad2884207aa11f8b9137dcf90486031a214af7d03",
      finalApplicationBuildId:
        "sha256:088a25ba74bf51995d9dc61fe67473b94f74181b6051fa614c6756588a3fb547",
    });
    expect(proof.content.buildId).toBe(
      proof.evidence.identities.finalContentBuildId,
    );
    expect(proof.reader.buildId).toBe(
      proof.evidence.identities.finalReaderBuildId,
    );
    expect(proof.application.manifest.buildId).toBe(
      proof.evidence.identities.finalApplicationBuildId,
    );
  });

  it("binds the exact adapted issue census and projection counts", () => {
    expect(result.adapted.audit.issueCodeCounts).toEqual({
      "aggregate-chapter-unowned": 15,
      "aggregate-part-unowned": 42,
      collision: 3,
      "fragment-gap": 810,
      "unclassified-durable-path": 5_513,
    });
    expect(result.adapted.report.counts).toMatchObject({
      publisherActiveRouteCount: 586,
      publisherActivePathCount: 586,
      publisherActiveSectionPathCount: 573,
      publisherActiveOtherPathCount: 4,
      publisherExplicitRedirectCount: 584,
      publisherDerivedSlashRedirectCount: 585,
      readerFragmentAddressCount: 3_639,
      requiredFragmentHrefCount: 988,
      fragmentGapCount: 810,
      issueCount: 6_383,
    });
    expect(proof.routePlan.staticParams).toHaveLength(586);
    expect(proof.application.staticParams).toHaveLength(585);
    expect(proof.evidence.projections).toMatchObject({
      routePlanStaticParamCount: 586,
      applicationStaticParamCount: 585,
      explicitRedirectCount: 584,
      canonicalSlashRedirectCount: 585,
      routePlanActivePathsSha256:
        "sha256:62d07fd9d597dd4f86ca53dedaff583efd155aabc421caef578cefa38a648991",
      routePlanStaticParamsSha256:
        "sha256:7268c8b6dfdd6436088d8aa7a900c3d951d1cff8c22d6f6de084c5de1ffeb146",
      applicationStaticParamsSha256:
        "sha256:dcf4d19e4173927dc88c43b4908d146537ca820d660e4af30a5f2d134a6e067e",
    });
  });

  it("binds all 51 added routes to exact adapted provenance", () => {
    const rawPaths = new Set(
      result.raw.report.publisher.activeRoutes.map(({ path: routePath }) =>
        routePath
      ),
    );
    const addedRoutes = proof.reader.routes.active
      .filter(({ path: routePath }) => !rawPaths.has(routePath))
      .map(({ path: routePath, target }) => ({
        path: routePath,
        kind: target.kind,
      }));
    const expectedAddedRoutes = [
      ...proof.evidence.routes.semanticTargetRoutes.map(({ path: routePath }) => ({
        path: routePath,
        kind: "section",
      })),
      ...proof.evidence.routes.catalogRootRouteAdditions.map(
        ({ path: routePath }) => ({
          path: routePath,
          kind: "section",
        }),
      ),
      ...proof.evidence.routes.sectionIndexes.map(({ path: routePath }) => ({
        path: routePath,
        kind: "section-index",
      })),
    ];
    const compareRoutes = (
      left: { path: string; kind: string },
      right: { path: string; kind: string },
    ): number =>
      `${left.path}\u0000${left.kind}`.localeCompare(
        `${right.path}\u0000${right.kind}`,
      );
    const kindCounts = Object.fromEntries(
      [...proof.reader.routes.active.reduce((counts, { target }) => {
        counts.set(target.kind, (counts.get(target.kind) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()).entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );

    expect(result.raw.report.counts.publisherActiveRouteCount).toBe(535);
    expect(addedRoutes).toHaveLength(51);
    expect(new Set(addedRoutes.map(({ path: routePath }) => routePath)).size)
      .toBe(51);
    expect([...addedRoutes].sort(compareRoutes)).toEqual(
      [...expectedAddedRoutes].sort(compareRoutes),
    );
    expect(sha256Json(addedRoutes)).toBe(
      "sha256:736c4c9b7eaae1289b7f35bbcd2c063fc6b1e0b05699a7fc760584e54362c867",
    );
    expect(proof.evidence.routes.semanticTargetRouteCount).toBe(4);
    expect(proof.evidence.routes.catalogRootRouteAdditionCount).toBe(44);
    expect(proof.evidence.routes.sectionIndexCount).toBe(3);
    expect(proof.evidence.routes.sectionIndexReferenceCount).toBe(57);
    expect(kindCounts).toEqual({
      home: 1,
      section: 573,
      "section-index": 3,
      work: 9,
    });
  });

  it("binds the exact 518 plus 66 adapted redirect composition", () => {
    const rawRedirects = result.raw.report.publisher.explicitRedirects;
    const adaptedRedirects =
      result.adapted.report.publisher.explicitRedirects;
    const rawRedirectKeys = new Set(
      rawRedirects.map(({ from, status, to }) =>
        `${from}\u0000${status}\u0000${to}`
      ),
    );
    const resolvedRedirects = adaptedRedirects.filter(
      ({ from, status, to }) =>
        !rawRedirectKeys.has(`${from}\u0000${status}\u0000${to}`),
    );
    const semanticRedirects = adaptedRedirects.filter(({ from }) =>
      from.endsWith("/"),
    );
    const companionRedirects = adaptedRedirects.filter(
      ({ from }) => !from.endsWith("/"),
    );
    const compareRedirects = (
      left: ReaderRedirect,
      right: ReaderRedirect,
    ): number => {
      const leftKey = `${left.from}\u0000${left.to}\u0000${left.status}`;
      const rightKey = `${right.from}\u0000${right.to}\u0000${right.status}`;
      if (leftKey < rightKey) return -1;
      if (leftKey > rightKey) return 1;
      return 0;
    };
    const rawRouteAliasPaths = result.raw.report.issues
      .filter(({ code }) => code === "route-alias-unowned")
      .map(({ path: issuePath }) => issuePath);

    expect(rawRedirects).toHaveLength(518);
    expect(adaptedRedirects).toHaveLength(584);
    expect(proof.content.routes.redirects).toEqual(proof.reader.routes.redirects);
    expect(adaptedRedirects).toEqual(
      [...proof.reader.routes.redirects].sort(compareRedirects),
    );
    expect(resolvedRedirects).toHaveLength(66);
    expect(semanticRedirects).toHaveLength(292);
    expect(companionRedirects).toHaveLength(292);
    expect(adaptedRedirects.every(({ status }) => status === 308)).toBe(true);
    expect(sha256Json(proof.reader.routes.redirects)).toBe(
      "sha256:8193048bfc8ece56bf2d2349d7e6468d07ec7e9a663961aedffb77ff40be3948",
    );
    expect(sha256Json(resolvedRedirects)).toBe(
      "sha256:cbae5863333e4f21e7fa86c8bae2c4b9506ebc8e147a24ea446395c0d04ed5a9",
    );
    expect(proof.evidence.routes.manifestRedirectCount).toBe(518);
    expect(proof.evidence.routes.resolvedRouteAliasSourceCount).toBe(33);
    expect(proof.evidence.routes.resolvedRouteAliasRedirectCount).toBe(66);
    expect(proof.evidence.routes.resolvedRouteAliasRedirectsSha256).toBe(
      "sha256:cbae5863333e4f21e7fa86c8bae2c4b9506ebc8e147a24ea446395c0d04ed5a9",
    );
    expect(proof.evidence.routes.unresolvedRouteAliasSources).toEqual([]);
    expect(rawRouteAliasPaths).toEqual(
      proof.evidence.routes.resolvedRouteAliasSources,
    );
    expect(sha256Json(rawRouteAliasPaths)).toBe(
      "sha256:3c93ac3efe2fcc79cd0fca9c0e955af3dbab19badecd6fa124c144d3f897a7d0",
    );
  });

  it("binds the raw-to-adapted issue set delta exactly", () => {
    const issueKey = ({
      code,
      message,
      path: issuePath,
    }: (typeof result.raw.report.issues)[number]): string =>
      `${code}\u0000${issuePath}\u0000${message}`;
    const rawIssueKeys = new Set(result.raw.report.issues.map(issueKey));
    const adaptedIssueKeys = new Set(
      result.adapted.report.issues.map(issueKey),
    );
    const addedIssues = [...adaptedIssueKeys].filter(
      (issue) => !rawIssueKeys.has(issue),
    );
    const resolvedIssues = [...rawIssueKeys].filter(
      (issue) => !adaptedIssueKeys.has(issue),
    );
    const resolvedByCode = Object.fromEntries(
      [...resolvedIssues.reduce((counts, issue) => {
        const code = issue.slice(0, issue.indexOf("\u0000"));
        counts.set(code, (counts.get(code) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()).entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );

    expect(rawIssueKeys.size).toBe(6_729);
    expect(adaptedIssueKeys.size).toBe(6_383);
    expect(addedIssues).toEqual([]);
    expect(resolvedIssues).toHaveLength(346);
    expect(resolvedByCode).toEqual({
      "aggregate-chapter-unowned": 48,
      "aggregate-part-unowned": 3,
      "fragment-gap": 178,
      "route-alias-unowned": 33,
      "unclassified-durable-path": 84,
    });
    expect(
      result.adapted.report.issues.filter(
        ({ code }) =>
          code === "route-alias-unowned" ||
          code === "section-alias-unowned",
      ),
    ).toEqual([]);
  });

  it("proves all 107 current nested hrefs are absent from 810 historical gaps", () => {
    expect(result.currentNestedFragmentHrefs).toHaveLength(107);
    expect(new Set(result.currentNestedFragmentHrefs).size).toBe(107);
    const currentHrefSet = new Set(result.currentNestedFragmentHrefs);
    const matchingGaps = result.adapted.report.fragments.gaps.filter(({ href }) =>
      currentHrefSet.has(href),
    );
    const matchingIssues = result.adapted.report.issues.filter(
      ({ code, path: issuePath }) =>
        code === "fragment-gap" && currentHrefSet.has(issuePath),
    );
    expect(matchingGaps).toEqual([]);
    expect(matchingIssues).toEqual([]);
    expect(result.remainingCurrentNestedFragmentGapHrefs).toEqual([]);
    expect(result.adapted.report.fragments.gaps).toHaveLength(810);
    const addressedHrefs = new Set(
      proof.evidence.routes.ownedCatalogFragmentAddresses.map(({ href }) =>
        href
      ),
    );
    for (const href of result.currentNestedFragmentHrefs) {
      expect(addressedHrefs.has(href)).toBe(true);
    }
  });

  it("emits one deterministic exact summary without a write surface", () => {
    expect(adaptedPublisherRouteAuditCliSummary(result)).toEqual({
      schemaVersion: 2,
      status: "verified",
      proofKind: "coherence-adapted-route-audit",
      comparisonKind: "derived-adapted-comparison",
      replacesRawBaseline: false,
      contentEvidenceSha256:
        "sha256:7a4de33169f6f21e799acf97ddb702bcf84bd2df341fa2e542096cc6be6c5f37",
      identities: {
        publisherCommit: "ab4c5733764ee3a24ad9bcbe9bf2d85b61c032ba",
        routeAuthorities: {
          catalogRouteProjectionSha256:
            "sha256:a3e92ba725b89fca9880cc266c0b9e44f9693fff311e0922ed92f5d4dddd4ec0",
          routeLedgerSha256:
            "sha256:7da903e2be45cc98ce9aab3420394a291b4db134abcf2eb826ecd7f2d032a712",
          routeAliasesSha256:
            "sha256:d3b1139db51981106a42103087743d95d2773aed557a85e6d24f86618ae304b4",
          sectionAliasesSha256:
            "sha256:4997bd0181607e15079a7a9d130a419f41a2ea1c4db650685b98c68a7b39a30c",
        },
        rawReaderBuildId:
          "sha256:3f301ec319cb4f18441d2a0019a523d6d7c7ddf7153bd88e0c79ba24812982b4",
        rawReportSha256:
          "sha256:456161eb02ae0b6453a24dd84c88d11ede4f0e8d8a4cf1468d73fa9b244afca9",
        adaptedReaderBuildId:
          "sha256:77f94de86e3fe3462a4f905ad2884207aa11f8b9137dcf90486031a214af7d03",
        adaptedReportSha256:
          "sha256:94c170dd40b2a23bb77b82f1a3bf64d9ce75de79cd926022b8d698b877c8c7da",
      },
      projections: {
        activeRoutes: 586,
        routePlanStaticParams: 586,
        applicationStaticParams: 585,
      },
      routeAudit: {
        rawIssueCount: 6_729,
        adaptedIssueCount: 6_383,
        resolvedIssueCount: 346,
        issueCodeCounts: {
          "aggregate-chapter-unowned": 15,
          "aggregate-part-unowned": 42,
          collision: 3,
          "fragment-gap": 810,
          "unclassified-durable-path": 5_513,
        },
        durableFragmentGapCount: 810,
        currentCatalogNestedFragmentCoverage: {
          requiredCount: 107,
          requiredHrefsSha256:
            "sha256:ebf2dfdc34eaf7d8b9fbacd170e3b3074b516e72ba01a07968da2eaae16c8895",
          remainingGapCount: 0,
          remainingGapHrefsSha256:
            "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
          contentProofScope:
            "adapted-reader-current-catalog-section-fragments",
          sources: ["catalog-current-section", "route-ledger"],
        },
      },
    });
    const source = fs.readFileSync(adaptedRouteReportPath, "utf8");
    expect(source).not.toContain("materializePublisherRouteReport");
    expect(source).not.toContain("PublisherRouteReportWriteResult");
    expect(source).not.toContain("outputRoot");
  });

  it("refuses content evidence and Reader identity drift", () => {
    expect(() => assertAdaptedPublisherContentProof(driftContentEvidence(proof)))
      .toThrow(/Adapted content evidence (?:basis )?identity drifted/u);
    expect(() => assertAdaptedPublisherContentProof(driftReaderIdentity(proof)))
      .toThrow(/Adapted Reader identity drifted/u);
  });

  it("refuses same-count evidence and Reader target substitutions", async () => {
    const substitutedEvidence = substituteContentEvidence(proof);
    expect(substitutedEvidence.evidence.currentShape.workIds).toHaveLength(
      proof.evidence.currentShape.workIds.length,
    );
    expect(substitutedEvidence.evidence.evidenceSha256).toBe(
      proof.evidence.evidenceSha256,
    );
    expect(() => assertAdaptedPublisherContentProof(substitutedEvidence))
      .toThrow(/Adapted content evidence basis identity drifted/u);

    const sectionRouteIndexes = proof.reader.routes.active
      .map((route, index) => ({ index, route }))
      .filter(({ route }) => route.target.kind === "section")
      .slice(0, 2);
    const firstSectionRoute = sectionRouteIndexes[0];
    const secondSectionRoute = sectionRouteIndexes[1];
    if (firstSectionRoute === undefined || secondSectionRoute === undefined) {
      throw new Error("Reader target substitution fixture is incomplete.");
    }
    const substitutedReader = {
      ...proof.reader,
      routes: {
        ...proof.reader.routes,
        active: proof.reader.routes.active.map((route, index) =>
          index === firstSectionRoute.index
            ? { ...route, target: secondSectionRoute.route.target }
            : route,
        ),
      },
    } as PublicationReaderEnvelope;
    expect(substitutedReader.routes.active).toHaveLength(
      proof.reader.routes.active.length,
    );
    expect(substitutedReader.buildId).toBe(proof.reader.buildId);
    await expect(
      createPublisherRouteOwnershipAuditForReader(substitutedReader),
    ).rejects.toThrow(/invalid Reader envelope/u);

    const substitutedApplicationReader: CoherencePublisherContentProof = {
      ...proof,
      application: {
        ...proof.application,
        reader: substitutedReader,
      },
    };
    expect(
      substitutedApplicationReader.application.reader.routes.active,
    ).toHaveLength(proof.application.reader.routes.active.length);
    expect(substitutedApplicationReader.application.reader.buildId).toBe(
      proof.application.reader.buildId,
    );
    expect(() =>
      assertAdaptedPublisherContentProof(substitutedApplicationReader),
    ).toThrow(/Adapted application Reader payload identity drifted/u);

    const redirectedReader = {
      ...proof.reader,
      routes: {
        ...proof.reader.routes,
        redirects: [
          { from: "/synthetic-legacy/", to: "/", status: 308 as const },
        ],
      },
    } as PublicationReaderEnvelope;
    expect(adaptPublisherReaderEnvelope(redirectedReader).routes.redirects)
      .toEqual([
        { from: "/synthetic-legacy/", to: "/", status: 308 },
      ]);
    await expect(
      createPublisherRouteOwnershipAuditForReader(redirectedReader),
    ).rejects.toThrow(/invalid Reader envelope/u);
  }, 30_000);

  it("refuses same-count route and application projection substitutions", () => {
    const activePathSubstitution: CoherencePublisherContentProof = {
      ...proof,
      routePlan: {
        ...proof.routePlan,
        activePaths: substituteFirstEntry(proof.routePlan.activePaths),
      },
    };
    expect(activePathSubstitution.routePlan.activePaths).toHaveLength(
      proof.routePlan.activePaths.length,
    );
    expect(() => assertAdaptedPublisherContentProof(activePathSubstitution))
      .toThrow(/Adapted route plan active path identity drifted/u);

    const routeParamSubstitution: CoherencePublisherContentProof = {
      ...proof,
      routePlan: {
        ...proof.routePlan,
        staticParams: substituteFirstEntry(proof.routePlan.staticParams),
      },
    };
    expect(routeParamSubstitution.routePlan.staticParams).toHaveLength(
      proof.routePlan.staticParams.length,
    );
    expect(() => assertAdaptedPublisherContentProof(routeParamSubstitution))
      .toThrow(/Adapted route plan static parameter identity drifted/u);

    const applicationParamSubstitution: CoherencePublisherContentProof = {
      ...proof,
      application: {
        ...proof.application,
        staticParams: substituteFirstEntry(proof.application.staticParams),
      },
    };
    expect(applicationParamSubstitution.application.staticParams).toHaveLength(
      proof.application.staticParams.length,
    );
    expect(() =>
      assertAdaptedPublisherContentProof(applicationParamSubstitution),
    ).toThrow(/Adapted application static parameter identity drifted/u);
  });

  it("refuses an equal-count adapted issue substitution", () => {
    const drifted = {
      ...result.adapted.report,
      issues: result.adapted.report.issues.map((issue, index) =>
        index === 0
          ? {
              ...issue,
              message: "Synthetic equal-count adapted issue substitution.",
              path: "/synthetic-adapted-substitution/",
            }
          : issue,
      ),
    };
    const driftedBaseline = createPublisherRouteAuditBaseline(
      drifted,
      result.adapted.identity,
    );
    expect(driftedBaseline.counts).toEqual(result.adapted.audit.counts);
    expect(driftedBaseline.issueCodeCounts).toEqual(
      result.adapted.audit.issueCodeCounts,
    );
    expect(driftedBaseline.reportSha256).not.toBe(
      result.adapted.audit.reportSha256,
    );
    expect(() =>
      assertReviewedPublisherRouteAudit(
        drifted,
        result.adapted.identity,
        EXPECTED_ADAPTED_PUBLISHER_ROUTE_AUDIT,
      ),
    ).toThrow(/Publisher route audit drifted/u);
  });

  it.each([
    {
      field: "source",
      substitute: (redirect: ReaderRedirect): ReaderRedirect => ({
        ...redirect,
        from: "/synthetic-same-count-source/",
      }),
    },
    {
      field: "target",
      substitute: (redirect: ReaderRedirect): ReaderRedirect => ({
        ...redirect,
        to: "/synthetic-same-count-target/",
      }),
    },
    {
      field: "status",
      substitute: (redirect: ReaderRedirect): ReaderRedirect => ({
        ...redirect,
        status: 307,
      }),
    },
  ])(
    "refuses a same-count adapted redirect $field substitution",
    ({ substitute }) => {
      const [firstRedirect, ...remainingRedirects] =
        result.adapted.report.publisher.explicitRedirects;
      if (firstRedirect === undefined) {
        throw new Error("Adapted Publisher redirect report fixture is empty.");
      }
      const drifted = {
        ...result.adapted.report,
        publisher: {
          ...result.adapted.report.publisher,
          explicitRedirects: [
            substitute(firstRedirect),
            ...remainingRedirects,
          ],
        },
      };
      const driftedBaseline = createPublisherRouteAuditBaseline(
        drifted,
        result.adapted.identity,
      );

      expect(driftedBaseline.counts).toEqual(result.adapted.audit.counts);
      expect(driftedBaseline.issueCodeCounts).toEqual(
        result.adapted.audit.issueCodeCounts,
      );
      expect(driftedBaseline.reportSha256).not.toBe(
        result.adapted.audit.reportSha256,
      );
      expect(() =>
        assertReviewedPublisherRouteAudit(
          drifted,
          result.adapted.identity,
          EXPECTED_ADAPTED_PUBLISHER_ROUTE_AUDIT,
        )
      ).toThrow(/Publisher route audit drifted/u);
    },
  );

  it("refuses in-memory content source mutation before route auditing", async () => {
    const firstWork = authorities.sourceWorks[0];
    const firstSection = firstWork?.sections[0];
    const firstBlock = firstSection?.blocks[0];
    if (
      firstWork === undefined ||
      firstSection === undefined ||
      firstBlock === undefined
    ) {
      throw new Error("Content source mutation fixture is empty.");
    }
    const mutated: CoherencePublisherContentAuthorities = {
      ...authorities,
      sourceWorks: [
        {
          ...firstWork,
          sections: [
            {
              ...firstSection,
              blocks: [
                {
                  ...firstBlock,
                  text: `${firstBlock.text} synthetic source mutation`,
                },
                ...firstSection.blocks.slice(1),
              ],
            },
            ...firstWork.sections.slice(1),
          ],
        },
        ...authorities.sourceWorks.slice(1),
      ],
    };
    await expect(
      adaptCoherencePublisherContent(mutated),
    ).rejects.toThrow(/content word count changed|authorit|source|drift/u);
  });

  it("refuses route authority mutation and symbolic authority paths", async () => {
    const mutatedCatalogPath = path.join(temporaryRoot, "mutated-catalog.json");
    const catalog = JSON.parse(
      fs.readFileSync(defaultPublisherRouteReportPaths.catalogPath, "utf8"),
    ) as { sections: Array<{ href: string }> };
    const firstSection = catalog.sections[0];
    if (firstSection === undefined) {
      throw new Error("Catalog mutation fixture is empty.");
    }
    firstSection.href = "/synthetic-catalog-source-mutation/";
    fs.writeFileSync(mutatedCatalogPath, JSON.stringify(catalog), "utf8");
    await expect(
      createAdaptedPublisherRouteAudit(proof, {
        ...defaultPublisherRouteReportPaths,
        catalogPath: mutatedCatalogPath,
      }),
    ).rejects.toThrow(/Publisher route audit drifted/u);

    for (const [field, targetPath] of [
      ["catalogPath", defaultPublisherRouteReportPaths.catalogPath],
      ["routeLedgerPath", defaultPublisherRouteReportPaths.routeLedgerPath],
      ["routeAliasesPath", defaultPublisherRouteReportPaths.routeAliasesPath],
      ["sectionAliasesPath", defaultPublisherRouteReportPaths.sectionAliasesPath],
    ] as const) {
      const symbolicPath = path.join(temporaryRoot, `${field}.json`);
      fs.symlinkSync(targetPath, symbolicPath, "file");
      await expect(
        createAdaptedPublisherRouteAudit(proof, {
          ...defaultPublisherRouteReportPaths,
          [field]: symbolicPath,
        }),
      ).rejects.toThrow(/must not contain symbolic path segments/u);
    }
  }, 30_000);

  it("keeps both command entry points import safe and preserves raw CLI bytes", () => {
    const releaseLock = acquirePublisherRepositorySourceTestLock();
    try {
      const beforeSha256 = repositoryWorktreeBytesSha256();
      const beforeReportState = fileState(defaultPublisherRouteReportOutputPath);
      const beforeOwnedReportState = ownedRouteReportState();
      for (const script of [adaptedRouteReportPath, rawRouteReportPath]) {
        const imported = spawnSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "--input-type=module",
            "--eval",
            `await import(${JSON.stringify(pathToFileURL(script).href)})`,
          ],
          { cwd: repoRoot, encoding: "utf8", timeout: 30_000 },
        );
        expect(imported.status).toBe(0);
        expect(imported.stdout).toBe("");
        expect(imported.stderr).toBe("");
      }

      const rawCli = spawnSync(
        process.execPath,
        ["--import", "tsx", rawRouteReportPath],
        { cwd: repoRoot, encoding: "utf8", timeout: 30_000 },
      );
      expect(rawCli.status).toBe(0);
      expect(rawCli.stderr).toBe("");
      expect(rawCli.stdout).toBe(`${expectedRawCli}\n`);
      expect(fileState(defaultPublisherRouteReportOutputPath)).toBe(
        beforeReportState,
      );
      expect(ownedRouteReportState()).toBe(beforeOwnedReportState);
      expect(repositoryWorktreeBytesSha256()).toBe(beforeSha256);
    } finally {
      releaseLock();
    }
  }, 360_000);

  it("runs one no-argument adapted CLI and refuses every argument", () => {
    const releaseLock = acquirePublisherRepositorySourceTestLock();
    try {
      const beforeSha256 = repositoryWorktreeBytesSha256();
      const beforeReportState = fileState(defaultPublisherRouteReportOutputPath);
      const beforeOwnedReportState = ownedRouteReportState();
      const expectedCli = `${JSON.stringify(adaptedPublisherRouteAuditCliSummary(result), null, 2)}\n`;
      for (let run = 0; run < 2; run += 1) {
        const cli = spawnSync(
          process.execPath,
          ["--import", "tsx", adaptedRouteReportPath],
          { cwd: repoRoot, encoding: "utf8", timeout: 45_000 },
        );
        expect(cli.status).toBe(0);
        expect(cli.stderr).toBe("");
        expect(cli.stdout).toBe(expectedCli);
        expect(cli.stdout).not.toContain(repoRoot);
      }
      expect(fileState(defaultPublisherRouteReportOutputPath)).toBe(
        beforeReportState,
      );
      expect(ownedRouteReportState()).toBe(beforeOwnedReportState);
      expect(repositoryWorktreeBytesSha256()).toBe(beforeSha256);

      const refused = spawnSync(
        process.execPath,
        ["--import", "tsx", adaptedRouteReportPath, "unexpected"],
        { cwd: repoRoot, encoding: "utf8", timeout: 30_000 },
      );
      expect(refused.status).toBe(1);
      expect(refused.stdout).toBe("");
      expect(refused.stderr).toContain("Usage: adapted-route-report.ts");
      expect(fileState(defaultPublisherRouteReportOutputPath)).toBe(
        beforeReportState,
      );
      expect(ownedRouteReportState()).toBe(beforeOwnedReportState);
      expect(repositoryWorktreeBytesSha256()).toBe(beforeSha256);
    } finally {
      releaseLock();
    }
  }, 420_000);
});
