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
  createPublisherCatalogRouteProjectionSha256,
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

type MutableCatalogRouteFixture = {
  gitRevision: string;
  volumes: Array<{
    href: string;
    parts: Array<{
      href: string;
      chapters: Array<{ href: string }>;
    }>;
  }>;
  sections: Array<{
    sectionId: string;
    href: string;
    readerHref: string;
    legacySectionIds: string[];
    paragraphs: Array<{ anchor: string }>;
  }>;
};

type CatalogRouteProjectionMutation = Readonly<{
  name: string;
  mutate: (catalog: MutableCatalogRouteFixture) => void;
}>;

function requireFirst<T>(values: T[], label: string): T {
  const value = values[0];
  if (value === undefined) throw new Error(`${label} fixture is empty.`);
  return value;
}

function requireMatch<T>(
  values: T[],
  predicate: (value: T) => boolean,
  label: string,
): T {
  const value = values.find(predicate);
  if (value === undefined) throw new Error(`${label} fixture is missing.`);
  return value;
}

function removeFirst<T>(values: T[], label: string): void {
  requireFirst(values, label);
  values.splice(0, 1);
}

function swapFirstTwo<T>(values: T[], label: string): void {
  const first = values[0];
  const second = values[1];
  if (first === undefined || second === undefined) {
    throw new Error(`${label} fixture needs two entries.`);
  }
  values.splice(0, 2, second, first);
}

const CATALOG_ROUTE_PROJECTION_MUTATIONS = Object.freeze([
  {
    name: "volume href",
    mutate: (catalog) => {
      requireFirst(catalog.volumes, "volume").href = "/synthetic-volume/";
    },
  },
  {
    name: "part href",
    mutate: (catalog) => {
      requireFirst(
        requireFirst(catalog.volumes, "volume").parts,
        "part",
      ).href = "/synthetic-part/";
    },
  },
  {
    name: "chapter href",
    mutate: (catalog) => {
      requireFirst(
        requireFirst(
          requireFirst(catalog.volumes, "volume").parts,
          "part",
        ).chapters,
        "chapter",
      ).href = "/synthetic-chapter/";
    },
  },
  {
    name: "section id",
    mutate: (catalog) => {
      requireFirst(catalog.sections, "section").sectionId =
        "synthetic-section-id";
    },
  },
  {
    name: "section href",
    mutate: (catalog) => {
      requireFirst(catalog.sections, "section").href = "/synthetic-section/";
    },
  },
  {
    name: "section Reader href",
    mutate: (catalog) => {
      requireFirst(catalog.sections, "section").readerHref =
        "/synthetic-reader/#synthetic-section";
    },
  },
  {
    name: "legacy section id value",
    mutate: (catalog) => {
      const legacySectionIds = requireMatch(
        catalog.sections,
        ({ legacySectionIds }) => legacySectionIds.length > 0,
        "section with legacy ids",
      ).legacySectionIds;
      requireFirst(legacySectionIds, "legacy section id");
      legacySectionIds[0] = "synthetic-legacy-id";
    },
  },
  {
    name: "paragraph anchor",
    mutate: (catalog) => {
      requireFirst(
        requireMatch(
          catalog.sections,
          ({ paragraphs }) => paragraphs.length > 0,
          "section with paragraphs",
        ).paragraphs,
        "paragraph",
      ).anchor = "synthetic-anchor";
    },
  },
  {
    name: "volume membership",
    mutate: (catalog) => removeFirst(catalog.volumes, "volumes"),
  },
  {
    name: "volume order",
    mutate: (catalog) => swapFirstTwo(catalog.volumes, "volumes"),
  },
  {
    name: "part membership",
    mutate: (catalog) =>
      removeFirst(requireFirst(catalog.volumes, "volume").parts, "parts"),
  },
  {
    name: "part order",
    mutate: (catalog) =>
      swapFirstTwo(
        requireMatch(
          catalog.volumes,
          ({ parts }) => parts.length > 1,
          "volume with parts",
        ).parts,
        "parts",
      ),
  },
  {
    name: "chapter membership",
    mutate: (catalog) =>
      removeFirst(
        requireFirst(
          requireFirst(catalog.volumes, "volume").parts,
          "part",
        ).chapters,
        "chapters",
      ),
  },
  {
    name: "chapter order",
    mutate: (catalog) =>
      swapFirstTwo(
        requireMatch(
          catalog.volumes.flatMap(({ parts }) => parts),
          ({ chapters }) => chapters.length > 1,
          "part with chapters",
        ).chapters,
        "chapters",
      ),
  },
  {
    name: "section membership",
    mutate: (catalog) => removeFirst(catalog.sections, "sections"),
  },
  {
    name: "section order",
    mutate: (catalog) => swapFirstTwo(catalog.sections, "sections"),
  },
  {
    name: "legacy section id membership",
    mutate: (catalog) =>
      removeFirst(
        requireMatch(
          catalog.sections,
          ({ legacySectionIds }) => legacySectionIds.length > 0,
          "section with legacy ids",
        ).legacySectionIds,
        "legacy section ids",
      ),
  },
  {
    name: "legacy section id order",
    mutate: (catalog) =>
      swapFirstTwo(
        requireMatch(
          catalog.sections,
          ({ legacySectionIds }) => legacySectionIds.length > 1,
          "section with legacy ids",
        ).legacySectionIds,
        "legacy section ids",
      ),
  },
  {
    name: "paragraph membership",
    mutate: (catalog) =>
      removeFirst(
        requireMatch(
          catalog.sections,
          ({ paragraphs }) => paragraphs.length > 0,
          "section with paragraphs",
        ).paragraphs,
        "paragraphs",
      ),
  },
  {
    name: "paragraph order",
    mutate: (catalog) =>
      swapFirstTwo(
        requireMatch(
          catalog.sections,
          ({ paragraphs }) => paragraphs.length > 1,
          "section with paragraphs",
        ).paragraphs,
        "paragraphs",
      ),
  },
] satisfies readonly CatalogRouteProjectionMutation[]);

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
        catalogRouteProjectionSha256:
          "sha256:bb6a17d06120c3dfbd3a80b291d79a5804f9ace65039071f3230a00a4139ae10",
        routeLedgerSha256:
          "sha256:7da903e2be45cc98ce9aab3420394a291b4db134abcf2eb826ecd7f2d032a712",
        routeAliasesSha256:
          "sha256:d3b1139db51981106a42103087743d95d2773aed557a85e6d24f86618ae304b4",
        sectionAliasesSha256:
          "sha256:4997bd0181607e15079a7a9d130a419f41a2ea1c4db650685b98c68a7b39a30c",
      },
      publisherCommit: "580f5c548802df09fc9bb814286b205ba08acdb5",
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
        "Bound identity: Publisher 580f5c548802df09fc9bb814286b205ba08acdb5, Reader sha256:0e60cce59afd291f141b34ca11f7e405099fb00f0752dafa308b22efba5f9da3.",
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

  it("ignores volatile catalog metadata outside the adapted route projection", async () => {
    const modifiedCatalogPath = path.join(
      temporaryOutputRoot,
      "catalog-volatile-metadata.json",
    );
    const catalog = JSON.parse(
      fs.readFileSync(defaultPublisherRouteReportPaths.catalogPath, "utf8"),
    ) as { gitRevision: string };
    catalog.gitRevision = "synthetic-volatile-revision";
    fs.writeFileSync(
      modifiedCatalogPath,
      `${JSON.stringify(catalog, null, 2)}\n`,
      "utf8",
    );
    expect(sha256(modifiedCatalogPath)).not.toBe(
      sha256(defaultPublisherRouteReportPaths.catalogPath),
    );

    const created = await createPublisherRouteOwnershipAudit({
      ...defaultPublisherRouteReportPaths,
      catalogPath: modifiedCatalogPath,
    });
    expect(created.identity).toEqual(result.identity);
    expect(created.report).toEqual(result.report);
  }, 30_000);

  it.each(CATALOG_ROUTE_PROJECTION_MUTATIONS)(
    "binds catalog route projection mutation: $name",
    ({ mutate }) => {
      const catalog = JSON.parse(
        fs.readFileSync(defaultPublisherRouteReportPaths.catalogPath, "utf8"),
      ) as MutableCatalogRouteFixture;
      mutate(catalog);
      expect(
        createPublisherCatalogRouteProjectionSha256(catalog),
      ).not.toBe(
        result.identity.authorities.catalogRouteProjectionSha256,
      );
    },
  );

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
