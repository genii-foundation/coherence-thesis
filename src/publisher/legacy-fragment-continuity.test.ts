import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";
import { describe, expect, it } from "vitest";

import {
  createCoherencePublisherLegacyFragmentModel,
  resolveCoherencePublisherLegacyFragment,
  type CoherencePublisherLegacyFragmentModel,
} from "./legacy-fragment-continuity";
import type { CoherenceReaderStateMigrationArtifact } from "./reader-state-migration-schema";

const sectionHash = `sha256:${"a".repeat(64)}`;
const blockHash = `sha256:${"b".repeat(64)}`;
const readerBuildId = `sha256:${"c".repeat(64)}`;
const migrationBuildId = `sha256:${"d".repeat(64)}`;
const descendantSectionHash = `sha256:${"e".repeat(64)}`;
const descendantBlockHash = `sha256:${"f".repeat(64)}`;

const publisherSection = Object.freeze({
  blocks: Object.freeze([
    Object.freeze({
      contentHash: blockHash,
      id: "target-block",
      text: "Exact target text",
    }),
  ]),
  contentHash: sectionHash,
  continuity: Object.freeze({ id: "section-continuity" }),
  id: "current-section",
  readerAddress: Object.freeze({
    path: "/manuscripts/1/current-section/",
  }),
});

const publisherDescendantSection = Object.freeze({
  blocks: Object.freeze([
    Object.freeze({
      contentHash: descendantBlockHash,
      id: "descendant-block",
      text: "Exact descendant text",
    }),
  ]),
  contentHash: descendantSectionHash,
  continuity: Object.freeze({ id: "descendant-continuity" }),
  id: "descendant-section",
  parentId: "current-section",
  readerAddress: Object.freeze({
    path: "/manuscripts/1/current-section/",
  }),
});

const publisherWork = Object.freeze({
  id: "work",
  route: "/manuscripts/1/",
  sections: Object.freeze([
    publisherSection,
    publisherDescendantSection,
  ]),
});

const publication = Object.freeze({ id: "publication" });

const sectionPage = Object.freeze({
  kind: "section",
  page: "unused",
  path: "/manuscripts/1/current-section/",
  publication,
  section: publisherSection,
  sections: Object.freeze([
    publisherSection,
    publisherDescendantSection,
  ]),
  work: publisherWork,
}) as unknown as PublisherNextPage;

const workPage = Object.freeze({
  kind: "work",
  path: "/manuscripts/1/",
  publication,
  work: publisherWork,
}) as unknown as PublisherNextPage;

const artifact = Object.freeze({
  buildId: migrationBuildId,
  href: "/publisher/coherence-reader-state-migration.json",
  legacyBookmarksStorageKeys: Object.freeze([
    "coherence-reader-bookmarks-v2",
    "coherence-reader-bookmarks-v1",
  ]),
  legacyProgressStorageKeys: Object.freeze([
    "coherence-reader-progress-v2",
    "coherence-reader-progress-v1",
  ]),
  publicationId: "publication",
  readerBuildId,
  schemaVersion: "1.0",
  sections: Object.freeze([
    Object.freeze({
      acceptedLegacyContinuityIds: Object.freeze(["section-continuity"]),
      acceptedLegacySectionIds: Object.freeze([
        "current-section",
        "old-section",
      ]),
      contentHash: sectionHash,
      href: "/manuscripts/1/current-section/",
      legacyContentHash: "0123456789abcdef",
      paragraphs: Object.freeze([
        Object.freeze({
          blockContentHash: blockHash,
          blockId: "target-block",
          blockTextCodeUnits: "Exact target text".length,
          legacyContentHash: "fedcba9876543210",
          legacyParagraphId: "p-hfedcba9876543210",
          legacyTextCodeUnits: "Exact target text".length,
          offsetSegments: Object.freeze([
            Object.freeze({
              legacyStart: 0,
              length: "Exact target text".length,
              targetStart: 0,
            }),
          ]),
        }),
      ]),
      sectionContinuityId: "section-continuity",
      sectionId: "current-section",
      workId: "work",
    }),
    Object.freeze({
      acceptedLegacyContinuityIds: Object.freeze([
        "descendant-continuity",
      ]),
      acceptedLegacySectionIds: Object.freeze([
        "descendant-section",
        "old-descendant",
      ]),
      contentHash: descendantSectionHash,
      href: "/manuscripts/1/current-section/",
      legacyContentHash: "1111111111111111",
      paragraphs: Object.freeze([
        Object.freeze({
          blockContentHash: descendantBlockHash,
          blockId: "descendant-block",
          blockTextCodeUnits: "Exact descendant text".length,
          legacyContentHash: "2222222222222222",
          legacyParagraphId: "p-h2222222222222222",
          legacyTextCodeUnits: "Exact descendant text".length,
          offsetSegments: Object.freeze([
            Object.freeze({
              legacyStart: 0,
              length: "Exact descendant text".length,
              targetStart: 0,
            }),
          ]),
        }),
      ]),
      sectionContinuityId: "descendant-continuity",
      sectionId: "descendant-section",
      workId: "work",
    }),
  ]),
}) as unknown as CoherenceReaderStateMigrationArtifact;

function publisherFragmentSection(
  sectionId: string,
  blockId: string,
  legacyParagraphId: string,
) {
  return Object.freeze({
    href: `/manuscripts/1/${sectionId}/`,
    legacySectionIds: Object.freeze([sectionId]),
    paragraphs: Object.freeze([
      Object.freeze({ blockId, legacyParagraphId }),
    ]),
    sectionId,
  });
}

describe("Coherence Publisher legacy fragment continuity", () => {
  it("preserves the exact rendered multi-section order and descendant identities", () => {
    const model = createCoherencePublisherLegacyFragmentModel(
      sectionPage,
      artifact,
    );

    expect(model).toEqual({
      sections: [
        {
          href: "/manuscripts/1/current-section/",
          legacySectionIds: ["current-section", "old-section"],
          paragraphs: [
            {
              blockId: "target-block",
              legacyParagraphId: "p-hfedcba9876543210",
            },
          ],
          sectionId: "current-section",
        },
        {
          href: "/manuscripts/1/current-section/",
          legacySectionIds: ["descendant-section", "old-descendant"],
          paragraphs: [
            {
              blockId: "descendant-block",
              legacyParagraphId: "p-h2222222222222222",
            },
          ],
          sectionId: "descendant-section",
        },
      ],
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model?.sections)).toBe(true);
    expect(Object.isFrozen(model?.sections[0])).toBe(true);
    expect(Object.isFrozen(model?.sections[0]?.legacySectionIds)).toBe(true);
    expect(Object.isFrozen(model?.sections[0]?.paragraphs)).toBe(true);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);

    expect(
      resolveCoherencePublisherLegacyFragment("old-section", model!),
    ).toEqual({
      href: "/manuscripts/1/current-section/",
      sectionId: "current-section",
    });
    for (const fragment of [
      "current-section-p-hfedcba9876543210",
      "old-section-p-hfedcba9876543210",
    ]) {
      expect(
        resolveCoherencePublisherLegacyFragment(fragment, model!),
      ).toEqual({
        blockId: "target-block",
        href: "/manuscripts/1/current-section/",
        sectionId: "current-section",
      });
    }
    expect(
      resolveCoherencePublisherLegacyFragment("old-descendant", model),
    ).toEqual({
      href: "/manuscripts/1/current-section/",
      sectionId: "descendant-section",
    });
    expect(
      resolveCoherencePublisherLegacyFragment(
        "old-descendant-p-h2222222222222222",
        model,
      ),
    ).toEqual({
      blockId: "descendant-block",
      href: "/manuscripts/1/current-section/",
      sectionId: "descendant-section",
    });
    expect(
      resolveCoherencePublisherLegacyFragment(
        "p-hfedcba9876543210",
        model,
      ),
    ).toEqual({
      blockId: "target-block",
      href: "/manuscripts/1/current-section/",
      sectionId: "current-section",
    });
    for (const fragment of [
      "old-section-p-1",
      "old-section-p-h0000000000000000",
      "old-section-p-hfedcba9876543210-extra",
      "unknown-section",
    ]) {
      expect(
        resolveCoherencePublisherLegacyFragment(fragment, model!),
      ).toBeNull();
    }
  });

  it("builds the work-route model from the same exact Reader section", () => {
    const model = createCoherencePublisherLegacyFragmentModel(
      workPage,
      artifact,
    );

    expect(model.sections).toHaveLength(2);
    expect(
      resolveCoherencePublisherLegacyFragment(
        "old-section-p-hfedcba9876543210",
        model!,
      ),
    ).toEqual({
      blockId: "target-block",
      href: "/manuscripts/1/current-section/",
      sectionId: "current-section",
    });
  });

  it("keeps a nested canonical section route mapped to its aggregate Reader address", () => {
    const nestedSectionPage = Object.freeze({
      ...sectionPage,
      path: "/manuscripts/1/current-section/descendant/",
      section: publisherDescendantSection,
      sections: Object.freeze([publisherDescendantSection]),
    }) as unknown as PublisherNextPage;
    const model = createCoherencePublisherLegacyFragmentModel(
      nestedSectionPage,
      artifact,
    );

    expect(model.sections).toEqual([
      {
        href: "/manuscripts/1/current-section/",
        legacySectionIds: ["descendant-section", "old-descendant"],
        paragraphs: [
          {
            blockId: "descendant-block",
            legacyParagraphId: "p-h2222222222222222",
          },
        ],
        sectionId: "descendant-section",
      },
    ]);
    expect(
      resolveCoherencePublisherLegacyFragment(
        "p-h2222222222222222",
        model,
      ),
    ).toEqual({
      blockId: "descendant-block",
      href: "/manuscripts/1/current-section/",
      sectionId: "descendant-section",
    });
  });

  it("returns one explicit empty model for an unsupported aggregate page", () => {
    const sectionIndexPage = Object.freeze({
      kind: "section-index",
      path: "/manuscripts/1/contents/",
      publication,
    }) as unknown as PublisherNextPage;
    const model = createCoherencePublisherLegacyFragmentModel(
      sectionIndexPage,
      artifact,
    );

    expect(model).toEqual({ sections: [] });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.sections)).toBe(true);
  });

  it("fails closed on artifact drift and ambiguous exact identities", () => {
    const wrongPublication = {
      ...artifact,
      publicationId: "other-publication",
    } as CoherenceReaderStateMigrationArtifact;
    expect(
      createCoherencePublisherLegacyFragmentModel(
        sectionPage,
        wrongPublication,
      ),
    ).toEqual({ sections: [] });

    const driftedBlock = {
      ...artifact,
      sections: [
        {
          ...artifact.sections[0]!,
          paragraphs: [
            {
              ...artifact.sections[0]!.paragraphs[0]!,
              blockContentHash: `sha256:${"e".repeat(64)}`,
            },
          ],
        },
        artifact.sections[1]!,
      ],
    } as CoherenceReaderStateMigrationArtifact;
    const driftedModel = createCoherencePublisherLegacyFragmentModel(
      sectionPage,
      driftedBlock,
    );
    expect(driftedModel?.sections[0]?.paragraphs).toEqual([]);
    expect(
      resolveCoherencePublisherLegacyFragment(
        "old-section-p-hfedcba9876543210",
        driftedModel!,
      ),
    ).toBeNull();

    const driftedDescendant = {
      ...artifact,
      sections: [
        artifact.sections[0]!,
        {
          ...artifact.sections[1]!,
          contentHash: `sha256:${"0".repeat(64)}`,
        },
      ],
    } as CoherenceReaderStateMigrationArtifact;
    expect(
      createCoherencePublisherLegacyFragmentModel(
        sectionPage,
        driftedDescendant,
      ),
    ).toEqual({ sections: [] });

    const reorderedPage = {
      ...sectionPage,
      sections: [publisherDescendantSection, publisherSection],
    } as unknown as PublisherNextPage;
    expect(
      createCoherencePublisherLegacyFragmentModel(reorderedPage, artifact),
    ).toEqual({ sections: [] });

    const ambiguous = Object.freeze({
      sections: Object.freeze([
        Object.freeze({
          href: "/manuscripts/1/first/",
          legacySectionIds: Object.freeze(["shared"]),
          paragraphs: Object.freeze([]),
          sectionId: "first",
        }),
        Object.freeze({
          href: "/manuscripts/1/second/",
          legacySectionIds: Object.freeze(["shared"]),
          paragraphs: Object.freeze([]),
          sectionId: "second",
        }),
      ]),
    }) satisfies CoherencePublisherLegacyFragmentModel;
    expect(
      resolveCoherencePublisherLegacyFragment("shared", ambiguous),
    ).toBeNull();

    const ambiguousBareParagraph = Object.freeze({
      sections: Object.freeze([
        publisherFragmentSection(
          "first",
          "first-block",
          "p-h1234567890abcdef",
        ),
        publisherFragmentSection(
          "second",
          "second-block",
          "p-h1234567890abcdef",
        ),
      ]),
    }) satisfies CoherencePublisherLegacyFragmentModel;
    expect(
      resolveCoherencePublisherLegacyFragment(
        "p-h1234567890abcdef",
        ambiguousBareParagraph,
      ),
    ).toBeNull();
  });
});
