import fs from "node:fs";
import path from "node:path";
import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";
import type {
  PublicationReaderEnvelope,
  ReaderSection,
  ReaderWork,
} from "@genii-foundation/publisher-schema/reader";
import { describe, expect, it } from "vitest";

import {
  createCoherencePublisherLegacyFragmentModel,
  isCoherencePublisherLegacyFragmentModel,
  MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_MODEL_BYTES,
  MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_ALIASES,
  MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_PARAGRAPHS,
  MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_SECTIONS,
  MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_SECTION_IDENTITIES,
  resolveCoherencePublisherLegacyFragment,
  type CoherencePublisherLegacyFragmentModel,
} from "./legacy-fragment-continuity";
import {
  parseCoherenceReaderStateMigrationArtifact,
  type CoherenceReaderStateMigrationArtifact,
  type CoherenceReaderStateMigrationSection,
} from "./reader-state-migration-schema";

const sectionHash: ReaderSection["contentHash"] =
  `sha256:${"a".repeat(64)}`;
const descendantSectionHash: ReaderSection["contentHash"] =
  `sha256:${"b".repeat(64)}`;
const blockHash: ReaderSection["blocks"][number]["contentHash"] =
  `sha256:${"c".repeat(64)}`;
const descendantBlockHash: ReaderSection["blocks"][number]["contentHash"] =
  `sha256:${"d".repeat(64)}`;
const readerBuildId = `sha256:${"e".repeat(64)}`;
const migrationBuildId = `sha256:${"f".repeat(64)}`;
const publication = Object.freeze({ id: "publication" });

function block(input: Readonly<{
  anchor: string;
  contentHash?: ReaderSection["blocks"][number]["contentHash"];
  id: string;
  path?: string;
  text?: string;
}>): ReaderSection["blocks"][number] {
  const text = input.text ?? `Text for ${input.id}`;
  return Object.freeze({
    contentHash: input.contentHash ?? blockHash,
    domId: input.anchor,
    id: input.id,
    kind: "paragraph",
    markdown: text,
    readerAddress: Object.freeze({
      anchor: input.anchor,
      path: input.path ?? "/manuscripts/1/current-section/",
    }),
    text,
    wordCount: 3,
  });
}

function section(input: Readonly<{
  anchor?: string;
  blocks?: readonly ReturnType<typeof block>[];
  contentHash?: ReaderSection["contentHash"];
  historicalSectionIds?: readonly string[];
  id: string;
  order?: number;
  parentId?: string | null;
  path?: string;
}>): ReaderSection {
  const routePath = input.path ?? "/manuscripts/1/current-section/";
  const continuityId = `${input.id}-continuity`;
  return Object.freeze({
    activeRouteNames: Object.freeze(["canonical"]),
    blocks: Object.freeze([...(input.blocks ?? [block({
      anchor: `b-${input.id}`,
      id: `${input.id}-block`,
      path: routePath,
    })])]),
    childIds: Object.freeze([]),
    contentHash: input.contentHash ?? sectionHash,
    continuity: Object.freeze({
      historicalSectionIds: Object.freeze([
        ...(input.historicalSectionIds ?? []),
      ]),
      id: continuityId,
      legacyIds: Object.freeze([]),
      progressGroups: Object.freeze([Object.freeze([continuityId])]),
    }),
    depth: input.parentId === undefined || input.parentId === null ? 0 : 1,
    domId: input.anchor ?? null,
    id: input.id,
    navigable: true,
    nextId: null,
    order: input.order ?? 0,
    parentId: input.parentId ?? null,
    previousId: null,
    readerAddress: Object.freeze({
      ...(input.anchor === undefined ? {} : { anchor: input.anchor }),
      path: routePath,
    }),
    readingMinutes: 1,
    role: "section",
    routes: Object.freeze({
      canonical: Object.freeze({ path: routePath }),
    }),
    title: input.id,
    wordCount: 3,
  });
}

function migrationSection(
  item: ReaderSection,
  input: Readonly<{
    acceptedLegacySectionIds?: readonly string[];
    paragraphs?: readonly CoherenceReaderStateMigrationSection["paragraphs"][number][];
    workId?: string;
  }> = {},
): CoherenceReaderStateMigrationSection {
  const paragraphs = input.paragraphs ?? item.blocks.map((itemBlock, index) => {
    const legacyContentHash = index.toString(16).padStart(16, "0");
    return Object.freeze({
      blockContentHash: itemBlock.contentHash,
      blockId: itemBlock.id,
      blockTextCodeUnits: itemBlock.text.length,
      legacyContentHash,
      legacyParagraphId: `p-h${legacyContentHash}`,
      legacyTextCodeUnits: itemBlock.text.length,
      offsetSegments: Object.freeze([
        Object.freeze({
          legacyStart: 0,
          length: itemBlock.text.length,
          targetStart: 0,
        }),
      ]),
    });
  });
  return Object.freeze({
    acceptedLegacyContinuityIds: Object.freeze([
      item.continuity.id,
    ]),
    acceptedLegacySectionIds: Object.freeze([
      ...(input.acceptedLegacySectionIds ?? [
        item.id,
        ...item.continuity.historicalSectionIds,
      ].sort()),
    ]),
    contentHash: item.contentHash,
    href: item.readerAddress!.path,
    legacyContentHash: "0123456789abcdef",
    paragraphs: Object.freeze([...paragraphs]),
    sectionContinuityId: item.continuity.id,
    sectionId: item.id,
    workId: input.workId ?? "work",
  });
}

function artifact(
  sections: readonly CoherenceReaderStateMigrationSection[],
): CoherenceReaderStateMigrationArtifact {
  return Object.freeze({
    buildId: migrationBuildId,
    href: "/publisher/coherence-reader-state-migration.json",
    legacyBookmarksStorageKeys: Object.freeze([
      "coherence-reader-bookmarks-v2",
      "coherence-reader-bookmarks-v1",
    ] as const),
    legacyProgressStorageKeys: Object.freeze([
      "coherence-reader-progress-v2",
      "coherence-reader-progress-v1",
    ] as const),
    publicationId: "publication",
    readerBuildId,
    schemaVersion: "1.0",
    sections: Object.freeze([...sections]),
  });
}

function work(sections: readonly ReaderSection[]): ReaderWork {
  return Object.freeze({
    contentHash: sectionHash,
    id: "work",
    language: "en",
    publicationState: "published",
    readingMinutes: 1,
    rootSectionIds: Object.freeze([sections[0]?.id ?? "missing"]),
    route: "/manuscripts/1/",
    sections: Object.freeze([...sections]),
    title: "Work",
    wordCount: 3,
  });
}

function page(
  sections: readonly ReaderSection[],
  input: Readonly<{ path?: string; workSections?: readonly ReaderSection[] }> = {},
): PublisherNextPage {
  const pageWork = work(input.workSections ?? sections);
  return Object.freeze({
    assets: Object.freeze([]),
    kind: "section",
    links: Object.freeze([]),
    next: null,
    path: input.path ?? "/manuscripts/1/current-section/",
    previous: null,
    publication,
    section: sections[0]!,
    sections: Object.freeze([...sections]),
    work: pageWork,
  }) as unknown as PublisherNextPage;
}

function aliasCount(model: CoherencePublisherLegacyFragmentModel): number {
  return model.sections.reduce(
    (total, item) =>
      total + item.aliases.length + item.bareParagraphAliases.length,
    0,
  );
}

describe("Coherence Publisher legacy fragment continuity", () => {
  it("projects exact public section and block destinations", () => {
    const current = section({
      historicalSectionIds: ["old-section"],
      id: "current-section",
    });
    const model = createCoherencePublisherLegacyFragmentModel(
      page([current]),
      artifact([migrationSection(current)]),
    );

    expect(model).toEqual({
      sections: [
        {
          aliases: [
            {
              fragment: "current-section",
              href: "/manuscripts/1/current-section/",
            },
            {
              fragment: "current-section-p-h0000000000000000",
              href: "/manuscripts/1/current-section/#b-current-section",
            },
            {
              fragment: "old-section",
              href: "/manuscripts/1/current-section/",
            },
            {
              fragment: "old-section-p-h0000000000000000",
              href: "/manuscripts/1/current-section/#b-current-section",
            },
          ],
          bareParagraphAliases: [
            {
              fragment: "p-h0000000000000000",
              href: "/manuscripts/1/current-section/#b-current-section",
            },
          ],
          sectionId: "current-section",
        },
      ],
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.sections)).toBe(true);
    expect(isCoherencePublisherLegacyFragmentModel(model)).toBe(true);
    expect(
      resolveCoherencePublisherLegacyFragment("old-section", model),
    ).toEqual({ href: "/manuscripts/1/current-section/" });
    expect(
      resolveCoherencePublisherLegacyFragment(
        "old-section-p-h0000000000000000",
        model,
      ),
    ).toEqual({
      href: "/manuscripts/1/current-section/#b-current-section",
    });
    expect(
      resolveCoherencePublisherLegacyFragment(
        "p-h0000000000000000",
        model,
      ),
    ).toEqual({
      href: "/manuscripts/1/current-section/#b-current-section",
    });
  });

  it("keeps qualified aliases and refuses bare paragraphs on aggregate routes", () => {
    const owner = section({
      historicalSectionIds: ["old-owner"],
      id: "owner",
      order: 0,
    });
    const descendant = section({
      anchor: "descendant",
      blocks: [block({
        anchor: "descendant-b-descendant",
        contentHash: descendantBlockHash,
        id: "descendant-block",
      })],
      contentHash: descendantSectionHash,
      historicalSectionIds: ["old-descendant"],
      id: "descendant",
      order: 1,
      parentId: "owner",
    });
    const model = createCoherencePublisherLegacyFragmentModel(
      page([owner, descendant]),
      artifact([
        migrationSection(owner),
        migrationSection(descendant),
      ]),
    );

    expect(model.sections).toHaveLength(2);
    expect(model.sections.every(
      ({ bareParagraphAliases }) => bareParagraphAliases.length === 0,
    )).toBe(true);
    expect(
      resolveCoherencePublisherLegacyFragment(
        "old-descendant-p-h0000000000000000",
        model,
      ),
    ).toEqual({
      href:
        "/manuscripts/1/current-section/#descendant-b-descendant",
    });
    expect(
      resolveCoherencePublisherLegacyFragment(
        "p-h0000000000000000",
        model,
      ),
    ).toBeNull();
  });

  it("maps a nested canonical route to its exact aggregate address", () => {
    const nested = section({
      anchor: "nested",
      id: "nested",
    });
    const model = createCoherencePublisherLegacyFragmentModel(
      page([nested], {
        path: "/manuscripts/1/current-section/nested/",
      }),
      artifact([migrationSection(nested)]),
    );

    expect(
      resolveCoherencePublisherLegacyFragment("nested", model),
    ).toEqual({
      href: "/manuscripts/1/current-section/#nested",
    });
  });

  it("preserves grouped legacy paragraphs that share one Publisher block", () => {
    const grouped = section({ id: "grouped" });
    const firstParagraph = migrationSection(grouped).paragraphs[0]!;
    const groupedMigration = migrationSection(grouped, {
      paragraphs: [
        firstParagraph,
        {
          ...firstParagraph,
          legacyContentHash: "1111111111111111",
          legacyParagraphId: "p-h1111111111111111",
        },
      ],
    });
    const model = createCoherencePublisherLegacyFragmentModel(
      page([grouped]),
      artifact([groupedMigration]),
    );

    expect(
      resolveCoherencePublisherLegacyFragment(
        "grouped-p-h1111111111111111",
        model,
      ),
    ).toEqual({
      href: "/manuscripts/1/current-section/#b-grouped",
    });
  });

  it.each(["work", "home", "section-index"])(
    "keeps a %s page inert",
    (kind) => {
      const current = section({ id: "current" });
      const inert = Object.freeze({
        kind,
        path: "/manuscripts/1/",
        publication,
        work: work([current]),
      }) as unknown as PublisherNextPage;
      expect(
        createCoherencePublisherLegacyFragmentModel(
          inert,
          artifact([migrationSection(current)]),
        ),
      ).toEqual({ sections: [] });
    },
  );

  it("fails the whole route closed on identity, address, block, and order drift", () => {
    const first = section({ id: "first", order: 0 });
    const second = section({
      anchor: "second",
      id: "second",
      order: 1,
      parentId: "first",
    });
    const exactArtifact = artifact([
      migrationSection(first),
      migrationSection(second),
    ]);
    const cases: PublisherNextPage[] = [
      page([second, first], { workSections: [first, second] }),
      page([{ ...first, contentHash: descendantSectionHash } as ReaderSection]),
      page([{
        ...first,
        readerAddress: { path: "/manuscripts/1/other/" },
      } as ReaderSection]),
      page([{
        ...first,
        blocks: [first.blocks[0]!, first.blocks[0]!],
      } as ReaderSection]),
    ];
    for (const driftedPage of cases) {
      expect(
        createCoherencePublisherLegacyFragmentModel(
          driftedPage,
          exactArtifact,
        ),
      ).toEqual({ sections: [] });
    }

    const migrationCases = [
      { ...migrationSection(first), workId: "wrong-work" },
      { ...migrationSection(first), sectionId: "wrong-section" },
      {
        ...migrationSection(first),
        sectionContinuityId: "wrong-continuity",
      },
      { ...migrationSection(first), contentHash: descendantSectionHash },
      { ...migrationSection(first), href: "/manuscripts/1/%63urrent-section/" },
      {
        ...migrationSection(first),
        acceptedLegacySectionIds: ["first", "unowned"],
      },
      {
        ...migrationSection(first),
        paragraphs: [{
          ...migrationSection(first).paragraphs[0]!,
          blockContentHash: descendantBlockHash,
        }],
      },
      {
        ...migrationSection(first),
        paragraphs: [{
          ...migrationSection(first).paragraphs[0]!,
          blockTextCodeUnits: 99,
        }],
      },
    ] as CoherenceReaderStateMigrationSection[];
    for (const migration of migrationCases) {
      expect(
        createCoherencePublisherLegacyFragmentModel(
          page([first]),
          artifact([migration]),
        ),
      ).toEqual({ sections: [] });
    }

    const ordered = section({
      blocks: [
        block({ anchor: "first-block", id: "first-block" }),
        block({ anchor: "second-block", id: "second-block" }),
      ],
      id: "ordered",
    });
    const orderedMigration = migrationSection(ordered);
    expect(
      createCoherencePublisherLegacyFragmentModel(
        page([ordered]),
        artifact([{
          ...orderedMigration,
          paragraphs: [...orderedMigration.paragraphs].reverse(),
        }]),
      ),
    ).toEqual({ sections: [] });
  });

  it("fails closed on conflicting aliases and every explicit limit", () => {
    const sharedFirst = section({
      anchor: "first",
      historicalSectionIds: ["shared"],
      id: "first",
      order: 0,
    });
    const sharedSecond = section({
      anchor: "second",
      historicalSectionIds: ["shared"],
      id: "second",
      order: 1,
      parentId: "first",
    });
    expect(
      createCoherencePublisherLegacyFragmentModel(
        page([sharedFirst, sharedSecond]),
        artifact([
          migrationSection(sharedFirst),
          migrationSection(sharedSecond),
        ]),
      ),
    ).toEqual({ sections: [] });

    const tooManySections = Array.from(
      {
        length: MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_SECTIONS + 1,
      },
      (_, index) => section({
        anchor: `section-${index}`,
        id: `section-${index}`,
        order: index,
        parentId: index === 0 ? null : "section-0",
      }),
    );
    expect(
      createCoherencePublisherLegacyFragmentModel(
        page(tooManySections),
        artifact(tooManySections.map((item) => migrationSection(item))),
      ),
    ).toEqual({ sections: [] });

    const paragraphHeavyBlocks = Array.from(
      {
        length: MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_PARAGRAPHS + 1,
      },
      (_, index) => block({
        anchor: `b-${index}`,
        id: `block-${index}`,
      }),
    );
    const paragraphHeavy = section({
      blocks: paragraphHeavyBlocks,
      id: "paragraph-heavy",
    });
    expect(
      createCoherencePublisherLegacyFragmentModel(
        page([paragraphHeavy]),
        artifact([migrationSection(paragraphHeavy)]),
      ),
    ).toEqual({ sections: [] });

    const identityHeavy = section({
      historicalSectionIds: Array.from(
        {
          length:
            MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_SECTION_IDENTITIES,
        },
        (_, index) => `old-${index}`,
      ),
      id: "identity-heavy",
    });
    expect(
      createCoherencePublisherLegacyFragmentModel(
        page([identityHeavy]),
        artifact([migrationSection(identityHeavy)]),
      ),
    ).toEqual({ sections: [] });

    const aliasHeavyBlocks = Array.from({ length: 51 }, (_, index) =>
      block({ anchor: `alias-${index}`, id: `alias-block-${index}` })
    );
    const aliasHeavy = section({
      blocks: aliasHeavyBlocks,
      historicalSectionIds: ["a", "b", "c", "d"],
      id: "alias-heavy",
    });
    const aliasHeavyModel = createCoherencePublisherLegacyFragmentModel(
      page([aliasHeavy]),
      artifact([migrationSection(aliasHeavy)]),
    );
    expect(
      5 + 5 * 51 + 51,
    ).toBeGreaterThan(MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_ROUTE_ALIASES);
    expect(aliasHeavyModel).toEqual({ sections: [] });

    const longPath = `/manuscripts/1/${"x".repeat(1_500)}/`;
    const byteHeavyBlocks = Array.from({ length: 64 }, (_, index) =>
      block({
        anchor: `b-${index}-${"y".repeat(300)}`,
        id: `byte-block-${index}`,
        path: longPath,
      })
    );
    const byteHeavy = section({
      blocks: byteHeavyBlocks,
      id: "byte-heavy",
      path: longPath,
    });
    expect(
      createCoherencePublisherLegacyFragmentModel(
        page([byteHeavy], { path: longPath }),
        artifact([migrationSection(byteHeavy)]),
      ),
    ).toEqual({ sections: [] });
  });

  it("rejects malformed client models without resolving a repaired target", () => {
    const valid = Object.freeze({
      sections: Object.freeze([
        Object.freeze({
          aliases: Object.freeze([
            Object.freeze({ fragment: "old", href: "/target/#exact" }),
          ]),
          bareParagraphAliases: Object.freeze([]),
          sectionId: "section",
        }),
      ]),
    });
    expect(isCoherencePublisherLegacyFragmentModel(valid)).toBe(true);
    expect(isCoherencePublisherLegacyFragmentModel({ sections: [] })).toBe(false);
    expect(isCoherencePublisherLegacyFragmentModel({
      sections: [{
        aliases: [],
        bareParagraphAliases: [],
        sectionId: "section",
      }],
    })).toBe(false);
    const identicalDuplicate = {
      sections: [{
        aliases: [
          { fragment: "same", href: "/target/" },
          { fragment: "same", href: "/target/" },
        ],
        bareParagraphAliases: [],
        sectionId: "section",
      }],
    };
    expect(
      isCoherencePublisherLegacyFragmentModel(identicalDuplicate),
    ).toBe(true);
    expect(
      resolveCoherencePublisherLegacyFragment("same", identicalDuplicate),
    ).toEqual({ href: "/target/" });
    expect(isCoherencePublisherLegacyFragmentModel({
      sections: [{
        aliases: [
          { fragment: "same", href: "/first/" },
          { fragment: "same", href: "/second/" },
        ],
        bareParagraphAliases: [],
        sectionId: "section",
      }],
    })).toBe(false);
    expect(isCoherencePublisherLegacyFragmentModel({
      sections: [{
        aliases: [{ fragment: "old", href: "https://example.test/" }],
        bareParagraphAliases: [],
        sectionId: "section",
      }],
    })).toBe(false);
    expect(
      resolveCoherencePublisherLegacyFragment("%6fld", valid),
    ).toBeNull();
  });
});

function currentCorpus() {
  const reader = JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "generated",
        "publisher",
        "host",
        "publication-reader.json",
      ),
      "utf8",
    ),
  ) as PublicationReaderEnvelope;
  const migration = parseCoherenceReaderStateMigrationArtifact(
    JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "public",
          "publisher",
          "coherence-reader-state-migration.json",
        ),
        "utf8",
      ),
    ),
  );
  if (migration === null) {
    throw new TypeError("The current migration artifact is invalid.");
  }
  return Object.freeze({ reader, migration });
}

function routeSections(
  work: ReaderWork,
  owner: ReaderSection,
  routePath: string,
): readonly ReaderSection[] {
  const byId = new Map(work.sections.map((item) => [item.id, item]));
  const descendsFromOwner = (candidate: ReaderSection): boolean => {
    const seen = new Set<string>();
    let parentId = candidate.parentId;
    while (parentId !== null && !seen.has(parentId)) {
      if (parentId === owner.id) return true;
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return false;
  };
  return work.sections.filter(
    (candidate) =>
      candidate.id === owner.id ||
      (candidate.readerAddress?.path === routePath &&
        descendsFromOwner(candidate)),
  );
}

describe("current Coherence Publisher fragment route census", () => {
  it("admits the exact section-only alias surface", () => {
    const { reader, migration } = currentCorpus();
    const workById = new Map(reader.works.map((item) => [item.id, item]));
    let sectionRoutes = 0;
    let singleSectionRoutes = 0;
    let multiSectionRoutes = 0;
    let sectionInstances = 0;
    let paragraphInstances = 0;
    let sectionAliases = 0;
    let qualifiedParagraphAliases = 0;
    let bareParagraphAliases = 0;
    let maximumAliases = 0;
    let workRoutes = 0;

    for (const route of reader.routes.active) {
      if (route.target.kind === "work") {
        workRoutes += 1;
        const routeWork = workById.get(route.target.workId)!;
        const workPage = Object.freeze({
          assets: Object.freeze([]),
          kind: "work",
          links: Object.freeze([]),
          path: route.path,
          publication: reader.publication,
          work: routeWork,
        }) as unknown as PublisherNextPage;
        expect(
          createCoherencePublisherLegacyFragmentModel(workPage, migration),
        ).toEqual({ sections: [] });
        continue;
      }
      if (route.target.kind !== "section") continue;
      const target = route.target;
      const routeWork = workById.get(target.workId)!;
      const owner = routeWork.sections.find(
        ({ id }) => id === target.sectionId,
      )!;
      const sections = routeSections(routeWork, owner, route.path);
      const routePage = Object.freeze({
        assets: Object.freeze([]),
        kind: "section",
        links: Object.freeze([]),
        next: null,
        path: route.path,
        previous: null,
        publication: reader.publication,
        section: owner,
        sections,
        work: routeWork,
      }) as unknown as PublisherNextPage;
      const model = createCoherencePublisherLegacyFragmentModel(
        routePage,
        migration,
      );
      expect(model.sections).toHaveLength(sections.length);
      expect(isCoherencePublisherLegacyFragmentModel(model)).toBe(true);
      expect(
        new TextEncoder().encode(JSON.stringify(model)).byteLength,
      ).toBeLessThanOrEqual(
        MAXIMUM_COHERENCE_PUBLISHER_FRAGMENT_MODEL_BYTES,
      );

      sectionRoutes += 1;
      sectionInstances += sections.length;
      if (sections.length === 1) singleSectionRoutes += 1;
      else multiSectionRoutes += 1;
      const migrationById = new Map(
        migration.sections.map((item) => [item.sectionId, item]),
      );
      for (const item of sections) {
        const authority = migrationById.get(item.id)!;
        const identityCount = authority.acceptedLegacySectionIds.length;
        const paragraphCount = authority.paragraphs.length;
        paragraphInstances += paragraphCount;
        sectionAliases += identityCount;
        qualifiedParagraphAliases += identityCount * paragraphCount;
        if (sections.length === 1) bareParagraphAliases += paragraphCount;
      }
      maximumAliases = Math.max(maximumAliases, aliasCount(model));
    }

    expect(workRoutes).toBe(9);
    expect(sectionRoutes).toBe(573);
    expect(singleSectionRoutes).toBe(527);
    expect(multiSectionRoutes).toBe(46);
    expect(sectionInstances).toBe(680);
    expect(paragraphInstances).toBe(3_139);
    expect(sectionAliases).toBe(1_224);
    expect(qualifiedParagraphAliases).toBe(5_812);
    expect(bareParagraphAliases).toBe(2_608);
    expect(
      sectionAliases + qualifiedParagraphAliases + bareParagraphAliases,
    ).toBe(9_644);
    expect(maximumAliases).toBe(187);
  });
});
