import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  hashCanonicalJson,
  type SectionContentInput,
} from "@genii-foundation/publisher-content";
import type { JSONValue } from "@genii-foundation/publisher-schema";

import { applySemanticReferences } from "../manuscripts/semantic-references";
import {
  adaptCoherencePublisherContent,
  loadCoherencePublisherContentAuthorities,
  type CoherencePublisherContentAuthorities,
  type CoherencePublisherContentProof,
} from "./content-adapter";

const approvedLinkIds = [
  "semantic-link-0190441f5eaa1fae",
  "semantic-link-019e1763599765f8",
  "semantic-link-18f26fbac4c12cf6",
  "semantic-link-1a89228a862b8014",
  "semantic-link-21d5c4ae93164318",
  "semantic-link-338214982d55da40",
  "semantic-link-42e376773a037c6f",
  "semantic-link-43785c725c40e8e2",
  "semantic-link-4d73c6d5ac9263ca",
  "semantic-link-53c627f0e9a6b8d0",
  "semantic-link-5ad81499dd315e03",
  "semantic-link-68d25ff7a9aab316",
  "semantic-link-69879ea637dbe485",
  "semantic-link-78ab3d7dc4d1b021",
  "semantic-link-7d22120aeac05b4b",
  "semantic-link-7ed78b66aaf53f1b",
  "semantic-link-9f7f6cbdf78631e7",
  "semantic-link-aba6d5851ecf38aa",
  "semantic-link-b7a814f78ce12b9a",
  "semantic-link-bef1f6f71f094168",
  "semantic-link-f56e579b0a675499",
] as const;

const formerFailureLinkIds = [
  "semantic-link-019e1763599765f8",
  "semantic-link-18f26fbac4c12cf6",
  "semantic-link-21d5c4ae93164318",
  "semantic-link-4d73c6d5ac9263ca",
  "semantic-link-5ad81499dd315e03",
  "semantic-link-69879ea637dbe485",
  "semantic-link-b7a814f78ce12b9a",
  "semantic-link-f56e579b0a675499",
] as const;

const contentAdapterPath = fileURLToPath(
  new URL("./content-adapter.ts", import.meta.url),
);

const semanticTargetRoutes = [
  {
    sectionId: "v01-how-coherence-becomes-structure",
    path: "/manuscripts/1/seed-sprout-stem-and-soil/the-stem/",
  },
  {
    sectionId: "v01-the-flower",
    path: "/manuscripts/1/the-flower/chapter-start/",
  },
  {
    sectionId: "v01-the-human-being-reconsidered",
    path: "/manuscripts/1/seed-sprout-stem-and-soil/the-soil/",
  },
  {
    sectionId: "v01-when-scale-outruns-regulation",
    path: "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/",
  },
] as const;

const existingSemanticCatalogFragmentAddresses = [
  {
    sectionId: "v01-how-coherence-becomes-structure",
    path: "/manuscripts/1/seed-sprout-stem-and-soil/the-stem/",
    anchor: "v01-how-coherence-becomes-structure",
    href:
      "/manuscripts/1/seed-sprout-stem-and-soil/the-stem/#v01-how-coherence-becomes-structure",
    activeRouteName: "semantic-target",
    serverRendered: true,
  },
  {
    sectionId: "v01-the-human-being-reconsidered",
    path: "/manuscripts/1/seed-sprout-stem-and-soil/the-soil/",
    anchor: "v01-the-human-being-reconsidered",
    href:
      "/manuscripts/1/seed-sprout-stem-and-soil/the-soil/#v01-the-human-being-reconsidered",
    activeRouteName: "semantic-target",
    serverRendered: true,
  },
] as const;

function withSourceSection(
  source: CoherencePublisherContentAuthorities,
  sectionId: string,
  transform: (section: SectionContentInput) => SectionContentInput,
): CoherencePublisherContentAuthorities {
  let found = 0;
  const sourceWorks = source.sourceWorks.map((work) => ({
    ...work,
    sections: work.sections.map((section) => {
      if (section.id !== sectionId) return section;
      found += 1;
      return transform(section);
    }),
  }));
  if (found !== 1) {
    throw new Error(`fixture section '${sectionId}' has ${found} owners`);
  }
  return { ...source, sourceWorks };
}

let authorities: CoherencePublisherContentAuthorities;
let authoritiesSnapshot: CoherencePublisherContentAuthorities;
let rawChapterSectionIdAuthorityState: readonly Readonly<{
  reference: readonly string[];
  bytes: string;
  frozen: boolean;
  extensible: boolean;
}>[];
let proof: CoherencePublisherContentProof;

beforeAll(async () => {
  authorities = await loadCoherencePublisherContentAuthorities();
  authoritiesSnapshot = structuredClone(authorities);
  rawChapterSectionIdAuthorityState = authorities.rawCatalog.volumes.flatMap(
    (volume) =>
      volume.parts.flatMap((part) =>
        part.chapters.map((chapter) => ({
          reference: chapter.sectionIds,
          bytes: JSON.stringify(chapter.sectionIds),
          frozen: Object.isFrozen(chapter.sectionIds),
          extensible: Object.isExtensible(chapter.sectionIds),
        })),
      ),
  );
  proof = await adaptCoherencePublisherContent(authorities);
}, 30_000);

describe("Coherence Publisher content adapter proof", () => {
  it("preserves the exact current work, section, block, and provenance authority", () => {
    expect(proof.evidence.currentShape).toEqual({
      workCount: 9,
      sectionCount: 525,
      blockCount: 3_485,
      wordCount: 206_196,
      workIds: authorities.sourceWorks.map(({ workId }) => workId),
    });
    expect(proof.workInputs).toHaveLength(9);

    for (const [workIndex, sourceWork] of authorities.sourceWorks.entries()) {
      const adaptedWork = proof.workInputs[workIndex]!;
      expect(adaptedWork.adapter).toEqual({
        id: "coherence-content",
        package: "coherence-thesis",
        version: "0.1.0",
      });
      expect(adaptedWork.metrics).toBe(sourceWork.metrics);
      expect(adaptedWork.sections.map(({ id }) => id)).toEqual(
        sourceWork.sections.map(({ id }) => id),
      );
      for (const [sectionIndex, sourceSection] of sourceWork.sections.entries()) {
        const adaptedSection = adaptedWork.sections[sectionIndex]!;
        expect(adaptedSection.blocks).toBe(sourceSection.blocks);
        for (const [blockIndex, sourceBlock] of sourceSection.blocks.entries()) {
          const adaptedBlock = adaptedSection.blocks[blockIndex]!;
          expect(adaptedBlock).toBe(sourceBlock);
          expect(adaptedBlock.provenance).toBe(sourceBlock.provenance);
        }
      }
    }
  });

  it("closes the body and structural census without materializing unsafe sections", () => {
    const partition = proof.evidence.structuralPartition;
    expect(partition).toMatchObject({
      evidenceOnly: true,
      materialized: false,
      proposedStructuralSectionCount: 9,
      materializationSafe: false,
      bodyBlockCount: 2_547,
      bodyWordCount: 202_377,
      structuralBlockCount: 938,
      structuralWordCount: 3_819,
      structuralSourceRange: { before: 166, inside: 567, after: 205 },
      appendedSectionTraversalInversions: 193_898,
      partitionSha256:
        "sha256:eb67ed625d513ad22d22400349a502a1434349a2f98f33e103ac8a14cc89c0ba",
    });
    expect(partition.bodyBlockCount + partition.structuralBlockCount).toBe(
      3_485,
    );
    expect(partition.bodyWordCount + partition.structuralWordCount).toBe(
      206_196,
    );
    expect(
      partition.works.map(
        ({ workId, structuralBlockCount, appendedSectionTraversalInversions }) =>
          ({ workId, structuralBlockCount, appendedSectionTraversalInversions }),
      ),
    ).toEqual([
      {
        workId: "humanitys-most-viable-future",
        structuralBlockCount: 74,
        appendedSectionTraversalInversions: 12_043,
      },
      {
        workId: "wielding-intelligence",
        structuralBlockCount: 129,
        appendedSectionTraversalInversions: 32_727,
      },
      {
        workId: "providence-imperative",
        structuralBlockCount: 200,
        appendedSectionTraversalInversions: 58_944,
      },
      {
        workId: "architecting-providence",
        structuralBlockCount: 201,
        appendedSectionTraversalInversions: 55_440,
      },
      {
        workId: "purposeful",
        structuralBlockCount: 106,
        appendedSectionTraversalInversions: 15_760,
      },
      {
        workId: "smallest-nest",
        structuralBlockCount: 69,
        appendedSectionTraversalInversions: 6_915,
      },
      {
        workId: "presencing-genius",
        structuralBlockCount: 68,
        appendedSectionTraversalInversions: 7_341,
      },
      {
        workId: "misanthropic-artifice",
        structuralBlockCount: 61,
        appendedSectionTraversalInversions: 3_582,
      },
      {
        workId: "cardinal-scale",
        structuralBlockCount: 30,
        appendedSectionTraversalInversions: 1_146,
      },
    ]);
    expect(partition.reason).toMatch(/reorder manuscript traversal/u);
  });

  it("binds all catalog chapter owners and nested fragments", async () => {
    expect(proof.evidence.routes).toMatchObject({
      baselineActiveRouteCount: 535,
      finalActiveRouteCount: 583,
      redirectCount: 0,
      semanticTargetRouteCount: 4,
      semanticTargetRoutes,
      catalogChapterRootOwnerGroupCount: 46,
      catalogChapterRootOwnerChildCount: 107,
      catalogChapterRootOwnerWorkCount: 7,
      catalogChapterRootOwnerGroupsSha256:
        "sha256:6e4b2ffb9b6c1b130659a96be104d5e174b02e56286c16bc182fcadf64baacb2",
      catalogChapterRootOwnerIdsSha256:
        "sha256:8f586a30ae231f85a1103613bce6fa08baec55f510175015605d70a106857cbb",
      catalogChapterRootChildIdsSha256:
        "sha256:1c493c167d85bfdc507f1a0f061efbc7843a2af81bc185733440a7a32e9a3879",
      catalogChapterRootOwnerPathsSha256:
        "sha256:aa33821c6b83a0ce25b176762b8bb6c0b24081a79fde993cee17e4dcb270b652",
      catalogRootRouteAdditionCount: 44,
      catalogRootRouteAdditionsSha256:
        "sha256:9ac78c1a980f76a230e449b3a5e9760f2e52d2ea51ba366c7113b36f254edbe2",
      ownedCatalogFragmentAddressCount: 153,
      baselineAbsentReaderBasePathCount: 46,
      baselineCatalogReferencesOnAbsentBasePaths: 153,
      finalAbsentReaderBasePathCount: 0,
      finalCatalogReferencesOnAbsentBasePaths: 0,
      finalAbsentReaderBasePathsSha256:
        "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      baselineMissingReaderFragmentHrefCount: 153,
      baselineMissingReaderFragmentHrefsSha256:
        "sha256:0bd2f269c6654243115aee7d9dd69aa7a181c1636110d014622772ce3c5ddbdf",
      finalMissingReaderFragmentHrefCount: 0,
      finalMissingReaderFragmentHrefsSha256:
        "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      rawReaderBasePathClosuresSha256:
        "sha256:c1db755737d433feaccb13188187b9a454c4b0c34043882fb626a13729f9d47c",
      semanticAggregateOnlyTargets: [
        "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/",
        "/manuscripts/1/the-flower/chapter-start/",
      ],
      baseRoutePresence: true,
      currentCatalogFragmentCoverage: {
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
      aggregateChapterPageParity: false,
      nestedFragmentParity: false,
      durableFragmentParity: false,
      fullReaderRouteParity: false,
    });
    expect(proof.evidence.routes.rawReaderBasePathClosures).toHaveLength(46);
    expect(proof.reader.routes.active).toHaveLength(583);
    expect(proof.reader.routes.redirects).toEqual([]);
    expect(proof.search.entries).toHaveLength(525);
    expect(proof.progress.entries).toHaveLength(525);
    expect(proof.routePlan.staticParams).toHaveLength(583);
    expect(proof.application.staticParams).toHaveLength(582);
    expect(proof.evidence.projections).toMatchObject({
      searchEntryCount: 525,
      progressEntryCount: 525,
      routePlanStaticParamCount: 583,
      applicationStaticParamCount: 582,
      explicitRedirectCount: 0,
      canonicalSlashRedirectCount: 582,
      searchEntriesSha256:
        "sha256:e31c87a42d0b2d79ff2e39003bb6c93a8c349dc94d4189dc5cb7b3c1b25527ac",
      progressEntriesSha256:
        "sha256:585337e5def8be07c812e7b3b411bf47e16b4d87a0bf12c13b3fb36d2ff1ba60",
      routePlanActivePathsSha256:
        "sha256:f5b7153f31865536bf9d16fa5c213ec7ec1127b5996385cd4ef857ecbdc1d1c9",
      routePlanStaticParamsSha256:
        "sha256:d955ec4cb659d71ab9d2c2b6666caf12631b67dbe62821d006411d0f9fef4c92",
      applicationStaticParamsSha256:
        "sha256:2e769d1a703c19f7d5d1ba10bc9f849938adb83ab7d7c186fa0a386a71b24c1c",
      catalogChapterRootSlashProbesSha256:
        "sha256:eb60d67569e66114ff86ee11aa66572f6df460682da5367064ac3e4b0effa197",
    });
    expect(proof.evidence.projections.semanticSlashProbes).toEqual(
      semanticTargetRoutes.map(({ path }) => ({
        from: path.slice(0, -1),
        to: path,
        status: 308,
      })),
    );
    expect(proof.evidence.projections.catalogChapterRootSlashProbes).toEqual(
      proof.evidence.routes.catalogChapterRootOwnerGroups.map(({ path }) => ({
        from: path.slice(0, -1),
        to: path,
        status: 308,
      })),
    );
    const firstCatalogRootProbe =
      proof.evidence.projections.catalogChapterRootSlashProbes[0]!;
    const substitutedSlashResponse = await proof.application.handleRequest(
      new Request(
        `https://publisher.invalid${firstCatalogRootProbe.from}-drift?proof=catalog-root`,
      ),
    );
    expect(substitutedSlashResponse?.headers.get("location") ?? null).not.toBe(
      `https://publisher.invalid${firstCatalogRootProbe.to}?proof=catalog-root`,
    );
    const semanticCatalogFragmentAddresses =
      proof.evidence.routes.ownedCatalogFragmentAddresses.filter(
        ({ activeRouteName }) => activeRouteName === "semantic-target",
      );
    expect(semanticCatalogFragmentAddresses).toHaveLength(12);
    expect(
      semanticCatalogFragmentAddresses.filter(({ sectionId }) =>
        existingSemanticCatalogFragmentAddresses.some(
          ({ sectionId: ownerSectionId }) => ownerSectionId === sectionId,
        ),
      ),
    ).toEqual(existingSemanticCatalogFragmentAddresses);
    expect(
      proof.evidence.routes.ownedCatalogFragmentAddresses.filter(
        ({ activeRouteName }) => activeRouteName === "catalog-root",
      ),
    ).toHaveLength(141);
    for (const address of proof.evidence.routes.ownedCatalogFragmentAddresses) {
      const readerSection = proof.reader.works
        .flatMap(({ sections }) => sections)
        .find(({ id }) => id === address.sectionId);
      expect(readerSection?.readerAddress).toEqual({
        path: address.path,
        anchor: address.anchor,
      });
      expect(readerSection?.domId).toBe(address.anchor);
      expect(
        proof.search.entries.find(
          ({ sectionId }) => sectionId === address.sectionId,
        )?.href,
      ).toBe(address.href);
      expect(
        proof.progress.entries.find(({ id }) => id === address.sectionId)?.href,
      ).toBe(address.href);
    }

    const rawChaptersByHref = new Map(
      authorities.rawCatalog.volumes.flatMap((volume) =>
        volume.parts.flatMap((part) =>
          part.chapters.map((chapter) => [chapter.href, chapter] as const),
        ),
      ),
    );
    const readerSectionsById = new Map(
      proof.reader.works.flatMap((work) =>
        work.sections.map((section) => [section.id, section] as const),
      ),
    );
    for (const group of proof.evidence.routes.catalogChapterRootOwnerGroups) {
      const chapter = rawChaptersByHref.get(group.path);
      expect(chapter?.sectionIds).toEqual(group.catalogSectionIds);
      expect(group.catalogSectionIds).toEqual([
        group.sectionId,
        ...group.childIds,
      ]);
      const owner = readerSectionsById.get(group.sectionId);
      expect(owner).toMatchObject({
        role: "chapter",
        depth: 0,
        parentId: null,
        childIds: group.childIds,
        readerAddress: { path: group.path, anchor: group.anchor },
      });
      const activeOwnerRoutes = proof.reader.routes.active.filter(
        (route) => route.path === group.path,
      );
      expect(activeOwnerRoutes).toHaveLength(1);
      expect(activeOwnerRoutes[0]?.target).toMatchObject({
        kind: "section",
        sectionId: group.sectionId,
      });
      for (const childId of group.childIds) {
        const child = readerSectionsById.get(childId);
        expect(child).toMatchObject({
          role: "section",
          depth: 1,
          parentId: group.sectionId,
          childIds: [],
        });
        expect(child?.routes).toHaveProperty("catalog-fragment", {
          path: group.path,
          anchor: childId,
        });
        expect(child?.readerAddress).toEqual({
          path: group.path,
          anchor: childId,
        });
      }
    }

    let order = 0;
    const readerTraversal = proof.reader.works.flatMap((work) =>
      work.sections.flatMap((section) => {
        if (!section.navigable) return [];
        if (section.readerAddress === null) {
          throw new Error(`navigable fixture '${section.id}' has no address`);
        }
        const row = {
          workId: work.id,
          sectionId: section.id,
          continuityId: section.continuity.id,
          href:
            section.readerAddress.anchor === undefined
              ? section.readerAddress.path
              : `${section.readerAddress.path}#${section.readerAddress.anchor}`,
          order,
          contentHash: section.contentHash,
          wordCount: section.wordCount,
        };
        order += 1;
        return [row];
      }),
    );
    expect(
      proof.search.entries.map(
        ({
          workId,
          sectionId,
          continuityId,
          href,
          order,
          contentHash,
          wordCount,
        }) => ({
          workId,
          sectionId,
          continuityId,
          href,
          order,
          contentHash,
          wordCount,
        }),
      ),
    ).toEqual(readerTraversal);
    expect(
      proof.progress.entries.map(
        ({ workId, id, continuity, href, order, contentHash, wordCount }) => ({
          workId,
          sectionId: id,
          continuityId: continuity.id,
          href,
          order,
          contentHash,
          wordCount,
        }),
      ),
    ).toEqual(readerTraversal);

    const activePaths = proof.reader.routes.active.map(({ path }) => path);
    const expectedStaticParams = activePaths.map((path) =>
      path === "/"
        ? {}
        : {
            segments: path
              .slice(1, path.endsWith("/") ? -1 : undefined)
              .split("/")
              .map(decodeURIComponent),
          },
    );
    expect(activePaths[0]).toBe("/");
    expect(proof.routePlan.activePaths).toEqual(activePaths);
    expect(proof.routePlan.staticParams).toEqual(expectedStaticParams);
    expect(proof.application.staticParams).toEqual(
      expectedStaticParams.slice(1),
    );
  });

  it("includes and applies the complete approved overlay through the real work page", () => {
    const overlay = proof.evidence.semanticOverlay;
    expect(overlay).toMatchObject({
      policy: "include-all-approved",
      includedAsCompleteSet: true,
      approvedLinkCount: 21,
      lowerCompiledLinkCount: 21,
      lowerProjectedLinkCount: 21,
      individuallyApplicableLinkCount: 21,
      groupedApplicableLinkCount: 21,
      linkIds: approvedLinkIds,
      blockGroupCount: 17,
      groupedApplicationSha256:
        "sha256:5a127f598bc52d74d949ad94bdb084173cff9717ac135b68b7b34a93542ec851",
      applicationAssembled: true,
      sourceWorkPageWorkId: "humanitys-most-viable-future",
      sourceWorkPagePath: "/manuscripts/1/",
      sourceWorkPageRendered: true,
      sourceWorkPageLinkCount: 21,
      sourceWorkPageLinkIds: approvedLinkIds,
      sourceWorkPageLinkIdsSha256:
        "sha256:2d09df8f5d9a37e7f52d9db3a2e796012e9ca91e27ad00197362b0d0e0e002f0",
      sourceWorkPageRenderedBlockGroupCount: 17,
      sourceWorkPageRenderedAnchorCount: 21,
      sourceWorkPageRenderedAnchorsSha256:
        "sha256:bf506ae10d7a118dbb9f33573344f8ed5780541619e0bf41325951511008b810",
    });
    expect(proof.content.links.map(({ id }) => id).sort()).toEqual(
      approvedLinkIds,
    );
    expect(proof.reader.links.map(({ id }) => id).sort()).toEqual(
      approvedLinkIds,
    );
    expect(proof.application.reader.buildId).toBe(proof.reader.buildId);
    expect(proof.application.reader.links.map(({ id }) => id).sort()).toEqual(
      approvedLinkIds,
    );
    expect(
      formerFailureLinkIds.every((id) => overlay.linkIds.includes(id)),
    ).toBe(true);

    const linksByBlock = new Map<string, typeof proof.reader.links>();
    for (const link of proof.reader.links) {
      if (link.source.kind !== "block-markdown") {
        throw new Error(`fixture link '${link.id}' is not block Markdown`);
      }
      const key = `${link.source.workId}\u0000${link.source.sectionId}\u0000${link.source.blockId}`;
      linksByBlock.set(key, [...(linksByBlock.get(key) ?? []), link]);
    }
    const traversalGroups = proof.reader.works.flatMap((work) =>
      work.sections.flatMap((section) =>
        section.blocks.flatMap((block) => {
          const key = `${work.id}\u0000${section.id}\u0000${block.id}`;
          const links = linksByBlock.get(key);
          if (links === undefined) return [];
          return [{
            workId: work.id,
            sectionId: section.id,
            blockId: block.id,
            linkIds: [...links]
              .sort(
                (left, right) =>
                  left.source.kind === "block-markdown" &&
                  right.source.kind === "block-markdown"
                    ? left.source.range.start - right.source.range.start ||
                      left.source.range.end - right.source.range.end ||
                      left.id.localeCompare(right.id)
                    : 0,
              )
              .map(({ id }) => id),
          }];
        }),
      ),
    );
    expect(overlay.blockGroups).toEqual(traversalGroups);
  }, 30_000);

  it("produces deterministic closed evidence", async () => {
    const repeated = await adaptCoherencePublisherContent(authorities);
    expect(authorities).toEqual(authoritiesSnapshot);
    const currentRawChapterSectionIdArrays =
      authorities.rawCatalog.volumes.flatMap((volume) =>
        volume.parts.flatMap((part) =>
          part.chapters.map((chapter) => chapter.sectionIds),
        ),
      );
    expect(currentRawChapterSectionIdArrays).toHaveLength(
      rawChapterSectionIdAuthorityState.length,
    );
    rawChapterSectionIdAuthorityState.forEach((before, index) => {
      const current = currentRawChapterSectionIdArrays[index]!;
      expect(current).toBe(before.reference);
      expect(JSON.stringify(current)).toBe(before.bytes);
      expect(Object.isFrozen(current)).toBe(before.frozen);
      expect(Object.isExtensible(current)).toBe(before.extensible);
    });
    expect(repeated.evidence).toEqual(proof.evidence);
    expect(repeated.evidence.evidenceSha256).toBe(
      "sha256:fc04a15ec1dfd1d09403ba3a1c08b3650da80c873163097e88a30ff6355f3754",
    );
    expect(repeated.evidence.identities).toMatchObject({
      finalContentBuildId:
        "sha256:b42cba83df2eafa74b22409d61866f385093708c5f52ff0f61724eaf099eb55f",
      finalReaderBuildId:
        "sha256:45d83dd7c928c4d080432a630209763ac1f69f774bd5c6bfff1908ded308f52d",
      finalApplicationBuildId:
        "sha256:a49b30ca004288191e86f90b6f8f0f5bb2818c7cdbab3cb9f02290058ec63da8",
      adaptedWorkInputsSha256:
        "sha256:a5e83e3d7d162ff792e132088a405904e13c0629682fa9afa0697cf7f99d6a22",
      semanticLinkInputsSha256:
        "sha256:a107111eb168ed8e9069c1f494016a64facc9132d515cd7033a0718225d5479f",
      semanticRegistrySha256:
        "sha256:1ee06a681efbc9f35fc8f2adce60b25a2b1dbf0a44f881510140e9e0a4f9a2ce",
      rawCatalogSha256:
        "sha256:c58b46b6bd743456a56e3075333d9dde007e3ef8da1b3f0ef1df02fe2b031305",
      preparedCatalogSha256:
        "sha256:f18633aad1930850d1530877e21999badecfde31a54ac06bd3db1ea852efa751",
      inputAuthoritiesSha256:
        "sha256:ad22fedc42ee4d99ca69fcda6c2668e09472ff49e82247b85ec16b98b6410f48",
    });
    expect(Object.isFrozen(repeated.evidence)).toBe(true);
  }, 30_000);

  it("rejects section reordering and incomplete or altered overlay membership", async () => {
    const firstWork = authorities.sourceWorks[0]!;
    const reordered: CoherencePublisherContentAuthorities = {
      ...authorities,
      sourceWorks: [
        {
          ...firstWork,
          sections: [
            firstWork.sections[1]!,
            firstWork.sections[0]!,
            ...firstWork.sections.slice(2),
          ],
        },
        ...authorities.sourceWorks.slice(1),
      ],
    };
    await expect(
      adaptCoherencePublisherContent(reordered),
    ).rejects.toThrow(/source section order/u);
    const approvedPolicyIds = authorities.semanticLinkPolicy.approvedLinkIds;
    for (const approvedLinkIds of [
      approvedPolicyIds.slice(1),
      ["semantic-link-altered", ...approvedPolicyIds.slice(1)],
    ]) {
      await expect(
        adaptCoherencePublisherContent({
          ...authorities,
          semanticLinkPolicy: {
            mode: "include-all-approved",
            approvedLinkIds,
          },
        }),
      ).rejects.toThrow(/complete approved semantic overlay policy/u);
    }
  }, 30_000);

  it("rejects catalog owner role, parent, anchor, and route collisions", async () => {
    await expect(
      adaptCoherencePublisherContent(
        withSourceSection(
          authorities,
          "v01-the-limits-of-the-claim",
          (section) => ({ ...section, role: "section" }),
        ),
      ),
    ).rejects.toThrow(/depth-zero chapter owner count/u);

    await expect(
      adaptCoherencePublisherContent(
        withSourceSection(authorities, "v01-reductionism", (section) => ({
          ...section,
          parentId: "v01-orientation",
        })),
      ),
    ).rejects.toThrow(/catalog root child order/u);

    await expect(
      adaptCoherencePublisherContent(
        withSourceSection(
          authorities,
          "v01-the-limits-of-the-claim",
          (section) => ({
            ...section,
            routes: {
              ...(section.routes ?? {}),
              "catalog-fragment": {
                path:
                  "/manuscripts/1/seed-sprout-stem-and-soil/the-limits-of-the-claim/",
                anchor: "wrong-owner-anchor",
              },
            },
          }),
        ),
      ),
    ).rejects.toThrow(/base_route_unresolved|already owns 'catalog-fragment'/u);

    await expect(
      adaptCoherencePublisherContent(
        withSourceSection(
          authorities,
          "v01-the-limits-of-the-claim",
          (section) => ({
            ...section,
            routes: {
              ...(section.routes ?? {}),
              "catalog-root": { path: "/unrelated-catalog-root/" },
            },
          }),
        ),
      ),
    ).rejects.toThrow(/unanchored_owner_mismatch|already owns 'catalog-root'/u);

    await expect(
      adaptCoherencePublisherContent(
        withSourceSection(authorities, "v01-reductionism", (section) => ({
          ...section,
          routes: {
            ...(section.routes ?? {}),
            "different-owner": {
              path:
                "/manuscripts/1/seed-sprout-stem-and-soil/the-limits-of-the-claim/",
            },
          },
          activeRouteNames: [
            ...(section.activeRouteNames ?? []),
            "different-owner",
          ],
        })),
      ),
    ).rejects.toThrow(/baseline active route count/u);
  }, 30_000);

  it("rejects coordinated raw chapter href and section order drift", async () => {
    const hrefDrift = structuredClone(authorities.rawCatalog);
    const sourcePath =
      "/manuscripts/1/seed-sprout-stem-and-soil/the-limits-of-the-claim/";
    const driftedPath =
      "/manuscripts/1/seed-sprout-stem-and-soil/the-limits-of-the-claim-drift/";
    const chapter = hrefDrift.volumes
      .flatMap((volume) => volume.parts)
      .flatMap((part) => part.chapters)
      .find(({ href }) => href === sourcePath);
    if (chapter === undefined) throw new Error("chapter href fixture is absent");
    chapter.href = driftedPath;
    hrefDrift.sections = hrefDrift.sections.map((section) => ({
      ...section,
      readerHref: section.readerHref.startsWith(sourcePath)
        ? section.readerHref.replace(sourcePath, driftedPath)
        : section.readerHref,
    }));
    await expect(
      adaptCoherencePublisherContent({
        ...authorities,
        rawCatalog: hrefDrift,
      }),
    ).rejects.toThrow(/raw catalog authority identity/u);

    const orderDrift = structuredClone(authorities.rawCatalog);
    const orderedChapter = orderDrift.volumes
      .flatMap((volume) => volume.parts)
      .flatMap((part) => part.chapters)
      .find(({ href }) => href === sourcePath);
    if (orderedChapter === undefined || orderedChapter.sectionIds.length < 3) {
      throw new Error("chapter order fixture is incomplete");
    }
    [orderedChapter.sectionIds[1], orderedChapter.sectionIds[2]] = [
      orderedChapter.sectionIds[2]!,
      orderedChapter.sectionIds[1]!,
    ];
    await expect(
      adaptCoherencePublisherContent({
        ...authorities,
        rawCatalog: orderDrift,
      }),
    ).rejects.toThrow(/raw catalog authority identity/u);
  }, 30_000);

  it("rejects block source-range and catalog authority drift", async () => {
    const sourceWork = authorities.sourceWorks[0]!;
    const sourceSection = sourceWork.sections[0]!;
    const sourceBlock = sourceSection.blocks[0]!;
    const sourceRangeDrift: CoherencePublisherContentAuthorities = {
      ...authorities,
      sourceWorks: [
        {
          ...sourceWork,
          sections: [
            {
              ...sourceSection,
              blocks: [
                {
                  ...sourceBlock,
                  provenance: {
                    ...sourceBlock.provenance,
                    startOffset: sourceBlock.provenance.startOffset + 1,
                  },
                },
                ...sourceSection.blocks.slice(1),
              ],
            },
            ...sourceWork.sections.slice(1),
          ],
        },
        ...authorities.sourceWorks.slice(1),
      ],
    };
    await expect(
      adaptCoherencePublisherContent(sourceRangeDrift),
    ).rejects.toThrow(/source bytes|lower content compilation/u);

    const firstCatalogSection = authorities.rawCatalog.sections[0]!;
    const catalogRangeDrift: CoherencePublisherContentAuthorities = {
      ...authorities,
      rawCatalog: {
        ...authorities.rawCatalog,
        sections: [
          { ...firstCatalogSection, sourceLineNumbers: [] },
          ...authorities.rawCatalog.sections.slice(1),
        ],
      },
    };
    await expect(
      adaptCoherencePublisherContent(catalogRangeDrift),
    ).rejects.toThrow(/raw catalog authority identity/u);

    await expect(
      adaptCoherencePublisherContent({
        ...authorities,
        rawCatalog: {
          ...authorities.rawCatalog,
          gitRevision: "0000000",
        },
      }),
    ).rejects.toThrow(/raw catalog Git revision/u);
    await expect(
      adaptCoherencePublisherContent({
        ...authorities,
        preparedCatalog: {
          ...authorities.preparedCatalog,
          gitRevision: "0000000",
        },
      }),
    ).rejects.toThrow(/prepared catalog Git revision/u);
  }, 30_000);

  it("binds semantic registry membership order into evidence and its reviewed baseline", async () => {
    const semanticRegistry = structuredClone(authorities.semanticRegistry);
    semanticRegistry.concepts.reverse();
    const currentRegistryHash = hashCanonicalJson(
      authorities.semanticRegistry as unknown as JSONValue,
    );
    const reversedRegistryHash = hashCanonicalJson(
      semanticRegistry as unknown as JSONValue,
    );
    expect(currentRegistryHash).toBe(
      proof.evidence.identities.semanticRegistrySha256,
    );
    expect(reversedRegistryHash).not.toBe(currentRegistryHash);
    const { evidenceSha256, ...evidenceWithoutHash } = proof.evidence;
    expect(hashCanonicalJson(evidenceWithoutHash as unknown as JSONValue)).toBe(
      evidenceSha256,
    );
    const reorderedEvidenceHash = hashCanonicalJson({
      ...evidenceWithoutHash,
      identities: {
        ...evidenceWithoutHash.identities,
        semanticRegistrySha256: reversedRegistryHash,
      },
    } as unknown as JSONValue);
    expect(reorderedEvidenceHash).not.toBe(evidenceSha256);

    const preparedSections = applySemanticReferences({
      sections: authorities.rawCatalog.sections,
      volumes: authorities.rawCatalog.volumes,
      registry: semanticRegistry,
    });
    const registryOrderDrift: CoherencePublisherContentAuthorities = {
      ...authorities,
      semanticRegistry,
      preparedCatalog: {
        ...authorities.preparedCatalog,
        sections: preparedSections,
      },
    };
    await expect(
      adaptCoherencePublisherContent(registryOrderDrift),
    ).rejects.toThrow(/semantic registry authority identity/u);
  });

  it("binds raw and prepared catalog membership order into the reviewed baseline", async () => {
    const rawCatalogOrderDrift: CoherencePublisherContentAuthorities = {
      ...authorities,
      rawCatalog: {
        ...authorities.rawCatalog,
        aliases: [...authorities.rawCatalog.aliases].reverse(),
      },
    };
    await expect(
      adaptCoherencePublisherContent(rawCatalogOrderDrift),
    ).rejects.toThrow(/raw catalog authority identity/u);

    const preparedCatalogOrderDrift: CoherencePublisherContentAuthorities = {
      ...authorities,
      preparedCatalog: {
        ...authorities.preparedCatalog,
        aliases: [...authorities.preparedCatalog.aliases].reverse(),
      },
    };
    await expect(
      adaptCoherencePublisherContent(preparedCatalogOrderDrift),
    ).rejects.toThrow(/prepared catalog authority identity/u);
  });

  it("provides one guarded import-safe CLI summary", () => {
    const imported = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `await import(${JSON.stringify(pathToFileURL(contentAdapterPath).href)})`,
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
    );
    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe("");
    expect(imported.stderr).toBe("");

    const cli = spawnSync(
      process.execPath,
      ["--import", "tsx", contentAdapterPath],
      { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
    );
    expect(cli.status).toBe(0);
    expect(cli.stderr).toBe("");
    expect(cli.stdout).not.toContain(process.cwd());
    expect(JSON.parse(cli.stdout)).toEqual({
      schemaVersion: 2,
      status: "verified",
      proofKind: "coherence-content-lower-api-proof",
      proofSchemaVersion: 2,
      evidenceSha256:
        "sha256:fc04a15ec1dfd1d09403ba3a1c08b3650da80c873163097e88a30ff6355f3754",
      builds: {
        content:
          "sha256:b42cba83df2eafa74b22409d61866f385093708c5f52ff0f61724eaf099eb55f",
        reader:
          "sha256:45d83dd7c928c4d080432a630209763ac1f69f774bd5c6bfff1908ded308f52d",
        application:
          "sha256:a49b30ca004288191e86f90b6f8f0f5bb2818c7cdbab3cb9f02290058ec63da8",
      },
      counts: {
        works: 9,
        sections: 525,
        blocks: 3_485,
        words: 206_196,
        semanticLinks: 21,
        semanticLinkBlockGroups: 17,
        searchEntries: 525,
        progressEntries: 525,
        activeRoutes: 583,
        routePlanStaticParams: 583,
        applicationStaticParams: 582,
      },
      routeGap: {
        absentBasePaths: 0,
        catalogReferencesOnAbsentBasePaths: 0,
        missingReaderFragmentHrefs: 0,
        baseRoutePresence: true,
        currentCatalogFragmentCoverage:
          proof.evidence.routes.currentCatalogFragmentCoverage,
        aggregateChapterPageParity: false,
        nestedFragmentParity: false,
        durableFragmentParity: false,
        fullReaderRouteParity: false,
      },
      integration: proof.evidence.integration,
    });

    const refused = spawnSync(
      process.execPath,
      ["--import", "tsx", contentAdapterPath, "unexpected"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
    );
    expect(refused.status).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toContain("Usage: content-adapter.ts");
  }, 45_000);
});
