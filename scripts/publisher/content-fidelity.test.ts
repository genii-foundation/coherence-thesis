import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";
import type { BuiltPublicationReader } from "@genii-foundation/publisher/node";

import {
  normalizeNewlines,
  paragraphFingerprints,
  sha256,
  stripMarkdown,
  wordCount,
} from "../manuscripts/io";

import {
  assertCensusAuthorityPath,
  assertReviewedContentFidelityBaseline,
  createContentFidelityReport,
  extractMarkdownLinks,
  loadContentFidelityAuthorities,
  runContentFidelityCensus,
  type ContentFidelityAuthorities,
  type ContentFidelityReport,
} from "./content-fidelity";

let currentReport: ContentFidelityReport;
let currentAuthorities: ContentFidelityAuthorities;

type ReaderRedirects = BuiltPublicationReader["reader"]["routes"]["redirects"];

function authoritiesWithRedirects({
  readerRedirects,
  authorityRedirects = currentAuthorities.redirects,
  contentRedirects = readerRedirects,
}: Readonly<{
  authorityRedirects?: ReaderRedirects;
  contentRedirects?: ReaderRedirects;
  readerRedirects: ReaderRedirects;
}>): ContentFidelityAuthorities {
  return {
    ...currentAuthorities,
    redirects: authorityRedirects,
    built: {
      ...currentAuthorities.built,
      content: {
        ...currentAuthorities.built.content,
        routes: {
          ...currentAuthorities.built.content.routes,
          redirects: contentRedirects,
        },
      },
      reader: {
        ...currentAuthorities.built.reader,
        routes: {
          ...currentAuthorities.built.reader.routes,
          redirects: readerRedirects,
        },
      },
    },
  };
}

beforeAll(async () => {
  currentAuthorities = await loadContentFidelityAuthorities();
  currentReport = await runContentFidelityCensus(currentAuthorities);
}, 30_000);

describe("Publisher content fidelity census", () => {
  it("extracts Markdown link identity without confusing emphasis", () => {
    expect(
      extractMarkdownLinks(
        "A [linked **Scale**](/manuscripts/4/the-scales/) and *plain text*.",
      ),
    ).toEqual([
      {
        label: "linked Scale",
        destination: "/manuscripts/4/the-scales/",
        markdown: "[linked **Scale**](/manuscripts/4/the-scales/)",
        rawStart: 2,
        rawEnd: 48,
      },
    ]);
  });

  it("proves the exact current coverage while retaining known gaps", () => {
    expect(currentReport.parity).toBe(false);
    expect(currentReport.status).toBe("reviewed-known-gaps");
    expect(currentReport.coverage).toMatchObject({
      workCount: 9,
      sectionCount: 525,
      routeCount: 535,
      sectionRouteCount: 525,
      redirectCount: 518,
      semanticRedirectCount: 259,
      companionRedirectCount: 259,
      redirectsSha256:
        "6e3ed95657dcaac2e60a35346b6c9e2c2a6c187bda68efff42e791a74f33e471",
      continuityCount: 525,
      sourceOrderCount: 525,
      sourceSpanBlockCount: 3_486,
      canonicalManuscriptCount: 9,
      omittedPartCount: 47,
      hierarchyRoles: { chapter: 386, section: 139 },
      bodyProjection: {
        sectionCount: 525,
        missingSectionIds: [],
        bodyBlockCount: 2_548,
        matchedBodyBlockCount: 2_548,
        bodyWordCount: 202_629,
        matchedBeforeRangeBlockCount: 0,
        matchedInsideRangeBlockCount: 2_548,
        matchedAfterRangeBlockCount: 0,
        unmatchedBeforeRangeBlockCount: 166,
        unmatchedInsideRangeBlockCount: 567,
        unmatchedAfterRangeBlockCount: 205,
      },
    });
    expect(currentAuthorities.redirects).toHaveLength(518);
    expect(
      currentAuthorities.redirects.filter(({ from }) => from.endsWith("/")),
    ).toHaveLength(259);
    expect(
      currentAuthorities.redirects.filter(({ from }) => !from.endsWith("/")),
    ).toHaveLength(259);
    expect(currentReport.knownGaps.words).toEqual({
      catalog: 202_137,
      publisher: 206_448,
      delta: 4_311,
    });
    expect(currentReport.knownGaps.titleMatterPrefix).toMatchObject({
      provenanceBlockCount: 166,
      provenanceWordCount: 1_125,
      visibleBodyPrefixBlockCount: 174,
      visibleBodyPrefixWordCount: 1_155,
    });
  });

  it("locks canonical and catalog-only link sections and destinations", () => {
    const links = currentReport.knownGaps.semanticLinkFidelity;
    expect(links).toMatchObject({
      preparedCatalogLinkCount: 35,
      rawCatalogLinkCount: 14,
      publisherReaderLinkCount: 14,
    });
    expect(links.canonicalSource).toMatchObject({
      linkCount: 14,
      sourceSectionCount: 11,
      destinationCount: 13,
      workIds: ["smallest-nest"],
    });
    expect(links.generatedCatalogOnly).toMatchObject({
      linkCount: 21,
      sourceSectionCount: 11,
      targetSectionCount: 7,
      destinationCount: 7,
      registryOccurrenceCount: 21,
    });
    expect(links.generatedCatalogOnly.evidence).toHaveLength(21);
    expect(
      links.generatedCatalogOnly.evidence.every(
        ({ readerBlockId, paragraphAnchor }) =>
          readerBlockId.startsWith("markdown-block-") &&
          paragraphAnchor.startsWith("p-h"),
      ),
    ).toBe(true);
  });

  it("rejects coordinated raw and prepared catalog body drift", () => {
    const rawCatalog = structuredClone(currentAuthorities.rawCatalog);
    const catalog = structuredClone(currentAuthorities.catalog);
    const sectionId = "v01-the-work-behind-the-book";
    const original = "This book did not begin as a book.";
    const changed = "This text did not begin as a book.";
    const rawSection = rawCatalog.sections.find(
      (section) => section.sectionId === sectionId,
    );
    const preparedSection = catalog.sections.find(
      (section) => section.sectionId === sectionId,
    );
    expect(rawSection?.body).toContain(original);
    expect(preparedSection?.body).toContain(original);
    if (!rawSection || !preparedSection) throw new Error("fixture section missing");
    rawSection.body = rawSection.body.replace(original, changed);
    preparedSection.body = preparedSection.body.replace(original, changed);
    for (const section of [rawSection, preparedSection]) {
      section.text = stripMarkdown(section.body);
      section.wordCount = wordCount(section.body);
      section.paragraphs = paragraphFingerprints(section.body);
      section.contentHash = sha256(normalizeNewlines(section.body)).slice(0, 16);
    }

    expect(() =>
      createContentFidelityReport({
        ...currentAuthorities,
        rawCatalog,
        catalog,
      }),
    ).toThrow(/catalog body|body projection/u);
  });

  it("rejects a removed active route index or altered hierarchy role", () => {
    const builtWithoutRoutes: BuiltPublicationReader = {
      ...currentAuthorities.built,
      reader: {
        ...currentAuthorities.built.reader,
        routes: {
          ...currentAuthorities.built.reader.routes,
          active: [],
        },
      },
    };
    expect(() =>
      createContentFidelityReport({
        ...currentAuthorities,
        built: builtWithoutRoutes,
      }),
    ).toThrow(/route index|active route/u);

    const firstWork = currentAuthorities.built.reader.works[0]!;
    const firstSection = firstWork.sections[0]!;
    const builtWithWrongRole: BuiltPublicationReader = {
      ...currentAuthorities.built,
      reader: {
        ...currentAuthorities.built.reader,
        works: [
          {
            ...firstWork,
            sections: [
              { ...firstSection, role: "section" },
              ...firstWork.sections.slice(1),
            ],
          },
          ...currentAuthorities.built.reader.works.slice(1),
        ],
      },
    };
    expect(() =>
      createContentFidelityReport({
        ...currentAuthorities,
        built: builtWithWrongRole,
      }),
    ).toThrow(/hierarchy role/u);
  });

  it.each([
    [
      "omission",
      (redirects: ReaderRedirects): ReaderRedirects => redirects.slice(0, -1),
    ],
    [
      "insertion",
      (redirects: ReaderRedirects): ReaderRedirects => [
        ...redirects,
        {
          from: "/manuscripts/1/forged-redirect/",
          status: 308 as const,
          to: "/",
        },
      ],
    ],
    [
      "source substitution",
      (redirects: ReaderRedirects): ReaderRedirects =>
        redirects.map((redirect, index) =>
          index === 0
            ? { ...redirect, from: "/manuscripts/1/forged-redirect/" }
            : redirect,
        ),
    ],
    [
      "reorder",
      (redirects: ReaderRedirects): ReaderRedirects => [
        redirects[1]!,
        redirects[0]!,
        ...redirects.slice(2),
      ],
    ],
    [
      "target drift",
      (redirects: ReaderRedirects): ReaderRedirects =>
        redirects.map((redirect, index) =>
          index === 0 ? { ...redirect, to: "/" } : redirect,
        ),
    ],
    [
      "status drift",
      (redirects: ReaderRedirects): ReaderRedirects =>
        redirects.map((redirect, index) =>
          index === 0 ? { ...redirect, status: 307 as const } : redirect,
        ),
    ],
  ])("rejects Reader redirect authority %s", (_label, mutate) => {
    const changedRedirects = mutate(currentAuthorities.redirects);
    expect(() =>
      createContentFidelityReport(
        authoritiesWithRedirects({ readerRedirects: changedRedirects }),
      ),
    ).toThrow(/redirect authority census/u);
  });

  it("rejects content and Reader redirect disagreement before authority review", () => {
    expect(() =>
      createContentFidelityReport(
        authoritiesWithRedirects({
          contentRedirects: currentAuthorities.redirects,
          readerRedirects: currentAuthorities.redirects.slice(1),
        }),
      ),
    ).toThrow(/content and Reader route indexes/u);
  });

  it("rejects coordinated redirect authority drift at the reviewed digest", () => {
    const coordinatedRedirects = currentAuthorities.redirects.map(
      (redirect, index) =>
        index === 0 ? { ...redirect, to: "/" } : redirect,
    );
    const coordinatedReport = createContentFidelityReport(
      authoritiesWithRedirects({
        authorityRedirects: coordinatedRedirects,
        readerRedirects: coordinatedRedirects,
      }),
    );

    expect(coordinatedReport.coverage.redirectCount).toBe(518);
    expect(coordinatedReport.coverage.redirectsSha256).not.toBe(
      currentReport.coverage.redirectsSha256,
    );
    expect(() =>
      assertReviewedContentFidelityBaseline(coordinatedReport),
    ).toThrow(/redirect tuple census/u);
  });

  it("fails the reviewed baseline on word, route, or link drift", () => {
    const wordDrift: ContentFidelityReport = {
      ...currentReport,
      knownGaps: {
        ...currentReport.knownGaps,
        words: {
          ...currentReport.knownGaps.words,
          delta: currentReport.knownGaps.words.delta + 1,
        },
      },
    };
    expect(() => assertReviewedContentFidelityBaseline(wordDrift)).toThrow(
      /word count gap/u,
    );

    const routeDrift: ContentFidelityReport = {
      ...currentReport,
      coverage: {
        ...currentReport.coverage,
        routesSha256: "0".repeat(64),
      },
    };
    expect(() => assertReviewedContentFidelityBaseline(routeDrift)).toThrow(
      /route census/u,
    );

    const semanticDrift: ContentFidelityReport = {
      ...currentReport,
      knownGaps: {
        ...currentReport.knownGaps,
        semanticLinkFidelity: {
          ...currentReport.knownGaps.semanticLinkFidelity,
          generatedCatalogOnly: {
            ...currentReport.knownGaps.semanticLinkFidelity.generatedCatalogOnly,
            identitySha256: "f".repeat(64),
          },
        },
      },
    };
    expect(() => assertReviewedContentFidelityBaseline(semanticDrift)).toThrow(
      /semantic link identity/u,
    );

    const readerWordDrift: ContentFidelityReport = {
      ...currentReport,
      reader: { ...currentReport.reader, wordCount: 1 },
    };
    expect(() =>
      assertReviewedContentFidelityBaseline(readerWordDrift),
    ).toThrow(/Reader word count/u);

    const catalogPathDrift: ContentFidelityReport = {
      ...currentReport,
      catalog: { ...currentReport.catalog, path: "elsewhere/catalog.json" },
    };
    expect(() =>
      assertReviewedContentFidelityBaseline(catalogPathDrift),
    ).toThrow(/catalog report path/u);

    const missingManuscriptEvidence: ContentFidelityReport = {
      ...currentReport,
      coverage: {
        ...currentReport.coverage,
        canonicalManuscripts: [],
      },
    };
    expect(() =>
      assertReviewedContentFidelityBaseline(missingManuscriptEvidence),
    ).toThrow(/manuscript evidence count/u);

    const missingSemanticEvidence: ContentFidelityReport = {
      ...currentReport,
      knownGaps: {
        ...currentReport.knownGaps,
        semanticLinkFidelity: {
          ...currentReport.knownGaps.semanticLinkFidelity,
          generatedCatalogOnly: {
            ...currentReport.knownGaps.semanticLinkFidelity.generatedCatalogOnly,
            evidence: [],
          },
        },
      },
    };
    expect(() =>
      assertReviewedContentFidelityBaseline(missingSemanticEvidence),
    ).toThrow(/semantic occurrence evidence count/u);
  });

  it("rejects external or symbolic census authority paths without leaking absolute paths", () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "coherence-fidelity-authority-"),
    );
    const realDirectory = path.join(fixtureRoot, "real");
    const authorityPath = path.join(realDirectory, "authority.json");
    const symbolicDirectory = path.join(fixtureRoot, "symbolic");
    fs.mkdirSync(realDirectory, { recursive: true });
    fs.writeFileSync(authorityPath, "{}\n", "utf8");
    fs.symlinkSync(realDirectory, symbolicDirectory, "dir");

    try {
      expect(() =>
        assertCensusAuthorityPath({
          repositoryRoot: fixtureRoot,
          authorityPath,
          kind: "file",
          label: "fixture authority",
        }),
      ).not.toThrow();

      let symbolicMessage = "";
      try {
        assertCensusAuthorityPath({
          repositoryRoot: fixtureRoot,
          authorityPath: path.join(symbolicDirectory, "authority.json"),
          kind: "file",
          label: "fixture authority",
        });
      } catch (error) {
        symbolicMessage = error instanceof Error ? error.message : String(error);
      }
      expect(symbolicMessage).toContain("symbolic path segment");
      expect(symbolicMessage).not.toContain(fixtureRoot);

      expect(() =>
        assertCensusAuthorityPath({
          repositoryRoot: realDirectory,
          authorityPath: path.join(fixtureRoot, "outside.json"),
          kind: "file",
          label: "fixture authority",
        }),
      ).toThrow(/inside the repository/u);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("keeps the command line entry point no-argument and read only", () => {
    const scriptPath = fileURLToPath(
      new URL("./content-fidelity.ts", import.meta.url),
    );
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", scriptPath, "unexpected"],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage: content-fidelity.ts");
    expect(result.stdout).toBe("");
  });
});
