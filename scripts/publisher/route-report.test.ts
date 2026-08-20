import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  editorialRoot,
  generatedCatalogPath,
  generatedPublisherReportsRoot,
  publisherConfigurationRoot,
  publisherPublicationManifestPath,
  publishingRoot,
  repoRoot,
} from "../repository/paths";
import {
  PUBLISHER_ROUTE_REPORT_FILE_NAME,
  REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE,
  assertReviewedPublisherRouteAudit,
  createPublisherRouteAuditBaseline,
  createPublisherRouteOwnershipAudit,
  defaultPublisherRouteReportPaths,
  materializePublisherRouteReport,
  resolvePublisherRouteReportDestination,
  runPublisherRouteReport,
  serializePublisherRouteReportArtifact,
  type PublisherRouteReportResult,
} from "./route-report";

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function filesUnder(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  return fs.readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(root, entry.name);
      return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
    })
    .sort();
}

function protectedSnapshot(): Readonly<Record<string, string>> {
  const files = [
    ...filesUnder(editorialRoot),
    ...filesUnder(publishingRoot),
    ...filesUnder(publisherConfigurationRoot),
    publisherPublicationManifestPath,
    generatedCatalogPath,
  ];
  return Object.freeze(
    Object.fromEntries(files.sort().map((filePath) => [filePath, sha256(filePath)])),
  );
}

describe("Publisher route report integration", () => {
  let before: Readonly<Record<string, string>>;
  let result: PublisherRouteReportResult;
  let temporaryOutputRoot: string;
  let readOnlyOutputRoot: string;

  beforeAll(async () => {
    fs.mkdirSync(generatedPublisherReportsRoot, { recursive: true });
    temporaryOutputRoot = fs.mkdtempSync(
      path.join(generatedPublisherReportsRoot, "route-report-test-"),
    );
    readOnlyOutputRoot = path.join(temporaryOutputRoot, "read-only");
    before = protectedSnapshot();
    result = await runPublisherRouteReport({
      outputRoot: readOnlyOutputRoot,
    });
  }, 30_000);

  afterAll(() => {
    fs.rmSync(temporaryOutputRoot, { recursive: true, force: true });
  });

  it("locks the exact real-authority known-gap baseline", () => {
    expect(result.audit).toEqual(REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE);
    expect(result.identity).toEqual({
      authorities: {
        catalogSha256:
          "sha256:b73f46a50b1e910ff74b9ed7ab5bfab48a1bbb08099c5e22ca0fc72c6a3cd702",
        routeLedgerSha256:
          "sha256:7da903e2be45cc98ce9aab3420394a291b4db134abcf2eb826ecd7f2d032a712",
        routeAliasesSha256:
          "sha256:d3b1139db51981106a42103087743d95d2773aed557a85e6d24f86618ae304b4",
        sectionAliasesSha256:
          "sha256:4997bd0181607e15079a7a9d130a419f41a2ea1c4db650685b98c68a7b39a30c",
      },
      publisherCommit: "15a5fc8967412b0c45a7f129e6f03f7cf7388197",
      readerBuildId:
        "sha256:0e60cce59afd291f141b34ca11f7e405099fb00f0752dafa308b22efba5f9da3",
    });
    expect(result.audit.reportSha256).toBe(
      "sha256:e3f7926dfdb6220256db4a100c00bb6422d7aed4b3ca42ea445a55acea0760e0",
    );
    expect(result.report.counts.issueCount).toBe(7_247);
    expect(result.audit.issueCodeCounts).toEqual({
      "aggregate-chapter-unowned": 63,
      "aggregate-part-unowned": 45,
      collision: 3,
      "fragment-gap": 988,
      "route-alias-unowned": 156,
      "section-alias-unowned": 136,
      "unclassified-durable-path": 5_856,
    });
    expect(result.report.exactPathCollisions).toEqual([
      {
        owners: ["coherence-current-exact", "publisher-sync-route"],
        path: "/api/account",
      },
      {
        owners: ["coherence-current-exact", "publisher-sync-route"],
        path: "/auth/callback",
      },
      {
        owners: [
          "coherence-current-exact",
          "publisher-renderer-resource",
        ],
        path: "/offline-sw.js",
      },
    ]);
    expect(result.summary).toBe(
      [
        "Publisher route audit matches the reviewed baseline: 7,247 known issues across 7 codes, 535 active paths, and 6,390 durable pathnames.",
        "Known issue codes: aggregate-chapter-unowned=63, aggregate-part-unowned=45, collision=3, fragment-gap=988, route-alias-unowned=156, section-alias-unowned=136, unclassified-durable-path=5,856.",
        "Current owner collisions: /api/account (coherence-current-exact + publisher-sync-route), /auth/callback (coherence-current-exact + publisher-sync-route), /offline-sw.js (coherence-current-exact + publisher-renderer-resource).",
        "Bound identity: Publisher 15a5fc8967412b0c45a7f129e6f03f7cf7388197, Reader sha256:0e60cce59afd291f141b34ca11f7e405099fb00f0752dafa308b22efba5f9da3.",
      ].join("\n"),
    );
  });

  it("keeps the default audit read only", () => {
    expect(result.write).toBeNull();
    expect(fs.existsSync(readOnlyOutputRoot)).toBe(false);
  });

  it("writes the exact report atomically and recognizes a byte-identical rerun", async () => {
    const outputRoot = path.join(temporaryOutputRoot, "write");
    fs.mkdirSync(outputRoot, { recursive: true });
    const unrelatedPath = path.join(outputRoot, "unrelated.json");
    fs.writeFileSync(unrelatedPath, "unrelated\n", "utf8");

    const firstRun = await runPublisherRouteReport({
      mode: "write",
      outputRoot,
    });
    const first = firstRun.write;
    expect(first).not.toBeNull();
    if (first === null) throw new Error("Write mode returned no write result.");
    expect(first).toEqual({
      absolutePath: path.join(outputRoot, PUBLISHER_ROUTE_REPORT_FILE_NAME),
      byteLength: first.byteLength,
      outcome: "written",
      relativePath: path
        .relative(
          repoRoot,
          path.join(outputRoot, PUBLISHER_ROUTE_REPORT_FILE_NAME),
        )
        .split(path.sep)
        .join("/"),
    });
    const expectedText = serializePublisherRouteReportArtifact({
      schemaVersion: 1,
      identity: result.identity,
      reviewedBaseline: REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE,
      report: result.report,
    });
    const firstText = fs.readFileSync(first.absolutePath, "utf8");
    expect(firstText).toBe(expectedText);
    expect(first.byteLength).toBe(Buffer.byteLength(expectedText));
    expect(JSON.parse(firstText)).toEqual({
      identity: result.identity,
      report: result.report,
      reviewedBaseline: REVIEWED_PUBLISHER_ROUTE_AUDIT_BASELINE,
      schemaVersion: 1,
    });

    const secondRun = await runPublisherRouteReport({
      mode: "write",
      outputRoot,
    });
    const second = secondRun.write;
    expect(second).toEqual({ ...first, outcome: "current" });
    if (second === null) throw new Error("Write rerun returned no write result.");
    expect(fs.readFileSync(second.absolutePath, "utf8")).toBe(firstText);
    expect(fs.readFileSync(unrelatedPath, "utf8")).toBe("unrelated\n");
  }, 30_000);

  it("refuses unsafe and symbolic-link output roots", () => {
    expect(() => resolvePublisherRouteReportDestination(editorialRoot)).toThrow(
      /must stay inside/,
    );

    const targetRoot = path.join(temporaryOutputRoot, "symlink-target");
    const linkedRoot = path.join(temporaryOutputRoot, "symlink-output");
    fs.mkdirSync(targetRoot, { recursive: true });
    fs.symlinkSync(targetRoot, linkedRoot, "dir");
    expect(() =>
      materializePublisherRouteReport({
        identity: result.identity,
        report: result.report,
        outputRoot: linkedRoot,
      }),
    ).toThrow(/refuses symbolic link component/);
    expect(fs.readdirSync(targetRoot)).toEqual([]);
  });

  it("refuses symbolic path segments for every route authority file", async () => {
    const authorityCases = [
      ["catalogPath", defaultPublisherRouteReportPaths.catalogPath],
      ["routeLedgerPath", defaultPublisherRouteReportPaths.routeLedgerPath],
      ["routeAliasesPath", defaultPublisherRouteReportPaths.routeAliasesPath],
      ["sectionAliasesPath", defaultPublisherRouteReportPaths.sectionAliasesPath],
    ] as const;

    for (const [field, targetPath] of authorityCases) {
      const symbolicPath = path.join(temporaryOutputRoot, `${field}.json`);
      fs.symlinkSync(targetPath, symbolicPath, "file");
      await expect(
        createPublisherRouteOwnershipAudit({
          ...defaultPublisherRouteReportPaths,
          [field]: symbolicPath,
        }),
      ).rejects.toThrow(/must not contain symbolic path segments/u);
    }
  });

  it("refuses any drift from the reviewed counts and issue codes", () => {
    const drifted = {
      ...result.report,
      counts: {
        ...result.report.counts,
        exactPathCollisionCount:
          result.report.counts.exactPathCollisionCount + 1,
        pathCollisionCount: result.report.counts.pathCollisionCount + 1,
        issueCount: result.report.counts.issueCount + 1,
      },
      issues: [
        ...result.report.issues,
        {
          code: "collision" as const,
          message: "Synthetic drift for the focused guard test.",
          path: "/synthetic-drift/",
        },
      ],
    };

    expect(() =>
      assertReviewedPublisherRouteAudit(drifted, result.identity),
    ).toThrow(
      /Publisher route audit drifted from the reviewed known-gap baseline\./,
    );
  });

  it("refuses an equal-count issue substitution", () => {
    const drifted = {
      ...result.report,
      issues: result.report.issues.map((issue, index) =>
        index === 0
          ? {
              ...issue,
              message: "Synthetic equal-count issue substitution.",
              path: "/synthetic-equal-count-substitution/",
            }
          : issue,
      ),
    };
    const driftedBaseline = createPublisherRouteAuditBaseline(
      drifted,
      result.identity,
    );
    expect(driftedBaseline.counts).toEqual(result.audit.counts);
    expect(driftedBaseline.issueCodeCounts).toEqual(
      result.audit.issueCodeCounts,
    );
    expect(driftedBaseline.reportSha256).not.toBe(result.audit.reportSha256);
    expect(() =>
      assertReviewedPublisherRouteAudit(drifted, result.identity),
    ).toThrow(
      /Publisher route audit drifted from the reviewed known-gap baseline\./u,
    );
  });

  it("binds ignored route-ledger bytes into the closed identity", async () => {
    const modifiedLedgerPath = path.join(
      temporaryOutputRoot,
      "route-ledger-identity.json",
    );
    const ledger = JSON.parse(
      fs.readFileSync(defaultPublisherRouteReportPaths.routeLedgerPath, "utf8"),
    ) as {
      routes: Array<{ targetContinuityIds: string[] }>;
    };
    const entry = ledger.routes.find(
      ({ targetContinuityIds }) => targetContinuityIds.length > 0,
    );
    if (entry === undefined) {
      throw new Error("Route-ledger fixture has no target continuity identity.");
    }
    entry.targetContinuityIds = [
      ...entry.targetContinuityIds,
      "synthetic-identity-only-continuity-id",
    ];
    fs.writeFileSync(
      modifiedLedgerPath,
      `${JSON.stringify(ledger, null, 2)}\n`,
      "utf8",
    );

    const created = await createPublisherRouteOwnershipAudit({
      ...defaultPublisherRouteReportPaths,
      routeLedgerPath: modifiedLedgerPath,
    });
    expect(created.report).toEqual(result.report);
    expect(created.identity.authorities.routeLedgerSha256).not.toBe(
      result.identity.authorities.routeLedgerSha256,
    );
    expect(() =>
      assertReviewedPublisherRouteAudit(created.report, created.identity),
    ).toThrow(
      /Publisher route audit drifted from the reviewed known-gap baseline\./u,
    );
  }, 30_000);

  it("refuses drift in either closed report identity", () => {
    expect(() =>
      assertReviewedPublisherRouteAudit(result.report, {
        ...result.identity,
        readerBuildId: "sha256:unexpected",
      }),
    ).toThrow(
      /Publisher route audit drifted from the reviewed known-gap baseline\./,
    );
    expect(() =>
      assertReviewedPublisherRouteAudit(result.report, {
        ...result.identity,
        publisherCommit: "unexpected",
      }),
    ).toThrow(
      /Publisher route audit drifted from the reviewed known-gap baseline\./,
    );
  });

  it("does not mutate editorial, publishing, Publisher configuration, or catalog authorities", () => {
    expect(protectedSnapshot()).toEqual(before);
  });
});
