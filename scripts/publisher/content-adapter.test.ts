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

const compatibleLinkIds = [
  "semantic-link-0190441f5eaa1fae",
  "semantic-link-1a89228a862b8014",
  "semantic-link-338214982d55da40",
  "semantic-link-42e376773a037c6f",
  "semantic-link-43785c725c40e8e2",
  "semantic-link-53c627f0e9a6b8d0",
  "semantic-link-68d25ff7a9aab316",
  "semantic-link-78ab3d7dc4d1b021",
  "semantic-link-7d22120aeac05b4b",
  "semantic-link-7ed78b66aaf53f1b",
  "semantic-link-9f7f6cbdf78631e7",
  "semantic-link-aba6d5851ecf38aa",
  "semantic-link-bef1f6f71f094168",
] as const;

const rejectedLinkIds = [
  "semantic-link-019e1763599765f8",
  "semantic-link-18f26fbac4c12cf6",
  "semantic-link-21d5c4ae93164318",
  "semantic-link-4d73c6d5ac9263ca",
  "semantic-link-5ad81499dd315e03",
  "semantic-link-69879ea637dbe485",
  "semantic-link-b7a814f78ce12b9a",
  "semantic-link-f56e579b0a675499",
] as const;

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

  it("derives only the four semantic target routes and retains the route gap", () => {
    expect(proof.evidence.routes).toMatchObject({
      baselineActiveRouteCount: 535,
      finalActiveRouteCount: 539,
      redirectCount: 0,
      semanticTargetRouteCount: 4,
      semanticTargetRoutes,
      baselineAbsentReaderBasePathCount: 46,
      baselineAbsentReaderSectionCount: 153,
      finalAbsentReaderBasePathCount: 44,
      finalAbsentReaderSectionCount: 141,
      rawReaderBaseClosures: [
        {
          path: "/manuscripts/1/seed-sprout-stem-and-soil/the-soil/",
          sectionCount: 6,
        },
        {
          path: "/manuscripts/1/seed-sprout-stem-and-soil/the-stem/",
          sectionCount: 6,
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
        "sha256:b20ac27eded79bf0e5c8aa22cccda12da1701a973de69bbe03fd1a29b7123f8f",
      progressEntriesSha256:
        "sha256:6dc9bd0f92534779bb83d45c7412330a673d2c48c577f1f128e2361e2189c96b",
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
          href: section.readerAddress.path,
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

  it("proves all twenty-one lower links and omits the atomic overlay from the application", () => {
    const overlay = proof.evidence.semanticOverlay;
    expect(overlay).toMatchObject({
      policy: "omit-all-approved",
      approvedLinkCount: 21,
      lowerCompiledLinkCount: 21,
      lowerProjectedLinkCount: 21,
      rendererCompatibleLinkCount: 13,
      rendererCompatibleLinkIds: compatibleLinkIds,
      rejectedLinkCount: 8,
      rejectedLinkIds,
      rejectedBlockCount: 7,
      rejectionDiagnosticCode: "reader.markdown.link_formatting_partial",
      applicationDiagnosticCode: "next.markdown.reader_link_unrepresentable",
      applicationDiagnosticBlockCount: 7,
      applicationDiagnosticBoundLinkCount: 10,
      applicationDiagnosticBoundLinkIds: [
        "semantic-link-019e1763599765f8",
        "semantic-link-18f26fbac4c12cf6",
        "semantic-link-21d5c4ae93164318",
        "semantic-link-4d73c6d5ac9263ca",
        "semantic-link-5ad81499dd315e03",
        "semantic-link-69879ea637dbe485",
        "semantic-link-78ab3d7dc4d1b021",
        "semantic-link-7d22120aeac05b4b",
        "semantic-link-b7a814f78ce12b9a",
        "semantic-link-f56e579b0a675499",
      ],
      applicationDiagnosticGroupsSha256:
        "sha256:5e9761b49edb14164ba8012bd914550249f8c7ebda138456cad8111025e840bc",
      finalCompilerLinkCount: 0,
      finalReaderLinkCount: 0,
      omittedAsCompleteSet: true,
    });
    expect(overlay.atomicOmissionRationale).toMatch(
      /Thirteen approved links are technically renderer-compatible/u,
    );
    expect(
      overlay.applicationDiagnosticGroups.map(
        ({
          sectionId,
          blockId,
          diagnosticBoundLinkIds,
          rootCauseIncompatibleLinkIds,
        }) => [
          sectionId,
          blockId,
          diagnosticBoundLinkIds,
          rootCauseIncompatibleLinkIds,
        ],
      ),
    ).toEqual([
      [
        "v01-four-movements",
        "markdown-block-3520b92c95cab831e5126c78ef86160da50cc07a75407d595b3dad1e00c0825b",
        ["semantic-link-f56e579b0a675499"],
        ["semantic-link-f56e579b0a675499"],
      ],
      [
        "v01-four-movements",
        "markdown-block-b0494b7d6dcd220e4c3b2acce6a79d570bccfce9a4e628f4210a46a154887b8a",
        ["semantic-link-5ad81499dd315e03"],
        ["semantic-link-5ad81499dd315e03"],
      ],
      [
        "v01-four-movements",
        "markdown-block-ce01bf7a6c7d1a89bb73d87c611fd5317ecc0886ee801227b90b21e5d7126bb2",
        ["semantic-link-21d5c4ae93164318"],
        ["semantic-link-21d5c4ae93164318"],
      ],
      [
        "v01-how-understanding-takes-root",
        "markdown-block-15d3cfc51b0c9d54371f760a0befff886c36e62cee07297d3817ff8a84cee309",
        ["semantic-link-b7a814f78ce12b9a"],
        ["semantic-link-b7a814f78ce12b9a"],
      ],
      [
        "v01-icons-and-the-cardinal-scale",
        "markdown-block-ef6ea2aee0022391ea56b7e3f7532117f3648b75096dd468f875f25c17e47d2b",
        [
          "semantic-link-4d73c6d5ac9263ca",
          "semantic-link-7d22120aeac05b4b",
        ],
        ["semantic-link-4d73c6d5ac9263ca"],
      ],
      [
        "v01-into-the-flower",
        "markdown-block-01aee46374d52fcfcd0fcf4e5949c0d02d590d033cdf928937e76610332ad3b2",
        [
          "semantic-link-69879ea637dbe485",
          "semantic-link-78ab3d7dc4d1b021",
        ],
        ["semantic-link-69879ea637dbe485"],
      ],
      [
        "v01-the-horizon-before-the-blueprint",
        "markdown-block-43a276ec9d4cc88936ac3d8372d763e84df9c19e49d44fcccc7cbe18aba90e6a",
        [
          "semantic-link-019e1763599765f8",
          "semantic-link-18f26fbac4c12cf6",
        ],
        [
          "semantic-link-019e1763599765f8",
          "semantic-link-18f26fbac4c12cf6",
        ],
      ],
    ]);
    for (const group of overlay.applicationDiagnosticGroups) {
      expect(group.workId).toBe("humanitys-most-viable-future");
      expect(group.readerDiagnosticCodes).toEqual(
        group.rootCauseIncompatibleLinkIds.map(
          () => "reader.markdown.link_formatting_partial",
        ),
      );
    }
    expect(proof.content.links).toEqual([]);
    expect(proof.reader.links).toEqual([]);
    expect(proof.application.reader.buildId).toBe(proof.reader.buildId);
  });

  it("produces deterministic closed evidence", async () => {
    const repeated = await adaptCoherencePublisherContent(authorities);
    expect(authorities).toEqual(authoritiesSnapshot);
    expect(repeated.evidence).toEqual(proof.evidence);
    expect(repeated.evidence.evidenceSha256).toBe(
      "sha256:467ad35321ae1f2f292f4da401eefd170c53b56037776ef6193672c9c7611b8b",
    );
    expect(repeated.evidence.identities).toMatchObject({
      semanticRegistrySha256:
        "sha256:1ee06a681efbc9f35fc8f2adce60b25a2b1dbf0a44f881510140e9e0a4f9a2ce",
      rawCatalogSha256:
        "sha256:ca8bc412bdb2ca6e5acc53fcf0778d3db9e644d96914935b1583da7a2073d9b3",
      preparedCatalogSha256:
        "sha256:3090d0feb20c944e608f1807df91a0f897c283c785715c1352e9638a65d4e861",
    });
    expect(Object.isFrozen(repeated.evidence)).toBe(true);
  }, 30_000);

  it("rejects section reordering and any partial semantic overlay policy", async () => {
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
    await expect(
      adaptCoherencePublisherContent({
        ...authorities,
        semanticLinkPolicy: { mode: "include-compatible-only" } as never,
      }),
    ).rejects.toThrow(/must omit the complete approved overlay set/u);
  });

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
});
