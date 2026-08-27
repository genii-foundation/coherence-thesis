import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  "Publisher route audit matches the reviewed baseline: 7,247 known issues across 7 codes, 535 active paths, and 6,390 durable pathnames.",
  "Known issue codes: aggregate-chapter-unowned=63, aggregate-part-unowned=45, collision=3, fragment-gap=988, route-alias-unowned=156, section-alias-unowned=136, unclassified-durable-path=5,856.",
  "Current owner collisions: /api/account (coherence-current-exact + publisher-sync-route), /auth/callback (coherence-current-exact + publisher-sync-route), /offline-sw.js (coherence-current-exact + publisher-renderer-resource).",
  "Bound identity: Publisher 580f5c548802df09fc9bb814286b205ba08acdb5, Reader sha256:0e60cce59afd291f141b34ca11f7e405099fb00f0752dafa308b22efba5f9da3.",
].join("\n");

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
      "sha256:e3f7926dfdb6220256db4a100c00bb6422d7aed4b3ca42ea445a55acea0760e0",
    );
    expect(result.adapted.audit.reportSha256).toBe(
      "sha256:59f3f1360da373aa3f29513224c978fff770a3251986d100ccadfa1391d9d498",
    );
    expect(result.raw.audit.counts.issueCount).toBe(7_247);
    expect(result.adapted.audit.counts.issueCount).toBe(7_105);
    expect(result.raw.identity.authorities).toEqual(
      result.adapted.identity.authorities,
    );
    expect(result.raw.identity.readerBuildId).not.toBe(
      result.adapted.identity.readerBuildId,
    );
  });

  it("binds the exact adapted issue census and projection counts", () => {
    expect(result.adapted.audit.issueCodeCounts).toEqual({
      "aggregate-chapter-unowned": 15,
      "aggregate-part-unowned": 45,
      collision: 3,
      "fragment-gap": 942,
      "route-alias-unowned": 156,
      "section-alias-unowned": 136,
      "unclassified-durable-path": 5_808,
    });
    expect(result.adapted.report.counts).toMatchObject({
      publisherActiveRouteCount: 583,
      publisherActivePathCount: 583,
      publisherActiveSectionPathCount: 573,
      publisherDerivedSlashRedirectCount: 582,
      readerFragmentAddressCount: 3_531,
      requiredFragmentHrefCount: 988,
      fragmentGapCount: 942,
      issueCount: 7_105,
    });
    expect(proof.routePlan.staticParams).toHaveLength(583);
    expect(proof.application.staticParams).toHaveLength(582);
  });

  it("names all 107 current nested hrefs as an exact subset of 942 fragment issues", () => {
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
    expect(
      matchingGaps.map(({ href }) => href).sort((left, right) =>
        left.localeCompare(right),
      ),
    ).toEqual(result.currentNestedFragmentHrefs);
    expect(
      matchingIssues.map(({ path: issuePath }) => issuePath).sort((left, right) =>
        left.localeCompare(right),
      ),
    ).toEqual(result.currentNestedFragmentHrefs);
    for (const gap of matchingGaps) {
      expect(gap.sources).toEqual([
        "catalog-current-section",
        "route-ledger",
      ]);
    }
    expect(result.adapted.report.fragments.gaps).toHaveLength(942);
  });

  it("emits one deterministic exact summary without a write surface", () => {
    expect(adaptedPublisherRouteAuditCliSummary(result)).toEqual({
      schemaVersion: 1,
      status: "verified",
      proofKind: "coherence-adapted-route-audit",
      comparisonKind: "derived-adapted-comparison",
      replacesRawBaseline: false,
      contentEvidenceSha256:
        "sha256:0c1f2d3bf289a98a2e7363fae0e58a5d0e3257d412ad17519da40cf222e02acf",
      identities: {
        publisherCommit: "580f5c548802df09fc9bb814286b205ba08acdb5",
        routeAuthorities: {
          catalogRouteProjectionSha256:
            "sha256:bb6a17d06120c3dfbd3a80b291d79a5804f9ace65039071f3230a00a4139ae10",
          routeLedgerSha256:
            "sha256:7da903e2be45cc98ce9aab3420394a291b4db134abcf2eb826ecd7f2d032a712",
          routeAliasesSha256:
            "sha256:d3b1139db51981106a42103087743d95d2773aed557a85e6d24f86618ae304b4",
          sectionAliasesSha256:
            "sha256:4997bd0181607e15079a7a9d130a419f41a2ea1c4db650685b98c68a7b39a30c",
        },
        rawReaderBuildId:
          "sha256:0e60cce59afd291f141b34ca11f7e405099fb00f0752dafa308b22efba5f9da3",
        rawReportSha256:
          "sha256:e3f7926dfdb6220256db4a100c00bb6422d7aed4b3ca42ea445a55acea0760e0",
        adaptedReaderBuildId:
          "sha256:f33a9dbce537081ac964269ad0fdbcc39cf8cb8258874f5099bc3de465aba96d",
        adaptedReportSha256:
          "sha256:59f3f1360da373aa3f29513224c978fff770a3251986d100ccadfa1391d9d498",
      },
      projections: {
        activeRoutes: 583,
        routePlanStaticParams: 583,
        applicationStaticParams: 582,
      },
      routeAudit: {
        rawIssueCount: 7_247,
        adaptedIssueCount: 7_105,
        resolvedIssueCount: 142,
        issueCodeCounts: {
          "aggregate-chapter-unowned": 15,
          "aggregate-part-unowned": 45,
          collision: 3,
          "fragment-gap": 942,
          "route-alias-unowned": 156,
          "section-alias-unowned": 136,
          "unclassified-durable-path": 5_808,
        },
        durableFragmentGapCount: 942,
        currentNestedFragmentHrefSubset: {
          count: 107,
          hrefsSha256:
            "sha256:ebf2dfdc34eaf7d8b9fbacd170e3b3074b516e72ba01a07968da2eaae16c8895",
          contentEvidenceSha256:
            "sha256:c5154ad3155ecd6eaf4920851976f5686ca85148ada9c06cfa953046db81a395",
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

  it("refuses same-count evidence and Reader target substitutions plus redirects", async () => {
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
    expect(() => adaptPublisherReaderEnvelope(redirectedReader)).toThrow(
      /requires a Publisher Reader with no explicit redirects/u,
    );
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
  }, 270_000);

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
  }, 300_000);
});
