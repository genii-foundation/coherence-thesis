import { describe, expect, it } from "vitest";

import {
  DEFAULT_CURRENT_COHERENCE_EXACT_PATHS,
  buildPublisherRouteOwnershipReport,
  validatePublisherRouteOwnership,
  type PublisherRouteOwnershipInput,
  type PublisherRouteOwnershipIssueCode,
} from "./route-ownership";

function createInput() {
  return {
    reader: {
      routes: {
        active: [
          { path: "/", target: { kind: "home" } },
          { path: "/manuscripts/one/", target: { kind: "work" } },
          {
            path: "/manuscripts/one/part/",
            target: { kind: "section" },
          },
          {
            path: "/manuscripts/one/part/chapter/",
            target: { kind: "section" },
          },
          {
            path: "/manuscripts/one/part/chapter/current/",
            target: { kind: "section" },
          },
        ],
        redirects: [
          {
            from: "/manuscripts/one/old-part",
            to: "/manuscripts/one/old-part/",
            status: 308,
          },
          {
            from: "/manuscripts/one/old-part/",
            to: "/manuscripts/one/part/",
            status: 308,
          },
          {
            from: "/manuscripts/one/old-section",
            to: "/manuscripts/one/old-section/",
            status: 308,
          },
          {
            from: "/manuscripts/one/old-section/",
            to: "/manuscripts/one/part/chapter/current/",
            status: 308,
          },
        ],
      },
      works: [
        {
          sections: [
            {
              readerAddress: {
                path: "/manuscripts/one/part/chapter/",
                anchor: "current",
              },
              domId: "current",
              blocks: [
                {
                  readerAddress: {
                    path: "/manuscripts/one/part/chapter/",
                    anchor: "paragraph-one",
                  },
                  domId: "paragraph-one",
                },
              ],
            },
            {
              readerAddress: {
                path: "/manuscripts/one/part/chapter/current/",
                anchor: "current",
              },
              domId: "current",
              blocks: [],
            },
          ],
        },
      ],
    },
    catalog: {
      volumes: [
        {
          href: "/manuscripts/one/",
          parts: [
            {
              href: "/manuscripts/one/part/",
              chapters: [
                { href: "/manuscripts/one/part/chapter/" },
              ],
            },
          ],
        },
      ],
      sections: [
        {
          sectionId: "current",
          href: "/manuscripts/one/part/chapter/current/",
          readerHref: "/manuscripts/one/part/chapter/#current",
          legacySectionIds: ["legacy"],
          paragraphs: [{ anchor: "paragraph-one" }],
        },
      ],
    },
    routeLedger: {
      routes: [
        { href: "/", kind: "volume", targetContinuityIds: ["current"] },
        {
          href: "/manuscripts/one/",
          kind: "volume",
          targetContinuityIds: ["current"],
        },
        {
          href: "/manuscripts/one/part/",
          kind: "route-alias",
          targetContinuityIds: ["current"],
        },
        {
          href: "/manuscripts/one/part/chapter/",
          kind: "chapter",
          targetContinuityIds: ["current"],
        },
        {
          href: "/manuscripts/one/part/chapter/#current",
          kind: "reader",
          targetContinuityIds: ["current"],
        },
        {
          href: "/manuscripts/one/part/chapter/#current",
          kind: "section-alias",
          targetContinuityIds: ["current"],
        },
        {
          href: "/manuscripts/one/old-part/",
          kind: "route-alias",
          targetContinuityIds: ["current"],
        },
        {
          href: "/manuscripts/one/old-part",
          kind: "volume",
          targetContinuityIds: ["current"],
        },
        {
          href: "/manuscripts/one/old-section/",
          kind: "section-alias",
          targetContinuityIds: ["current"],
        },
        {
          href: "/manuscripts/one/old-section",
          kind: "section",
          targetContinuityIds: ["current"],
        },
        {
          href: "/overview/",
          kind: "reader",
          targetContinuityIds: [],
        },
      ],
    },
    routeAliases: {
      aliases: [
        {
          sourceHref: "/manuscripts/one/old-part/",
          targetHref: "/manuscripts/one/part/",
        },
      ],
    },
    sectionAliases: {
      aliases: [
        {
          sourceHref: "/manuscripts/one/old-section/",
          targetSectionId: "current",
          targetHref: "/manuscripts/one/part/chapter/current/",
        },
      ],
    },
    fragmentTranslations: [
      {
        fromHref: "/manuscripts/one/part/chapter/#legacy",
        toHref: "/manuscripts/one/part/chapter/#current",
      },
    ],
    currentCoherenceExactPaths: [] as string[],
  } satisfies PublisherRouteOwnershipInput;
}

function issueCodes(
  input: PublisherRouteOwnershipInput,
): PublisherRouteOwnershipIssueCode[] {
  return buildPublisherRouteOwnershipReport(input).issues.map(({ code }) => code);
}

describe("Publisher route ownership", () => {
  it("reports one exact, deterministic clean ownership census", () => {
    const report = validatePublisherRouteOwnership(createInput());

    expect(report.counts).toEqual({
      routeLedgerEntryCount: 11,
      durableHrefCount: 10,
      durablePathnameCount: 9,
      durableQueryHrefCount: 0,
      durableFragmentEntryCount: 2,
      durableFragmentHrefCount: 1,
      publisherActiveRouteCount: 5,
      publisherActivePathCount: 5,
      publisherActiveWorkPathCount: 1,
      publisherActiveSectionPathCount: 3,
      publisherActiveOtherPathCount: 1,
      publisherExplicitRedirectCount: 4,
      publisherDerivedSlashRedirectCount: 4,
      publisherRendererResourceCount: 6,
      publisherSyncMethodPathCount: 8,
      publisherSyncPathCount: 6,
      currentCoherenceExactPathCount: 0,
      retainedCoherenceExactPathCount: 11,
      retainedCoherencePrefixCount: 6,
      catalogPartPathCount: 1,
      catalogChapterPathCount: 1,
      unownedPartPathCount: 0,
      unownedChapterPathCount: 0,
      exactPathCollisionCount: 0,
      decodedRouteCollisionCount: 0,
      pathCollisionCount: 0,
      unclassifiedDurablePathnameCount: 0,
      readerFragmentAddressCount: 3,
      requiredFragmentHrefCount: 2,
      fragmentTranslationCount: 1,
      fragmentGapCount: 0,
      issueCount: 0,
    });
    expect(report.publisher.workPaths).toEqual(["/manuscripts/one/"]);
    expect(report.publisher.sectionPaths).toEqual([
      "/manuscripts/one/part/",
      "/manuscripts/one/part/chapter/",
      "/manuscripts/one/part/chapter/current/",
    ]);
    expect(report.publisher.derivedSlashRedirects).toEqual([
      {
        from: "/manuscripts/one",
        status: 308,
        to: "/manuscripts/one/",
      },
      {
        from: "/manuscripts/one/part",
        status: 308,
        to: "/manuscripts/one/part/",
      },
      {
        from: "/manuscripts/one/part/chapter",
        status: 308,
        to: "/manuscripts/one/part/chapter/",
      },
      {
        from: "/manuscripts/one/part/chapter/current",
        status: 308,
        to: "/manuscripts/one/part/chapter/current/",
      },
    ]);
    expect(report.issues).toEqual([]);

    expect(buildPublisherRouteOwnershipReport(createInput())).toEqual(report);
  });

  it("treats route-ledger kinds as evidence labels, not route ownership", () => {
    const input = createInput();
    input.routeLedger.routes[2]!.kind = "route-alias";

    const report = validatePublisherRouteOwnership(input);
    expect(report.publisher.sectionPaths).toContain("/manuscripts/one/part/");
    expect(report.durable.unclassifiedPathnames).toEqual([]);
  });

  it("fails closed for unowned aggregate paths and durable pathnames", () => {
    const input = createInput();
    input.reader.routes.active = input.reader.routes.active.filter(
      ({ target }) => target.kind !== "section",
    );

    const report = buildPublisherRouteOwnershipReport(input);
    expect(report.aggregate.unownedPartPaths).toEqual([
      "/manuscripts/one/part/",
    ]);
    expect(report.aggregate.unownedChapterPaths).toEqual([
      "/manuscripts/one/part/chapter/",
    ]);
    expect(report.durable.unclassifiedPathnames).toEqual([
      "/manuscripts/one/part/",
      "/manuscripts/one/part/chapter/",
    ]);
    expect(issueCodes(input)).toEqual(
      expect.arrayContaining([
        "aggregate-part-unowned",
        "aggregate-chapter-unowned",
        "unclassified-durable-path",
      ]),
    );
    expect(() => validatePublisherRouteOwnership(input)).toThrow(
      "Publisher route ownership has",
    );
  });

  it("requires an exact translation for a legacy fragment", () => {
    const missing = createInput();
    missing.fragmentTranslations = [];

    expect(buildPublisherRouteOwnershipReport(missing).fragments.gaps).toEqual([
      {
        fragment: "legacy",
        href: "/manuscripts/one/part/chapter/#legacy",
        pathname: "/manuscripts/one/part/chapter/",
        sources: ["catalog-legacy-section"],
      },
    ]);
    expect(issueCodes(missing)).toContain("fragment-gap");

    expect(validatePublisherRouteOwnership(createInput()).fragments.gaps).toEqual(
      [],
    );
  });

  it("preserves fragments while following explicit redirect chains", () => {
    const input = createInput();
    input.routeLedger.routes.push({
      href: "/manuscripts/one/old-section/#current",
      kind: "section-alias",
      targetContinuityIds: ["current"],
    });

    const report = validatePublisherRouteOwnership(input);
    expect(report.fragments.requiredHrefs).toContain(
      "/manuscripts/one/old-section/#current",
    );
    expect(report.fragments.gaps).toEqual([]);
  });

  it("rejects a slash-ended redirect source without its exact companion", () => {
    const input = createInput();
    input.reader.routes.redirects = input.reader.routes.redirects.filter(
      ({ from }) => from !== "/manuscripts/one/old-part",
    );
    input.routeLedger.routes = input.routeLedger.routes.filter(
      ({ href }) => href !== "/manuscripts/one/old-part",
    );

    expect(issueCodes(input)).toContain("redirect-slash-companion-missing");
  });

  it("rejects query-bearing durable hrefs and unexpected optional artifacts", () => {
    const input = createInput();
    input.routeLedger.routes.push({
      href: "/overview/?mode=compact",
      kind: "reader",
      targetContinuityIds: [],
    });
    Object.assign(input, {
      extensionArtifact: {},
      syncArtifact: {},
    });

    expect(issueCodes(input)).toEqual(
      expect.arrayContaining([
        "durable-query",
        "unexpected-extension-artifact",
        "unexpected-sync-artifact",
      ]),
    );
  });

  it.each([
    ["/overview/", "coherence-retained-exact"],
    ["/art/custom/", "coherence-retained-prefix:/art/"],
    ["/offline-sw.js", "publisher-renderer-resource"],
    ["/api/account", "publisher-sync-route"],
  ])("detects an active route collision at %s", (path, owner) => {
    const input = createInput();
    input.reader.routes.active.push({ path, target: { kind: "section" } });

    const report = buildPublisherRouteOwnershipReport(input);
    expect(report.exactPathCollisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path,
          owners: expect.arrayContaining(["publisher-active:section", owner]),
        }),
      ]),
    );
    expect(issueCodes(input)).toContain("collision");
  });

  it("exposes the three known collisions with routes Coherence owns today", () => {
    const input = createInput();
    input.currentCoherenceExactPaths = [
      ...DEFAULT_CURRENT_COHERENCE_EXACT_PATHS,
    ];

    const report = buildPublisherRouteOwnershipReport(input);
    expect(report.exactPathCollisions.map(({ path }) => path)).toEqual([
      "/api/account",
      "/auth/callback",
      "/offline-sw.js",
    ]);
    expect(report.exactPathCollisions[0]!.owners).toEqual(
      expect.arrayContaining([
        "coherence-current-exact",
        "publisher-sync-route",
      ]),
    );
    expect(report.counts.currentCoherenceExactPathCount).toBe(14);
    expect(() => validatePublisherRouteOwnership(input)).toThrow(
      "Publisher route ownership has 3 issues.",
    );
  });

  it("detects duplicate paths and decoded Next.js route collisions", () => {
    const input = createInput();
    input.reader.routes.active.push(
      { path: "/manuscripts/one/", target: { kind: "work" } },
      { path: "/manuscripts/one", target: { kind: "work" } },
    );

    const report = buildPublisherRouteOwnershipReport(input);
    expect(issueCodes(input)).toEqual(
      expect.arrayContaining([
        "active-path-duplicate",
        "decoded-route-collision",
        "collision",
      ]),
    );
    expect(report.decodedRouteCollisions).toEqual([
      {
        decodedSegments: ["manuscripts", "one"],
        paths: ["/manuscripts/one", "/manuscripts/one/"],
      },
    ]);
  });

  it("requires continuity aliases to match explicit Publisher redirects", () => {
    const input = createInput();
    input.reader.routes.redirects[1]!.to = "/manuscripts/one/part/chapter/";
    input.reader.routes.redirects[3]!.to = "/manuscripts/one/part/";

    expect(issueCodes(input)).toEqual(
      expect.arrayContaining(["route-alias-unowned", "section-alias-unowned"]),
    );
  });

  it("rejects a generated section alias target that differs from its section href", () => {
    const input = createInput();
    input.sectionAliases.aliases[0]!.targetHref =
      "/manuscripts/one/part/chapter/";

    expect(issueCodes(input)).toContain("section-alias-target-mismatch");
  });
});
