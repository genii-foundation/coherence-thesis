import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { hashCanonicalJson } from "@genii-foundation/publisher-content";
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

const ownedCatalogFragmentAddresses = [
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

let authorities: CoherencePublisherContentAuthorities;
let authoritiesSnapshot: CoherencePublisherContentAuthorities;
let proof: CoherencePublisherContentProof;

beforeAll(async () => {
  authorities = await loadCoherencePublisherContentAuthorities();
  authoritiesSnapshot = structuredClone(authorities);
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

  it("binds two same-owner catalog fragments without changing active routes", () => {
    expect(proof.evidence.routes).toMatchObject({
      baselineActiveRouteCount: 535,
      finalActiveRouteCount: 539,
      redirectCount: 0,
      semanticTargetRouteCount: 4,
      semanticTargetRoutes,
      ownedCatalogFragmentAddressCount: 2,
      ownedCatalogFragmentAddresses,
      baselineAbsentReaderBasePathCount: 46,
      baselineCatalogReferencesOnAbsentBasePaths: 153,
      finalAbsentReaderBasePathCount: 44,
      finalCatalogReferencesOnAbsentBasePaths: 141,
      baselineMissingReaderFragmentHrefCount: 153,
      baselineMissingReaderFragmentHrefsSha256:
        "sha256:0bd2f269c6654243115aee7d9dd69aa7a181c1636110d014622772ce3c5ddbdf",
      finalMissingReaderFragmentHrefCount: 151,
      finalMissingReaderFragmentHrefsSha256:
        "sha256:3c49f87a48fa8c4330348803b2eb10824880d3defae414cc73beae6f77c80229",
      rawReaderBasePathClosures: [
        {
          path: "/manuscripts/1/seed-sprout-stem-and-soil/the-soil/",
          catalogReferenceCount: 6,
        },
        {
          path: "/manuscripts/1/seed-sprout-stem-and-soil/the-stem/",
          catalogReferenceCount: 6,
        },
      ],
      semanticAggregateOnlyTargets: [
        "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/",
        "/manuscripts/1/the-flower/chapter-start/",
      ],
      fullReaderRouteParity: false,
    });
    expect(proof.reader.routes.active).toHaveLength(539);
    expect(proof.reader.routes.redirects).toEqual([]);
    expect(proof.search.entries).toHaveLength(525);
    expect(proof.progress.entries).toHaveLength(525);
    expect(proof.routePlan.staticParams).toHaveLength(539);
    expect(proof.application.staticParams).toHaveLength(538);
    expect(proof.evidence.projections).toMatchObject({
      searchEntryCount: 525,
      progressEntryCount: 525,
      routePlanStaticParamCount: 539,
      applicationStaticParamCount: 538,
      explicitRedirectCount: 0,
      canonicalSlashRedirectCount: 538,
      searchEntriesSha256:
        "sha256:53617690948a480b436a133e69497f706a7d06fb39cb29c9a9d54d6039733b8c",
      progressEntriesSha256:
        "sha256:1020434746ce53301d957cfcb508f1db0f83a315d11e9ada1bd058fc385d9738",
      routePlanActivePathsSha256:
        "sha256:1dc898436d2d1fcdc977ec537dbc35f27fba958316e9661237cc760efe6422ae",
      routePlanStaticParamsSha256:
        "sha256:a6d3698ec9a0ffae5a4e06966cd2b22894cc07fd2c7f654015bab9df1d56e5f8",
      applicationStaticParamsSha256:
        "sha256:025b71d4ad8ad78eadbe5c39e64423ad97b2e7959a1eb5719fc36adcf28af53b",
    });
    expect(proof.evidence.projections.semanticSlashProbes).toEqual(
      semanticTargetRoutes.map(({ path }) => ({
        from: path.slice(0, -1),
        to: path,
        status: 308,
      })),
    );
    for (const address of ownedCatalogFragmentAddresses) {
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
    expect(repeated.evidence).toEqual(proof.evidence);
    expect(repeated.evidence.evidenceSha256).toBe(
      "sha256:cf3a0da4dfe103353287262a6e27a0be5631f1ff8ceb4b859105f75948588ed4",
    );
    expect(repeated.evidence.identities).toMatchObject({
      finalContentBuildId:
        "sha256:8304c155b3958cf86e9dd67403edf47eb0375d4c2cffc9d3901415452e5ef068",
      finalReaderBuildId:
        "sha256:68bfb9da9dc5aa6ffdce273307f15551978d0064870c31a51674b4f6ff39abf2",
      finalApplicationBuildId:
        "sha256:2e0f745a190e2d9652685d919de50ffcabd1af0ee141b0e277d18d1707fcbdc8",
      adaptedWorkInputsSha256:
        "sha256:9d76cb279d410d4abeb18514f82c37d1e95f98f7b46eb85720e909425207d48d",
      semanticLinkInputsSha256:
        "sha256:a107111eb168ed8e9069c1f494016a64facc9132d515cd7033a0718225d5479f",
      semanticRegistrySha256:
        "sha256:1ee06a681efbc9f35fc8f2adce60b25a2b1dbf0a44f881510140e9e0a4f9a2ce",
      rawCatalogSha256:
        "sha256:c58b46b6bd743456a56e3075333d9dde007e3ef8da1b3f0ef1df02fe2b031305",
      preparedCatalogSha256:
        "sha256:f18633aad1930850d1530877e21999badecfde31a54ac06bd3db1ea852efa751",
      inputAuthoritiesSha256:
        "sha256:6a76ef13692075448e8632ce6ba9cd08c32ac7384c802352d7472ced8d6916fd",
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
        "sha256:cf3a0da4dfe103353287262a6e27a0be5631f1ff8ceb4b859105f75948588ed4",
      builds: {
        content:
          "sha256:8304c155b3958cf86e9dd67403edf47eb0375d4c2cffc9d3901415452e5ef068",
        reader:
          "sha256:68bfb9da9dc5aa6ffdce273307f15551978d0064870c31a51674b4f6ff39abf2",
        application:
          "sha256:2e0f745a190e2d9652685d919de50ffcabd1af0ee141b0e277d18d1707fcbdc8",
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
        activeRoutes: 539,
        routePlanStaticParams: 539,
        applicationStaticParams: 538,
      },
      routeGap: {
        absentBasePaths: 44,
        catalogReferencesOnAbsentBasePaths: 141,
        missingReaderFragmentHrefs: 151,
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
